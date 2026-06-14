import { useState, useEffect } from 'react';
import { api } from '../api';

const CUISINE_OPTIONS = ['', 'Malay', 'Chinese', 'Indian', 'Western', 'Japanese', 'Korean', 'Thai', 'Italian', 'Other'];
export default function AddMealTypeModal({ onClose, onAdded, mealType }) {
  const isEdit = !!mealType;
  const [name, setName] = useState(mealType?.name || '');
  const [cuisineType, setCuisineType] = useState(mealType?.cuisine_type || '');
  const [slots, setSlots] = useState(
    mealType?.slots?.length > 0
      ? mealType.slots.map(s => ({ name: s.name }))
      : [{ name: 'Main' }]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dishTypes, setDishTypes] = useState([]);

  useEffect(() => {
    api.getDishTypes().then(data => setDishTypes(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const addSlot = () => {
    setSlots([...slots, { name: '' }]);
  };

  const removeSlot = (index) => {
    setSlots(slots.filter((_, i) => i !== index));
  };

  const updateSlot = (index, field, value) => {
    const updated = [...slots];
    updated[index] = { ...updated[index], [field]: value };
    setSlots(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    const validSlots = slots.filter(s => s.name.trim());
    if (validSlots.length === 0) { setError('Add at least one slot'); return; }

    setSubmitting(true);
    setError('');
    try {
      let result;
      if (isEdit) {
        result = await api.updateMealType(mealType.id, {
          name: name.trim(),
          cuisine_type: cuisineType || null,
          slots: validSlots.map(s => ({ name: s.name.trim() })),
        });
      } else {
        result = await api.createMealType({
          name: name.trim(),
          cuisine_type: cuisineType || null,
          slots: validSlots.map(s => ({ name: s.name.trim() })),
        });
      }
      onAdded(result);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create meal type');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Meal Type' : 'Create Meal Type'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="mt-name">Name *</label>
            <input
              id="mt-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dim Sum, Ramen Set"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="mt-cuisine">Cuisine</label>
            <select id="mt-cuisine" value={cuisineType} onChange={(e) => setCuisineType(e.target.value)}>
              <option value="">Any cuisine</option>
              {CUISINE_OPTIONS.filter(Boolean).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Slots</label>
            <div className="mt-slots-editor">
              {slots.map((slot, i) => (
                <div key={i} className="mt-slot-row">
                  <select
                    value={slot.name}
                    onChange={(e) => updateSlot(i, 'name', e.target.value)}
                  >
                    <option value="">Select dish type</option>
                    {dishTypes.map((dt) => (
                      <option key={dt.id} value={dt.name}>{dt.name}</option>
                    ))}
                  </select>
                  <button type="button" className="mt-slot-remove" onClick={() => removeSlot(i)} title="Remove slot">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
              <button type="button" className="btn-add-slot" onClick={addSlot}>
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
