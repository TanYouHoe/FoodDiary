// Connector test: the password check with a fake compare, so no timing is measured.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makePasswordCheck } from '../server/passwords.js';

describe('makePasswordCheck', () => {
  const fake = (answer) => {
    const seen = { hashes: [], hashSyncCalls: 0 };
    const check = makePasswordCheck({
      compare: async (password, hash) => { seen.hashes.push(hash); return answer; },
      hashSync: () => { seen.hashSyncCalls += 1; return 'DUMMY-HASH'; },
    });
    return { check, seen };
  };

  it('an unknown account is compared against the dummy hash and never passes', async () => {
    const { check, seen } = fake(true);
    assert.equal(await check(undefined, 'anything'), false);
    assert.deepEqual(seen.hashes, ['DUMMY-HASH'], 'the same bcrypt work runs as for a real account');
  });

  it('a known account is compared against its own hash', async () => {
    const { check, seen } = fake(true);
    assert.equal(await check({ password_hash: 'REAL-HASH' }, 'right'), true);
    assert.deepEqual(seen.hashes, ['REAL-HASH']);
    const wrong = fake(false);
    assert.equal(await wrong.check({ password_hash: 'REAL-HASH' }, 'wrong'), false);
  });

  it('makes the dummy hash once', async () => {
    const { check, seen } = fake(false);
    await check(undefined, 'a');
    await check(undefined, 'b');
    assert.equal(seen.hashSyncCalls, 1);
  });
});
