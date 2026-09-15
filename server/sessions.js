// Connector: the answers that sign a user in. After a correct first factor
// logic/two-factor.js decides between a code step, an enroll-scope session and
// a full session; this file signs the token, maps the user row, and spends
// each mfa token once (table used_mfa_tokens).

import { signInStep, TOKEN_SCOPES } from '../logic/two-factor.js';
import { pick, USER_FIELDS } from './rows.js';

// now: () => Date. requireTotp: whether the server requires a second factor.
export function makeSessions({ db, tokens, requireTotp, now }) {
  const byId = db.prepare(`SELECT id, name, email, avatar_url, role, timezone, created_at, token_version, totp_enabled_at
    FROM users WHERE id = ?`);
  const spent = db.prepare('SELECT 1 FROM used_mfa_tokens WHERE jti = ?');
  const pruneSpent = db.prepare('DELETE FROM used_mfa_tokens WHERE expires_at <= ?');
  const spend = db.prepare('INSERT OR IGNORE INTO used_mfa_tokens (jti, expires_at) VALUES (?, ?)');

  // The signed-in user as the browser sees it: never a secret or a version.
  const toAuthUser = (row) => ({ ...pick(row, USER_FIELDS), totp_enabled: Boolean(row.totp_enabled_at), totp_required: requireTotp });

  const session = (row, scope) => ({
    token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version, scope }, now()),
    user: toAuthUser(row),
  });

  return {
    user: (userId) => toAuthUser(byId.get(userId)),

    // After a correct password or Google credential:
    // { mfa_required: true, mfa_token } or { token, user }.
    afterFirstFactor(userId) {
      const row = byId.get(userId);
      const step = signInStep({ totpEnabled: Boolean(row.totp_enabled_at), requireTotp });
      if (step === 'mfa') {
        return { mfa_required: true, mfa_token: tokens.signMfa({ userId: row.id, tokenVersion: row.token_version }, now()) };
      }
      return session(row, step === 'enroll' ? TOKEN_SCOPES.enroll : TOKEN_SCOPES.full);
    },

    // claims: verified mfa token claims ({ jti }).
    isMfaTokenSpent: (claims) => Boolean(spent.get(claims.jti)),

    // Spends the mfa token and issues the full session in one transaction.
    // Spent tokens past their expiry are pruned first: they no longer verify.
    // claims: verified mfa token claims ({ id, jti, exp }).
    // Returns { token, user }, or null when the token was already spent.
    completeMfa: db.transaction((claims) => {
      pruneSpent.run(Math.floor(now().getTime() / 1000));
      if (spend.run(claims.jti, claims.exp).changes !== 1) return null;
      return session(byId.get(claims.id), TOKEN_SCOPES.full);
    }),

    // After a factor change that raised the token version.
    full: (userId) => session(byId.get(userId), TOKEN_SCOPES.full),
  };
}
