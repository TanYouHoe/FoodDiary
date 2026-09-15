// UI: the planned visits page. A group switch, the add form and the list.
// removableIds: ids of the planned visits that show a Remove button.

import { toPlannedRows } from './lists.js';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function PlannedView({
  loading, error, planned, removableIds, restaurants, groups, groupId, form, submitting,
  onGroup, onField, onAdd, onRemove,
}) {
  if (loading) return <div className="loading">Loading planned visits...</div>;

  const rows = toPlannedRows(planned, restaurants);

  return (
    <div className="planned-page">
      <div className="page-header">
        <h2>Planned Visits</h2>
        <div className="group-toggle">
          <select value={groupId} onChange={(e) => onGroup(e.target.value)} className="filter-select">
            <option value="">Personal</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); onAdd(); }}>
        <h3>Add to Planned</h3>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="planned-restaurant">Restaurant *</label>
            <select
              id="planned-restaurant"
              value={form.restaurantId}
              onChange={(e) => onField('restaurantId', e.target.value)}
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
            <select id="planned-priority" value={form.priority} onChange={(e) => onField('priority', e.target.value)}>
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
            value={form.notes}
            onChange={(e) => onField('notes', e.target.value)}
            placeholder="Any notes? (optional)"
            rows={2}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Adding...' : 'Add to Planned'}
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>No planned visits yet. Add one above!</p>
        </div>
      ) : (
        <div className="planned-list">
          {rows.map((p) => (
            <div key={p.id} className="planned-row">
              <div className="planned-info">
                <span className="planned-name">{p.name}</span>
                {p.cuisine && <span className="badge badge-cuisine">{p.cuisine}</span>}
                <span className={`badge ${p.priorityClass}`}>{p.priority}</span>
                {p.notes && <span className="planned-notes">{p.notes}</span>}
              </div>
              {removableIds.includes(p.id) && (
                <button className="btn-danger btn-sm" onClick={() => onRemove(p.id)}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
