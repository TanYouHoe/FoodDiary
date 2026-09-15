// Connector test: the create-invite command, run as a function against a temp
// database file. It never opens the repo database: every case names a path.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCreateInvite } from '../tools/create-invite.js';
import { openDatabase } from '../server/db.js';

const NOW = new Date('2026-09-16T10:00:00.000Z');
const CODE_URL = /\/invite\/[A-Za-z0-9_-]{32}$/;

describe('runCreateInvite', () => {
  let dir;
  let file;
  let lines;
  let opened;
  const openDb = (path) => { opened.push(path); return openDatabase(path, { defaultTimeZone: 'UTC' }); };
  const run = (args, env = {}) => runCreateInvite({ args, env, now: NOW, openDb, print: (line) => lines.push(line) });
  const urlLine = () => lines.find(line => CODE_URL.test(line));
  const invites = () => {
    const db = openDatabase(file, { defaultTimeZone: 'UTC' });
    try { return db.prepare('SELECT role, created_at FROM invites ORDER BY id').all(); } finally { db.close(); }
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fooddiary-cli-'));
    file = join(dir, 'invites-test.db');
    lines = [];
    opened = [];
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('refuses to run without --db or FOOD_DIARY_DATA_DIR, and opens nothing', () => {
    assert.deepEqual(run([]), { exitCode: 1 });
    assert.deepEqual(run(['--owner']), { exitCode: 1 });
    assert.deepEqual(run(['--db']), { exitCode: 1 });
    assert.deepEqual(opened, []);
    assert.ok(lines.some(line => /--db <path>/.test(line) && /FOOD_DIARY_DATA_DIR/.test(line)), 'prints the usage');
  });

  it('makes a member invite in the named file, linked on localhost:3004 by default', () => {
    assert.deepEqual(run(['--db', file]), { exitCode: 0 });
    assert.deepEqual(opened, [file]);
    assert.match(urlLine(), /^http:\/\/localhost:3004\/invite\//);
    assert.deepEqual(invites(), [{ role: 'member', created_at: NOW.toISOString() }]);
  });

  it('makes an owner invite with --owner, linked on PUBLIC_ORIGIN', () => {
    assert.deepEqual(run(['--owner', '--db', file], { PUBLIC_ORIGIN: 'https://food.example.test' }), { exitCode: 0 });
    assert.match(urlLine(), /^https:\/\/food\.example\.test\/invite\//);
    assert.deepEqual(invites().map(i => i.role), ['owner']);
  });

  it('uses <FOOD_DIARY_DATA_DIR>/fooddiary.db when no --db is given', () => {
    assert.deepEqual(run([], { FOOD_DIARY_DATA_DIR: dir }), { exitCode: 0 });
    assert.deepEqual(opened, [join(dir, 'fooddiary.db')]);
  });

  it('--db wins over FOOD_DIARY_DATA_DIR', () => {
    assert.deepEqual(run(['--db', file], { FOOD_DIARY_DATA_DIR: join(dir, 'other') }), { exitCode: 0 });
    assert.deepEqual(opened, [file]);
  });

  it('exits 1 with the refusal when an owner already exists, and makes no invite', () => {
    const db = openDatabase(file, { defaultTimeZone: 'UTC' });
    db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('O', 'o@cli.test', 'h', 'owner')").run();
    db.close();
    assert.deepEqual(run(['--owner', '--db', file]), { exitCode: 1 });
    assert.ok(lines.includes('An owner already exists'));
    assert.equal(urlLine(), undefined);
    assert.deepEqual(invites(), []);
  });
});
