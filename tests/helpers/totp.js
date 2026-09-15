// Test helper: the authenticator app. Computes a code from a secret at the
// test's injected clock, with server/totp-crypto.js.

import { codesForSteps } from '../../server/totp-crypto.js';
import { timeStep } from '../../logic/totp.js';

// now: a Date. offset: steps before (-) or after (+) the current step.
export function totpCode(secret, now, offset = 0) {
  return codesForSteps(secret, [timeStep(now.getTime()) + offset])[0].code;
}

// A six-digit code that matches none of the steps within `spread` of now.
export function wrongCode(secret, now, spread = 2) {
  const taken = new Set();
  for (let d = -spread; d <= spread; d++) taken.add(totpCode(secret, now, d));
  for (let n = 0; ; n++) {
    const code = String(n).padStart(6, '0');
    if (!taken.has(code)) return code;
  }
}
