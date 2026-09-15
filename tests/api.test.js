// Integration test: the whole HTTP API, driven over real HTTP.
//
// By default it builds the app on an in-memory database and a temp uploads dir.
// Set FOOD_DIARY_TEST_BASE (e.g. http://127.0.0.1:3999) to run the same
// assertions against a server that is already running on a fresh database.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { callApi } from './helpers/http.js';

let base = process.env.FOOD_DIARY_TEST_BASE ? `${process.env.FOOD_DIARY_TEST_BASE}/api` : null;
let server = null;
let tmp = null;

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
  'base64',
);

// at: the API base URL; defaults to the shared server.
const call = (method, path, { at = base, ...options } = {}) => callApi(`${at}${path}`, method, options);

async function upload(path, field, count, token, at = base) {
  const form = new FormData();
  for (let i = 0; i < count; i++) form.append(field, new Blob([PNG], { type: 'image/png' }), `p${i}.png`);
  const res = await fetch(`${at}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  if (base) return;
  tmp = mkdtempSync(join(tmpdir(), 'fooddiary-test-'));
  const { openDatabase } = await import('../server/db.js');
  const { createApp } = await import('../server/app.js');
  const db = openDatabase(':memory:', { defaultTimeZone: 'Asia/Kuala_Lumpur' });
  const { app } = createApp({ db, uploadsDir: tmp, jwtSecret: 'test-secret', defaultTimeZone: 'Asia/Kuala_Lumpur' });
  await new Promise(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('API', () => {
  let token;
  let token2;
  let restaurantId;
  let restaurant2Id;
  let mealId;

  it('health is ok', async () => {
    const r = await call('GET', '/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { status: 'ok' });
  });

  it('register creates a user and hides the password hash', async () => {
    const r = await call('POST', '/auth/register', { body: { name: ' Alice ', email: 'alice@test.com', password: 'pw123' } });
    assert.equal(r.status, 201);
    assert.ok(r.body.token);
    assert.equal(r.body.user.name, 'Alice');
    assert.equal(r.body.user.email, 'alice@test.com');
    assert.ok(!('password_hash' in r.body.user));
    token = r.body.token;
  });

  it('register rejects missing fields and duplicate email', async () => {
    assert.equal((await call('POST', '/auth/register', { body: { email: 'x@test.com' } })).status, 400);
    assert.equal((await call('POST', '/auth/register', { body: { name: 'A', email: 'alice@test.com', password: 'x' } })).status, 409);
  });

  it('login accepts valid credentials and rejects bad ones', async () => {
    const ok = await call('POST', '/auth/login', { body: { email: 'alice@test.com', password: 'pw123' } });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);
    assert.ok(!('password_hash' in ok.body.user));
    assert.equal((await call('POST', '/auth/login', { body: { email: 'alice@test.com', password: 'nope' } })).status, 401);
    assert.equal((await call('POST', '/auth/login', { body: { email: 'ghost@test.com', password: 'x' } })).status, 401);
    assert.equal((await call('POST', '/auth/login', { body: {} })).status, 400);
  });

  it('me needs a valid token', async () => {
    const r = await call('GET', '/auth/me', { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.email, 'alice@test.com');
    assert.ok(!('password_hash' in r.body));
    assert.equal((await call('GET', '/auth/me')).status, 401);
    assert.equal((await call('GET', '/auth/me', { token: 'garbage' })).status, 401);
  });

  it('google login without a credential is 400', async () => {
    assert.equal((await call('POST', '/auth/google', { body: {} })).status, 400);
  });

  it('restaurants: create, read, filter, update, 404', async () => {
    assert.equal((await call('POST', '/restaurants', { token, body: { name: '  ' } })).status, 400);
    const a = await call('POST', '/restaurants', { token, body: { name: ' Nasi Place ', cuisine_type: 'Malay', price_range: 1, address: 'KL' } });
    assert.equal(a.status, 201);
    assert.equal(a.body.name, 'Nasi Place');
    assert.equal(a.body.cuisine_type, 'Malay');
    assert.equal(a.body.price_range, 1);
    restaurantId = a.body.id;
    const b = await call('POST', '/restaurants', { token, body: { name: 'Sushi Bar', cuisine_type: 'Japanese', price_range: 3 } });
    restaurant2Id = b.body.id;

    assert.equal((await call('GET', `/restaurants/${restaurantId}`, { token })).body.name, 'Nasi Place');
    assert.equal((await call('GET', '/restaurants/9999', { token })).status, 404);
    assert.equal((await call('GET', '/restaurants', { token })).body.length, 2);
    assert.deepEqual((await call('GET', '/restaurants?cuisine=Japanese', { token })).body.map(r => r.name), ['Sushi Bar']);
    assert.deepEqual((await call('GET', '/restaurants?price_range=1', { token })).body.map(r => r.name), ['Nasi Place']);
    assert.deepEqual((await call('GET', '/restaurants?search=sushi', { token })).body.map(r => r.name), ['Sushi Bar']);

    const u = await call('PUT', `/restaurants/${restaurant2Id}`, { token, body: { name: 'Sushi Bar 2', cuisine_type: 'Japanese', price_range: 2 } });
    assert.equal(u.status, 200);
    assert.equal(u.body.name, 'Sushi Bar 2');
    assert.equal(u.body.address, null);
    assert.equal((await call('PUT', '/restaurants/9999', { token, body: { name: 'x' } })).status, 404);
    assert.equal((await call('GET', '/restaurants')).status, 401);
  });

  it('restaurant photo upload stores a url', async () => {
    const r = await upload(`/restaurants/${restaurantId}/photo`, 'photo', 1, token);
    assert.equal(r.status, 200);
    assert.match(r.body.photo_url, /^\/uploads\/.+p0\.png$/);
    assert.equal((await call('GET', `/restaurants/${restaurantId}`, { token })).body.photo_url, r.body.photo_url);
  });

  it('meal types: 12 built-in with parsed slots, custom CRUD, built-ins locked', async () => {
    const all = await call('GET', '/meal-types', { token });
    assert.equal(all.status, 200);
    assert.equal(all.body.length, 12);
    assert.ok(all.body.every(t => Array.isArray(t.slots) && t.is_seed === 1));
    const japanese = await call('GET', '/meal-types?cuisine_type=Japanese', { token });
    assert.deepEqual(japanese.body.map(t => t.name), ['Japanese Bento', 'Japanese Teishoku', 'Simple Meal']);

    assert.equal((await call('POST', '/meal-types', { token, body: { name: 'X' } })).status, 400);
    const c = await call('POST', '/meal-types', { token, body: { name: 'Dim Sum', slots: [{ name: 'Main' }] } });
    assert.equal(c.status, 201);
    assert.deepEqual(c.body.slots, [{ name: 'Main' }]);
    assert.equal(c.body.cuisine_type, null);
    const u = await call('PUT', `/meal-types/${c.body.id}`, { token, body: { name: 'Dim Sum 2', cuisine_type: 'Chinese', slots: [{ name: 'Side' }] } });
    assert.equal(u.status, 200);
    assert.equal(u.body.name, 'Dim Sum 2');
    assert.deepEqual(u.body.slots, [{ name: 'Side' }]);

    const seedId = all.body[0].id;
    assert.equal((await call('PUT', `/meal-types/${seedId}`, { token, body: { name: 'n', slots: [] } })).status, 403);
    assert.equal((await call('DELETE', `/meal-types/${seedId}`, { token })).status, 403);
    assert.equal((await call('PUT', '/meal-types/9999', { token, body: { name: 'n', slots: [] } })).status, 404);
    assert.equal((await call('DELETE', `/meal-types/${c.body.id}`, { token })).status, 204);
    assert.equal((await call('DELETE', `/meal-types/${c.body.id}`, { token })).status, 404);
  });

  it('dish types: 9 built-in, custom CRUD, duplicates 409, built-ins locked', async () => {
    const all = await call('GET', '/dish-types', { token });
    assert.equal(all.body.length, 9);
    assert.equal((await call('POST', '/dish-types', { token, body: {} })).status, 400);
    assert.equal((await call('POST', '/dish-types', { token, body: { name: 'Soup' } })).status, 409);
    const c = await call('POST', '/dish-types', { token, body: { name: ' Curry ' } });
    assert.equal(c.status, 201);
    assert.equal(c.body.name, 'Curry');
    assert.equal((await call('PUT', `/dish-types/${c.body.id}`, { token, body: { name: 'Rice' } })).status, 409);
    assert.equal((await call('PUT', `/dish-types/${c.body.id}`, { token, body: { name: 'Curries' } })).body.name, 'Curries');
    const seed = all.body.find(t => t.name === 'Soup');
    assert.equal((await call('PUT', `/dish-types/${seed.id}`, { token, body: { name: 'x' } })).status, 403);
    assert.equal((await call('DELETE', `/dish-types/${seed.id}`, { token })).status, 403);
    assert.equal((await call('DELETE', `/dish-types/${c.body.id}`, { token })).status, 204);
  });

  it('meals: create auto-categorises dishes and returns joined fields', async () => {
    assert.equal((await call('POST', '/meals', { token, body: { restaurant_id: restaurantId } })).status, 400);
    const r = await call('POST', '/meals', {
      token,
      body: {
        restaurant_id: restaurantId, rating: 4, visited_at: '2026-09-01T12:30:00.000Z', title: 'Lunch', calories: 650,
        dishes: ['Tom Yum Soup', { name: 'Fried Rice with Side' }, { name: 'Teh Tarik', category: 'drink' }, '  ', { name: '' }],
      },
    });
    assert.equal(r.status, 201);
    mealId = r.body.id;
    assert.equal(r.body.restaurant_name, 'Nasi Place');
    assert.equal(r.body.cuisine_type, 'Malay');
    assert.equal(r.body.user_name, 'Alice');
    assert.equal(r.body.title, 'Lunch');
    assert.equal(r.body.calories, 650);
    assert.equal(r.body.photo_urls, '[]');
    assert.deepEqual(r.body.dishes.map(d => [d.name, d.category]), [
      ['Tom Yum Soup', 'soup'], ['Fried Rice with Side', 'rice'], ['Teh Tarik', 'drink'],
    ]);
    assert.ok(r.body.dishes.every(d => Number.isInteger(d.id)));

    await call('POST', '/meals', { token, body: { restaurant_id: restaurant2Id, rating: 5, visited_at: '2026-09-03T19:00:00.000Z', dishes: ['Salmon Roll'] } });
    const list = await call('GET', '/meals', { token });
    assert.equal(list.body.length, 2);
    assert.equal(list.body[0].restaurant_name, 'Sushi Bar 2');
    assert.deepEqual(list.body[0].dishes.map(d => d.category), ['main']);
    assert.equal((await call('GET', `/meals?restaurant_id=${restaurantId}`, { token })).body.length, 1);
  });

  it('meals: update fields and dishes, empty update is 400', async () => {
    assert.equal((await call('PUT', `/meals/${mealId}`, { token, body: {} })).status, 400);
    const r = await call('PUT', `/meals/${mealId}`, { token, body: { rating: 2, title: '', notes: 'meh', dishes: ['Chendol Dessert'] } });
    assert.equal(r.status, 200);
    assert.equal(r.body.rating, 2);
    assert.equal(r.body.title, null);
    assert.equal(r.body.notes, 'meh');
    assert.deepEqual(r.body.dishes.map(d => [d.name, d.category]), [['Chendol Dessert', 'dessert']]);
  });

  it('meal photos append to the list', async () => {
    const one = await upload(`/meals/${mealId}/photos`, 'photos', 2, token);
    assert.equal(one.status, 200);
    assert.equal(one.body.photo_urls.length, 2);
    const two = await upload(`/meals/${mealId}/photos`, 'photos', 1, token);
    assert.equal(two.body.photo_urls.length, 3);
    const meal = (await call('GET', '/meals', { token })).body.find(m => m.id === mealId);
    assert.deepEqual(JSON.parse(meal.photo_urls), two.body.photo_urls);
  });

  it('dishes aggregate what the user ate', async () => {
    const r = await call('GET', '/dishes', { token });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map(d => d.name).sort(), ['Chendol Dessert', 'Salmon Roll']);
    const chendol = r.body.find(d => d.name === 'Chendol Dessert');
    assert.equal(chendol.times_eaten, 1);
    assert.equal(chendol.best_rating, 2);
    assert.equal(chendol.restaurants, 'Nasi Place');
  });

  it('profile is rebuilt after meal changes', async () => {
    const r = await call('GET', '/profile', { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.reduce((n, row) => n + row.total_meals, 0), 2);
  });

  it('groups: create, join, members, duplicate join', async () => {
    const reg = await call('POST', '/auth/register', { body: { name: 'Bob', email: 'bob@test.com', password: 'pw' } });
    token2 = reg.body.token;
    assert.equal((await call('POST', '/groups', { token, body: { name: ' ' } })).status, 400);
    const g = await call('POST', '/groups', { token, body: { name: 'Lunch Crew' } });
    assert.equal(g.status, 201);
    assert.match(g.body.invite_code, /^[0-9a-f]{8}$/);
    assert.equal((await call('POST', '/groups/join', { token: token2, body: {} })).status, 400);
    assert.equal((await call('POST', '/groups/join', { token: token2, body: { invite_code: 'nope' } })).status, 404);
    assert.equal((await call('POST', '/groups/join', { token: token2, body: { invite_code: g.body.invite_code } })).status, 201);
    assert.equal((await call('POST', '/groups/join', { token: token2, body: { invite_code: g.body.invite_code } })).status, 409);
    const mine = await call('GET', '/groups', { token: token2 });
    assert.equal(mine.body[0].role, 'member');
    assert.equal(mine.body[0].member_count, 2);
    const members = await call('GET', `/groups/${g.body.id}/members`, { token });
    assert.deepEqual(members.body.map(m => [m.name, m.role]), [['Alice', 'owner'], ['Bob', 'member']]);
  });

  it('planned visits: create, priority order, delete', async () => {
    assert.equal((await call('POST', '/planned', { token, body: {} })).status, 400);
    const low = await call('POST', '/planned', { token, body: { restaurant_id: restaurantId, priority: 'low' } });
    assert.equal(low.status, 201);
    assert.equal(low.body.restaurant_name, 'Nasi Place');
    const def = await call('POST', '/planned', { token, body: { restaurant_id: restaurant2Id } });
    assert.equal(def.body.priority, 'medium');
    await call('POST', '/planned', { token, body: { restaurant_id: restaurant2Id, priority: 'high', notes: 'soon' } });
    const list = await call('GET', '/planned', { token });
    assert.deepEqual(list.body.map(p => p.priority), ['high', 'medium', 'low']);
    assert.equal((await call('DELETE', `/planned/${low.body.id}`, { token })).status, 204);
    assert.equal((await call('GET', '/planned', { token })).body.length, 2);
  });

  it('suggest returns up to 3 scored restaurants', async () => {
    const r = await call('GET', '/suggest', { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.length > 0 && r.body.length <= 3);
    for (const s of r.body) {
      assert.equal(typeof s.explanation, 'string');
      assert.deepEqual(Object.keys(s.scores).sort(), ['frequency', 'planned', 'rating', 'recency', 'total', 'variety']);
    }
    const filtered = await call('GET', '/suggest?cuisine=Japanese', { token });
    assert.deepEqual(filtered.body.map(s => s.name), ['Sushi Bar 2']);
  });

  it('suggest type=meal tags each pick', async () => {
    const r = await call('GET', '/suggest?type=meal', { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.length > 0 && r.body.length <= 3);
    assert.equal(r.body[0].is_top_pick, true);
    assert.ok(r.body.every(s => s.suggestion_type === 'new' || s.suggestion_type === 'familiar'));
  });

  it('delete meal and restaurant return 204', async () => {
    assert.equal((await call('DELETE', `/meals/${mealId}`, { token })).status, 204);
    assert.equal((await call('GET', '/meals', { token })).body.length, 1);
    assert.equal((await call('DELETE', `/restaurants/${restaurantId}`, { token })).status, 204);
    assert.equal((await call('GET', `/restaurants/${restaurantId}`, { token })).status, 404);
  });
});

// Ownership and access. Always runs on its own in-memory app, because it needs
// the database handle to make the first user the owner and a fake Google verifier.
// The tests share state (users, restaurant, meal, group) and run in order on
// purpose: each one builds on what the one before it left behind.
describe('API ownership and access', () => {
  let at;
  let app2;
  let db;
  let dir;
  const google = { payload: null };
  const NOT_ALLOWED = { error: 'Not allowed' };
  const NOT_FOUND = { error: 'Not found' };
  let olive; // owner
  let amy; // member who creates things
  let ben; // another member
  let restaurant;
  let meal;
  let planned;
  let group;

  const as = (who) => ({ token: who.token, at });
  const req = (method, path, who, body) => call(method, path, { ...as(who), body });
  const uploadAs = (path, field, who) => upload(path, field, 1, who.token, at);
  const uploadedFiles = () => readdirSync(dir).length;
  const waitFor = async (check, what, timeoutMs = 3000) => {
    const start = Date.now();
    while (!check()) {
      if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  };
  // Starts a one-photo multipart upload, runs `midway` once multer has created
  // the file on disk, then finishes the body. Returns the fetch Response.
  const uploadWithPause = async (path, field, who, midway) => {
    const boundary = 'fooddiary-test-boundary';
    // The first chunk carries the whole photo, so multer opens and fills the file;
    // only the closing boundary waits.
    const head = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="late.png"\r\nContent-Type: image/png\r\n\r\n`),
      PNG,
    ]);
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let step = 0;
    const body = new ReadableStream({
      async pull(controller) {
        if (step++ === 0) { controller.enqueue(head); return; }
        await gate;
        controller.enqueue(tail);
        controller.close();
      },
    });
    const before = uploadedFiles();
    const pending = fetch(`${at}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
      duplex: 'half',
    });
    try {
      await waitFor(() => uploadedFiles() > before, 'multer to create the upload file');
      midway();
    } finally {
      release(); // always end the body, or the server cannot close
    }
    return pending;
  };
  const register = async (name) => {
    const r = await call('POST', '/auth/register', { at, body: { name, email: `${name}@own.test`, password: 'pw' } });
    return { ...r.body.user, token: r.body.token };
  };

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'fooddiary-own-'));
    const { openDatabase, promoteOwner } = await import('../server/db.js');
    const { createApp } = await import('../server/app.js');
    db = openDatabase(':memory:', { defaultTimeZone: 'Asia/Kuala_Lumpur' });
    const { app } = createApp({
      db, uploadsDir: dir, jwtSecret: 'test-secret', defaultTimeZone: 'Asia/Kuala_Lumpur', verifyGoogle: async () => google.payload,
    });
    await new Promise(resolve => { app2 = app.listen(0, resolve); });
    at = `http://127.0.0.1:${app2.address().port}/api`;
    olive = await register('olive');
    amy = await register('amy');
    ben = await register('ben');
    promoteOwner(db);
  });

  after(async () => {
    if (app2) await new Promise(resolve => app2.close(resolve));
    if (db) db.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('users carry a role; the first user is the owner', async () => {
    assert.equal((await req('GET', '/auth/me', olive)).body.role, 'owner');
    assert.equal((await req('GET', '/auth/me', amy)).body.role, 'member');
    const login = await call('POST', '/auth/login', { at, body: { email: 'ben@own.test', password: 'pw' } });
    assert.equal(login.body.user.role, 'member');
  });

  it('restaurants: only the adder or the owner may change them', async () => {
    restaurant = (await req('POST', '/restaurants', amy, { name: 'Amy Place', cuisine_type: 'Thai', price_range: 2 })).body;

    const before = uploadedFiles();
    assert.deepEqual(await req('PUT', `/restaurants/${restaurant.id}`, ben, { name: 'Hijack' }), { status: 403, body: NOT_ALLOWED });
    assert.deepEqual(await req('DELETE', `/restaurants/${restaurant.id}`, ben), { status: 403, body: NOT_ALLOWED });
    assert.deepEqual(await uploadAs(`/restaurants/${restaurant.id}/photo`, 'photo', ben), { status: 403, body: NOT_ALLOWED });
    assert.equal(uploadedFiles(), before, 'a refused upload leaves no file');
    assert.equal((await req('GET', `/restaurants/${restaurant.id}`, amy)).body.name, 'Amy Place');

    assert.deepEqual(await req('PUT', '/restaurants/9999', amy, { name: 'x' }), { status: 404, body: NOT_FOUND });
    assert.deepEqual(await req('DELETE', '/restaurants/9999', amy), { status: 404, body: NOT_FOUND });
    assert.deepEqual(await uploadAs('/restaurants/9999/photo', 'photo', amy), { status: 404, body: NOT_FOUND });
    assert.equal(uploadedFiles(), before);

    assert.deepEqual(await req('PUT', `/restaurants/${restaurant.id}`, amy, { cuisine_type: 'Thai' }), { status: 400, body: { error: 'Name required' } });
    assert.equal((await req('PUT', `/restaurants/${restaurant.id}`, amy, { name: ' Amy Place 2 ' })).body.name, 'Amy Place 2');
    assert.equal((await req('PUT', `/restaurants/${restaurant.id}`, olive, { name: 'Owner Fix' })).status, 200);
    assert.equal((await uploadAs(`/restaurants/${restaurant.id}/photo`, 'photo', amy)).status, 200);
    assert.equal((await uploadAs(`/restaurants/${restaurant.id}/photo`, 'photo', olive)).status, 200);
  });

  it('restaurant cover photo: a new photo removes the old file', async () => {
    const onDisk = (url) => existsSync(join(dir, url.slice('/uploads/'.length)));
    const first = (await uploadAs(`/restaurants/${restaurant.id}/photo`, 'photo', amy)).body.photo_url;
    const count = uploadedFiles();
    const second = await uploadAs(`/restaurants/${restaurant.id}/photo`, 'photo', amy);
    assert.equal(second.status, 200);
    assert.notEqual(second.body.photo_url, first);
    assert.equal(onDisk(first), false);
    assert.equal(onDisk(second.body.photo_url), true);
    assert.equal(uploadedFiles(), count);
  });

  it('restaurant cover photo: an old URL outside the uploads dir is never removed', async () => {
    const outside = join(dir, '..', `fooddiary-outside-${process.pid}.txt`);
    writeFileSync(outside, 'keep me');
    try {
      db.prepare('UPDATE restaurants SET photo_url = ? WHERE id = ?').run(`/uploads/../${basename(outside)}`, restaurant.id);
      assert.equal((await uploadAs(`/restaurants/${restaurant.id}/photo`, 'photo', amy)).status, 200);
      assert.equal(existsSync(outside), true);
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it('restaurant cover photo: a restaurant deleted during the upload answers 404 and leaves no file', async () => {
    const doomed = (await req('POST', '/restaurants', amy, { name: 'Doomed' })).body;
    const before = uploadedFiles();
    const res = await uploadWithPause(`/restaurants/${doomed.id}/photo`, 'photo', amy,
      () => db.prepare('DELETE FROM restaurants WHERE id = ?').run(doomed.id));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), NOT_FOUND);
    assert.equal(uploadedFiles(), before);
  });

  it('meals: only the user who logged it may change it', async () => {
    const created = await req('POST', '/meals', amy, {
      restaurant_id: restaurant.id, rating: 4, visited_at: '2026-09-01T12:00:00.000Z', dishes: [null, 5, 'Fried Rice'],
    });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.dishes.map(d => d.name), ['Fried Rice']);
    meal = created.body;

    const before = uploadedFiles();
    for (const who of [ben, olive]) {
      assert.deepEqual(await req('PUT', `/meals/${meal.id}`, who, { rating: 1 }), { status: 403, body: NOT_ALLOWED });
      assert.deepEqual(await req('DELETE', `/meals/${meal.id}`, who), { status: 403, body: NOT_ALLOWED });
      assert.deepEqual(await uploadAs(`/meals/${meal.id}/photos`, 'photos', who), { status: 403, body: NOT_ALLOWED });
    }
    assert.equal(uploadedFiles(), before, 'a refused upload leaves no file');

    assert.deepEqual(await req('PUT', '/meals/9999', amy, { rating: 1 }), { status: 404, body: NOT_FOUND });
    assert.deepEqual(await req('DELETE', '/meals/9999', amy), { status: 404, body: NOT_FOUND });
    assert.deepEqual(await uploadAs('/meals/9999/photos', 'photos', amy), { status: 404, body: NOT_FOUND });
    assert.equal(uploadedFiles(), before);

    const updated = await req('PUT', `/meals/${meal.id}`, amy, { rating: 5 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.rating, 5);
    assert.equal((await uploadAs(`/meals/${meal.id}/photos`, 'photos', amy)).body.photo_urls.length, 1);
  });

  it('meal photos: the limit holds and a refused upload leaves no file', async () => {
    assert.equal((await upload(`/meals/${meal.id}/photos`, 'photos', 9, amy.token, at)).body.photo_urls.length, 10);
    const before = uploadedFiles();
    assert.deepEqual(await uploadAs(`/meals/${meal.id}/photos`, 'photos', amy), { status: 400, body: { error: 'A meal can have at most 10 photos' } });
    assert.equal(uploadedFiles(), before);
    const stored = db.prepare('SELECT photo_urls FROM meals WHERE id = ?').get(meal.id);
    assert.equal(JSON.parse(stored.photo_urls).length, 10);
  });

  it('upload errors answer JSON 400 and leave no file', async () => {
    const other = (await req('POST', '/meals', amy, { restaurant_id: restaurant.id, rating: 3, visited_at: '2026-09-01T19:00:00.000Z' })).body;
    const before = uploadedFiles();
    const tooMany = await upload(`/meals/${other.id}/photos`, 'photos', 11, amy.token, at);
    assert.equal(tooMany.status, 400);
    assert.equal(typeof tooMany.body.error, 'string');
    assert.equal(uploadedFiles(), before);
    assert.equal((await req('DELETE', `/meals/${other.id}`, amy)).status, 204);
  });

  it('a meal deleted while its photos upload answers 404 and leaves no file', async () => {
    const doomed = (await req('POST', '/meals', amy, { restaurant_id: restaurant.id, rating: 3, visited_at: '2026-09-01T20:00:00.000Z' })).body;
    const before = uploadedFiles();
    // The file exists on disk, so the guard has passed; the meal goes before the body ends.
    const res = await uploadWithPause(`/meals/${doomed.id}/photos`, 'photos', amy,
      () => db.prepare('DELETE FROM meals WHERE id = ?').run(doomed.id));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), NOT_FOUND);
    assert.equal(uploadedFiles(), before);
  });

  it('planned visits: only the planner may delete one', async () => {
    planned = (await req('POST', '/planned', amy, { restaurant_id: restaurant.id })).body;
    assert.deepEqual(await req('DELETE', `/planned/${planned.id}`, ben), { status: 403, body: NOT_ALLOWED });
    assert.deepEqual(await req('DELETE', `/planned/${planned.id}`, olive), { status: 403, body: NOT_ALLOWED });
    assert.deepEqual(await req('DELETE', '/planned/9999', amy), { status: 404, body: NOT_FOUND });
    assert.equal((await req('GET', '/planned', amy)).body.length, 1);
    assert.equal((await req('DELETE', `/planned/${planned.id}`, amy)).status, 204);
  });

  it('meal types: only the creator or the owner may change a custom one', async () => {
    assert.deepEqual(await req('POST', '/meal-types', amy, { name: '  ', slots: [{ name: 'Main' }] }), { status: 400, body: { error: 'Name is required' } });
    assert.deepEqual(await req('POST', '/meal-types', amy, { name: 'X', slots: [] }), { status: 400, body: { error: 'Add at least one slot' } });
    assert.equal((await req('POST', '/meal-types', amy, { name: 'X', slots: [{ name: ' ' }] })).status, 400);

    const type = (await req('POST', '/meal-types', amy, { name: 'Amy Set', slots: [{ name: 'Main' }] })).body;
    const body = { name: 'Changed', slots: [{ name: 'Side' }] };
    assert.deepEqual(await req('PUT', `/meal-types/${type.id}`, ben, body), { status: 403, body: NOT_ALLOWED });
    assert.deepEqual(await req('DELETE', `/meal-types/${type.id}`, ben), { status: 403, body: NOT_ALLOWED });
    assert.equal((await req('PUT', `/meal-types/${type.id}`, amy, body)).status, 200);
    assert.equal((await req('PUT', `/meal-types/${type.id}`, olive, body)).status, 200);
    assert.equal((await req('DELETE', `/meal-types/${type.id}`, amy)).status, 204);
    assert.deepEqual(await req('DELETE', `/meal-types/${type.id}`, amy), { status: 404, body: { error: 'Meal type not found' } });
    assert.deepEqual(await req('PUT', '/meal-types/9999', amy, body), { status: 404, body: { error: 'Meal type not found' } });

    const orphan = db.prepare("INSERT INTO meal_types (name, slots) VALUES ('Old', '[{\"name\":\"Main\"}]')").run().lastInsertRowid;
    assert.deepEqual(await req('PUT', `/meal-types/${orphan}`, amy, body), { status: 403, body: NOT_ALLOWED });
    assert.equal((await req('DELETE', `/meal-types/${orphan}`, olive)).status, 204);

    const seed = (await req('GET', '/meal-types', olive)).body.find(t => t.is_seed === 1);
    assert.deepEqual(await req('PUT', `/meal-types/${seed.id}`, olive, body), { status: 403, body: { error: 'Cannot edit built-in meal types' } });
  });

  it('dish types: only the creator or the owner may change a custom one', async () => {
    assert.deepEqual(await req('POST', '/dish-types', amy, { name: '   ' }), { status: 400, body: { error: 'Name is required' } });
    const type = (await req('POST', '/dish-types', amy, { name: 'Curry' })).body;
    assert.deepEqual(await req('PUT', `/dish-types/${type.id}`, ben, { name: 'Stew' }), { status: 403, body: NOT_ALLOWED });
    assert.deepEqual(await req('DELETE', `/dish-types/${type.id}`, ben), { status: 403, body: NOT_ALLOWED });
    assert.equal((await req('PUT', `/dish-types/${type.id}`, olive, { name: 'Curries' })).body.name, 'Curries');
    assert.deepEqual(await req('PUT', `/dish-types/${type.id}`, amy, { name: '  ' }), { status: 400, body: { error: 'Name is required' } });
    assert.equal((await req('DELETE', `/dish-types/${type.id}`, amy)).status, 204);
    assert.deepEqual(await req('DELETE', '/dish-types/9999', amy), { status: 404, body: { error: 'Dish type not found' } });
    assert.deepEqual(await req('PUT', '/dish-types/9999', amy, { name: 'Stew' }), { status: 404, body: { error: 'Dish type not found' } });

    const orphan = db.prepare("INSERT INTO dish_types (name) VALUES ('Orphan')").run().lastInsertRowid;
    assert.deepEqual(await req('DELETE', `/dish-types/${orphan}`, amy), { status: 403, body: NOT_ALLOWED });
    assert.equal((await req('DELETE', `/dish-types/${orphan}`, olive)).status, 204);

    const seed = (await req('GET', '/dish-types', olive)).body.find(t => t.is_seed === 1);
    assert.deepEqual(await req('DELETE', `/dish-types/${seed.id}`, olive), { status: 403, body: { error: 'Cannot delete built-in dish types' } });
  });

  it('group data needs membership', async () => {
    group = (await req('POST', '/groups', amy, { name: 'Amy Crew' })).body;
    const g = group.id;
    const reads = [`/meals?group_id=${g}`, `/planned?group_id=${g}`, `/suggest?group_id=${g}`, `/suggest?type=meal&group_id=${g}`, `/groups/${g}/members`];

    for (const path of reads) assert.deepEqual(await req('GET', path, ben), { status: 403, body: NOT_ALLOWED }, path);
    for (const path of reads) assert.deepEqual(await req('GET', path, olive), { status: 403, body: NOT_ALLOWED }, `owner ${path}`);
    assert.deepEqual(
      await req('POST', '/meals', ben, { restaurant_id: restaurant.id, rating: 3, visited_at: '2026-09-02T12:00:00.000Z', group_id: g }),
      { status: 403, body: NOT_ALLOWED },
    );
    assert.deepEqual(await req('POST', '/planned', ben, { restaurant_id: restaurant.id, group_id: g }), { status: 403, body: NOT_ALLOWED });
    const benMeal = (await req('POST', '/meals', ben, { restaurant_id: restaurant.id, rating: 3, visited_at: '2026-09-02T12:00:00.000Z' })).body;
    assert.deepEqual(await req('PUT', `/meals/${benMeal.id}`, ben, { group_id: g }), { status: 403, body: NOT_ALLOWED });
    assert.equal((await req('PUT', `/meals/${benMeal.id}`, ben, { group_id: null })).status, 200);

    for (const path of reads) assert.equal((await req('GET', path, amy)).status, 200, path);
    assert.equal((await req('POST', '/meals', amy, { restaurant_id: restaurant.id, rating: 4, visited_at: '2026-09-03T12:00:00.000Z', group_id: g })).status, 201);
    assert.equal((await req('POST', '/planned', amy, { restaurant_id: restaurant.id, group_id: g })).status, 201);
    assert.equal((await req('PUT', `/meals/${meal.id}`, amy, { group_id: g })).status, 200);

    assert.equal((await req('POST', '/groups/join', ben, { invite_code: group.invite_code })).status, 201);
    for (const path of reads) assert.equal((await req('GET', path, ben)).status, 200, path);
    assert.equal((await req('GET', `/meals?group_id=${g}`, ben)).body.length, 2);
    assert.equal((await req('PUT', `/meals/${benMeal.id}`, ben, { group_id: g })).status, 200);
  });

  it('group ids are parsed: anything but a positive integer is 400', async () => {
    const g = group.id;
    const INVALID = { error: 'Invalid group' };
    const badQueries = ['abc', '0', '-1', 'true', `${g}&group_id=${g}`];
    for (const base of ['/meals', '/planned', '/suggest', '/suggest?type=meal']) {
      for (const q of badQueries) {
        const path = `${base}${base.includes('?') ? '&' : '?'}group_id=${q}`;
        assert.deepEqual(await req('GET', path, amy), { status: 400, body: INVALID }, path);
      }
    }
    assert.deepEqual(await req('GET', '/groups/abc/members', amy), { status: 400, body: INVALID });

    const newMeal = { restaurant_id: restaurant.id, rating: 3, visited_at: '2026-09-04T12:00:00.000Z' };
    for (const group_id of [true, {}, [g, 7], 'abc', 0, -1]) {
      assert.deepEqual(await req('POST', '/meals', amy, { ...newMeal, group_id }), { status: 400, body: INVALID }, JSON.stringify(group_id));
      assert.deepEqual(await req('POST', '/planned', amy, { restaurant_id: restaurant.id, group_id }), { status: 400, body: INVALID });
      assert.deepEqual(await req('PUT', `/meals/${meal.id}`, amy, { group_id }), { status: 400, body: INVALID });
    }

    const byString = await req('POST', '/meals', amy, { ...newMeal, group_id: String(g) });
    assert.equal(byString.status, 201);
    assert.equal(byString.body.group_id, g);
    assert.equal((await req('GET', `/meals?group_id=${g}`, amy)).status, 200);
    assert.equal((await req('DELETE', `/meals/${byString.body.id}`, amy)).status, 204);
  });

  it('restaurants other people use cannot be deleted by their adder', async () => {
    // Ben logged a meal and Amy's group planned a visit at Amy's restaurant.
    const benMeals = () => db.prepare('SELECT COUNT(*) AS c FROM meals WHERE restaurant_id = ? AND user_id = ?').get(restaurant.id, ben.id).c;
    assert.ok(benMeals() > 0);
    assert.deepEqual(await req('DELETE', `/restaurants/${restaurant.id}`, amy), { status: 409, body: { error: 'Restaurant is used by other people' } });
    assert.ok(benMeals() > 0);
    assert.equal((await req('GET', `/restaurants/${restaurant.id}`, amy)).status, 200);

    const IN_USE = { status: 409, body: { error: 'Restaurant is used by other people' } };
    const plannedOnly = (await req('POST', '/restaurants', amy, { name: 'Ben Plans Here' })).body;
    assert.equal((await req('POST', '/planned', ben, { restaurant_id: plannedOnly.id })).status, 201);
    assert.deepEqual(await req('DELETE', `/restaurants/${plannedOnly.id}`, amy), IN_USE);

    // Group rows block the adder even when the adder wrote them: other members see them.
    const groupMealOnly = (await req('POST', '/restaurants', amy, { name: 'Crew Lunch' })).body;
    await req('POST', '/meals', amy, { restaurant_id: groupMealOnly.id, rating: 4, visited_at: '2026-09-05T13:00:00.000Z', group_id: group.id });
    assert.deepEqual(await req('DELETE', `/restaurants/${groupMealOnly.id}`, amy), IN_USE);
    const groupPlanOnly = (await req('POST', '/restaurants', amy, { name: 'Crew Plan' })).body;
    await req('POST', '/planned', amy, { restaurant_id: groupPlanOnly.id, group_id: group.id });
    assert.deepEqual(await req('DELETE', `/restaurants/${groupPlanOnly.id}`, amy), IN_USE);
    assert.equal((await req('DELETE', `/restaurants/${groupPlanOnly.id}`, olive)).status, 204);

    const solo = (await req('POST', '/restaurants', amy, { name: 'Amy Only' })).body;
    await req('POST', '/meals', amy, { restaurant_id: solo.id, rating: 4, visited_at: '2026-09-05T12:00:00.000Z' });
    assert.equal((await req('DELETE', `/restaurants/${solo.id}`, amy)).status, 204);
  });

  it('google sign-in of an existing user returns the adopted avatar', async () => {
    google.payload = { email: 'amy@own.test', name: 'Amy', picture: 'https://example.test/amy.png' };
    const r = await call('POST', '/auth/google', { at, body: { credential: 'fake' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.avatar_url, 'https://example.test/amy.png');
    assert.equal(r.body.user.role, 'member');
    assert.equal((await req('GET', '/auth/me', amy)).body.avatar_url, 'https://example.test/amy.png');
  });

  it('the allowed user can still delete; the owner may delete a shared restaurant', async () => {
    assert.equal((await req('DELETE', `/meals/${meal.id}`, amy)).status, 204);
    const totalMeals = async (who) => (await req('GET', '/profile', who)).body.reduce((n, row) => n + row.total_meals, 0);
    const benBefore = await totalMeals(ben);
    assert.ok(benBefore > 0);
    assert.equal((await req('DELETE', `/restaurants/${restaurant.id}`, olive)).status, 204);
    assert.equal((await req('GET', `/restaurants/${restaurant.id}`, amy)).status, 404);
    assert.ok(await totalMeals(ben) < benBefore, "the delete rebuilds the other user's profile");
  });
});

