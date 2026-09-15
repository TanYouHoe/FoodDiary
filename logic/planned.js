// Logic: planned visits and their priority.

// Highest first. The index is the sort rank.
export const PRIORITIES = ['high', 'medium', 'low'];
export const DEFAULT_PRIORITY = 'medium';

export function priorityRank(priority) {
  const i = PRIORITIES.indexOf(priority);
  return i === -1 ? PRIORITIES.length - 1 : i;
}

export function sortByPriority(items) {
  return [...items].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

// The add-to-planned form. groupId: the group the page shows, or ''.
export function checkPlannedForm({ restaurantId, priority, notes }, groupId) {
  if (!restaurantId) return { ok: false, error: 'Please select a restaurant' };
  const value = { restaurant_id: Number(restaurantId), priority, notes: notes.trim() || null };
  if (groupId) value.group_id = Number(groupId);
  return { ok: true, value };
}

export function checkPlannedInput(body) {
  const { restaurant_id, group_id, priority, notes } = body;
  if (!restaurant_id) return { ok: false, error: 'Restaurant required' };
  return {
    ok: true,
    value: {
      restaurant_id,
      group_id: group_id || null,
      priority: priority || DEFAULT_PRIORITY,
      notes: notes || null,
    },
  };
}
