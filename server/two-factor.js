// Connector: the second-factor store. Keeps each user's secret, pending
// secret, last accepted step and token version, and the hashed backup codes.
// Every rule (window, replay, code shapes, URI) is logic/totp.js and
// logic/backup-codes.js; the HMAC and random values are server/totp-crypto.js.
//
// The secret is stored as it is: a TOTP secret is shared with the phone by
// design, so a hash would make codes impossible to check. Backup codes are
// stored as HMAC-SHA256 under a pepper derived from the JWT secret.
// better-sqlite3 is synchronous, so each read-check-write below runs without
// another request in between.

import { candidateSteps, timeStep, verifyTotp, otpauthUri, TOTP_ISSUER } from '../logic/totp.js';
import { normaliseBackupCode } from '../logic/backup-codes.js';
import { codesForSteps, generateSecret, generateBackupCodes, hashBackupCode } from './totp-crypto.js';

// Removes the user's factor, pending secret and backup codes, and raises the
// token version so every session ends. The owner reset route and
// tools/reset-two-factor.js both use this.
export function clearTwoFactor(db, userId) {
  db.transaction(() => {
    db.prepare(`UPDATE users SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled_at = NULL,
      totp_last_step = NULL, token_version = token_version + 1 WHERE id = ?`).run(userId);
    db.prepare('DELETE FROM backup_codes WHERE user_id = ?').run(userId);
  })();
}

// backupCodePepper: from server/totp-crypto.js backupCodePepper(jwtSecret).
export function makeTwoFactor(db, { backupCodePepper } = {}) {
  if (!backupCodePepper) throw new Error('makeTwoFactor: backupCodePepper is required');
  const factor = db.prepare(`SELECT token_version, totp_secret, totp_pending_secret, totp_enabled_at, totp_last_step
    FROM users WHERE id = ?`);
  const setPending = db.prepare('UPDATE users SET totp_pending_secret = ? WHERE id = ?');
  const setLastStep = db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?');
  const promotePending = db.prepare(`UPDATE users SET totp_secret = totp_pending_secret, totp_pending_secret = NULL,
    totp_enabled_at = ?, totp_last_step = ?, token_version = token_version + 1 WHERE id = ?`);
  const bumpVersion = db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?');
  const deleteCodes = db.prepare('DELETE FROM backup_codes WHERE user_id = ?');
  const insertCode = db.prepare('INSERT INTO backup_codes (user_id, code_hash) VALUES (?, ?)');
  const spendCode = db.prepare('UPDATE backup_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL');

  const hash = (code) => hashBackupCode(code, backupCodePepper);

  // now: a Date. Returns logic/totp.js verifyTotp's answer.
  const check = (secret, code, lastStep, now) =>
    verifyTotp({ code, candidates: codesForSteps(secret, candidateSteps(timeStep(now.getTime()))), lastStep });

  // Returns the new plain codes; only their hashes are stored.
  const replaceCodes = (userId) => {
    const codes = generateBackupCodes();
    deleteCodes.run(userId);
    for (const code of codes) insertCode.run(userId, hash(code));
    return codes;
  };

  // Checks a code of the enabled factor and spends its step. Returns true when accepted.
  const useTotp = (userId, code, now) => {
    const row = factor.get(userId);
    if (!row?.totp_secret || !row.totp_enabled_at) return false;
    const result = check(row.totp_secret, code, row.totp_last_step, now);
    if (result.ok) setLastStep.run(result.step, userId);
    return result.ok;
  };

  // Spends an unused backup code. Returns true when accepted.
  const useBackupCode = (userId, input, now) => {
    const code = normaliseBackupCode(input);
    return code !== null && spendCode.run(now.toISOString(), userId, hash(code)).changes === 1;
  };

  return {
    // { tokenVersion, totpEnabled, hasPending } for a user id, or null.
    state(userId) {
      const row = factor.get(userId);
      return row ? { tokenVersion: row.token_version, totpEnabled: Boolean(row.totp_enabled_at), hasPending: Boolean(row.totp_pending_secret) } : null;
    },

    useTotp,
    useBackupCode,

    // proof: logic/two-factor.js factorProof. Spends the code or backup code.
    useProof: (userId, proof, now) =>
      (proof.kind === 'code' ? useTotp(userId, proof.value, now) : useBackupCode(userId, proof.value, now)),

    // Stores a new pending secret; an enabled factor stays as it is.
    // account: the label in the authenticator app. Returns { secret, otpauth_url }.
    startSetup(userId, account) {
      const secret = generateSecret();
      setPending.run(secret, userId);
      return { secret, otpauth_url: otpauthUri({ secret, issuer: TOTP_ISSUER, account }) };
    },

    // Confirms the pending secret with a code from it. The pending secret
    // becomes the factor, its step is spent, the token version goes up and the
    // backup codes are replaced. Returns the new backup codes, or null.
    enable: db.transaction((userId, code, now) => {
      const row = factor.get(userId);
      if (!row?.totp_pending_secret) return null;
      const result = check(row.totp_pending_secret, code, null, now);
      if (!result.ok) return null;
      promotePending.run(now.toISOString(), result.step, userId);
      return replaceCodes(userId);
    }),

    regenerateBackupCodes: db.transaction((userId) => replaceCodes(userId)),

    clear: (userId) => clearTwoFactor(db, userId),

    bumpTokenVersion: (userId) => { bumpVersion.run(userId); },
  };
}
