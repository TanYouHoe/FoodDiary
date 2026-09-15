// Integration test: invite-only accounts over real HTTP. Its own app, so the
// clock moves and the database is reachable. The tests share users and run in order.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callApi } from './helpers/http.js';
import { inviteCode } from './helpers/invites.js';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { makeInvites } from '../server/invites.js';
import { INVITE_LIFETIME_MS } from '../logic/invites.js';

const KL = 'Asia/Kuala_Lumpur';
const START = new Date('2026-09-16T10:00:00.000Z');
const ORIGIN = 'https://food.example.test';
const INVITE_REQUIRED = { error: 'A valid invite is required' };
const NOT_ALLOWED = { error: 'Not allowed' };

describe('API account invites', () => {
  let at;
  let atNoOrigin;
  let servers = [];
  let db;
  let dir;
  let clock = START;
  const google = { payload: null };
  let owner;
  let member;

  const call = (method, path, options = {}) => callApi(`${options.at ?? at}${path}`, method, options);
  const signUp = (name, invite_code, extra = {}) =>
    call('POST', '/auth/register', { body: { name, email: `${name}@inv.test`, password: 'pw', invite_code, ...extra } });
  const role = (email) => db.prepare('SELECT role FROM users WHERE email = ?').get(email)?.role;
  const inviteRow = (code) => db.prepare('SELECT * FROM invites WHERE code_hash = ?').get(createHash('sha256').update(code).digest('hex'));
  const check = async (code) => (await call('POST', '/invites/check', { body: { code } })).body;
  const listen = async (options) => {
    const { app } = createApp({
      db, uploadsDir: dir, jwtSecret: 'test-secret', defaultTimeZone: KL, now: () => clock,
      verifyGoogle: async () => google.payload, ...options,
    });
    const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
    servers.push(server);
    return `http://127.0.0.1:${server.address().port}/api`;
  };

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'fooddiary-inv-'));
    db = openDatabase(':memory:', { defaultTimeZone: KL });
    at = await listen({ publicOrigin: ORIGIN });
    atNoOrigin = await listen({});
  });

  after(async () => {
    for (const server of servers) await new Promise(resolve => server.close(resolve));
    if (db) db.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('register checks the fields first, then needs a valid invite', async () => {
    assert.deepEqual(await call('POST', '/auth/register', { body: { email: 'x@inv.test' } }),
      { status: 400, body: { error: 'Name, email, and password required' } });
    assert.deepEqual(await signUp('nocode'), { status: 403, body: INVITE_REQUIRED });
    assert.deepEqual(await signUp('garbage', 'not-a-real-code'), { status: 403, body: INVITE_REQUIRED });
    assert.deepEqual(await signUp('number', 12345), { status: 403, body: INVITE_REQUIRED });
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM users').get().c, 0);
  });

  it('an owner invite on a fresh database makes the owner', async () => {
    const code = inviteCode(db, { role: 'owner', now: clock });
    const r = await signUp('olive', code);
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, 'owner');
    owner = { ...r.body.user, token: r.body.token };
    const row = inviteRow(code);
    assert.equal(row.used_by, owner.id);
    assert.equal(row.used_at, clock.toISOString());
  });

  it('an owner invite made before the owner existed no longer works', async () => {
    const late = db.prepare("INSERT INTO invites (code_hash, role, created_at, expires_at) VALUES (?, 'owner', ?, ?)")
      .run(createHash('sha256').update('late-owner-code').digest('hex'), clock.toISOString(), new Date(clock.getTime() + 1000).toISOString());
    assert.ok(late.lastInsertRowid);
    assert.deepEqual(await check('late-owner-code'), { valid: false });
    assert.deepEqual(await signUp('stranger', 'late-owner-code'), { status: 403, body: INVITE_REQUIRED });
  });

  it('a valid member invite gives the member role and works once', async () => {
    const code = inviteCode(db, { now: clock });
    assert.deepEqual(await check(code), { valid: true });
    const r = await signUp('mia', code);
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, 'member');
    assert.ok(r.body.token);
    member = { ...r.body.user, token: r.body.token };
    assert.deepEqual(await check(code), { valid: false });
    assert.deepEqual(await signUp('again', code), { status: 403, body: INVITE_REQUIRED });
    assert.equal(role('again@inv.test'), undefined);
  });

  it('a duplicate email with a valid invite is 409 and leaves the invite unused', async () => {
    const code = inviteCode(db, { now: clock });
    assert.deepEqual(await signUp('mia', code), { status: 409, body: { error: 'Email already registered' } });
    assert.deepEqual(await check(code), { valid: true });
  });

  it('an expired invite is refused from the exact expiry instant', async () => {
    const code = inviteCode(db, { now: clock });
    clock = new Date(START.getTime() + INVITE_LIFETIME_MS - 1);
    assert.deepEqual(await check(code), { valid: true });
    clock = new Date(START.getTime() + INVITE_LIFETIME_MS);
    assert.deepEqual(await check(code), { valid: false });
    assert.deepEqual(await signUp('late', code), { status: 403, body: INVITE_REQUIRED });
    clock = START;
  });

  it('two concurrent uses of one code: exactly one succeeds', async () => {
    const code = inviteCode(db, { now: clock });
    const results = await Promise.all([signUp('race1', code), signUp('race2', code)]);
    assert.deepEqual(results.map(r => r.status).sort(), [201, 403]);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM users WHERE email IN ('race1@inv.test', 'race2@inv.test')").get().c, 1);
  });

  it('same email, two valid invites at once: one 201, one 409, and the losing invite still works', async () => {
    const codes = [inviteCode(db, { now: clock }), inviteCode(db, { now: clock })];
    const results = await Promise.all(codes.map(code =>
      call('POST', '/auth/register', { body: { name: 'Twin', email: 'twin@inv.test', password: 'pw', invite_code: code } })));
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    const loser = codes[results.findIndex(r => r.status === 409)];
    assert.deepEqual(results.find(r => r.status === 409).body, { error: 'Email already registered' });
    assert.deepEqual(await check(loser), { valid: true });
    assert.equal(inviteRow(loser).used_at, null);
  });

  it('owner routes: only the owner creates, lists and revokes', async () => {
    assert.equal((await call('POST', '/invites')).status, 401);
    assert.equal((await call('GET', '/invites')).status, 401);
    assert.equal((await call('DELETE', '/invites/1')).status, 401);
    assert.deepEqual(await call('POST', '/invites', { token: member.token }), { status: 403, body: NOT_ALLOWED });
    assert.deepEqual(await call('GET', '/invites', { token: member.token }), { status: 403, body: NOT_ALLOWED });
    assert.deepEqual(await call('DELETE', '/invites/1', { token: member.token }), { status: 403, body: NOT_ALLOWED });
  });

  it('POST /invites makes a member invite with a link on the public origin, shown once', async () => {
    const r = await call('POST', '/invites', { token: owner.token, body: { role: 'owner' } });
    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.body).sort(), ['code', 'expires_at', 'id', 'role', 'url']);
    assert.equal(r.body.role, 'member');
    assert.match(r.body.code, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(r.body.url, `${ORIGIN}/invite/${r.body.code}`);
    assert.equal(r.body.expires_at, new Date(clock.getTime() + INVITE_LIFETIME_MS).toISOString());

    const row = inviteRow(r.body.code);
    assert.equal(row.id, r.body.id);
    assert.equal(row.created_by, owner.id);
    assert.ok(!Object.values(row).includes(r.body.code), 'the code itself is not stored');
    assert.deepEqual(await check(r.body.code), { valid: true });
  });

  it('without a public origin the link uses the request origin', async () => {
    const r = await call('POST', '/invites', { at: atNoOrigin, token: owner.token });
    assert.equal(r.status, 201);
    assert.equal(r.body.url, `${atNoOrigin.replace(/\/api$/, '')}/invite/${r.body.code}`);
  });

  it('GET /invites lists status, dates and who used it, never a code', async () => {
    const r = await call('GET', '/invites', { token: owner.token });
    assert.equal(r.status, 200);
    assert.ok(r.body.length > 0);
    for (const invite of r.body) {
      assert.deepEqual(Object.keys(invite).sort(), ['created_at', 'expires_at', 'id', 'revoked_at', 'role', 'status', 'used_at', 'used_by']);
    }
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes('code'), 'no code or code hash in the list');
    const used = r.body.find(i => i.used_by?.email === 'mia@inv.test');
    assert.deepEqual([used.status, used.used_by], ['used', { id: member.id, name: 'mia', email: 'mia@inv.test' }]);
    assert.ok(r.body.some(i => i.status === 'valid' && i.used_by === null));
    assert.deepEqual(r.body.map(i => i.id), [...r.body.map(i => i.id)].sort((a, b) => b - a), 'newest first');
  });

  it('DELETE /invites/:id revokes; missing is 404; used is 409', async () => {
    const created = (await call('POST', '/invites', { token: owner.token })).body;
    assert.equal((await call('DELETE', `/invites/${created.id}`, { token: owner.token })).status, 204);
    assert.deepEqual(await check(created.code), { valid: false });
    assert.deepEqual(await signUp('revoked', created.code), { status: 403, body: INVITE_REQUIRED });
    const listed = (await call('GET', '/invites', { token: owner.token })).body.find(i => i.id === created.id);
    assert.equal(listed.status, 'revoked');
    assert.equal(listed.revoked_at, clock.toISOString());
    assert.equal((await call('DELETE', `/invites/${created.id}`, { token: owner.token })).status, 204, 'revoking again changes nothing');

    assert.deepEqual(await call('DELETE', '/invites/9999', { token: owner.token }), { status: 404, body: { error: 'Not found' } });
    assert.deepEqual(await call('DELETE', '/invites/abc', { token: owner.token }), { status: 404, body: { error: 'Not found' } });
    const code = inviteCode(db, { now: clock });
    assert.equal((await signUp('user-of-used', code)).status, 201);
    assert.deepEqual(await call('DELETE', `/invites/${inviteRow(code).id}`, { token: owner.token }), { status: 409, body: { error: 'Invite already used' } });
    assert.equal(inviteRow(code).revoked_at, null);
  });

  it('check is POST { code } and never reveals more than valid', async () => {
    assert.deepEqual(await call('POST', '/invites/check', { body: { code: 'nope' } }), { status: 200, body: { valid: false } });
    assert.deepEqual(await call('POST', '/invites/check', { body: {} }), { status: 200, body: { valid: false } });
    assert.deepEqual(await call('POST', '/invites/check'), { status: 200, body: { valid: false } });
    assert.equal((await call('GET', '/invites/check/nope')).status, 401, 'no GET check route');
  });

  it('the store never revokes a used invite', async () => {
    const code = inviteCode(db, { now: clock });
    assert.equal((await signUp('used-then-revoked', code)).status, 201);
    makeInvites(db).revoke(inviteRow(code).id, clock);
    assert.equal(inviteRow(code).revoked_at, null);
  });

  it('google: an unverified email is refused before any lookup or insert', async () => {
    const UNVERIFIED = { status: 401, body: { error: 'Google account email is not verified' } };
    google.payload = { email: 'mia@inv.test', name: 'Mia', picture: 'https://example.test/mia.png', email_verified: false };
    assert.deepEqual(await call('POST', '/auth/google', { body: { credential: 'fake' } }), UNVERIFIED);
    assert.equal(db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(member.id).avatar_url, null, 'existing user untouched');

    const code = inviteCode(db, { now: clock });
    for (const email_verified of [undefined, 'true', 1]) {
      google.payload = { email: 'unverified@inv.test', name: 'U', email_verified };
      assert.deepEqual(await call('POST', '/auth/google', { body: { credential: 'fake', invite_code: code } }), UNVERIFIED, String(email_verified));
    }
    assert.equal(role('unverified@inv.test'), undefined);
    assert.deepEqual(await check(code), { valid: true });
  });

  it('google: a new email needs a valid invite', async () => {
    google.payload = { email: 'gina@inv.test', name: 'Gina', picture: null, email_verified: true };
    assert.deepEqual(await call('POST', '/auth/google', { body: { credential: 'fake' } }), { status: 403, body: INVITE_REQUIRED });
    assert.deepEqual(await call('POST', '/auth/google', { body: { credential: 'fake', invite_code: 'nope' } }), { status: 403, body: INVITE_REQUIRED });
    assert.equal(role('gina@inv.test'), undefined);

    const code = inviteCode(db, { now: clock });
    const r = await call('POST', '/auth/google', { body: { credential: 'fake', invite_code: code } });
    assert.equal(r.status, 201, 'a new account answers 201 like register');
    assert.equal(r.body.user.email, 'gina@inv.test');
    assert.equal(r.body.user.role, 'member');
    assert.equal(inviteRow(code).used_by, r.body.user.id);
  });

  it('google: an existing email signs in without an invite', async () => {
    google.payload = { email: 'mia@inv.test', name: 'Mia', email_verified: true };
    const r = await call('POST', '/auth/google', { body: { credential: 'fake' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.id, member.id);
  });

  it('google: a bad credential is still 401', async () => {
    const { app } = createApp({
      db, uploadsDir: dir, jwtSecret: 'test-secret', defaultTimeZone: KL,
      verifyGoogle: async () => { throw new Error('bad token'); },
    });
    const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
    servers.push(server);
    const r = await call('POST', '/auth/google', { at: `http://127.0.0.1:${server.address().port}/api`, body: { credential: 'x' } });
    assert.deepEqual(r, { status: 401, body: { error: 'Invalid Google token' } });
  });
});
