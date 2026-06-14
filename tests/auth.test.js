import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'http://localhost:3004/api';

describe('Auth', () => {
  it('POST /auth/register creates a user and returns token', async () => {
    const res = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', email: 'test@test.com', password: 'password123' }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.token);
    assert.equal(data.user.name, 'Test User');
    assert.equal(data.user.email, 'test@test.com');
    assert.ok(!data.user.password_hash, 'should not expose password_hash');
  });

  it('POST /auth/register rejects duplicate email', async () => {
    const res = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dupe', email: 'test@test.com', password: 'pass' }),
    });
    assert.equal(res.status, 409);
  });

  it('POST /auth/login returns token for valid credentials', async () => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', password: 'password123' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
  });

  it('POST /auth/login rejects wrong password', async () => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', password: 'wrong' }),
    });
    assert.equal(res.status, 401);
  });

  it('GET /auth/me returns user when authenticated', async () => {
    const login = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', password: 'password123' }),
    });
    const { token } = await login.json();

    const res = await fetch(`${BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.email, 'test@test.com');
  });

  it('GET /auth/me rejects missing token', async () => {
    const res = await fetch(`${BASE}/auth/me`);
    assert.equal(res.status, 401);
  });
});
