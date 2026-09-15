// Connector: the failure counters behind the sign-in lockout, in table
// auth_failures. Every decision (limits, window, lock, reserve and release,
// which keys a success clears) is logic/lockout.js; this file applies those
// state transitions in transactions.

import { reserveAttempts, releaseAttempt, keysClearedBySuccess, TOO_MANY_ATTEMPTS } from '../logic/lockout.js';

export const tooManyAttempts = (res) => res.status(429).json({ error: TOO_MANY_ATTEMPTS });

export function makeLockout(db) {
  const get = db.prepare('SELECT count, window_start, locked_until FROM auth_failures WHERE key = ?');
  const put = db.prepare(`INSERT INTO auth_failures (key, count, window_start, locked_until) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET count = excluded.count, window_start = excluded.window_start, locked_until = excluded.locked_until`);
  const remove = db.prepare('DELETE FROM auth_failures WHERE key = ?');

  const entry = (key) => {
    const row = get.get(key);
    return row ? { count: row.count, windowStart: row.window_start, lockedUntil: row.locked_until } : null;
  };
  const store = (key, next) => put.run(key, next.count, next.windowStart, next.lockedUntil);

  // Checks the locks and reserves a failure on every key in one synchronous
  // transaction, so no other request runs in between. Returns whether allowed.
  const reserve = db.transaction((keys, nowMs) => {
    const { allowed, entries } = reserveAttempts(keys.map(k => entry(k.key)), keys.map(k => k.kind), nowMs);
    if (allowed) keys.forEach((k, i) => store(k.key, entries[i]));
    return allowed;
  });

  // After a success: the account keys are cleared, the other reservations given back.
  const releaseOnSuccess = db.transaction((keys) => {
    const cleared = new Set(keysClearedBySuccess(keys).map(k => k.key));
    for (const { key, kind } of keys) {
      if (cleared.has(key)) { remove.run(key); continue; }
      const next = releaseAttempt(entry(key), kind);
      if (next) store(key, next);
    }
  });

  // Before a thrown error: every reservation is given back; an error is not a guess.
  const releaseAll = db.transaction((keys) => {
    for (const { key, kind } of keys) {
      const next = releaseAttempt(entry(key), kind);
      if (next) store(key, next);
    }
  });

  return {
    // keys: from logic/lockout.js (loginKeys, codeKeys, publicKeys). now: a Date.
    // check: () => boolean or Promise<boolean>, run only when no key is locked.
    // A check must not throw on user input: return false for a bad value. A
    // throw gives the reservation back, so a guess that throws would not count.
    // The failure is counted before check runs and given back when it passes.
    // Returns 'locked', 'failed' or 'ok'.
    async attempt(keys, now, check) {
      if (!reserve(keys, now.getTime())) return 'locked';
      let ok;
      try {
        ok = Boolean(await check());
      } catch (err) {
        releaseAll(keys);
        throw err;
      }
      if (ok) releaseOnSuccess(keys);
      return ok ? 'ok' : 'failed';
    },
  };
}
