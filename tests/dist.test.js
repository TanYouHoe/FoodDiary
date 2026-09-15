// Build check: what `npm run build` put in dist/ for the PWA. Skipped when
// dist/ is absent. Rebuild after a change to pwa.config.js or index.html, else
// this test reads the old build.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifest, APPLE_TOUCH_ICON, BRAND_COLOR } from '../pwa.config.js';
import { cacheControlFor, IMMUTABLE } from '../logic/http-policy.js';

const DIST = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'dist');
const skip = existsSync(join(DIST, 'index.html')) ? false : 'dist/ is absent (run npm run build)';
const read = (name) => readFileSync(join(DIST, name), 'utf8');

describe('dist (PWA build)', { skip }, () => {
  it('has the worker, the manifest and every icon', () => {
    for (const name of ['sw.js', 'manifest.webmanifest', APPLE_TOUCH_ICON, ...manifest.icons.map(i => i.src.slice(1))]) {
      assert.ok(existsSync(join(DIST, name)), name);
    }
  });

  it('the built manifest is the configured one', () => {
    const built = JSON.parse(read('manifest.webmanifest'));
    for (const key of ['name', 'short_name', 'start_url', 'scope', 'display', 'theme_color', 'background_color']) {
      assert.equal(built[key], manifest[key], key);
    }
    assert.deepEqual(built.icons.map(i => i.purpose), manifest.icons.map(i => i.purpose));
  });

  it('index.html links the manifest, has the Apple tags, the brand theme colour and no inline script', () => {
    const html = read('index.html');
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"/);
    assert.match(html, new RegExp(`<meta name="theme-color" content="${BRAND_COLOR}"`));
    assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
    assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes"/);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length > 0);
    for (const [, attributes, body] of scripts) {
      assert.match(attributes, /\bsrc="/, 'every script is external');
      assert.equal(body.trim(), '', 'no inline code');
    }
    assert.doesNotMatch(html, /registerSW/);
  });

  it('sw.js has the navigation denylist, the photo cache and an API NetworkOnly route, and precaches no API', () => {
    const sw = read('sw.js');
    for (const text of ['/^\\/api\\//', '/^\\/uploads\\//', '/^\\/assets\\//', '"photos"', 'NetworkOnly', 'CacheFirst', 'cleanupOutdatedCaches', 'SKIP_WAITING']) {
      assert.ok(sw.includes(text), text);
    }
    assert.doesNotMatch(sw, /url:\s*"api\//);
    assert.doesNotMatch(sw, /clientsClaim\(\)/);
  });

  it('precaches the shell, the manifest and every icon, each one time', () => {
    const urls = [...read('sw.js').matchAll(/\{url:"([^"]+)",revision:/g)].map(m => m[1]);
    assert.equal(new Set(urls).size, urls.length, `duplicates in ${urls.join(', ')}`);
    for (const name of ['index.html', 'manifest.webmanifest', APPLE_TOUCH_ICON, ...manifest.icons.map(i => i.src.slice(1))]) {
      assert.ok(urls.includes(name), name);
    }
    assert.ok(urls.some(u => /^assets\/index-.+\.js$/.test(u)), 'the app script');
    assert.ok(urls.every(u => !u.startsWith('api/') && !u.startsWith('uploads/')), 'no API answer or photo');
  });

  it('every workbox runtime file at the root is served immutable', () => {
    for (const name of readdirSync(DIST).filter(n => n.startsWith('workbox-'))) assert.equal(cacheControlFor(name), IMMUTABLE, name);
  });
});
