// Logic: the second factor in sign-in. Which step a correct first factor
// leads to, what a session token of each scope may reach, and when the factor
// may change. Tokens carry a type ('session' or 'mfa'), a scope and the user's
// token version; the connector signs and verifies them and asks these rules.

export const TOKEN_TYPES = { session: 'session', mfa: 'mfa' };
export const TOKEN_SCOPES = { full: 'full', enroll: 'enroll' };

// The pending sign-in between the first factor and the code.
export const MFA_TOKEN_TTL_SECONDS = 5 * 60;

export const MFA_ENROLL_REQUIRED = { error: 'Two-factor setup required', code: 'MFA_ENROLL_REQUIRED' };
export const SESSION_EXPIRED = 'Session expired';
export const INVALID_CODE = 'Invalid code';
export const CODE_REQUIRED = 'Code required';
export const INVALID_MFA_TOKEN = 'Sign-in step expired. Sign in again.';
export const NO_PENDING_SETUP = 'Start the authenticator setup first';
export const FACTOR_NOT_ENABLED = 'Two-factor authentication is not on';
export const FACTOR_REQUIRED = 'Two-factor authentication is required on this server';
export const BACKUP_CODE_USED_MEANWHILE = 'The backup code that started this setup is already used. Start the setup again.';

// An enroll-scope session reaches only these routes ('METHOD /path').
// Keep in sync with the route mounts in server/app.js and the paths in
// server/routes/auth.js and server/routes/totp.js; tests/api-two-factor.test.js
// calls each one and fails when a path is not mounted.
export const ENROLL_SCOPE_ROUTES = [
  'GET /api/auth/me',
  'POST /api/auth/totp/setup',
  'POST /api/auth/totp/enable',
  'POST /api/auth/totp/cancel',
  'POST /api/auth/logout-all',
];

// After a correct password or Google credential.
// Returns 'mfa' (ask for a code), 'enroll' (an enroll-scope session) or 'full'.
export function signInStep({ totpEnabled, requireTotp }) {
  if (totpEnabled) return 'mfa';
  return requireTotp ? 'enroll' : 'full';
}

// The scope a session acts with now. A full token acts as enroll while the
// server requires a factor the user does not have; an unknown scope is enroll.
export function effectiveScope({ tokenScope, totpEnabled, requireTotp }) {
  if (tokenScope !== TOKEN_SCOPES.full) return TOKEN_SCOPES.enroll;
  return requireTotp && !totpEnabled ? TOKEN_SCOPES.enroll : TOKEN_SCOPES.full;
}

// path: the request path without a query string.
export function scopeAllows(scope, method, path) {
  return scope === TOKEN_SCOPES.full || ENROLL_SCOPE_ROUTES.includes(`${method} ${path}`);
}

// claims: a verified token payload. A token of another type, or one without a
// user id or a token version, is refused. An mfa token also needs a jti, the
// id it is spent under, so it works only once.
export function isTokenOfType(claims, type) {
  return Boolean(claims) && claims.typ === type && Number.isSafeInteger(claims.id) && Number.isInteger(claims.tv)
    && (type !== TOKEN_TYPES.mfa || (typeof claims.jti === 'string' && claims.jti.length > 0));
}

export function isCurrentTokenVersion(claims, tokenVersion) {
  return claims.tv === tokenVersion;
}

// A server that requires the factor never lets a user remove it.
export const canDisableTotp = ({ requireTotp }) => !requireTotp;

// A user with an enabled factor proves it (factorProof) to replace it, and an
// owner proves their own factor to reset another user's.
export const needsFactorProof = ({ totpEnabled }) => totpEnabled;

// How long a first enrollment keeps offering the same pending secret.
export const PENDING_SECRET_MAX_AGE_MS = 30 * 60 * 1000;

// First enrollment keeps a pending secret younger than PENDING_SECRET_MAX_AGE_MS,
// so a reload still matches the QR code already scanned; an older one (or one
// without a creation time) is replaced. A replace (a factor is enabled) always
// makes a new one. pendingCreatedAtMs: ms or null; nowMs: ms.
export function shouldReusePendingSecret({ totpEnabled, hasPending, pendingCreatedAtMs, nowMs }) {
  if (totpEnabled || !hasPending || pendingCreatedAtMs === null || pendingCreatedAtMs === undefined) return false;
  return nowMs - pendingCreatedAtMs < PENDING_SECRET_MAX_AGE_MS;
}

// What proves the second factor for the code step, a replace or new backup
// codes: a current code, or else a backup code (so a user who lost the phone
// can still replace it). body: { code, backup_code }.
// Returns { kind: 'code' | 'backup', value }, or null when neither is given.
export function factorProof(body) {
  if (body?.code) return { kind: 'code', value: body.code };
  if (body?.backup_code) return { kind: 'backup', value: body.backup_code };
  return null;
}
