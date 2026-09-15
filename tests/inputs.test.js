import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkMealTypeInput, checkDishTypeInput, checkMealTypeForm, checkDishTypeForm } from '../logic/catalog.js';
import { normalizeMealDishes } from '../logic/dishes.js';
import { checkRestaurantInput } from '../logic/restaurants.js';
import { checkServerConfig, DEV_JWT_SECRET, MIN_JWT_SECRET_LENGTH } from '../logic/config.js';
import { parseGroupId } from '../logic/accounts.js';
import { checkNewMeal, toMealPatch, mergeMealPhotos, MAX_MEAL_PHOTOS } from '../logic/meals.js';
import { checkPlannedInput } from '../logic/planned.js';

const INVALID_GROUP = { ok: false, error: 'Invalid group' };
const BAD_GROUP_IDS = [true, false, {}, [5, 7], ['5'], 'abc', '5x', '1.5', 1.5, 0, '0', -1, '-1', Number.MAX_SAFE_INTEGER + 1];

describe('parseGroupId', () => {
  it('reads no group as null', () => {
    for (const value of [undefined, null, '']) assert.deepEqual(parseGroupId(value), { ok: true, value: null });
  });
  it('reads a positive integer or its decimal string', () => {
    assert.deepEqual(parseGroupId(5), { ok: true, value: 5 });
    assert.deepEqual(parseGroupId('5'), { ok: true, value: 5 });
    assert.deepEqual(parseGroupId('42'), { ok: true, value: 42 });
  });
  it('rejects anything else', () => {
    for (const value of BAD_GROUP_IDS) assert.deepEqual(parseGroupId(value), INVALID_GROUP, JSON.stringify(value));
  });
});

describe('group ids in meal and planned input', () => {
  const meal = { restaurant_id: 1, rating: 4, visited_at: '2026-09-01T12:00:00.000Z' };
  it('checkNewMeal parses the group', () => {
    assert.equal(checkNewMeal({ ...meal, group_id: '5' }).value.group_id, 5);
    assert.equal(checkNewMeal(meal).value.group_id, null);
    for (const group_id of BAD_GROUP_IDS) assert.deepEqual(checkNewMeal({ ...meal, group_id }), INVALID_GROUP);
  });
  it('toMealPatch parses the group only when the body names one', () => {
    assert.equal('group_id' in toMealPatch({ rating: 3 }).value.fields, false);
    assert.equal(toMealPatch({ group_id: null }).value.fields.group_id, null);
    assert.equal(toMealPatch({ group_id: '7' }).value.fields.group_id, 7);
    for (const group_id of BAD_GROUP_IDS) assert.deepEqual(toMealPatch({ rating: 3, group_id }), INVALID_GROUP);
  });
  it('checkPlannedInput parses the group', () => {
    assert.equal(checkPlannedInput({ restaurant_id: 1, group_id: 9 }).value.group_id, 9);
    assert.equal(checkPlannedInput({ restaurant_id: 1 }).value.group_id, null);
    for (const group_id of BAD_GROUP_IDS) assert.deepEqual(checkPlannedInput({ restaurant_id: 1, group_id }), INVALID_GROUP);
  });
});

describe('mergeMealPhotos', () => {
  it('appends the new photos', () => {
    assert.deepEqual(mergeMealPhotos(['/a'], ['/b', '/c'], MAX_MEAL_PHOTOS), { ok: true, value: ['/a', '/b', '/c'] });
  });
  it('allows exactly the limit and refuses more', () => {
    assert.equal(mergeMealPhotos(['/a', '/b'], ['/c'], 3).ok, true);
    assert.deepEqual(mergeMealPhotos(['/a', '/b'], ['/c', '/d'], 3), { ok: false, error: 'A meal can have at most 3 photos' });
  });
  it('does not change its arguments', () => {
    const existing = ['/a'];
    const added = ['/b'];
    mergeMealPhotos(existing, added, MAX_MEAL_PHOTOS);
    assert.deepEqual([existing, added], [['/a'], ['/b']]);
  });
});

describe('checkMealTypeInput', () => {
  it('trims the name and keeps only non-blank trimmed slots', () => {
    assert.deepEqual(checkMealTypeInput({ name: ' Dim Sum ', slots: [{ name: ' Main ' }, { name: '  ' }, { name: 'Side', extra: 1 }] }), {
      ok: true,
      value: { name: 'Dim Sum', cuisine_type: null, slots: [{ name: 'Main' }, { name: 'Side' }] },
    });
  });

  it('keeps the cuisine', () => {
    assert.equal(checkMealTypeInput({ name: 'X', cuisine_type: 'Thai', slots: [{ name: 'Main' }] }).value.cuisine_type, 'Thai');
  });

  it('rejects a missing or blank name', () => {
    for (const name of [undefined, '', '   ', 5]) {
      assert.deepEqual(checkMealTypeInput({ name, slots: [{ name: 'Main' }] }), { ok: false, error: 'Name is required' });
    }
  });

  it('requires at least one non-blank slot', () => {
    for (const slots of [undefined, 'Main', [], [{ name: '  ' }], [null, { name: 3 }, {}]]) {
      assert.deepEqual(checkMealTypeInput({ name: 'X', slots }), { ok: false, error: 'Add at least one slot' });
    }
  });
});

describe('checkDishTypeInput', () => {
  it('trims the name', () => assert.deepEqual(checkDishTypeInput({ name: ' Curry ' }), { ok: true, value: { name: 'Curry' } }));
  it('rejects a missing or blank name', () => {
    for (const name of [undefined, '', '   ', 5]) {
      assert.deepEqual(checkDishTypeInput({ name }), { ok: false, error: 'Name is required' });
    }
  });
});

describe('form checks use the server rule', () => {
  it('the meal type form gives the same answer as the input check', () => {
    const forms = [
      { name: ' Dim Sum ', cuisineType: '', slots: [{ name: ' Main ' }, { name: '' }] },
      { name: '  ', cuisineType: 'Thai', slots: [{ name: 'Main' }] },
      { name: 'X', cuisineType: 'Thai', slots: [{ name: ' ' }] },
    ];
    for (const form of forms) {
      assert.deepEqual(checkMealTypeForm(form), checkMealTypeInput({ name: form.name, cuisine_type: form.cuisineType, slots: form.slots }));
    }
  });

  it('the dish type form gives the same answer as the input check', () => {
    for (const name of [' Curry ', '  ']) assert.deepEqual(checkDishTypeForm(name), checkDishTypeInput({ name }));
  });
});

describe('normalizeMealDishes', () => {
  it('skips null, numbers and other non-dish entries', () => {
    assert.deepEqual(normalizeMealDishes([null, 5, true, 'Rice Bowl', { name: 7 }, [], { name: 'Tea', category: 'drink' }], ['Rice']), [
      { name: 'Rice Bowl', category: 'rice' },
      { name: 'Tea', category: 'drink' },
    ]);
  });
});

describe('checkRestaurantInput', () => {
  it('rejects a missing or blank name', () => {
    assert.deepEqual(checkRestaurantInput({}), { ok: false, error: 'Name required' });
    assert.deepEqual(checkRestaurantInput({ name: '  ' }), { ok: false, error: 'Name required' });
  });
  it('trims the name and nulls empty fields', () => {
    assert.deepEqual(checkRestaurantInput({ name: ' Place ', price_range: 2 }), {
      ok: true,
      value: { name: 'Place', cuisine_type: null, price_range: 2, address: null, lat: null, lng: null },
    });
  });
});

describe('checkServerConfig', () => {
  it('accepts anything outside production', () => {
    assert.deepEqual(checkServerConfig({ nodeEnv: undefined, jwtSecret: undefined }), []);
    assert.deepEqual(checkServerConfig({ nodeEnv: 'development', jwtSecret: DEV_JWT_SECRET }), []);
  });
  it('in production, needs a long secret that is not the development default', () => {
    assert.equal(checkServerConfig({ nodeEnv: 'production', jwtSecret: undefined }).length, 1);
    assert.equal(checkServerConfig({ nodeEnv: 'production', jwtSecret: '' }).length, 1);
    assert.equal(checkServerConfig({ nodeEnv: 'production', jwtSecret: DEV_JWT_SECRET }).length, 1);
    assert.equal(checkServerConfig({ nodeEnv: 'production', jwtSecret: 'x'.repeat(MIN_JWT_SECRET_LENGTH - 1) }).length, 1);
    assert.deepEqual(checkServerConfig({ nodeEnv: 'production', jwtSecret: 'x'.repeat(MIN_JWT_SECRET_LENGTH) }), []);
    assert.equal(MIN_JWT_SECRET_LENGTH, 32);
  });
  it('the development default is the documented one', () => assert.equal(DEV_JWT_SECRET, 'food-diary-dev-secret'));
});
