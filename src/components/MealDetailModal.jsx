import { useState, useEffect } from 'react';
import { api } from '../api';
import PhotoCarousel from './PhotoCarousel';
import AddRestaurantModal from './AddRestaurantModal';
import DishList from './DishList';

function StarPicker({ value, onChange, disabled }) {
  return (
    <div className="star-picker">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`star ${star <= value ? 'star-filled' : 'star-empty'}${disabled ? ' star-disabled' : ''}`}
          onClick={() => !disabled && onChange(star)}
          role="button"
          tabIndex={disabled ? -1 : 0}
        >
          {star <= value ? '\u2605' : '\u2606'}
        </span>
      ))}
    </div>
  );
}

function toDateStr(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeStr(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function MealDetailModal({ meal, onClose, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [restaurantId, setRestaurantId] = useState(meal.restaurant_id);
  const [title, setTitle] = useState(meal.title || '');
  const [calories, setCalories] = useState(meal.calories || '');
  const [dishes, setDishes] = useState(Array.isArray(meal.dishes) ? meal.dishes.map(d => typeof d === 'object' ? { name: d.name, category: d.category || 'main' } : { name: d, category: 'main' }) : []);
  const [rating, setRating] = useState(meal.rating);
  const [notes, setNotes] = useState(meal.notes || '');
  const [visitDate, setVisitDate] = useState(toDateStr(meal.visited_at));
  const [visitTime, setVisitTime] = useState(toTimeStr(meal.visited_at));
  const [groupId, setGroupId] = useState(meal.group_id || '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [restaurants, setRestaurants] = useState([]);
  const [groups, setGroups] = useState([]);
  const [newPhotos, setNewPhotos] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [error, setError] = useState('');

  const photoUrls = (() => {
    try {
      return meal.photo_urls ? JSON.parse(meal.photo_urls) : meal.photo_url ? [meal.photo_url] : [];
    } catch { return []; }
  })();

  useEffect(() => {
    if (editing && restaurants.length === 0) {
      Promise.all([api.getRestaurants(), api.getGroups()]).then(([rData, gData]) => {
        setRestaurants(rData.restaurants || rData || []);
        setGroups(gData.groups || gData || []);
      }).catch(() => {});
    }
  }, [editing]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.updateMeal(meal.id, {
        restaurant_id: restaurantId,
        title: title.trim() || null,
        calories: calories ? Number(calories) : null,
        dishes,
        rating,
        notes: notes.trim() || null,
        visited_at: new Date(`${visitDate}T${visitTime}`).toISOString(),
        group_id: groupId ? Number(groupId) : null,
      });
      if (newPhotos.length > 0) {
        await api.uploadMealPhotos(meal.id, newPhotos);
      }
      onUpdated();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setError('');
    try {
      await api.deleteMeal(meal.id);
      onDeleted();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete meal');
      setConfirmDelete(false);
    }
  };

  const resetEditing = () => {
    setEditing(false);
    setRestaurantId(meal.restaurant_id);
    setTitle(meal.title || '');
    setCalories(meal.calories || '');
    setDishes(Array.isArray(meal.dishes) ? meal.dishes.map(d => typeof d === 'object' ? { name: d.name, category: d.category || 'main' } : { name: d, category: 'main' }) : []);
    setRating(meal.rating);
    setNotes(meal.notes || '');
    setVisitDate(toDateStr(meal.visited_at));
    setVisitTime(toTimeStr(meal.visited_at));
    setGroupId(meal.group_id || '');
    setNewPhotos([]);
  };

  // ---------- VIEW MODE ----------
  if (!editing) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content modal-lg meal-detail-modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>&times;</button>

          <PhotoCarousel urls={photoUrls} />

          <div className="meal-detail-body">
            <div className="meal-detail-header">
              <div className="meal-detail-header-left">
                <h3>{meal.restaurant_name}</h3>
                {meal.title && <span className="meal-detail-title">{meal.title}</span>}
                <span className="meal-detail-time">
                  {new Date(meal.visited_at).toLocaleDateString(undefined, {
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </span>
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

            {meal.cuisine_type && (
              <span className="badge badge-cuisine">{meal.cuisine_type}</span>
            )}

            {Array.isArray(meal.dishes) && meal.dishes.length > 0 && (() => {
              const CATEGORY_LABELS = { main: 'Main Dish', side: 'Side', soup: 'Soup', rice: 'Rice', noodle: 'Noodle', bread: 'Bread', appetizer: 'Appetizer', dessert: 'Dessert', drink: 'Drink' };
              const CAT_ORDER = ['main', 'side', 'soup', 'rice', 'noodle', 'bread', 'appetizer', 'dessert', 'drink'];
              const grouped = {};
              meal.dishes.forEach(d => {
                const cat = d.category || 'main';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(d);
              });
              const cats = CAT_ORDER.filter(c => grouped[c]);
              return (
                <div className="meal-detail-field">
                  <label>Dishes</label>
                  <div className="dish-groups dish-groups-view">
                    {cats.map(cat => (
                      <div key={cat} className="dish-group">
                        <span className="dish-group-label">{CATEGORY_LABELS[cat] || cat}</span>
                        <div className="dish-chips">
                          {grouped[cat].map((d, i) => (
                            <span key={d.id || i} className="dish-chip dish-chip-view">{d.name || d}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="meal-detail-field">
              <label>Rating</label>
              <StarPicker value={rating} onChange={setRating} disabled />
            </div>

            {meal.calories && (
              <div className="meal-detail-field">
                <label>Calories</label>
                <span className="meal-detail-calories">{meal.calories} kcal</span>
              </div>
            )}

            <div className="meal-detail-field">
              <label>Notes</label>
              <p className="meal-detail-notes">{notes || 'No notes'}</p>
            </div>

            {meal.user_name && (
              <p className="meal-detail-user">Logged by {meal.user_name}</p>
            )}

            {error && <div className="error-message">{error}</div>}

            {confirmDelete && (
              <div className="meal-detail-actions">
                <span className="delete-confirm-text">Delete this meal?</span>
                <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>No</button>
                <button className="btn-danger" onClick={handleDelete}>Yes, delete</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- EDIT MODE (matches AddMealModal layout) ----------
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Meal{meal.title ? ` — ${meal.title}` : ''}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div
          className={`photo-upload-hero${(photoUrls.length + newPhotos.length) > 0 ? ' has-photo' : ''}${dragging ? ' dragging' : ''}`}
          onClick={() => document.getElementById('edit-photo-input').click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
            if (files.length > 0) setNewPhotos(prev => [...prev, ...files].slice(0, 10));
          }}
        >
          {(photoUrls.length + newPhotos.length) > 0 ? (
            <div className="photo-grid-preview">
              {photoUrls.map((url, i) => (
                <div key={`existing-${i}`} className="photo-grid-item">
                  <img src={url} alt={`Photo ${i + 1}`} />
                </div>
              ))}
              {newPhotos.map((file, i) => (
                <div key={`new-${i}`} className="photo-grid-item">
                  <img src={URL.createObjectURL(file)} alt={`New ${i + 1}`} />
                  <button
                    type="button"
                    className="photo-remove-mini"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewPhotos(prev => prev.filter((_, idx) => idx !== i));
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
              {(photoUrls.length + newPhotos.length) < 10 && (
                <div className="photo-grid-add">
                  <span>+</span>
                </div>
              )}
            </div>
          ) : (
            <div className="photo-placeholder">
              <span className="photo-icon">{dragging ? '\ud83d\udce5' : '\ud83d\udcf8'}</span>
              <span className="photo-label">{dragging ? 'Drop photos here' : 'Tap or drag photos here (up to 10)'}</span>
            </div>
          )}
          <input
            id="edit-photo-input"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              const files = [...(e.target.files || [])];
              if (files.length > 0) setNewPhotos(prev => [...prev, ...files].slice(0, 10));
              e.target.value = '';
            }}
            hidden
          />
        </div>

        <div className="form-group">
          <label htmlFor="edit-meal-title">Meal Title</label>
          <div className="input-with-action">
            <input
              id="edit-meal-title"
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
          <label htmlFor="edit-meal-restaurant">Restaurant</label>
          <div className="input-with-action">
            <select
              id="edit-meal-restaurant"
              value={restaurantId}
              onChange={(e) => setRestaurantId(Number(e.target.value))}
            >
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
              if (newId) setRestaurantId(newId);
            }}
          />
        )}

        <div className="form-group">
          <label>Dishes</label>
          <DishList dishes={dishes} onChange={setDishes} />
        </div>

        <div className="form-group">
          <label>Rating</label>
          <StarPicker value={rating} onChange={setRating} disabled={false} />
        </div>

        <div className="form-group">
          <label htmlFor="edit-meal-calories">Calories</label>
          <input
            id="edit-meal-calories"
            type="number"
            min="0"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            placeholder="e.g. 650 (optional)"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="edit-meal-date">Date</label>
            <input
              id="edit-meal-date"
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-meal-time">Time</label>
            <input
              id="edit-meal-time"
              type="time"
              value={visitTime}
              onChange={(e) => setVisitTime(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="edit-meal-notes">Notes</label>
          <textarea
            id="edit-meal-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How was the food? (optional)"
            rows={2}
          />
        </div>

        <div className="form-group">
          <label htmlFor="edit-meal-group">Group</label>
          <select
            id="edit-meal-group"
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
          <button type="button" className="btn-secondary" onClick={resetEditing}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
