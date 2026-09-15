// Connector: the signed-in user's authenticator app. Set up (or replace),
// confirm, regenerate backup codes, and remove when the server allows it.
// The rules are logic/two-factor.js; the store is server/two-factor.js; every
// code checked here counts toward logic/lockout.js.

import { Router } from 'express';
import {
  setupNeedsCurrentCode, canDisableTotp,
  CODE_REQUIRED, INVALID_CODE, NO_PENDING_SETUP, FACTOR_NOT_ENABLED, FACTOR_REQUIRED,
} from '../../logic/two-factor.js';
import { codeKeys } from '../../logic/lockout.js';
import { tooManyAttempts } from '../lockout-store.js';
import { badRequest, notAllowed } from '../guards.js';

// Mounted at /api/auth/totp. now: () => Date.
export function totpRoutes({ authenticate, twoFactor, lockout, sessions, requireTotp, now }) {
  const r = Router();
  r.use(authenticate);

  // Runs check(code, at) under the lockout. Answers 400, 401 or 429 and
  // returns false, or returns true.
  const withCode = async (req, res, check) => {
    const code = req.body?.code;
    if (!code) { badRequest(res, CODE_REQUIRED); return false; }
    const at = now();
    const outcome = await lockout.attempt(codeKeys(req.user.id, req.ip), at, () => check(code, at));
    if (outcome === 'locked') tooManyAttempts(res);
    else if (outcome === 'failed') res.status(401).json({ error: INVALID_CODE });
    return outcome === 'ok';
  };
  const currentCode = (req, res) => withCode(req, res, (code, at) => twoFactor.useTotp(req.user.id, code, at));

  // { secret, otpauth_url }. Replacing an enabled factor needs { code } from it.
  r.post('/setup', async (req, res) => {
    if (setupNeedsCurrentCode({ totpEnabled: req.auth.totpEnabled }) && !(await currentCode(req, res))) return;
    res.json(twoFactor.startSetup(req.user.id, req.user.email));
  });

  // { code } from the pending secret → { backup_codes, token, user }. The codes
  // are shown only here; the old tokens stop working.
  r.post('/enable', async (req, res) => {
    if (!req.body?.code) return badRequest(res, CODE_REQUIRED);
    if (!twoFactor.state(req.user.id).hasPending) return badRequest(res, NO_PENDING_SETUP);
    let backupCodes = null;
    const ok = await withCode(req, res, (code, at) => (backupCodes = twoFactor.enable(req.user.id, code, at)) !== null);
    if (ok) res.json({ backup_codes: backupCodes, ...sessions.full(req.user.id) });
  });

  // { code } → { backup_codes }. The old backup codes stop working.
  r.post('/backup-codes', async (req, res) => {
    if (!req.auth.totpEnabled) return badRequest(res, FACTOR_NOT_ENABLED);
    if (!(await currentCode(req, res))) return;
    res.json({ backup_codes: twoFactor.regenerateBackupCodes(req.user.id) });
  });

  // { code } → { token, user }. The old tokens stop working.
  r.post('/disable', async (req, res) => {
    if (!canDisableTotp({ requireTotp })) return notAllowed(res, FACTOR_REQUIRED);
    if (!req.auth.totpEnabled) return badRequest(res, FACTOR_NOT_ENABLED);
    if (!(await currentCode(req, res))) return;
    twoFactor.clear(req.user.id);
    res.json(sessions.full(req.user.id));
  });

  return r;
}
