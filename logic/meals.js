// Logic: the rules for creating and changing a meal, and for its photos.

export const PHOTO_TYPE = /^image\/(jpeg|png|webp)$/;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_MEAL_PHOTOS = 10;

export const isAcceptedPhotoType = (mimeType) => PHOTO_TYPE.test(mimeType);

// The browser offers any image; the server accepts only PHOTO_TYPE.
// A wider budget on the client, so it never refuses a file the server takes.
export const isImageFile = (file) => file.type.startsWith('image/');

export function checkNewMeal(body) {
  const { restaurant_id, group_id, title, calories, dishes, rating, notes, visited_at } = body;
  if (!restaurant_id || !rating || !visited_at) {
    return { ok: false, error: 'Restaurant, rating, and visit date required' };
  }
  return {
    ok: true,
    value: {
      restaurant_id,
      group_id: group_id || null,
      title: title || null,
      calories: calories || null,
      rating,
      notes: notes || null,
      visited_at,
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
  if (visited_at !== undefined) fields.visited_at = visited_at;
  if (group_id !== undefined) fields.group_id = group_id || null;
  const replaceDishes = Array.isArray(dishes);
  if (Object.keys(fields).length === 0 && !replaceDishes) {
    return { ok: false, error: 'Nothing to update' };
  }
  return { ok: true, value: { fields, dishes: replaceDishes ? dishes : null } };
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
