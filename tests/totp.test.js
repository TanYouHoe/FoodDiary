// Logic and connector tests: TOTP rules (logic/totp.js), backup code format
// (logic/backup-codes.js) and HOTP with node:crypto (server/totp-crypto.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Encode, base32Decode, timeStep, candidateSteps, normaliseCode, matchStep, verifyTotp,
  isReplay, otpauthUri, groupSecret, TOTP_PERIOD_SECONDS, TOTP_DIGITS,
} from '../logic/totp.js';
import { normaliseBackupCode, formatBackupCode, BACKUP_CODE_ALPHABET, BACKUP_CODE_COUNT, BACKUP_CODE_LENGTH } from '../logic/backup-codes.js';
import { createHash } from 'node:crypto';
import { hotp, codesForSteps, generateSecret, generateBackupCodes, hashBackupCode, backupCodePepper } from '../server/totp-crypto.js';

const RFC_SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'));

describe('base32', () => {
  it('encodes RFC 4648 vectors without padding', () => {
    const enc = (s) => base32Encode(new TextEncoder().encode(s));
    assert.equal(enc(''), '');
    assert.equal(enc('f'), 'MY');
    assert.equal(enc('fo'), 'MZXQ');
    assert.equal(enc('foo'), 'MZXW6');
    assert.equal(enc('foob'), 'MZXW6YQ');
    assert.equal(enc('fooba'), 'MZXW6YTB');
    assert.equal(enc('foobar'), 'MZXW6YTBOI');
  });

  it('round-trips bytes and tolerates spaces, lowercase and padding', () => {
    const bytes = Uint8Array.from({ length: 20 }, (_, i) => (i * 37 + 11) % 256);
    const text = base32Encode(bytes);
    assert.deepEqual([...base32Decode(text)], [...bytes]);
    assert.deepEqual([...base32Decode(groupSecret(text).toLowerCase())], [...bytes]);
    assert.deepEqual([...base32Decode('MZXW6YQ=')], [...new TextEncoder().encode('foob')]);
  });

  it('throws on a character outside the alphabet', () => {
    assert.throws(() => base32Decode('MZXW1'), /base32/);
    assert.throws(() => base32Decode('MZ!W6'), /base32/);
  });
});

describe('time steps', () => {
  it('is floor(seconds / 30)', () => {
    assert.equal(TOTP_PERIOD_SECONDS, 30);
    assert.equal(timeStep(59_000), 1);
    assert.equal(timeStep(60_000), 2);
    assert.equal(timeStep(0), 0);
  });

  it('candidates are the step and its neighbours, never negative', () => {
    assert.deepEqual(candidateSteps(10), [9, 10, 11]);
    assert.deepEqual(candidateSteps(0), [0, 1]);
  });
});

describe('RFC 6238 SHA-1 vectors (8 digits)', () => {
  const vectors = [
    [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
    [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130'],
  ];
  for (const [seconds, expected] of vectors) {
    it(`T=${seconds}`, () => {
      const key = base32Decode(RFC_SECRET);
      assert.equal(hotp(key, timeStep(seconds * 1000), 8), expected);
    });
  }
});

describe('verifyTotp', () => {
  const now = 1_800_000_000_000;
  const step = timeStep(now);
  const secret = generateSecret();
  const codeAt = (s) => hotp(base32Decode(secret), s, TOTP_DIGITS);
  const verify = (code, lastStep = null) =>
    verifyTotp({ code, candidates: codesForSteps(secret, candidateSteps(step)), lastStep });

  it('accepts the current step and one step either side', () => {
    assert.deepEqual(verify(codeAt(step)), { ok: true, step });
    assert.deepEqual(verify(codeAt(step - 1)), { ok: true, step: step - 1 });
    assert.deepEqual(verify(codeAt(step + 1)), { ok: true, step: step + 1 });
  });

  it('refuses two steps away', () => {
    for (const s of [step - 2, step + 2]) {
      const code = codeAt(s);
      // A code for a far step can equal a near code by chance; skip that case.
      if ([step - 1, step, step + 1].some(n => codeAt(n) === code)) continue;
      assert.deepEqual(verify(code), { ok: false, reason: 'mismatch' });
    }
  });

  it('refuses a step at or below the last used step', () => {
    assert.deepEqual(verify(codeAt(step), step), { ok: false, reason: 'replay' });
    assert.deepEqual(verify(codeAt(step - 1), step), { ok: false, reason: 'replay' });
    assert.deepEqual(verify(codeAt(step + 1), step), { ok: true, step: step + 1 });
    assert.equal(isReplay(5, null), false);
    assert.equal(isReplay(5, 5), true);
    assert.equal(isReplay(6, 5), false);
  });

  it('refuses a badly formed code before comparing', () => {
    for (const code of ['12345', '1234567', 'abcdef', '', null, undefined, 123456]) {
      assert.deepEqual(verify(code), { ok: false, reason: 'format' }, String(code));
    }
  });

  it('normalises spaces in a code', () => {
    assert.equal(normaliseCode(' 123 456 '), '123456');
    assert.equal(normaliseCode('12a456'), null);
  });

  it('matchStep checks every candidate and returns the matching step', () => {
    assert.equal(matchStep('000001', [{ step: 1, code: '000000' }, { step: 2, code: '000001' }]), 2);
    assert.equal(matchStep('000009', [{ step: 1, code: '000000' }]), null);
    assert.equal(matchStep('00000', [{ step: 1, code: '000000' }]), null);
  });
});

describe('enrollment helpers', () => {
  it('builds the otpauth URI', () => {
    assert.equal(
      otpauthUri({ secret: 'JBSW Y3DP', issuer: 'Food Diary', account: 'amy+x@test.com' }),
      'otpauth://totp/Food%20Diary:amy%2Bx%40test.com?secret=JBSWY3DP&issuer=Food%20Diary&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('groups the secret in blocks of four', () => {
    assert.equal(groupSecret('ABCDEFGHIJ'), 'ABCD EFGH IJ');
    assert.equal(groupSecret('ABCD'), 'ABCD');
  });

  it('generates a 20-byte base32 secret', () => {
    const secret = generateSecret();
    assert.match(secret, /^[A-Z2-7]{32}$/);
    assert.equal(base32Decode(secret).length, 20);
    assert.notEqual(generateSecret(), secret);
  });
});

describe('backup codes', () => {
  it('has at least 40 bits per code', () => {
    assert.ok(BACKUP_CODE_LENGTH * Math.log2(BACKUP_CODE_ALPHABET.length) >= 40);
    assert.equal(new Set(BACKUP_CODE_ALPHABET).size, BACKUP_CODE_ALPHABET.length);
  });

  it('generates ten distinct codes in the xxxx-xxxx format', () => {
    const codes = generateBackupCodes();
    assert.equal(codes.length, BACKUP_CODE_COUNT);
    assert.equal(new Set(codes).size, codes.length);
    for (const code of codes) {
      assert.match(code, /^[a-z0-9]{4}-[a-z0-9]{4}$/);
      assert.equal(normaliseBackupCode(code), code);
    }
  });

  it('normalises case, spaces and a missing hyphen; refuses other input', () => {
    const code = formatBackupCode(BACKUP_CODE_ALPHABET.slice(0, 8));
    assert.equal(normaliseBackupCode(` ${code.toUpperCase().replace('-', ' ')} `), code);
    assert.equal(normaliseBackupCode(code.replace('-', '')), code);
    assert.equal(normaliseBackupCode('abc'), null);
    assert.equal(normaliseBackupCode(123), null);
    assert.equal(normaliseBackupCode('!!!!-!!!!'), null);
  });

  it('hashes with HMAC-SHA256 under a pepper from the JWT secret, never plain SHA-256', () => {
    const pepper = backupCodePepper('jwt-secret-a');
    assert.match(hashBackupCode('abcd-efgh', pepper), /^[0-9a-f]{64}$/);
    assert.equal(hashBackupCode('abcd-efgh', pepper), hashBackupCode('abcd-efgh', backupCodePepper('jwt-secret-a')));
    assert.notEqual(hashBackupCode('abcd-efgh', pepper), hashBackupCode('abcd-efgj', pepper));
    assert.notEqual(hashBackupCode('abcd-efgh', pepper), createHash('sha256').update('abcd-efgh').digest('hex'));
    assert.notEqual(hashBackupCode('abcd-efgh', pepper), hashBackupCode('abcd-efgh', backupCodePepper('jwt-secret-b')));
    assert.throws(() => backupCodePepper(''), /secret/);
  });
});
