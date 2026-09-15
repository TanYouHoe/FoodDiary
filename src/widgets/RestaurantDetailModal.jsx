// UI connector: a saved restaurant. View mode with delete, and edit mode.

import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { usePhotoPicker } from '../hooks/usePhotoPicker.js';
import { checkRestaurantForm } from '../../logic/restaurants.js';
import { canChangeRestaurant } from '../../logic/access.js';
import { restaurantFormFrom } from '../ui/forms.js';
import { RestaurantDialog, RestaurantDetailView } from '../ui/RestaurantViews.jsx';
import { SinglePhotoPicker } from '../ui/PhotoPickers.jsx';

export default function RestaurantDetailModal({ restaurant, onClose, onUpdated, onDeleted }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState(() => restaurantFormFrom(restaurant));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const photo = usePhotoPicker({ multiple: false });

  const save = async () => {
    const input = checkRestaurantForm(form);
    if (!input.ok) return;
    setSaving(true);
    setError('');
    try {
      await api.updateRestaurant(restaurant.id, input.value);
      if (photo.files[0]) {
        await api.uploadRestaurantPhoto(restaurant.id, photo.files[0]);
      }
      onUpdated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setError('');
    try {
      await api.deleteRestaurant(restaurant.id);
      onDeleted();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete restaurant');
      setConfirmDelete(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm(restaurantFormFrom(restaurant));
    photo.clear();
    setError('');
    setConfirmDelete(false);
  };

  if (!editing) {
    return (
      <RestaurantDetailView
        restaurant={restaurant}
        canChange={Boolean(user) && canChangeRestaurant(user, restaurant)}
        confirmDelete={confirmDelete}
        error={error}
        onClose={onClose}
        onEdit={() => setEditing(true)}
        onAskDelete={() => setConfirmDelete(true)}
        onCancelDelete={() => setConfirmDelete(false)}
        onDelete={remove}
      />
    );
  }

  return (
    <RestaurantDialog
      mode="edit"
      form={form}
      error={error}
      submitting={saving}
      photo={<SinglePhotoPicker inputId="edit-restaurant-photo-input" picker={photo.props} currentUrl={restaurant.photo_url} emptyLabel="Change restaurant photo" />}
      onField={(key, value) => setForm(f => ({ ...f, [key]: value }))}
      onSubmit={save}
      onCancel={cancelEdit}
      onClose={onClose}
    />
  );
}
