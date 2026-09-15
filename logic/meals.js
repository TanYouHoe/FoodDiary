// Logic: the rules for creating and changing a meal, and for its photos.

import { parseGroupId } from './accounts.js';
import { wallClockMs } from './meal-period.js';

export const PHOTO_TYPE = /^image\/(jpeg|png|webp)$/;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_MEAL_PHOTOS = 10;

export const isAcceptedPhotoType = (mimeType) => PHOTO_TYPE.test(mimeType);

// The browser offers any image; the server accepts only PHOTO_TYPE.
// A wider budget on the client, so it never refuses a file the server takes.
export const isImageFile = (file) => file.type.startsWith('image/');

// A visit time is an instant: a strict ISO 8601 date-time with seconds, an
// optional fraction, and 'Z' or ±HH:MM, or its meal period would depend on the
// machine that reads it. An impossible date or time is refused. The value is
// returned as a UTC ISO string, so stored visit times sort as text in time order.
const DATE_TIME = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?';
const ZONED_VISIT_TIME = new RegExp(`^(${DATE_TIME})(?:Z|([+-])(\\d{2}):(\\d{2}))$`);
const ZONELESS_VISIT_TIME = new RegExp(`^${DATE_TIME}$`);
const INVALID_VISIT_TIME = { ok: false, error: 'Invalid visit time' };

export function checkVisitTime(visitedAt) {
  if (typeof visitedAt !== 'string') return INVALID_VISIT_TIME;
  if (ZONELESS_VISIT_TIME.test(visitedAt)) {
    return wallClockMs(visitedAt) === null ? INVALID_VISIT_TIME : { ok: false, error: 'Visit time must include a time zone' };
  }
  const m = ZONED_VISIT_TIME.exec(visitedAt);
  if (!m) return INVALID_VISIT_TIME;
  const wall = wallClockMs(m[1]);
  const [sign, offsetHours, offsetMinutes] = [m[2], Number(m[3] ?? 0), Number(m[4] ?? 0)];
  if (wall === null || offsetHours > 23 || offsetMinutes > 59) return INVALID_VISIT_TIME;
  const offsetMs = (sign === '-' ? -1 : 1) * (offsetHours * 60 + offsetMinutes) * 60000;
  return { ok: true, value: new Date(wall - offsetMs).toISOString() };
}

export function checkNewMeal(body) {
  const { restaurant_id, group_id, title, calories, dishes, rating, notes, visited_at } = body;
  if (!restaurant_id || !rating || !visited_at) {
    return { ok: false, error: 'Restaurant, rating, and visit date required' };
  }
  const visit = checkVisitTime(visited_at);
  if (!visit.ok) return visit;
  const group = parseGroupId(group_id);
  if (!group.ok) return group;
  return {
    ok: true,
    value: {
      restaurant_id,
      group_id: group.value,
      title: title || null,
      calories: calories || null,
      rating,
      notes: notes || null,
      visited_at: visit.value,
      dishes: Array.isArray(dishes) ? dishes : [],
    },
  };
}

// A partial update. `fields` holds only the fields the body names, in a fixed
// order; `dishes` is null when the dish list is left alone.
export function toMealPatch(body) {
  const { restaurant_id, title, calories, dishes, rating, notes, visited_at, group_id } = body;
  const fields = {};
  if (restaurant_id != null) fields.restaurant_id = restaurant_id;
  if (title !== undefined) fields.title = title || null;
  if (calories !== undefined) fields.calories = calories || null;
  if (rating != null) fields.rating = rating;
  if (notes !== undefined) fields.notes = notes;
  if (visited_at !== undefined) {
    const visit = checkVisitTime(visited_at);
    if (!visit.ok) return visit;
    fields.visited_at = visit.value;
  }
  if (group_id !== undefined) {
    const group = parseGroupId(group_id);
    if (!group.ok) return group;
    fields.group_id = group.value;
  }
  const replaceDishes = Array.isArray(dishes);
  if (Object.keys(fields).length === 0 && !replaceDishes) {
    return { ok: false, error: 'Nothing to update' };
  }
  return { ok: true, value: { fields, dishes: replaceDishes ? dishes : null } };
}

// A stored meal's photo URLs plus newly uploaded ones. Refuses when the total
// would pass the limit, so the caller can discard the new files.
export function mergeMealPhotos(existing, added, max) {
  const all = [...existing, ...added];
  if (all.length > max) return { ok: false, error: `A meal can have at most ${max} photos` };
  return { ok: true, value: all };
}

// Adds picked photos to a pending list, up to the per-meal limit.
export function addPhotos(pending, picked) {
  return [...pending, ...picked].slice(0, MAX_MEAL_PHOTOS);
}

// The log-a-meal dialog. Returns an error or null.
export function checkMealForm(form) {
  return form.restaurantId ? null : 'Please select a restaurant';
}

// The meal form in the log / edit dialogs -> API body.
// visitedAt: an ISO timestamp built by the caller from the date and time fields.
export function mealFormToInput(form, visitedAt) {
  return {
    restaurant_id: Number(form.restaurantId),
    title: form.title.trim() || null,
    calories: form.calories ? Number(form.calories) : null,
    dishes: form.dishes,
    rating: form.rating,
    notes: form.notes.trim() || null,
    visited_at: visitedAt,
    group_id: form.groupId ? Number(form.groupId) : null,
  };
}
