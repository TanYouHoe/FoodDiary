import { useState } from 'react';
import { api } from '../api';

function priceDisplay(range) {
  return '$'.repeat(range || 0);
}

const PRICE_LABELS = { 1: 'Budget', 2: 'Moderate', 3: 'Upscale', 4: 'Fine Dining' };

export default function RestaurantDetailModal({ restaurant, onClose, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(restaurant.name);
  const [cuisine, setCuisine] = useState(restaurant.cuisine_type || '');
  const [price, setPrice] = useState(String(restaurant.price_range || 2));
  const [address, setAddress] = useState(restaurant.address || '');
  const [photo, setPhoto] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.updateRestaurant(restaurant.id, {
        name: name.trim(),
        cuisine_type: cuisine.trim() || null,
        price_range: Number(price),
        address: address.trim() || null,
      });
      if (photo) {
        await api.uploadRestaurantPhoto(restaurant.id, photo);
      }
      onUpdated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteRestaurant(restaurant.id);
      onDeleted();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetEditing = () => {
    setEditing(false);
    setName(restaurant.name);
    setCuisine(restaurant.cuisine_type || '');
    setPrice(String(restaurant.price_range || 2));
    setAddress(restaurant.address || '');
    setPhoto(null);
    setError('');
    setConfirmDelete(false);
  };

  // ---------- VIEW MODE ----------
  if (!editing) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content restaurant-detail-modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>&times;</button>

          {restaurant.photo_url && (
            <div className="restaurant-detail-photo">
              <img src={restaurant.photo_url} alt={restaurant.name} />
            </div>
          )}

          <div className="restaurant-detail-body">
            <div className="meal-detail-header">
              <div className="meal-detail-header-left">
                <h3>{restaurant.name}</h3>
              </div>
              {!confirmDelete && (
                <div className="meal-detail-header-icons">
                  <button className="icon-btn icon-btn-edit" onClick={() => setEditing(true)} title="Edit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                  <button className="icon-btn icon-btn-delete" onClick={() => setConfirmDelete(true)} title="Delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </div>
              )}
            </div>

            <div className="restaurant-detail-badges">
              {restaurant.cuisine_type && (
                <span className="badge badge-cuisine">{restaurant.cuisine_type}</span>
              )}
              {restaurant.price_range && (
                <span className="badge badge-price">{priceDisplay(restaurant.price_range)} — {PRICE_LABELS[restaurant.price_range]}</span>
              )}
            </div>

            {restaurant.address && (
              <div className="meal-detail-field">
                <label>Address</label>
                <p className="restaurant-detail-address">{restaurant.address}</p>
              </div>
            )}

            {restaurant.created_at && (
              <p className="meal-detail-user">
                Added {new Date(restaurant.created_at).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'short', day: 'numeric'
                })}
              </p>
            )}

            {error && <div className="error-message">{error}</div>}

            {confirmDelete && (
              <div className="meal-detail-actions">
                <span className="delete-confirm-text">Delete this restaurant?</span>
                <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>No</button>
                <button className="btn-danger" onClick={handleDelete}>Yes, delete</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- EDIT MODE ----------
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Restaurant</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div
          className={`photo-upload-hero photo-upload-sm${(photo || restaurant.photo_url) ? ' has-photo' : ''}${dragging ? ' dragging' : ''}`}
          onClick={() => document.getElementById('edit-restaurant-photo-input').click()}
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
          {(photo || restaurant.photo_url) ? (
            <>
              <img
                src={photo ? URL.createObjectURL(photo) : restaurant.photo_url}
                alt="Preview"
                className="photo-preview"
              />
              {photo && (
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
              )}
            </>
          ) : (
            <div className="photo-placeholder">
              <span className="photo-icon">{dragging ? '📥' : '🍽️'}</span>
              <span className="photo-label">{dragging ? 'Drop photo here' : 'Change restaurant photo'}</span>
            </div>
          )}
          <input
            id="edit-restaurant-photo-input"
            type="file"
            accept="image/*"
            onChange={(e) => { setPhoto(e.target.files[0] || null); e.target.value = ''; }}
            hidden
          />
        </div>

        <div className="form-group">
          <label htmlFor="edit-r-name">Name *</label>
          <input
            id="edit-r-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Restaurant name"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label htmlFor="edit-r-cuisine">Cuisine Type</label>
          <input
            id="edit-r-cuisine"
            type="text"
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            placeholder="e.g. Malay, Chinese"
          />
        </div>
        <div className="form-group">
          <label htmlFor="edit-r-price">Price Range</label>
          <select
            id="edit-r-price"
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
          <label htmlFor="edit-r-address">Address</label>
          <input
            id="edit-r-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address (optional)"
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={resetEditing}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
