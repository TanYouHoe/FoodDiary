// Logic: what the server tells browsers. Which origins may call the API from
// another page (CORS), the security headers on every response, and how long a
// browser may keep a static file. The connector (server/app.js) only sets them.

// The Vite dev server. Allowed outside production only.
export const VITE_DEV_ORIGIN = 'http://localhost:5176';

// publicOrigin: PUBLIC_ORIGIN (already checked by logic/config.js), or null.
// nodeEnv: NODE_ENV. Returns the origins whose pages may call the API.
export function allowedOrigins({ publicOrigin, nodeEnv }) {
  const origins = publicOrigin ? [publicOrigin.replace(/\/+$/, '')] : [];
  // Vite proxies /api and /uploads, so calls from the dev page are same-origin.
  // This entry is kept for direct calls from the dev page to the API port.
  if (nodeEnv !== 'production') origins.push(VITE_DEV_ORIGIN);
  return origins;
}

// origin: the request's Origin header, or undefined. Only an exact match is
// allowed. A request with no Origin needs no CORS headers.
export const isAllowedOrigin = (origin, allowed) => typeof origin === 'string' && allowed.includes(origin);

const GOOGLE_IDENTITY = 'https://accounts.google.com/gsi/'; // a trailing slash matches every path below it
const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const GOOGLE_IDENTITY_STYLE = 'https://accounts.google.com/gsi/style';
const MAPS_API = 'https://maps.googleapis.com';
const MAPS_STATIC = 'https://maps.gstatic.com';

const CONTENT_SECURITY_POLICY = {
  'default-src': ["'self'"],
  // Scripts only from this origin (Vite builds external module scripts) and
  // the two Google loaders in src/google.js. Never inline, never eval.
  'script-src': ["'self'", GOOGLE_IDENTITY_SCRIPT, MAPS_API, MAPS_STATIC],
  // 'unsafe-inline' for styles only: React renders style="" attributes, and
  // Google Identity Services and Maps inject inline styles. Styles cannot run
  // code, so scripts stay locked down. Maps loads its Roboto stylesheet.
  'style-src': ["'self'", "'unsafe-inline'", GOOGLE_IDENTITY_STYLE, 'https://fonts.googleapis.com'],
  // Google avatars, and map tiles, markers and imagery on Google's image hosts.
  'img-src': ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com', 'https://*.googleapis.com',
    'https://*.gstatic.com', 'https://*.ggpht.com', 'https://*.google.com'],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
  'connect-src': ["'self'", GOOGLE_IDENTITY, 'https://*.googleapis.com'],
  'frame-src': [GOOGLE_IDENTITY],
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

// For /uploads, in place of the app policy: a stored photo is shown only as an
// image. Even a file that slipped past the checks can run no script, load
// nothing and reach no origin.
export const uploadSecurityHeaders = () => ({ 'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox" });

export const NO_CACHE = 'no-cache';
export const IMMUTABLE = 'public, max-age=31536000, immutable';

// The app shell: a browser must check these for a new version on every load.
const SHELL_FILES = new Set(['index.html', 'sw.js', 'manifest.webmanifest']);

// The Workbox runtime sw.js imports, at the root, named by its content hash.
const WORKBOX_RUNTIME = /^workbox-[0-9a-f]+\.js$/;

// relativePath: a built file's path inside dist, with '/' separators.
// Returns the Cache-Control value, or null for the default.
export function cacheControlFor(relativePath) {
  if (SHELL_FILES.has(relativePath.split('/').pop())) return NO_CACHE;
  if (relativePath.startsWith('assets/')) return IMMUTABLE; // Vite puts a content hash in these names
  if (WORKBOX_RUNTIME.test(relativePath)) return IMMUTABLE;
  return null;
}
