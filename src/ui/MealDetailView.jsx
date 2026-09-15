// UI: a saved meal, read-only, with edit and delete controls.
// Slot: `photos` (the carousel). canChange: show the edit and delete controls.

import StarPicker from './StarPicker.jsx';
import { EditIcon, TrashIcon } from './icons.jsx';
import { groupDishes } from './dishes.js';
import { formatDateTime } from './format.js';

export default function MealDetailView({
  meal, canChange, photos, confirmDelete, error,
  onClose, onEdit, onAskDelete, onCancelDelete, onDelete,
}) {
  const dishGroups = Array.isArray(meal.dishes) ? groupDishes(meal.dishes) : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg meal-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>

        {photos}

        <div className="meal-detail-body">
          <div className="meal-detail-header">
            <div className="meal-detail-header-left">
              <h3>{meal.restaurant_name}</h3>
              {meal.title && <span className="meal-detail-title">{meal.title}</span>}
              <span className="meal-detail-time">{formatDateTime(meal.visited_at)}</span>
            </div>
            {canChange && !confirmDelete && (
              <div className="meal-detail-header-icons">
                <button className="icon-btn icon-btn-edit" onClick={onEdit} title="Edit">
                  <EditIcon />
                </button>
                <button className="icon-btn icon-btn-delete" onClick={onAskDelete} title="Delete">
                  <TrashIcon withLines />
                </button>
              </div>
            )}
          </div>

          {meal.cuisine_type && (
            <span className="badge badge-cuisine">{meal.cuisine_type}</span>
          )}

          {dishGroups.length > 0 && (
            <div className="meal-detail-field">
              <label>Dishes</label>
              <div className="dish-groups dish-groups-view">
                {dishGroups.map(group => (
                  <div key={group.category} className="dish-group">
                    <span className="dish-group-label">{group.label}</span>
                    <div className="dish-chips">
                      {group.dishes.map((d) => (
                        <span key={d.id || d.index} className="dish-chip dish-chip-view">{d.name}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="meal-detail-field">
            <label>Rating</label>
            <StarPicker value={meal.rating} disabled />
          </div>

          {meal.calories && (
            <div className="meal-detail-field">
              <label>Calories</label>
              <span className="meal-detail-calories">{meal.calories} kcal</span>
            </div>
          )}

          <div className="meal-detail-field">
            <label>Notes</label>
            <p className="meal-detail-notes">{meal.notes || 'No notes'}</p>
          </div>

          {meal.user_name && (
            <p className="meal-detail-user">Logged by {meal.user_name}</p>
          )}

          {error && <div className="error-message">{error}</div>}

          {confirmDelete && (
            <div className="meal-detail-actions">
              <span className="delete-confirm-text">Delete this meal?</span>
              <button className="btn-secondary" onClick={onCancelDelete}>No</button>
              <button className="btn-danger" onClick={onDelete}>Yes, delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
