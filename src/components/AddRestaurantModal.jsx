import { useState } from 'react';
import { api } from '../api';

export default function AddRestaurantModal({ onClose, onAdded }) {
  const [name, setName] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [price, setPrice] = useState('2');
  const [address, setAddress] = useState('');
  const [photo, setPhoto] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const created = await api.createRestaurant({
        name: name.trim(),
        cuisine_type: cuisine.trim() || null,
        price_range: Number(price),
        address: address.trim() || null,
      });
      const restId = created?.id || created?.restaurant?.id;
      if (photo && restId) {
        await api.uploadRestaurantPhoto(restId, photo);
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add New Restaurant</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}

          <div
            className={`photo-upload-hero photo-upload-sm${photo ? ' has-photo' : ''}${dragging ? ' dragging' : ''}`}
            onClick={() => document.getElementById('restaurant-photo-input').click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file && file.type.startsWith('image/')) setPhoto(file);
            }}
          >
            {photo ? (
              <>
                <img src={URL.createObjectURL(photo)} alt="Preview" className="photo-preview" />
                <button
                  type="button"
                  className="photo-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhoto(null);
                  }}
                >
                  &times;
                </button>
              </>
            ) : (
              <div className="photo-placeholder">
                <span className="photo-icon">{dragging ? '📥' : '🍽️'}</span>
                <span className="photo-label">{dragging ? 'Drop photo here' : 'Add restaurant photo'}</span>
              </div>
            )}
            <input
              id="restaurant-photo-input"
              type="file"
              accept="image/*"
              onChange={(e) => { setPhoto(e.target.files[0] || null); e.target.value = ''; }}
              hidden
            />
          </div>

          <div className="form-group">
            <label htmlFor="modal-r-name">Name *</label>
            <input
              id="modal-r-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Restaurant name"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="modal-r-cuisine">Cuisine Type</label>
            <input
              id="modal-r-cuisine"
              type="text"
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
              placeholder="e.g. Malay, Chinese"
            />
          </div>
          <div className="form-group">
            <label htmlFor="modal-r-price">Price Range</label>
            <select
              id="modal-r-price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            >
              <option value="1">$ (Budget)</option>
              <option value="2">$$ (Moderate)</option>
              <option value="3">$$$ (Upscale)</option>
              <option value="4">$$$$ (Fine Dining)</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="modal-r-address">Address</label>
            <input
              id="modal-r-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Address (optional)"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add Restaurant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
