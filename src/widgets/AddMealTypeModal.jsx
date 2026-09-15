// UI connector: the create / edit meal type dialog.

import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { checkMealTypeForm } from '../../logic/catalog.js';
import { mealTypeFormFrom } from '../ui/forms.js';
import MealTypeDialog from '../ui/MealTypeDialog.jsx';

export default function AddMealTypeModal({ onClose, onAdded, mealType }) {
  const isEdit = !!mealType;
  const [form, setForm] = useState(() => mealTypeFormFrom(mealType));
  const [dishTypes, setDishTypes] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getDishTypes().then(data => setDishTypes(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const setSlots = (update) => setForm(f => ({ ...f, slots: update(f.slots) }));

  const submit = async () => {
    const input = checkMealTypeForm(form);
    if (!input.ok) {
      setError(input.error);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = isEdit
        ? await api.updateMealType(mealType.id, input.value)
        : await api.createMealType(input.value);
      onAdded(result);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create meal type');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MealTypeDialog
      isEdit={isEdit}
      form={form}
      dishTypes={dishTypes}
      error={error}
      submitting={submitting}
      onName={(name) => setForm(f => ({ ...f, name }))}
      onCuisine={(cuisineType) => setForm(f => ({ ...f, cuisineType }))}
      onSlotName={(index, name) => setSlots(slots => slots.map((s, i) => (i === index ? { ...s, name } : s)))}
      onAddSlot={() => setSlots(slots => [...slots, { name: '' }])}
      onRemoveSlot={(index) => setSlots(slots => slots.filter((_, i) => i !== index))}
      onSubmit={submit}
      onClose={onClose}
    />
  );
}
