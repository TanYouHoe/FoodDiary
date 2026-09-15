// Connector test: the schema migrations and the at-open owner promotion.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from '../server/db.js';
import { createInvite, makeInvites } from '../server/invites.js';

const NOW = new Date('2026-09-16T10:00:00.000Z');
const columns = (db, table) => db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map(c => c.name);
const addUser = (db, email, role) => db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('U', ?, 'h', ?)")
  .run(email, role).lastInsertRowid;

describe('openDatabase', () => {
  let dir;
  let file;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'fooddiary-db-')); file = join(dir, 'test.db'); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('adds role and created_by to an old database', () => {
    const old = new Database(file);
    old.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, avatar_url TEXT, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE meal_types (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, cuisine_type TEXT, slots TEXT NOT NULL);
      CREATE TABLE dish_types (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, keywords TEXT NOT NULL DEFAULT '[]', is_seed INTEGER DEFAULT 0);
      INSERT INTO users (name, email, password_hash) VALUES ('Zed', 'z@test.com', 'h'), ('Amy', 'a@test.com', 'h');
    `);
    old.close();

    const db = openDatabase(file, { defaultTimeZone: 'UTC' });
    assert.ok(columns(db, 'users').includes('role'));
    assert.ok(columns(db, 'meal_types').includes('created_by'));
    assert.ok(columns(db, 'dish_types').includes('created_by'));
    assert.deepEqual(db.prepare('SELECT id, role FROM users ORDER BY id').all(), [{ id: 1, role: 'owner' }, { id: 2, role: 'member' }]);
    assert.throws(() => db.prepare("UPDATE users SET role = 'admin' WHERE id = 2").run(), /CHECK/);
    db.close();
  });

  it('in a database from before invites, promotes the lowest id only when no owner exists, on every open', () => {
    const old = new Database(file);
    old.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, avatar_url TEXT, created_at TEXT DEFAULT (datetime('now')));
      INSERT INTO users (name, email, password_hash) VALUES ('U', 'one@test.com', 'h'), ('U', 'two@test.com', 'h');
    `);
    old.close();

    let db = openDatabase(file, { defaultTimeZone: 'UTC' });
    assert.deepEqual(db.prepare('SELECT value FROM meta WHERE key = ?').get('legacy_owner_promotion'), { value: '1' });
    db.prepare("UPDATE users SET role = 'member'").run();
    db.close();

    db = openDatabase(file, { defaultTimeZone: 'UTC' });
    assert.deepEqual(db.prepare('SELECT id, role FROM users ORDER BY id').all(), [{ id: 1, role: 'owner' }, { id: 2, role: 'member' }]);
    db.prepare("UPDATE users SET role = 'member' WHERE id = 1").run();
    db.prepare("UPDATE users SET role = 'owner' WHERE id = 2").run();
    db.close();

    db = openDatabase(file, { defaultTimeZone: 'UTC' });
    assert.deepEqual(db.prepare('SELECT id, role FROM users ORDER BY id').all(), [{ id: 1, role: 'member' }, { id: 2, role: 'owner' }]);
    db.close();
  });

  it('a fresh database: a member who signs up through an invite never becomes owner', () => {
    let db = openDatabase(file, { defaultTimeZone: 'UTC' });
    assert.equal(db.prepare('SELECT 1 FROM meta WHERE key = ?').get('legacy_owner_promotion'), undefined);
    const { code } = createInvite(db, { role: 'member', now: NOW }).invite;
    const userId = makeInvites(db).redeem(code, NOW, (role) => addUser(db, 'member@test.com', role));
    assert.ok(userId);
    db.close();

    db = openDatabase(file, { defaultTimeZone: 'UTC' });
    assert.deepEqual(db.prepare('SELECT id, role FROM users').all(), [{ id: userId, role: 'member' }]);
    assert.equal(db.prepare('SELECT 1 FROM meta WHERE key = ?').get('legacy_owner_promotion'), undefined);
    db.close();
  });

  it('a fresh database: the user of an owner invite is owner, and stays owner', () => {
    let db = openDatabase(file, { defaultTimeZone: 'UTC' });
    const { code } = createInvite(db, { role: 'owner', now: NOW }).invite;
    const ownerId = makeInvites(db).redeem(code, NOW, (role) => addUser(db, 'owner@test.com', role));
    assert.deepEqual(createInvite(db, { role: 'owner', now: NOW }), { ok: false, error: 'An owner already exists' });
    db.close();

    db = openDatabase(file, { defaultTimeZone: 'UTC' });
    assert.deepEqual(db.prepare('SELECT id, role FROM users').all(), [{ id: ownerId, role: 'owner' }]);
    db.close();
  });

  it('needs a valid default time zone', () => {
    assert.throws(() => openDatabase(':memory:'), /defaultTimeZone/);
    assert.throws(() => openDatabase(':memory:', { defaultTimeZone: '+08:00' }), /defaultTimeZone/);
  });

  it('converts zone-less visit times to UTC once, reading them in the default zone', () => {
    // Build a database, then make it look like one from before the conversion.
    let db = openDatabase(file, { defaultTimeZone: 'UTC' });
    const user = db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('U', 'u@test.com', 'h')").run().lastInsertRowid;
    const place = db.prepare('INSERT INTO restaurants (name, added_by) VALUES (?, ?)').run('P', user).lastInsertRowid;
    const addMeal = (visitedAt) => db.prepare('INSERT INTO meals (restaurant_id, user_id, rating, visited_at) VALUES (?, ?, 4, ?)')
      .run(place, user, visitedAt).lastInsertRowid;
    const legacy = addMeal('2026-03-29T12:30:00');
    const legacySpace = addMeal('2026-03-29 20:00:00');
    const utc = addMeal('2026-03-29T01:00:00.000Z');
    const unreadable = addMeal('sometime last week');
    db.exec('DROP TABLE meta');
    db.close();

    const visitedAt = (id) => db.prepare('SELECT visited_at FROM meals WHERE id = ?').get(id).visited_at;
    db = openDatabase(file, { defaultTimeZone: 'Asia/Kuala_Lumpur' });
    assert.equal(visitedAt(legacy), '2026-03-29T04:30:00.000Z');
    assert.equal(visitedAt(legacySpace), '2026-03-29T12:00:00.000Z');
    assert.equal(visitedAt(utc), '2026-03-29T01:00:00.000Z');
    assert.equal(visitedAt(unreadable), 'sometime last week');
    const later = addMeal('2026-04-01T09:00:00');
    db.close();

    // Recorded as done: a later open, in any zone, converts nothing.
    db = openDatabase(file, { defaultTimeZone: 'UTC' });
    assert.equal(visitedAt(later), '2026-04-01T09:00:00');
    assert.equal(visitedAt(legacy), '2026-03-29T04:30:00.000Z');
    db.close();
  });
});
