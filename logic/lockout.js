// Logic: the sign-in lockout policy. Failures are counted per key within a
// window; a key that reaches its limit is locked for a fixed time. Account keys
// (an email or a user id) allow 8 failures, IP keys 20, within 15 minutes, and
// a lock lasts 15 minutes. The connector stores the entries and asks these rules.
//
// entry: { count, windowStart, lockedUntil } with times in ms, or null.

export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const LOCK_DURATION_MS = 15 * 60 * 1000;
export const LOCKOUT_LIMITS = { account: 8, ip: 20 };

export const TOO_MANY_ATTEMPTS = 'Too many attempts. Try again later.';

// The email key is normalised, and is used whether or not the account exists,
// so a lock never reveals that an email is registered.
export const accountEmailKey = (email) => ({ key: `account:email:${String(email).trim().toLowerCase()}`, kind: 'account' });
export const accountUserKey = (userId) => ({ key: `account:user:${userId}`, kind: 'account' });
export const ipKey = (ip) => ({ key: `ip:${ip}`, kind: 'ip' });

// The keys each attempt counts against. Password login: the email and the IP.
// A second-factor code or backup code: the user and the IP. Registration and
// the invite check: the IP only.
export const loginKeys = (email, ip) => [accountEmailKey(email), ipKey(ip)];
export const codeKeys = (userId, ip) => [accountUserKey(userId), ipKey(ip)];
export const publicKeys = (ip) => [ipKey(ip)];

// A success clears the account keys, never the IP key.
export const keysClearedBySuccess = (keys) => keys.filter(k => k.kind === 'account');

// nowMs: milliseconds since the epoch.
export function isLocked(entry, nowMs) {
  return Boolean(entry && entry.lockedUntil !== null && entry.lockedUntil > nowMs);
}

export function isAnyLocked(entries, nowMs) {
  return entries.some(entry => isLocked(entry, nowMs));
}

// kind: 'account' | 'ip'. Returns the entry after one more failure.
export function afterFailure(entry, nowMs, kind) {
  const fresh = !entry || nowMs - entry.windowStart >= LOCKOUT_WINDOW_MS;
  const count = fresh ? 1 : entry.count + 1;
  const windowStart = fresh ? nowMs : entry.windowStart;
  const lockedUntil = count >= LOCKOUT_LIMITS[kind] ? nowMs + LOCK_DURATION_MS : null;
  return { count, windowStart, lockedUntil };
}
