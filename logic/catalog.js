// Logic: the meal-type and dish-type catalogues. The built-in entries, the
// input rules, and the rule that built-in entries are read-only.

import { categoryOfType, DISH_CATEGORY_ORDER, DISH_CATEGORY_NAMES } from './dishes.js';

const slots = (...names) => names.map(name => ({ name }));

export const SEED_MEAL_TYPES = [
  { name: 'Chinese Traditional', cuisine_type: 'Chinese', slots: slots('Soup', 'Rice', 'Main', 'Side', 'Side') },
  { name: 'Chinese Noodle Set', cuisine_type: 'Chinese', slots: slots('Noodle', 'Main', 'Side', 'Drink') },
  { name: 'Western Set', cuisine_type: 'Western', slots: slots('Main', 'Side', 'Side', 'Drink') },
  { name: 'Western Fine Dining', cuisine_type: 'Western', slots: slots('Appetizer', 'Soup', 'Main', 'Dessert') },
  { name: 'Japanese Teishoku', cuisine_type: 'Japanese', slots: slots('Soup', 'Rice', 'Main', 'Side') },
  { name: 'Japanese Bento', cuisine_type: 'Japanese', slots: slots('Rice', 'Main', 'Side', 'Side', 'Side') },
  { name: 'Malay Nasi Set', cuisine_type: 'Malay', slots: slots('Rice', 'Main', 'Side', 'Side', 'Drink') },
  { name: 'Korean Set', cuisine_type: 'Korean', slots: slots('Soup', 'Rice', 'Main', 'Side', 'Side', 'Side') },
  { name: 'Thai Set', cuisine_type: 'Thai', slots: slots('Soup', 'Rice', 'Main', 'Side') },
  { name: 'Italian Course', cuisine_type: 'Italian', slots: slots('Appetizer', 'Noodle', 'Main', 'Dessert') },
  { name: 'Indian Thali', cuisine_type: 'Indian', slots: slots('Bread', 'Main', 'Main', 'Side', 'Side', 'Side') },
  { name: 'Simple Meal', cuisine_type: null, slots: slots('Main', 'Side', 'Drink') },
];

export const SEED_DISH_TYPE_NAMES = ['Soup', 'Rice', 'Noodle', 'Bread', 'Main', 'Side', 'Dessert', 'Drink', 'Appetizer'];

// kind: 'meal' | 'dish'; action: 'edit' | 'delete'. Returns an error or null.
export function builtInLockError(entry, kind, action) {
  return entry.is_seed ? `Cannot ${action} built-in ${kind} types` : null;
}

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

// A meal type needs a name and at least one named slot. Blank slots are dropped.
export function checkMealTypeInput(body) {
  const { name, cuisine_type, slots: slotList } = body;
  const cleanName = trimmed(name);
  if (!cleanName) return { ok: false, error: 'Name is required' };
  const cleanSlots = (Array.isArray(slotList) ? slotList : [])
    .map(slot => trimmed(slot?.name))
    .filter(Boolean)
    .map(slotName => ({ name: slotName }));
  if (cleanSlots.length === 0) return { ok: false, error: 'Add at least one slot' };
  return { ok: true, value: { name: cleanName, cuisine_type: cuisine_type || null, slots: cleanSlots } };
}

export const BUILT_IN_DISH_TYPE_NAME = 'That name is already a built-in dish type';

// A custom dish type may not stand for a built-in category ("main", "SOUP")
// or repeat a built-in name ("Main Dish"), in any case.
function isBuiltInDishTypeName(name) {
  const category = categoryOfType(name);
  return DISH_CATEGORY_ORDER.includes(category)
    || Object.values(DISH_CATEGORY_NAMES).some(builtIn => categoryOfType(builtIn) === category);
}

export function checkDishTypeInput(body) {
  const name = trimmed(body.name);
  if (!name) return { ok: false, error: 'Name is required' };
  if (isBuiltInDishTypeName(name)) return { ok: false, error: BUILT_IN_DISH_TYPE_NAME };
  return { ok: true, value: { name } };
}

// The add / edit meal type dialog: maps the form to the API body and asks the
// same rule the server asks.
export function checkMealTypeForm({ name, cuisineType, slots: slotList }) {
  return checkMealTypeInput({ name, cuisine_type: cuisineType, slots: slotList });
}

export function checkDishTypeForm(name) {
  return checkDishTypeInput({ name });
}
