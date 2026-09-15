// Integration test: the sign-in lockout over real HTTP. Its own app and
// database, so the failure counters and the clock belong to this file. Every
// request comes from 127.0.0.1, so each test starts after the IP lock has ended.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callApi } from './helpers/http.js';
import { inviteCode } from './helpers/invites.js';
import { totpCode, wrongCode } from './helpers/totp.js';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';

const KL = 'Asia/Kuala_Lumpur';
const LOCKED = { status: 429, body: { error: 'Too many attempts. Try again later.' } };
const BAD_LOGIN = { status: 401, body: { error: 'Invalid credentials' } };

describe('API lockout', () => {
  let db;
  let dir;
  let server;
  let at;
  let clock = new Date('2026-09-16T10:00:00.000Z');
  const minutes = (n) => { clock = new Date(clock.getTime() + n * 60_000); };
  const call = (method, path, options = {}) => callApi(`${at}${path}`, method, options);
  const login = (email, password) => call('POST', '/auth/login', { body: { email, password } });

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'fooddiary-lock-'));
    db = openDatabase(':memory:', { defaultTimeZone: KL });
    const { app } = createApp({ db, uploadsDir: dir, jwtSecret: 'test-secret', defaultTimeZone: KL, now: () => clock, requireTotp: false });
    await new Promise(resolve => { server = app.listen(0, resolve); });
    at = `http://127.0.0.1:${server.address().port}/api`;
    const reg = await call('POST', '/auth/register', {
      body: { name: 'Amy', email: 'amy@lock.test', password: 'right', invite_code: inviteCode(db, { now: clock }) },
    });
    assert.equal(reg.status, 201);
  });

  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) db.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => minutes(31));

  it('login: 8 failures lock an email, existing or not, until the lock ends', async () => {
    for (let i = 0; i < 8; i++) assert.deepEqual(await login('Ghost@Lock.test', 'x'), BAD_LOGIN, `failure ${i + 1}`);
    assert.deepEqual(await login('ghost@lock.test ', 'x'), LOCKED, 'the normalised email is locked');

    for (let i = 0; i < 8; i++) assert.deepEqual(await login('amy@lock.test', 'wrong'), BAD_LOGIN);
    assert.deepEqual(await login('amy@lock.test', 'right'), LOCKED, 'a locked key is not checked');

    minutes(15);
    assert.equal((await login('amy@lock.test', 'right')).status, 200, 'the lock ended');
  });

  it('login: a success clears the account count but not the IP count', async () => {
    for (let i = 0; i < 7; i++) assert.deepEqual(await login('amy@lock.test', 'wrong'), BAD_LOGIN);
    assert.equal((await login('amy@lock.test', 'right')).status, 200);
    for (let i = 0; i < 7; i++) assert.deepEqual(await login('amy@lock.test', 'wrong'), BAD_LOGIN, 'the account count started again');
    // 14 IP failures so far; 6 more reach the IP limit of 20.
    for (let i = 0; i < 6; i++) assert.deepEqual(await login(`other${i}@lock.test`, 'x'), BAD_LOGIN);
    assert.deepEqual(await login('amy@lock.test', 'right'), LOCKED, 'the IP is locked');
    assert.deepEqual(await login('fresh@lock.test', 'x'), LOCKED);
  });

  it('login: the count starts again after the window', async () => {
    for (let i = 0; i < 7; i++) assert.deepEqual(await login('ben@lock.test', 'x'), BAD_LOGIN);
    minutes(15);
    for (let i = 0; i < 7; i++) assert.deepEqual(await login('ben@lock.test', 'x'), BAD_LOGIN);
  });

  it('mfa: 8 wrong codes lock the account, even for the right code', async () => {
    const first = await login('amy@lock.test', 'right');
    const setup = await call('POST', '/auth/totp/setup', { token: first.body.token });
    const secret = setup.body.secret;
    const enabled = await call('POST', '/auth/totp/enable', { token: first.body.token, body: { code: totpCode(secret, clock) } });
    assert.equal(enabled.status, 200);

    minutes(1);
    const step = await login('amy@lock.test', 'right');
    assert.equal(step.body.mfa_required, true);
    const wrong = wrongCode(secret, clock);
    for (let i = 0; i < 4; i++) {
      assert.equal((await call('POST', '/auth/mfa', { body: { mfa_token: step.body.mfa_token, code: wrong } })).status, 401);
      assert.equal((await call('POST', '/auth/mfa', { body: { mfa_token: step.body.mfa_token, backup_code: 'zzzz-zzzz' } })).status, 401);
    }
    assert.deepEqual(await call('POST', '/auth/mfa', { body: { mfa_token: step.body.mfa_token, code: totpCode(secret, clock) } }), LOCKED);
    assert.deepEqual(await call('POST', '/auth/mfa', { body: { mfa_token: step.body.mfa_token, backup_code: enabled.body.backup_codes[0] } }), LOCKED);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM backup_codes WHERE used_at IS NOT NULL').get().c, 0, 'the backup code was not spent');
  });

  it('register: 20 refused invites lock the IP', async () => {
    const body = (invite_code) => ({ name: 'X', email: 'x@lock.test', password: 'pw', invite_code });
    for (let i = 0; i < 20; i++) assert.equal((await call('POST', '/auth/register', { body: body('bad') })).status, 403);
    assert.deepEqual(await call('POST', '/auth/register', { body: body(inviteCode(db, { now: clock })) }), LOCKED);
  });

  it('invite check: 20 invalid codes lock the IP', async () => {
    const code = inviteCode(db, { now: clock });
    for (let i = 0; i < 20; i++) assert.deepEqual(await call('POST', '/invites/check', { body: { code: 'bad' } }), { status: 200, body: { valid: false } });
    assert.deepEqual(await call('POST', '/invites/check', { body: { code } }), LOCKED);
  });
});
