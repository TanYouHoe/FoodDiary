// Connector: composition root. Builds the Express app from a database handle,
// an uploads directory and a few settings. server.js reads the environment and
// calls this; tests call it with an in-memory database.

import express from 'express';
import cors from 'cors';
import { join } from 'node:path';
import { makeTokens, makeAuthenticate, verifyGoogleCredential } from './auth.js';
import { makeUpload, isUploadError } from './uploads.js';
import { makeGroupAccess } from './guards.js';
import { rebuildProfile } from './profile-store.js';
import { authRoutes } from './routes/auth.js';
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
}) {
  const tokens = makeTokens(jwtSecret);
  const authenticate = makeAuthenticate({ db, tokens });
  const upload = makeUpload(uploadsDir);
  const groupAllowed = makeGroupAccess(db);

  // The profile is derived data. A failed rebuild must not fail the meal change.
  const refreshProfile = (userId) => {
    try { rebuildProfile(db, userId); } catch (err) { log(`[profile] rebuild failed for user ${userId}: ${err.message}`); }
  };

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/uploads', express.static(uploadsDir));
  if (distDir) app.use(express.static(distDir));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes({ db, tokens, authenticate, verifyGoogle, googleClientId }));
  app.use('/api/restaurants', authenticate, restaurantRoutes({ db, upload, uploadsDir, refreshProfile }));
  app.use('/api/meal-types', authenticate, mealTypeRoutes({ db }));
  app.use('/api/dish-types', authenticate, dishTypeRoutes({ db }));
  app.use('/api/dishes', authenticate, dishRoutes({ db }));
  app.use('/api/meals', authenticate, mealRoutes({ db, upload, refreshProfile, groupAllowed }));
  app.use('/api/groups', authenticate, groupRoutes({ db, groupAllowed }));
  app.use('/api/planned', authenticate, plannedRoutes({ db, groupAllowed }));
  app.use('/api/suggest', authenticate, suggestRoutes({ db, now, rng, groupAllowed }));
  app.use('/api/profile', authenticate, profileRoutes({ db }));

  // SPA fallback
  if (distDir) app.get('*splat', (req, res) => res.sendFile(join(distDir, 'index.html')));

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
