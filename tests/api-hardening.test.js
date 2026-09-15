// Integration test: public hardening over real HTTP — CORS, security and cache
// headers, safe upload names and signatures, what /uploads, /api and /assets
// answer for a missing file, the JSON body limit, and trust proxy. Its own
// apps, in-memory databases and temp directories.
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
const UPLOAD_CSP = "default-src 'none'; img-src 'self'; sandbox";

async function listen(app) {
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

describe('API hardening', () => {
  let root;
  let uploadsDir;      // publicApp's uploads
  let plainUploadsDir; // plainApp's uploads
  let distDir;
  let publicApp; // PUBLIC_ORIGIN https, trust proxy loopback
  let plainApp;  // no PUBLIC_ORIGIN, no trust proxy
  let token;
  let restaurantId;
  let mealId;

  const files = () => readdirSync(uploadsDir);
  const get = (path, headers = {}, at = publicApp) => fetch(`${at.origin}${path}`, { headers });
  const json = async (res) => ({ status: res.status, type: res.headers.get('content-type') ?? '', body: await res.json().catch(() => null) });

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
    plainUploadsDir = join(root, 'plain-uploads');
    distDir = join(root, 'dist');
    mkdirSync(uploadsDir);
    mkdirSync(plainUploadsDir);
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
    const plain = createApp({ db: plainDb, uploadsDir: plainUploadsDir, distDir, jwtSecret: 'test-secret', defaultTimeZone: KL, requireTotp: false });
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
    const assertSecure = (res, what, csp = /default-src 'self'.*frame-ancestors 'none'/) => {
      assert.match(res.headers.get('content-security-policy') ?? '', csp, what);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', what);
      assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', what);
      assert.equal(res.headers.get('permissions-policy'), 'geolocation=(self), camera=(), microphone=()', what);
      assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups', what);
    };

    it('are on API, static, SPA and error responses', async () => {
      for (const path of ['/api/health', '/api/meals', '/api/nope', '/', '/index.html', '/assets/x.js', '/assets/missing.js', '/invite/abc']) {
        const res = await get(path);
        assertSecure(res, path);
        assert.equal(res.headers.get('strict-transport-security'), 'max-age=15552000', path);
      }
    });

    it('/uploads answers carry the sandbox policy instead of the app policy', async () => {
      writeFileSync(join(uploadsDir, 'shown.png'), PNG);
      for (const path of ['/uploads/shown.png', '/uploads/missing.png', '/uploads/x.html']) {
        const res = await get(path);
        assert.equal(res.headers.get('content-security-policy'), UPLOAD_CSP, path);
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
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

  describe('no HTML for a missing file', () => {
    it('an unknown API path answers JSON 404 for any method', async () => {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        const r = await json(await fetch(`${publicApp.origin}/api/nope/deeper`, { method }));
        assert.equal(r.status, 404, method);
        assert.match(r.type, /application\/json/, method);
        assert.deepEqual(r.body, { error: 'Not found' }, method);
      }
    });

    it('a missing build asset answers 404 with no body, not the app shell', async () => {
      const res = await get('/assets/missing.js');
      assert.equal(res.status, 404);
      assert.doesNotMatch(res.headers.get('content-type') ?? '', /html/);
      assert.equal(await res.text(), '');
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
      assert.equal(served.headers.get('content-security-policy'), UPLOAD_CSP);
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
      const photosOf = async () => (await get('/api/meals', { Authorization: `Bearer ${token}` }).then(r => r.json())).find(m => m.id === mealId).photo_urls;
      const stored = await photosOf();
      const r = await uploadPhotos(`/meals/${mealId}/photos`, 'photos', [
        { bytes: PNG, type: 'image/png', name: 'good.png' },
        { bytes: HTML, type: 'image/png', name: 'bad.png' },
      ]);
      assert.deepEqual(r, NOT_IMAGE);
      assert.equal(files().length, before);
      assert.deepEqual(await photosOf(), stored, 'the meal keeps its photos');
    });

    it('old stored names keep working', async () => {
      writeFileSync(join(uploadsDir, '1700000000000-p0.png'), PNG);
      assert.equal((await get('/uploads/1700000000000-p0.png')).status, 200);
    });

    it('a missing photo answers JSON 404, never the app shell', async () => {
      const r = await json(await get('/uploads/missing.png'));
      assert.equal(r.status, 404);
      assert.match(r.type, /application\/json/);
    });

    it('only photo names are served: HTML, scripts, dot files and directories answer 404', async () => {
      writeFileSync(join(uploadsDir, 'x.html'), HTML);
      writeFileSync(join(uploadsDir, 'x.js'), 'alert(1)');
      writeFileSync(join(uploadsDir, '.secret'), 'top-secret-value');
      mkdirSync(join(uploadsDir, 'sub'), { recursive: true });
      writeFileSync(join(uploadsDir, 'sub', 'index.html'), 'listing');
      for (const path of ['/uploads/x.html', '/uploads/x.js', '/uploads/.secret', '/uploads/sub/', '/uploads/sub']) {
        const r = await json(await get(path));
        assert.equal(r.status, 404, path);
        assert.match(r.type, /application\/json/, path);
      }
    });

    it('a dot file with a photo name answers JSON 403', async () => {
      writeFileSync(join(uploadsDir, '.hidden.png'), PNG);
      const r = await json(await get('/uploads/.hidden.png'));
      assert.equal(r.status, 403);
      assert.match(r.type, /application\/json/);
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
      assert.equal(r.status, 404);
    });
  });

  describe('trust proxy', () => {
    const ipKeys = (db) => db.prepare("SELECT key FROM auth_failures WHERE key LIKE 'ip:%'").all().map(row => row.key);
    const check = (at, forwardedFor) => postJson('/invites/check', { code: 'wrong' }, { 'X-Forwarded-For': forwardedFor }, at);

    it('behind a loopback proxy each forwarded client IP gets its own lockout key', async () => {
      assert.equal((await check(publicApp, '203.0.113.17')).status, 200);
      assert.equal((await check(publicApp, '203.0.113.18')).status, 200);
      const keys = ipKeys(publicApp.db);
      assert.ok(keys.includes('ip:203.0.113.17'), keys.join());
      assert.ok(keys.includes('ip:203.0.113.18'), keys.join());
    });

    it('a client-supplied X-Forwarded-For entry is not trusted: the address the proxy saw is the key', async () => {
      assert.equal((await check(publicApp, '198.51.100.1, 203.0.113.7')).status, 200);
      const keys = ipKeys(publicApp.db);
      assert.ok(keys.includes('ip:203.0.113.7'), keys.join());
      assert.equal(keys.includes('ip:198.51.100.1'), false, keys.join());
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
