import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getMealPeriod } from '../logic/meal-period.js';
import { buildProfileRows } from '../logic/profile.js';
import { openDatabase } from '../server/db.js';
import { rebuildProfile, listProfile } from '../server/profile-store.js';

// ---------------------------------------------------------------------------
// getMealPeriod (Logic)
// ---------------------------------------------------------------------------
describe('getMealPeriod', () => {
  const cases = [
    ['2026-03-29T00:00:00', 'breakfast'],
    ['2026-03-29T10:59:00', 'breakfast'],
    ['2026-03-29T11:00:00', 'lunch'],
    ['2026-03-29T14:30:00', 'lunch'],
    ['2026-03-29T15:00:00', 'tea'],
    ['2026-03-29T16:45:00', 'tea'],
    ['2026-03-29T17:00:00', 'dinner'],
    ['2026-03-29T20:30:00', 'dinner'],
    ['2026-03-29T21:00:00', 'supper'],
    ['2026-03-29T23:59:00', 'supper'],
  ];
  for (const [at, period] of cases) {
    it(`returns ${period} for ${at.slice(11, 16)}`, () => {
      assert.equal(getMealPeriod(at), period);
    });
  }
});

// ---------------------------------------------------------------------------
// buildProfileRows (Logic) — plain meal objects, no database
// ---------------------------------------------------------------------------
const meal = (restaurant_id, visited_at, { rating = 4, price_range = 2, group_id = null } = {}) =>
  ({ restaurant_id, visited_at, rating, price_range, group_id });

const rowFor = (rows, period) => rows.find(r => r.meal_period === period);

describe('buildProfileRows', () => {
  it('computes adventure_ratio = unique_restaurants / total_meals', () => {
    // 2026-03-02, 09, 16 are Mondays
    const rows = buildProfileRows([
      meal(1, '2026-03-02T12:00:00'),
      meal(1, '2026-03-09T12:30:00'),
      meal(2, '2026-03-16T13:00:00'),
    ]);
    const row = rowFor(rows, 'lunch');
    assert.equal(Number(row.adventure_ratio.toFixed(4)), Number((2 / 3).toFixed(4)));
    assert.equal(row.total_meals, 3);
  });

  it('computes avg_price_range, and null when no restaurant has one', () => {
    const rows = buildProfileRows([
      meal(1, '2026-03-03T18:00:00', { price_range: 1 }),
      meal(2, '2026-03-10T19:00:00', { price_range: 3 }),
    ]);
    assert.equal(rowFor(rows, 'dinner').avg_price_range, 2);
    const none = buildProfileRows([meal(1, '2026-03-03T18:00:00', { price_range: null })]);
    assert.equal(none[0].avg_price_range, null);
  });

  it('computes avg_rating_threshold', () => {
    const rows = buildProfileRows([
      meal(1, '2026-03-04T08:00:00', { rating: 2 }),
      meal(1, '2026-03-11T09:00:00', { rating: 4 }),
    ]);
    assert.equal(rowFor(rows, 'breakfast').avg_rating_threshold, 3);
  });

  it('computes group_ratio over all meals', () => {
    const rows = buildProfileRows([
      meal(1, '2026-03-05T12:00:00'),
      meal(1, '2026-03-12T12:30:00', { group_id: 7 }),
      meal(1, '2026-03-19T13:00:00', { group_id: 7 }),
    ]);
    assert.equal(Number(rowFor(rows, 'lunch').group_ratio.toFixed(4)), Number((2 / 3).toFixed(4)));
  });

  it('creates separate rows per day_of_week + meal_period', () => {
    const rows = buildProfileRows([
      meal(1, '2026-03-02T12:00:00'), // Monday lunch
      meal(1, '2026-03-02T18:00:00'), // Monday dinner
      meal(1, '2026-03-03T12:00:00'), // Tuesday lunch
    ]);
    assert.deepEqual(rows.map(r => `${r.day_of_week}|${r.meal_period}`).sort(), ['1|dinner', '1|lunch', '2|lunch']);
  });

  it('computes meal_frequency as meals / total_weeks', () => {
    const rows = buildProfileRows([
      meal(1, '2026-03-02T12:00:00'),
      meal(1, '2026-03-09T12:00:00'),
      meal(1, '2026-03-16T12:00:00'),
    ]);
    assert.equal(rows[0].meal_frequency, 1.5);
  });

  it('uses minimum 1 week when all meals are on the same day', () => {
    const rows = buildProfileRows([meal(1, '2026-03-02T12:00:00'), meal(1, '2026-03-02T13:00:00')]);
    assert.equal(rows[0].meal_frequency, 2);
  });

  it('returns no rows for no meals', () => {
    assert.deepEqual(buildProfileRows([]), []);
  });

  it('does not change its argument', () => {
    const meals = [meal(1, '2026-03-02T12:00:00')];
    const copy = structuredClone(meals);
    buildProfileRows(meals);
    assert.deepEqual(meals, copy);
  });
});

// ---------------------------------------------------------------------------
// rebuildProfile (Connector) — reads and replaces rows; the maths is tested above
// ---------------------------------------------------------------------------
describe('rebuildProfile', () => {
  let db;
  let alice;
  let bob;
  let place;

  const addUser = (name) => db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, 'hash')")
    .run(name, `${name}@test.com`).lastInsertRowid;
  const addMeal = (userId, rating, visitedAt) => db.prepare('INSERT INTO meals (restaurant_id, user_id, rating, visited_at) VALUES (?, ?, ?, ?)')
    .run(place, userId, rating, visitedAt);

  beforeEach(() => {
    db = openDatabase(':memory:');
    alice = addUser('alice');
    bob = addUser('bob');
    place = db.prepare('INSERT INTO restaurants (name, price_range, added_by) VALUES (?, ?, ?)').run('Place', 2, alice).lastInsertRowid;
  });

  it('replaces old rows on rebuild', () => {
    addMeal(alice, 4, '2026-03-02T12:00:00');
    rebuildProfile(db, alice);
    assert.equal(listProfile(db, alice).length, 1);

    addMeal(alice, 2, '2026-03-09T13:00:00');
    rebuildProfile(db, alice);
    const rows = listProfile(db, alice);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].avg_rating_threshold, 3);
    assert.equal(rows[0].total_meals, 2);
  });

  it('reads only the given user and clears rows when meals are gone', () => {
    addMeal(alice, 4, '2026-03-02T12:00:00');
    addMeal(bob, 5, '2026-03-02T12:00:00');
    rebuildProfile(db, alice);
    const rows = listProfile(db, alice);
    assert.equal(rows[0].total_meals, 1);
    assert.equal(rows[0].avg_rating_threshold, 4);

    db.prepare('DELETE FROM meals WHERE user_id = ?').run(alice);
    rebuildProfile(db, alice);
    assert.equal(listProfile(db, alice).length, 0);
  });
});
