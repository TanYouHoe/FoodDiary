// UI: dish category labels, grouping for the dish chips, and the dish list filters.

import { DISH_CATEGORY_ORDER, DEFAULT_DISH_CATEGORY } from '../../logic/dishes.js';

export const CATEGORY_LABELS = {
  main: 'Main Dish',
  side: 'Side',
  soup: 'Soup',
  rice: 'Rice',
  noodle: 'Noodle',
  bread: 'Bread',
  appetizer: 'Appetizer',
  dessert: 'Dessert',
  drink: 'Drink',
};

export const CATEGORY_OPTIONS = DISH_CATEGORY_ORDER.map(value => ({ value, label: CATEGORY_LABELS[value] }));

// [{ category, label, dishes: [{ ...dish, index }] }] in picker order.
// A category outside the picker's list is not shown.
export function groupDishes(dishes) {
  const grouped = {};
  dishes.forEach((dish, index) => {
    const category = dish.category || DEFAULT_DISH_CATEGORY;
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push({ ...dish, index });
  });
  return DISH_CATEGORY_ORDER
    .filter(c => grouped[c])
    .map(c => ({ category: c, label: CATEGORY_LABELS[c], dishes: grouped[c] }));
}

export function dishCategories(dishes) {
  return [...new Set(dishes.map(d => d.category).filter(Boolean))].sort();
}

export function filterDishes(dishes, search, category) {
  return dishes.filter(d => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (category && d.category !== category) return false;
    return true;
  });
}
