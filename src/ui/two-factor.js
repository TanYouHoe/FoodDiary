// UI: the second factor on screen. Whether to show the setup screen, its
// stage, the Security tab text and the owner's user rows. The rules (who may
// reset, what the server requires) are logic/ and the server; these only shape.

import { totpResetRefusal } from '../../logic/access.js';

// user: the signed-in user ({ totp_enabled, totp_required }) or null.
// enrollRequired: the API answered MFA_ENROLL_REQUIRED during this session.
export function needsEnrollment({ user, enrollRequired }) {
  return Boolean(user) && !user.totp_enabled && Boolean(user.totp_required || enrollRequired);
}

// Returns 'loading' | 'error' | 'scan' | 'codes'.
export function enrollStage({ setup, backupCodes, error }) {
  if (backupCodes) return 'codes';
  if (setup) return 'scan';
  return error ? 'error' : 'loading';
}

export function toSecurityState(user) {
  const enabled = Boolean(user.totp_enabled);
  let status = 'On. Sign-in asks for a code from your authenticator app.';
  if (!enabled) status = user.totp_required ? 'Off. This server requires it.' : 'Off. Sign-in asks for your password only.';
  return {
    status,
    replaceLabel: enabled ? 'Replace authenticator' : 'Set up authenticator',
    canRegenerate: enabled,
  };
}

// users: GET /api/users. currentUser: the signed-in owner ({ id, role }).
export function toUserRows(users, currentUser) {
  return users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    twoFactor: u.totp_enabled ? 'On' : 'Off',
    canReset: totpResetRefusal(currentUser, u.id) === null,
  }));
}

export const backupCodesText = (codes) => codes.join('\n');

export const SECURITY_MODES = {
  idle: 'idle',
  replaceCode: 'replace-code',
  regenerateCode: 'regenerate-code',
  setup: 'setup',
  codes: 'codes',
};

// The prompt above the current-code field, or null when no code is asked for.
export function currentCodePrompt(mode) {
  if (mode === SECURITY_MODES.replaceCode) return 'Enter a current code from your authenticator app to replace it.';
  if (mode === SECURITY_MODES.regenerateCode) return 'Enter a current code to make new backup codes. The old backup codes stop working.';
  return null;
}
