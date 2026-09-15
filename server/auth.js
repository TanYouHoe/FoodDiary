// Connector: bearer tokens, the authenticate middleware, and Google ID token
// verification. Session length is logic/accounts.js.

import jwt from 'jsonwebtoken';
import { TOKEN_TTL } from '../logic/accounts.js';
import { pick, USER_FIELDS } from './rows.js';

export function makeTokens(secret) {
  return {
    sign: (userId) => jwt.sign({ id: userId }, secret, { expiresIn: TOKEN_TTL }),
    verify: (token) => jwt.verify(token, secret),
  };
}

// Sets req.user, or answers 401.
export function makeAuthenticate({ db, tokens }) {
  const findUser = db.prepare('SELECT id, name, email, avatar_url, created_at FROM users WHERE id = ?');
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
    req.user = pick(row, USER_FIELDS);
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
