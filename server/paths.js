// Connector: where the server keeps its files, and the default time zone from
// the environment. Shared by server.js and tools/, so both open the same database.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_TIME_ZONE } from '../logic/config.js';

export const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATABASE_PATH = join(ROOT_DIR, 'fooddiary.db');
export const UPLOADS_DIR = join(ROOT_DIR, 'uploads');
export const DIST_DIR = join(ROOT_DIR, 'dist');

// DEFAULT_TIME_ZONE as set, else the built-in default.
export const defaultTimeZoneFromEnv = (env = process.env) => env.DEFAULT_TIME_ZONE ?? DEFAULT_TIME_ZONE;
