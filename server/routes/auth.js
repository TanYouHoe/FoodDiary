// Connector: register, login, current user and Google sign-in.

import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { checkRegistration, checkLogin, googleAccountName, shouldAdoptPicture } from '../../logic/accounts.js';
import { pick, USER_FIELDS } from '../rows.js';

const BCRYPT_ROUNDS = 10;

export function authRoutes({ db, tokens, authenticate, verifyGoogle, googleClientId }) {
  const r = Router();
  const byEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const byId = db.prepare('SELECT id, name, email, avatar_url, role, timezone, created_at FROM users WHERE id = ?');
  const insertUser = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
  const insertGoogleUser = db.prepare('INSERT INTO users (name, email, password_hash, avatar_url) VALUES (?, ?, ?, ?)');
  const setAvatar = db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?');

  r.post('/register', async (req, res) => {
    const input = checkRegistration(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const { name, email, password } = input.value;
    if (byEmail.get(email)) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const info = insertUser.run(name, email, hash);
    const user = pick(byId.get(info.lastInsertRowid), USER_FIELDS);
    res.status(201).json({ token: tokens.sign(user.id), user });
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
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential required' });

    try {
      const { email, name, picture } = await verifyGoogle(credential, googleClientId);
      if (!email) return res.status(400).json({ error: 'No email in Google account' });

      const existing = byEmail.get(email);
      let user;
      if (!existing) {
        // Google accounts get an unguessable password so the password login stays closed.
        const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
        const info = insertGoogleUser.run(googleAccountName(name, email), email, hash, picture || null);
        user = pick(byId.get(info.lastInsertRowid), USER_FIELDS);
      } else {
        if (shouldAdoptPicture(picture, existing)) setAvatar.run(picture, existing.id);
        user = pick(byId.get(existing.id), USER_FIELDS);
      }
      res.json({ token: tokens.sign(user.id), user });
    } catch {
      res.status(401).json({ error: 'Invalid Google token' });
    }
  });

  return r;
}
