// Connector: where the server keeps its files, and the default time zone from
// the environment. Shared by server.js and tools/, so both open the same database.

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { DEFAULT_TIME_ZONE } from '../logic/config.js';
import { normalizeBuildId, BUILD_ID_FILE } from '../logic/app-build.js';

export const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATABASE_PATH = join(ROOT_DIR, 'fooddiary.db');
export const UPLOADS_DIR = join(ROOT_DIR, 'uploads');
export const DIST_DIR = join(ROOT_DIR, 'dist');

// The database file inside a data directory (FOOD_DIARY_DATA_DIR).
export const databasePathIn = (dataDir) => join(dataDir, 'fooddiary.db');

// FOOD_DIARY_DATA_DIR as an absolute path, or null when unset or empty. A
// relative directory resolves against the app directory, never the working
// directory, so the server and tools/ find the same files from anywhere.
export const dataDirFromEnv = (env) => (env.FOOD_DIARY_DATA_DIR ? resolve(ROOT_DIR, env.FOOD_DIARY_DATA_DIR) : null);

// For server.js: <dir>/fooddiary.db and <dir>/uploads, else the repo paths.
export function dataPathsFromEnv(env) {
  const dataDir = dataDirFromEnv(env);
  if (!dataDir) return { databasePath: DATABASE_PATH, uploadsDir: UPLOADS_DIR };
  return { databasePath: databasePathIn(dataDir), uploadsDir: join(dataDir, 'uploads') };
}

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
  const dataDir = dataDirFromEnv(env);
  return dataDir ? databasePathIn(dataDir) : null;
}

// The build id `npm run build` wrote into <distDir>/build-id.txt, or null when
// there is no build or no valid id.
export function readAppBuild(distDir) {
  if (!distDir) return null;
  try {
    return normalizeBuildId(readFileSync(join(distDir, BUILD_ID_FILE), 'utf8'));
  } catch {
    return null;
  }
}

// DEFAULT_TIME_ZONE as set, else the built-in default.
export const defaultTimeZoneFromEnv = (env = process.env) => env.DEFAULT_TIME_ZONE ?? DEFAULT_TIME_ZONE;
