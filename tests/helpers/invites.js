// Test helper: makes an account invite straight through the connector, so a
// suite can sign users up without an owner and without HTTP.

import { createInvite } from '../../server/invites.js';

// Returns the invite code. role: 'member' (default) or 'owner'.
export function inviteCode(db, { role = 'member', now = new Date() } = {}) {
  const result = createInvite(db, { role, now });
  if (!result.ok) throw new Error(`inviteCode: ${result.error}`);
  return result.invite.code;
}
