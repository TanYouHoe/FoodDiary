// Logic test: what the server tells browsers — CORS origins, security headers, cache rules.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigins, isAllowedOrigin, securityHeaders, cacheControlFor, VITE_DEV_ORIGIN, NO_CACHE, IMMUTABLE } from '../logic/http-policy.js';

const PUBLIC = 'https://food.example.test';

// "a b; c d" -> { a: ['b'], c: ['d'] }
const directives = (csp) => Object.fromEntries(csp.split(';').map(part => part.trim()).filter(Boolean)
  .map(part => { const [name, ...values] = part.split(/\s+/); return [name, values]; }));

describe('allowedOrigins', () => {
  it('production allows only the public origin', () => {
    assert.deepEqual(allowedOrigins({ publicOrigin: PUBLIC, nodeEnv: 'production' }), [PUBLIC]);
    assert.deepEqual(allowedOrigins({ publicOrigin: undefined, nodeEnv: 'production' }), []);
  });

  it('outside production the Vite dev server is also allowed', () => {
    assert.deepEqual(allowedOrigins({ publicOrigin: PUBLIC, nodeEnv: undefined }), [PUBLIC, VITE_DEV_ORIGIN]);
    assert.deepEqual(allowedOrigins({ publicOrigin: null, nodeEnv: 'development' }), [VITE_DEV_ORIGIN]);
    assert.equal(VITE_DEV_ORIGIN, 'http://localhost:5176');
  });

  it('drops a trailing slash from the public origin', () => {
    assert.deepEqual(allowedOrigins({ publicOrigin: `${PUBLIC}/`, nodeEnv: 'production' }), [PUBLIC]);
  });
});

describe('isAllowedOrigin', () => {
  const list = [PUBLIC, VITE_DEV_ORIGIN];
  it('allows an exact match only', () => {
    assert.equal(isAllowedOrigin(PUBLIC, list), true);
    assert.equal(isAllowedOrigin(VITE_DEV_ORIGIN, list), true);
    for (const origin of ['http://food.example.test', 'https://food.example.test:8443', 'https://evil.example.test',
      'https://food.example.test.evil.test', 'null', '', undefined]) {
      assert.equal(isAllowedOrigin(origin, list), false, String(origin));
    }
  });
});

describe('securityHeaders', () => {
  it('builds the content security policy', () => {
    const csp = directives(securityHeaders({ publicOrigin: PUBLIC })['Content-Security-Policy']);
    assert.deepEqual(csp['default-src'], ["'self'"]);
    assert.deepEqual(csp['script-src'], ["'self'", 'https://accounts.google.com/gsi/client', 'https://maps.googleapis.com', 'https://maps.gstatic.com']);
    assert.deepEqual(csp['connect-src'], ["'self'", 'https://accounts.google.com', 'https://maps.googleapis.com']);
    assert.deepEqual(csp['frame-src'], ['https://accounts.google.com']);
    assert.deepEqual(csp['img-src'], ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com', 'https://maps.gstatic.com', 'https://maps.googleapis.com']);
    assert.deepEqual(csp['style-src'], ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style']);
    assert.deepEqual(csp['font-src'], ["'self'", 'data:']);
    assert.deepEqual(csp['object-src'], ["'none'"]);
    assert.deepEqual(csp['base-uri'], ["'self'"]);
    assert.deepEqual(csp['form-action'], ["'self'"]);
    assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
  });

  it('never lets scripts run inline or through eval', () => {
    const csp = securityHeaders({ publicOrigin: PUBLIC })['Content-Security-Policy'];
    const scripts = directives(csp)['script-src'];
    assert.ok(!scripts.includes("'unsafe-inline'"));
    assert.ok(!csp.includes("'unsafe-eval'"));
    assert.ok(!scripts.includes('*') && !scripts.includes('https:'));
  });

  it('sets the other headers', () => {
    const headers = securityHeaders({ publicOrigin: PUBLIC });
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
    assert.equal(headers['Permissions-Policy'], 'geolocation=(self), camera=(), microphone=()');
    assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
  });

  it('adds HSTS only for an https public origin', () => {
    assert.equal(securityHeaders({ publicOrigin: PUBLIC })['Strict-Transport-Security'], 'max-age=15552000');
    assert.equal('Strict-Transport-Security' in securityHeaders({ publicOrigin: 'http://192.168.1.36:3004' }), false);
    assert.equal('Strict-Transport-Security' in securityHeaders({ publicOrigin: null }), false);
    assert.equal('Strict-Transport-Security' in securityHeaders({}), false);
  });
});

describe('cacheControlFor', () => {
  it('the app shell is always revalidated', () => {
    for (const path of ['index.html', 'sw.js', 'manifest.webmanifest']) assert.equal(cacheControlFor(path), NO_CACHE, path);
    assert.equal(NO_CACHE, 'no-cache');
  });

  it('hashed build assets are cached for a year', () => {
    assert.equal(cacheControlFor('assets/index-C-kTfi3P.js'), IMMUTABLE);
    assert.equal(cacheControlFor('assets/index-BG7cRodu.css'), IMMUTABLE);
    assert.equal(IMMUTABLE, 'public, max-age=31536000, immutable');
  });

  it('other files keep the default', () => {
    assert.equal(cacheControlFor('favicon.ico'), null);
    assert.equal(cacheControlFor('icons/icon-192.png'), null);
    assert.equal(cacheControlFor('not-assets/x.js'), null);
  });
});
