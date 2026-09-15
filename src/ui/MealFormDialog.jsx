// UI: the log-a-meal and edit-meal dialogs. One form, two framings.
// mode 'add': a <form> that submits. mode 'edit': Cancel resets, Save saves.
// Slots: `photos` (the picker), `dishEditor`, `restaurantDialog`.

import StarPicker from './StarPicker.jsx';
import { AiIcon } from './icons.jsx';

export default function MealFormDialog({
  mode, heading, form, restaurants, groups, error, submitting,
  photos, dishEditor, restaurantDialog,
  onField, onNewRestaurant, onSubmit, onCancel, onClose,
}) {
  const isAdd = mode === 'add';
  const id = (name) => `${isAdd ? 'modal' : 'edit'}-meal-${name}`;

  const fields = (
    <>
      {error && <div className="error-message">{error}</div>}

      {photos}

      <div className="form-group">
        <label htmlFor={id('title')}>Meal Title</label>
        <div className="input-with-action">
          <input
            id={id('title')}
            type="text"
            value={form.title}
            onChange={(e) => onField('title', e.target.value)}
            placeholder="e.g. Birthday dinner, Nasi Lemak Set A (optional)"
          />
          <button type="button" className="btn-ai" title="Auto-suggest meal title with AI" disabled>
            <AiIcon />
            AI
          </button>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor={id('restaurant')}>{isAdd ? 'Restaurant *' : 'Restaurant'}</label>
        <div className="input-with-action">
          <select
            id={id('restaurant')}
            value={form.restaurantId}
            onChange={(e) => onField('restaurantId', e.target.value)}
            required={isAdd}
          >
            {isAdd && <option value="">Select a restaurant</option>}
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button type="button" className="btn-secondary btn-sm" onClick={onNewRestaurant}>
            + New
          </button>
        </div>
      </div>

      {restaurantDialog}

      <div className="form-group">
        <label>Dishes</label>
        {dishEditor}
      </div>

      <div className="form-group">
        <label>Rating</label>
        <StarPicker value={form.rating} onChange={(v) => onField('rating', v)} />
      </div>

      <div className="form-group">
        <label htmlFor={id('calories')}>Calories</label>
        <input
          id={id('calories')}
          type="number"
          min="0"
          value={form.calories}
          onChange={(e) => onField('calories', e.target.value)}
          placeholder="e.g. 650 (optional)"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor={id('date')}>Date</label>
          <input id={id('date')} type="date" value={form.date} onChange={(e) => onField('date', e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor={id('time')}>Time</label>
          <input id={id('time')} type="time" value={form.time} onChange={(e) => onField('time', e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor={id('notes')}>Notes</label>
        <textarea
          id={id('notes')}
          value={form.notes}
          onChange={(e) => onField('notes', e.target.value)}
          placeholder="How was the food? (optional)"
          rows={2}
        />
      </div>

      <div className="form-group">
        <label htmlFor={id('group')}>Group</label>
        <select id={id('group')} value={form.groupId} onChange={(e) => onField('groupId', e.target.value)}>
          <option value="">Personal</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>
    </>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{heading}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {isAdd ? (
          <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
            {fields}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : 'Log Meal'}
              </button>
            </div>
          </form>
        ) : (
          <>
            {fields}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
              <button type="button" className="btn-primary" onClick={onSubmit} disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
