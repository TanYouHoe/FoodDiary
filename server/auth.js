// Connector: bearer tokens, the authenticate middleware, and Google ID token
// verification. Session length is logic/accounts.js; which time zone wins and
// when a new one is stored is logic/meal-period.js.
//
// Note: authenticate can write the user's stored time zone on any
// authenticated request, from the X-Time-Zone header.

import jwt from 'jsonwebtoken';
import { TOKEN_TTL } from '../logic/accounts.js';
import { canonicalTimeZone, resolveTimeZone, shouldStoreTimeZone } from '../logic/meal-period.js';
import { pick, USER_FIELDS } from './rows.js';

export function makeTokens(secret) {
  return {
    sign: (userId) => jwt.sign({ id: userId }, secret, { expiresIn: TOKEN_TTL }),
    verify: (token) => jwt.verify(token, secret),
  };
}

// Sets req.user and req.timeZone, or answers 401.
// The browser names its zone in X-Time-Zone; the current request is read in it.
// When logic says so, the zone is stored on the user, and onTimeZoneChange(userId)
// runs after the response so derived data can follow it.
// now: () => Date.
export function makeAuthenticate({ db, tokens, defaultTimeZone, now, onTimeZoneChange }) {
  const findUser = db.prepare('SELECT id, name, email, avatar_url, role, timezone, timezone_updated_at, created_at FROM users WHERE id = ?');
  const setTimeZone = db.prepare('UPDATE users SET timezone = ?, timezone_updated_at = ? WHERE id = ?');
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token required' });
    let row;
    try {
      row = findUser.get(tokens.verify(header.slice(7)).id);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (!row) return res.status(401).json({ error: 'User not found' });

    const zoneHeader = req.get('X-Time-Zone');
    const at = now();
    if (shouldStoreTimeZone({ header: zoneHeader, stored: row.timezone, storedAt: row.timezone_updated_at, now: at })) {
      const zone = canonicalTimeZone(zoneHeader);
      setTimeZone.run(zone, at.toISOString(), row.id);
      row = { ...row, timezone: zone };
      const userId = row.id;
      res.once('finish', () => onTimeZoneChange(userId));
    }
    req.user = pick(row, USER_FIELDS);
    req.timeZone = resolveTimeZone({ header: zoneHeader, stored: row.timezone, fallback: defaultTimeZone });
    next();
  };
}

// Returns the verified token payload ({ email, name, picture, ... }), or throws.
export async function verifyGoogleCredential(credential, audience) {
  const { OAuth2Client } = await import('google-auth-library');
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken: credential, audience });
  return ticket.getPayload();
}
