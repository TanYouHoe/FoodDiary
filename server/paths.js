// Connector: where the server keeps its files, and the default time zone from
// the environment. Shared by server.js and tools/, so both open the same database.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_TIME_ZONE } from '../logic/config.js';

export const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATABASE_PATH = join(ROOT_DIR, 'fooddiary.db');
export const UPLOADS_DIR = join(ROOT_DIR, 'uploads');
export const DIST_DIR = join(ROOT_DIR, 'dist');

// The database file inside a data directory (FOOD_DIARY_DATA_DIR).
export const databasePathIn = (dataDir) => join(dataDir, 'fooddiary.db');

// The value after `flag` in a command line, or null when the flag is missing
// or is followed by nothing or by another flag.
export function flagValue(args, flag) {
  const at = args.indexOf(flag);
  if (at === -1) return null;
  const value = args[at + 1];
  return value && !value.startsWith('--') ? value : null;
}

// For tools/: the database from --db <path>, else <FOOD_DIARY_DATA_DIR>/fooddiary.db,
// else null. A --db with no path is null, never the environment.
export function databasePathFromArgs(args, env) {
  if (args.includes('--db')) return flagValue(args, '--db');
  return env.FOOD_DIARY_DATA_DIR ? databasePathIn(env.FOOD_DIARY_DATA_DIR) : null;
}

// DEFAULT_TIME_ZONE as set, else the built-in default.
export const defaultTimeZoneFromEnv = (env = process.env) => env.DEFAULT_TIME_ZONE ?? DEFAULT_TIME_ZONE;
