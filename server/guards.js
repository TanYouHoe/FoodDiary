// Connector: looks up what an access rule needs and turns a refusal into a
// status code. Placed before any write and before any upload middleware, so a
// refused request stores nothing. The rules themselves are logic/access.js.

import { canUseGroup } from '../logic/access.js';

export const notFound = (res, error = 'Not found') => res.status(404).json({ error });
export const notAllowed = (res) => res.status(403).json({ error: 'Not allowed' });

// find: (id) => row or undefined. allowed: (user, row) => boolean.
// Answers 404 or 403, or sets req.record and continues.
export function guardRecord(find, allowed) {
  return (req, res, next) => {
    const row = find(req.params.id);
    if (!row) return notFound(res);
    if (!allowed(req.user, row)) return notAllowed(res);
    req.record = row;
    next();
  };
}

// Returns groupAllowed(groupId, userId) => boolean. groupId may be null.
export function makeGroupAccess(db) {
  const membership = db.prepare('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?');
  return (groupId, userId) => canUseGroup(groupId, groupId ? membership.get(groupId, userId) : undefined);
}
