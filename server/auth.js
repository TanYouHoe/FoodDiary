// Connector: bearer tokens, the authenticate middleware, and Google ID token
// verification. Session length is logic/accounts.js; token types, scopes and
// versions are logic/two-factor.js; which time zone wins and when a new one is
// stored is logic/meal-period.js.
//
// Note: authenticate can write the user's stored time zone on any
// authenticated request, from the X-Time-Zone header.

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { SESSION_TTL_SECONDS } from '../logic/accounts.js';
import {
  TOKEN_TYPES, MFA_TOKEN_TTL_SECONDS, MFA_ENROLL_REQUIRED, SESSION_EXPIRED,
  isTokenOfType, isCurrentTokenVersion, effectiveScope, scopeAllows,
} from '../logic/two-factor.js';
import { canonicalTimeZone, resolveTimeZone, shouldStoreTimeZone } from '../logic/meal-period.js';
import { pick, USER_FIELDS } from './rows.js';

const ALGORITHM = 'HS256';
const epochSeconds = (date) => Math.floor(date.getTime() / 1000);

// jsonwebtoken reads the real clock, so every sign and verify takes `now` (a
// Date): iat and exp are set from it, and verify checks exp against it.
export function makeTokens(secret) {
  const sign = (claims, now, ttlSeconds) => {
    const iat = epochSeconds(now);
    return jwt.sign({ ...claims, iat, exp: iat + ttlSeconds }, secret, { algorithm: ALGORITHM });
  };
  // The claims of a valid, unexpired token of `type`, or null.
  const verify = (token, now, type) => {
    try {
      const claims = jwt.verify(token, secret, { algorithms: [ALGORITHM], clockTimestamp: epochSeconds(now) });
      return isTokenOfType(claims, type) ? claims : null;
    } catch {
      return null;
    }
  };
  return {
    signSession: ({ userId, tokenVersion, scope }, now) =>
      sign({ typ: TOKEN_TYPES.session, id: userId, tv: tokenVersion, scope }, now, SESSION_TTL_SECONDS),
    // jti: the id the token is spent under (server/sessions.js completeMfa).
    signMfa: ({ userId, tokenVersion }, now) =>
      sign({ typ: TOKEN_TYPES.mfa, id: userId, tv: tokenVersion, jti: crypto.randomUUID() }, now, MFA_TOKEN_TTL_SECONDS),
    verifySession: (token, now) => verify(token, now, TOKEN_TYPES.session),
    verifyMfa: (token, now) => verify(token, now, TOKEN_TYPES.mfa),
  };
}

// Sets req.user, req.auth ({ totpEnabled, scope }) and req.timeZone, or answers
// 401 (no token, a bad token, a revoked token) or 403 (an enroll-scope session
// outside the enrollment routes).
// The browser names its zone in X-Time-Zone; the current request is read in it.
// When logic says so, the zone is stored on the user, and onTimeZoneChange(userId)
// runs once after the response, on 'finish' or on 'close' (a dropped
// connection), whichever comes first, so derived data can follow it.
// now: () => Date. requireTotp: whether the server requires a second factor.
export function makeAuthenticate({ db, tokens, defaultTimeZone, now, requireTotp, onTimeZoneChange }) {
  const findUser = db.prepare(`SELECT id, name, email, avatar_url, role, timezone, timezone_updated_at, created_at,
    token_version, totp_enabled_at FROM users WHERE id = ?`);
  const setTimeZone = db.prepare('UPDATE users SET timezone = ?, timezone_updated_at = ? WHERE id = ?');
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token required' });
    const at = now();
    const claims = tokens.verifySession(header.slice(7), at);
    if (!claims) return res.status(401).json({ error: 'Invalid token' });
    let row = findUser.get(claims.id);
    if (!row) return res.status(401).json({ error: 'User not found' });
    if (!isCurrentTokenVersion(claims, row.token_version)) return res.status(401).json({ error: SESSION_EXPIRED });

    const totpEnabled = Boolean(row.totp_enabled_at);
    const scope = effectiveScope({ tokenScope: claims.scope, totpEnabled, requireTotp });
    if (!scopeAllows(scope, req.method, req.originalUrl.split('?')[0])) return res.status(403).json(MFA_ENROLL_REQUIRED);

    const zoneHeader = req.get('X-Time-Zone');
    if (shouldStoreTimeZone({ header: zoneHeader, stored: row.timezone, storedAt: row.timezone_updated_at, now: at })) {
      const zone = canonicalTimeZone(zoneHeader);
      setTimeZone.run(zone, at.toISOString(), row.id);
      row = { ...row, timezone: zone };
      const userId = row.id;
      let scheduled = true;
      const rebuildOnce = () => {
        if (!scheduled) return;
        scheduled = false;
        res.off('finish', rebuildOnce);
        res.off('close', rebuildOnce);
        onTimeZoneChange(userId);
      };
      res.on('finish', rebuildOnce);
      res.on('close', rebuildOnce);
    }
    req.user = pick(row, USER_FIELDS);
    req.auth = { totpEnabled, scope };
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
