import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreRestaurant, generateExplanation, rollSlotTypes, assembleMealSuggestions, topUpSuggestions,
  excludeRecentlyEaten, mergeByPriority, effectivePriceRange, profileConfidence, tagAsNew, rankRestaurants,
  mealContext, familiarCutoff, staleCutoff, pickExplanation, withExplanations, mergeNewPool,
} from '../logic/suggest.js';
import { openDatabase } from '../server/db.js';
import { suggestMeal, getSuggestions } from '../server/suggestions.js';

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

  it('fills each slot from its pool and cross-fills, labelled by source, when a pool is empty', () => {
    const out = assembleMealSuggestions(['familiar', 'new', 'familiar'], [r(1)], [r(2), r(3)]);
    assert.deepEqual(out.map(s => [s.id, s.suggestion_type, s.is_top_pick]), [
      [1, 'familiar', true], [2, 'new', false], [3, 'new', false],
    ]);
    const fromFamiliar = assembleMealSuggestions(['new'], [r(1)], []);
    assert.deepEqual(fromFamiliar.map(s => [s.id, s.suggestion_type]), [[1, 'familiar']]);
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
    const visits = new Map([[1, ['2026-03-28T12:30:00Z']], [2, ['2026-03-28T19:00:00Z']]]);
    assert.deepEqual(excludeRecentlyEaten([r(1), r(2), r(3)], visits, 'lunch', 'UTC').map(x => x.id), [2, 3]);
  });

  it('reads the period of a past visit in the given zone', () => {
    // 04:30 UTC is 12:30 in Kuala Lumpur: lunch there, breakfast in UTC.
    const visits = new Map([[1, ['2026-03-28T04:30:00Z']]]);
    assert.deepEqual(excludeRecentlyEaten([r(1), r(2)], visits, 'lunch', 'Asia/Kuala_Lumpur').map(x => x.id), [2]);
    assert.deepEqual(excludeRecentlyEaten([r(1), r(2)], visits, 'lunch', 'UTC').map(x => x.id), [1, 2]);
  });

  it('the familiar cooldown starts at local midnight two days before today, in the given zone', () => {
    assert.equal(familiarCutoff('2026-03-29', 'Asia/Kuala_Lumpur'), '2026-03-26T16:00:00.000Z');
    assert.equal(familiarCutoff('2026-03-29', 'UTC'), '2026-03-27T00:00:00.000Z');
    assert.equal(familiarCutoff('2026-03-29', 'America/New_York'), '2026-03-27T04:00:00.000Z');
    // Across the start of US daylight saving time (2026-03-08).
    assert.equal(familiarCutoff('2026-03-10', 'America/New_York'), '2026-03-08T05:00:00.000Z');
    assert.equal(familiarCutoff('2026-03-11', 'America/New_York'), '2026-03-09T04:00:00.000Z');
    assert.throws(() => familiarCutoff('2026-03-29'), RangeError);
  });

  it('a stale visit is one before the calendar date thirty days before today', () => {
    assert.equal(staleCutoff('2026-03-29'), '2026-02-27');
    assert.equal(staleCutoff('2024-03-01'), '2024-01-31');
    assert.equal(staleCutoff('2026-01-15'), '2025-12-16');
  });

  it('reads the meal context in the given zone', () => {
    // Saturday 20:30 UTC is Sunday 04:30 in Kuala Lumpur.
    const now = new Date('2026-03-28T20:30:00Z');
    assert.deepEqual(mealContext(now, 'Asia/Kuala_Lumpur'), { dayOfWeek: 0, mealPeriod: 'breakfast', today: '2026-03-29' });
    assert.deepEqual(mealContext(now, 'UTC'), { dayOfWeek: 6, mealPeriod: 'dinner', today: '2026-03-28' });
    assert.throws(() => mealContext(now), RangeError);
  });

  it('merges pools in order and keeps the first of each id', () => {
    assert.deepEqual(mergeByPriority([r(2)], [r(1), r(2)], [r(3), r(1)]).map(x => x.id), [2, 1, 3]);
  });
});

describe('suggestion explanations', () => {
  const r = (id, extra = {}) => ({ id, name: `R${id}`, ...extra });

  it('names why each pool picked the restaurant', () => {
    assert.equal(pickExplanation(r(1), 'familiar'), 'One of your usual places for this time');
    assert.equal(pickExplanation(r(1, { priority: 'high' }), 'planned'), 'On your planned list (high priority)');
    assert.equal(pickExplanation(r(1), 'never_visited'), 'Never tried before');
    assert.equal(pickExplanation(r(1), 'not_lately'), "Haven't been in a while");
    assert.equal(pickExplanation(r(1), 'other_cuisine'), 'A change from your usual cuisine');
    assert.equal(pickExplanation(r(1), 'new'), 'Something new to try');
  });

  it('keeps an explanation a row already has, and does not change its arguments', () => {
    const rows = [r(1, { explanation: 'Rated 4.5 stars' }), r(2)];
    assert.deepEqual(withExplanations(rows, 'familiar').map(x => x.explanation), ['Rated 4.5 stars', 'One of your usual places for this time']);
    assert.equal('explanation' in rows[1], false);
  });

  it('merges the new pool in priority order, each with its own reason', () => {
    const pool = mergeNewPool({
      planned: [r(2, { priority: 'low' })],
      neverVisited: [r(1), r(2)],
      notLately: [r(3)],
      otherCuisines: [r(4), r(1)],
    });
    assert.deepEqual(pool.map(x => [x.id, x.explanation]), [
      [2, 'On your planned list (low priority)'],
      [1, 'Never tried before'],
      [3, "Haven't been in a while"],
      [4, 'A change from your usual cuisine'],
    ]);
  });

  it('every assembled, topped-up or tagged suggestion carries an explanation', () => {
    const assembled = assembleMealSuggestions(['familiar', 'new'], [r(1)], [r(2, { explanation: 'Never tried before' })]);
    assert.deepEqual(assembled.map(s => s.explanation), ['One of your usual places for this time', 'Never tried before']);
    const topped = topUpSuggestions(assembled, [r(3), r(4, { explanation: 'A proven favorite' })]);
    assert.deepEqual(topped.map(s => s.explanation).slice(2), ['Something new to try']);
    assert.deepEqual(tagAsNew([r(5, { explanation: 'Rated 4.0 stars' }), r(6)]).map(s => s.explanation), ['Rated 4.0 stars', 'Something new to try']);
  });
});

// ---------------------------------------------------------------------------
// suggestMeal (Connector) — the rows it reads reach the rules correctly
// ---------------------------------------------------------------------------
describe('suggestMeal', () => {
  let db;
  let userId;

  // Sunday 2026-03-29 at 12:30 in Kuala Lumpur (04:30 UTC): lunch, dayOfWeek 0
  const testNow = new Date('2026-03-29T04:30:00Z');
  const timeZone = 'Asia/Kuala_Lumpur';

  const addProfile = (adventureRatio, totalMeals) => db.prepare(`
    INSERT INTO user_meal_profiles (user_id, day_of_week, meal_period, adventure_ratio, total_meals, avg_price_range)
    VALUES (?, 0, 'lunch', ?, ?, 2)
  `).run(userId, adventureRatio, totalMeals);

  beforeEach(() => {
    db = openDatabase(':memory:', { defaultTimeZone: 'UTC' });
    userId = db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('Alice', 'a@test.com', 'hash')").run().lastInsertRowid;
    const addRestaurant = db.prepare('INSERT INTO restaurants (name, cuisine_type, price_range, added_by) VALUES (?, ?, ?, ?)');
    addRestaurant.run('Fav Chinese', 'Chinese', 2, userId);   // 1
    addRestaurant.run('Fav Malay', 'Malay', 2, userId);       // 2
    addRestaurant.run('Fav Western', 'Western', 3, userId);   // 3
    addRestaurant.run('New Thai', 'Thai', 2, userId);         // 4
    addRestaurant.run('New Korean', 'Korean', 3, userId);     // 5
    addRestaurant.run('New Japanese', 'Japanese', 2, userId); // 6
    const addMeal = db.prepare('INSERT INTO meals (restaurant_id, user_id, rating, visited_at) VALUES (?, ?, ?, ?)');
    addMeal.run(1, userId, 5, '2026-03-22T04:00:00.000Z');
    addMeal.run(1, userId, 4, '2026-03-15T04:00:00.000Z');
    addMeal.run(1, userId, 5, '2026-03-08T04:00:00.000Z');
    addMeal.run(2, userId, 4, '2026-03-20T04:00:00.000Z');
    addMeal.run(2, userId, 3, '2026-03-13T04:00:00.000Z');
    addMeal.run(3, userId, 4, '2026-03-18T04:00:00.000Z');
  });

  it('all-familiar rolls pick the most visited restaurants at the profile price', () => {
    addProfile(0.1, 25);
    const out = suggestMeal(db, { userId, now: testNow, timeZone, rng: () => 0.99 });
    // The third pick is cross-filled from the new pool and labelled new.
    assert.deepEqual(out.map(s => [s.name, s.suggestion_type]), [
      ['Fav Chinese', 'familiar'], ['Fav Malay', 'familiar'], ['New Thai', 'new'],
    ]);
    assert.equal(out[0].is_top_pick, true);
    assert.deepEqual(out.map(s => s.explanation), [
      'One of your usual places for this time', 'One of your usual places for this time', 'Never tried before',
    ]);
  });

  it('all-new rolls pick never-visited restaurants, then other cuisines', () => {
    addProfile(0.9, 25);
    const out = suggestMeal(db, { userId, now: testNow, timeZone, rng: () => 0 });
    // Profile price 2 filters out New Korean; Fav Malay comes from the
    // "not the usual cuisine" source.
    assert.deepEqual(out.map(s => [s.name, s.suggestion_type]), [
      ['New Thai', 'new'], ['New Japanese', 'new'], ['Fav Malay', 'new'],
    ]);
    assert.deepEqual(out.map(s => s.explanation), ['Never tried before', 'Never tried before', 'A change from your usual cuisine']);
  });

  it('falls back to the scorer, all new, when there is no profile', () => {
    const out = suggestMeal(db, { userId, now: testNow, timeZone, rng: () => 0 });
    assert.ok(out.length > 0 && out.length <= 3);
    assert.ok(out.every(s => s.suggestion_type === 'new'));
    assert.ok(out.every(s => typeof s.explanation === 'string' && s.explanation.length > 0));
  });

  it('finds the profile slot in the zone it is given', () => {
    addProfile(0.1, 25); // Sunday lunch
    const familiar = (zone) => suggestMeal(db, { userId, now: testNow, timeZone: zone, rng: () => 0.99 })
      .filter(s => s.suggestion_type === 'familiar').length;
    assert.equal(familiar(timeZone), 2);
    // 04:30 UTC is Sunday breakfast: no profile there, so every pick is new.
    assert.equal(familiar('UTC'), 0);
  });

  it('the restaurant scorer counts days from today in the given zone', () => {
    // Saturday 20:30 UTC is already Sunday 2026-03-29 in Kuala Lumpur. Fav
    // Chinese was last visited 2026-03-22T04:00Z: 6 whole days before the KL
    // date, 5 before the UTC date.
    const now = new Date('2026-03-28T20:30:00Z');
    const recency = (zone) => getSuggestions(db, { userId, cuisine: 'Chinese', now, timeZone: zone })
      .find(s => s.name === 'Fav Chinese').scores.recency;
    assert.equal(recency(timeZone), 6 / 30);
    assert.equal(recency('UTC'), 5 / 30);
  });

  it('applies the cuisine filter to every pool', () => {
    addProfile(0.5, 25);
    const out = suggestMeal(db, { userId, cuisine: 'Chinese', now: testNow, timeZone, rng: sequence(0.1, 0.9, 0.4) });
    assert.ok(out.length > 0);
    assert.ok(out.every(s => s.cuisine_type === 'Chinese'));
  });
});
