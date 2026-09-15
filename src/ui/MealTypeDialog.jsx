// UI: the create / edit meal type dialog.

import { CUISINES } from '../../logic/restaurants.js';
import { CrossIcon } from './icons.jsx';

export default function MealTypeDialog({
  isEdit, form, dishTypes, error, submitting,
  onName, onCuisine, onSlotName, onAddSlot, onRemoveSlot, onSubmit, onClose,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Meal Type' : 'Create Meal Type'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="mt-name">Name *</label>
            <input
              id="mt-name"
              type="text"
              value={form.name}
              onChange={(e) => onName(e.target.value)}
              placeholder="e.g. Dim Sum, Ramen Set"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="mt-cuisine">Cuisine</label>
            <select id="mt-cuisine" value={form.cuisineType} onChange={(e) => onCuisine(e.target.value)}>
              <option value="">Any cuisine</option>
              {CUISINES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Slots</label>
            <div className="mt-slots-editor">
              {form.slots.map((slot, i) => (
                <div key={i} className="mt-slot-row">
                  <select value={slot.name} onChange={(e) => onSlotName(i, e.target.value)}>
                    <option value="">Select dish type</option>
                    {dishTypes.map((dt) => (
                      <option key={dt.id} value={dt.name}>{dt.name}</option>
                    ))}
                  </select>
                  <button type="button" className="mt-slot-remove" onClick={() => onRemoveSlot(i)} title="Remove slot">
                    <CrossIcon />
                  </button>
                </div>
              ))}
              <button type="button" className="btn-add-slot" onClick={onAddSlot}>
                + Add Slot
              </button>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
