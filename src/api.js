// Connector: the browser's only HTTP client. Knows every URL and header, and
// maps response bodies into the shapes the screens use.

import { getToken } from './token-store.js';
import { APP_BUILD } from './config.js';
import { MFA_ENROLL_REQUIRED } from '../logic/two-factor.js';
import { isNewBuild, BUILD_HEADER } from '../logic/app-build.js';

const API = '/api';

// Listeners told when the server answers that the user must set up an authenticator.
const enrollListeners = new Set();

// Returns a function that removes the listener.
export function onEnrollRequired(listener) {
  enrollListeners.add(listener);
  return () => enrollListeners.delete(listener);
}

// body: a parsed response body. Tells the listeners when it asks for setup.
function notifyIfEnrollRequired(body) {
  if (body?.code === MFA_ENROLL_REQUIRED.code) enrollListeners.forEach(listener => listener());
}

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
  notifyIfNewBuild(res);
  if (res.status === 204) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    notifyIfEnrollRequired(body);
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
    headers: commonHeaders(),
    body: form,
  }).then(async (r) => {
    notifyIfNewBuild(r);
    const body = await r.json();
    notifyIfEnrollRequired(body);
    return body;
  });
}

// A meal's photo list travels as a JSON string.
function parsePhotoUrls(value) {
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

const toMeal = ({ photo_urls, ...meal }) => ({ ...meal, photos: parsePhotoUrls(photo_urls) });

// { code } or { backupCode } (or nothing) as the request body the server reads.
function factorBody({ code, backupCode } = {}) {
  if (backupCode) return { backup_code: backupCode };
  return code ? { code } : {};
}

export const api = {
  // Auth
  register: (data) => send('POST', `${API}/auth/register`, data),
  login: (data) => send('POST', `${API}/auth/login`, data),
  googleLogin: (credential, invite_code) => send('POST', `${API}/auth/google`, { credential, invite_code }),
  getMe: () => request(`${API}/auth/me`),
  // data: { mfa_token, code } or { mfa_token, backup_code }.
  verifyMfa: (data) => send('POST', `${API}/auth/mfa`, data),
  logoutAll: () => request(`${API}/auth/logout-all`, { method: 'POST' }),

  // Two-factor. proof: { code } or { backupCode }, needed only when replacing an enabled factor.
  setupTotp: async (proof) => {
    const body = await send('POST', `${API}/auth/totp/setup`, factorBody(proof));
    return { secret: body.secret, otpauthUrl: body.otpauth_url };
  },
  cancelTotpSetup: () => request(`${API}/auth/totp/cancel`, { method: 'POST' }),
  enableTotp: async (code) => {
    const body = await send('POST', `${API}/auth/totp/enable`, { code });
    return { backupCodes: body.backup_codes, token: body.token, user: body.user };
  },
  // proof: { code } or { backupCode }.
  regenerateBackupCodes: async (proof) => (await send('POST', `${API}/auth/totp/backup-codes`, factorBody(proof))).backup_codes,

  // Users (owner)
  getUsers: () => request(`${API}/users`),
  // proof: the owner's own { code } or { backupCode }.
  resetUserTotp: (id, proof) => send('POST', `${API}/users/${id}/totp/reset`, factorBody(proof)),

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
