// Entry point. Reads the environment, opens the database, builds the app and
// listens. Everything else lives in server/ (connectors) and logic/ (rules).
// `npm run server` also loads .env when present. Every value is checked by
// logic/config.js checkServerConfig before anything starts.
//
//   HOST                listen address (default 127.0.0.1: this machine only)
//   PORT                listen port (default 3004)
//   FOOD_DIARY_DATA_DIR data directory: <dir>/fooddiary.db and <dir>/uploads, created if
//                       missing; relative to the app directory. Unset: ./fooddiary.db, ./uploads
//   NODE_ENV            'production' refuses to start without a real JWT_SECRET
//   JWT_SECRET          token signing secret (insecure default for development)
//   GOOGLE_CLIENT_ID    audience for Google sign-in tokens
//   DEFAULT_TIME_ZONE   IANA zone for users whose browser has not sent one (default Asia/Kuala_Lumpur)
//   PUBLIC_ORIGIN       origin of account invite links, the CORS allow-list and HSTS;
//                       required (https) in production, elsewhere the request's own origin when unset
//   TRUST_PROXY         proxies trusted to name the client IP: 'loopback', a hop count or
//                       an IP/CIDR list; unset trusts none
//   REQUIRE_TOTP        '1' requires an authenticator app for every account, '0' does not;
//                       unset: required when NODE_ENV=production

import { mkdirSync } from 'node:fs';
import { loadAuthConfig } from 'family-auth/server';
import { checkServerConfig, shouldRequireTotp, parseTrustProxy, listenHost, listenPort, DEV_JWT_SECRET } from './logic/config.js';
import { allowedOrigins } from './logic/http-policy.js';
import { openDatabase } from './server/db.js';
import { createApp } from './server/app.js';
import { dataPathsFromEnv, DIST_DIR, defaultTimeZoneFromEnv, readAppBuild } from './server/paths.js';

const log = (line) => console.log(line);
const env = process.env;

const problems = checkServerConfig({
  nodeEnv: env.NODE_ENV,
  jwtSecret: env.JWT_SECRET,
  defaultTimeZone: env.DEFAULT_TIME_ZONE,
  publicOrigin: env.PUBLIC_ORIGIN,
  requireTotp: env.REQUIRE_TOTP,
  host: env.HOST,
  port: env.PORT,
  trustProxy: env.TRUST_PROXY,
});
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

const HOST = listenHost(env.HOST);
const PORT = listenPort(env.PORT);
const JWT_SECRET = env.JWT_SECRET || DEV_JWT_SECRET;
const TIME_ZONE = defaultTimeZoneFromEnv(env);
const PUBLIC_ORIGIN = env.PUBLIC_ORIGIN || null;
const { databasePath, uploadsDir } = dataPathsFromEnv(env);

mkdirSync(uploadsDir, { recursive: true }); // also creates the data directory
const db = openDatabase(databasePath, { defaultTimeZone: TIME_ZONE });
const { app } = createApp({
  db,
  uploadsDir,
  distDir: DIST_DIR,
  authConfig: loadAuthConfig(env),
  googleClientId: env.GOOGLE_CLIENT_ID,
  defaultTimeZone: TIME_ZONE,
  publicOrigin: PUBLIC_ORIGIN,
  requireTotp: shouldRequireTotp({ requireTotp: env.REQUIRE_TOTP, nodeEnv: env.NODE_ENV }),
  allowedOrigins: allowedOrigins({ publicOrigin: PUBLIC_ORIGIN, nodeEnv: env.NODE_ENV }),
  trustProxy: parseTrustProxy(env.TRUST_PROXY).value,
  appBuild: readAppBuild(DIST_DIR),
  log,
});

app.listen(PORT, HOST, () => log(`Food Diary: First Bite running on http://${HOST}:${PORT}`));
