import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canChangeRestaurant, canChangeMeal, canDeletePlanned, canChangeCatalogEntry, canUseGroup, ownerToPromote,
} from '../logic/access.js';

const owner = { id: 1, role: 'owner' };
const alice = { id: 2, role: 'member' };
const bob = { id: 3, role: 'member' };

describe('canChangeRestaurant', () => {
  const restaurant = { id: 10, added_by: alice.id };
  it('lets the user who added it change it', () => assert.equal(canChangeRestaurant(alice, restaurant), true));
  it('lets the owner change it', () => assert.equal(canChangeRestaurant(owner, restaurant), true));
  it('refuses another member', () => assert.equal(canChangeRestaurant(bob, restaurant), false));
});

describe('canChangeMeal', () => {
  const meal = { id: 20, user_id: alice.id };
  it('lets the user who ate it change it', () => assert.equal(canChangeMeal(alice, meal), true));
  it('refuses another member', () => assert.equal(canChangeMeal(bob, meal), false));
  it('refuses the owner: a meal is personal', () => assert.equal(canChangeMeal(owner, meal), false));
});

describe('canDeletePlanned', () => {
  const planned = { id: 30, user_id: alice.id };
  it('lets the user who planned it delete it', () => assert.equal(canDeletePlanned(alice, planned), true));
  it('refuses another member', () => assert.equal(canDeletePlanned(bob, planned), false));
  it('refuses the owner', () => assert.equal(canDeletePlanned(owner, planned), false));
});

describe('canChangeCatalogEntry', () => {
  it('lets the creator change it', () => assert.equal(canChangeCatalogEntry(alice, { created_by: alice.id }), true));
  it('lets the owner change it', () => assert.equal(canChangeCatalogEntry(owner, { created_by: alice.id }), true));
  it('refuses another member', () => assert.equal(canChangeCatalogEntry(bob, { created_by: alice.id }), false));
  it('leaves an entry with no creator to the owner only', () => {
    assert.equal(canChangeCatalogEntry(owner, { created_by: null }), true);
    assert.equal(canChangeCatalogEntry(alice, { created_by: null }), false);
    assert.equal(canChangeCatalogEntry({ id: null, role: 'member' }, { created_by: null }), false);
  });
});

describe('canUseGroup', () => {
  it('allows data outside a group', () => {
    assert.equal(canUseGroup(null, undefined), true);
    assert.equal(canUseGroup(undefined, undefined), true);
  });
  it('allows a member', () => assert.equal(canUseGroup(5, { user_id: 2 }), true));
  it('refuses a non-member', () => assert.equal(canUseGroup(5, undefined), false));
});

describe('ownerToPromote', () => {
  it('names nobody when there are no users', () => assert.equal(ownerToPromote([]), null));
  it('names nobody when an owner exists', () => {
    assert.equal(ownerToPromote([{ id: 1, role: 'member' }, { id: 2, role: 'owner' }]), null);
  });
  it('names the lowest id when there is no owner', () => {
    assert.equal(ownerToPromote([{ id: 7, role: 'member' }, { id: 3, role: 'member' }, { id: 9, role: 'member' }]), 3);
  });
  it('does not change its argument', () => {
    const users = [{ id: 7, role: 'member' }, { id: 3, role: 'member' }];
    const copy = structuredClone(users);
    ownerToPromote(users);
    assert.deepEqual(users, copy);
  });
});
