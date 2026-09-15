// Entry point. Reads the environment, opens the database, builds the app and
// listens. Everything else lives in server/ (connectors) and logic/ (rules).
//
//   PORT              listen port (default 3004)
//   JWT_SECRET        token signing secret (insecure default for development)
//   GOOGLE_CLIENT_ID  audience for Google sign-in tokens

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { openDatabase } from './server/db.js';
import { createApp } from './server/app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = (line) => console.log(line);

const PORT = Number(process.env.PORT) || 3004;
const JWT_SECRET = process.env.JWT_SECRET || 'food-diary-dev-secret';
const UPLOADS_DIR = join(__dirname, 'uploads');

mkdirSync(UPLOADS_DIR, { recursive: true });
const db = openDatabase(join(__dirname, 'fooddiary.db'));
const { app } = createApp({
  db,
  uploadsDir: UPLOADS_DIR,
  distDir: join(__dirname, 'dist'),
  jwtSecret: JWT_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  log,
});

app.listen(PORT, () => log(`Food Diary: First Bite running on http://localhost:${PORT}`));
