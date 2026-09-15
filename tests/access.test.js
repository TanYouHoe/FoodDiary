import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canChangeRestaurant, canDeleteRestaurant, canChangeMeal, canDeletePlanned, canChangeCatalogEntry,
  catalogChangeRefusal, canUseGroup, ownerToPromote, NOT_ALLOWED,
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

describe('canDeleteRestaurant', () => {
  const restaurant = { id: 10, added_by: alice.id };
  const unused = { otherUsersMeals: 0, otherUsersPlanned: 0, groupMeals: 0, groupPlanned: 0 };
  it('lets the adder delete it while nobody else uses it', () => assert.equal(canDeleteRestaurant(alice, restaurant, unused), true));
  it('refuses the adder when other people logged meals or planned visits there', () => {
    assert.equal(canDeleteRestaurant(alice, restaurant, { ...unused, otherUsersMeals: 1 }), false);
    assert.equal(canDeleteRestaurant(alice, restaurant, { ...unused, otherUsersPlanned: 2 }), false);
  });
  it('refuses the adder when group rows are there, even rows the adder wrote', () => {
    assert.equal(canDeleteRestaurant(alice, restaurant, { ...unused, groupMeals: 1 }), false);
    assert.equal(canDeleteRestaurant(alice, restaurant, { ...unused, groupPlanned: 1 }), false);
  });
  it('lets the owner always delete it', () => {
    assert.equal(canDeleteRestaurant(owner, restaurant, { otherUsersMeals: 3, otherUsersPlanned: 3, groupMeals: 3, groupPlanned: 3 }), true);
  });
  it('refuses another member', () => assert.equal(canDeleteRestaurant(bob, restaurant, unused), false));
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
  });
});

describe('catalogChangeRefusal', () => {
  it('names the built-in lock first, even for the owner', () => {
    assert.equal(catalogChangeRefusal(owner, { is_seed: 1, created_by: null }, 'meal', 'edit'), 'Cannot edit built-in meal types');
    assert.equal(catalogChangeRefusal(alice, { is_seed: 1, created_by: alice.id }, 'dish', 'delete'), 'Cannot delete built-in dish types');
  });
  it('then refuses anyone but the creator or the owner', () => {
    assert.equal(catalogChangeRefusal(bob, { is_seed: 0, created_by: alice.id }, 'meal', 'edit'), NOT_ALLOWED);
    assert.equal(catalogChangeRefusal(alice, { is_seed: 0, created_by: null }, 'dish', 'edit'), NOT_ALLOWED);
  });
  it('allows the creator and the owner', () => {
    assert.equal(catalogChangeRefusal(alice, { is_seed: 0, created_by: alice.id }, 'meal', 'delete'), null);
    assert.equal(catalogChangeRefusal(owner, { is_seed: 0, created_by: null }, 'dish', 'delete'), null);
  });
  it('the refusal text is the one routes send', () => assert.equal(NOT_ALLOWED, 'Not allowed'));
});

describe('canUseGroup', () => {
  it('allows data outside a group', () => {
    assert.equal(canUseGroup(null, undefined), true);
  });
  it('allows a member', () => assert.equal(canUseGroup(5, { user_id: 2 }), true));
  it('refuses a non-member', () => assert.equal(canUseGroup(5, undefined), false));
});

describe('ownerToPromote', () => {
  const legacy = { hadUsersBeforeInvites: true };
  it('names nobody when there are no users', () => assert.equal(ownerToPromote([], legacy), null));
  it('names nobody when an owner exists', () => {
    assert.equal(ownerToPromote([{ id: 1, role: 'member' }, { id: 2, role: 'owner' }], legacy), null);
  });
  it('names the lowest id when there is no owner', () => {
    assert.equal(ownerToPromote([{ id: 7, role: 'member' }, { id: 3, role: 'member' }, { id: 9, role: 'member' }], legacy), 3);
  });
  it('names nobody in a database that had no users before invites', () => {
    assert.equal(ownerToPromote([{ id: 7, role: 'member' }, { id: 3, role: 'member' }], { hadUsersBeforeInvites: false }), null);
    assert.equal(ownerToPromote([{ id: 7, role: 'member' }], {}), null);
  });
  it('does not change its argument', () => {
    const users = [{ id: 7, role: 'member' }, { id: 3, role: 'member' }];
    const copy = structuredClone(users);
    ownerToPromote(users, legacy);
    assert.deepEqual(users, copy);
  });
});
