// UI: dish category labels, the picker's category options, grouping for the
// dish chips, and the dish list filters.

import { DISH_CATEGORY_ORDER, DEFAULT_DISH_CATEGORY } from '../../logic/dishes.js';
import { capitalize } from './format.js';

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

// A built-in category keeps its label; any other shows its capitalised name.
export function categoryLabel(category) {
  return CATEGORY_LABELS[category] ?? capitalize(category);
}

const isBuiltIn = (category) => DISH_CATEGORY_ORDER.includes(category);
const alphabetical = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// typeNames: the dish type names from the server.
// [{ value, label }]: the built-in order, then custom types lower-cased and alphabetical.
export function dishCategoryOptions(typeNames) {
  const custom = [...new Set(typeNames.map(n => n.trim().toLowerCase()))]
    .filter(c => c && !isBuiltIn(c))
    .sort(alphabetical);
  return [...DISH_CATEGORY_ORDER, ...custom].map(value => ({ value, label: categoryLabel(value) }));
}

// [{ category, label, dishes: [{ ...dish, index }] }]: every category a dish
// has, the built-in order first, then the others alphabetically.
export function groupDishes(dishes) {
  const grouped = {};
  dishes.forEach((dish, index) => {
    const category = dish.category || DEFAULT_DISH_CATEGORY;
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push({ ...dish, index });
  });
  const others = Object.keys(grouped).filter(c => !isBuiltIn(c)).sort(alphabetical);
  return [...DISH_CATEGORY_ORDER.filter(c => grouped[c]), ...others]
    .map(c => ({ category: c, label: categoryLabel(c), dishes: grouped[c] }));
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
