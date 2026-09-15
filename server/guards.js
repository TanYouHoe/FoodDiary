// Connector: looks up what an access rule needs and turns a refusal into a
// status code. Placed before any write and before any upload middleware, so a
// refused request stores nothing. The rules themselves are logic/access.js.

import { canUseGroup, NOT_ALLOWED } from '../logic/access.js';

export const badRequest = (res, error) => res.status(400).json({ error });
export const notFound = (res, error = 'Not found') => res.status(404).json({ error });
export const notAllowed = (res, error = NOT_ALLOWED) => res.status(403).json({ error });

// Adapts a yes/no rule to a refusal function.
export const refuseUnless = (allowed) => (user, row) => (allowed(user, row) ? null : NOT_ALLOWED);

// find: (id) => row or undefined. refusal: (user, row) => null or refusal text.
// missing: the 404 message. Answers 404 or 403, or sets req.record and continues.
export function guardRecord(find, refusal, { missing = 'Not found' } = {}) {
  return (req, res, next) => {
    const row = find(req.params.id);
    if (!row) return notFound(res, missing);
    const refused = refusal(req.user, row);
    if (refused) return notAllowed(res, refused);
    req.record = row;
    next();
  };
}

// Returns groupAllowed(groupId, userId) => boolean. groupId: a parsed id or null
// (a NULL group_id matches no membership row).
export function makeGroupAccess(db) {
  const membership = db.prepare('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?');
  return (groupId, userId) => canUseGroup(groupId, membership.get(groupId, userId));
}
