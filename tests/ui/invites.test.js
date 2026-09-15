import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toInviteRows, invitePageState, INVITE_STATUS_LABELS, INVITE_HELP_TEXT } from '../../src/ui/invites.js';
import { settingsTabs, SETTINGS_TABS, INVITES_TAB } from '../../src/ui/settings.js';
import { formatShortDate } from '../../src/ui/format.js';

const base = {
  role: 'member', created_at: '2026-09-16T10:00:00.000Z', expires_at: '2026-09-23T10:00:00.000Z',
  used_at: null, used_by: null, revoked_at: null,
};

describe('toInviteRows', () => {
  it('labels each status and formats the dates', () => {
    const rows = toInviteRows([{ ...base, id: 3, status: 'valid' }]);
    assert.deepEqual(rows, [{
      id: 3, status: 'valid', statusLabel: 'Active',
      created: formatShortDate(base.created_at), expires: formatShortDate(base.expires_at),
      usedBy: null, usedOn: null, canRevoke: true,
    }]);
  });

  it('has a label for every status', () => {
    assert.deepEqual(Object.keys(INVITE_STATUS_LABELS).sort(), ['expired', 'revoked', 'used', 'valid']);
  });

  it('names who used an invite and offers no revoke', () => {
    const [row] = toInviteRows([{
      ...base, id: 4, status: 'used', used_at: '2026-09-17T08:00:00.000Z', used_by: { id: 9, name: 'Mia', email: 'mia@x.test' },
    }]);
    assert.equal(row.usedBy, 'Mia (mia@x.test)');
    assert.equal(row.usedOn, formatShortDate('2026-09-17T08:00:00.000Z'));
    assert.equal(row.canRevoke, false);
  });

  it('offers revoke for an expired invite, not for a revoked one', () => {
    const rows = toInviteRows([
      { ...base, id: 5, status: 'expired' },
      { ...base, id: 6, status: 'revoked', revoked_at: '2026-09-18T00:00:00.000Z' },
    ]);
    assert.deepEqual(rows.map(r => [r.id, r.statusLabel, r.canRevoke]), [[5, 'Expired', true], [6, 'Revoked', false]]);
  });

  it('keeps the order it is given', () => {
    const rows = toInviteRows([{ ...base, id: 2, status: 'valid' }, { ...base, id: 1, status: 'valid' }]);
    assert.deepEqual(rows.map(r => r.id), [2, 1]);
  });
});

describe('invitePageState', () => {
  it('is checking until the answer arrives', () => assert.equal(invitePageState(null), 'checking'));
  it('follows the answer', () => {
    assert.equal(invitePageState({ valid: true }), 'valid');
    assert.equal(invitePageState({ valid: false }), 'invalid');
  });
});

describe('INVITE_HELP_TEXT', () => {
  it('states the lifetime from the rule', () => assert.match(INVITE_HELP_TEXT, /7 days/));
});

describe('settingsTabs', () => {
  it('adds the invites tab only when asked', () => {
    assert.deepEqual(settingsTabs({ showInvites: false }), SETTINGS_TABS);
    assert.deepEqual(settingsTabs({ showInvites: true }), [...SETTINGS_TABS, INVITES_TAB]);
  });
});
