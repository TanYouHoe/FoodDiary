// UI: the list pages. Meals, restaurants and dishes.
// Slots: the dialogs each page opens.

import { toMealRows } from './lists.js';
import { priceDisplay, stars, capitalize } from './format.js';
import { dishCategories, filterDishes } from './dishes.js';
import { matchesName } from '../../logic/restaurants.js';

export function MealsView({ loading, meals, restaurants, addDialog, detailDialog, onLogMeal, onSelect }) {
  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="add-meal-page">
      <div className="page-header">
        <h2>Meals</h2>
        <button className="btn-primary" onClick={onLogMeal}>
          + Log a Meal
        </button>
      </div>

      {addDialog}

      {meals.length === 0 ? (
        <div className="empty-state">
          <p>No meals logged yet. Tap the button above to log your first meal!</p>
        </div>
      ) : (
        <div className="meals-list">
          {toMealRows(meals, restaurants).map((row) => (
            <div key={row.meal.id} className="meal-row" onClick={() => onSelect(row.meal)} style={{ cursor: 'pointer' }}>
              {row.thumbs.length > 0 && (
                <div className="meal-thumbnails">
                  {row.thumbs.map((url, i) => (
                    <img key={i} src={url} alt={`Meal ${i + 1}`} className="meal-thumbnail" />
                  ))}
                  {row.morePhotos > 0 && <span className="meal-thumb-more">+{row.morePhotos}</span>}
                </div>
              )}
              <div className="meal-info">
                <span className="meal-restaurant-name">{row.heading}</span>
                {row.subRestaurant && <span className="meal-sub-restaurant">{row.subRestaurant}</span>}
                <span className="meal-rating">{row.stars}</span>
                <span className="meal-date">{row.date}</span>
                {row.meal.notes && <span className="meal-notes">{row.meal.notes}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {detailDialog}
    </div>
  );
}

export function RestaurantsView({ loading, error, restaurants, search, addDialog, detailDialog, onSearch, onAdd, onSelect }) {
  if (loading) return <div className="loading">Loading restaurants...</div>;
  const filtered = restaurants.filter(r => matchesName(r, search));

  return (
    <div className="restaurants-page">
      <div className="page-header">
        <h2>Restaurants</h2>
        <button className="btn-primary" onClick={onAdd}>
          + Add Restaurant
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {addDialog}
      {detailDialog}

      <div className="search-bar">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search restaurants..."
          className="search-input"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>{search ? 'No restaurants match your search.' : 'No restaurants yet. Add one above!'}</p>
        </div>
      ) : (
        <div className="restaurant-list">
          {filtered.map((r) => (
            <div key={r.id} className="restaurant-row restaurant-row-clickable" onClick={() => onSelect(r)}>
              {r.photo_url && (
                <img src={r.photo_url} alt={r.name} className="restaurant-thumb" />
              )}
              <div className="restaurant-info">
                <span className="restaurant-name">{r.name}</span>
                {r.cuisine_type && (
                  <span className="badge badge-cuisine">{r.cuisine_type}</span>
                )}
                <span className="badge badge-price">{priceDisplay(r.price_range)}</span>
                {r.address && <span className="restaurant-address">{r.address}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DishesView({ loading, dishes, search, category, onSearch, onCategory }) {
  if (loading) return <div className="loading">Loading dishes...</div>;
  const filtered = filterDishes(dishes, search, category);

  return (
    <div className="dishes-page">
      <div className="page-header">
        <h2>Dishes</h2>
      </div>

      <div className="dishes-filters">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search dishes..."
          className="search-input"
        />
        <select className="filter-select" value={category} onChange={(e) => onCategory(e.target.value)}>
          <option value="">All types</option>
          {dishCategories(dishes).map(c => (
            <option key={c} value={c}>{capitalize(c)}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>{search || category ? 'No dishes match your filters.' : 'No dishes logged yet. Log a meal with dishes to see them here!'}</p>
        </div>
      ) : (
        <div className="dishes-list">
          {filtered.map((d, i) => (
            <div key={i} className="dish-row">
              <div className="dish-row-info">
                <span className="dish-row-name">{d.name}</span>
                {d.category && (
                  <span className="badge badge-cuisine">{capitalize(d.category)}</span>
                )}
              </div>
              <div className="dish-row-meta">
                <span className="dish-row-count">{d.times_eaten}x eaten</span>
                {d.best_rating && (
                  <span className="dish-row-rating">{stars(d.best_rating)}</span>
                )}
                <span className="dish-row-restaurants">{d.restaurants}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
