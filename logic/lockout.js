// Logic: the sign-in lockout policy. Failures are counted per key within a
// window; a key that reaches its limit is locked for a fixed time. Account keys
// (an email or a user id) allow 8 failures, IP keys 20, within 15 minutes, and
// such a lock lasts 15 minutes. Second-factor codes also count on a day-long
// account key: 30 failures within 24 hours lock codes for 24 hours, so a slow
// guesser who stays under the 15-minute rule still stops. The connector stores
// the entries and asks these rules.
//
// entry: { count, windowStart, lockedUntil } with times in ms, or null.
// kind: 'account' | 'ip' | 'accountLong'.

export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const LOCK_DURATION_MS = 15 * 60 * 1000;
export const LONG_LOCKOUT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const LONG_LOCK_DURATION_MS = 24 * 60 * 60 * 1000;
export const LOCKOUT_LIMITS = { account: 8, ip: 20, accountLong: 30 };

const WINDOW_MS = { account: LOCKOUT_WINDOW_MS, ip: LOCKOUT_WINDOW_MS, accountLong: LONG_LOCKOUT_WINDOW_MS };
const LOCK_MS = { account: LOCK_DURATION_MS, ip: LOCK_DURATION_MS, accountLong: LONG_LOCK_DURATION_MS };

export const TOO_MANY_ATTEMPTS = 'Too many attempts. Try again later.';

// The email key is normalised, and is used whether or not the account exists,
// so a lock never reveals that an email is registered.
export const accountEmailKey = (email) => ({ key: `account:email:${String(email).trim().toLowerCase()}`, kind: 'account' });
export const accountUserKey = (userId) => ({ key: `account:user:${userId}`, kind: 'account' });
export const accountUserLongKey = (userId) => ({ key: `account-long:user:${userId}`, kind: 'accountLong' });
export const ipKey = (ip) => ({ key: `ip:${ip}`, kind: 'ip' });

// The keys each attempt counts against. Password login: the email and the IP.
// A second-factor code or backup code: the user (15 minutes and 24 hours) and
// the IP. Registration and the invite check: the IP only.
export const loginKeys = (email, ip) => [accountEmailKey(email), ipKey(ip)];
export const codeKeys = (userId, ip) => [accountUserKey(userId), accountUserLongKey(userId), ipKey(ip)];
export const publicKeys = (ip) => [ipKey(ip)];

// A two-factor reset (owner or console) clears the user's code keys, 15-minute
// and day-long, so the reset user can set up a new factor at once. The IP key
// stays: it belongs to the client, not to the user.
export const lockoutKeysClearedByReset = (userId) => [accountUserKey(userId), accountUserLongKey(userId)];

// A success clears the 15-minute account keys. The IP key and the day-long
// key only get their reserved failure back, so a user's own sign-ins never
// wipe the count of a slow guesser.
export const keysClearedBySuccess = (keys) => keys.filter(k => k.kind === 'account');

// nowMs: milliseconds since the epoch.
export function isLocked(entry, nowMs) {
  return Boolean(entry && entry.lockedUntil !== null && entry.lockedUntil > nowMs);
}

export function isAnyLocked(entries, nowMs) {
  return entries.some(entry => isLocked(entry, nowMs));
}

// Returns the entry after one more failure.
export function afterFailure(entry, nowMs, kind) {
  const fresh = !entry || nowMs - entry.windowStart >= WINDOW_MS[kind];
  const count = fresh ? 1 : entry.count + 1;
  const windowStart = fresh ? nowMs : entry.windowStart;
  const lockedUntil = count >= LOCKOUT_LIMITS[kind] ? nowMs + LOCK_MS[kind] : null;
  return { count, windowStart, lockedUntil };
}

// An attempt counts as a failure before its credential is checked, so
// parallel attempts can never pass the limit together. entries: one per key
// (or null), kinds: the matching kinds.
// Returns { allowed, entries }: refused (entries unchanged) when any key is
// locked, else allowed with a failure reserved on every key.
export function reserveAttempts(entries, kinds, nowMs) {
  if (isAnyLocked(entries, nowMs)) return { allowed: false, entries };
  return { allowed: true, entries: entries.map((entry, i) => afterFailure(entry, nowMs, kinds[i])) };
}

// A reserved failure given back after the credential proved right. A lock
// stays only while the count is still at the limit.
export function releaseAttempt(entry, kind) {
  if (!entry) return null;
  const count = Math.max(0, entry.count - 1);
  return { count, windowStart: entry.windowStart, lockedUntil: count >= LOCKOUT_LIMITS[kind] ? entry.lockedUntil : null };
}
