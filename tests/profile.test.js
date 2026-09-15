import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMealPeriod, getDayOfWeek, getCalendarDate, isValidTimeZone, resolveTimeZone, shouldStoreTimeZone,
} from '../logic/meal-period.js';
import { buildProfileRows } from '../logic/profile.js';
import { openDatabase } from '../server/db.js';
import { rebuildProfile, listProfile } from '../server/profile-store.js';

// Every timestamp here is a UTC instant and every call names its zone, so the
// suite gives the same result on a machine in any time zone.
const KL = 'Asia/Kuala_Lumpur';

// ---------------------------------------------------------------------------
// getMealPeriod / getDayOfWeek (Logic)
// ---------------------------------------------------------------------------
describe('getMealPeriod', () => {
  const cases = [
    ['2026-03-29T00:00:00Z', 'breakfast'],
    ['2026-03-29T10:59:00Z', 'breakfast'],
    ['2026-03-29T11:00:00Z', 'lunch'],
    ['2026-03-29T14:30:00Z', 'lunch'],
    ['2026-03-29T15:00:00Z', 'tea'],
    ['2026-03-29T16:45:00Z', 'tea'],
    ['2026-03-29T17:00:00Z', 'dinner'],
    ['2026-03-29T20:30:00Z', 'dinner'],
    ['2026-03-29T21:00:00Z', 'supper'],
    ['2026-03-29T23:59:00Z', 'supper'],
  ];
  for (const [at, period] of cases) {
    it(`returns ${period} for ${at.slice(11, 16)} UTC`, () => {
      assert.equal(getMealPeriod(at, 'UTC'), period);
    });
  }

  it('reads the hour in the given zone', () => {
    // Sunday 12:30 in Kuala Lumpur is Sunday 04:30 in UTC.
    assert.equal(getMealPeriod('2026-03-29T04:30:00Z', KL), 'lunch');
    assert.equal(getMealPeriod('2026-03-29T04:30:00Z', 'UTC'), 'breakfast');
  });

  it('throws without a valid zone', () => {
    assert.throws(() => getMealPeriod('2026-03-29T04:30:00Z'), RangeError);
    assert.throws(() => getMealPeriod('2026-03-29T04:30:00Z', ''), RangeError);
    assert.throws(() => getMealPeriod('2026-03-29T04:30:00Z', 'Mars/Olympus'), RangeError);
  });
});

describe('getDayOfWeek and getCalendarDate', () => {
  // Saturday 20:30 in UTC is already Sunday 04:30 in Kuala Lumpur.
  const at = '2026-03-28T20:30:00Z';

  it('reads the weekday in the given zone', () => {
    assert.equal(getDayOfWeek(at, KL), 0);
    assert.equal(getDayOfWeek(at, 'UTC'), 6);
    assert.equal(getMealPeriod(at, KL), 'breakfast');
    assert.equal(getMealPeriod(at, 'UTC'), 'dinner');
  });

  it('reads the calendar date in the given zone', () => {
    assert.equal(getCalendarDate(at, KL), '2026-03-29');
    assert.equal(getCalendarDate(at, 'UTC'), '2026-03-28');
    assert.equal(getCalendarDate(new Date(at), 'America/New_York'), '2026-03-28');
  });

  it('throws without a valid zone', () => {
    assert.throws(() => getDayOfWeek(at), RangeError);
    assert.throws(() => getDayOfWeek(at, 'Nowhere'), RangeError);
    assert.throws(() => getCalendarDate(at, null), RangeError);
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones Intl knows', () => {
    for (const tz of ['UTC', KL, 'America/New_York', 'Europe/London']) assert.equal(isValidTimeZone(tz), true, tz);
  });
  it('refuses anything else', () => {
    for (const tz of [undefined, null, '', ' ', 'Mars/Olympus', 42, {}, ['UTC']]) {
      assert.equal(isValidTimeZone(tz), false, JSON.stringify(tz));
    }
  });
});

describe('resolveTimeZone', () => {
  it('prefers a valid header, then a valid stored zone, then the fallback', () => {
    assert.equal(resolveTimeZone({ header: 'UTC', stored: KL, fallback: 'Europe/London' }), 'UTC');
    assert.equal(resolveTimeZone({ header: 'Nope/Zone', stored: KL, fallback: 'Europe/London' }), KL);
    assert.equal(resolveTimeZone({ header: undefined, stored: KL, fallback: 'Europe/London' }), KL);
    assert.equal(resolveTimeZone({ header: '', stored: null, fallback: 'Europe/London' }), 'Europe/London');
    assert.equal(resolveTimeZone({ stored: 'Bad/Stored', fallback: 'Europe/London' }), 'Europe/London');
  });
});

describe('shouldStoreTimeZone', () => {
  it('stores only a valid header that differs from the stored zone', () => {
    assert.equal(shouldStoreTimeZone('UTC', null), true);
    assert.equal(shouldStoreTimeZone('UTC', KL), true);
    assert.equal(shouldStoreTimeZone('UTC', 'UTC'), false);
    assert.equal(shouldStoreTimeZone(undefined, KL), false);
    assert.equal(shouldStoreTimeZone('Nope/Zone', null), false);
  });
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
      meal(1, '2026-03-02T12:00:00Z'),
      meal(1, '2026-03-09T12:30:00Z'),
      meal(2, '2026-03-16T13:00:00Z'),
    ], 'UTC');
    const row = rowFor(rows, 'lunch');
    assert.equal(Number(row.adventure_ratio.toFixed(4)), Number((2 / 3).toFixed(4)));
    assert.equal(row.total_meals, 3);
  });

  it('computes avg_price_range, and null when no restaurant has one', () => {
    const rows = buildProfileRows([
      meal(1, '2026-03-03T18:00:00Z', { price_range: 1 }),
      meal(2, '2026-03-10T19:00:00Z', { price_range: 3 }),
    ], 'UTC');
    assert.equal(rowFor(rows, 'dinner').avg_price_range, 2);
    const none = buildProfileRows([meal(1, '2026-03-03T18:00:00Z', { price_range: null })], 'UTC');
    assert.equal(none[0].avg_price_range, null);
  });

  it('computes avg_rating_threshold', () => {
    const rows = buildProfileRows([
      meal(1, '2026-03-04T08:00:00Z', { rating: 2 }),
      meal(1, '2026-03-11T09:00:00Z', { rating: 4 }),
    ], 'UTC');
    assert.equal(rowFor(rows, 'breakfast').avg_rating_threshold, 3);
  });

  it('computes group_ratio over all meals', () => {
    const rows = buildProfileRows([
      meal(1, '2026-03-05T12:00:00Z'),
      meal(1, '2026-03-12T12:30:00Z', { group_id: 7 }),
      meal(1, '2026-03-19T13:00:00Z', { group_id: 7 }),
    ], 'UTC');
    assert.equal(Number(rowFor(rows, 'lunch').group_ratio.toFixed(4)), Number((2 / 3).toFixed(4)));
  });

  it('creates separate rows per day_of_week + meal_period', () => {
    const rows = buildProfileRows([
      meal(1, '2026-03-02T12:00:00Z'), // Monday lunch
      meal(1, '2026-03-02T18:00:00Z'), // Monday dinner
      meal(1, '2026-03-03T12:00:00Z'), // Tuesday lunch
    ], 'UTC');
    assert.deepEqual(rows.map(r => `${r.day_of_week}|${r.meal_period}`).sort(), ['1|dinner', '1|lunch', '2|lunch']);
  });

  it('places each meal by the day and hour in the given zone', () => {
    const meals = [meal(1, '2026-03-28T20:30:00Z')];
    const slot = (rows) => rows.map(r => `${r.day_of_week}|${r.meal_period}`);
    assert.deepEqual(slot(buildProfileRows(meals, 'UTC')), ['6|dinner']);
    assert.deepEqual(slot(buildProfileRows(meals, KL)), ['0|breakfast']);
  });

  it('computes meal_frequency as meals / total_weeks', () => {
    const rows = buildProfileRows([
      meal(1, '2026-03-02T12:00:00Z'),
      meal(1, '2026-03-09T12:00:00Z'),
      meal(1, '2026-03-16T12:00:00Z'),
    ], 'UTC');
    assert.equal(rows[0].meal_frequency, 1.5);
  });

  it('uses minimum 1 week when all meals are on the same day', () => {
    const rows = buildProfileRows([meal(1, '2026-03-02T12:00:00Z'), meal(1, '2026-03-02T13:00:00Z')], 'UTC');
    assert.equal(rows[0].meal_frequency, 2);
  });

  it('returns no rows for no meals', () => {
    assert.deepEqual(buildProfileRows([], 'UTC'), []);
  });

  it('throws without a valid zone', () => {
    assert.throws(() => buildProfileRows([meal(1, '2026-03-02T12:00:00Z')]), RangeError);
  });

  it('does not change its argument', () => {
    const meals = [meal(1, '2026-03-02T12:00:00Z')];
    const copy = structuredClone(meals);
    buildProfileRows(meals, 'UTC');
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
    addMeal(alice, 4, '2026-03-02T12:00:00Z');
    rebuildProfile(db, alice, 'UTC');
    assert.equal(listProfile(db, alice).length, 1);

    addMeal(alice, 2, '2026-03-09T13:00:00Z');
    rebuildProfile(db, alice, 'UTC');
    const rows = listProfile(db, alice);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].avg_rating_threshold, 3);
    assert.equal(rows[0].total_meals, 2);
  });

  it('builds the rows in the zone it is given', () => {
    addMeal(alice, 4, '2026-03-28T20:30:00Z');
    rebuildProfile(db, alice, KL);
    assert.deepEqual(listProfile(db, alice).map(r => [r.day_of_week, r.meal_period]), [[0, 'breakfast']]);
    rebuildProfile(db, alice, 'UTC');
    assert.deepEqual(listProfile(db, alice).map(r => [r.day_of_week, r.meal_period]), [[6, 'dinner']]);
  });

  it('reads only the given user and clears rows when meals are gone', () => {
    addMeal(alice, 4, '2026-03-02T12:00:00Z');
    addMeal(bob, 5, '2026-03-02T12:00:00Z');
    rebuildProfile(db, alice, 'UTC');
    const rows = listProfile(db, alice);
    assert.equal(rows[0].total_meals, 1);
    assert.equal(rows[0].avg_rating_threshold, 4);

    db.prepare('DELETE FROM meals WHERE user_id = ?').run(alice);
    rebuildProfile(db, alice, 'UTC');
    assert.equal(listProfile(db, alice).length, 0);
  });
});
