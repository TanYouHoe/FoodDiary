// Connector: the owner's user list and two-factor recovery. The rules (owner
// only, never your own factor) are logic/access.js; the store is server/two-factor.js.

import { Router } from 'express';
import { canListUsers, totpResetRefusal } from '../../logic/access.js';
import { notAllowed, notFound } from '../guards.js';
import { pick, USER_LIST_FIELDS } from '../rows.js';

// Mounted at /api/users behind authenticate.
export function userRoutes({ db, twoFactor }) {
  const r = Router();
  const list = db.prepare('SELECT id, name, email, role, totp_enabled_at, created_at FROM users ORDER BY id');
  const exists = db.prepare('SELECT 1 FROM users WHERE id = ?');

  r.get('/', (req, res) => {
    if (!canListUsers(req.user)) return notAllowed(res);
    res.json(list.all().map(row => ({ ...pick(row, USER_LIST_FIELDS), totp_enabled: Boolean(row.totp_enabled_at) })));
  });

  // Clears the user's factor and backup codes and ends their sessions.
  r.post('/:id/totp/reset', (req, res) => {
    const targetId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    const refusal = totpResetRefusal(req.user, targetId);
    if (refusal) return notAllowed(res, refusal);
    if (targetId === null || !exists.get(targetId)) return notFound(res);
    twoFactor.clear(targetId);
    res.status(204).end();
  });

  return r;
}
