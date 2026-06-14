import { useState, useEffect } from 'react';
import { api } from '../api';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

function priorityClass(p) {
  if (p === 'high') return 'badge-priority-high';
  if (p === 'medium') return 'badge-priority-medium';
  return 'badge-priority-low';
}

function priorityOrder(p) {
  if (p === 'high') return 0;
  if (p === 'medium') return 1;
  return 2;
}

export default function Planned() {
  const [planned, setPlanned] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [restaurantId, setRestaurantId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Group toggle
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pData, rData, gData] = await Promise.all([
        api.getPlanned(selectedGroupId || undefined),
        api.getRestaurants(),
        api.getGroups(),
      ]);
      const items = pData.planned || pData || [];
      items.sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority));
      setPlanned(items);
      setRestaurants(rData.restaurants || rData || []);
      setGroups(gData.groups || gData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedGroupId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!restaurantId) {
      setError('Please select a restaurant');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const data = {
        restaurant_id: Number(restaurantId),
        priority,
        notes: notes.trim() || null,
      };
      if (selectedGroupId) data.group_id = Number(selectedGroupId);
      await api.createPlanned(data);
      setRestaurantId('');
      setPriority('medium');
      setNotes('');
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this planned visit?')) return;
    try {
      await api.deletePlanned(id);
      await fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const restaurantName = (id) => {
    const r = restaurants.find((r) => r.id === id);
    return r ? r.name : 'Unknown';
  };

  const restaurantCuisine = (id) => {
    const r = restaurants.find((r) => r.id === id);
    return r ? r.cuisine_type : null;
  };

  if (loading) return <div className="loading">Loading planned visits...</div>;

  return (
    <div className="planned-page">
      <div className="page-header">
        <h2>Planned Visits</h2>
        <div className="group-toggle">
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="filter-select"
          >
            <option value="">Personal</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <form className="inline-form" onSubmit={handleAdd}>
        <h3>Add to Planned</h3>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="planned-restaurant">Restaurant *</label>
            <select
              id="planned-restaurant"
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              required
            >
              <option value="">Select a restaurant</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="planned-priority">Priority</label>
            <select
              id="planned-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="planned-notes">Notes</label>
          <textarea
            id="planned-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes? (optional)"
            rows={2}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Adding...' : 'Add to Planned'}
        </button>
      </form>

      {planned.length === 0 ? (
        <div className="empty-state">
          <p>No planned visits yet. Add one above!</p>
        </div>
      ) : (
        <div className="planned-list">
          {planned.map((p) => (
            <div key={p.id} className="planned-row">
              <div className="planned-info">
                <span className="planned-name">
                  {p.restaurant_name || restaurantName(p.restaurant_id)}
                </span>
                {(p.cuisine_type || restaurantCuisine(p.restaurant_id)) && (
                  <span className="badge badge-cuisine">
                    {p.cuisine_type || restaurantCuisine(p.restaurant_id)}
                  </span>
                )}
                <span className={`badge ${priorityClass(p.priority)}`}>
                  {p.priority}
                </span>
                {p.notes && <span className="planned-notes">{p.notes}</span>}
              </div>
              <button
                className="btn-danger btn-sm"
                onClick={() => handleDelete(p.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
