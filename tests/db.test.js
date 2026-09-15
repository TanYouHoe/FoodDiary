// Connector test: the schema migrations and the at-open owner promotion.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from '../server/db.js';

const columns = (db, table) => db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map(c => c.name);

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

    const db = openDatabase(file);
    assert.ok(columns(db, 'users').includes('role'));
    assert.ok(columns(db, 'meal_types').includes('created_by'));
    assert.ok(columns(db, 'dish_types').includes('created_by'));
    assert.deepEqual(db.prepare('SELECT id, role FROM users ORDER BY id').all(), [{ id: 1, role: 'owner' }, { id: 2, role: 'member' }]);
    assert.throws(() => db.prepare("UPDATE users SET role = 'admin' WHERE id = 2").run(), /CHECK/);
    db.close();
  });

  it('promotes the lowest id only when no owner exists, on every open', () => {
    let db = openDatabase(file);
    const add = (email) => db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('U', ?, 'h')").run(email).lastInsertRowid;
    add('one@test.com');
    add('two@test.com');
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'owner'").get().c, 0);
    db.close();

    db = openDatabase(file);
    assert.deepEqual(db.prepare('SELECT id, role FROM users ORDER BY id').all(), [{ id: 1, role: 'owner' }, { id: 2, role: 'member' }]);
    db.prepare("UPDATE users SET role = 'member' WHERE id = 1").run();
    db.prepare("UPDATE users SET role = 'owner' WHERE id = 2").run();
    db.close();

    db = openDatabase(file);
    assert.deepEqual(db.prepare('SELECT id, role FROM users ORDER BY id').all(), [{ id: 1, role: 'member' }, { id: 2, role: 'owner' }]);
    db.close();
  });
});
