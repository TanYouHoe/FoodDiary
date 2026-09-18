// Food Diary accounts, from the server box.
//
//   node tools/auth.js add you@gmail.com --name "Your Name" --role admin
//   node tools/auth.js list
//   node tools/auth.js roles
//   node tools/auth.js reset-totp someone@gmail.com     (a lost phone)
//   node tools/auth.js disable someone@gmail.com
//
// There is no sign-up page and no invite code any more: the first admin is made
// here, and everybody after that is added from the account console at /accounts.
//
// Connector: it opens the database and hands it to the shared auth module, which
// owns every rule.

import { runAuthCli } from 'family-auth/server/cli.js'
import { openDatabase } from '../server/db.js'
import { dataPathsFromEnv } from '../server/paths.js'
import { PERMISSIONS, ROLES } from '../logic/permissions.js'

const env = process.env
const { databasePath } = dataPathsFromEnv(env)
const db = openDatabase(databasePath, { defaultTimeZone: env.DEFAULT_TIME_ZONE || 'Asia/Kuala_Lumpur' })

const code = await runAuthCli({ db, appName: 'Food Diary', permissions: PERMISSIONS, roles: ROLES })
db.close()
process.exit(code)
