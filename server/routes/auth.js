// Connector: register, login, the second-factor step, current user, sign-out
// everywhere and Google sign-in. A new account needs an account invite
// (server/invites.js); the invite gives its role. What a correct first factor
// leads to is server/sessions.js; failures count toward logic/lockout.js.

import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import {
  checkRegistration, checkLogin, googleAccountName, shouldAdoptPicture, isVerifiedGoogleProfile,
  EMAIL_TAKEN, GOOGLE_EMAIL_NOT_VERIFIED,
} from '../../logic/accounts.js';
import { INVITE_REQUIRED } from '../../logic/invites.js';
import { loginKeys, codeKeys, publicKeys } from '../../logic/lockout.js';
import { isCurrentTokenVersion, factorProof, CODE_REQUIRED, INVALID_CODE, INVALID_MFA_TOKEN } from '../../logic/two-factor.js';
import { tooManyAttempts } from '../lockout-store.js';
import { makePasswordCheck, BCRYPT_ROUNDS } from '../passwords.js';

const inviteRequired = (res) => res.status(403).json({ error: INVITE_REQUIRED });
const emailTaken = (res) => res.status(409).json({ error: EMAIL_TAKEN });
const isUniqueViolation = (err) => err?.code === 'SQLITE_CONSTRAINT_UNIQUE';

// now: () => Date.
export function authRoutes({ db, authenticate, verifyGoogle, googleClientId, invites, tokens, twoFactor, lockout, sessions, now }) {
  const r = Router();
  const byEmail = db.prepare('SELECT id, password_hash, avatar_url FROM users WHERE email = ?');
  const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
  const insertGoogleUser = db.prepare('INSERT INTO users (name, email, password_hash, avatar_url, role) VALUES (?, ?, ?, ?, ?)');
  const setAvatar = db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?');
  const checkPassword = makePasswordCheck();

  // Uses the invite and inserts the user in one transaction (server/invites.js).
  // insert: (role) => new user id. Answers 403 or 409, or returns the new user id.
  const redeem = (res, code, at, insert) => {
    let userId;
    try {
      userId = invites.redeem(code, at, insert);
    } catch (err) {
      // Another request made the same email meanwhile; the invite stays unused.
      if (isUniqueViolation(err)) { emailTaken(res); return null; }
      throw err;
    }
    if (userId === null) inviteRequired(res);
    return userId;
  };

  r.post('/register', async (req, res) => {
    const input = checkRegistration(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const { invite_code: code } = req.body;
    const at = now();
    const outcome = await lockout.attempt(publicKeys(req.ip), at, () => invites.isUsable(code, at));
    if (outcome === 'locked') return tooManyAttempts(res);
    if (outcome === 'failed') return inviteRequired(res);
    const { name, email, password } = input.value;
    if (byEmail.get(email)) return emailTaken(res);

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    // The invite is checked again inside the transaction: another request may have used it meanwhile.
    const userId = redeem(res, code, now(), (role) => insertUser.run(name, email, hash, role).lastInsertRowid);
    if (userId !== null) res.status(201).json(sessions.afterFirstFactor(userId));
  });

  r.post('/login', async (req, res) => {
    const input = checkLogin(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    let row;
    const outcome = await lockout.attempt(loginKeys(input.value.email, req.ip), now(), async () => {
      row = byEmail.get(input.value.email);
      return checkPassword(row, input.value.password);
    });
    if (outcome === 'locked') return tooManyAttempts(res);
    if (outcome === 'failed') return res.status(401).json({ error: 'Invalid credentials' });
    res.json(sessions.afterFirstFactor(row.id));
  });

  // Body { mfa_token, code } or { mfa_token, backup_code }. An mfa token works once.
  r.post('/mfa', async (req, res) => {
    const mfaToken = req.body?.mfa_token;
    const proof = factorProof(req.body);
    if (!proof) return res.status(400).json({ error: CODE_REQUIRED });
    const at = now();
    const claims = tokens.verifyMfa(mfaToken, at);
    const state = claims && twoFactor.state(claims.id);
    const stepExpired = () => res.status(401).json({ error: INVALID_MFA_TOKEN });
    if (!state || !state.totpEnabled || !isCurrentTokenVersion(claims, state.tokenVersion)) return stepExpired();
    if (sessions.isMfaTokenSpent(claims)) return stepExpired();
    // Accepted: two concurrent requests with one mfa token can each spend a proof before one of them completes.
    const outcome = await lockout.attempt(codeKeys(claims.id, req.ip), at, () => twoFactor.useProof(claims.id, proof, at));
    if (outcome === 'locked') return tooManyAttempts(res);
    if (outcome === 'failed') return res.status(401).json({ error: INVALID_CODE });
    const signedIn = sessions.completeMfa(claims);
    if (!signedIn) return stepExpired();
    res.json(signedIn);
  });

  r.get('/me', authenticate, (req, res) => res.json(sessions.user(req.user.id)));

  // Raises the token version, so every token issued so far stops working, and
  // forgets a pending authenticator setup.
  r.post('/logout-all', authenticate, (req, res) => {
    twoFactor.endAllSessions(req.user.id);
    res.status(204).end();
  });

  r.post('/google', async (req, res) => {
    const { credential, invite_code: code } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential required' });

    let profile;
    try {
      profile = await verifyGoogle(credential, googleClientId);
    } catch {
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    if (!isVerifiedGoogleProfile(profile)) return res.status(401).json({ error: GOOGLE_EMAIL_NOT_VERIFIED });
    const { email, name, picture } = profile;
    if (!email) return res.status(400).json({ error: 'No email in Google account' });

    const existing = byEmail.get(email);
    if (existing) {
      if (shouldAdoptPicture(picture, existing)) setAvatar.run(picture, existing.id);
      return res.json(sessions.afterFirstFactor(existing.id));
    }

    // A new account: the invite counts toward the IP lockout, as for register.
    const at = now();
    const outcome = await lockout.attempt(publicKeys(req.ip), at, () => invites.isUsable(code, at));
    if (outcome === 'locked') return tooManyAttempts(res);
    if (outcome === 'failed') return inviteRequired(res);
    // Google accounts get an unguessable password so the password login stays closed.
    const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
    const userId = redeem(res, code, now(), (role) =>
      insertGoogleUser.run(googleAccountName(name, email), email, hash, picture || null, role).lastInsertRowid);
    if (userId !== null) res.status(201).json(sessions.afterFirstFactor(userId));
  });

  return r;
}
