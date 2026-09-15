// UI: the dashboard. The "where should we eat?" panel with its suggestion
// cards, and the recent-meals timeline.
// Slots: `addMealDialog`, `mealDialog`. Render prop: `renderPhotos(urls)`.

import { CUISINES } from '../../logic/restaurants.js';
import { toSuggestionCard } from './suggestions.js';
import { toTimelineItems } from './timeline.js';

const PRICE_OPTIONS = [
  { value: '', label: 'Any price' },
  { value: '1', label: '$' },
  { value: '2', label: '$$' },
  { value: '3', label: '$$$' },
  { value: '4', label: '$$$$' },
];

function SuggestionCard({ suggestion, className, onDismiss }) {
  const card = toSuggestionCard(suggestion);
  return (
    <div className={`suggestion-card ${className}`}>
      <div className="card-header">
        <div className="card-header-left">
          {card.badge && <span className={`badge badge-suggestion ${card.badge.className}`}>{card.badge.label}</span>}
          <h3 className="card-name">{card.name}</h3>
        </div>
        <button className="btn-dismiss" onClick={onDismiss} title="Dismiss">
          &times;
        </button>
      </div>
      <div className="card-body">
        {card.cuisine && <span className="badge badge-cuisine">{card.cuisine}</span>}
        {card.price && <span className="badge badge-price">{card.price}</span>}
        {card.rating && <span className="card-rating" title={card.rating.title}>{card.rating.stars}</span>}
      </div>
      {card.restaurant && <p className="card-restaurant">at {card.restaurant}</p>}
      {card.dishes.length > 0 && (
        <div className="card-dishes">
          {card.dishes.map((label, j) => (
            <span key={j} className="dish-chip dish-chip-view">{label}</span>
          ))}
        </div>
      )}
      {card.reason && <p className="card-reason">{card.reason}</p>}
    </div>
  );
}

export default function DashboardView({
  filters, mealTypes, groups, suggestions, loading, error, hasSearched,
  meals, mealsLoading, now, addMealDialog, mealDialog, renderPhotos,
  onFilter, onSuggest, onDismiss, onLogMeal, onSelectMeal,
}) {
  return (
    <div className="dashboard-page">
      <div className="dashboard-hero">
        <h2>Where should we eat?</h2>

        <div className="filter-bar">
          <div className="filter-chips">
            <select className="filter-select" value={filters.cuisine} onChange={(e) => onFilter('cuisine', e.target.value)}>
              <option value="">All cuisines</option>
              {CUISINES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select className="filter-select" value={filters.priceRange} onChange={(e) => onFilter('priceRange', e.target.value)}>
              {PRICE_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>

            <select className="filter-select" value={filters.mealTypeId} onChange={(e) => onFilter('mealTypeId', e.target.value)}>
              <option value="">Any meal type</option>
              {mealTypes.map((mt) => (
                <option key={mt.id} value={mt.id}>
                  {mt.name}{mt.cuisine_type ? ` (${mt.cuisine_type})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="suggest-buttons">
            <div className="suggest-mode-toggle">
              <button
                className={`toggle-btn ${filters.mode === 'personal' ? 'active' : ''}`}
                onClick={() => onFilter('mode', 'personal')}
              >
                For me
              </button>
              <button
                className={`toggle-btn ${filters.mode === 'group' ? 'active' : ''}`}
                onClick={() => onFilter('mode', 'group')}
              >
                For group
              </button>
            </div>
            {filters.mode === 'group' && groups.length > 0 && (
              <select className="filter-select" value={filters.groupId} onChange={(e) => onFilter('groupId', e.target.value)}>
                <option value="">Select group</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
            <button
              className="btn-primary btn-suggest"
              onClick={onSuggest}
              disabled={loading || (filters.mode === 'group' && !filters.groupId)}
            >
              {loading ? 'Finding...' : 'Suggest'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading && (
        <div className="loading-state">
          <p>Finding the best picks for you...</p>
        </div>
      )}

      {!loading && hasSearched && suggestions.length === 0 && (
        <div className="empty-state">
          <p>No suggestions found. Try different filters or log more meals.</p>
        </div>
      )}

      {!loading && suggestions.length > 0 && (
        <div className="suggestion-results">
          <div className="suggestion-hero">
            <SuggestionCard suggestion={suggestions[0]} className="suggestion-card-hero" onDismiss={() => onDismiss(0)} />
          </div>

          {suggestions.length > 1 && (
            <div className="suggestion-alternatives">
              {suggestions.slice(1).map((s, i) => (
                <SuggestionCard
                  key={s.restaurant_id || (i + 1)}
                  suggestion={s}
                  className="suggestion-card-alt"
                  onDismiss={() => onDismiss(i + 1)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="timeline-section">
        <div className="timeline-header">
          <h3>Recent Meals</h3>
          <button className="btn-primary btn-sm" onClick={onLogMeal}>
            + Log Meal
          </button>
        </div>

        {addMealDialog}

        {mealsLoading ? (
          <div className="loading">Loading meals...</div>
        ) : meals.length === 0 ? (
          <div className="empty-state">
            <p>No meals yet. Log your first meal to start your food timeline!</p>
          </div>
        ) : (
          <div className="timeline">
            {toTimelineItems(meals, now).map(item => (item.kind === 'date' ? (
              <div key={item.key} className="timeline-date-separator">
                <div className="timeline-date-line" />
                <span className="timeline-date-label">{item.label}</span>
                <div className="timeline-date-line" />
              </div>
            ) : (
              <div key={item.key} className="timeline-card" onClick={() => onSelectMeal(item.meal)} style={{ cursor: 'pointer' }}>
                {renderPhotos(item.meal.photos)}
                <div className="timeline-content">
                  <div className="timeline-top">
                    <span className="timeline-restaurant">{item.heading}</span>
                    <span className="timeline-time">{item.time}</span>
                  </div>
                  <div className="timeline-rating">{item.stars}</div>
                  {item.meal.cuisine_type && (
                    <span className="badge badge-cuisine">{item.meal.cuisine_type}</span>
                  )}
                  {item.meal.notes && <p className="timeline-notes">{item.meal.notes}</p>}
                  {item.meal.title && <span className="timeline-sub-restaurant">{item.meal.restaurant_name}</span>}
                </div>
              </div>
            )))}
            <div key="journey-start" className="timeline-journey-start">
              <div className="journey-start-line" />
              <div className="journey-start-marker">
                <span className="journey-start-icon">&#9733;</span>
                <span className="journey-start-text">Journey starts here</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {mealDialog}
    </div>
  );
}
