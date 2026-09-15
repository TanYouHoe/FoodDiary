// Logic: account invites. Sign-up is by invite only. An invite carries the
// role the new account gets, lasts seven days, and works once. The connector
// stores invites (only a hash of the code) and asks these rules. Account
// invites are not group invite codes (logic/accounts.js).

import { USER_ROLES } from './access.js';

export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

// Random bytes in an account invite code.
export const ACCOUNT_INVITE_CODE_BYTES = 24;

// The browser route that shows an invite, and the path for one code. The
// server builds links with invitePath; the browser router uses INVITE_ROUTE.
export const INVITE_ROUTE = '/invite/:code';
export const invitePath = (code) => INVITE_ROUTE.replace(':code', encodeURIComponent(code));

// Invites made through the API give the member role. The first owner comes
// only from the command line (tools/create-invite.js --owner).
export const API_INVITE_ROLE = USER_ROLES.member;

export const INVITE_STATUSES ={ valid: 'valid', expired: 'expired', used: 'used', revoked: 'revoked' };

export const INVITE_REQUIRED = 'A valid invite is required';
export const OWNER_EXISTS = 'An owner already exists';
export const INVALID_INVITE_ROLE = 'Invalid invite role';
export const INVITE_ALREADY_USED = 'Invite already used';

// now: a Date. Returns the Date the invite stops working.
export function inviteExpiresAt(now) {
  return new Date(now.getTime() + INVITE_LIFETIME_MS);
}

// invite: { expires_at, used_at, revoked_at } (ISO strings or null); now: a Date.
// At the exact expiry instant the invite is expired.
export function inviteStatus(invite, now) {
  if (invite.used_at) return INVITE_STATUSES.used;
  if (invite.revoked_at) return INVITE_STATUSES.revoked;
  if (Date.parse(invite.expires_at) <= now.getTime()) return INVITE_STATUSES.expired;
  return INVITE_STATUSES.valid;
}

// Only the owner creates, lists and revokes invites. user: { id, role } or null.
export function canManageInvites(user) {
  return user?.role === USER_ROLES.owner;
}

// role: the role the invite gives. ownerExists: whether any user is owner.
// An owner invite may be created only while there is no owner.
// Returns the refusal text, or null.
export function inviteCreationRefusal(role, { ownerExists }) {
  if (!Object.values(USER_ROLES).includes(role)) return INVALID_INVITE_ROLE;
  if (role === USER_ROLES.owner && ownerExists) return OWNER_EXISTS;
  return null;
}

// An invite makes an account when it is valid at now. An owner invite also
// needs there to be no owner yet, so a second owner never appears.
export function canUseInvite(invite, now, { ownerExists }) {
  if (inviteStatus(invite, now) !== INVITE_STATUSES.valid) return false;
  return invite.role !== USER_ROLES.owner || !ownerExists;
}

// A used invite has made an account; revoking it would change nothing.
// Returns the refusal text, or null.
// Revoking a revoked invite again is accepted and changes nothing.
export function inviteRevokeRefusal(invite) {
  return invite.used_at ? INVITE_ALREADY_USED : null;
}

// Whether to offer a revoke control: only when the revoke is accepted and
// would change something, so never for a used or a revoked invite.
export function canOfferRevoke(invite) {
  return inviteRevokeRefusal(invite) === null && !invite.revoked_at;
}
