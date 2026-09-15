// Connector test: the reset-two-factor command, run as a function against a
// temp database file. It never opens the repo database: every case names a path.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runResetTwoFactor } from '../tools/reset-two-factor.js';
import { openDatabase } from '../server/db.js';

describe('runResetTwoFactor', () => {
  let dir;
  let file;
  let lines;
  let opened;
  const openDb = (path) => { opened.push(path); return openDatabase(path, { defaultTimeZone: 'UTC' }); };
  const run = (args, env = {}) => runResetTwoFactor({ args, env, openDb, print: (line) => lines.push(line) });
  const withDb = (fn) => {
    const db = openDatabase(file, { defaultTimeZone: 'UTC' });
    try { return fn(db); } finally { db.close(); }
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fooddiary-reset-'));
    file = join(dir, 'reset-test.db');
    lines = [];
    opened = [];
    withDb((db) => {
      const id = db.prepare("INSERT INTO users (name, email, password_hash, role, totp_secret, totp_enabled_at, totp_last_step) VALUES ('O', 'owner@cli.test', 'h', 'owner', 'SECRET', '2026-09-16', 7)").run().lastInsertRowid;
      db.prepare("INSERT INTO backup_codes (user_id, code_hash) VALUES (?, 'x'), (?, 'y')").run(id, id);
      db.prepare("INSERT INTO users (name, email, password_hash, totp_secret, totp_enabled_at) VALUES ('M', 'member@cli.test', 'h', 'OTHER', '2026-09-16')").run();
    });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('refuses to run without a database or an email, and opens nothing', () => {
    assert.deepEqual(run([]), { exitCode: 1 });
    assert.deepEqual(run(['--email', 'owner@cli.test']), { exitCode: 1 });
    assert.deepEqual(run(['--db']), { exitCode: 1 });
    assert.deepEqual(run(['--db', file]), { exitCode: 1 });
    assert.deepEqual(run(['--db', file, '--email']), { exitCode: 1 });
    assert.deepEqual(opened, []);
    assert.ok(lines.some(line => /--db <path>/.test(line) && /--email/.test(line) && /FOOD_DIARY_DATA_DIR/.test(line)), 'prints the usage');
  });

  it('clears the factor and backup codes and ends the sessions of that user only', () => {
    assert.deepEqual(run(['--db', file, '--email', 'owner@cli.test']), { exitCode: 0 });
    assert.deepEqual(opened, [file]);
    assert.ok(lines.some(line => line.includes('owner@cli.test')));
    withDb((db) => {
      assert.deepEqual(db.prepare("SELECT totp_secret, totp_enabled_at, totp_last_step, token_version FROM users WHERE email = 'owner@cli.test'").get(),
        { totp_secret: null, totp_enabled_at: null, totp_last_step: null, token_version: 1 });
      assert.equal(db.prepare('SELECT COUNT(*) AS c FROM backup_codes').get().c, 0);
      assert.deepEqual(db.prepare("SELECT totp_secret, token_version FROM users WHERE email = 'member@cli.test'").get(),
        { totp_secret: 'OTHER', token_version: 0 });
    });
  });

  it('uses <FOOD_DIARY_DATA_DIR>/fooddiary.db when no --db is given', () => {
    assert.deepEqual(run(['--email', 'nobody@cli.test'], { FOOD_DIARY_DATA_DIR: dir }), { exitCode: 1 });
    assert.deepEqual(opened, [join(dir, 'fooddiary.db')]);
  });

  it('exits 1 when no user has that email, and changes nothing', () => {
    assert.deepEqual(run(['--db', file, '--email', 'ghost@cli.test']), { exitCode: 1 });
    assert.ok(lines.some(line => line.includes('ghost@cli.test')));
    withDb((db) => assert.equal(db.prepare("SELECT token_version FROM users WHERE email = 'owner@cli.test'").get().token_version, 0));
  });
});
