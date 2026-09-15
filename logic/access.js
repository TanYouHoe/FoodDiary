// Logic: who may change what. Each rule takes the signed-in user
// ({ id, role }) and the stored record, and answers true or false.
// The connector finds the record and turns a refusal into a status code.

export const USER_ROLES = { owner: 'owner', member: 'member' };

const isOwner = (user) => user.role === USER_ROLES.owner;

// Restaurants are shared: the user who added one, or the owner.
export function canChangeRestaurant(user, restaurant) {
  return isOwner(user) || restaurant.added_by === user.id;
}

// A meal is personal: only the user who logged it.
export function canChangeMeal(user, meal) {
  return meal.user_id === user.id;
}

export function canDeletePlanned(user, planned) {
  return planned.user_id === user.id;
}

// A custom meal type or dish type: its creator, or the owner. An entry with
// no recorded creator belongs to the owner only. Built-in entries are locked
// before this rule is asked (builtInLockError in catalog.js).
export function canChangeCatalogEntry(user, entry) {
  return isOwner(user) || (entry.created_by != null && entry.created_by === user.id);
}

// groupId: the group the request names, or null for personal data.
// membership: the user's membership row in that group, or undefined.
export function canUseGroup(groupId, membership) {
  return !groupId || Boolean(membership);
}

// users: [{ id, role }]. The lowest id becomes owner when nobody is.
// Returns that id, or null when no change is needed.
export function ownerToPromote(users) {
  if (users.length === 0 || users.some(isOwner)) return null;
  return Math.min(...users.map(u => u.id));
}
