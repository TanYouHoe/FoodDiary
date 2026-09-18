// Connector: joins the shared auth module to Food Diary's own `users` table.
//
// The module owns identity — the Google account, the authenticator, the session,
// the roles. Food Diary keeps its `users` row, because eleven of its tables point
// at `users(id)` and the row carries the name, the avatar and the stored time
// zone. One column, `auth_user_id`, ties the two together.
//
// `authenticate` is a drop-in replacement for the old one: it still leaves
// req.user (the app's row), req.auth and req.timeZone on the request, so not one
// of the ten route groups had to change.

import { canonicalEmail, hasPermission, MANAGE_USERS } from 'family-auth/logic'
import { USER_ROLES } from '../logic/access.js'
import { canonicalTimeZone, resolveTimeZone, shouldStoreTimeZone } from '../logic/meal-period.js'
import { pick, USER_FIELDS } from './rows.js'

// The app row for an auth account, made on first sign-in.
//
// `password_hash` is NOT NULL from the days when this app kept passwords. It is
// dead now — the module holds every credential — so a new row stores an empty
// string rather than forcing a table rebuild on every existing database.
export function linkAppUser(db, account, { now }) {
  const byLink = db.prepare('SELECT * FROM users WHERE auth_user_id = ?').get(account.id)
  if (byLink) return byLink

  // An address that already has an app row (a database from before the module)
  // is adopted rather than duplicated.
  const byEmail = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(canonicalEmail(account.email))
  if (byEmail) {
    db.prepare('UPDATE users SET auth_user_id = ? WHERE id = ?').run(account.id, byEmail.id)
    return db.prepare('SELECT * FROM users WHERE id = ?').get(byEmail.id)
  }

  const info = db.prepare(`
    INSERT INTO users (name, email, password_hash, avatar_url, auth_user_id, created_at)
    VALUES (@name, @email, '', @avatar, @authId, @createdAt)
  `).run({
    name: account.displayName || account.email.split('@')[0],
    email: account.email,
    avatar: account.pictureUrl || null,
    authId: account.id,
    createdAt: new Date(now()).toISOString(),
  })
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)
}

// Keep the name and picture Google shows in step with the app row.
function refreshFromAccount(db, row, account) {
  const name = account.displayName || row.name
  const avatar = account.pictureUrl || row.avatar_url
  if (name === row.name && avatar === row.avatar_url) return row
  db.prepare('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?').run(name, avatar, row.id)
  return { ...row, name, avatar_url: avatar }
}

// A drop-in replacement for the old makeAuthenticate.
//
// It answers 401 with no session and 403 for a half-finished sign-in, which is
// what the module's own gate decides. The browser names its zone in
// X-Time-Zone; when logic says so the zone is stored on the user, and
// onTimeZoneChange(userId) runs once after the response so derived data follows.
export function makeAuthenticate({ db, defaultTimeZone, now, onTimeZoneChange = () => {} }) {
  const setTimeZone = db.prepare('UPDATE users SET timezone = ?, timezone_updated_at = ? WHERE id = ?')

  return function authenticate(req, res, next) {
    const auth = req.auth
    if (!auth || !auth.user) return res.status(401).json({ error: 'Sign in required' })
    if (auth.scope !== 'full') return res.status(403).json({ error: 'Finish signing in first', step: auth.scope })

    const at = now()
    let row = linkAppUser(db, auth.user, { now })
    row = refreshFromAccount(db, row, auth.user)

    const zoneHeader = req.get('X-Time-Zone')
    if (shouldStoreTimeZone({ header: zoneHeader, stored: row.timezone, storedAt: row.timezone_updated_at, now: at })) {
      const zone = canonicalTimeZone(zoneHeader)
      setTimeZone.run(zone, at.toISOString(), row.id)
      row = { ...row, timezone: zone }
      const userId = row.id
      let scheduled = true
      const rebuildOnce = () => {
        if (!scheduled) return
        scheduled = false
        res.off('finish', rebuildOnce)
        res.off('close', rebuildOnce)
        onTimeZoneChange(userId)
      }
      res.on('finish', rebuildOnce)
      res.on('close', rebuildOnce)
    }

    req.user = pick(row, USER_FIELDS)
    // Food Diary's own rules ask `user.role === 'owner'` — who may change a
    // shared restaurant, a catalog entry, somebody else's row. The module says
    // the same thing with a permission, so it is translated once here and every
    // rule in logic/access.js keeps working untouched.
    req.user.role = hasPermission(auth.permissions, MANAGE_USERS) ? USER_ROLES.owner : USER_ROLES.member
    req.user.permissions = Array.from(auth.permissions)
    req.timeZone = resolveTimeZone({ header: zoneHeader, stored: row.timezone, fallback: defaultTimeZone })
    return next()
  }
}

export default { makeAuthenticate, linkAppUser }
