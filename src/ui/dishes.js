// UI: dish category labels, the picker's category options, grouping for the
// dish chips, and the dish list filters.

import { DISH_CATEGORY_ORDER, DISH_CATEGORY_NAMES, DEFAULT_DISH_CATEGORY, categoryOfType } from '../../logic/dishes.js';
import { capitalize } from './format.js';

// A built-in category shows its built-in name; any other its capitalised name.
export function categoryLabel(category) {
  return DISH_CATEGORY_NAMES[category] ?? capitalize(category);
}

const isBuiltIn = (category) => DISH_CATEGORY_ORDER.includes(category);
const alphabetical = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// typeNames: the dish type names from the server.
// [{ value, label }]: the built-in order, then custom categories alphabetically.
export function dishCategoryOptions(typeNames) {
  const custom = [...new Set(typeNames.map(categoryOfType))]
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
