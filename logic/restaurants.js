// Logic: restaurants, cuisines and price ranges.

export const CUISINES = ['Malay', 'Chinese', 'Indian', 'Western', 'Japanese', 'Korean', 'Thai', 'Italian', 'Other'];
export const PRICE_RANGES = [1, 2, 3, 4];
export const DEFAULT_PRICE_RANGE = 2;

const optional = (v) => v || null;

// A new restaurant, or the full replacement of one.
export function checkRestaurantInput(body) {
  const { name, cuisine_type, price_range, address, lat, lng } = body;
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) return { ok: false, error: 'Name required' };
  return {
    ok: true,
    value: {
      name: cleanName,
      cuisine_type: optional(cuisine_type),
      price_range: optional(price_range),
      address: optional(address),
      lat: optional(lat),
      lng: optional(lng),
    },
  };
}

// The restaurant form in the add / edit dialogs -> API body, or an error.
export function checkRestaurantForm({ name, cuisine, price, address }) {
  if (!name.trim()) return { ok: false, error: null };
  return {
    ok: true,
    value: {
      name: name.trim(),
      cuisine_type: cuisine.trim() || null,
      price_range: Number(price),
      address: address.trim() || null,
    },
  };
}

// Case-insensitive name match for the restaurant list search box.
export function matchesName(restaurant, search) {
  return restaurant.name.toLowerCase().includes(search.toLowerCase());
}
