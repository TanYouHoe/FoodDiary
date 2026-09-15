import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkMealTypeInput, checkDishTypeInput, checkMealTypeForm, checkDishTypeForm } from '../logic/catalog.js';
import { normalizeMealDishes } from '../logic/dishes.js';
import { checkRestaurantInput } from '../logic/restaurants.js';
import { checkServerConfig, DEV_JWT_SECRET } from '../logic/config.js';

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
  it('in production, needs a secret that is not the development default', () => {
    assert.equal(checkServerConfig({ nodeEnv: 'production', jwtSecret: undefined }).length, 1);
    assert.equal(checkServerConfig({ nodeEnv: 'production', jwtSecret: '' }).length, 1);
    assert.equal(checkServerConfig({ nodeEnv: 'production', jwtSecret: DEV_JWT_SECRET }).length, 1);
    assert.deepEqual(checkServerConfig({ nodeEnv: 'production', jwtSecret: 'a-real-secret' }), []);
  });
  it('the development default is the documented one', () => assert.equal(DEV_JWT_SECRET, 'food-diary-dev-secret'));
});
