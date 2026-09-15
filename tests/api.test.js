// Integration test: the whole HTTP API, driven over real HTTP.
//
// By default it builds the app on an in-memory database and a temp uploads dir.
// Set FOOD_DIARY_TEST_BASE (e.g. http://127.0.0.1:3999) to run the same
// assertions against a server that is already running on a fresh database.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let base = process.env.FOOD_DIARY_TEST_BASE ? `${process.env.FOOD_DIARY_TEST_BASE}/api` : null;
let server = null;
let tmp = null;

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
  'base64',
);

async function call(method, path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function upload(path, field, count, token) {
  const form = new FormData();
  for (let i = 0; i < count; i++) form.append(field, new Blob([PNG], { type: 'image/png' }), `p${i}.png`);
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  if (base) return;
  tmp = mkdtempSync(join(tmpdir(), 'fooddiary-test-'));
  const { openDatabase } = await import('../server/db.js');
  const { createApp } = await import('../server/app.js');
  const db = openDatabase(':memory:');
  const { app } = createApp({ db, uploadsDir: tmp, jwtSecret: 'test-secret' });
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
