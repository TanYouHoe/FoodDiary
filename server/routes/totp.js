// Connector: the signed-in user's authenticator app. Set up (or replace),
// cancel a setup, confirm, regenerate backup codes, and remove when the server
// allows it. The rules are logic/two-factor.js; the store is
// server/two-factor.js; every code checked here counts toward logic/lockout.js
// (server/factor-guard.js).

import { Router } from 'express';
import {
  needsFactorProof, shouldReusePendingSecret, canDisableTotp, factorProof,
  CODE_REQUIRED, NO_PENDING_SETUP, FACTOR_NOT_ENABLED, FACTOR_REQUIRED, BACKUP_CODE_USED_MEANWHILE,
} from '../../logic/two-factor.js';
import { badRequest, notAllowed } from '../guards.js';

// Mounted at /api/auth/totp. guard: server/factor-guard.js.
export function totpRoutes({ authenticate, twoFactor, guard, sessions, requireTotp }) {
  const r = Router();
  r.use(authenticate);

  // { secret, otpauth_url }. Replacing an enabled factor needs { code } (spent)
  // or { backup_code } (checked now, spent by enable). A first enrollment gets
  // the same pending secret again until it is confirmed or cancelled.
  r.post('/setup', async (req, res) => {
    const { totpEnabled } = req.auth;
    let backupHash = null;
    if (needsFactorProof({ totpEnabled })) {
      const proof = factorProof(req.body);
      let verified = null;
      const ok = await guard.underLockout(req, res, proof, (at) => (verified = twoFactor.verifyProof(req.user.id, proof, at)).ok);
      if (!ok) return;
      backupHash = verified.backupHash;
    }
    const reusePending = shouldReusePendingSecret({ totpEnabled, hasPending: twoFactor.state(req.user.id).hasPending });
    res.json(twoFactor.startSetup(req.user.id, req.user.email, { reusePending, backupHash }));
  });

  // Forgets the pending secret; an enabled factor stays as it is.
  r.post('/cancel', (req, res) => {
    twoFactor.cancelSetup(req.user.id);
    res.status(204).end();
  });

  // { code } from the pending secret → { backup_codes, token, user }. The codes
  // are shown only here; the old tokens stop working. 409 when the backup code
  // that authorised the setup was used meanwhile.
  r.post('/enable', async (req, res) => {
    const code = req.body?.code;
    if (!code) return badRequest(res, CODE_REQUIRED);
    if (!twoFactor.state(req.user.id).hasPending) return badRequest(res, NO_PENDING_SETUP);
    let result = null;
    // A right code counts as a success for the lockout, even when the backup code behind the setup is gone.
    const ok = await guard.underLockout(req, res, code, (at) => (result = twoFactor.enable(req.user.id, code, at)).reason !== 'code');
    if (!ok) return;
    if (!result.ok) return res.status(409).json({ error: BACKUP_CODE_USED_MEANWHILE });
    res.json({ backup_codes: result.backupCodes, ...sessions.full(req.user.id) });
  });

  // { code } or { backup_code } → { backup_codes }. The old backup codes stop working.
  r.post('/backup-codes', async (req, res) => {
    if (!req.auth.totpEnabled) return badRequest(res, FACTOR_NOT_ENABLED);
    if (!(await guard.requireCurrentFactor(req, res))) return;
    res.json({ backup_codes: twoFactor.regenerateBackupCodes(req.user.id) });
  });

  // { code } → { token, user }. The old tokens stop working.
  r.post('/disable', async (req, res) => {
    if (!canDisableTotp({ requireTotp })) return notAllowed(res, FACTOR_REQUIRED);
    if (!req.auth.totpEnabled) return badRequest(res, FACTOR_NOT_ENABLED);
    const code = req.body?.code;
    if (!(await guard.underLockout(req, res, code, (at) => twoFactor.useTotp(req.user.id, code, at)))) return;
    twoFactor.clear(req.user.id);
    res.json(sessions.full(req.user.id));
  });

  return r;
}
