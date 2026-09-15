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
// `user`; { groupMeals, groupPlanned } — rows in any group, whoever wrote them,
// because the other members see those rows. The owner may always delete; the
// adder only while none of these rows exist.
export function canDeleteRestaurant(user, restaurant, { otherUsersMeals, otherUsersPlanned, groupMeals, groupPlanned }) {
  if (isOwner(user)) return true;
  return restaurant.added_by === user.id
    && otherUsersMeals === 0 && otherUsersPlanned === 0
    && groupMeals === 0 && groupPlanned === 0;
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

export const OWN_FACTOR_RESET = 'Replace your own authenticator in Security settings';

// The user list (with two-factor status) is for the owner.
export function canListUsers(user) {
  return isOwner(user);
}

// Resetting another user's second factor: the owner only, and never their own
// (an owner who lost it cannot sign in to do it anyway; with it they replace it).
// targetId: the user id to reset. Returns the refusal text, or null.
export function totpResetRefusal(user, targetId) {
  if (!isOwner(user)) return NOT_ALLOWED;
  return targetId === user.id ? OWN_FACTOR_RESET : null;
}

// users: [{ id, role }]. hadUsersBeforeInvites: the database held users when
// account invites arrived. Only such a database promotes: the lowest id becomes
// owner when nobody is. A newer database gets its owner from an owner invite,
// so no stranger who signed up first becomes owner.
// Returns that id, or null when no change is needed.
export function ownerToPromote(users, { hadUsersBeforeInvites = false } = {}) {
  if (!hadUsersBeforeInvites) return null;
  if (users.length === 0 || users.some(isOwner)) return null;
  return Math.min(...users.map(u => u.id));
}

// The whole at-open decision. promoteId: as ownerToPromote. endLegacy: the
// legacy rule is spent once the database has an owner (promoted now or
// already there), so a later ownerless state never promotes an invited stranger.
export function ownerPromotion(users, { hadUsersBeforeInvites = false } = {}) {
  const promoteId = ownerToPromote(users, { hadUsersBeforeInvites });
  const endLegacy = hadUsersBeforeInvites && (promoteId !== null || users.some(isOwner));
  return { promoteId, endLegacy };
}
