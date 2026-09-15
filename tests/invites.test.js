import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INVITE_LIFETIME_MS, inviteExpiresAt, inviteStatus, canManageInvites, inviteCreationRefusal,
  canUseInvite, inviteRevokeRefusal, canOfferRevoke, API_INVITE_ROLE, invitePath, INVITE_ROUTE, OWNER_EXISTS, INVALID_INVITE_ROLE, INVITE_ALREADY_USED,
} from '../logic/invites.js';

describe('invitePath', () => {
  it('is the browser route with the code', () => {
    assert.equal(invitePath('abc_DEF-123'), '/invite/abc_DEF-123');
    assert.equal(INVITE_ROUTE, '/invite/:code');
  });
  it('matches the route pattern', () => {
    assert.equal(invitePath('x'), INVITE_ROUTE.replace(':code', 'x'));
  });
});

describe('API_INVITE_ROLE', () => {
  it('invites made through the API are member invites', () => assert.equal(API_INVITE_ROLE, 'member'));
});

const NOW = new Date('2026-09-16T10:00:00.000Z');
const later = (ms) => new Date(NOW.getTime() + ms);
const invite = (fields = {}) => ({
  role: 'member', expires_at: inviteExpiresAt(NOW).toISOString(), used_at: null, revoked_at: null, ...fields,
});

describe('invite lifetime', () => {
  it('is seven days', () => assert.equal(INVITE_LIFETIME_MS, 7 * 24 * 60 * 60 * 1000));
  it('expires seven days after now', () => {
    assert.equal(inviteExpiresAt(NOW).toISOString(), '2026-09-23T10:00:00.000Z');
  });
  it('does not change now', () => {
    const now = new Date(NOW);
    inviteExpiresAt(now);
    assert.equal(now.getTime(), NOW.getTime());
  });
});

describe('inviteStatus', () => {
  it('is valid before it expires', () => {
    assert.equal(inviteStatus(invite(), NOW), 'valid');
    assert.equal(inviteStatus(invite(), later(INVITE_LIFETIME_MS - 1)), 'valid');
  });
  it('is expired at the exact expiry instant and after', () => {
    assert.equal(inviteStatus(invite(), later(INVITE_LIFETIME_MS)), 'expired');
    assert.equal(inviteStatus(invite(), later(INVITE_LIFETIME_MS + 1)), 'expired');
  });
  it('is used once used, even after it expires', () => {
    const used = invite({ used_at: NOW.toISOString() });
    assert.equal(inviteStatus(used, NOW), 'used');
    assert.equal(inviteStatus(used, later(INVITE_LIFETIME_MS)), 'used');
  });
  it('is revoked once revoked, even after it expires', () => {
    const revoked = invite({ revoked_at: NOW.toISOString() });
    assert.equal(inviteStatus(revoked, NOW), 'revoked');
    assert.equal(inviteStatus(revoked, later(INVITE_LIFETIME_MS)), 'revoked');
  });
});

describe('canManageInvites', () => {
  it('allows the owner', () => assert.equal(canManageInvites({ id: 1, role: 'owner' }), true));
  it('refuses a member', () => assert.equal(canManageInvites({ id: 2, role: 'member' }), false));
  it('refuses nobody signed in', () => assert.equal(canManageInvites(null), false));
});

describe('inviteCreationRefusal', () => {
  it('allows a member invite, with or without an owner', () => {
    assert.equal(inviteCreationRefusal('member', { ownerExists: true }), null);
    assert.equal(inviteCreationRefusal('member', { ownerExists: false }), null);
  });
  it('allows an owner invite only while there is no owner', () => {
    assert.equal(inviteCreationRefusal('owner', { ownerExists: false }), null);
    assert.equal(inviteCreationRefusal('owner', { ownerExists: true }), OWNER_EXISTS);
  });
  it('refuses an unknown role', () => {
    assert.equal(inviteCreationRefusal('admin', { ownerExists: false }), INVALID_INVITE_ROLE);
  });
});

describe('canUseInvite', () => {
  it('allows a valid member invite', () => assert.equal(canUseInvite(invite(), NOW, { ownerExists: true }), true));
  it('refuses an expired, used or revoked invite', () => {
    assert.equal(canUseInvite(invite(), later(INVITE_LIFETIME_MS), { ownerExists: false }), false);
    assert.equal(canUseInvite(invite({ used_at: NOW.toISOString() }), NOW, { ownerExists: false }), false);
    assert.equal(canUseInvite(invite({ revoked_at: NOW.toISOString() }), NOW, { ownerExists: false }), false);
  });
  it('allows an owner invite only while there is no owner', () => {
    assert.equal(canUseInvite(invite({ role: 'owner' }), NOW, { ownerExists: false }), true);
    assert.equal(canUseInvite(invite({ role: 'owner' }), NOW, { ownerExists: true }), false);
  });
});

describe('inviteRevokeRefusal', () => {
  it('allows a valid, expired or revoked invite', () => {
    assert.equal(inviteRevokeRefusal(invite()), null);
    assert.equal(inviteRevokeRefusal(invite({ revoked_at: NOW.toISOString() })), null);
  });
  it('refuses a used invite', () => {
    assert.equal(inviteRevokeRefusal(invite({ used_at: NOW.toISOString() })), INVITE_ALREADY_USED);
  });
});

describe('canOfferRevoke', () => {
  it('offers revoke for a valid or expired invite', () => {
    assert.equal(canOfferRevoke(invite()), true);
    assert.equal(canOfferRevoke(invite({ expires_at: NOW.toISOString() })), true);
  });
  it('does not offer revoke for a used invite, which the server refuses', () => {
    assert.equal(canOfferRevoke(invite({ used_at: NOW.toISOString() })), false);
  });
  it('does not offer revoke for a revoked invite, though the server accepts it again', () => {
    const revoked = invite({ revoked_at: NOW.toISOString() });
    assert.equal(canOfferRevoke(revoked), false);
    assert.equal(inviteRevokeRefusal(revoked), null);
  });
  it('agrees with the refusal: never offered when refused', () => {
    for (const fields of [{}, { used_at: 'x' }, { revoked_at: 'x' }, { used_at: 'x', revoked_at: 'x' }]) {
      const i = invite(fields);
      if (canOfferRevoke(i)) assert.equal(inviteRevokeRefusal(i), null, JSON.stringify(fields));
    }
  });
});
