// Connector: reads what the recommendation engine needs from the database and
// hands it to logic/suggest.js. Every decision is made there.
//
// now: Date. rng: () => number in [0, 1). timeZone: the request's IANA zone.

import {
  rankRestaurants, mealContext, profileConfidence, profileAdventureRatio, rollSlotTypes,
  effectivePriceRange, familiarCutoff, staleCutoff, excludeRecentlyEaten, wantsOtherCuisines,
  mergeByPriority, tagAsNew, assembleMealSuggestions, needsTopUp, topUpSuggestions,
  RECENT_CUISINE_COUNT,
} from '../logic/suggest.js';
import { findProfile } from './profile-store.js';
import { priorityOrderSql } from './sql.js';
import { pick, RESTAURANT_FIELDS } from './rows.js';

const toRestaurant = (row) => pick(row, RESTAURANT_FIELDS);

function restaurantFilter(cuisine, priceRange) {
  let clause = '';
  const params = [];
  if (cuisine) { clause += ' AND r.cuisine_type = ?'; params.push(cuisine); }
  if (priceRange) { clause += ' AND r.price_range = ?'; params.push(Number(priceRange)); }
  return { clause, params };
}

// Restaurant scorer: top restaurants with scores and an explanation.
export function getSuggestions(db, { userId, groupId, cuisine, priceRange, now, timeZone }) {
  const f = restaurantFilter(cuisine, priceRange);
  const restaurants = db.prepare(`SELECT * FROM restaurants r WHERE 1=1${f.clause}`).all(...f.params).map(toRestaurant);
  if (restaurants.length === 0) return [];

  // A group's history, or the user's personal (non-group) history.
  const mealFilter = groupId ? 'WHERE m.group_id = ?' : 'WHERE m.user_id = ? AND m.group_id IS NULL';
  const filterParam = groupId || userId;

  const recentCuisines = db.prepare(`
    SELECT r.cuisine_type FROM meals m
    JOIN restaurants r ON r.id = m.restaurant_id
    ${mealFilter}
    ORDER BY m.visited_at DESC LIMIT ${RECENT_CUISINE_COUNT}
  `).all(filterParam).map(r => r.cuisine_type);

  const maxRow = db.prepare(`
    SELECT MAX(cnt) as max_count FROM (
      SELECT COUNT(*) as cnt FROM meals m
      ${mealFilter}
      GROUP BY m.restaurant_id
    )
  `).get(filterParam);

  const lastVisit = db.prepare(`
    SELECT visited_at FROM meals m
    ${mealFilter} AND m.restaurant_id = ?
    ORDER BY m.visited_at DESC LIMIT 1
  `);
  const visits = db.prepare(`
    SELECT AVG(rating) as avg_rating, COUNT(*) as visit_count FROM meals m
    ${mealFilter} AND m.restaurant_id = ?
  `);
  const planned = db.prepare(`
    SELECT priority FROM planned_visits
    WHERE restaurant_id = ? AND (user_id = ? ${groupId ? 'OR group_id = ?' : ''})
    ORDER BY ${priorityOrderSql('priority')}
    LIMIT 1
  `);

  const candidates = restaurants.map(r => {
    const last = lastVisit.get(filterParam, r.id);
    const v = visits.get(filterParam, r.id);
    const p = planned.get(...[r.id, userId, ...(groupId ? [groupId] : [])]);
    return {
      restaurant: r,
      lastVisitedAt: last?.visited_at || null,
      avgRating: v?.avg_rating || 0,
      visitCount: v?.visit_count || 0,
      plannedPriority: p?.priority || null,
    };
  });

  return rankRestaurants(candidates, {
    recentCuisines,
    maxVisitCount: maxRow?.max_count || 0,
    today: mealContext(now, timeZone).today,
    now: now.getTime(),
  });
}

// Profile-driven meal suggester.
export function suggestMeal(db, { userId, groupId, cuisine, priceRange, now, rng, timeZone }) {
  const { dayOfWeek, mealPeriod, today } = mealContext(now, timeZone);
  const profile = findProfile(db, userId, dayOfWeek, mealPeriod);
  const scorerPicks = () => getSuggestions(db, { userId, groupId, cuisine, priceRange, now, timeZone });

  if (profileConfidence(profile) === 0) return tagAsNew(scorerPicks());

  const slotTypes = rollSlotTypes(profileAdventureRatio(profile), rng);
  const price = effectivePriceRange(priceRange, profile);
  const familiar = familiarPool(db, { userId, cuisine, price, mealPeriod, today, timeZone });
  const fresh = newPool(db, { userId, cuisine, price, today });

  const results = assembleMealSuggestions(slotTypes, familiar, fresh);
  return needsTopUp(results) ? topUpSuggestions(results, scorerPicks()) : results;
}

// The user's most visited restaurants, minus any eaten this meal period lately.
function familiarPool(db, { userId, cuisine, price, mealPeriod, today, timeZone }) {
  const f = restaurantFilter(cuisine, price);
  const candidates = db.prepare(`
    SELECT r.*, COUNT(m.id) as visit_count, AVG(m.rating) as avg_rating
    FROM restaurants r
    JOIN meals m ON m.restaurant_id = r.id
    WHERE m.user_id = ?${f.clause}
    GROUP BY r.id ORDER BY visit_count DESC, avg_rating DESC
  `).all(userId, ...f.params).map(row => ({ ...toRestaurant(row), visit_count: row.visit_count, avg_rating: row.avg_rating }));

  const cutoff = familiarCutoff(today, timeZone);
  const recent = db.prepare('SELECT m.visited_at FROM meals m WHERE m.user_id = ? AND m.restaurant_id = ? AND m.visited_at >= ?');
  const recentVisits = new Map(candidates.map(r => [r.id, recent.all(userId, r.id, cutoff).map(row => row.visited_at)]));

  return excludeRecentlyEaten(candidates, recentVisits, mealPeriod, timeZone);
}

// Places to try, in priority order: planned, never visited, not visited
// lately, then other cuisines than the user's usual one.
function newPool(db, { userId, cuisine, price, today }) {
  const f = restaurantFilter(cuisine, price);

  const planned = db.prepare(`
    SELECT r.*, pv.priority FROM planned_visits pv
    JOIN restaurants r ON r.id = pv.restaurant_id
    WHERE pv.user_id = ?${f.clause}
    ORDER BY ${priorityOrderSql('pv.priority')}
  `).all(userId, ...f.params).map(row => ({ ...toRestaurant(row), priority: row.priority }));

  const neverVisited = db.prepare(`
    SELECT r.* FROM restaurants r
    WHERE r.id NOT IN (SELECT DISTINCT restaurant_id FROM meals WHERE user_id = ?)
    ${f.clause}
  `).all(userId, ...f.params).map(toRestaurant);

  const notLately = db.prepare(`
    SELECT r.*, MAX(m.visited_at) as last_visit FROM restaurants r
    JOIN meals m ON m.restaurant_id = r.id
    WHERE m.user_id = ?${f.clause}
    GROUP BY r.id
    HAVING MAX(m.visited_at) < ?
    ORDER BY last_visit ASC
  `).all(userId, ...f.params, staleCutoff(today)).map(row => ({ ...toRestaurant(row), last_visit: row.last_visit }));

  const topCuisine = db.prepare(`
    SELECT r.cuisine_type, COUNT(*) as cnt FROM meals m
    JOIN restaurants r ON r.id = m.restaurant_id
    WHERE m.user_id = ?
    GROUP BY r.cuisine_type ORDER BY cnt DESC LIMIT 1
  `).get(userId);

  const otherCuisines = wantsOtherCuisines(topCuisine, cuisine)
    ? db.prepare(`SELECT r.* FROM restaurants r WHERE r.cuisine_type != ?${f.clause}`)
      .all(topCuisine.cuisine_type, ...f.params).map(toRestaurant)
    : [];

  return mergeByPriority(planned, neverVisited, notLately, otherCuisines);
}
