// Entry point. Reads the environment, opens the database, builds the app and
// listens. Everything else lives in server/ (connectors) and logic/ (rules).
//
//   PORT              listen port (default 3004)
//   NODE_ENV          'production' refuses to start without a real JWT_SECRET
//   JWT_SECRET        token signing secret (insecure default for development)
//   GOOGLE_CLIENT_ID  audience for Google sign-in tokens
//   DEFAULT_TIME_ZONE IANA zone for users whose browser has not sent one (default Asia/Kuala_Lumpur)

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { checkServerConfig, DEV_JWT_SECRET, DEFAULT_TIME_ZONE } from './logic/config.js';
import { openDatabase } from './server/db.js';
import { createApp } from './server/app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = (line) => console.log(line);

const problems = checkServerConfig({
  nodeEnv: process.env.NODE_ENV,
  jwtSecret: process.env.JWT_SECRET,
  defaultTimeZone: process.env.DEFAULT_TIME_ZONE,
});
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3004;
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;
const UPLOADS_DIR = join(__dirname, 'uploads');
const TIME_ZONE = process.env.DEFAULT_TIME_ZONE ?? DEFAULT_TIME_ZONE;

mkdirSync(UPLOADS_DIR, { recursive: true });
const db = openDatabase(join(__dirname, 'fooddiary.db'), { defaultTimeZone: TIME_ZONE });
const { app } = createApp({
  db,
  uploadsDir: UPLOADS_DIR,
  distDir: join(__dirname, 'dist'),
  jwtSecret: JWT_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  defaultTimeZone: TIME_ZONE,
  log,
});

app.listen(PORT, () => log(`Food Diary: First Bite running on http://localhost:${PORT}`));
