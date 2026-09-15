// Connector: opens the SQLite database, applies the schema, runs the
// idempotent migrations and one-time data conversions, and seeds the
// built-in catalogue rows.

import Database from 'better-sqlite3';
import { SEED_MEAL_TYPES, SEED_DISH_TYPE_NAMES } from '../logic/catalog.js';
import { USER_ROLES, ownerToPromote } from '../logic/access.js';
import { isValidTimeZone, localDateTimeToInstant } from '../logic/meal-period.js';

const ROLE_LIST = Object.values(USER_ROLES).map(role => `'${role}'`).join(',');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS groups_ (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS restaurants (
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

  CREATE TABLE IF NOT EXISTS meals (
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

  CREATE TABLE IF NOT EXISTS meal_dishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meal_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cuisine_type TEXT,
    slots TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS planned_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    group_id INTEGER REFERENCES groups_(id) ON DELETE SET NULL,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dish_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    keywords TEXT NOT NULL DEFAULT '[]',
    is_seed INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_meal_profiles (
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

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_hash TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK(role IN (${ROLE_LIST})),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used_at TEXT,
    revoked_at TEXT
  );
`;

function hasColumn(db, table, column) {
  return Boolean(db.prepare(`SELECT * FROM pragma_table_info('${table}') WHERE name = ?`).get(column));
}

function hasTable(db, table) {
  try { db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get(); return true; } catch { return false; }
}

// Columns added after the first release, for databases created before them.
const ADDED_COLUMNS = [
  ['meals', 'photo_urls', "TEXT DEFAULT '[]'"],
  ['restaurants', 'photo_url', 'TEXT'],
  ['meals', 'title', 'TEXT'],
  ['meals', 'calories', 'INTEGER'],
  ['meals', 'dishes', 'TEXT'],
  ['meals', 'meal_type_id', 'INTEGER REFERENCES meal_types(id)'],
  ['meal_dishes', 'slot_name', 'TEXT'],
  ['meal_dishes', 'category', 'TEXT'],
  ['meal_types', 'is_seed', 'INTEGER DEFAULT 0'],
  ['users', 'role', `TEXT NOT NULL DEFAULT '${USER_ROLES.member}' CHECK(role IN (${ROLE_LIST}))`],
  ['meal_types', 'created_by', 'INTEGER REFERENCES users(id)'],
  ['dish_types', 'created_by', 'INTEGER REFERENCES users(id)'],
  ['users', 'timezone', 'TEXT'],
  ['users', 'timezone_updated_at', 'TEXT'],
];

function migrate(db) {
  for (const [table, column, type] of ADDED_COLUMNS) {
    try {
      if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch { /* a failed migration leaves the column as it was */ }
  }
  if (!hasTable(db, 'dish_types')) {
    db.exec("CREATE TABLE IF NOT EXISTS dish_types (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, keywords TEXT NOT NULL DEFAULT '[]', is_seed INTEGER DEFAULT 0)");
  }
}

const VISIT_TIMES_IN_UTC = 'visit_times_in_utc';

// Runs once per database: meals stored before visit times carried a zone are
// rewritten as UTC, read in the default zone (logic/meal-period.js converts).
// A value logic cannot read as a zone-less date-time is left as it is.
function convertZonelessVisitTimes(db, defaultTimeZone) {
  if (db.prepare('SELECT 1 FROM meta WHERE key = ?').get(VISIT_TIMES_IN_UTC)) return;
  const meals = db.prepare('SELECT id, visited_at FROM meals').all();
  const setVisitedAt = db.prepare('UPDATE meals SET visited_at = ? WHERE id = ?');
  db.transaction(() => {
    for (const meal of meals) {
      const instant = localDateTimeToInstant(meal.visited_at, defaultTimeZone);
      if (instant !== null) setVisitedAt.run(instant, meal.id);
    }
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(VISIT_TIMES_IN_UTC, defaultTimeZone);
  })();
}

function seed(db) {
  if (db.prepare('SELECT COUNT(*) as c FROM meal_types').get().c === 0) {
    const insert = db.prepare('INSERT INTO meal_types (name, cuisine_type, slots, is_seed) VALUES (?, ?, ?, 1)');
    for (const t of SEED_MEAL_TYPES) insert.run(t.name, t.cuisine_type, JSON.stringify(t.slots));
  }

  // Older databases inserted the built-ins without the flag.
  const names = SEED_MEAL_TYPES.map(t => t.name);
  db.prepare(`UPDATE meal_types SET is_seed = 1 WHERE (is_seed IS NULL OR is_seed = 0) AND name IN (${names.map(() => '?').join(',')})`).run(...names);

  if (db.prepare('SELECT COUNT(*) as c FROM dish_types').get().c === 0) {
    const insert = db.prepare('INSERT INTO dish_types (name, keywords, is_seed) VALUES (?, ?, 1)');
    for (const name of SEED_DISH_TYPE_NAMES) insert.run(name, '[]');
  }
}

const LEGACY_OWNER_PROMOTION = 'legacy_owner_promotion';

// Records, once, that the invites table arrived on a database that already
// held users. Call with what was true before the schema ran.
function recordLegacyOwnerPromotion(db, { hadInvitesTable, hadUsers }) {
  if (hadInvitesTable || !hadUsers) return;
  db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run(LEGACY_OWNER_PROMOTION, '1');
}

// Makes a user the owner when nobody is, in a database from before invites
// (logic/access.js decides who). Idempotent.
export function promoteOwner(db) {
  const hadUsersBeforeInvites = Boolean(db.prepare('SELECT 1 FROM meta WHERE key = ?').get(LEGACY_OWNER_PROMOTION));
  const id = ownerToPromote(db.prepare('SELECT id, role FROM users').all(), { hadUsersBeforeInvites });
  if (id != null) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(USER_ROLES.owner, id);
}

// path: a file path or ':memory:'. defaultTimeZone: the IANA zone old zone-less
// visit times are read in.
export function openDatabase(path, { defaultTimeZone } = {}) {
  if (!isValidTimeZone(defaultTimeZone)) throw new Error(`openDatabase: defaultTimeZone must be an IANA time zone, got ${defaultTimeZone}`);
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const before = {
    hadInvitesTable: hasTable(db, 'invites'),
    hadUsers: hasTable(db, 'users') && db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0,
  };
  db.exec(SCHEMA);
  recordLegacyOwnerPromotion(db, before);
  migrate(db);
  convertZonelessVisitTimes(db, defaultTimeZone);
  seed(db);
  promoteOwner(db);
  return db;
}
