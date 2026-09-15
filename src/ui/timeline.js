// UI: shapes meals into the dashboard timeline, with a date separator before
// the first meal of each local day.

import { dateKey, formatDateLabel, timeAgo, stars } from './format.js';

// [{ kind: 'date', key, label } | { kind: 'meal', key, meal, heading, time, stars }]
export function toTimelineItems(meals, now) {
  const items = [];
  let lastKey = null;
  for (const meal of meals) {
    const key = dateKey(meal.visited_at);
    if (key !== lastKey) {
      items.push({ kind: 'date', key: `date-${key}`, label: formatDateLabel(meal.visited_at, now) });
      lastKey = key;
    }
    items.push({
      kind: 'meal',
      key: meal.id,
      meal,
      heading: meal.title || meal.restaurant_name,
      time: timeAgo(meal.visited_at, now),
      stars: stars(meal.rating),
    });
  }
  return items;
}
