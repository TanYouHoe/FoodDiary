// UI: account invites on screen. Rows for the settings tab and the state of the
// invite page. The rules (status, revoke) are logic/invites.js. Account invites
// are not group invite codes.

import { INVITE_LIFETIME_MS, INVITE_STATUSES, inviteRevokeRefusal } from '../../logic/invites.js';
import { formatShortDate } from './format.js';

export const INVITE_STATUS_LABELS = {
  [INVITE_STATUSES.valid]: 'Active',
  [INVITE_STATUSES.expired]: 'Expired',
  [INVITE_STATUSES.used]: 'Used',
  [INVITE_STATUSES.revoked]: 'Revoked',
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const INVITE_HELP_TEXT =
  `Sign-up is by invite only. An account invite link makes one account and works for ${INVITE_LIFETIME_MS / DAY_MS} days.`;

// invites: the list from GET /api/invites. Returns one row per invite, in order.
export function toInviteRows(invites) {
  return invites.map(invite => ({
    id: invite.id,
    status: invite.status,
    statusLabel: INVITE_STATUS_LABELS[invite.status] ?? invite.status,
    created: formatShortDate(invite.created_at),
    expires: formatShortDate(invite.expires_at),
    usedBy: invite.used_by ? `${invite.used_by.name} (${invite.used_by.email})` : null,
    usedOn: invite.used_at ? formatShortDate(invite.used_at) : null,
    canRevoke: invite.status !== INVITE_STATUSES.revoked && inviteRevokeRefusal(invite) === null,
  }));
}

// check: null while the check runs, else { valid }. Returns 'checking' | 'valid' | 'invalid'.
export function invitePageState(check) {
  if (!check) return 'checking';
  return check.valid ? 'valid' : 'invalid';
}
