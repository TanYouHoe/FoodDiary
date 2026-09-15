// Logic: the rules a server configuration must meet before the server starts.

// The signing secret used when JWT_SECRET is not set. Public, so development only.
export const DEV_JWT_SECRET = 'food-diary-dev-secret';

// A production secret shorter than this is too easy to guess.
export const MIN_JWT_SECRET_LENGTH = 32;

// nodeEnv: NODE_ENV; jwtSecret: JWT_SECRET as set, or undefined.
// Returns a list of problems; an empty list means the server may start.
export function checkServerConfig({ nodeEnv, jwtSecret }) {
  const problems = [];
  if (nodeEnv === 'production') {
    if (!jwtSecret) problems.push('JWT_SECRET must be set in production.');
    else if (jwtSecret === DEV_JWT_SECRET) problems.push('JWT_SECRET must not be the development default in production.');
    else if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
      problems.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters in production.`);
    }
  }
  return problems;
}
