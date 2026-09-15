// Logic: the rules a server configuration must meet before the server starts.

import { isValidTimeZone } from './meal-period.js';

// The signing secret used when JWT_SECRET is not set. Public, so development only.
export const DEV_JWT_SECRET = 'food-diary-dev-secret';

// A production secret shorter than this is too easy to guess.
export const MIN_JWT_SECRET_LENGTH = 32;

// The zone for a user whose browser has not told the server its zone yet.
export const DEFAULT_TIME_ZONE = 'Asia/Kuala_Lumpur';

// The port the server listens on when PORT is not set, and the origin of the
// server on this machine at that port.
export const DEFAULT_PORT = 3004;
export const DEV_ORIGIN = `http://localhost:${DEFAULT_PORT}`;

// The protocol ('http:', 'https:', ...) when value is a bare origin (a
// trailing slash is allowed, a path is not), else null.
function originProtocol(value) {
  try {
    const url = new URL(value);
    return url.origin === value.replace(/\/+$/, '') ? url.protocol : null;
  } catch {
    return null;
  }
}

// nodeEnv: NODE_ENV; jwtSecret: JWT_SECRET as set, or undefined;
// defaultTimeZone: DEFAULT_TIME_ZONE as set, or undefined;
// publicOrigin: PUBLIC_ORIGIN as set, or undefined. Account invite links are
// built on it, so production needs it, over https; elsewhere http also works.
// Returns a list of problems; an empty list means the server may start.
export function checkServerConfig({ nodeEnv, jwtSecret, defaultTimeZone, publicOrigin }) {
  const problems = [];
  if (nodeEnv === 'production') {
    if (!jwtSecret) problems.push('JWT_SECRET must be set in production.');
    else if (jwtSecret === DEV_JWT_SECRET) problems.push('JWT_SECRET must not be the development default in production.');
    else if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
      problems.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters in production.`);
    }
    if (!publicOrigin) problems.push('PUBLIC_ORIGIN must be set in production.');
    else if (originProtocol(publicOrigin) !== 'https:') {
      problems.push('PUBLIC_ORIGIN must be an https origin in production, such as https://food.example.com.');
    }
  } else if (publicOrigin && !['http:', 'https:'].includes(originProtocol(publicOrigin))) {
    problems.push(`PUBLIC_ORIGIN must be an http or https origin, such as ${DEV_ORIGIN}.`);
  }
  if (defaultTimeZone !== undefined && !isValidTimeZone(defaultTimeZone)) {
    problems.push(`DEFAULT_TIME_ZONE must be an IANA time zone, such as ${DEFAULT_TIME_ZONE}.`);
  }
  return problems;
}
