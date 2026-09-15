// Entry point. Reads the environment, opens the database, builds the app and
// listens. Everything else lives in server/ (connectors) and logic/ (rules).
//
//   PORT              listen port (default 3004)
//   NODE_ENV          'production' refuses to start without a real JWT_SECRET
//   JWT_SECRET        token signing secret (insecure default for development)
//   GOOGLE_CLIENT_ID  audience for Google sign-in tokens
//   DEFAULT_TIME_ZONE IANA zone for users whose browser has not sent one (default Asia/Kuala_Lumpur)
//   PUBLIC_ORIGIN     origin of account invite links; required (https) in production,
//                     elsewhere the request's own origin when unset

import { mkdirSync } from 'node:fs';
import { checkServerConfig, DEV_JWT_SECRET, DEFAULT_PORT } from './logic/config.js';
import { openDatabase } from './server/db.js';
import { createApp } from './server/app.js';
import { DATABASE_PATH, UPLOADS_DIR, DIST_DIR, defaultTimeZoneFromEnv } from './server/paths.js';

const log = (line) => console.log(line);

const problems = checkServerConfig({
  nodeEnv: process.env.NODE_ENV,
  jwtSecret: process.env.JWT_SECRET,
  defaultTimeZone: process.env.DEFAULT_TIME_ZONE,
  publicOrigin: process.env.PUBLIC_ORIGIN,
});
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

const PORT = Number(process.env.PORT) || DEFAULT_PORT;
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;
const TIME_ZONE = defaultTimeZoneFromEnv();

mkdirSync(UPLOADS_DIR, { recursive: true });
const db = openDatabase(DATABASE_PATH, { defaultTimeZone: TIME_ZONE });
const { app } = createApp({
  db,
  uploadsDir: UPLOADS_DIR,
  distDir: DIST_DIR,
  jwtSecret: JWT_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  defaultTimeZone: TIME_ZONE,
  publicOrigin: process.env.PUBLIC_ORIGIN || null,
  log,
});

app.listen(PORT, () => log(`Food Diary: First Bite running on http://localhost:${PORT}`));
