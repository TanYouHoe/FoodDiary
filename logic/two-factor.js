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

// An enroll-scope session reaches only these routes ('METHOD /path').
export const ENROLL_SCOPE_ROUTES = [
  'GET /api/auth/me',
  'POST /api/auth/totp/setup',
  'POST /api/auth/totp/enable',
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
// user id or a token version, is refused.
export function isTokenOfType(claims, type) {
  return Boolean(claims) && claims.typ === type && Number.isSafeInteger(claims.id) && Number.isInteger(claims.tv);
}

export function isCurrentTokenVersion(claims, tokenVersion) {
  return claims.tv === tokenVersion;
}

// A server that requires the factor never lets a user remove it.
export const canDisableTotp = ({ requireTotp }) => !requireTotp;

// Replacing an enabled factor needs a current code from it.
export const setupNeedsCurrentCode = ({ totpEnabled }) => totpEnabled;
