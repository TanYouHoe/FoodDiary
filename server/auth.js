// Connector: bearer tokens, the authenticate middleware, and Google ID token
// verification. Session length is logic/accounts.js; which time zone wins is
// logic/meal-period.js.

import jwt from 'jsonwebtoken';
import { TOKEN_TTL } from '../logic/accounts.js';
import { resolveTimeZone, shouldStoreTimeZone } from '../logic/meal-period.js';
import { pick, USER_FIELDS } from './rows.js';

export function makeTokens(secret) {
  return {
    sign: (userId) => jwt.sign({ id: userId }, secret, { expiresIn: TOKEN_TTL }),
    verify: (token) => jwt.verify(token, secret),
  };
}

// Sets req.user and req.timeZone, or answers 401.
// The browser names its zone in X-Time-Zone. A new zone is stored on the user,
// then onTimeZoneChange(userId) runs so derived data can follow it.
export function makeAuthenticate({ db, tokens, defaultTimeZone, onTimeZoneChange }) {
  const findUser = db.prepare('SELECT id, name, email, avatar_url, role, timezone, created_at FROM users WHERE id = ?');
  const setTimeZone = db.prepare('UPDATE users SET timezone = ? WHERE id = ?');
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
    if (shouldStoreTimeZone(zoneHeader, row.timezone)) {
      setTimeZone.run(zoneHeader, row.id);
      row = { ...row, timezone: zoneHeader };
      onTimeZoneChange(row.id);
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
