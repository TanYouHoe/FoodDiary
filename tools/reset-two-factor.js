// Connector: command line. Removes one user's authenticator app and backup
// codes and ends every session of that user. The recovery path when the owner
// has lost both the phone and the backup codes; the user sets up a new
// authenticator at the next sign-in.
//
//   node tools/reset-two-factor.js --db <path> --email <email>
//   FOOD_DIARY_DATA_DIR=<dir> node tools/reset-two-factor.js --email <email>   (uses <dir>/fooddiary.db)
//
//   DEFAULT_TIME_ZONE  as for server.js
//
// The database must be named: without --db or FOOD_DIARY_DATA_DIR it refuses to run.

import { pathToFileURL } from 'node:url';
import { openDatabase } from '../server/db.js';
import { clearTwoFactor } from '../server/two-factor.js';
import { databasePathFromArgs, flagValue, defaultTimeZoneFromEnv } from '../server/paths.js';

const USAGE = 'Usage: node tools/reset-two-factor.js --db <path> --email <email>  (or set FOOD_DIARY_DATA_DIR instead of --db)';

// args: the command line arguments; env: the environment;
// openDb: (path) => database; print: (line) => void. Returns { exitCode }.
export function runResetTwoFactor({ args, env, openDb, print }) {
  const path = databasePathFromArgs(args, env);
  const email = flagValue(args, '--email');
  if (!path || !email) {
    print(USAGE);
    return { exitCode: 1 };
  }
  const db = openDb(path);
  try {
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!user) {
      print(`No user with email ${email}.`);
      return { exitCode: 1 };
    }
    clearTwoFactor(db, user.id);
    print(`Two-factor reset for ${email}: authenticator and backup codes removed, every session ended.`);
    print('At the next sign-in the user sets up a new authenticator.');
    return { exitCode: 0 };
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode } = runResetTwoFactor({
    args: process.argv.slice(2),
    env: process.env,
    openDb: (path) => openDatabase(path, { defaultTimeZone: defaultTimeZoneFromEnv() }),
    print: (line) => console.log(line),
  });
  process.exit(exitCode);
}
