// Connector test: the second-factor store on an in-memory database. Backup
// codes are hashed under a pepper, so a store with another JWT secret cannot
// use them.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openDatabase } from '../server/db.js';
import { makeTwoFactor, clearTwoFactor } from '../server/two-factor.js';
import { backupCodePepper } from '../server/totp-crypto.js';

const NOW = new Date('2026-09-16T10:00:00.000Z');

describe('makeTwoFactor backup codes', () => {
  let db;
  let userId;

  beforeEach(() => {
    db = openDatabase(':memory:', { defaultTimeZone: 'UTC' });
    userId = Number(db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('A', 'a@store.test', 'h')").run().lastInsertRowid);
  });

  it('stores HMAC hashes, not plain SHA-256, and verifies with the same secret only', () => {
    const store = makeTwoFactor(db, { backupCodePepper: backupCodePepper('secret-one') });
    const codes = store.regenerateBackupCodes(userId);
    const stored = db.prepare('SELECT code_hash FROM backup_codes WHERE user_id = ?').all(userId).map(r => r.code_hash);
    assert.equal(stored.length, 10);
    for (const code of codes) assert.ok(!stored.includes(createHash('sha256').update(code).digest('hex')));

    const other = makeTwoFactor(db, { backupCodePepper: backupCodePepper('secret-two') });
    assert.equal(other.useBackupCode(userId, codes[0], NOW), false, 'another JWT secret cannot verify it');
    assert.equal(store.useBackupCode(userId, codes[0], NOW), true);
    assert.equal(store.useBackupCode(userId, codes[0], NOW), false, 'single use');
  });

  it('needs a pepper', () => {
    assert.throws(() => makeTwoFactor(db, {}), /backupCodePepper/);
  });

  it('clearTwoFactor removes the factor and codes and raises the token version', () => {
    const store = makeTwoFactor(db, { backupCodePepper: backupCodePepper('secret-one') });
    store.regenerateBackupCodes(userId);
    db.prepare("UPDATE users SET totp_secret = 'X', totp_enabled_at = ?, totp_last_step = 5 WHERE id = ?").run(NOW.toISOString(), userId);
    clearTwoFactor(db, userId);
    assert.deepEqual(db.prepare('SELECT totp_secret, totp_enabled_at, totp_last_step, token_version FROM users WHERE id = ?').get(userId),
      { totp_secret: null, totp_enabled_at: null, totp_last_step: null, token_version: 1 });
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM backup_codes').get().c, 0);
  });
});
