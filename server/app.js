// Connector: composition root. Builds the Express app from a database handle,
// an uploads directory and a few settings. server.js reads the environment and
// calls this; tests call it with an in-memory database.

import express from 'express';
import cors from 'cors';
import { join, relative, sep } from 'node:path';
import { isAllowedOrigin, securityHeaders, uploadSecurityHeaders, cacheControlFor } from '../logic/http-policy.js';
import { isServablePhotoName } from '../logic/meals.js';
import { normalizeBuildId, BUILD_HEADER } from '../logic/app-build.js';
import { notFound } from './guards.js';
import { makeTokens, makeAuthenticate, verifyGoogleCredential } from './auth.js';
import { makeUpload, isUploadError } from './uploads.js';
import { makeGroupAccess } from './guards.js';
import { rebuildProfile } from './profile-store.js';
import { resolveTimeZone, isValidTimeZone } from '../logic/meal-period.js';
import { makeInvites } from './invites.js';
import { makeLockout } from './lockout-store.js';
import { makeTwoFactor } from './two-factor.js';
import { backupCodePepper } from './totp-crypto.js';
import { makeSessions } from './sessions.js';
import { makeFactorGuard } from './factor-guard.js';
import { authRoutes } from './routes/auth.js';
import { totpRoutes } from './routes/totp.js';
import { userRoutes } from './routes/users.js';
import { inviteRoutes } from './routes/invites.js';
import { restaurantRoutes } from './routes/restaurants.js';
import { mealTypeRoutes, dishTypeRoutes } from './routes/catalog.js';
import { mealRoutes, dishRoutes } from './routes/meals.js';
import { groupRoutes } from './routes/groups.js';
import { plannedRoutes } from './routes/planned.js';
import { suggestRoutes, profileRoutes } from './routes/insights.js';

export function createApp({
  db,
  uploadsDir,
  distDir = null,
  jwtSecret,
  googleClientId,
  verifyGoogle = verifyGoogleCredential,
  now = () => new Date(),
  rng = Math.random,
  log = () => {},
  defaultTimeZone,
  publicOrigin = null,
  requireTotp,
  allowedOrigins = [], // from logic/http-policy.js allowedOrigins
  trustProxy = false,  // from logic/config.js parseTrustProxy
  appBuild = null,     // from server/paths.js readAppBuild; null leaves X-App-Build out
}) {
  if (!isValidTimeZone(defaultTimeZone)) throw new Error(`createApp: defaultTimeZone must be an IANA time zone, got ${defaultTimeZone}`);
  if (typeof requireTotp !== 'boolean') throw new Error(`createApp: requireTotp must be a boolean, got ${requireTotp}`);
  const tokens = makeTokens(jwtSecret);
  const upload = makeUpload(uploadsDir);
  const groupAllowed = makeGroupAccess(db);
  const invites = makeInvites(db);
  const lockout = makeLockout(db);
  const twoFactor = makeTwoFactor(db, { backupCodePepper: backupCodePepper(jwtSecret) });
  const sessions = makeSessions({ db, tokens, requireTotp, now });
  const guard = makeFactorGuard({ lockout, twoFactor, now });

  // The profile is derived data. A failed rebuild must not fail the meal change.
  // It is read in the user's stored zone, else the default zone.
  const storedTimeZone = db.prepare('SELECT timezone FROM users WHERE id = ?');
  const refreshProfile = (userId) => {
    try {
      const timeZone = resolveTimeZone({ stored: storedTimeZone.get(userId)?.timezone, fallback: defaultTimeZone });
      rebuildProfile(db, userId, timeZone);
    } catch (err) { log(`[profile] rebuild failed for user ${userId}: ${err.message}`); }
  };
  const authenticate = makeAuthenticate({ db, tokens, defaultTimeZone, now, requireTotp, onTimeZoneChange: refreshProfile });

  const app = express();
  // req.ip is the client named by a trusted proxy, so the lockout keys by the real IP.
  app.set('trust proxy', trustProxy);

  const headers = securityHeaders({ publicOrigin });
  app.use((req, res, next) => { res.set(headers); next(); });

  // Every API answer names the deployed build, so an open page learns that a
  // new version is out (src/api.js).
  const build = normalizeBuildId(appBuild);
  if (build) app.use('/api', (req, res, next) => { res.set(BUILD_HEADER, build); next(); });

  // CORS headers only for an allowed Origin; any other origin gets none, and
  // its preflight is not approved. Every answer varies by Origin for caches.
  const allowCors = cors({ origin: true });
  app.use((req, res, next) => {
    res.vary('Origin');
    return isAllowedOrigin(req.get('Origin'), allowedOrigins) ? allowCors(req, res, next) : next();
  });

  app.use(express.json({ limit: '1mb' }));

  // /uploads: photo names only, under a sandbox policy, and never the app
  // shell. A missing or denied file answers JSON 404 or 403. The static
  // module's own error carries the file's absolute path, so it is not shown.
  const uploadHeaders = uploadSecurityHeaders();
  app.use('/uploads',
    (req, res, next) => {
      res.set(uploadHeaders);
      return isServablePhotoName(req.path) ? next() : notFound(res);
    },
    express.static(uploadsDir, { dotfiles: 'deny', index: false, fallthrough: false }),
    (err, req, res, next) => {
      if (err.status === 404) return notFound(res);
      if (err.status === 403) return res.status(403).json({ error: 'Forbidden' });
      next(err);
    });
  const setCacheControl = (res, relativePath) => {
    const value = cacheControlFor(relativePath);
    if (value) res.setHeader('Cache-Control', value);
  };
  if (distDir) {
    app.use(express.static(distDir, {
      setHeaders: (res, filePath) => setCacheControl(res, relative(distDir, filePath).split(sep).join('/')),
    }));
  }

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // The routes an enroll-scope session may reach are listed in logic/two-factor.js ENROLL_SCOPE_ROUTES.
  app.use('/api/auth/totp', totpRoutes({ authenticate, twoFactor, guard, sessions, requireTotp, now }));
  app.use('/api/auth', authRoutes({ db, authenticate, verifyGoogle, googleClientId, invites, tokens, twoFactor, lockout, sessions, now }));
  app.use('/api/invites', inviteRoutes({ db, invites, authenticate, lockout, now, publicOrigin }));
  app.use('/api/users', authenticate, userRoutes({ db, twoFactor, guard }));
  app.use('/api/restaurants', authenticate, restaurantRoutes({ db, upload, uploadsDir, refreshProfile }));
  app.use('/api/meal-types', authenticate, mealTypeRoutes({ db }));
  app.use('/api/dish-types', authenticate, dishTypeRoutes({ db }));
  app.use('/api/dishes', authenticate, dishRoutes({ db }));
  app.use('/api/meals', authenticate, mealRoutes({ db, upload, refreshProfile, groupAllowed }));
  app.use('/api/groups', authenticate, groupRoutes({ db, groupAllowed }));
  app.use('/api/planned', authenticate, plannedRoutes({ db, groupAllowed }));
  app.use('/api/suggest', authenticate, suggestRoutes({ db, now, rng, groupAllowed }));
  app.use('/api/profile', authenticate, profileRoutes({ db }));

  // No HTML for a missing file: an unknown API path (any method) is JSON 404,
  // and a missing build asset is a bare 404, not the app shell.
  app.use('/api', (req, res) => notFound(res));
  app.use('/assets', (req, res) => res.status(404).end());

  // SPA fallback
  if (distDir) {
    app.get('*splat', (req, res) => {
      setCacheControl(res, 'index.html');
      res.sendFile(join(distDir, 'index.html'));
    });
  }

  // Last: every error becomes JSON. Upload limits and client errors the parser
  // marks as safe to show keep their 4xx; anything else is logged and hidden.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (isUploadError(err)) return res.status(400).json({ error: err.message });
    if (err.expose && err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: err.message });
    log(`[error] ${req.method} ${req.originalUrl}: ${err.stack || err.message}`);
    res.status(500).json({ error: 'Internal error' });
  });

  return { app };
}
