// Logic: registration, login, sign-in sessions and groups.

export const TOKEN_TTL = '7d';
export const OWNER_ROLE = 'owner';
export const INVITE_CODE_BYTES = 4;

export function checkRegistration(body) {
  const { name, email, password } = body;
  if (!name?.trim() || !email?.trim() || !password) {
    return { ok: false, error: 'Name, email, and password required' };
  }
  return { ok: true, value: { name: name.trim(), email: email.trim(), password } };
}

export function checkLogin(body) {
  const { email, password } = body;
  if (!email || !password) return { ok: false, error: 'Email and password required' };
  return { ok: true, value: { email: email.trim(), password } };
}

// The registration dialog. Returns an error or null.
export function checkPasswordConfirmation(password, confirm) {
  return password === confirm ? null : 'Passwords do not match';
}

// A new Google account is named after the profile, else the email's local part.
export function googleAccountName(name, email) {
  return name || email.split('@')[0];
}

// A Google picture fills an empty avatar; it never replaces one.
export function shouldAdoptPicture(picture, user) {
  return Boolean(picture && !user.avatar_url);
}

export function checkGroupName(body) {
  const { name } = body;
  if (!name?.trim()) return { ok: false, error: 'Group name required' };
  return { ok: true, value: { name: name.trim() } };
}

// A group id from a body, a query string or a path. No group (undefined, null
// or '') is null; otherwise it must be a positive integer or its decimal string.
export function parseGroupId(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const id = typeof value === 'number' ? value
    : (typeof value === 'string' && /^\d+$/.test(value)) ? Number(value)
      : NaN;
  if (!Number.isSafeInteger(id) || id < 1) return { ok: false, error: 'Invalid group' };
  return { ok: true, value: id };
}

export function checkInviteCode(body) {
  const { invite_code } = body;
  if (!invite_code) return { ok: false, error: 'Invite code required' };
  return { ok: true, value: { invite_code } };
}
