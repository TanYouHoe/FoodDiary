// Logic test: sign-in steps, token scopes and the owner recovery rules.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  signInStep, effectiveScope, scopeAllows, isTokenOfType, isCurrentTokenVersion, canDisableTotp,
  setupNeedsCurrentCode, TOKEN_SCOPES, TOKEN_TYPES, ENROLL_SCOPE_ROUTES, MFA_TOKEN_TTL_SECONDS,
} from '../logic/two-factor.js';
import { canListUsers, totpResetRefusal, NOT_ALLOWED, OWN_FACTOR_RESET } from '../logic/access.js';
import { shouldRequireTotp, checkServerConfig } from '../logic/config.js';

const owner = { id: 1, role: 'owner' };
const member = { id: 2, role: 'member' };

describe('sign-in step', () => {
  it('a factor always asks for a code', () => {
    assert.equal(signInStep({ totpEnabled: true, requireTotp: true }), 'mfa');
    assert.equal(signInStep({ totpEnabled: true, requireTotp: false }), 'mfa');
  });
  it('no factor: enroll when required, else a full session', () => {
    assert.equal(signInStep({ totpEnabled: false, requireTotp: true }), 'enroll');
    assert.equal(signInStep({ totpEnabled: false, requireTotp: false }), 'full');
  });
  it('the mfa step lasts five minutes', () => assert.equal(MFA_TOKEN_TTL_SECONDS, 300));
});

describe('token scope', () => {
  it('a full token for a user who still needs a factor acts as enroll', () => {
    assert.equal(effectiveScope({ tokenScope: 'full', totpEnabled: false, requireTotp: true }), TOKEN_SCOPES.enroll);
    assert.equal(effectiveScope({ tokenScope: 'full', totpEnabled: true, requireTotp: true }), TOKEN_SCOPES.full);
    assert.equal(effectiveScope({ tokenScope: 'full', totpEnabled: false, requireTotp: false }), TOKEN_SCOPES.full);
  });
  it('an enroll or unknown scope stays enroll', () => {
    assert.equal(effectiveScope({ tokenScope: 'enroll', totpEnabled: true, requireTotp: false }), TOKEN_SCOPES.enroll);
    assert.equal(effectiveScope({ tokenScope: undefined, totpEnabled: true, requireTotp: false }), TOKEN_SCOPES.enroll);
  });
  it('enroll reaches exactly four routes', () => {
    assert.deepEqual(ENROLL_SCOPE_ROUTES, [
      'GET /api/auth/me', 'POST /api/auth/totp/setup', 'POST /api/auth/totp/enable', 'POST /api/auth/logout-all',
    ]);
    for (const route of ENROLL_SCOPE_ROUTES) {
      const [method, path] = route.split(' ');
      assert.equal(scopeAllows('enroll', method, path), true);
    }
    assert.equal(scopeAllows('enroll', 'GET', '/api/restaurants'), false);
    assert.equal(scopeAllows('enroll', 'POST', '/api/auth/totp/backup-codes'), false);
    assert.equal(scopeAllows('enroll', 'POST', '/api/auth/me'), false);
    assert.equal(scopeAllows('full', 'GET', '/api/restaurants'), true);
  });
  it('a token type must match and carry an id and a version', () => {
    assert.equal(isTokenOfType({ typ: 'session', id: 1, tv: 0 }, TOKEN_TYPES.session), true);
    assert.equal(isTokenOfType({ typ: 'mfa', id: 1, tv: 0 }, TOKEN_TYPES.session), false);
    assert.equal(isTokenOfType({ typ: 'session', id: 1, tv: 0 }, TOKEN_TYPES.mfa), false);
    assert.equal(isTokenOfType({ id: 1 }, TOKEN_TYPES.session), false, 'a token from before versions');
    assert.equal(isTokenOfType(null, TOKEN_TYPES.session), false);
  });
  it('the version must equal the user version', () => {
    assert.equal(isCurrentTokenVersion({ tv: 3 }, 3), true);
    assert.equal(isCurrentTokenVersion({ tv: 2 }, 3), false);
  });
});

describe('factor changes', () => {
  it('disable only when the factor is not required', () => {
    assert.equal(canDisableTotp({ requireTotp: true }), false);
    assert.equal(canDisableTotp({ requireTotp: false }), true);
  });
  it('replacing an enabled factor needs a current code', () => {
    assert.equal(setupNeedsCurrentCode({ totpEnabled: true }), true);
    assert.equal(setupNeedsCurrentCode({ totpEnabled: false }), false);
  });
});

describe('owner recovery', () => {
  it('only the owner lists users', () => {
    assert.equal(canListUsers(owner), true);
    assert.equal(canListUsers(member), false);
  });
  it('only the owner resets, and never their own factor', () => {
    assert.equal(totpResetRefusal(owner, 2), null);
    assert.equal(totpResetRefusal(owner, 1), OWN_FACTOR_RESET);
    assert.equal(totpResetRefusal(member, 1), NOT_ALLOWED);
    assert.equal(totpResetRefusal(member, 2), NOT_ALLOWED);
  });
});

describe('REQUIRE_TOTP', () => {
  it('1 and 0 decide; unset follows production', () => {
    assert.equal(shouldRequireTotp({ requireTotp: '1', nodeEnv: 'development' }), true);
    assert.equal(shouldRequireTotp({ requireTotp: '0', nodeEnv: 'production' }), false);
    assert.equal(shouldRequireTotp({ requireTotp: undefined, nodeEnv: 'production' }), true);
    assert.equal(shouldRequireTotp({ requireTotp: undefined, nodeEnv: undefined }), false);
  });
  it('another value stops the server', () => {
    assert.deepEqual(checkServerConfig({ requireTotp: 'yes' }), ["REQUIRE_TOTP must be '1' or '0'."]);
    assert.deepEqual(checkServerConfig({ requireTotp: '1' }), []);
    assert.deepEqual(checkServerConfig({}), []);
  });
});
