// Unit test: the PWA plugin options in pwa.config.js — the manifest, the
// service worker's routes, and what it must never cache. No build needed.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pwaOptions, manifest, BRAND_COLOR, BACKGROUND_COLOR, NAVIGATE_FALLBACK_DENYLIST, APPLE_TOUCH_ICON, PHOTO_CACHE,
} from '../pwa.config.js';

const DAY = 24 * 60 * 60;
const at = (path, origin = 'https://food.example.test') => ({ url: new URL(path, origin), sameOrigin: origin === 'https://food.example.test' });
const rules = pwaOptions.workbox.runtimeCaching;
const ruleFor = (path, origin) => rules.filter(rule => rule.urlPattern(at(path, origin)));

describe('pwa plugin options', () => {
  it('generates the worker, waits for the user to update, and registers from our own code', () => {
    assert.equal(pwaOptions.strategies, 'generateSW');
    assert.equal(pwaOptions.registerType, 'prompt');
    assert.equal(pwaOptions.injectRegister, false);
    assert.equal(pwaOptions.devOptions.enabled, false);
    assert.equal(pwaOptions.manifest, manifest);
    assert.ok(pwaOptions.includeAssets.includes(APPLE_TOUCH_ICON));
  });
});

describe('manifest', () => {
  it('names the app and opens standalone at the root', () => {
    assert.equal(manifest.name, 'Food Diary: First Bite');
    assert.equal(manifest.short_name, 'Food Diary');
    assert.equal(typeof manifest.description, 'string');
    assert.ok(manifest.description.length > 0);
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.display, 'standalone');
  });

  it('takes the brand orange and the light background from the app CSS', () => {
    assert.equal(BRAND_COLOR, '#F97316');
    assert.equal(BACKGROUND_COLOR, '#FAFAF9');
    assert.equal(manifest.theme_color, BRAND_COLOR);
    assert.equal(manifest.background_color, BACKGROUND_COLOR);
  });

  it('has 192 and 512 icons for any use and a 512 maskable icon, all PNG', () => {
    const icons = manifest.icons.map(({ sizes, purpose, type }) => `${sizes} ${purpose} ${type}`);
    assert.deepEqual(icons.sort(), ['192x192 any image/png', '512x512 any image/png', '512x512 maskable image/png']);
    for (const icon of manifest.icons) assert.match(icon.src, /^\/[\w-]+\.png$/);
    assert.equal(APPLE_TOUCH_ICON, 'apple-touch-icon.png');
  });
});

describe('workbox', () => {
  const { workbox } = pwaOptions;

  it('precaches the app shell: scripts, styles and html by glob; the plugin adds the manifest, its icons and the apple icon', () => {
    for (const ext of ['js', 'css', 'html']) assert.ok(workbox.globPatterns.some(p => p.includes(ext)), ext);
    assert.notEqual(pwaOptions.includeManifestIcons, false);
    assert.deepEqual(pwaOptions.includeAssets, [APPLE_TOUCH_ICON]);
  });

  it('falls back to index.html for app navigations only', () => {
    assert.equal(workbox.navigateFallback, '/index.html');
    assert.equal(workbox.navigateFallbackDenylist, NAVIGATE_FALLBACK_DENYLIST);
    const denied = (path) => NAVIGATE_FALLBACK_DENYLIST.some(re => re.test(path));
    for (const path of ['/api/x', '/api/auth/me', '/uploads/x.png', '/assets/x.js']) assert.equal(denied(path), true, path);
    for (const path of ['/', '/dashboard', '/invite/abc', '/apiary', '/uploadsx']) assert.equal(denied(path), false, path);
  });

  it('caches photos first, 200 answers only, at most 200 for 30 days', () => {
    const [rule, ...others] = ruleFor('/uploads/0123456789abcdef0123456789abcdef.png');
    assert.equal(others.length, 0);
    assert.equal(rule.handler, 'CacheFirst');
    assert.equal(rule.options.cacheName, PHOTO_CACHE);
    assert.equal(PHOTO_CACHE, 'photos');
    assert.deepEqual(rule.options.cacheableResponse, { statuses: [200] });
    assert.deepEqual(rule.options.expiration, { maxEntries: 200, maxAgeSeconds: 30 * DAY });
  });

  it('never caches the API: its only rule is NetworkOnly', () => {
    for (const path of ['/api/meals', '/api/auth/me', '/api/uploads/x.png']) {
      const matched = ruleFor(path);
      assert.equal(matched.length, 1, path);
      assert.equal(matched[0].handler, 'NetworkOnly', path);
      assert.equal(matched[0].options, undefined, path);
    }
  });

  it('matches only this origin: photos or APIs of another site get no rule', () => {
    for (const path of ['/uploads/a.png', '/api/x']) assert.equal(ruleFor(path, 'https://other.example.test').length, 0, path);
    assert.equal(ruleFor('/dashboard').length, 0);
  });

  it('removes old caches and lets the update banner decide when the new worker takes over', () => {
    assert.equal(workbox.cleanupOutdatedCaches, true);
    assert.equal(workbox.clientsClaim, false);
    assert.equal(workbox.skipWaiting, false);
  });
});
