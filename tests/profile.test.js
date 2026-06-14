import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { getMealPeriod, rebuildProfile } from '../profile.js';

// ---------------------------------------------------------------------------
// getMealPeriod
// ---------------------------------------------------------------------------
describe('getMealPeriod', () => {
  it('returns breakfast for hour 0 (midnight)', () => {
    assert.equal(getMealPeriod('2026-03-29T00:00:00'), 'breakfast');
  });

  it('returns breakfast for hour 10', () => {
    assert.equal(getMealPeriod('2026-03-29T10:59:00'), 'breakfast');
  });

  it('returns lunch at boundary hour 11', () => {
    assert.equal(getMealPeriod('2026-03-29T11:00:00'), 'lunch');
  });

  it('returns lunch for hour 14', () => {
    assert.equal(getMealPeriod('2026-03-29T14:30:00'), 'lunch');
  });

  it('returns tea at boundary hour 15', () => {
    assert.equal(getMealPeriod('2026-03-29T15:00:00'), 'tea');
  });

  it('returns tea for hour 16', () => {
    assert.equal(getMealPeriod('2026-03-29T16:45:00'), 'tea');
  });

  it('returns dinner at boundary hour 17', () => {
    assert.equal(getMealPeriod('2026-03-29T17:00:00'), 'dinner');
  });

  it('returns dinner for hour 20', () => {
    assert.equal(getMealPeriod('2026-03-29T20:30:00'), 'dinner');
  });

  it('returns supper at boundary hour 21', () => {
    assert.equal(getMealPeriod('2026-03-29T21:00:00'), 'supper');
  });

  it('returns supper for hour 23', () => {
    assert.equal(getMealPeriod('2026-03-29T23:59:00'), 'supper');
  });
});

// ---------------------------------------------------------------------------
// rebuildProfile
// ---------------------------------------------------------------------------

/** Create the required schema tables in an in-memory database. */
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cuisine_type TEXT,
      price_range INTEGER CHECK(price_range BETWEEN 1 AND 4),
      address TEXT,
      lat REAL,
      lng REAL,
      photo_url TEXT,
      added_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE groups_ (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      group_id INTEGER REFERENCES groups_(id) ON DELETE SET NULL,
      title TEXT,
      calories INTEGER,
      dishes TEXT,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      photo_urls TEXT DEFAULT '[]',
      notes TEXT,
      visited_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE user_meal_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      meal_period TEXT NOT NULL,
      avg_price_range REAL,
      adventure_ratio REAL NOT NULL DEFAULT 0,
      avg_rating_threshold REAL NOT NULL DEFAULT 0,
      meal_frequency REAL NOT NULL DEFAULT 0,
      group_ratio REAL NOT NULL DEFAULT 0,
      total_meals INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, day_of_week, meal_period)
    );
  `);

  return db;
}

/** Helper: insert a user and return the id. */
function addUser(db, name) {
  return db.prepare(
    "INSERT INTO users (name, email, password_hash) VALUES (?, ?, 'hash')"
  ).run(name, `${name.toLowerCase().replace(/\s/g, '')}@test.com`).lastInsertRowid;
}

/** Helper: insert a restaurant and return the id. */
function addRestaurant(db, name, priceRange, userId) {
  return db.prepare(
    'INSERT INTO restaurants (name, price_range, added_by) VALUES (?, ?, ?)'
  ).run(name, priceRange, userId).lastInsertRowid;
}

/** Helper: insert a group and return the id. */
function addGroup(db, name, userId) {
  return db.prepare(
    "INSERT INTO groups_ (name, invite_code, created_by) VALUES (?, ?, ?)"
  ).run(name, `inv_${Date.now()}_${Math.random()}`, userId).lastInsertRowid;
}

/** Helper: insert a meal and return the id. */
function addMeal(db, { restaurantId, userId, groupId, rating, visitedAt }) {
  return db.prepare(
    'INSERT INTO meals (restaurant_id, user_id, group_id, rating, visited_at) VALUES (?, ?, ?, ?, ?)'
  ).run(restaurantId, userId, groupId ?? null, rating, visitedAt).lastInsertRowid;
}

describe('rebuildProfile', () => {
  let db;
  let userId;

  beforeEach(() => {
    db = createTestDb();
    userId = addUser(db, 'Alice');
  });

  it('computes adventure_ratio = unique_restaurants / total_meals', () => {
    const r1 = addRestaurant(db, 'Place A', 2, userId);
    const r2 = addRestaurant(db, 'Place B', 3, userId);

    // All on the same day-of-week and meal period (Monday lunch)
    // 2026-03-02 is a Monday
    addMeal(db, { restaurantId: r1, userId, rating: 4, visitedAt: '2026-03-02T12:00:00' });
    addMeal(db, { restaurantId: r1, userId, rating: 3, visitedAt: '2026-03-09T12:30:00' }); // also Monday
    addMeal(db, { restaurantId: r2, userId, rating: 5, visitedAt: '2026-03-16T13:00:00' }); // also Monday

    rebuildProfile(db, userId);

    const row = db.prepare(
      "SELECT * FROM user_meal_profiles WHERE user_id = ? AND meal_period = 'lunch'"
    ).get(userId);

    assert.ok(row, 'profile row should exist');
    // 2 unique restaurants / 3 total meals
    assert.equal(Number(row.adventure_ratio.toFixed(4)), Number((2 / 3).toFixed(4)));
    assert.equal(row.total_meals, 3);
  });

  it('computes avg_price_range correctly', () => {
    const r1 = addRestaurant(db, 'Cheap', 1, userId);
    const r2 = addRestaurant(db, 'Pricey', 3, userId);

    // Tuesday dinner (2026-03-03 is a Tuesday)
    addMeal(db, { restaurantId: r1, userId, rating: 4, visitedAt: '2026-03-03T18:00:00' });
    addMeal(db, { restaurantId: r2, userId, rating: 4, visitedAt: '2026-03-10T19:00:00' }); // also Tuesday

    rebuildProfile(db, userId);

    const row = db.prepare(
      "SELECT * FROM user_meal_profiles WHERE user_id = ? AND meal_period = 'dinner'"
    ).get(userId);

    assert.ok(row);
    // avg of 1 and 3 = 2
    assert.equal(row.avg_price_range, 2);
  });

  it('computes avg_rating_threshold correctly', () => {
    const r1 = addRestaurant(db, 'Place', 2, userId);

    // Wednesday breakfast (2026-03-04 is a Wednesday)
    addMeal(db, { restaurantId: r1, userId, rating: 2, visitedAt: '2026-03-04T08:00:00' });
    addMeal(db, { restaurantId: r1, userId, rating: 4, visitedAt: '2026-03-11T09:00:00' }); // also Wednesday

    rebuildProfile(db, userId);

    const row = db.prepare(
      "SELECT * FROM user_meal_profiles WHERE user_id = ? AND meal_period = 'breakfast'"
    ).get(userId);

    assert.ok(row);
    // avg of 2 and 4 = 3
    assert.equal(row.avg_rating_threshold, 3);
  });

  it('computes group_ratio correctly (uses all meals including group meals)', () => {
    const r1 = addRestaurant(db, 'Place A', 2, userId);
    const groupId = addGroup(db, 'Friends', userId);

    // Thursday lunch (2026-03-05 is a Thursday)
    addMeal(db, { restaurantId: r1, userId, groupId: null, rating: 4, visitedAt: '2026-03-05T12:00:00' }); // solo
    addMeal(db, { restaurantId: r1, userId, groupId, rating: 3, visitedAt: '2026-03-12T12:30:00' }); // group
    addMeal(db, { restaurantId: r1, userId, groupId, rating: 5, visitedAt: '2026-03-19T13:00:00' }); // group

    rebuildProfile(db, userId);

    const row = db.prepare(
      "SELECT * FROM user_meal_profiles WHERE user_id = ? AND meal_period = 'lunch'"
    ).get(userId);

    assert.ok(row);
    // 2 group meals out of 3 total
    assert.equal(Number(row.group_ratio.toFixed(4)), Number((2 / 3).toFixed(4)));
    assert.equal(row.total_meals, 3);
  });

  it('creates separate rows per day_of_week + meal_period', () => {
    const r1 = addRestaurant(db, 'Place', 2, userId);

    // Monday lunch (2026-03-02)
    addMeal(db, { restaurantId: r1, userId, rating: 4, visitedAt: '2026-03-02T12:00:00' });
    // Monday dinner (2026-03-02)
    addMeal(db, { restaurantId: r1, userId, rating: 3, visitedAt: '2026-03-02T18:00:00' });
    // Tuesday lunch (2026-03-03)
    addMeal(db, { restaurantId: r1, userId, rating: 5, visitedAt: '2026-03-03T12:00:00' });

    rebuildProfile(db, userId);

    const rows = db.prepare(
      'SELECT * FROM user_meal_profiles WHERE user_id = ? ORDER BY day_of_week, meal_period'
    ).all(userId);

    assert.equal(rows.length, 3, 'should have 3 distinct slot rows');

    const keys = rows.map(r => `${r.day_of_week}|${r.meal_period}`);
    assert.ok(keys.includes('1|lunch'), 'Monday lunch');
    assert.ok(keys.includes('1|dinner'), 'Monday dinner');
    assert.ok(keys.includes('2|lunch'), 'Tuesday lunch');
  });

  it('replaces old profile rows on rebuild (no duplicates)', () => {
    const r1 = addRestaurant(db, 'Place', 2, userId);

    // Monday lunch
    addMeal(db, { restaurantId: r1, userId, rating: 4, visitedAt: '2026-03-02T12:00:00' });

    rebuildProfile(db, userId);
    let rows = db.prepare('SELECT * FROM user_meal_profiles WHERE user_id = ?').all(userId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].avg_rating_threshold, 4);

    // Add another meal in the same slot and rebuild
    addMeal(db, { restaurantId: r1, userId, rating: 2, visitedAt: '2026-03-09T13:00:00' }); // Monday lunch

    rebuildProfile(db, userId);
    rows = db.prepare('SELECT * FROM user_meal_profiles WHERE user_id = ?').all(userId);
    assert.equal(rows.length, 1, 'should still be 1 row, not 2');
    // avg rating should now be (4+2)/2 = 3
    assert.equal(rows[0].avg_rating_threshold, 3);
    assert.equal(rows[0].total_meals, 2);
  });

  it('computes meal_frequency as meals / total_weeks', () => {
    const r1 = addRestaurant(db, 'Place', 2, userId);

    // Span 2 weeks: first meal 2026-03-02, last meal 2026-03-16 (14 days = 2 weeks)
    // Monday lunch
    addMeal(db, { restaurantId: r1, userId, rating: 4, visitedAt: '2026-03-02T12:00:00' });
    addMeal(db, { restaurantId: r1, userId, rating: 3, visitedAt: '2026-03-09T12:00:00' });
    addMeal(db, { restaurantId: r1, userId, rating: 5, visitedAt: '2026-03-16T12:00:00' });

    rebuildProfile(db, userId);

    const row = db.prepare(
      "SELECT * FROM user_meal_profiles WHERE user_id = ? AND meal_period = 'lunch'"
    ).get(userId);

    assert.ok(row);
    // 3 meals / 2 weeks = 1.5
    assert.equal(row.meal_frequency, 1.5);
  });

  it('uses minimum 1 week when all meals are on the same day', () => {
    const r1 = addRestaurant(db, 'Place', 2, userId);

    // Two meals on the same day
    addMeal(db, { restaurantId: r1, userId, rating: 4, visitedAt: '2026-03-02T12:00:00' });
    addMeal(db, { restaurantId: r1, userId, rating: 3, visitedAt: '2026-03-02T13:00:00' });

    rebuildProfile(db, userId);

    const row = db.prepare(
      "SELECT * FROM user_meal_profiles WHERE user_id = ? AND meal_period = 'lunch'"
    ).get(userId);

    assert.ok(row);
    // 2 meals / 1 week (minimum) = 2
    assert.equal(row.meal_frequency, 2);
  });

  it('does nothing when user has no meals', () => {
    rebuildProfile(db, userId);

    const rows = db.prepare('SELECT * FROM user_meal_profiles WHERE user_id = ?').all(userId);
    assert.equal(rows.length, 0);
  });

  it('does not include other users meals', () => {
    const otherUserId = addUser(db, 'Bob');
    const r1 = addRestaurant(db, 'Place', 2, userId);

    // Alice's meal
    addMeal(db, { restaurantId: r1, userId, rating: 4, visitedAt: '2026-03-02T12:00:00' });
    // Bob's meal
    addMeal(db, { restaurantId: r1, userId: otherUserId, rating: 5, visitedAt: '2026-03-02T12:00:00' });

    rebuildProfile(db, userId);

    const rows = db.prepare('SELECT * FROM user_meal_profiles WHERE user_id = ?').all(userId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].total_meals, 1);
    assert.equal(rows[0].avg_rating_threshold, 4); // Alice's rating, not Bob's
  });
});
