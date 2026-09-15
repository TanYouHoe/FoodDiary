import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allowedIds } from '../../src/ui/access.js';
import { canDeletePlanned, catalogChangeRefusal } from '../../logic/access.js';

const alice = { id: 1, role: 'member' };
const owner = { id: 9, role: 'owner' };

describe('allowedIds', () => {
  const planned = [{ id: 10, user_id: 1 }, { id: 11, user_id: 2 }, { id: 12, user_id: 1 }];

  it('keeps the ids the rule allows, in order', () => {
    assert.deepEqual(allowedIds(alice, planned, canDeletePlanned), [10, 12]);
  });

  it('gives no id when nobody is signed in', () => {
    assert.deepEqual(allowedIds(null, planned, canDeletePlanned), []);
  });

  it('works with the catalog rule', () => {
    const types = [
      { id: 1, is_seed: 1, created_by: null },
      { id: 2, is_seed: 0, created_by: 1 },
      { id: 3, is_seed: 0, created_by: 2 },
    ];
    const canChange = (user, entry) => catalogChangeRefusal(user, entry, 'dish', 'edit') === null;
    assert.deepEqual(allowedIds(alice, types, canChange), [2]);
    assert.deepEqual(allowedIds(owner, types, canChange), [2, 3]);
  });
});
