const API = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(url, options = {}) {
  const token = getToken();
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export const api = {
  // Auth
  register: (data) => request(`${API}/auth/register`, { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request(`${API}/auth/login`, { method: 'POST', body: JSON.stringify(data) }),
  googleLogin: (credential) => request(`${API}/auth/google`, { method: 'POST', body: JSON.stringify({ credential }) }),
  getMe: () => request(`${API}/auth/me`),

  // Meal Types
  getMealTypes: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const query = qs.toString();
    return request(`${API}/meal-types${query ? '?' + query : ''}`);
  },
  createMealType: (data) => request(`${API}/meal-types`, { method: 'POST', body: JSON.stringify(data) }),
  updateMealType: (id, data) => request(`${API}/meal-types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMealType: (id) => request(`${API}/meal-types/${id}`, { method: 'DELETE' }),

  // Dish Types
  getDishTypes: () => request(`${API}/dish-types`),
  createDishType: (data) => request(`${API}/dish-types`, { method: 'POST', body: JSON.stringify(data) }),
  updateDishType: (id, data) => request(`${API}/dish-types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDishType: (id) => request(`${API}/dish-types/${id}`, { method: 'DELETE' }),

  // Restaurants
  getRestaurants: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const query = qs.toString();
    return request(`${API}/restaurants${query ? '?' + query : ''}`);
  },
  createRestaurant: (data) => request(`${API}/restaurants`, { method: 'POST', body: JSON.stringify(data) }),
  updateRestaurant: (id, data) => request(`${API}/restaurants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  uploadRestaurantPhoto: (id, file) => {
    const form = new FormData();
    form.append('photo', file);
    return fetch(`${API}/restaurants/${id}/photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    }).then(r => r.json());
  },
  deleteRestaurant: (id) => request(`${API}/restaurants/${id}`, { method: 'DELETE' }),

  // Meals
  getMeals: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const query = qs.toString();
    return request(`${API}/meals${query ? '?' + query : ''}`);
  },
  createMeal: (data) => request(`${API}/meals`, { method: 'POST', body: JSON.stringify(data) }),
  uploadMealPhotos: (id, files) => {
    const form = new FormData();
    files.forEach(f => form.append('photos', f));
    return fetch(`${API}/meals/${id}/photos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    }).then(r => r.json());
  },
  updateMeal: (id, data) => request(`${API}/meals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMeal: (id) => request(`${API}/meals/${id}`, { method: 'DELETE' }),
  getDishes: () => request(`${API}/dishes`),

  // Groups
  getGroups: () => request(`${API}/groups`),
  createGroup: (name) => request(`${API}/groups`, { method: 'POST', body: JSON.stringify({ name }) }),
  getGroupMembers: (id) => request(`${API}/groups/${id}/members`),
  joinGroup: (invite_code) => request(`${API}/groups/join`, { method: 'POST', body: JSON.stringify({ invite_code }) }),

  // Planned
  getPlanned: (group_id) => request(`${API}/planned${group_id ? '?group_id=' + group_id : ''}`),
  createPlanned: (data) => request(`${API}/planned`, { method: 'POST', body: JSON.stringify(data) }),
  deletePlanned: (id) => request(`${API}/planned/${id}`, { method: 'DELETE' }),

  // Profile
  getProfile: () => request(`${API}/profile`),

  // Suggestions
  getSuggestions: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const query = qs.toString();
    return request(`${API}/suggest${query ? '?' + query : ''}`);
  },
};
