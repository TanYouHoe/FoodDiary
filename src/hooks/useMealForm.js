// UI connector: the state behind the log-a-meal and edit-meal dialogs.
// The restaurant and group choices, the form values, new photos and status.

import { useState } from 'react';
import { api } from '../api.js';
import { usePhotoPicker } from './usePhotoPicker.js';

// initial: a form value, or a function that returns one
export function useMealForm(initial) {
  const [form, setForm] = useState(initial);
  const [restaurants, setRestaurants] = useState([]);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const photos = usePhotoPicker({ multiple: true });

  return {
    form,
    restaurants,
    groups,
    error,
    submitting,
    showAddRestaurant,
    photos,
    setField: (key, value) => setForm(f => ({ ...f, [key]: value })),
    reset: (next) => { setForm(next); photos.clear(); },
    setError,
    setSubmitting,
    setShowAddRestaurant,
    loadChoices: () => Promise.all([api.getRestaurants(), api.getGroups()]).then(([r, g]) => {
      setRestaurants(r);
      setGroups(g);
    }),
    reloadRestaurants: () => api.getRestaurants().then(setRestaurants),
  };
}

// The visit timestamp from the date and time fields, read in local time.
export const visitedAtOf = (form) => new Date(`${form.date}T${form.time}`).toISOString();
