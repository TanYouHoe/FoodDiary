/**
 * User meal profile builder.
 *
 * getMealPeriod  – derives a meal-period label from a timestamp
 * rebuildProfile – recomputes user_meal_profiles from the meals table
 */

/**
 * Return the meal period for a given visited_at timestamp.
 *
 * breakfast : hour < 11
 * lunch     : 11 <= hour < 15
 * tea       : 15 <= hour < 17
 * dinner    : 17 <= hour < 21
 * supper    : hour >= 21
 *
 * @param {string} visitedAt  ISO-ish datetime string
 * @returns {string}
 */
export function getMealPeriod(visitedAt) {
  const hour = new Date(visitedAt).getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 17) return 'tea';
  if (hour < 21) return 'dinner';
  return 'supper';
}

/**
 * Rebuild the user_meal_profiles table for a single user.
 *
 * 1. Deletes existing profile rows for this user.
 * 2. Queries ALL meals for this user (with restaurant price_range).
 * 3. Groups by (day_of_week, meal_period).
 * 4. Computes metrics per slot and inserts into user_meal_profiles.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} userId
 */
export function rebuildProfile(db, userId) {
  // 1. Clear existing profile rows
  db.prepare('DELETE FROM user_meal_profiles WHERE user_id = ?').run(userId);

  // 2. Fetch all meals for this user with restaurant price_range
  const meals = db.prepare(`
    SELECT m.id, m.visited_at, m.rating, m.restaurant_id, m.group_id,
           r.price_range
    FROM meals m
    JOIN restaurants r ON r.id = m.restaurant_id
    WHERE m.user_id = ?
    ORDER BY m.visited_at
  `).all(userId);

  if (meals.length === 0) return;

  // Compute the total weeks spanned by the user's meals (minimum 1)
  const firstDate = new Date(meals[0].visited_at);
  const lastDate = new Date(meals[meals.length - 1].visited_at);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const totalWeeks = Math.max(1, (lastDate - firstDate) / msPerWeek);

  // 3. Group by (day_of_week, meal_period)
  const slots = new Map(); // key: "dow|period"

  for (const meal of meals) {
    const dt = new Date(meal.visited_at);
    const dow = dt.getDay(); // 0=Sun .. 6=Sat
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

  // 4. Insert one row per slot
  const insert = db.prepare(`
    INSERT INTO user_meal_profiles
      (user_id, day_of_week, meal_period, avg_price_range, adventure_ratio,
       avg_rating_threshold, meal_frequency, group_ratio, total_meals)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (const slot of slots.values()) {
      const adventureRatio = slot.restaurants.size / slot.totalMeals;
      const avgPrice = slot.priceRanges.length > 0
        ? slot.priceRanges.reduce((a, b) => a + b, 0) / slot.priceRanges.length
        : null;
      const avgRating = slot.ratings.length > 0
        ? slot.ratings.reduce((a, b) => a + b, 0) / slot.ratings.length
        : 0;
      const mealFrequency = slot.totalMeals / totalWeeks;
      const groupRatio = slot.groupCount / slot.totalMeals;

      insert.run(
        userId,
        slot.day_of_week,
        slot.meal_period,
        avgPrice,
        adventureRatio,
        avgRating,
        mealFrequency,
        groupRatio,
        slot.totalMeals,
      );
    }
  });

  insertAll();
}
