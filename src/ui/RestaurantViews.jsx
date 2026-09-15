// UI: the add / edit restaurant dialog and the restaurant detail view.

import { EditIcon, TrashIcon } from './icons.jsx';
import { priceDisplay, formatShortDate, PRICE_LABELS } from './format.js';
import { PRICE_RANGES } from '../../logic/restaurants.js';

// mode 'add': a <form> that submits. mode 'edit': Cancel resets, Save saves.
// Slot: `photo` (the picker).
export function RestaurantDialog({ mode, form, error, submitting, photo, onField, onSubmit, onCancel, onClose }) {
  const isAdd = mode === 'add';
  const id = (name) => `${isAdd ? 'modal' : 'edit'}-r-${name}`;

  const fields = (
    <>
      <div className="form-group">
        <label htmlFor={id('name')}>Name *</label>
        <input
          id={id('name')}
          type="text"
          value={form.name}
          onChange={(e) => onField('name', e.target.value)}
          required
          placeholder="Restaurant name"
          autoFocus
        />
      </div>
      <div className="form-group">
        <label htmlFor={id('cuisine')}>Cuisine Type</label>
        <input
          id={id('cuisine')}
          type="text"
          value={form.cuisine}
          onChange={(e) => onField('cuisine', e.target.value)}
          placeholder="e.g. Malay, Chinese"
        />
      </div>
      <div className="form-group">
        <label htmlFor={id('price')}>Price Range</label>
        <select id={id('price')} value={form.price} onChange={(e) => onField('price', e.target.value)}>
          {PRICE_RANGES.map(p => (
            <option key={p} value={String(p)}>{priceDisplay(p)} ({PRICE_LABELS[p]})</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor={id('address')}>Address</label>
        <input
          id={id('address')}
          type="text"
          value={form.address}
          onChange={(e) => onField('address', e.target.value)}
          placeholder="Address (optional)"
        />
      </div>
    </>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isAdd ? 'Add New Restaurant' : 'Edit Restaurant'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        {isAdd ? (
          <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
            {error && <div className="error-message">{error}</div>}
            {photo}
            {fields}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Adding...' : 'Add Restaurant'}
              </button>
            </div>
          </form>
        ) : (
          <>
            {error && <div className="error-message">{error}</div>}
            {photo}
            {fields}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
              <button type="button" className="btn-primary" onClick={onSubmit} disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// canChange: show the edit and delete controls.
export function RestaurantDetailView({ restaurant, canChange, confirmDelete, error, onClose, onEdit, onAskDelete, onCancelDelete, onDelete }) {
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
            <p className="meal-detail-user">Added {formatShortDate(restaurant.created_at)}</p>
          )}

          {error && <div className="error-message">{error}</div>}

          {confirmDelete && (
            <div className="meal-detail-actions">
              <span className="delete-confirm-text">Delete this restaurant?</span>
              <button className="btn-secondary" onClick={onCancelDelete}>No</button>
              <button className="btn-danger" onClick={onDelete}>Yes, delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
