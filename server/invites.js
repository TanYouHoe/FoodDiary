// Connector: the account invite store. Makes codes (node:crypto), keeps only
// their SHA-256 hash, and uses an invite in one transaction with the account it
// makes. Every decision is logic/invites.js. Account invites are not group
// invite codes (server/routes/groups.js).

import crypto from 'node:crypto';
import { USER_ROLES } from '../logic/access.js';
import {
  ACCOUNT_INVITE_CODE_BYTES, invitePath, inviteExpiresAt, inviteStatus, inviteCreationRefusal, canUseInvite,
} from '../logic/invites.js';

export const hashInviteCode = (code) => crypto.createHash('sha256').update(code).digest('hex');

// origin: 'https://host[:port]'. The browser route that shows the invite.
export const inviteUrl = (origin, code) => `${origin.replace(/\/+$/, '')}${invitePath(code)}`;

const ownerExists = (db) => Boolean(db.prepare('SELECT 1 FROM users WHERE role = ? LIMIT 1').get(USER_ROLES.owner));

const toInvite = (row) => ({ role: row.role, expires_at: row.expires_at, used_at: row.used_at, revoked_at: row.revoked_at });

// role: 'member' | 'owner'; createdBy: a user id or null; now: a Date.
// Returns { ok: true, invite: { id, code, role, expires_at } } — the only place
// the code appears — or { ok: false, error }.
export function createInvite(db, { role, createdBy = null, now }) {
  return db.transaction(() => {
    const refusal = inviteCreationRefusal(role, { ownerExists: ownerExists(db) });
    if (refusal) return { ok: false, error: refusal };
    const code = crypto.randomBytes(ACCOUNT_INVITE_CODE_BYTES).toString('base64url');
    const expiresAt = inviteExpiresAt(now).toISOString();
    const info = db.prepare('INSERT INTO invites (code_hash, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(hashInviteCode(code), role, createdBy, now.toISOString(), expiresAt);
    return { ok: true, invite: { id: Number(info.lastInsertRowid), code, role, expires_at: expiresAt } };
  })();
}

export function makeInvites(db) {
  const byHash = db.prepare('SELECT * FROM invites WHERE code_hash = ?');
  const byId = db.prepare('SELECT * FROM invites WHERE id = ?');
  const markUsed = db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL');
  const markRevoked = db.prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL AND used_at IS NULL');
  const listRows = db.prepare(`
    SELECT i.id, i.role, i.created_at, i.expires_at, i.used_at, i.revoked_at,
      u.id AS user_id, u.name AS user_name, u.email AS user_email
    FROM invites i
    LEFT JOIN users u ON u.id = i.used_by
    ORDER BY i.id DESC
  `);

  // The stored row for a code, or undefined. A code that is not a string finds nothing.
  const findByCode = (code) => (typeof code === 'string' && code ? byHash.get(hashInviteCode(code)) : undefined);
  const usable = (row, now) => Boolean(row) && canUseInvite(toInvite(row), now, { ownerExists: ownerExists(db) });

  // Runs createUser(role) => new user id, and marks the invite used by that
  // user, in one transaction; an error from createUser rolls both back.
  // Returns the new user id, or null when the invite cannot be used.
  const redeemTx = db.transaction((code, now, createUser) => {
    const row = findByCode(code);
    if (!usable(row, now)) return null;
    const userId = Number(createUser(row.role));
    if (markUsed.run(userId, now.toISOString(), row.id).changes !== 1) throw new Error('invite changed during use');
    return userId;
  });

  return {
    isUsable: (code, now) => usable(findByCode(code), now),
    redeem: (code, now, createUser) => redeemTx(code, now, createUser),

    // The domain invite ({ id, role, expires_at, used_at, revoked_at }) for an id, or undefined.
    find: (id) => {
      const row = /^\d+$/.test(String(id)) ? byId.get(Number(id)) : undefined;
      return row && { id: row.id, ...toInvite(row) };
    },

    revoke: (id, now) => { markRevoked.run(now.toISOString(), id); },

    // Newest first, without codes.
    list: (now) => listRows.all().map(row => ({
      id: row.id,
      role: row.role,
      created_at: row.created_at,
      expires_at: row.expires_at,
      used_at: row.used_at,
      used_by: row.user_id == null ? null : { id: row.user_id, name: row.user_name, email: row.user_email },
      revoked_at: row.revoked_at,
      status: inviteStatus(toInvite(row), now),
    })),
  };
}
