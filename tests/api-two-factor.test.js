// Integration test: the second factor over real HTTP. Two apps share one
// in-memory database: one requires TOTP, one does not. The clock is injected,
// and codes come from tests/helpers/totp.js. The tests share users and run in order.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callApi } from './helpers/http.js';
import { inviteCode } from './helpers/invites.js';
import { totpCode, wrongCode } from './helpers/totp.js';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { ENROLL_SCOPE_ROUTES } from '../logic/two-factor.js';

const KL = 'Asia/Kuala_Lumpur';
const ENROLL = { status: 403, body: { error: 'Two-factor setup required', code: 'MFA_ENROLL_REQUIRED' } };
const EXPIRED = { status: 401, body: { error: 'Session expired' } };
const INVALID_CODE = { status: 401, body: { error: 'Invalid code' } };
const MFA_STEP_EXPIRED = { status: 401, body: { error: 'Sign-in step expired. Sign in again.' } };
const BACKUP_USED_MEANWHILE = { status: 409, body: { error: 'The backup code that started this setup is already used. Start the setup again.' } };
const CODE_REQUIRED = { status: 400, body: { error: 'Code required' } };
const LOCKED = { status: 429, body: { error: 'Too many attempts. Try again later.' } };

describe('API two-factor', () => {
  let db;
  let dir;
  const servers = [];
  let clock = new Date('2026-09-16T10:00:00.000Z');
  const google = { payload: null };
  let required; // API base of the app that requires TOTP
  let optional; // API base of the app that does not

  // Every code use moves the clock one step, so codes are never replays by accident.
  const tick = (seconds = 30) => { clock = new Date(clock.getTime() + seconds * 1000); };
  const call = (method, path, options = {}) => callApi(`${options.at ?? required}${path}`, method, options);
  const code = (secret, offset = 0) => totpCode(secret, clock, offset);
  const listen = async (requireTotp) => {
    const { app } = createApp({
      db, uploadsDir: dir, jwtSecret: 'test-secret', defaultTimeZone: KL, now: () => clock,
      verifyGoogle: async () => google.payload, requireTotp,
    });
    const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
    servers.push(server);
    return `http://127.0.0.1:${server.address().port}/api`;
  };
  const register = (name, { role = 'member', at } = {}) => call('POST', '/auth/register', {
    at, body: { name, email: `${name}@tf.test`, password: 'pw', invite_code: inviteCode(db, { role, now: clock }) },
  });
  const login = (name, at) => call('POST', '/auth/login', { at, body: { email: `${name}@tf.test`, password: 'pw' } });
  const mfa = (mfa_token, body, at) => call('POST', '/auth/mfa', { at, body: { mfa_token, ...body } });
  // Sets up and enables a factor. Returns { secret, token, backupCodes }.
  const enroll = async (token, at) => {
    const setup = await call('POST', '/auth/totp/setup', { at, token });
    assert.equal(setup.status, 200);
    tick();
    const enabled = await call('POST', '/auth/totp/enable', { at, token, body: { code: code(setup.body.secret) } });
    assert.equal(enabled.status, 200);
    return { secret: setup.body.secret, token: enabled.body.token, backupCodes: enabled.body.backup_codes };
  };
  // Password, then a code. Returns the session token.
  const signIn = async (name, secret, at) => {
    tick();
    const first = await login(name, at);
    assert.equal(first.body.mfa_required, true);
    const second = await mfa(first.body.mfa_token, { code: code(secret) }, at);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    return second.body.token;
  };

  let olive; // owner: { id, secret, token, backupCodes }
  let mia;   // member

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'fooddiary-tf-'));
    db = openDatabase(':memory:', { defaultTimeZone: KL });
    required = await listen(true);
    optional = await listen(false);
  });

  after(async () => {
    for (const server of servers) await new Promise(resolve => server.close(resolve));
    if (db) db.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('createApp needs requireTotp as a boolean', () => {
    assert.throws(() => createApp({ db, uploadsDir: dir, jwtSecret: 'x', defaultTimeZone: KL }), /requireTotp/);
    assert.throws(() => createApp({ db, uploadsDir: dir, jwtSecret: 'x', defaultTimeZone: KL, requireTotp: '1' }), /requireTotp/);
  });

  it('required: registration gives an enroll-scope session; /me reports the factor state', async () => {
    const r = await register('olive', { role: 'owner' });
    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.body).sort(), ['token', 'user']);
    assert.equal(r.body.user.totp_enabled, false);
    assert.equal(r.body.user.totp_required, true);
    olive = { id: r.body.user.id, token: r.body.token };
    const me = await call('GET', '/auth/me', { token: olive.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.totp_enabled, false);
    assert.equal(me.body.totp_required, true);
  });

  it('an enroll-scope session reaches only me, setup, enable and logout-all', async () => {
    for (const [method, path] of [
      ['GET', '/restaurants'], ['GET', '/invites'], ['GET', '/users'], ['GET', '/profile'],
      ['POST', '/auth/totp/backup-codes'], ['POST', '/auth/totp/disable'], ['POST', '/users/1/totp/reset'],
    ]) {
      const body = method === 'GET' ? undefined : {};
      assert.deepEqual(await call(method, path, { token: olive.token, body }), ENROLL, `${method} ${path}`);
    }
    assert.equal((await call('GET', '/auth/me', { token: olive.token })).status, 200);
  });

  it('first enrollment: setup again keeps the scanned secret; cancel clears it', async () => {
    const reg = await register('sam');
    const token = reg.body.token;
    const first = await call('POST', '/auth/totp/setup', { token });
    const again = await call('POST', '/auth/totp/setup', { token });
    assert.equal(again.status, 200);
    assert.equal(again.body.secret, first.body.secret, 'a refresh keeps the QR code valid');
    assert.equal((await call('POST', '/auth/totp/cancel', { token })).status, 204);
    assert.equal(db.prepare('SELECT totp_pending_secret FROM users WHERE id = ?').get(reg.body.user.id).totp_pending_secret, null);
    const third = await call('POST', '/auth/totp/setup', { token });
    assert.notEqual(third.body.secret, first.body.secret);

    tick(29 * 60);
    assert.equal((await call('POST', '/auth/totp/setup', { token })).body.secret, third.body.secret, 'younger than 30 minutes: kept');
    tick(2 * 60);
    const fourth = await call('POST', '/auth/totp/setup', { token });
    assert.notEqual(fourth.body.secret, third.body.secret, '30 minutes or older: a new secret');

    assert.equal((await call('POST', '/auth/logout-all', { token })).status, 204);
    assert.equal(db.prepare('SELECT totp_pending_secret FROM users WHERE id = ?').get(reg.body.user.id).totp_pending_secret, null,
      'sign out everywhere forgets the pending secret');
  });

  it('two enables with the same code at once: exactly one succeeds', async () => {
    const reg = await register('pat');
    const setup = await call('POST', '/auth/totp/setup', { token: reg.body.token });
    tick();
    const body = { code: code(setup.body.secret) };
    const results = await Promise.all([
      call('POST', '/auth/totp/enable', { token: reg.body.token, body }),
      call('POST', '/auth/totp/enable', { token: reg.body.token, body }),
    ]);
    assert.equal(results.filter(r => r.status === 200).length, 1, JSON.stringify(results.map(r => r.status)));
  });

  it('every enroll-scope route is mounted and reachable with an enroll session', async () => {
    const reg = await register('sid');
    const routes = [...ENROLL_SCOPE_ROUTES].sort((a, b) => a.endsWith('logout-all') - b.endsWith('logout-all'));
    for (const route of routes) {
      const [method, path] = route.split(' ');
      const r = await call(method, path.replace(/^\/api/, ''), { token: reg.body.token, body: method === 'GET' ? undefined : {} });
      assert.notEqual(r.status, 404, route);
      assert.notEqual(r.body?.code, 'MFA_ENROLL_REQUIRED', route);
      assert.ok(r.status < 500, route);
    }
  });

  it('enable: a wrong code is refused; the right one returns 10 backup codes and a full session', async () => {
    const setup = await call('POST', '/auth/totp/setup', { token: olive.token });
    assert.equal(setup.status, 200);
    assert.deepEqual(Object.keys(setup.body).sort(), ['otpauth_url', 'secret']);
    assert.match(setup.body.secret, /^[A-Z2-7]{32}$/);
    assert.equal(setup.body.otpauth_url,
      `otpauth://totp/Food%20Diary:olive%40tf.test?secret=${setup.body.secret}&issuer=Food%20Diary&algorithm=SHA1&digits=6&period=30`);
    const secret = setup.body.secret;
    assert.equal(db.prepare('SELECT totp_pending_secret FROM users WHERE id = ?').get(olive.id).totp_pending_secret, secret);

    tick();
    assert.deepEqual(await call('POST', '/auth/totp/enable', { token: olive.token, body: { code: wrongCode(secret, clock) } }), INVALID_CODE);
    assert.deepEqual(await call('POST', '/auth/totp/enable', { token: olive.token, body: {} }), { status: 400, body: { error: 'Code required' } });
    const enabled = await call('POST', '/auth/totp/enable', { token: olive.token, body: { code: code(secret) } });
    assert.equal(enabled.status, 200);
    assert.deepEqual(Object.keys(enabled.body).sort(), ['backup_codes', 'token', 'user']);
    assert.equal(enabled.body.backup_codes.length, 10);
    assert.equal(enabled.body.user.totp_enabled, true);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM backup_codes WHERE user_id = ?').get(olive.id).c, 10);
    const stored = JSON.stringify(db.prepare('SELECT * FROM backup_codes').all());
    assert.ok(!enabled.body.backup_codes.some(c => stored.includes(c)), 'codes are stored hashed');
    const plainHashes = enabled.body.backup_codes.map(c => createHash('sha256').update(c).digest('hex'));
    assert.ok(!plainHashes.some(h => stored.includes(h)), 'not as plain SHA-256');

    assert.equal((await call('GET', '/restaurants', { token: enabled.body.token })).status, 200);
    assert.deepEqual(await call('GET', '/auth/me', { token: olive.token }), EXPIRED, 'the enroll token is revoked');
    olive = { ...olive, secret, token: enabled.body.token, backupCodes: enabled.body.backup_codes };
  });

  it('/me and user objects never carry a secret or a hash', async () => {
    const me = await call('GET', '/auth/me', { token: olive.token });
    assert.equal(me.body.totp_enabled, true);
    const text = JSON.stringify(me.body);
    for (const word of ['secret', 'hash', 'step', 'token_version', olive.secret]) assert.ok(!text.includes(word), word);
  });

  it('login with a factor asks for a code; the code gives a session', async () => {
    tick();
    const first = await login('olive');
    assert.equal(first.status, 200);
    assert.deepEqual(Object.keys(first.body).sort(), ['mfa_required', 'mfa_token']);
    assert.equal(first.body.mfa_required, true);
    assert.deepEqual(await call('GET', '/auth/me', { token: first.body.mfa_token }), { status: 401, body: { error: 'Invalid token' } },
      'an mfa token is not a session');
    const second = await mfa(first.body.mfa_token, { code: code(olive.secret) });
    assert.equal(second.status, 200);
    assert.deepEqual(Object.keys(second.body).sort(), ['token', 'user']);
    assert.equal((await call('GET', '/restaurants', { token: second.body.token })).status, 200);

    const again = await login('olive');
    assert.deepEqual(await mfa(again.body.mfa_token, { code: code(olive.secret) }), INVALID_CODE, 'a code is single use');

    tick();
    assert.deepEqual(await mfa(first.body.mfa_token, { code: code(olive.secret) }), MFA_STEP_EXPIRED, 'an mfa token works once');
    assert.equal((await mfa(again.body.mfa_token, { code: code(olive.secret) })).status, 200, 'a failed try does not spend the token');
  });

  it('the same valid code sent twice at once gives exactly one session', async () => {
    tick();
    const [a, b] = await Promise.all([login('olive'), login('olive')]);
    const same = code(olive.secret);
    const results = await Promise.all([mfa(a.body.mfa_token, { code: same }), mfa(b.body.mfa_token, { code: same })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
  });

  it('the drift window: one step either side works, two steps does not', async () => {
    tick(120);
    const first = await login('olive');
    assert.deepEqual(await mfa(first.body.mfa_token, { code: code(olive.secret, 2) }), INVALID_CODE);
    assert.deepEqual(await mfa(first.body.mfa_token, { code: code(olive.secret, -2) }), INVALID_CODE);
    assert.equal((await mfa(first.body.mfa_token, { code: code(olive.secret, -1) })).status, 200);
    const second = await login('olive');
    assert.equal((await mfa(second.body.mfa_token, { code: code(olive.secret, 1) })).status, 200);
  });

  it('a backup code works once, in any case and spacing', async () => {
    tick();
    const first = await login('olive');
    const backup = olive.backupCodes[0];
    const typed = ` ${backup.toUpperCase().replace('-', ' ')} `;
    const r = await mfa(first.body.mfa_token, { backup_code: typed });
    assert.equal(r.status, 200);
    const second = await login('olive');
    assert.deepEqual(await mfa(second.body.mfa_token, { backup_code: backup }), INVALID_CODE);
    assert.deepEqual(await mfa(second.body.mfa_token, { backup_code: 'nope' }), INVALID_CODE);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM backup_codes WHERE user_id = ? AND used_at IS NOT NULL').get(olive.id).c, 1);
  });

  it('mfa refuses a missing code, an expired step and a session token', async () => {
    tick();
    const first = await login('olive');
    assert.deepEqual(await mfa(first.body.mfa_token, {}), { status: 400, body: { error: 'Code required' } });
    assert.deepEqual(await mfa(olive.token, { code: code(olive.secret) }), MFA_STEP_EXPIRED, 'a session token is not an mfa token');
    assert.deepEqual(await mfa('garbage', { code: code(olive.secret) }), MFA_STEP_EXPIRED);
    tick(301);
    assert.deepEqual(await mfa(first.body.mfa_token, { code: code(olive.secret) }), MFA_STEP_EXPIRED);
  });

  it('logout-all revokes every session of the user', async () => {
    const a = await signIn('olive', olive.secret);
    const nowSeconds = Math.floor(clock.getTime() / 1000);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM used_mfa_tokens WHERE expires_at <= ?').get(nowSeconds).c, 0,
      'spent tokens past their expiry are pruned');
    assert.ok(db.prepare('SELECT COUNT(*) AS c FROM used_mfa_tokens').get().c >= 1);
    const b = await signIn('olive', olive.secret);
    assert.equal((await call('POST', '/auth/logout-all', { token: a })).status, 204);
    assert.deepEqual(await call('GET', '/auth/me', { token: a }), EXPIRED);
    assert.deepEqual(await call('GET', '/restaurants', { token: b }), EXPIRED);
    olive.token = await signIn('olive', olive.secret);
  });

  it('replace: setup needs a current code, and the old factor works until enable', async () => {
    assert.deepEqual(await call('POST', '/auth/totp/setup', { token: olive.token }), { status: 400, body: { error: 'Code required' } });
    tick();
    assert.deepEqual(await call('POST', '/auth/totp/setup', { token: olive.token, body: { code: wrongCode(olive.secret, clock) } }), INVALID_CODE);
    const setup = await call('POST', '/auth/totp/setup', { token: olive.token, body: { code: code(olive.secret) } });
    assert.equal(setup.status, 200);
    const next = setup.body.secret;
    assert.notEqual(next, olive.secret);

    const stillOld = await signIn('olive', olive.secret);
    assert.equal((await call('GET', '/restaurants', { token: stillOld })).status, 200);

    tick();
    const enabled = await call('POST', '/auth/totp/enable', { token: stillOld, body: { code: code(next) } });
    assert.equal(enabled.status, 200);
    assert.deepEqual(await call('GET', '/auth/me', { token: stillOld }), EXPIRED);

    tick();
    const first = await login('olive');
    assert.deepEqual(await mfa(first.body.mfa_token, { code: code(olive.secret) }), INVALID_CODE, 'the old factor is gone');
    assert.deepEqual(await mfa(first.body.mfa_token, { backup_code: olive.backupCodes[1] }), INVALID_CODE, 'old backup codes are gone');
    assert.equal((await mfa(first.body.mfa_token, { code: code(next) })).status, 200);
    olive = { ...olive, secret: next, token: enabled.body.token, backupCodes: enabled.body.backup_codes };
  });

  it('enable without a pending setup is refused', async () => {
    tick();
    assert.deepEqual(await call('POST', '/auth/totp/enable', { token: olive.token, body: { code: code(olive.secret) } }),
      { status: 400, body: { error: 'Start the authenticator setup first' } });
  });

  it('backup codes: regenerating needs a current code and replaces the old set', async () => {
    assert.deepEqual(await call('POST', '/auth/totp/backup-codes', { token: olive.token, body: {} }), { status: 400, body: { error: 'Code required' } });
    tick();
    const r = await call('POST', '/auth/totp/backup-codes', { token: olive.token, body: { code: code(olive.secret) } });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), ['backup_codes']);
    assert.equal(r.body.backup_codes.length, 10);
    assert.equal((await call('GET', '/auth/me', { token: olive.token })).status, 200, 'regenerating keeps the session');

    tick();
    const first = await login('olive');
    assert.deepEqual(await mfa(first.body.mfa_token, { backup_code: olive.backupCodes[2] }), INVALID_CODE);
    assert.equal((await mfa(first.body.mfa_token, { backup_code: r.body.backup_codes[0] })).status, 200);
    olive.backupCodes = r.body.backup_codes;
  });

  it('a backup code starts a replace without being spent; enable fails if it was used meanwhile', async () => {
    const usedCount = () => db.prepare('SELECT COUNT(*) AS c FROM backup_codes WHERE user_id = ? AND used_at IS NOT NULL').get(olive.id).c;
    const before = usedCount();
    const proof = olive.backupCodes[1];
    const setup = await call('POST', '/auth/totp/setup', { token: olive.token, body: { backup_code: proof } });
    assert.equal(setup.status, 200);
    assert.equal(usedCount(), before, 'setup only verifies the backup code');

    tick();
    const step = await login('olive');
    assert.equal((await mfa(step.body.mfa_token, { backup_code: proof })).status, 200, 'the code is used elsewhere meanwhile');
    tick();
    assert.deepEqual(await call('POST', '/auth/totp/enable', { token: olive.token, body: { code: code(setup.body.secret) } }), BACKUP_USED_MEANWHILE);

    const retry = await call('POST', '/auth/totp/setup', { token: olive.token, body: { backup_code: olive.backupCodes[2] } });
    assert.equal(retry.status, 200);
    tick();
    const enabled = await call('POST', '/auth/totp/enable', { token: olive.token, body: { code: code(retry.body.secret) } });
    assert.equal(enabled.status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM backup_codes WHERE user_id = ? AND used_at IS NULL').get(olive.id).c, 10);
    olive = { ...olive, secret: retry.body.secret, token: enabled.body.token, backupCodes: enabled.body.backup_codes };

    const regenerated = await call('POST', '/auth/totp/backup-codes', { token: olive.token, body: { backup_code: olive.backupCodes[0] } });
    assert.equal(regenerated.status, 200);
    assert.equal(regenerated.body.backup_codes.length, 10);
    assert.deepEqual(await call('POST', '/auth/totp/backup-codes', { token: olive.token, body: { backup_code: olive.backupCodes[0] } }),
      INVALID_CODE, 'the old set is gone and the code was spent');
    olive.backupCodes = regenerated.body.backup_codes;
  });

  it('disable is refused while the factor is required', async () => {
    tick();
    assert.deepEqual(await call('POST', '/auth/totp/disable', { token: olive.token, body: { code: code(olive.secret) } }),
      { status: 403, body: { error: 'Two-factor authentication is required on this server' } });
  });

  it('owner recovery: list users and reset another user; member and self are refused', async () => {
    const reg = await register('mia');
    const enrolled = await enroll(reg.body.token);
    mia = { id: reg.body.user.id, ...enrolled };

    const list = await call('GET', '/users', { token: olive.token });
    assert.equal(list.status, 200);
    for (const user of list.body) assert.deepEqual(Object.keys(user).sort(), ['created_at', 'email', 'id', 'name', 'role', 'totp_enabled']);
    assert.deepEqual(list.body.filter(u => ['olive@tf.test', 'mia@tf.test'].includes(u.email)).map(u => [u.email, u.totp_enabled]),
      [['olive@tf.test', true], ['mia@tf.test', true]]);

    assert.deepEqual(await call('GET', '/users', { token: mia.token }), { status: 403, body: { error: 'Not allowed' } });
    assert.deepEqual(await call('POST', `/users/${olive.id}/totp/reset`, { token: mia.token }), { status: 403, body: { error: 'Not allowed' } });
    assert.deepEqual(await call('POST', `/users/${olive.id}/totp/reset`, { token: olive.token }),
      { status: 403, body: { error: 'Replace your own authenticator in Security settings' } });
    assert.deepEqual(await call('POST', '/users/9999/totp/reset', { token: olive.token }), { status: 404, body: { error: 'Not found' } });

    assert.deepEqual(await call('POST', `/users/${mia.id}/totp/reset`, { token: olive.token }), CODE_REQUIRED,
      'the owner proves their own factor');
    tick();
    assert.deepEqual(await call('POST', `/users/${mia.id}/totp/reset`, { token: olive.token, body: { code: wrongCode(olive.secret, clock) } }),
      INVALID_CODE);
    assert.equal(db.prepare('SELECT totp_enabled_at IS NOT NULL AS on_ FROM users WHERE id = ?').get(mia.id).on_, 1, 'nothing reset yet');
    assert.equal((await call('POST', `/users/${mia.id}/totp/reset`, { token: olive.token, body: { code: code(olive.secret) } })).status, 204);
    assert.deepEqual(await call('GET', '/auth/me', { token: mia.token }), EXPIRED);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM backup_codes WHERE user_id = ?').get(mia.id).c, 0);
    const row = db.prepare('SELECT totp_secret, totp_pending_secret, totp_enabled_at, totp_last_step FROM users WHERE id = ?').get(mia.id);
    assert.deepEqual(row, { totp_secret: null, totp_pending_secret: null, totp_enabled_at: null, totp_last_step: null });

    const again = await login('mia');
    assert.deepEqual(Object.keys(again.body).sort(), ['token', 'user'], 'no factor: an enroll session, not a code step');
    assert.deepEqual(await call('GET', '/restaurants', { token: again.body.token }), ENROLL);
  });

  it('a full token of a user without a factor acts as enroll on the required server', async () => {
    const reg = await register('noah', { at: optional });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.user.totp_required, false);
    assert.equal((await call('GET', '/restaurants', { at: optional, token: reg.body.token })).status, 200);
    assert.deepEqual(await call('GET', '/restaurants', { token: reg.body.token }), ENROLL);
  });

  it('optional server: set up, then disable with a code, which revokes old sessions', async () => {
    const reg = await login('noah', optional);
    const token = reg.body.token;
    const { secret, token: full } = await enroll(token, optional);
    tick();
    assert.deepEqual(await call('POST', '/auth/totp/disable', { at: optional, token: full, body: { code: wrongCode(secret, clock) } }), INVALID_CODE);
    const r = await call('POST', '/auth/totp/disable', { at: optional, token: full, body: { code: code(secret) } });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.totp_enabled, false);
    assert.deepEqual(await call('GET', '/auth/me', { at: optional, token: full }), EXPIRED);
    assert.equal((await call('GET', '/restaurants', { at: optional, token: r.body.token })).status, 200);
    const again = await login('noah', optional);
    assert.deepEqual(Object.keys(again.body).sort(), ['token', 'user']);
  });

  it('google: an existing user with a factor gets the code step; a new invited user gets enroll', async () => {
    google.payload = { email: 'olive@tf.test', name: 'Olive', email_verified: true };
    tick();
    const existing = await call('POST', '/auth/google', { body: { credential: 'fake' } });
    assert.equal(existing.status, 200);
    assert.equal(existing.body.mfa_required, true);
    assert.equal((await mfa(existing.body.mfa_token, { code: code(olive.secret) })).status, 200);

    google.payload = { email: 'gus@tf.test', name: 'Gus', email_verified: true };
    const created = await call('POST', '/auth/google', { body: { credential: 'fake', invite_code: inviteCode(db, { now: clock }) } });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.totp_enabled, false);
    assert.deepEqual(await call('GET', '/restaurants', { token: created.body.token }), ENROLL);
  });

  it('mfa refuses a step token issued before the factor was reset', async () => {
    tick();
    const first = await login('mia');
    assert.equal(first.body.mfa_required, undefined, 'mia has no factor after the reset');
    const again = await enroll(first.body.token);
    tick();
    const step = await login('mia');
    assert.equal(step.body.mfa_required, true);
    assert.equal((await call('POST', `/users/${mia.id}/totp/reset`, { token: olive.token, body: { code: code(olive.secret) } })).status, 204);
    assert.deepEqual(await mfa(step.body.mfa_token, { code: code(again.secret) }), MFA_STEP_EXPIRED);
  });

  it('an owner reset clears the day-long code lock, so the user can set up again at once', async () => {
    const reg = await register('lou');
    const lou = { id: reg.body.user.id, ...(await enroll(reg.body.token)) };
    const wrongGuesses = async (count) => {
      tick();
      const step = await login('lou');
      for (let i = 0; i < count; i++) assert.deepEqual(await mfa(step.body.mfa_token, { code: wrongCode(lou.secret, clock) }), INVALID_CODE);
    };
    // 7 wrong codes per 16 minutes stay under the short lock; 30 in all reach the day-long lock.
    for (let round = 0; round < 4; round++) {
      await wrongGuesses(7);
      tick(16 * 60);
    }
    await wrongGuesses(2);
    tick(16 * 60);
    const locked = await login('lou');
    assert.deepEqual(await mfa(locked.body.mfa_token, { code: code(lou.secret) }), LOCKED);

    tick();
    assert.equal((await call('POST', `/users/${lou.id}/totp/reset`, { token: olive.token, body: { code: code(olive.secret) } })).status, 204);

    const again = await login('lou');
    assert.deepEqual(Object.keys(again.body).sort(), ['token', 'user'], 'an enroll session');
    const setup = await call('POST', '/auth/totp/setup', { token: again.body.token });
    assert.equal(setup.status, 200);
    tick();
    assert.equal((await call('POST', '/auth/totp/enable', { token: again.body.token, body: { code: code(setup.body.secret) } })).status, 200,
      'the code lock no longer blocks the new factor');
  });

  it('owner reset: 8 wrong owner proofs lock the reset', async () => {
    tick(16 * 60);
    for (let i = 0; i < 8; i++) {
      assert.deepEqual(await call('POST', `/users/${mia.id}/totp/reset`, { token: olive.token, body: { code: wrongCode(olive.secret, clock) } }),
        INVALID_CODE, `wrong proof ${i + 1}`);
    }
    assert.deepEqual(await call('POST', `/users/${mia.id}/totp/reset`, { token: olive.token, body: { code: code(olive.secret) } }), LOCKED);
  });
});
