// Integration test: public hardening over real HTTP — CORS, security and cache
// headers, safe upload names and signatures, the JSON body limit, and trust
// proxy. Its own apps, in-memory databases and a temp directory.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inviteCode } from './helpers/invites.js';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';

const KL = 'Asia/Kuala_Lumpur';
const PUBLIC = 'https://food.example.test';
const EVIL = 'https://evil.example.test';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64');
const HTML = Buffer.from('<!doctype html><script>alert(document.cookie)</script>');
const NOT_IMAGE = { status: 400, body: { error: 'Not a supported image' } };

async function listen(app) {
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

describe('API hardening', () => {
  let root;
  let uploadsDir;
  let distDir;
  let publicApp; // PUBLIC_ORIGIN https, trust proxy loopback
  let plainApp;  // no PUBLIC_ORIGIN, no trust proxy
  let token;
  let restaurantId;
  let mealId;

  const files = () => readdirSync(uploadsDir);
  const get = (path, headers = {}, at = publicApp) => fetch(`${at.origin}${path}`, { headers });

  const uploadPhotos = async (path, field, parts) => {
    const form = new FormData();
    for (const { bytes, type, name } of parts) form.append(field, new Blob([bytes], { type }), name);
    const res = await fetch(`${publicApp.origin}/api${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    return { status: res.status, body: await res.json() };
  };

  const postJson = async (path, body, headers = {}, at = publicApp) => {
    const res = await fetch(`${at.origin}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
  };

  before(async () => {
    root = mkdtempSync(join(tmpdir(), 'fooddiary-harden-'));
    uploadsDir = join(root, 'uploads');
    distDir = join(root, 'dist');
    mkdirSync(uploadsDir);
    mkdirSync(join(distDir, 'assets'), { recursive: true });
    writeFileSync(join(distDir, 'index.html'), '<!doctype html><div id="root"></div><script type="module" src="/assets/x.js"></script>');
    writeFileSync(join(distDir, 'assets', 'x.js'), 'export {};');
    writeFileSync(join(distDir, 'sw.js'), 'self;');

    const db = openDatabase(':memory:', { defaultTimeZone: KL });
    const built = createApp({
      db, uploadsDir, distDir, jwtSecret: 'test-secret', defaultTimeZone: KL, requireTotp: false,
      publicOrigin: PUBLIC, allowedOrigins: [PUBLIC], trustProxy: 'loopback',
    });
    publicApp = { ...(await listen(built.app)), db };

    const plainDb = openDatabase(':memory:', { defaultTimeZone: KL });
    const plain = createApp({ db: plainDb, uploadsDir, distDir, jwtSecret: 'test-secret', defaultTimeZone: KL, requireTotp: false });
    plainApp = { ...(await listen(plain.app)), db: plainDb };

    const reg = await postJson('/auth/register', { name: 'Hana', email: 'hana@harden.test', password: 'pw', invite_code: inviteCode(db, { role: 'owner' }) });
    assert.equal(reg.status, 201);
    token = reg.body.token;
    const auth = { Authorization: `Bearer ${token}` };
    restaurantId = (await postJson('/restaurants', { name: 'Kopi', cuisine_type: 'Malaysian', price_range: 1 }, auth)).body.id;
    mealId = (await postJson('/meals', { restaurant_id: restaurantId, rating: 4, visited_at: '2026-09-16T12:00:00+08:00' }, auth)).body.id;
    assert.ok(restaurantId && mealId);
  });

  after(async () => {
    for (const at of [publicApp, plainApp]) {
      if (!at) continue;
      await new Promise(resolve => at.server.close(resolve));
      at.db.close();
    }
    if (root) rmSync(root, { recursive: true, force: true });
  });

  describe('CORS', () => {
    it('an allowed origin gets the allow header, and the answer varies by Origin', async () => {
      const res = await get('/api/health', { Origin: PUBLIC });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), PUBLIC);
      assert.match(res.headers.get('vary') ?? '', /Origin/);
    });

    it('a disallowed origin gets no allow headers', async () => {
      const res = await get('/api/health', { Origin: EVIL });
      assert.equal(res.headers.get('access-control-allow-origin'), null);
      assert.match(res.headers.get('vary') ?? '', /Origin/);
    });

    it('a request with no Origin works and gets no allow headers', async () => {
      const res = await get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    const preflight = (origin) => fetch(`${publicApp.origin}/api/meals`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });

    it('a preflight from an allowed origin is approved', async () => {
      const res = await preflight(PUBLIC);
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), PUBLIC);
      assert.match(res.headers.get('access-control-allow-methods') ?? '', /POST/);
    });

    it('a preflight from a disallowed origin is not approved', async () => {
      const res = await preflight(EVIL);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
      assert.equal(res.headers.get('access-control-allow-methods'), null);
      assert.equal(res.headers.get('access-control-allow-headers'), null);
    });

    it('with no allowed origins nothing is approved', async () => {
      const res = await get('/api/health', { Origin: 'http://localhost:5176' }, plainApp);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
  });

  describe('security headers', () => {
    const assertSecure = (res, what) => {
      assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'.*frame-ancestors 'none'/, what);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', what);
      assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', what);
      assert.equal(res.headers.get('permissions-policy'), 'geolocation=(self), camera=(), microphone=()', what);
      assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups', what);
    };

    it('are on API, static, SPA, error and upload responses', async () => {
      writeFileSync(join(uploadsDir, 'shown.png'), PNG);
      for (const path of ['/api/health', '/api/meals', '/', '/index.html', '/assets/x.js', '/invite/abc', '/uploads/shown.png']) {
        const res = await get(path);
        assertSecure(res, path);
        assert.equal(res.headers.get('strict-transport-security'), 'max-age=15552000', path);
      }
    });

    it('HSTS only when the public origin is https', async () => {
      const res = await get('/api/health', {}, plainApp);
      assertSecure(res, 'plain');
      assert.equal(res.headers.get('strict-transport-security'), null);
    });

    it('health says only that the server is up', async () => {
      const res = await get('/api/health');
      assert.deepEqual(await res.json(), { status: 'ok' });
    });
  });

  describe('cache headers', () => {
    it('the app shell is revalidated, SPA fallback included', async () => {
      for (const path of ['/', '/index.html', '/invite/abc', '/sw.js']) {
        const res = await get(path);
        assert.equal(res.status, 200, path);
        assert.equal(res.headers.get('cache-control'), 'no-cache', path);
      }
    });

    it('hashed assets are immutable for a year', async () => {
      const res = await get('/assets/x.js');
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    });
  });

  describe('uploads', () => {
    it('a stored name is 32 random hex chars and a MIME extension, never the client name', async () => {
      const before = new Set(files());
      const r = await uploadPhotos(`/restaurants/${restaurantId}/photo`, 'photo', [{ bytes: PNG, type: 'image/png', name: '../../evil.html' }]);
      assert.equal(r.status, 200);
      assert.match(r.body.photo_url, /^\/uploads\/[0-9a-f]{32}\.png$/);
      const added = files().filter(f => !before.has(f));
      assert.deepEqual(added, [r.body.photo_url.slice('/uploads/'.length)]);
      assert.equal(existsSync(join(root, 'evil.html')), false);

      const served = await get(r.body.photo_url);
      assert.equal(served.status, 200);
      assert.equal(served.headers.get('content-type'), 'image/png');
      assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
    });

    it('a JPEG gets .jpg', async () => {
      const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
      const r = await uploadPhotos(`/meals/${mealId}/photos`, 'photos', [{ bytes: jpeg, type: 'image/jpeg', name: 'a.png' }]);
      assert.equal(r.status, 200);
      assert.match(r.body.photo_urls.at(-1), /^\/uploads\/[0-9a-f]{32}\.jpg$/);
    });

    it('HTML sent as image/png is refused and its file deleted', async () => {
      const before = files().length;
      assert.deepEqual(await uploadPhotos(`/restaurants/${restaurantId}/photo`, 'photo', [{ bytes: HTML, type: 'image/png', name: 'x.html' }]), NOT_IMAGE);
      assert.equal(files().length, before);
    });

    it('PNG bytes sent as image/jpeg are refused', async () => {
      const before = files().length;
      assert.deepEqual(await uploadPhotos(`/restaurants/${restaurantId}/photo`, 'photo', [{ bytes: PNG, type: 'image/jpeg', name: 'x.jpg' }]), NOT_IMAGE);
      assert.equal(files().length, before);
    });

    it('one spoofed file among meal photos refuses them all and deletes every file', async () => {
      const before = files().length;
      const stored = (await get(`/api/meals`, { Authorization: `Bearer ${token}` }).then(r => r.json())).find(m => m.id === mealId).photo_urls;
      const r = await uploadPhotos(`/meals/${mealId}/photos`, 'photos', [
        { bytes: PNG, type: 'image/png', name: 'good.png' },
        { bytes: HTML, type: 'image/png', name: 'bad.png' },
      ]);
      assert.deepEqual(r, NOT_IMAGE);
      assert.equal(files().length, before);
      const after = (await get(`/api/meals`, { Authorization: `Bearer ${token}` }).then(r => r.json())).find(m => m.id === mealId).photo_urls;
      assert.deepEqual(after, stored, 'the meal keeps its photos');
    });

    it('old stored names keep working; dot files and directories are not served', async () => {
      writeFileSync(join(uploadsDir, '1700000000000-p0.png'), PNG);
      assert.equal((await get('/uploads/1700000000000-p0.png')).status, 200);

      // A denied dot file falls through to the SPA fallback; its content is never sent.
      writeFileSync(join(uploadsDir, '.secret'), 'top-secret-value');
      assert.doesNotMatch(await (await get('/uploads/.secret')).text(), /top-secret-value/);

      mkdirSync(join(uploadsDir, 'sub'), { recursive: true });
      writeFileSync(join(uploadsDir, 'sub', 'index.html'), 'listing');
      assert.doesNotMatch(await (await get('/uploads/sub/')).text(), /listing/);
    });
  });

  describe('JSON body limit', () => {
    it('a body over 1 MB answers JSON 413', async () => {
      const r = await postJson('/nothing', { blob: 'x'.repeat(1024 * 1024 + 10) });
      assert.equal(r.status, 413);
      assert.equal(typeof r.body?.error, 'string');
    });

    it('a body under 1 MB is parsed', async () => {
      const r = await postJson('/nothing', { blob: 'x'.repeat(512 * 1024) });
      assert.notEqual(r.status, 413);
    });
  });

  describe('trust proxy', () => {
    const ipKeys = (db) => db.prepare("SELECT key FROM auth_failures WHERE key LIKE 'ip:%'").all().map(row => row.key);
    const check = (at, forwardedFor) => postJson('/invites/check', { code: 'wrong' }, { 'X-Forwarded-For': forwardedFor }, at);

    it('behind a loopback proxy each forwarded client IP gets its own lockout key', async () => {
      assert.equal((await check(publicApp, '203.0.113.7')).status, 200);
      assert.equal((await check(publicApp, '203.0.113.8')).status, 200);
      const keys = ipKeys(publicApp.db);
      assert.ok(keys.includes('ip:203.0.113.7'), keys.join());
      assert.ok(keys.includes('ip:203.0.113.8'), keys.join());
    });

    it('with trust proxy off, X-Forwarded-For is ignored', async () => {
      assert.equal((await check(plainApp, '203.0.113.9')).status, 200);
      const keys = ipKeys(plainApp.db);
      assert.equal(keys.some(k => k.includes('203.0.113.9')), false, keys.join());
      assert.equal(keys.length, 1);
      assert.match(keys[0], /127\.0\.0\.1$/);
    });
  });
});
