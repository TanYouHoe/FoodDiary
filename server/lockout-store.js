// Connector: the failure counters behind the sign-in lockout, in table
// auth_failures. Every decision (limits, window, lock, which keys a success
// clears) is logic/lockout.js.

import { isAnyLocked, afterFailure, keysClearedBySuccess, TOO_MANY_ATTEMPTS } from '../logic/lockout.js';

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

  const recordFailure = db.transaction((keys, nowMs) => {
    for (const { key, kind } of keys) {
      const next = afterFailure(entry(key), nowMs, kind);
      put.run(key, next.count, next.windowStart, next.lockedUntil);
    }
  });

  return {
    // keys: from logic/lockout.js (loginKeys, codeKeys, publicKeys). now: a Date.
    // check: () => boolean or Promise<boolean>, run only when no key is locked.
    // Records a failure on every key, or clears the account keys on success.
    // Returns 'locked', 'failed' or 'ok'.
    async attempt(keys, now, check) {
      if (isAnyLocked(keys.map(k => entry(k.key)), now.getTime())) return 'locked';
      const ok = Boolean(await check());
      if (ok) for (const { key } of keysClearedBySuccess(keys)) remove.run(key);
      else recordFailure(keys, now.getTime());
      return ok ? 'ok' : 'failed';
    },
  };
}
