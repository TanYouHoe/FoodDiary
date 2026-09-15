// Logic: who may change what. Each rule takes the signed-in user
// ({ id, role }) and the stored record, and answers true or false, or names
// the refusal. The connector finds the record and turns a refusal into a
// status code.

import { builtInLockError } from './catalog.js';

export const USER_ROLES = { owner: 'owner', member: 'member' };

export const NOT_ALLOWED = 'Not allowed';
export const RESTAURANT_IN_USE = 'Restaurant is used by other people';

const isOwner = (user) => user.role === USER_ROLES.owner;

// Restaurants are shared: the user who added one, or the owner.
export function canChangeRestaurant(user, restaurant) {
  return isOwner(user) || restaurant.added_by === user.id;
}

// Deleting a restaurant also deletes every meal and planned visit there.
// usage: { otherUsersMeals, otherUsersPlanned } — rows of users other than
// `user`. The owner may always delete; the adder only while nobody else uses it.
export function canDeleteRestaurant(user, restaurant, { otherUsersMeals, otherUsersPlanned }) {
  if (isOwner(user)) return true;
  return restaurant.added_by === user.id && otherUsersMeals === 0 && otherUsersPlanned === 0;
}

// A meal is personal: only the user who logged it.
export function canChangeMeal(user, meal) {
  return meal.user_id === user.id;
}

export function canDeletePlanned(user, planned) {
  return planned.user_id === user.id;
}

// A custom meal type or dish type: its creator, or the owner. A NULL creator
// never equals a user id, so such an entry belongs to the owner only.
export function canChangeCatalogEntry(user, entry) {
  return isOwner(user) || entry.created_by === user.id;
}

// kind: 'meal' | 'dish'; action: 'edit' | 'delete'. The built-in lock comes
// first, then the creator / owner rule. Returns the refusal text, or null.
export function catalogChangeRefusal(user, entry, kind, action) {
  return builtInLockError(entry, kind, action) ?? (canChangeCatalogEntry(user, entry) ? null : NOT_ALLOWED);
}

// groupId: a parsed group id (parseGroupId in accounts.js), or null for personal data.
// membership: the user's membership row in that group, or undefined.
export function canUseGroup(groupId, membership) {
  return groupId === null || Boolean(membership);
}

// users: [{ id, role }]. The lowest id becomes owner when nobody is.
// Returns that id, or null when no change is needed.
export function ownerToPromote(users) {
  if (users.length === 0 || users.some(isOwner)) return null;
  return Math.min(...users.map(u => u.id));
}
