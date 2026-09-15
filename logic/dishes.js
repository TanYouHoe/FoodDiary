// Logic: dish names and dish categories.

export const DEFAULT_DISH_CATEGORY = 'main';

// The built-in categories and their names, in the picker's display order.
export const DISH_CATEGORY_NAMES = {
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

export const DISH_CATEGORY_ORDER = Object.keys(DISH_CATEGORY_NAMES);

// The category a dish type name stands for. The one home of this mapping.
export function categoryOfType(typeName) {
  return typeName.trim().toLowerCase();
}

// A dish takes the first dish type whose name appears in the dish name.
// typeNames: dish type names in the order to try them. A blank name matches nothing.
export function categorizeDish(dishName, typeNames) {
  const lower = dishName.toLowerCase().trim();
  for (const typeName of typeNames) {
    const category = categoryOfType(typeName);
    if (category && lower.includes(category)) return category;
  }
  return DEFAULT_DISH_CATEGORY;
}

// A meal's dishes as sent by a client: strings or { name, category }.
// Drops blank names and any other entry (null, a number, ...); fills a missing
// category from the dish types.
export function normalizeMealDishes(dishes, typeNames) {
  const out = [];
  for (const dish of dishes) {
    const name = typeof dish === 'string' ? dish.trim()
      : (dish && typeof dish === 'object' && typeof dish.name === 'string') ? dish.name.trim()
        : '';
    if (!name) continue;
    const category = (typeof dish === 'object' && dish.category) ? dish.category : categorizeDish(name, typeNames);
    out.push({ name, category });
  }
  return out;
}

// Adds a dish to an edit list. Returns the same list for a blank or repeated name.
export function addDish(dishes, name, category) {
  const trimmed = name.trim();
  if (!trimmed) return dishes;
  if (dishes.some(d => d.name === trimmed)) return dishes;
  return [...dishes, { name: trimmed, category }];
}

export function moveDish(dishes, index, category) {
  if (dishes[index].category === category) return dishes;
  return dishes.map((d, i) => (i === index ? { ...d, category } : d));
}

// A saved meal's dishes as an edit list.
export function toEditableDishes(dishes) {
  if (!Array.isArray(dishes)) return [];
  return dishes.map(d => (typeof d === 'object'
    ? { name: d.name, category: d.category || DEFAULT_DISH_CATEGORY }
    : { name: d, category: DEFAULT_DISH_CATEGORY }));
}
