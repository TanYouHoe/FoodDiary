// UI connector: a saved meal. View mode with delete, and edit mode.

import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useMealForm, visitedAtOf } from '../hooks/useMealForm.js';
import { mealFormToInput } from '../../logic/meals.js';
import { mealFormFrom } from '../ui/forms.js';
import MealDetailView from '../ui/MealDetailView.jsx';
import MealFormDialog from '../ui/MealFormDialog.jsx';
import { MultiPhotoPicker } from '../ui/PhotoPickers.jsx';
import PhotoCarousel from './PhotoCarousel.jsx';
import DishList from './DishList.jsx';
import AddRestaurantModal from './AddRestaurantModal.jsx';

export default function MealDetailModal({ meal, onClose, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const m = useMealForm(() => mealFormFrom(meal));

  useEffect(() => {
    if (editing && m.restaurants.length === 0) m.loadChoices().catch(() => {});
  }, [editing]);

  const save = async () => {
    m.setSubmitting(true);
    m.setError('');
    try {
      await api.updateMeal(meal.id, mealFormToInput(m.form, visitedAtOf(m.form)));
      if (m.photos.files.length > 0) {
        await api.uploadMealPhotos(meal.id, m.photos.files);
      }
      onUpdated();
      onClose();
    } catch (err) {
      m.setError(err.message || 'Failed to save changes');
    } finally {
      m.setSubmitting(false);
    }
  };

  const remove = async () => {
    m.setError('');
    try {
      await api.deleteMeal(meal.id);
      onDeleted();
      onClose();
    } catch (err) {
      m.setError(err.message || 'Failed to delete meal');
      setConfirmDelete(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    m.reset(mealFormFrom(meal));
  };

  if (!editing) {
    return (
      <MealDetailView
        meal={meal}
        photos={<PhotoCarousel urls={meal.photos} />}
        confirmDelete={confirmDelete}
        error={m.error}
        onClose={onClose}
        onEdit={() => setEditing(true)}
        onAskDelete={() => setConfirmDelete(true)}
        onCancelDelete={() => setConfirmDelete(false)}
        onDelete={remove}
      />
    );
  }

  return (
    <MealFormDialog
      mode="edit"
      heading={`Edit Meal${meal.title ? ` — ${meal.title}` : ''}`}
      form={m.form}
      restaurants={m.restaurants}
      groups={m.groups}
      error={m.error}
      submitting={m.submitting}
      photos={<MultiPhotoPicker inputId="edit-photo-input" picker={m.photos.props} existingUrls={meal.photos} newAlt="New" />}
      dishEditor={<DishList dishes={m.form.dishes} onChange={(dishes) => m.setField('dishes', dishes)} />}
      restaurantDialog={m.showAddRestaurant && (
        <AddRestaurantModal
          onClose={() => m.setShowAddRestaurant(false)}
          onAdded={(created) => {
            m.reloadRestaurants();
            if (created?.id) m.setField('restaurantId', created.id);
          }}
        />
      )}
      onField={m.setField}
      onNewRestaurant={() => m.setShowAddRestaurant(true)}
      onSubmit={save}
      onCancel={cancelEdit}
      onClose={onClose}
    />
  );
}
