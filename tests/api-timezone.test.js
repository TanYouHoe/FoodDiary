// Integration test: time zones over real HTTP. Its own app, so the default
// zone and the clock are fixed and the database is reachable. The tests share
// users and a movable clock, and run in order.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callApi, eventually } from './helpers/http.js';
import { fakeGoogle, signInAs } from './helpers/auth.js';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { TIME_ZONE_CHANGE_INTERVAL_MS } from '../logic/meal-period.js';

const KL = 'Asia/Kuala_Lumpur';
// Saturday 20:30 UTC is Sunday 04:30 in Kuala Lumpur.
const SAT_EVENING_UTC = '2026-03-28T20:30:00.000Z';

describe('API time zones', () => {
  let at;
  let server;
  let db;
  let dir;
  let user;
  let place;
  let clock = new Date(SAT_EVENING_UTC);
  const google = fakeGoogle();

  const call = (method, path, options = {}) => callApi(`${at}${path}`, method, options);
  const slots = async (headers) => (await call('GET', '/profile', { token: user.token, headers })).body
    .map(r => `${r.day_of_week}|${r.meal_period}`);
  const me = async (headers) => (await call('GET', '/me', { token: user.token, headers })).body;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'fooddiary-tz-'));
    db = openDatabase(':memory:', { defaultTimeZone: KL });
    const { app } = createApp({
      db, uploadsDir: dir, defaultTimeZone: KL, verifyGoogle: google,
      now: () => clock, rng: () => 0.99, requireTotp: false,
    });
    await new Promise(resolve => { server = app.listen(0, resolve); });
    at = `http://127.0.0.1:${server.address().port}/api`;
    const token = await signInAs(db, `http://127.0.0.1:${server.address().port}`, { email: 'zoe@tz.test', name: 'Zoe', google });
    user = { ...(await call('GET', '/me', { token })).body, token };
    place = (await call('POST', '/restaurants', { token: user.token, body: { name: 'Night Stall' } })).body;
  });

  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) db.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('createApp needs a valid default zone', () => {
    assert.throws(() => createApp({ db, uploadsDir: dir, jwtSecret: 'x' }), /defaultTimeZone/);
    assert.throws(() => createApp({ db, uploadsDir: dir, jwtSecret: 'x', defaultTimeZone: '+08:00' }), /defaultTimeZone/);
  });

  it('a user with no stored zone gets the default zone', async () => {
    assert.equal(user.timezone, null);
    const r = await call('POST', '/meals', { token: user.token, body: { restaurant_id: place.id, rating: 4, visited_at: SAT_EVENING_UTC } });
    assert.equal(r.status, 201);
    assert.deepEqual(await slots(), ['0|breakfast']);
  });

  it('a zone-less visit time is refused', async () => {
    const r = await call('POST', '/meals', { token: user.token, body: { restaurant_id: place.id, rating: 4, visited_at: '2026-03-28T20:30:00' } });
    assert.deepEqual(r, { status: 400, body: { error: 'Visit time must include a time zone' } });
  });

  it('a visit time with an offset is stored in UTC', async () => {
    const created = await call('POST', '/meals', { token: user.token, body: { restaurant_id: place.id, rating: 4, visited_at: '2026-03-29T12:30:00+08:00' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.visited_at, '2026-03-29T04:30:00.000Z');
    const updated = await call('PUT', `/meals/${created.body.id}`, { token: user.token, body: { visited_at: '2026-03-28T16:30:00-04:00' } });
    assert.equal(updated.body.visited_at, SAT_EVENING_UTC);
    assert.equal(db.prepare('SELECT visited_at FROM meals WHERE id = ?').get(created.body.id).visited_at, SAT_EVENING_UTC);
    assert.equal((await call('DELETE', `/meals/${created.body.id}`, { token: user.token })).status, 204);
    assert.deepEqual(await slots(), ['0|breakfast']);
  });

  it('an invalid header is ignored', async () => {
    for (const zone of ['Mars/Olympus', '+08:00']) {
      assert.equal((await me({ 'X-Time-Zone': zone })).timezone, null);
      assert.deepEqual(await slots({ 'X-Time-Zone': zone }), ['0|breakfast']);
    }
  });

  it('a valid new header is stored, by its canonical name, and rebuilds the profile', async () => {
    assert.equal((await me({ 'X-Time-Zone': 'utc' })).timezone, 'UTC');
    assert.equal((await me()).timezone, 'UTC');
    assert.equal(db.prepare('SELECT timezone_updated_at FROM users WHERE id = ?').get(user.id).timezone_updated_at, SAT_EVENING_UTC);
    await eventually(async () => assert.deepEqual(await slots(), ['6|dinner']));
  });

  it('later rebuilds use the stored zone', async () => {
    // Sunday 04:30 UTC: breakfast in UTC, lunch in Kuala Lumpur.
    const r = await call('POST', '/meals', { token: user.token, body: { restaurant_id: place.id, rating: 4, visited_at: '2026-03-29T04:30:00.000Z' } });
    assert.equal(r.status, 201);
    assert.deepEqual((await slots()).sort(), ['0|breakfast', '6|dinner']);
  });

  it('suggestions read the day and period of now in the request zone', async () => {
    // Now is Saturday 20:30 UTC = Sunday 04:30 (breakfast) in KL. Yuki's one
    // meal, Sunday 02:00 UTC = Sunday 10:00 KL, is in the KL slot of now
    // (Sunday breakfast) and not in the UTC slot (Saturday dinner).
    const yuki = await signInAs(db, at.replace(/\/api$/, ''), { email: 'yuki@tz.test', name: 'Yuki', google });
    const cafe = (await call('POST', '/restaurants', { token: yuki, body: { name: 'Morning Cafe' } })).body;
    await call('POST', '/meals', { token: yuki, body: { restaurant_id: cafe.id, rating: 5, visited_at: '2026-03-22T02:00:00.000Z' } });

    const suggest = async (path, zone) => {
      const r = await call('GET', path, { token: yuki, headers: { 'X-Time-Zone': zone } });
      assert.equal(r.status, 200);
      return r.body;
    };
    const familiar = (list) => list.filter(s => s.suggestion_type === 'familiar').map(s => s.name);
    assert.deepEqual(familiar(await suggest('/suggest?type=meal', KL)), ['Morning Cafe']);
    // KL is now stored for Yuki; the UTC request is not stored, but it is still read in UTC.
    assert.deepEqual(familiar(await suggest('/suggest?type=meal', 'UTC')), []);

    // The scorer counts whole days from today: 2026-03-29 in KL, 2026-03-28 in UTC.
    const recency = (list) => list.find(s => s.id === cafe.id).scores.recency;
    assert.equal(recency(await suggest('/suggest', KL)), 6 / 30);
    assert.equal(recency(await suggest('/suggest', 'UTC')), 5 / 30);
  });

  it('a stored zone changes at most once in six hours', async () => {
    const stored = () => db.prepare('SELECT timezone, timezone_updated_at FROM users WHERE id = ?').get(user.id);
    // A rebuild replaces the rows, so their ids show whether one happened.
    const profileIds = async () => (await call('GET', '/profile', { token: user.token })).body.map(r => r.id);
    const before = stored();
    assert.equal(before.timezone, 'UTC');
    const ids = await profileIds();

    for (const zone of [KL, 'UTC', KL]) await me({ 'X-Time-Zone': zone });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual(stored(), before);
    assert.deepEqual(await profileIds(), ids);

    clock = new Date(clock.getTime() + TIME_ZONE_CHANGE_INTERVAL_MS + 1000);
    assert.equal((await me({ 'X-Time-Zone': KL })).timezone, KL);
    assert.deepEqual(stored(), { timezone: KL, timezone_updated_at: clock.toISOString() });
    await eventually(async () => assert.deepEqual((await slots()).sort(), ['0|breakfast', '0|lunch']));
  });
});
