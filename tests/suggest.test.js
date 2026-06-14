import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { scoreRestaurant, generateExplanation, suggestMeal, getSuggestions } from '../suggest.js';

describe('Suggestion Engine', () => {
  const today = '2026-03-28';

  it('gives high recency score to restaurants not visited recently', () => {
    const score = scoreRestaurant({
      lastVisitedAt: '2026-02-26', avgRating: 3,
      recentCuisines: ['Japanese', 'Italian', 'Chinese'],
      cuisine_type: 'Korean', visitCount: 5, maxVisitCount: 10, plannedPriority: null,
    }, today);
    assert.ok(score.recency >= 0.9, `recency should be ~1.0, got ${score.recency}`);
  });

  it('gives low recency score to recently visited restaurants', () => {
    const score = scoreRestaurant({
      lastVisitedAt: '2026-03-27', avgRating: 5,
      recentCuisines: ['Japanese'], cuisine_type: 'Korean',
      visitCount: 5, maxVisitCount: 10, plannedPriority: null,
    }, today);
    assert.ok(score.recency < 0.1, `recency should be ~0, got ${score.recency}`);
  });

  it('gives max recency score to never-visited restaurants', () => {
    const score = scoreRestaurant({
      lastVisitedAt: null, avgRating: 0,
      recentCuisines: ['Japanese'], cuisine_type: 'Korean',
      visitCount: 0, maxVisitCount: 10, plannedPriority: null,
    }, today);
    assert.equal(score.recency, 1.0);
  });

  it('boosts variety when cuisine differs from recent meals', () => {
    const score = scoreRestaurant({
      lastVisitedAt: '2026-03-20', avgRating: 4,
      recentCuisines: ['Japanese', 'Japanese', 'Italian'],
      cuisine_type: 'Mexican', visitCount: 3, maxVisitCount: 10, plannedPriority: null,
    }, today);
    assert.equal(score.variety, 1.0);
  });

  it('does not boost variety when cuisine matches recent meals', () => {
    const score = scoreRestaurant({
      lastVisitedAt: '2026-03-20', avgRating: 4,
      recentCuisines: ['Japanese', 'Italian', 'Mexican'],
      cuisine_type: 'Japanese', visitCount: 3, maxVisitCount: 10, plannedPriority: null,
    }, today);
    assert.equal(score.variety, 0);
  });

  it('adds planned visit bonus based on priority', () => {
    const high = scoreRestaurant({
      lastVisitedAt: null, avgRating: 0, recentCuisines: [],
      cuisine_type: 'Thai', visitCount: 0, maxVisitCount: 10, plannedPriority: 'high',
    }, today);
    const none = scoreRestaurant({
      lastVisitedAt: null, avgRating: 0, recentCuisines: [],
      cuisine_type: 'Thai', visitCount: 0, maxVisitCount: 10, plannedPriority: null,
    }, today);
    assert.ok(high.total > none.total, 'planned high should score higher');
  });

  it('generates human-readable explanation', () => {
    const explanation = generateExplanation({
      recency: 0.9, rating: 0.8, variety: 1.0,
      frequency: 0.5, planned: 0.3, total: 2.5,
    }, { lastVisitedAt: '2026-02-28', avgRating: 4, plannedPriority: 'high' });
    assert.ok(explanation.length > 0);
    assert.ok(explanation.includes('days'));
  });
});

// ---------------------------------------------------------------------------
// Profile-Driven Suggestions
// ---------------------------------------------------------------------------

/** Create the full schema needed for suggestMeal in an in-memory database. */
function createSuggestDb() {
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

    CREATE TABLE groups_ (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
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

    CREATE TABLE meal_dishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slot_name TEXT,
      category TEXT
    );

    CREATE TABLE meal_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cuisine_type TEXT,
      slots TEXT NOT NULL,
      is_seed INTEGER DEFAULT 0
    );

    CREATE TABLE planned_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      group_id INTEGER REFERENCES groups_(id) ON DELETE SET NULL,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
      notes TEXT,
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

function addUser(db, name) {
  return db.prepare(
    "INSERT INTO users (name, email, password_hash) VALUES (?, ?, 'hash')"
  ).run(name, `${name.toLowerCase().replace(/\s/g, '')}@test.com`).lastInsertRowid;
}

function addRestaurant(db, name, cuisine, priceRange, userId) {
  return db.prepare(
    'INSERT INTO restaurants (name, cuisine_type, price_range, added_by) VALUES (?, ?, ?, ?)'
  ).run(name, cuisine, priceRange, userId).lastInsertRowid;
}

function addMeal(db, { restaurantId, userId, rating, visitedAt, groupId }) {
  return db.prepare(
    'INSERT INTO meals (restaurant_id, user_id, group_id, rating, visited_at) VALUES (?, ?, ?, ?, ?)'
  ).run(restaurantId, userId, groupId ?? null, rating, visitedAt).lastInsertRowid;
}

function addProfile(db, { userId, dayOfWeek, mealPeriod, adventureRatio, totalMeals, avgPriceRange }) {
  db.prepare(`
    INSERT INTO user_meal_profiles
      (user_id, day_of_week, meal_period, adventure_ratio, total_meals, avg_price_range,
       avg_rating_threshold, meal_frequency, group_ratio)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)
  `).run(userId, dayOfWeek, mealPeriod, adventureRatio, totalMeals, avgPriceRange ?? 2);
}

function addPlannedVisit(db, { restaurantId, userId, priority }) {
  db.prepare(
    'INSERT INTO planned_visits (restaurant_id, user_id, priority) VALUES (?, ?, ?)'
  ).run(restaurantId, userId, priority);
}

describe('Profile-Driven Suggestions', () => {
  let db;
  let userId;

  // Use a fixed date: Sunday 2026-03-29 at 12:30 (lunch period, dayOfWeek=0)
  const testNow = new Date('2026-03-29T12:30:00');

  beforeEach(() => {
    db = createSuggestDb();
    userId = addUser(db, 'Alice');

    // Seed restaurants: mix of cuisines and price ranges
    addRestaurant(db, 'Fav Chinese', 'Chinese', 2, userId);  // id 1
    addRestaurant(db, 'Fav Malay', 'Malay', 2, userId);      // id 2
    addRestaurant(db, 'Fav Western', 'Western', 3, userId);   // id 3
    addRestaurant(db, 'New Thai', 'Thai', 2, userId);         // id 4
    addRestaurant(db, 'New Korean', 'Korean', 3, userId);     // id 5
    addRestaurant(db, 'New Japanese', 'Japanese', 2, userId); // id 6

    // Add meal history for the user at first 3 restaurants (familiar)
    // Meals visited recently (within last week) for familiarity
    addMeal(db, { restaurantId: 1, userId, rating: 5, visitedAt: '2026-03-22T12:00:00' });
    addMeal(db, { restaurantId: 1, userId, rating: 4, visitedAt: '2026-03-15T12:00:00' });
    addMeal(db, { restaurantId: 1, userId, rating: 5, visitedAt: '2026-03-08T12:00:00' });
    addMeal(db, { restaurantId: 2, userId, rating: 4, visitedAt: '2026-03-20T12:00:00' });
    addMeal(db, { restaurantId: 2, userId, rating: 3, visitedAt: '2026-03-13T12:00:00' });
    addMeal(db, { restaurantId: 3, userId, rating: 4, visitedAt: '2026-03-18T12:00:00' });
    // Restaurants 4, 5, 6 have no meals — they are "new"
  });

  it('low adventure_ratio produces mostly familiar suggestions', () => {
    // Profile: Sunday lunch, very low adventure ratio, enough total_meals for confidence
    addProfile(db, {
      userId, dayOfWeek: 0, mealPeriod: 'lunch',
      adventureRatio: 0.1, totalMeals: 25, avgPriceRange: 2,
    });

    // Run many times and count; due to randomness we aggregate
    let familiarCount = 0;
    let totalCount = 0;
    for (let i = 0; i < 50; i++) {
      const results = suggestMeal(db, { userId, now: testNow });
      for (const r of results) {
        totalCount++;
        if (r.suggestion_type === 'familiar') familiarCount++;
      }
    }

    // With 0.1 adventure ratio, ~90% of slots should be familiar
    const familiarRatio = familiarCount / totalCount;
    assert.ok(familiarRatio > 0.6,
      `Expected mostly familiar suggestions with low adventure_ratio, got ${(familiarRatio * 100).toFixed(0)}%`);
  });

  it('high adventure_ratio produces mostly new suggestions', () => {
    addProfile(db, {
      userId, dayOfWeek: 0, mealPeriod: 'lunch',
      adventureRatio: 0.9, totalMeals: 25, avgPriceRange: 2,
    });

    let newCount = 0;
    let totalCount = 0;
    for (let i = 0; i < 50; i++) {
      const results = suggestMeal(db, { userId, now: testNow });
      for (const r of results) {
        totalCount++;
        if (r.suggestion_type === 'new') newCount++;
      }
    }

    const newRatio = newCount / totalCount;
    assert.ok(newRatio > 0.6,
      `Expected mostly new suggestions with high adventure_ratio, got ${(newRatio * 100).toFixed(0)}%`);
  });

  it('falls back to general scoring when no profile exists (confidence = 0)', () => {
    // No profile row inserted — confidence is 0
    const results = suggestMeal(db, { userId, now: testNow });

    // Should still return suggestions (from getSuggestions fallback)
    assert.ok(results.length > 0, 'should return at least 1 suggestion');
    assert.ok(results.length <= 3, 'should return at most 3 suggestions');

    // All suggestions should be tagged as 'new' in fallback mode
    for (const r of results) {
      assert.equal(r.suggestion_type, 'new',
        'fallback suggestions should all be tagged as new');
    }
  });

  it('user filters override profile values (cuisine filter applied)', () => {
    addProfile(db, {
      userId, dayOfWeek: 0, mealPeriod: 'lunch',
      adventureRatio: 0.5, totalMeals: 25, avgPriceRange: 2,
    });

    // Filter by Chinese cuisine — only Chinese restaurants should appear
    const results = suggestMeal(db, { userId, cuisine: 'Chinese', now: testNow });

    for (const r of results) {
      assert.equal(r.cuisine_type, 'Chinese',
        `Expected only Chinese restaurants, got ${r.cuisine_type} for ${r.name}`);
    }
  });

  it('each suggestion has suggestion_type and first has is_top_pick: true', () => {
    addProfile(db, {
      userId, dayOfWeek: 0, mealPeriod: 'lunch',
      adventureRatio: 0.5, totalMeals: 25, avgPriceRange: 2,
    });

    const results = suggestMeal(db, { userId, now: testNow });
    assert.ok(results.length > 0, 'should have at least one suggestion');

    // First suggestion must be top pick
    assert.equal(results[0].is_top_pick, true, 'first suggestion should be is_top_pick');

    // All suggestions must have suggestion_type
    for (const r of results) {
      assert.ok(
        r.suggestion_type === 'familiar' || r.suggestion_type === 'new',
        `suggestion_type should be familiar or new, got ${r.suggestion_type}`
      );
    }

    // Non-first suggestions should NOT be top pick
    for (let i = 1; i < results.length; i++) {
      assert.equal(results[i].is_top_pick, false,
        `suggestion at index ${i} should not be is_top_pick`);
    }
  });
});
