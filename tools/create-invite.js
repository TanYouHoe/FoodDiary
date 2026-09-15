// Connector: command line. Creates one account invite in the server's database
// and prints its link. The code is shown only here, once.
//
//   node tools/create-invite.js            a member invite
//   node tools/create-invite.js --owner    an owner invite (only while there is no owner)
//
//   PUBLIC_ORIGIN      origin of the link (default http://localhost:3004)
//   DEFAULT_TIME_ZONE  as for server.js
//
// On a fresh server this is how the first owner is made.

import { openDatabase } from '../server/db.js';
import { createInvite, inviteUrl } from '../server/invites.js';
import { DATABASE_PATH, defaultTimeZoneFromEnv } from '../server/paths.js';
import { USER_ROLES } from '../logic/access.js';

const role = process.argv.includes('--owner') ? USER_ROLES.owner : USER_ROLES.member;
const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:3004';

const db = openDatabase(DATABASE_PATH, { defaultTimeZone: defaultTimeZoneFromEnv() });
try {
  const result = createInvite(db, { role, now: new Date() });
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
  } else {
    console.log(`${result.invite.role} invite, valid until ${result.invite.expires_at}:`);
    console.log(inviteUrl(origin, result.invite.code));
  }
} finally {
  db.close();
}
