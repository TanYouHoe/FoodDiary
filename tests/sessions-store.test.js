// Connector test: completing the code step (server/sessions.js completeMfa) on
// an in-memory database. The version and the factor are checked again inside
// the transaction that spends the mfa token.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.js';
import { makeTokens } from '../server/auth.js';
import { makeSessions } from '../server/sessions.js';

const NOW = new Date('2026-09-16T10:00:00.000Z');

describe('makeSessions completeMfa', () => {
  let db;
  let userId;
  let sessions;
  const tokens = makeTokens('test-secret');
  const claims = () => tokens.verifyMfa(tokens.signMfa({ userId, tokenVersion: 0 }, NOW), NOW);

  beforeEach(() => {
    db = openDatabase(':memory:', { defaultTimeZone: 'UTC' });
    userId = Number(db.prepare("INSERT INTO users (name, email, password_hash, totp_secret, totp_enabled_at) VALUES ('A', 'a@s.test', 'h', 'S', ?)")
      .run(NOW.toISOString()).lastInsertRowid);
    sessions = makeSessions({ db, tokens, requireTotp: true, now: () => NOW });
  });

  it('issues a full session once per mfa token', () => {
    const step = claims();
    const first = sessions.completeMfa(step);
    assert.ok(first.token);
    assert.equal(first.user.totp_enabled, true);
    assert.equal(sessions.isMfaTokenSpent(step), true);
    assert.equal(sessions.completeMfa(step), null);
  });

  it('refuses when the token version changed after the proof, and spends nothing', () => {
    const step = claims();
    db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
    assert.equal(sessions.completeMfa(step), null);
    assert.equal(sessions.isMfaTokenSpent(step), false);
  });

  it('refuses when the factor was removed after the proof', () => {
    const step = claims();
    db.prepare('UPDATE users SET totp_enabled_at = NULL WHERE id = ?').run(userId);
    assert.equal(sessions.completeMfa(step), null);
  });
});
