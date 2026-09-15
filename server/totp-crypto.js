// Connector: the crypto the second factor needs, with node:crypto. HOTP
// (RFC 4226, HMAC-SHA1, dynamic truncation), secret generation, backup code
// generation and hashing. Every rule (steps, window, replay, code shapes) is
// logic/totp.js and logic/backup-codes.js.

import crypto from 'node:crypto';
import { base32Encode, base32Decode, TOTP_DIGITS } from '../logic/totp.js';
import { BACKUP_CODE_ALPHABET, BACKUP_CODE_COUNT, BACKUP_CODE_LENGTH, formatBackupCode } from '../logic/backup-codes.js';

const SECRET_BYTES = 20;

// key: the secret bytes. counter: a non-negative integer. Returns the code as text.
export function hotp(key, counter, digits = TOTP_DIGITS) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', Buffer.from(key)).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

// secret: base32. Returns [{ step, code }] for logic/totp.js verifyTotp.
export function codesForSteps(secret, steps, digits = TOTP_DIGITS) {
  const key = base32Decode(secret);
  return steps.map(step => ({ step, code: hotp(key, step, digits) }));
}

export const generateSecret = () => base32Encode(crypto.randomBytes(SECRET_BYTES));

// 256 is a multiple of the 32-character alphabet, so byte & 31 is unbiased.
export function generateBackupCodes(count = BACKUP_CODE_COUNT) {
  const codes = new Set();
  while (codes.size < count) {
    const chars = [...crypto.randomBytes(BACKUP_CODE_LENGTH)].map(b => BACKUP_CODE_ALPHABET[b & 31]).join('');
    codes.add(formatBackupCode(chars));
  }
  return [...codes];
}

// code: the normalised form (logic/backup-codes.js normaliseBackupCode).
export const hashBackupCode = (code) => crypto.createHash('sha256').update(code).digest('hex');
