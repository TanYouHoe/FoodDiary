// Test helper: sign in through the shared auth module.
//
// Food Diary no longer mints its own tokens, so a test cannot register a user
// and read a bearer token back. Instead it stands in for Google — a "credential"
// here is JSON naming the address — and keeps the session cookie the module
// sets. The real signature check is proved in the module's own tests.
//
// `callApi` sends whatever a test calls `token` as that cookie, so the API tests
// keep their shape: only the way the token is obtained changed.

import { store } from 'family-auth/server';
import { canonicalEmail } from 'family-auth/logic';

export const SESSION_COOKIE = 'fd_session';

// Stands in for Google Identity Services. Pass it to createApp as verifyGoogle.
export function fakeGoogle() {
  const verify = async (credential) => {
    const parsed = JSON.parse(credential);
    return {
      googleSub: parsed.sub || `sub-${parsed.email}`,
      email: parsed.email,
      displayName: parsed.name || null,
      pictureUrl: parsed.picture || null,
    };
  };
  verify.credential = (email, extra = {}) => JSON.stringify({ email, ...extra });
  return verify;
}

// Add an account the way an admin would. Roles are the module's role keys.
export function addAccount(db, { email, name, roles = ['member'], now = Date.now() }) {
  return store.createUser(db, {
    email: canonicalEmail(email),
    displayName: name || email.split('@')[0],
    roleKeys: roles,
    now,
  });
}

// Sign in and return the session cookie value, which the API tests pass as
// `token`. Throws when the sign-in did not finish, so a broken test says why.
export async function signIn(base, email, { google = fakeGoogle() } = {}) {
  const res = await fetch(`${base}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: google.credential(email) }),
  });
  const body = await res.json().catch(() => null);
  if (res.status !== 200 || !body || body.step !== 'done') {
    throw new Error(`sign-in for ${email} did not finish: ${res.status} ${JSON.stringify(body)}`);
  }
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const line = setCookie.find(c => c.startsWith(`${SESSION_COOKIE}=`));
  if (!line) throw new Error(`no ${SESSION_COOKIE} cookie for ${email}`);
  return line.split(';')[0].slice(SESSION_COOKIE.length + 1);
}

// Add the account and sign in, in one step.
export async function signInAs(db, base, { email, name, roles, google }) {
  addAccount(db, { email, name, roles });
  return signIn(base, email, { google });
}
