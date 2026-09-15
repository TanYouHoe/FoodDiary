import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  needsEnrollment, enrollStage, toSecurityState, toUserRows, backupCodesText, currentCodePrompt, resetCodePrompt, SECURITY_MODES,
} from '../../src/ui/two-factor.js';
import { settingsTabs, SECURITY_TAB, INVITES_TAB } from '../../src/ui/settings.js';
import { totpResetRefusal } from '../../logic/access.js';

describe('needsEnrollment', () => {
  it('only a signed-in user without a factor, when the server requires one or refused a route', () => {
    assert.equal(needsEnrollment({ user: null, enrollRequired: true }), false);
    assert.equal(needsEnrollment({ user: { totp_enabled: false, totp_required: true }, enrollRequired: false }), true);
    assert.equal(needsEnrollment({ user: { totp_enabled: false, totp_required: false }, enrollRequired: true }), true);
    assert.equal(needsEnrollment({ user: { totp_enabled: false, totp_required: false }, enrollRequired: false }), false);
    assert.equal(needsEnrollment({ user: { totp_enabled: true, totp_required: true }, enrollRequired: true }), false);
  });
  it('stays while held for the backup codes, even with the new factor on', () => {
    assert.equal(needsEnrollment({ user: { totp_enabled: true, totp_required: true }, enrollRequired: false, held: true }), true);
    assert.equal(needsEnrollment({ user: null, enrollRequired: false, held: true }), false);
  });
});

describe('enrollStage', () => {
  it('codes, then scan, then error, else loading', () => {
    assert.equal(enrollStage({ setup: null, backupCodes: null, error: '' }), 'loading');
    assert.equal(enrollStage({ setup: null, backupCodes: null, error: 'x' }), 'error');
    assert.equal(enrollStage({ setup: { secret: 'A' }, backupCodes: null, error: 'wrong code' }), 'scan');
    assert.equal(enrollStage({ setup: null, backupCodes: ['a'], error: '' }), 'codes');
  });
});

describe('toSecurityState', () => {
  it('describes an enabled factor and offers replace and new backup codes', () => {
    const state = toSecurityState({ totp_enabled: true, totp_required: true });
    assert.equal(state.replaceLabel, 'Replace authenticator');
    assert.equal(state.canRegenerate, true);
    assert.match(state.status, /^On/);
  });
  it('describes a missing factor and offers set up only', () => {
    const state = toSecurityState({ totp_enabled: false, totp_required: false });
    assert.equal(state.replaceLabel, 'Set up authenticator');
    assert.equal(state.canRegenerate, false);
    assert.match(state.status, /^Off/);
  });
});

describe('toUserRows', () => {
  const owner = { id: 1, role: 'owner' };
  const users = [
    { id: 1, name: 'Olive', email: 'o@x.test', role: 'owner', totp_enabled: true, created_at: '2026-09-16' },
    { id: 2, name: 'Mia', email: 'm@x.test', role: 'member', totp_enabled: false, created_at: '2026-09-16' },
  ];
  it('labels the factor and offers reset exactly when the logic rule allows it', () => {
    const rows = toUserRows(users, owner);
    assert.deepEqual(rows, [
      { id: 1, name: 'Olive', email: 'o@x.test', twoFactor: 'On', canReset: false },
      { id: 2, name: 'Mia', email: 'm@x.test', twoFactor: 'Off', canReset: true },
    ]);
    assert.deepEqual(rows.map(r => r.canReset), users.map(u => totpResetRefusal(owner, u.id) === null));
  });
});

describe('backup codes and prompts', () => {
  it('puts one code on each line', () => assert.equal(backupCodesText(['aaaa-bbbb', 'cccc-dddd']), 'aaaa-bbbb\ncccc-dddd'));
  it('asks for a current code for each purpose', () => {
    assert.match(currentCodePrompt(SECURITY_MODES.replaceCode), /replace/);
    assert.match(currentCodePrompt(SECURITY_MODES.regenerateCode), /backup codes/);
    assert.equal(currentCodePrompt(SECURITY_MODES.idle), null);
  });
  it('says when a backup code is used up: at confirm for a replace', () => {
    assert.match(currentCodePrompt(SECURITY_MODES.replaceCode, true), /used up when you confirm/);
    assert.match(resetCodePrompt(false), /own current code/);
    assert.match(resetCodePrompt(true), /own backup codes/);
  });
  it('asks for a backup code instead when the user switches', () => {
    assert.match(currentCodePrompt(SECURITY_MODES.replaceCode, true), /backup code.*replace/);
    assert.match(currentCodePrompt(SECURITY_MODES.regenerateCode, true), /^Enter one of your backup codes/);
    assert.match(currentCodePrompt(SECURITY_MODES.replaceCode, false), /authenticator app/);
  });
});

describe('settingsTabs security', () => {
  it('shows Security to everyone, Invites to the owner only', () => {
    assert.ok(settingsTabs({ showInvites: false }).includes(SECURITY_TAB));
    assert.ok(!settingsTabs({ showInvites: false }).includes(INVITES_TAB));
  });
});
