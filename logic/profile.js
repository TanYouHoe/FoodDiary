// Logic: builds a user's eating profile from their meal history.
// One row per (day of week, meal period) the user has eaten in.

import { getMealPeriod, getDayOfWeek } from './meal-period.js';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

const average = (values) => values.reduce((a, b) => a + b, 0) / values.length;

// meals: [{ visited_at, rating, restaurant_id, group_id, price_range }],
// sorted by visited_at ascending.
// Returns [{ day_of_week, meal_period, avg_price_range, adventure_ratio,
//            avg_rating_threshold, meal_frequency, group_ratio, total_meals }]
export function buildProfileRows(meals) {
  if (meals.length === 0) return [];

  // Weeks spanned by the whole history, minimum 1.
  const firstDate = new Date(meals[0].visited_at);
  const lastDate = new Date(meals[meals.length - 1].visited_at);
  const totalWeeks = Math.max(1, (lastDate - firstDate) / MS_PER_WEEK);

  const slots = new Map();
  for (const meal of meals) {
    const dow = getDayOfWeek(meal.visited_at);
    const period = getMealPeriod(meal.visited_at);
    const key = `${dow}|${period}`;
    if (!slots.has(key)) {
      slots.set(key, {
        day_of_week: dow,
        meal_period: period,
        restaurants: new Set(),
        priceRanges: [],
        ratings: [],
        groupCount: 0,
        totalMeals: 0,
      });
    }
    const slot = slots.get(key);
    slot.totalMeals++;
    slot.restaurants.add(meal.restaurant_id);
    if (meal.price_range != null) slot.priceRanges.push(meal.price_range);
    if (meal.rating != null) slot.ratings.push(meal.rating);
    if (meal.group_id != null) slot.groupCount++;
  }

  return [...slots.values()].map(slot => ({
    day_of_week: slot.day_of_week,
    meal_period: slot.meal_period,
    avg_price_range: slot.priceRanges.length > 0 ? average(slot.priceRanges) : null,
    adventure_ratio: slot.restaurants.size / slot.totalMeals,
    avg_rating_threshold: slot.ratings.length > 0 ? average(slot.ratings) : 0,
    meal_frequency: slot.totalMeals / totalWeeks,
    group_ratio: slot.groupCount / slot.totalMeals,
    total_meals: slot.totalMeals,
  }));
}
