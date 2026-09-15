// Connector: second-factor checks for routes of a signed-in user, under the
// lockout (logic/lockout.js codeKeys). Answers 400 (nothing given), 401 (wrong)
// or 429 (locked). The rule for what counts as proof is logic/two-factor.js.

import { factorProof, CODE_REQUIRED, INVALID_CODE } from '../logic/two-factor.js';
import { codeKeys } from '../logic/lockout.js';
import { tooManyAttempts } from './lockout-store.js';
import { badRequest } from './guards.js';

// now: () => Date.
export function makeFactorGuard({ lockout, twoFactor, now }) {
  // given: the value that must be present. check: (at: Date) => boolean; it
  // must not throw on user input. Answers and returns false, or returns true.
  const underLockout = async (req, res, given, check) => {
    if (!given) { badRequest(res, CODE_REQUIRED); return false; }
    const at = now();
    const outcome = await lockout.attempt(codeKeys(req.user.id, req.ip), at, () => check(at));
    if (outcome === 'locked') tooManyAttempts(res);
    else if (outcome === 'failed') res.status(401).json({ error: INVALID_CODE });
    return outcome === 'ok';
  };

  return {
    underLockout,

    // { code } or { backup_code } of the signed-in user's enabled factor; either is spent.
    requireCurrentFactor(req, res) {
      const proof = factorProof(req.body);
      return underLockout(req, res, proof, (at) => twoFactor.useProof(req.user.id, proof, at));
    },
  };
}
