// Logic: what the server tells browsers. Which origins may call the API from
// another page (CORS), the security headers on every response, and how long a
// browser may keep a static file. The connector (server/app.js) only sets them.

// The Vite dev server. Allowed outside production only.
export const VITE_DEV_ORIGIN = 'http://localhost:5176';

// publicOrigin: PUBLIC_ORIGIN (already checked by logic/config.js), or null.
// nodeEnv: NODE_ENV. Returns the origins whose pages may call the API.
export function allowedOrigins({ publicOrigin, nodeEnv }) {
  const origins = publicOrigin ? [publicOrigin.replace(/\/+$/, '')] : [];
  if (nodeEnv !== 'production') origins.push(VITE_DEV_ORIGIN);
  return origins;
}

// origin: the request's Origin header, or undefined. Only an exact match is
// allowed. A request with no Origin needs no CORS headers.
export const isAllowedOrigin = (origin, allowed) => typeof origin === 'string' && allowed.includes(origin);

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const GOOGLE_IDENTITY_STYLE = 'https://accounts.google.com/gsi/style';
const GOOGLE_ACCOUNTS = 'https://accounts.google.com';
const MAPS_API = 'https://maps.googleapis.com';
const MAPS_STATIC = 'https://maps.gstatic.com';

const CONTENT_SECURITY_POLICY = {
  'default-src': ["'self'"],
  // Scripts only from this origin (Vite builds external module scripts) and
  // the two Google loaders in src/google.js. Never inline, never eval.
  'script-src': ["'self'", GOOGLE_IDENTITY_SCRIPT, MAPS_API, MAPS_STATIC],
  // 'unsafe-inline' for styles only: React renders style="" attributes, and
  // Google Identity Services and Maps inject inline styles. Styles cannot run
  // code, so scripts stay locked down.
  'style-src': ["'self'", "'unsafe-inline'", GOOGLE_IDENTITY_STYLE],
  'img-src': ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com', MAPS_STATIC, MAPS_API],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", GOOGLE_ACCOUNTS, MAPS_API],
  'frame-src': [GOOGLE_ACCOUNTS],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
};

// HSTS for 180 days, sent only when the app is reached over https.
const HSTS = 'max-age=15552000';

// publicOrigin: PUBLIC_ORIGIN, or null. Returns { header name: value }.
export function securityHeaders({ publicOrigin } = {}) {
  const headers = {
    'Content-Security-Policy': Object.entries(CONTENT_SECURITY_POLICY).map(([name, values]) => `${name} ${values.join(' ')}`).join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
    // Google sign-in opens a popup that must be able to report back.
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  };
  if (typeof publicOrigin === 'string' && publicOrigin.startsWith('https://')) headers['Strict-Transport-Security'] = HSTS;
  return headers;
}

export const NO_CACHE = 'no-cache';
export const IMMUTABLE = 'public, max-age=31536000, immutable';

// The app shell: a browser must check these for a new version on every load.
const SHELL_FILES = new Set(['index.html', 'sw.js', 'manifest.webmanifest']);

// relativePath: a built file's path inside dist, with '/' separators.
// Returns the Cache-Control value, or null for the default.
export function cacheControlFor(relativePath) {
  if (SHELL_FILES.has(relativePath.split('/').pop())) return NO_CACHE;
  if (relativePath.startsWith('assets/')) return IMMUTABLE; // Vite puts a content hash in these names
  return null;
}
