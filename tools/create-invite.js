// Connector: command line. Creates one account invite and prints its link.
// The code is shown only here, once. On a fresh server this is how the first
// owner is made.
//
//   node tools/create-invite.js --db <path> [--owner]
//   FOOD_DIARY_DATA_DIR=<dir> node tools/create-invite.js [--owner]   (uses <dir>/fooddiary.db)
//
//   --owner            an owner invite (only while there is no owner); default a member invite
//   PUBLIC_ORIGIN      origin of the link (default http://localhost:3004)
//   DEFAULT_TIME_ZONE  as for server.js
//
// The database must be named: without --db or FOOD_DIARY_DATA_DIR it refuses to run.

import { pathToFileURL } from 'node:url';
import { openDatabase } from '../server/db.js';
import { createInvite, inviteUrl } from '../server/invites.js';
import { databasePathIn, defaultTimeZoneFromEnv } from '../server/paths.js';
import { USER_ROLES } from '../logic/access.js';

const DEFAULT_ORIGIN = 'http://localhost:3004';
const USAGE = 'Usage: node tools/create-invite.js --db <path> [--owner]  (or set FOOD_DIARY_DATA_DIR)';

// The database path from --db <path>, else FOOD_DIARY_DATA_DIR, else null.
function databasePath(args, env) {
  const at = args.indexOf('--db');
  if (at !== -1) return args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : null;
  return env.FOOD_DIARY_DATA_DIR ? databasePathIn(env.FOOD_DIARY_DATA_DIR) : null;
}

// args: the command line arguments; env: the environment; now: a Date;
// openDb: (path) => database; print: (line) => void. Returns { exitCode }.
export function runCreateInvite({ args, env, now, openDb, print }) {
  const path = databasePath(args, env);
  if (!path) {
    print(USAGE);
    return { exitCode: 1 };
  }
  const role = args.includes('--owner') ? USER_ROLES.owner : USER_ROLES.member;
  const db = openDb(path);
  try {
    const result = createInvite(db, { role, now });
    if (!result.ok) {
      print(result.error);
      return { exitCode: 1 };
    }
    print(`${result.invite.role} invite, valid until ${result.invite.expires_at}:`);
    print(inviteUrl(env.PUBLIC_ORIGIN || DEFAULT_ORIGIN, result.invite.code));
    return { exitCode: 0 };
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode } = runCreateInvite({
    args: process.argv.slice(2),
    env: process.env,
    now: new Date(),
    openDb: (path) => openDatabase(path, { defaultTimeZone: defaultTimeZoneFromEnv() }),
    print: (line) => console.log(line),
  });
  process.exit(exitCode);
}
