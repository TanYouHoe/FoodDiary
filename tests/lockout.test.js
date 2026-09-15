// Logic test: the sign-in lockout policy (logic/lockout.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCKOUT_WINDOW_MS, LOCK_DURATION_MS, LOCKOUT_LIMITS, accountEmailKey, accountUserKey, ipKey,
  isLocked, afterFailure, isAnyLocked, loginKeys, codeKeys, publicKeys, keysClearedBySuccess,
} from '../logic/lockout.js';

const T0 = 1_800_000_000_000;
const MIN = 60_000;

// Records n failures, one second apart, from `start`.
const fail = (n, kind, start = T0, entry = null) => {
  let e = entry;
  for (let i = 0; i < n; i++) e = afterFailure(e, start + i * 1000, kind);
  return e;
};

describe('lockout policy', () => {
  it('limits: 8 per account, 20 per IP, 15-minute window and lock', () => {
    assert.deepEqual(LOCKOUT_LIMITS, { account: 8, ip: 20 });
    assert.equal(LOCKOUT_WINDOW_MS, 15 * MIN);
    assert.equal(LOCK_DURATION_MS, 15 * MIN);
  });

  it('keys: normalised email, user id, IP', () => {
    assert.deepEqual(accountEmailKey('  Amy@Test.COM '), { key: 'account:email:amy@test.com', kind: 'account' });
    assert.deepEqual(accountUserKey(7), { key: 'account:user:7', kind: 'account' });
    assert.deepEqual(ipKey('::1'), { key: 'ip:::1', kind: 'ip' });
  });

  it('which keys each attempt counts, and which a success clears', () => {
    assert.deepEqual(loginKeys('A@x.test', '1.2.3.4').map(k => k.key), ['account:email:a@x.test', 'ip:1.2.3.4']);
    assert.deepEqual(codeKeys(3, '1.2.3.4').map(k => k.key), ['account:user:3', 'ip:1.2.3.4']);
    assert.deepEqual(publicKeys('1.2.3.4').map(k => k.key), ['ip:1.2.3.4']);
    assert.deepEqual(keysClearedBySuccess(loginKeys('a@x.test', '1.2.3.4')).map(k => k.key), ['account:email:a@x.test']);
    assert.deepEqual(keysClearedBySuccess(publicKeys('1.2.3.4')), []);
  });

  it('an account locks on the 8th failure, not the 7th', () => {
    const seven = fail(7, 'account');
    assert.equal(seven.count, 7);
    assert.equal(isLocked(seven, T0 + 7000), false);
    const eight = afterFailure(seven, T0 + 7000, 'account');
    assert.equal(isLocked(eight, T0 + 7000), true);
    assert.equal(eight.lockedUntil, T0 + 7000 + LOCK_DURATION_MS);
  });

  it('an IP locks on the 20th failure', () => {
    assert.equal(isLocked(fail(19, 'ip'), T0 + 19_000), false);
    assert.equal(isLocked(fail(20, 'ip'), T0 + 20_000), true);
  });

  it('failures outside the window start a new count', () => {
    const seven = fail(7, 'account');
    const later = afterFailure(seven, T0 + LOCKOUT_WINDOW_MS, 'account');
    assert.deepEqual(later, { count: 1, windowStart: T0 + LOCKOUT_WINDOW_MS, lockedUntil: null });
  });

  it('a lock ends after its duration, and the next failure counts from one', () => {
    const locked = fail(8, 'account');
    assert.equal(isLocked(locked, locked.lockedUntil - 1), true);
    assert.equal(isLocked(locked, locked.lockedUntil), false);
    assert.equal(afterFailure(locked, locked.lockedUntil, 'account').count, 1);
  });

  it('no entry is not locked; any locked entry locks the request', () => {
    assert.equal(isLocked(null, T0), false);
    assert.equal(isAnyLocked([null, fail(1, 'ip')], T0), false);
    assert.equal(isAnyLocked([null, fail(8, 'account')], T0 + 8000), true);
  });

  it('does not change the entry it is given', () => {
    const entry = Object.freeze({ count: 1, windowStart: T0, lockedUntil: null });
    assert.equal(afterFailure(entry, T0 + 1, 'account').count, 2);
  });
});
