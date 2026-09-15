// Logic: backup codes for the second factor. Ten single-use codes shaped
// xxxx-xxxx from a 32-character alphabet (Crockford base32, lowercase: no i, l,
// o or u), so each code carries 40 bits. The connector makes them with a random
// source and stores only a hash.

export const BACKUP_CODE_COUNT = 10;
export const BACKUP_CODE_LENGTH = 8;
export const BACKUP_CODE_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

// chars: BACKUP_CODE_LENGTH characters from the alphabet. Returns 'xxxx-xxxx'.
export function formatBackupCode(chars) {
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// The stored form of a typed code (any case, spaces, with or without the
// hyphen), or null when it cannot be a backup code.
export function normaliseBackupCode(input) {
  if (typeof input !== 'string') return null;
  const chars = input.toLowerCase().replace(/[\s-]/g, '');
  if (chars.length !== BACKUP_CODE_LENGTH) return null;
  for (const ch of chars) if (!BACKUP_CODE_ALPHABET.includes(ch)) return null;
  return formatBackupCode(chars);
}
