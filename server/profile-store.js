// Connector: reads a user's meals, has logic/profile.js build the profile,
// and replaces the user's rows in user_meal_profiles.

import { buildProfileRows } from '../logic/profile.js';
import { pick, PROFILE_FIELDS } from './rows.js';

export function rebuildProfile(db, userId) {
  const meals = db.prepare(`
    SELECT m.visited_at, m.rating, m.restaurant_id, m.group_id, r.price_range
    FROM meals m
    JOIN restaurants r ON r.id = m.restaurant_id
    WHERE m.user_id = ?
    ORDER BY m.visited_at
  `).all(userId).map(row => ({
    visited_at: row.visited_at,
    rating: row.rating,
    restaurant_id: row.restaurant_id,
    group_id: row.group_id,
    price_range: row.price_range,
  }));

  const rows = buildProfileRows(meals);
  const remove = db.prepare('DELETE FROM user_meal_profiles WHERE user_id = ?');
  const insert = db.prepare(`
    INSERT INTO user_meal_profiles
      (user_id, day_of_week, meal_period, avg_price_range, adventure_ratio,
       avg_rating_threshold, meal_frequency, group_ratio, total_meals)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    remove.run(userId);
    for (const p of rows) {
      insert.run(userId, p.day_of_week, p.meal_period, p.avg_price_range, p.adventure_ratio,
        p.avg_rating_threshold, p.meal_frequency, p.group_ratio, p.total_meals);
    }
  })();
}

export function listProfile(db, userId) {
  return db.prepare('SELECT * FROM user_meal_profiles WHERE user_id = ? ORDER BY day_of_week, meal_period')
    .all(userId).map(row => pick(row, PROFILE_FIELDS));
}

export function findProfile(db, userId, dayOfWeek, mealPeriod) {
  const row = db.prepare('SELECT * FROM user_meal_profiles WHERE user_id = ? AND day_of_week = ? AND meal_period = ?')
    .get(userId, dayOfWeek, mealPeriod);
  return row ? pick(row, PROFILE_FIELDS) : null;
}
