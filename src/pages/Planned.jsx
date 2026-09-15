// UI connector: the planned visits page. Loads the list for the chosen group,
// adds and removes planned visits.

import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext.jsx';
import { sortByPriority, checkPlannedForm, DEFAULT_PRIORITY } from '../../logic/planned.js';
import { canDeletePlanned } from '../../logic/access.js';
import { allowedIds } from '../ui/access.js';
import PlannedView from '../ui/PlannedView.jsx';

const emptyForm = { restaurantId: '', priority: DEFAULT_PRIORITY, notes: '' };

export default function Planned() {
  const { user } = useAuth();
  const [planned, setPlanned] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [groupId, setGroupId] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [p, r, g] = await Promise.all([
        api.getPlanned(groupId || undefined),
        api.getRestaurants(),
        api.getGroups(),
      ]);
      setPlanned(sortByPriority(p));
      setRestaurants(r);
      setGroups(g);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [groupId]);

  const add = async () => {
    const input = checkPlannedForm(form, groupId);
    if (!input.ok) {
      setError(input.error);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.createPlanned(input.value);
      setForm(emptyForm);
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Remove this planned visit?')) return;
    try {
      await api.deletePlanned(id);
      await fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <PlannedView
      loading={loading}
      error={error}
      planned={planned}
      removableIds={allowedIds(user, planned, canDeletePlanned)}
      restaurants={restaurants}
      groups={groups}
      groupId={groupId}
      form={form}
      submitting={submitting}
      onGroup={setGroupId}
      onField={(key, value) => setForm(f => ({ ...f, [key]: value }))}
      onAdd={add}
      onRemove={remove}
    />
  );
}
