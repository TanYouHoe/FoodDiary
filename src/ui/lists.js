// UI: shapes rows for the meal list, the planned list, the eating-pattern grid
// and the map info window.

import { MEAL_PERIODS } from '../../logic/meal-period.js';
import { stars, formatDateTimeOrRaw } from './format.js';

const nameIn = (restaurants, id) => restaurants.find(r => r.id === id);

export function toMealRows(meals, restaurants) {
  return meals.map(m => {
    const restaurantName = m.restaurant_name || nameIn(restaurants, m.restaurant_id)?.name || 'Unknown';
    return {
      meal: m,
      heading: m.title || restaurantName,
      subRestaurant: m.title ? restaurantName : null,
      stars: stars(m.rating),
      date: formatDateTimeOrRaw(m.visited_at),
      thumbs: m.photos.slice(0, 3),
      morePhotos: m.photos.length > 3 ? m.photos.length - 3 : 0,
    };
  });
}

export function priorityClass(priority) {
  if (priority === 'high') return 'badge-priority-high';
  if (priority === 'medium') return 'badge-priority-medium';
  return 'badge-priority-low';
}

export function toPlannedRows(planned, restaurants) {
  return planned.map(p => {
    const r = nameIn(restaurants, p.restaurant_id);
    return {
      ...p,
      name: p.restaurant_name || (r ? r.name : 'Unknown'),
      cuisine: p.cuisine_type || (r ? r.cuisine_type : null),
      priorityClass: priorityClass(p.priority),
    };
  });
}

export const PATTERN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const PATTERN_PERIOD_LABELS = ['Breakfast', 'Lunch', 'Tea', 'Dinner', 'Supper'];

// One row per weekday, one cell per meal period.
export function toPatternRows(profile) {
  return PATTERN_DAYS.map((day, dow) => ({
    day,
    dow,
    cells: MEAL_PERIODS.map(period => {
      const row = profile.find(p => p.day_of_week === dow && p.meal_period === period);
      if (!row) return { period, empty: true };
      const adventure = Math.round(row.adventure_ratio * 100);
      return {
        period,
        empty: false,
        meals: row.total_meals,
        price: '$'.repeat(Math.round(row.avg_price_range || 0)),
        adventure,
        stars: stars(row.avg_rating_threshold),
      };
    }),
  }));
}

// A map marker's info window as plain text lines: [{ text, strong }].
// The caller sets each line as text, never as HTML.
export function infoWindowLines(r) {
  return [
    { text: r.name, strong: true },
    ...(r.cuisine_type ? [{ text: r.cuisine_type, strong: false }] : []),
    ...(r.address ? [{ text: r.address, strong: false }] : []),
  ];
}
