// UI connector: the log-a-meal dialog. Creates the meal, then uploads its photos.

import { useEffect } from 'react';
import { api } from '../api.js';
import { useMealForm, visitedAtOf } from '../hooks/useMealForm.js';
import { checkMealForm, mealFormToInput } from '../../logic/meals.js';
import { newMealForm } from '../ui/forms.js';
import MealFormDialog from '../ui/MealFormDialog.jsx';
import { MultiPhotoPicker } from '../ui/PhotoPickers.jsx';
import DishList from './DishList.jsx';
import AddRestaurantModal from './AddRestaurantModal.jsx';

export default function AddMealModal({ onClose, onAdded }) {
  const m = useMealForm(() => newMealForm(new Date()));

  useEffect(() => { m.loadChoices(); }, []);

  const submit = async () => {
    const invalid = checkMealForm(m.form);
    if (invalid) {
      m.setError(invalid);
      return;
    }
    m.setSubmitting(true);
    m.setError('');
    try {
      const created = await api.createMeal(mealFormToInput(m.form, visitedAtOf(m.form)));
      if (m.photos.files.length > 0 && created.id) {
        await api.uploadMealPhotos(created.id, m.photos.files);
      }
      onAdded();
      onClose();
    } catch (err) {
      m.setError(err.message);
    } finally {
      m.setSubmitting(false);
    }
  };

  return (
    <MealFormDialog
      mode="add"
      heading="Log a Meal"
      form={m.form}
      restaurants={m.restaurants}
      groups={m.groups}
      error={m.error}
      submitting={m.submitting}
      photos={<MultiPhotoPicker inputId="modal-photo-input" picker={m.photos.props} newAlt="Preview" />}
      dishEditor={<DishList dishes={m.form.dishes} onChange={(dishes) => m.setField('dishes', dishes)} />}
      restaurantDialog={m.showAddRestaurant && (
        <AddRestaurantModal
          onClose={() => m.setShowAddRestaurant(false)}
          onAdded={(created) => {
            m.reloadRestaurants();
            if (created?.id) m.setField('restaurantId', String(created.id));
          }}
        />
      )}
      onField={m.setField}
      onNewRestaurant={() => m.setShowAddRestaurant(true)}
      onSubmit={submit}
      onCancel={onClose}
      onClose={onClose}
    />
  );
}
