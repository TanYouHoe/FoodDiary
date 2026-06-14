import { getMealPeriod } from './profile.js';

const WEIGHTS = {
  recency: 0.35,
  rating: 0.30,
  variety: 0.20,
  frequency: 0.15,
};

const PLANNED_BONUS = { high: 0.3, medium: 0.2, low: 0.1 };
const RECENCY_CAP_DAYS = 30;

export function scoreRestaurant(data, today) {
  const {
    lastVisitedAt, avgRating, recentCuisines, cuisine_type,
    visitCount, maxVisitCount, plannedPriority,
  } = data;

  // Recency: days since last visit / 30, capped at 1.0. Never visited = 1.0
  let recency = 1.0;
  if (lastVisitedAt) {
    const daysSince = Math.floor((new Date(today) - new Date(lastVisitedAt)) / 86400000);
    recency = Math.min(daysSince / RECENCY_CAP_DAYS, 1.0);
  }

  // Rating: avg / 5
  const rating = (avgRating || 0) / 5;

  // Variety: 1.0 if cuisine not in last 3 meals, 0 otherwise
  const variety = (!cuisine_type || recentCuisines.includes(cuisine_type)) ? 0 : 1.0;

  // Frequency: visitCount / maxVisitCount (proven favorites)
  const frequency = maxVisitCount > 0 ? (visitCount / maxVisitCount) : 0;

  // Planned bonus
  const planned = PLANNED_BONUS[plannedPriority] || 0;

  const total =
    recency * WEIGHTS.recency +
    rating * WEIGHTS.rating +
    variety * WEIGHTS.variety +
    frequency * WEIGHTS.frequency +
    planned;

  return { recency, rating, variety, frequency, planned, total };
}

export function generateExplanation(scores, data) {
  const parts = [];

  if (data.lastVisitedAt) {
    const daysSince = Math.floor((Date.now() - new Date(data.lastVisitedAt).getTime()) / 86400000);
    if (daysSince >= 7) parts.push(`Haven't been in ${daysSince} days`);
  } else {
    parts.push('Never tried before');
  }

  if (data.avgRating >= 4) parts.push(`Rated ${data.avgRating.toFixed(1)} stars`);
  if (scores.variety === 1.0) parts.push('Different from your recent meals');
  if (data.plannedPriority) parts.push(`On your planned list (${data.plannedPriority} priority)`);
  if (scores.frequency >= 0.5) parts.push('A proven favorite');

  return parts.join(' + ') || 'Worth checking out';
}

export function getSuggestions(db, { userId, groupId, cuisine, priceRange, today }) {
  const dateStr = today || new Date().toISOString().slice(0, 10);

  // Get restaurants with filters
  let sql = 'SELECT * FROM restaurants WHERE 1=1';
  const params = [];
  if (cuisine) { sql += ' AND cuisine_type = ?'; params.push(cuisine); }
  if (priceRange) { sql += ' AND price_range = ?'; params.push(Number(priceRange)); }
  const restaurants = db.prepare(sql).all(...params);

  if (restaurants.length === 0) return [];

  // Get recent 3 cuisine types for variety scoring
  const mealFilter = groupId
    ? 'WHERE m.group_id = ?'
    : 'WHERE m.user_id = ? AND m.group_id IS NULL';
  const filterParam = groupId || userId;

  const recentCuisines = db.prepare(`
    SELECT r.cuisine_type FROM meals m
    JOIN restaurants r ON r.id = m.restaurant_id
    ${mealFilter}
    ORDER BY m.visited_at DESC LIMIT 3
  `).all(filterParam).map(r => r.cuisine_type);

  // Get max visit count for frequency normalization
  const maxRow = db.prepare(`
    SELECT MAX(cnt) as max_count FROM (
      SELECT COUNT(*) as cnt FROM meals m
      ${mealFilter}
      GROUP BY m.restaurant_id
    )
  `).get(filterParam);
  const maxVisitCount = maxRow?.max_count || 0;

  // Score each restaurant
  const scored = restaurants.map(r => {
    const lastVisit = db.prepare(`
      SELECT visited_at FROM meals m
      ${mealFilter} AND m.restaurant_id = ?
      ORDER BY m.visited_at DESC LIMIT 1
    `).get(filterParam, r.id);

    const avgRow = db.prepare(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as visit_count FROM meals m
      ${mealFilter} AND m.restaurant_id = ?
    `).get(filterParam, r.id);

    const planned = db.prepare(`
      SELECT priority FROM planned_visits
      WHERE restaurant_id = ? AND (user_id = ? ${groupId ? 'OR group_id = ?' : ''})
      ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END
      LIMIT 1
    `).get(...[r.id, userId, ...(groupId ? [groupId] : [])]);

    const scores = scoreRestaurant({
      lastVisitedAt: lastVisit?.visited_at || null,
      avgRating: avgRow?.avg_rating || 0,
      recentCuisines,
      cuisine_type: r.cuisine_type,
      visitCount: avgRow?.visit_count || 0,
      maxVisitCount,
      plannedPriority: planned?.priority || null,
    }, dateStr);

    const explanation = generateExplanation(scores, {
      lastVisitedAt: lastVisit?.visited_at || null,
      avgRating: avgRow?.avg_rating || 0,
      plannedPriority: planned?.priority || null,
    });

    return { ...r, scores, explanation };
  });

  // Sort by total score descending, return top 3
  scored.sort((a, b) => b.scores.total - a.scores.total);
  return scored.slice(0, 3);
}

/**
 * Profile-driven meal suggestion algorithm.
 *
 * Uses user_meal_profiles to understand behavior patterns, then blends
 * familiar favorites with adventurous new options based on the user's
 * adventure_ratio for the current day-of-week + meal period.
 */
export function suggestMeal(db, { userId, groupId, cuisine, priceRange, mealTypeId, now }) {
  // 1. Determine context
  const currentDate = now || new Date();
  const dayOfWeek = currentDate.getDay(); // 0=Sun
  const mealPeriod = getMealPeriod(currentDate.toISOString());
  const today = currentDate.toISOString().slice(0, 10);

  // 2. Look up profile for this user + day + period
  const profile = db.prepare(
    'SELECT * FROM user_meal_profiles WHERE user_id = ? AND day_of_week = ? AND meal_period = ?'
  ).get(userId, dayOfWeek, mealPeriod);

  // 3. Compute confidence — how much to trust the profile
  const confidence = profile ? Math.min(profile.total_meals / 20, 1.0) : 0;

  // 4. Determine adventure ratio (default 0.5 if no profile)
  const adventureRatio = profile ? profile.adventure_ratio : 0.5;

  // 5. If confidence is 0, fall back entirely to general scoring
  if (confidence === 0) {
    const fallback = getSuggestions(db, { userId, groupId, cuisine, priceRange, today });
    return fallback.slice(0, 3).map((r, i) => ({
      ...r,
      suggestion_type: 'new',
      is_top_pick: i === 0,
    }));
  }

  // 6. For each of 3 suggestion slots, roll familiar vs new
  const slots = [0, 1, 2].map(() => Math.random() < adventureRatio ? 'new' : 'familiar');

  // 7. Determine effective price range — user filter overrides profile
  const effectivePrice = priceRange || (profile ? Math.round(profile.avg_price_range) : null);

  // 8. Fill familiar slots — top-visited restaurants for this user
  const familiarPool = _getFamiliarPool(db, { userId, groupId, cuisine, effectivePrice, mealPeriod, today });

  // 9. Fill new slots — planned visits, never visited, not visited in 30+ days
  const newPool = _getNewPool(db, { userId, groupId, cuisine, effectivePrice, mealPeriod, today });

  // 10. Assemble results
  const results = [];
  const usedIds = new Set();
  let familiarIdx = 0;
  let newIdx = 0;

  for (const slotType of slots) {
    if (results.length >= 3) break;

    let picked = null;
    if (slotType === 'familiar') {
      while (familiarIdx < familiarPool.length) {
        const candidate = familiarPool[familiarIdx++];
        if (!usedIds.has(candidate.id)) { picked = candidate; break; }
      }
    } else {
      while (newIdx < newPool.length) {
        const candidate = newPool[newIdx++];
        if (!usedIds.has(candidate.id)) { picked = candidate; break; }
      }
    }

    // Cross-fill: if one pool is exhausted, take from the other
    if (!picked && slotType === 'familiar') {
      while (newIdx < newPool.length) {
        const candidate = newPool[newIdx++];
        if (!usedIds.has(candidate.id)) { picked = candidate; break; }
      }
    } else if (!picked && slotType === 'new') {
      while (familiarIdx < familiarPool.length) {
        const candidate = familiarPool[familiarIdx++];
        if (!usedIds.has(candidate.id)) { picked = candidate; break; }
      }
    }

    if (picked) {
      usedIds.add(picked.id);
      results.push({
        ...picked,
        suggestion_type: slotType,
        is_top_pick: results.length === 0,
      });
    }
  }

  // 11. Blend with fallback when confidence is low and we have fewer than 3
  if (results.length < 3) {
    const fallback = getSuggestions(db, { userId, groupId, cuisine, priceRange, today });
    for (const r of fallback) {
      if (results.length >= 3) break;
      if (usedIds.has(r.id)) continue;
      usedIds.add(r.id);
      results.push({
        ...r,
        suggestion_type: 'new',
        is_top_pick: results.length === 0,
      });
    }
  }

  return results;
}

/**
 * Get familiar restaurants — top-visited by user, ranked by visit_count + rating.
 * Excludes restaurants visited in the same meal_period within last 2 days.
 */
function _getFamiliarPool(db, { userId, groupId, cuisine, effectivePrice, mealPeriod, today }) {
  let sql = `
    SELECT r.*, COUNT(m.id) as visit_count, AVG(m.rating) as avg_rating
    FROM restaurants r
    JOIN meals m ON m.restaurant_id = r.id
    WHERE m.user_id = ?
  `;
  const params = [userId];

  if (cuisine) { sql += ' AND r.cuisine_type = ?'; params.push(cuisine); }
  if (effectivePrice) { sql += ' AND r.price_range = ?'; params.push(Number(effectivePrice)); }

  sql += ' GROUP BY r.id ORDER BY visit_count DESC, avg_rating DESC';

  const candidates = db.prepare(sql).all(...params);

  // Filter out restaurants visited in same meal_period within last 2 days
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const cutoff = twoDaysAgo.toISOString();

  return candidates.filter(r => {
    const recent = db.prepare(`
      SELECT m.visited_at FROM meals m
      WHERE m.user_id = ? AND m.restaurant_id = ? AND m.visited_at >= ?
    `).all(userId, r.id, cutoff);

    // Check if any of those recent meals fall in the same meal period
    return !recent.some(row => getMealPeriod(row.visited_at) === mealPeriod);
  });
}

/**
 * Get "new" restaurant pool for adventurous slots.
 * Priority order:
 *   a. Planned visits (high priority first)
 *   b. Never visited restaurants
 *   c. Not visited in 30+ days
 *   d. Different cuisine from user's most common
 */
function _getNewPool(db, { userId, groupId, cuisine, effectivePrice, mealPeriod, today }) {
  const results = [];
  const seenIds = new Set();

  // Helper: build WHERE clauses for cuisine/price filters
  const filterClause = (prefix) => {
    let clause = '';
    const p = [];
    if (cuisine) { clause += ` AND ${prefix}cuisine_type = ?`; p.push(cuisine); }
    if (effectivePrice) { clause += ` AND ${prefix}price_range = ?`; p.push(Number(effectivePrice)); }
    return { clause, params: p };
  };

  // a. Planned visits (high priority first)
  {
    const f = filterClause('r.');
    let sql = `
      SELECT r.*, pv.priority FROM planned_visits pv
      JOIN restaurants r ON r.id = pv.restaurant_id
      WHERE pv.user_id = ?${f.clause}
      ORDER BY CASE pv.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END
    `;
    const planned = db.prepare(sql).all(userId, ...f.params);
    for (const r of planned) {
      if (!seenIds.has(r.id)) { seenIds.add(r.id); results.push(r); }
    }
  }

  // b. Never visited restaurants
  {
    const f = filterClause('r.');
    let sql = `
      SELECT r.* FROM restaurants r
      WHERE r.id NOT IN (SELECT DISTINCT restaurant_id FROM meals WHERE user_id = ?)
      ${f.clause}
    `;
    const never = db.prepare(sql).all(userId, ...f.params);
    for (const r of never) {
      if (!seenIds.has(r.id)) { seenIds.add(r.id); results.push(r); }
    }
  }

  // c. Not visited in 30+ days
  {
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff30 = thirtyDaysAgo.toISOString().slice(0, 10);

    const f = filterClause('r.');
    let sql = `
      SELECT r.*, MAX(m.visited_at) as last_visit FROM restaurants r
      JOIN meals m ON m.restaurant_id = r.id
      WHERE m.user_id = ?${f.clause}
      GROUP BY r.id
      HAVING MAX(m.visited_at) < ?
      ORDER BY last_visit ASC
    `;
    const stale = db.prepare(sql).all(userId, ...f.params, cutoff30);
    for (const r of stale) {
      if (!seenIds.has(r.id)) { seenIds.add(r.id); results.push(r); }
    }
  }

  // d. Different cuisine from user's most common for this period
  {
    const topCuisine = db.prepare(`
      SELECT r.cuisine_type, COUNT(*) as cnt FROM meals m
      JOIN restaurants r ON r.id = m.restaurant_id
      WHERE m.user_id = ?
      GROUP BY r.cuisine_type ORDER BY cnt DESC LIMIT 1
    `).get(userId);

    if (topCuisine && !cuisine) {
      const f = filterClause('r.');
      let sql = `
        SELECT r.* FROM restaurants r
        WHERE r.cuisine_type != ?${f.clause}
      `;
      const diff = db.prepare(sql).all(topCuisine.cuisine_type, ...f.params);
      for (const r of diff) {
        if (!seenIds.has(r.id)) { seenIds.add(r.id); results.push(r); }
      }
    }
  }

  return results;
}
