// Connector: the answers that sign a user in. After a correct first factor
// logic/two-factor.js decides between a code step, an enroll-scope session and
// a full session; this file signs the token and maps the user row.

import { signInStep, TOKEN_SCOPES } from '../logic/two-factor.js';
import { pick, USER_FIELDS } from './rows.js';

// now: () => Date. requireTotp: whether the server requires a second factor.
export function makeSessions({ db, tokens, requireTotp, now }) {
  const byId = db.prepare(`SELECT id, name, email, avatar_url, role, timezone, created_at, token_version, totp_enabled_at
    FROM users WHERE id = ?`);

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

    // After the second factor, or a factor change that raised the token version.
    full: (userId) => session(byId.get(userId), TOKEN_SCOPES.full),
  };
}
