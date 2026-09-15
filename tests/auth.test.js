// Connector test: the authenticate middleware with a fake request and response.
// The zone rules are tested in tests/profile.test.js; this checks the wiring.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { openDatabase } from '../server/db.js';
import { makeTokens, makeAuthenticate } from '../server/auth.js';

describe('makeAuthenticate time zone change', () => {
  let db;
  let userId;
  let rebuilds;
  const tokens = makeTokens('test-secret');

  const run = (zone) => {
    const authenticate = makeAuthenticate({
      db, tokens, defaultTimeZone: 'Asia/Kuala_Lumpur', now: () => new Date('2026-03-29T12:00:00Z'),
      onTimeZoneChange: (id) => rebuilds.push(id),
    });
    const headers = { authorization: `Bearer ${tokens.sign(userId)}`, 'x-time-zone': zone };
    const req = { headers, get: (name) => headers[name.toLowerCase()] };
    const res = new EventEmitter();
    let nextCalled = false;
    authenticate(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    return { req, res };
  };

  beforeEach(() => {
    db = openDatabase(':memory:', { defaultTimeZone: 'Asia/Kuala_Lumpur' });
    userId = db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('A', 'a@test.com', 'hash')").run().lastInsertRowid;
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
