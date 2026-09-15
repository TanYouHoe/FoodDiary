// Connector test: the authenticate middleware with a fake request and response.
// The zone rules are tested in tests/profile.test.js; this checks the wiring.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { openDatabase } from '../server/db.js';
import { makeTokens, makeAuthenticate } from '../server/auth.js';

const NOW = new Date('2026-03-29T12:00:00Z');

describe('makeAuthenticate time zone change', () => {
  let db;
  let userId;
  let rebuilds;
  const tokens = makeTokens('test-secret');

  const run = (zone) => {
    const authenticate = makeAuthenticate({
      db, tokens, defaultTimeZone: 'Asia/Kuala_Lumpur', now: () => NOW, requireTotp: false,
      onTimeZoneChange: (id) => rebuilds.push(id),
    });
    const token = tokens.signSession({ userId, tokenVersion: 0, scope: 'full' }, NOW);
    const headers = { authorization: `Bearer ${token}`, 'x-time-zone': zone };
    const req = { method: 'GET', originalUrl: '/api/profile', headers, get: (name) => headers[name.toLowerCase()] };
    const res = new EventEmitter();
    let nextCalled = false;
    authenticate(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    return { req, res };
  };

  beforeEach(() => {
    db = openDatabase(':memory:', { defaultTimeZone: 'Asia/Kuala_Lumpur' });
    userId = Number(db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('A', 'a@test.com', 'hash')").run().lastInsertRowid);
    rebuilds = [];
  });

  it('rebuilds after the response finishes, once', () => {
    const { req, res } = run('UTC');
    assert.equal(req.timeZone, 'UTC');
    assert.deepEqual(rebuilds, [], 'not inline');
    res.emit('finish');
    res.emit('close');
    assert.deepEqual(rebuilds, [userId]);
  });

  it('still rebuilds, once, when the connection closes without finishing', () => {
    const { res } = run('UTC');
    res.emit('close');
    assert.deepEqual(rebuilds, [userId], 'a dropped connection still rebuilds');
    res.emit('finish');
    res.emit('close');
    assert.deepEqual(rebuilds, [userId], 'only once');
  });

  it('schedules nothing when the zone is not stored', () => {
    const { req, res } = run('Mars/Olympus');
    assert.equal(req.timeZone, 'Asia/Kuala_Lumpur');
    res.emit('finish');
    res.emit('close');
    assert.deepEqual(rebuilds, []);
  });
});

describe('makeTokens', () => {
  const tokens = makeTokens('test-secret');
  const later = (seconds) => new Date(NOW.getTime() + seconds * 1000);

  it('a session token expires after seven days of the injected clock', () => {
    const token = tokens.signSession({ userId: 1, tokenVersion: 2, scope: 'full' }, NOW);
    assert.equal(tokens.verifySession(token, later(7 * 24 * 3600 - 1)).tv, 2);
    assert.equal(tokens.verifySession(token, later(7 * 24 * 3600)), null);
  });

  it('an mfa token expires after five minutes and is never a session', () => {
    const token = tokens.signMfa({ userId: 1, tokenVersion: 0 }, NOW);
    assert.equal(tokens.verifyMfa(token, later(299)).id, 1);
    assert.equal(tokens.verifyMfa(token, later(300)), null);
    assert.equal(tokens.verifySession(token, NOW), null);
    assert.equal(tokens.verifyMfa(tokens.signSession({ userId: 1, tokenVersion: 0, scope: 'full' }, NOW), NOW), null);
  });

  it('another secret or garbage is refused', () => {
    assert.equal(tokens.verifySession(makeTokens('other').signSession({ userId: 1, tokenVersion: 0, scope: 'full' }, NOW), NOW), null);
    assert.equal(tokens.verifySession('garbage', NOW), null);
    assert.equal(tokens.verifyMfa(undefined, NOW), null);
  });
});
