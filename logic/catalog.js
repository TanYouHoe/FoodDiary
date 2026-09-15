// Logic: the meal-type and dish-type catalogues. The built-in entries, the
// input rules, and the rule that built-in entries are read-only.

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

export function checkMealTypeInput(body) {
  const { name, cuisine_type, slots: slotList } = body;
  if (!name || !slotList) return { ok: false, error: 'Name and slots required' };
  return { ok: true, value: { name, cuisine_type: cuisine_type || null, slots: slotList } };
}

export function checkDishTypeInput(body) {
  const { name } = body;
  if (!name) return { ok: false, error: 'Name is required' };
  return { ok: true, value: { name: name.trim() } };
}

// The form in the add / edit meal type dialog. Returns an error or the body.
export function checkMealTypeForm({ name, cuisineType, slots: slotList }) {
  if (!name.trim()) return { ok: false, error: 'Name is required' };
  const validSlots = slotList.filter(s => s.name.trim());
  if (validSlots.length === 0) return { ok: false, error: 'Add at least one slot' };
  return {
    ok: true,
    value: {
      name: name.trim(),
      cuisine_type: cuisineType || null,
      slots: validSlots.map(s => ({ name: s.name.trim() })),
    },
  };
}

export function checkDishTypeForm(name) {
  if (!name.trim()) return { ok: false, error: 'Name is required' };
  return { ok: true, value: { name: name.trim() } };
}
