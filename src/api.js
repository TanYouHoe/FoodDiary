// Connector: the browser's only HTTP client. Knows every URL and header, and
// maps response bodies into the shapes the screens use.

import { APP_BUILD } from './config.js';
import { isNewBuild, BUILD_HEADER } from '../logic/app-build.js';

const API = '/api';

// Listeners told when the server answers from a different build than this page.
const buildListeners = new Set();
let announcedBuild = null; // told once per server build, not on every answer

// Returns a function that removes the listener.
export function onNewBuild(listener) {
  buildListeners.add(listener);
  return () => buildListeners.delete(listener);
}

// res: a fetch Response. Tells the listeners about a new server build.
function notifyIfNewBuild(res) {
  const serverBuild = res.headers.get(BUILD_HEADER);
  if (!isNewBuild(APP_BUILD, serverBuild) || serverBuild === announcedBuild) return;
  announcedBuild = serverBuild;
  buildListeners.forEach(listener => listener(serverBuild));
}

// Every request names the browser's IANA time zone, so the server reads meal
// periods and weekdays where the user is.
function commonHeaders() {
  return { 'X-Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone };
}

// The session is an HttpOnly cookie the shared auth module sets, so every
// request carries it by asking for same-origin credentials. There is no token
// for this app to hold, and none for a script to steal.
async function request(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...commonHeaders() },
    ...options,
  });
  notifyIfNewBuild(res);
  if (res.status === 204) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    const err = new Error(body.error);
    err.status = res.status;
    err.code = body.code;
    throw err;
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
    credentials: 'same-origin',
    headers: commonHeaders(),
    body: form,
  }).then(async (r) => {
    notifyIfNewBuild(r);
    return r.json();
  });
}

// A meal's photo list travels as a JSON string.
function parsePhotoUrls(value) {
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

const toMeal = ({ photo_urls, ...meal }) => ({ ...meal, photos: parsePhotoUrls(photo_urls) });

export const api = {
  // The signed-in person as this app knows them: the row meals and groups hang
  // off. Sign-in, accounts and roles are the shared module's, at /api/auth, and
  // are reached through family-auth/react — never from here.
  getMe: () => request(`${API}/me`),

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
