// Connector: register, login, current user and Google sign-in. A new account
// needs an account invite (server/invites.js); the invite gives its role.

import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { checkRegistration, checkLogin, googleAccountName, shouldAdoptPicture } from '../../logic/accounts.js';
import { INVITE_REQUIRED } from '../../logic/invites.js';
import { pick, USER_FIELDS } from '../rows.js';

const BCRYPT_ROUNDS = 10;

const inviteRequired = (res) => res.status(403).json({ error: INVITE_REQUIRED });
const isUniqueViolation = (err) => err?.code === 'SQLITE_CONSTRAINT_UNIQUE';

// now: () => Date.
export function authRoutes({ db, tokens, authenticate, verifyGoogle, googleClientId, invites, now }) {
  const r = Router();
  const byEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const byId = db.prepare('SELECT id, name, email, avatar_url, role, timezone, created_at FROM users WHERE id = ?');
  const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
  const insertGoogleUser = db.prepare('INSERT INTO users (name, email, password_hash, avatar_url, role) VALUES (?, ?, ?, ?, ?)');
  const setAvatar = db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?');

  const signedIn = (userId) => {
    const user = pick(byId.get(userId), USER_FIELDS);
    return { token: tokens.sign(user.id), user };
  };

  r.post('/register', async (req, res) => {
    const input = checkRegistration(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const { invite_code: code } = req.body;
    if (!invites.isUsable(code, now())) return inviteRequired(res);
    const { name, email, password } = input.value;
    if (byEmail.get(email)) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    // The invite is checked again inside the transaction: another request may have used it meanwhile.
    let userId;
    try {
      userId = invites.redeem(code, now(), (role) => insertUser.run(name, email, hash, role).lastInsertRowid);
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: 'Email already registered' });
      throw err;
    }
    if (userId === null) return inviteRequired(res);
    res.status(201).json(signedIn(userId));
  });

  r.post('/login', async (req, res) => {
    const input = checkLogin(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const row = byEmail.get(input.value.email);
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    if (!(await bcrypt.compare(input.value.password, row.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ token: tokens.sign(row.id), user: pick(row, USER_FIELDS) });
  });

  r.get('/me', authenticate, (req, res) => res.json(req.user));

  r.post('/google', async (req, res) => {
    const { credential, invite_code: code } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential required' });

    let profile;
    try {
      profile = await verifyGoogle(credential, googleClientId);
    } catch {
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    const { email, name, picture } = profile || {};
    if (!email) return res.status(400).json({ error: 'No email in Google account' });

    const existing = byEmail.get(email);
    if (existing) {
      if (shouldAdoptPicture(picture, existing)) setAvatar.run(picture, existing.id);
      return res.json(signedIn(existing.id));
    }

    if (!invites.isUsable(code, now())) return inviteRequired(res);
    // Google accounts get an unguessable password so the password login stays closed.
    const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
    let userId;
    try {
      userId = invites.redeem(code, now(), (role) =>
        insertGoogleUser.run(googleAccountName(name, email), email, hash, picture || null, role).lastInsertRowid);
    } catch (err) {
      // The same Google account signed up twice at once; the other request made it.
      if (isUniqueViolation(err)) return res.status(409).json({ error: 'Email already registered' });
      throw err;
    }
    if (userId === null) return inviteRequired(res);
    res.json(signedIn(userId));
  });

  return r;
}
