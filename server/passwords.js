// Connector: password hashing and checking with bcrypt. A login for an email
// with no account is compared against a dummy hash made once at start, so
// both paths cost one bcrypt comparison and timing does not reveal accounts.

import bcrypt from 'bcrypt';

export const BCRYPT_ROUNDS = 10;

const DUMMY_PASSWORD = 'food-diary: no account has this password';

// compare, hashSync: bcrypt's, replaceable in tests.
// Returns check(row, password) => Promise<boolean>. row: { password_hash } or undefined.
export function makePasswordCheck({ compare = bcrypt.compare, hashSync = bcrypt.hashSync } = {}) {
  const dummyHash = hashSync(DUMMY_PASSWORD, BCRYPT_ROUNDS);
  return async (row, password) => {
    const matched = await compare(password, row ? row.password_hash : dummyHash);
    return Boolean(row) && matched;
  };
}
