import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreRestaurant, generateExplanation, rollSlotTypes, assembleMealSuggestions, topUpSuggestions,
  excludeRecentlyEaten, mergeByPriority, effectivePriceRange, profileConfidence, tagAsNew, rankRestaurants,
} from '../logic/suggest.js';
import { openDatabase } from '../server/db.js';
import { suggestMeal } from '../server/suggestions.js';

// A fixed sequence of "random" numbers, repeated.
const sequence = (...values) => { let i = 0; return () => values[i++ % values.length]; };

// ---------------------------------------------------------------------------
// Restaurant scorer (Logic)
// ---------------------------------------------------------------------------
describe('scoreRestaurant', () => {
  const today = '2026-03-28';
  const base = { avgRating: 3, recentCuisines: [], cuisine_type: 'Korean', visitCount: 5, maxVisitCount: 10, plannedPriority: null };

  it('gives high recency to restaurants not visited recently', () => {
    const s = scoreRestaurant({ ...base, lastVisitedAt: '2026-02-26' }, today);
    assert.ok(s.recency >= 0.9, `got ${s.recency}`);
  });

  it('gives low recency to recently visited restaurants', () => {
    const s = scoreRestaurant({ ...base, lastVisitedAt: '2026-03-27' }, today);
    assert.ok(s.recency < 0.1, `got ${s.recency}`);
  });

  it('gives max recency to never-visited restaurants', () => {
    assert.equal(scoreRestaurant({ ...base, lastVisitedAt: null }, today).recency, 1.0);
  });

  it('boosts variety only when the cuisine differs from recent meals', () => {
    assert.equal(scoreRestaurant({ ...base, lastVisitedAt: null, recentCuisines: ['Japanese'], cuisine_type: 'Mexican' }, today).variety, 1.0);
    assert.equal(scoreRestaurant({ ...base, lastVisitedAt: null, recentCuisines: ['Japanese'], cuisine_type: 'Japanese' }, today).variety, 0);
  });

  it('adds the planned bonus by priority', () => {
    const high = scoreRestaurant({ ...base, lastVisitedAt: null, plannedPriority: 'high' }, today);
    const none = scoreRestaurant({ ...base, lastVisitedAt: null }, today);
    assert.equal(Number((high.total - none.total).toFixed(6)), 0.3);
  });
});

describe('generateExplanation', () => {
  const now = new Date('2026-03-28T12:00:00Z').getTime();

  it('names the days since the last visit, the rating and the plan', () => {
    const text = generateExplanation({ variety: 1.0, frequency: 0.5 }, { lastVisitedAt: '2026-02-28', avgRating: 4, plannedPriority: 'high' }, now);
    assert.equal(text, "Haven't been in 28 days + Rated 4.0 stars + Different from your recent meals + On your planned list (high priority) + A proven favorite");
  });

  it('says never tried, and has a default', () => {
    assert.equal(generateExplanation({ variety: 0, frequency: 0 }, { lastVisitedAt: null, avgRating: 0 }, now), 'Never tried before');
    assert.equal(generateExplanation({ variety: 0, frequency: 0 }, { lastVisitedAt: '2026-03-27', avgRating: 0 }, now), 'Worth checking out');
  });
});

describe('rankRestaurants', () => {
  it('returns the top three by total score', () => {
    const c = (id, avgRating) => ({ restaurant: { id, cuisine_type: null }, lastVisitedAt: null, avgRating, visitCount: 0, plannedPriority: null });
    const ranked = rankRestaurants([c(1, 1), c(2, 5), c(3, 3), c(4, 4)], { recentCuisines: [], maxVisitCount: 0, today: '2026-03-28', now: 0 });
    assert.deepEqual(ranked.map(r => r.id), [2, 4, 3]);
    assert.ok(ranked.every(r => r.scores && typeof r.explanation === 'string'));
  });
});

// ---------------------------------------------------------------------------
// Meal suggester (Logic)
// ---------------------------------------------------------------------------
describe('meal suggester rules', () => {
  const r = (id) => ({ id, name: `R${id}` });

  it('rolls new with probability adventure_ratio', () => {
    assert.deepEqual(rollSlotTypes(0.5, sequence(0.1, 0.9, 0.4)), ['new', 'familiar', 'new']);
  });

  it('confidence grows to 1 at 20 meals', () => {
    assert.equal(profileConfidence(null), 0);
    assert.equal(profileConfidence({ total_meals: 10 }), 0.5);
    assert.equal(profileConfidence({ total_meals: 40 }), 1);
  });

  it('a user price filter wins over the profile price', () => {
    assert.equal(effectivePriceRange('3', { avg_price_range: 1.6 }), '3');
    assert.equal(effectivePriceRange(null, { avg_price_range: 1.6 }), 2);
    assert.equal(effectivePriceRange(null, null), null);
  });

  it('fills each slot from its pool and cross-fills when a pool is empty', () => {
    const out = assembleMealSuggestions(['familiar', 'new', 'familiar'], [r(1)], [r(2), r(3)]);
    assert.deepEqual(out.map(s => [s.id, s.suggestion_type, s.is_top_pick]), [
      [1, 'familiar', true], [2, 'new', false], [3, 'familiar', false],
    ]);
  });

  it('never picks the same restaurant twice', () => {
    const out = assembleMealSuggestions(['familiar', 'new', 'new'], [r(1), r(2)], [r(1), r(3)]);
    assert.deepEqual(out.map(s => s.id), [1, 3, 2]);
  });

  it('tops up from the scorer, tagged new, skipping ones already picked', () => {
    const out = topUpSuggestions([{ ...r(1), suggestion_type: 'familiar', is_top_pick: true }], [r(1), r(4), r(5), r(6)]);
    assert.deepEqual(out.map(s => [s.id, s.suggestion_type]), [[1, 'familiar'], [4, 'new'], [5, 'new']]);
  });

  it('tags scorer picks as new with the first as top pick', () => {
    assert.deepEqual(tagAsNew([r(1), r(2), r(3), r(4)]).map(s => [s.id, s.is_top_pick]), [[1, true], [2, false], [3, false]]);
  });

  it('excludes restaurants eaten in the same period lately', () => {
    const visits = new Map([[1, ['2026-03-28T12:30:00']], [2, ['2026-03-28T19:00:00']]]);
    assert.deepEqual(excludeRecentlyEaten([r(1), r(2), r(3)], visits, 'lunch').map(x => x.id), [2, 3]);
  });

  it('merges pools in order and keeps the first of each id', () => {
    assert.deepEqual(mergeByPriority([r(2)], [r(1), r(2)], [r(3), r(1)]).map(x => x.id), [2, 1, 3]);
  });
});

// ---------------------------------------------------------------------------
// suggestMeal (Connector) — the rows it reads reach the rules correctly
// ---------------------------------------------------------------------------
describe('suggestMeal', () => {
  let db;
  let userId;

  // Sunday 2026-03-29 at 12:30 local time: lunch, dayOfWeek 0
  const testNow = new Date('2026-03-29T12:30:00');

  const addProfile = (adventureRatio, totalMeals) => db.prepare(`
    INSERT INTO user_meal_profiles (user_id, day_of_week, meal_period, adventure_ratio, total_meals, avg_price_range)
    VALUES (?, 0, 'lunch', ?, ?, 2)
  `).run(userId, adventureRatio, totalMeals);

  beforeEach(() => {
    db = openDatabase(':memory:');
    userId = db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('Alice', 'a@test.com', 'hash')").run().lastInsertRowid;
    const addRestaurant = db.prepare('INSERT INTO restaurants (name, cuisine_type, price_range, added_by) VALUES (?, ?, ?, ?)');
    addRestaurant.run('Fav Chinese', 'Chinese', 2, userId);   // 1
    addRestaurant.run('Fav Malay', 'Malay', 2, userId);       // 2
    addRestaurant.run('Fav Western', 'Western', 3, userId);   // 3
    addRestaurant.run('New Thai', 'Thai', 2, userId);         // 4
    addRestaurant.run('New Korean', 'Korean', 3, userId);     // 5
    addRestaurant.run('New Japanese', 'Japanese', 2, userId); // 6
    const addMeal = db.prepare('INSERT INTO meals (restaurant_id, user_id, rating, visited_at) VALUES (?, ?, ?, ?)');
    addMeal.run(1, userId, 5, '2026-03-22T12:00:00');
    addMeal.run(1, userId, 4, '2026-03-15T12:00:00');
    addMeal.run(1, userId, 5, '2026-03-08T12:00:00');
    addMeal.run(2, userId, 4, '2026-03-20T12:00:00');
    addMeal.run(2, userId, 3, '2026-03-13T12:00:00');
    addMeal.run(3, userId, 4, '2026-03-18T12:00:00');
  });

  it('all-familiar rolls pick the most visited restaurants at the profile price', () => {
    addProfile(0.1, 25);
    const out = suggestMeal(db, { userId, now: testNow, rng: () => 0.99 });
    // The third pick is cross-filled from the new pool but keeps its slot's
    // label. Existing behaviour, recorded in the plan as a defect.
    assert.deepEqual(out.map(s => [s.name, s.suggestion_type]), [
      ['Fav Chinese', 'familiar'], ['Fav Malay', 'familiar'], ['New Thai', 'familiar'],
    ]);
    assert.equal(out[0].is_top_pick, true);
  });

  it('all-new rolls pick never-visited restaurants, then other cuisines', () => {
    addProfile(0.9, 25);
    const out = suggestMeal(db, { userId, now: testNow, rng: () => 0 });
    // Profile price 2 filters out New Korean; Fav Malay comes from the
    // "not the usual cuisine" source.
    assert.deepEqual(out.map(s => [s.name, s.suggestion_type]), [
      ['New Thai', 'new'], ['New Japanese', 'new'], ['Fav Malay', 'new'],
    ]);
  });

  it('falls back to the scorer, all new, when there is no profile', () => {
    const out = suggestMeal(db, { userId, now: testNow, rng: () => 0 });
    assert.ok(out.length > 0 && out.length <= 3);
    assert.ok(out.every(s => s.suggestion_type === 'new'));
  });

  it('applies the cuisine filter to every pool', () => {
    addProfile(0.5, 25);
    const out = suggestMeal(db, { userId, cuisine: 'Chinese', now: testNow, rng: sequence(0.1, 0.9, 0.4) });
    assert.ok(out.length > 0);
    assert.ok(out.every(s => s.cuisine_type === 'Chinese'));
  });
});
