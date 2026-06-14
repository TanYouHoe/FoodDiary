import { useState, useEffect } from 'react';
import { api } from '../api';
import AddRestaurantModal from './AddRestaurantModal';
import DishList from './DishList';

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function StarPicker({ value, onChange }) {
  return (
    <div className="star-picker">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`star ${star <= value ? 'star-filled' : 'star-empty'}`}
          onClick={() => onChange(star)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onChange(star); }}
        >
          {star <= value ? '★' : '☆'}
        </span>
      ))}
    </div>
  );
}

export default function AddMealModal({ onClose, onAdded }) {
  const [restaurants, setRestaurants] = useState([]);
  const [groups, setGroups] = useState([]);

  const [restaurantId, setRestaurantId] = useState('');
  const [title, setTitle] = useState('');
  const [dishes, setDishes] = useState([]);
  const [calories, setCalories] = useState('');
  const [rating, setRating] = useState(3);
  const [visitedAt, setVisitedAt] = useState(todayStr());
  const [visitedTime, setVisitedTime] = useState(nowTimeStr());
  const [photos, setPhotos] = useState([]);
  const [notes, setNotes] = useState('');
  const [groupId, setGroupId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    Promise.all([api.getRestaurants(), api.getGroups()]).then(([rData, gData]) => {
      setRestaurants(rData.restaurants || rData || []);
      setGroups(gData.groups || gData || []);
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!restaurantId) {
      setError('Please select a restaurant');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const mealData = {
        restaurant_id: Number(restaurantId),
        title: title.trim() || null,
        dishes: dishes.length > 0 ? dishes : [],
        calories: calories ? Number(calories) : null,
        rating,
        visited_at: new Date(`${visitedAt}T${visitedTime}`).toISOString(),
        notes: notes.trim() || null,
      };
      if (groupId) mealData.group_id = Number(groupId);

      const created = await api.createMeal(mealData);
      const mealId = created.meal?.id || created.id;

      if (photos.length > 0 && mealId) {
        await api.uploadMealPhotos(mealId, photos);
      }

      onAdded();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Log a Meal</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}

          <div
            className={`photo-upload-hero${photos.length > 0 ? ' has-photo' : ''}${dragging ? ' dragging' : ''}`}
            onClick={() => document.getElementById('modal-photo-input').click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
              if (files.length > 0) setPhotos(prev => [...prev, ...files].slice(0, 10));
            }}
          >
            {photos.length > 0 ? (
              <div className="photo-grid-preview">
                {photos.map((file, i) => (
                  <div key={i} className="photo-grid-item">
                    <img src={URL.createObjectURL(file)} alt={`Preview ${i + 1}`} />
                    <button
                      type="button"
                      className="photo-remove-mini"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPhotos(prev => prev.filter((_, idx) => idx !== i));
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
                {photos.length < 10 && (
                  <div className="photo-grid-add">
                    <span>+</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="photo-placeholder">
                <span className="photo-icon">{dragging ? '📥' : '📸'}</span>
                <span className="photo-label">{dragging ? 'Drop photos here' : 'Tap or drag photos here (up to 10)'}</span>
              </div>
            )}
            <input
              id="modal-photo-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = [...(e.target.files || [])];
                if (files.length > 0) setPhotos(prev => [...prev, ...files].slice(0, 10));
                e.target.value = '';
              }}
              hidden
            />
          </div>

          <div className="form-group">
            <label htmlFor="modal-meal-title">Meal Title</label>
            <div className="input-with-action">
              <input
                id="modal-meal-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Birthday dinner, Nasi Lemak Set A (optional)"
              />
              <button
                type="button"
                className="btn-ai"
                title="Auto-suggest meal title with AI"
                disabled
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93L12 22"/><path d="M8 6a4 4 0 0 1 8 0"/><path d="M5 10c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2c0 3.31-2.69 6-6 6h-2c-3.31 0-6-2.69-6-6Z"/></svg>
                AI
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="modal-meal-restaurant">Restaurant *</label>
            <div className="input-with-action">
              <select
                id="modal-meal-restaurant"
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
                required
              >
                <option value="">Select a restaurant</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setShowAddRestaurant(true)}
              >
                + New
              </button>
            </div>
          </div>

          {showAddRestaurant && (
            <AddRestaurantModal
              onClose={() => setShowAddRestaurant(false)}
              onAdded={(created) => {
                api.getRestaurants().then(d => setRestaurants(d.restaurants || d || []));
                const newId = created?.id || created?.restaurant?.id;
                if (newId) setRestaurantId(String(newId));
              }}
            />
          )}

          <div className="form-group">
            <label>Dishes</label>
            <DishList dishes={dishes} onChange={setDishes} />
          </div>

          <div className="form-group">
            <label>Rating</label>
            <StarPicker value={rating} onChange={setRating} />
          </div>

          <div className="form-group">
            <label htmlFor="modal-meal-calories">Calories</label>
            <input
              id="modal-meal-calories"
              type="number"
              min="0"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              placeholder="e.g. 650 (optional)"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="modal-meal-date">Date</label>
              <input
                id="modal-meal-date"
                type="date"
                value={visitedAt}
                onChange={(e) => setVisitedAt(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="modal-meal-time">Time</label>
              <input
                id="modal-meal-time"
                type="time"
                value={visitedTime}
                onChange={(e) => setVisitedTime(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="modal-meal-notes">Notes</label>
            <textarea
              id="modal-meal-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How was the food? (optional)"
              rows={2}
            />
          </div>

          <div className="form-group">
            <label htmlFor="modal-meal-group">Group</label>
            <select
              id="modal-meal-group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value="">Personal</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Log Meal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
