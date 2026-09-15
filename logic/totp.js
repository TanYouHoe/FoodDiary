// Logic: time-based one-time passwords (RFC 6238). Base32 secrets, time steps,
// the drift window, the code format, matching a submitted code against codes
// the caller computed, replay refusal and the enrollment URI. The HMAC lives in
// server/totp-crypto.js, so this file needs no crypto and no clock.
//
// Comparison choice: matchStep compares equal-length digit strings by
// accumulating character differences with no early exit, and checks every
// candidate step. That is pure, so the whole accept rule has one home. It is
// not a hardware constant-time guarantee, and it does not need to be: a code
// lives 30 seconds, the lockout stops a caller after 8 wrong codes, and the
// codes compared change every step, so timing reveals nothing reusable.

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;
export const TOTP_ISSUER = 'Food Diary';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// bytes: a Uint8Array or an array of byte values. RFC 4648, no padding.
export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

// Tolerates the spaces, hyphens, lowercase and padding people type. Throws on
// any other character, so a mistyped secret fails at once.
export function base32Decode(text) {
  const clean = String(text ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const index = B32.indexOf(ch);
    if (index < 0) throw new Error(`invalid base32 character: ${ch}`);
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

// nowMs: milliseconds since the epoch.
export function timeStep(nowMs, period = TOTP_PERIOD_SECONDS) {
  return Math.floor(nowMs / 1000 / period);
}

// The steps a code may belong to: the current one and `window` either side.
export function candidateSteps(step, window = TOTP_WINDOW) {
  const steps = [];
  for (let s = step - window; s <= step + window; s++) if (s >= 0) steps.push(s);
  return steps;
}

// A submitted code without spaces, or null when it is not `digits` digits.
export function normaliseCode(code, digits = TOTP_DIGITS) {
  if (typeof code !== 'string') return null;
  const clean = code.replace(/\s/g, '');
  return new RegExp(`^\\d{${digits}}$`).test(clean) ? clean : null;
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// candidates: [{ step, code }]. Returns the step whose code equals `code`, or
// null. Every candidate is compared.
export function matchStep(code, candidates) {
  let matched = null;
  for (const candidate of candidates) {
    if (sameText(candidate.code, code) && matched === null) matched = candidate.step;
  }
  return matched;
}

// A step at or below the last accepted step was already spent.
export function isReplay(step, lastStep) {
  return lastStep !== null && lastStep !== undefined && step <= lastStep;
}

// code: the submitted value. candidates: [{ step, code }] for candidateSteps.
// lastStep: the last accepted step for this secret, or null.
// Returns { ok: true, step } or { ok: false, reason: 'format' | 'mismatch' | 'replay' }.
export function verifyTotp({ code, candidates, lastStep }) {
  const clean = normaliseCode(code);
  if (clean === null) return { ok: false, reason: 'format' };
  const step = matchStep(clean, candidates);
  if (step === null) return { ok: false, reason: 'mismatch' };
  if (isReplay(step, lastStep)) return { ok: false, reason: 'replay' };
  return { ok: true, step };
}

// The URI an authenticator app imports, as text or as a QR code.
export function otpauthUri({ secret, issuer = TOTP_ISSUER, account }) {
  const clean = String(secret).replace(/\s/g, '');
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${clean}&issuer=${encodeURIComponent(issuer)}`
    + `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}

// The secret in blocks of four, easier to type into a phone.
export function groupSecret(secret) {
  return String(secret).replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}
