// Connector: account invites. The check is public; create, list and revoke
// are for the owner. The rules are logic/invites.js; the store is server/invites.js.

import { Router } from 'express';
import { USER_ROLES } from '../../logic/access.js';
import { canManageInvites, inviteRevokeRefusal } from '../../logic/invites.js';
import { createInvite, inviteUrl } from '../invites.js';
import { notAllowed, notFound } from '../guards.js';

// publicOrigin: the origin links are built on, or null for the request's own origin.
export function inviteRoutes({ db, invites, authenticate, now, publicOrigin }) {
  const r = Router();

  // Answers only whether the code works now.
  r.get('/check/:code', (req, res) => res.json({ valid: invites.isUsable(req.params.code, now()) }));

  r.use(authenticate, (req, res, next) => (canManageInvites(req.user) ? next() : notAllowed(res)));

  // Invites made here are member invites; the first owner comes from tools/create-invite.js.
  r.post('/', (req, res) => {
    const result = createInvite(db, { role: USER_ROLES.member, createdBy: req.user.id, now: now() });
    if (!result.ok) return res.status(409).json({ error: result.error });
    const origin = publicOrigin || `${req.protocol}://${req.get('host')}`;
    res.status(201).json({ ...result.invite, url: inviteUrl(origin, result.invite.code) });
  });

  r.get('/', (req, res) => res.json(invites.list(now())));

  r.delete('/:id', (req, res) => {
    const invite = invites.find(req.params.id);
    if (!invite) return notFound(res);
    const refusal = inviteRevokeRefusal(invite);
    if (refusal) return res.status(409).json({ error: refusal });
    invites.revoke(invite.id, now());
    res.status(204).end();
  });

  return r;
}
