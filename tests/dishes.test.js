import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { categoryOfType, categorizeDish, DISH_CATEGORY_ORDER, DISH_CATEGORY_NAMES, DEFAULT_DISH_CATEGORY } from '../logic/dishes.js';

describe('categoryOfType', () => {
  it('trims and lower-cases a dish type name', () => {
    assert.equal(categoryOfType(' Curry '), 'curry');
    assert.equal(categoryOfType('SOUP'), 'soup');
    assert.equal(categoryOfType('  '), '');
  });
});

describe('categorizeDish', () => {
  it('takes the category of the first type named in the dish', () => {
    assert.equal(categorizeDish('Beef Curry Rice', [' Curry ', 'Rice']), 'curry');
  });
  it('skips a blank type name and falls back to the default', () => {
    assert.equal(categorizeDish('Teh Tarik', ['  ', '']), DEFAULT_DISH_CATEGORY);
  });
});

describe('built-in dish categories', () => {
  it('names every category in the picker order', () => {
    assert.deepEqual(Object.keys(DISH_CATEGORY_NAMES), DISH_CATEGORY_ORDER);
    assert.equal(DISH_CATEGORY_NAMES.main, 'Main Dish');
  });
});
