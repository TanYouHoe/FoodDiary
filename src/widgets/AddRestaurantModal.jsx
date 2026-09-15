// UI connector: the add-restaurant dialog. Creates it, then uploads the photo.

import { useState } from 'react';
import { api } from '../api.js';
import { usePhotoPicker } from '../hooks/usePhotoPicker.js';
import { checkRestaurantForm } from '../../logic/restaurants.js';
import { emptyRestaurantForm } from '../ui/forms.js';
import { RestaurantDialog } from '../ui/RestaurantViews.jsx';
import { SinglePhotoPicker } from '../ui/PhotoPickers.jsx';

export default function AddRestaurantModal({ onClose, onAdded }) {
  const [form, setForm] = useState(emptyRestaurantForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const photo = usePhotoPicker({ multiple: false });

  const submit = async () => {
    const input = checkRestaurantForm(form);
    if (!input.ok) return;
    setSubmitting(true);
    setError('');
    try {
      const created = await api.createRestaurant(input.value);
      if (photo.files[0] && created?.id) {
        await api.uploadRestaurantPhoto(created.id, photo.files[0]);
      }
      onAdded(created);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RestaurantDialog
      mode="add"
      form={form}
      error={error}
      submitting={submitting}
      photo={<SinglePhotoPicker inputId="restaurant-photo-input" picker={photo.props} emptyLabel="Add restaurant photo" />}
      onField={(key, value) => setForm(f => ({ ...f, [key]: value }))}
      onSubmit={submit}
      onCancel={onClose}
      onClose={onClose}
    />
  );
}
