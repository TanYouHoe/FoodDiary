import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupDishes, dishCategoryOptions, categoryLabel } from '../../src/ui/dishes.js';
import { DISH_CATEGORY_ORDER } from '../../logic/dishes.js';

describe('categoryLabel', () => {
  it('keeps the built-in label', () => assert.equal(categoryLabel('main'), 'Main Dish'));
  it('capitalises a custom category', () => assert.equal(categoryLabel('curry'), 'Curry'));
});

describe('dishCategoryOptions', () => {
  it('lists the built-in order, then custom types lower-cased and alphabetical', () => {
    const options = dishCategoryOptions(['Soup', 'Snack', 'Main', 'curry', 'Rice', 'Bakery']);
    assert.deepEqual(options.map(o => o.value), [...DISH_CATEGORY_ORDER, 'bakery', 'curry', 'snack']);
    assert.deepEqual(options.slice(0, 1), [{ value: 'main', label: 'Main Dish' }]);
    assert.deepEqual(options.slice(-3), [
      { value: 'bakery', label: 'Bakery' },
      { value: 'curry', label: 'Curry' },
      { value: 'snack', label: 'Snack' },
    ]);
  });

  it('lists a custom type once and skips a blank name', () => {
    const options = dishCategoryOptions(['Curry', ' curry ', ' ', '']);
    assert.deepEqual(options.map(o => o.value), [...DISH_CATEGORY_ORDER, 'curry']);
  });

  it('lists the built-ins when no dish types are loaded', () => {
    assert.deepEqual(dishCategoryOptions([]).map(o => o.value), DISH_CATEGORY_ORDER);
  });
});

describe('groupDishes', () => {
  it('shows custom categories after the built-in order, alphabetically', () => {
    const groups = groupDishes([
      { name: 'Rendang', category: 'curry' },
      { name: 'Teh', category: 'drink' },
      { name: 'Chips', category: 'bakery' },
      { name: 'Chicken' },
      { name: 'Soup', category: 'soup' },
      { name: 'Korma', category: 'curry' },
    ]);
    assert.deepEqual(groups.map(g => [g.category, g.label]), [
      ['main', 'Main Dish'],
      ['soup', 'Soup'],
      ['drink', 'Drink'],
      ['bakery', 'Bakery'],
      ['curry', 'Curry'],
    ]);
    assert.deepEqual(groups.find(g => g.category === 'curry').dishes, [
      { name: 'Rendang', category: 'curry', index: 0 },
      { name: 'Korma', category: 'curry', index: 5 },
    ]);
  });

  it('gives no group for an empty list', () => assert.deepEqual(groupDishes([]), []));
});
