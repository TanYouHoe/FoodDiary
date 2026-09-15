// Connector: the browser's only HTTP client. Knows every URL and header, and
// maps response bodies into the shapes the screens use.

import { getToken } from './token-store.js';

const API = '/api';

// Every request names the browser's IANA time zone, so the server reads meal
// periods and weekdays where the user is.
function commonHeaders() {
  const token = getToken();
  return {
    'X-Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...commonHeaders() },
    ...options,
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

const send = (method, url, data) => request(url, { method, body: JSON.stringify(data) });

function query(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
  const q = qs.toString();
  return q ? `?${q}` : '';
}

function uploadForm(url, form) {
  return fetch(url, {
    method: 'POST',
    headers: commonHeaders(),
    body: form,
  }).then(r => r.json());
}

// A meal's photo list travels as a JSON string.
function parsePhotoUrls(value) {
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

const toMeal = ({ photo_urls, ...meal }) => ({ ...meal, photos: parsePhotoUrls(photo_urls) });

export const api = {
  // Auth
  register: (data) => send('POST', `${API}/auth/register`, data),
  login: (data) => send('POST', `${API}/auth/login`, data),
  googleLogin: (credential, invite_code) => send('POST', `${API}/auth/google`, { credential, invite_code }),
  getMe: () => request(`${API}/auth/me`),

  // Account invites (sign-up links; not group invite codes)
  checkAccountInvite: (code) => send('POST', `${API}/invites/check`, { code }),
  getAccountInvites: () => request(`${API}/invites`),
  createAccountInvite: () => send('POST', `${API}/invites`, {}),
  revokeAccountInvite: (id) => request(`${API}/invites/${id}`, { method: 'DELETE' }),

  // Meal Types
  getMealTypes: (params) => request(`${API}/meal-types${query(params)}`),
  createMealType: (data) => send('POST', `${API}/meal-types`, data),
  updateMealType: (id, data) => send('PUT', `${API}/meal-types/${id}`, data),
  deleteMealType: (id) => request(`${API}/meal-types/${id}`, { method: 'DELETE' }),

  // Dish Types
  getDishTypes: () => request(`${API}/dish-types`),
  createDishType: (data) => send('POST', `${API}/dish-types`, data),
  updateDishType: (id, data) => send('PUT', `${API}/dish-types/${id}`, data),
  deleteDishType: (id) => request(`${API}/dish-types/${id}`, { method: 'DELETE' }),

  // Restaurants
  getRestaurants: (params) => request(`${API}/restaurants${query(params)}`),
  createRestaurant: (data) => send('POST', `${API}/restaurants`, data),
  updateRestaurant: (id, data) => send('PUT', `${API}/restaurants/${id}`, data),
  uploadRestaurantPhoto: (id, file) => {
    const form = new FormData();
    form.append('photo', file);
    return uploadForm(`${API}/restaurants/${id}/photo`, form);
  },
  deleteRestaurant: (id) => request(`${API}/restaurants/${id}`, { method: 'DELETE' }),

  // Meals
  getMeals: async (params) => (await request(`${API}/meals${query(params)}`)).map(toMeal),
  createMeal: async (data) => toMeal(await send('POST', `${API}/meals`, data)),
  uploadMealPhotos: (id, files) => {
    const form = new FormData();
    files.forEach(f => form.append('photos', f));
    return uploadForm(`${API}/meals/${id}/photos`, form);
  },
  updateMeal: async (id, data) => toMeal(await send('PUT', `${API}/meals/${id}`, data)),
  deleteMeal: (id) => request(`${API}/meals/${id}`, { method: 'DELETE' }),
  getDishes: () => request(`${API}/dishes`),

  // Groups
  getGroups: () => request(`${API}/groups`),
  createGroup: (name) => send('POST', `${API}/groups`, { name }),
  getGroupMembers: (id) => request(`${API}/groups/${id}/members`),
  joinGroup: (invite_code) => send('POST', `${API}/groups/join`, { invite_code }),

  // Planned
  getPlanned: (group_id) => request(`${API}/planned${query({ group_id })}`),
  createPlanned: (data) => send('POST', `${API}/planned`, data),
  deletePlanned: (id) => request(`${API}/planned/${id}`, { method: 'DELETE' }),

  // Profile
  getProfile: () => request(`${API}/profile`),

  // Suggestions
  getSuggestions: (params) => request(`${API}/suggest${query(params)}`),
};
