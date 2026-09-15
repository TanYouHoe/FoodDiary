// UI: which records show a change control. `allow(user, record)` is a rule
// from logic/access.js; no rule is decided here.

// user: the signed-in user ({ id, role }) or null. Returns the allowed ids, in order.
export function allowedIds(user, records, allow) {
  return user ? records.filter(r => allow(user, r)).map(r => r.id) : [];
}
