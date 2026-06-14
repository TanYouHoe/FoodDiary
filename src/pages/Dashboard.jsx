import { useState, useEffect } from 'react';
import { api } from '../api';
import AddMealModal from '../components/AddMealModal';
import PhotoCarousel from '../components/PhotoCarousel';
import MealDetailModal from '../components/MealDetailModal';

const CUISINE_OPTIONS = ['', 'Malay', 'Chinese', 'Indian', 'Western', 'Japanese', 'Korean', 'Thai', 'Italian', 'Other'];
const PRICE_OPTIONS = [
  { value: '', label: 'Any price' },
  { value: '1', label: '$' },
  { value: '2', label: '$$' },
  { value: '3', label: '$$$' },
  { value: '4', label: '$$$$' },
];

function priceDisplay(range) {
  return '$'.repeat(range || 0);
}

function starDisplay(rating) {
  const full = Math.round(rating || 0);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mealDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - mealDay) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function getDateKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Dashboard() {
  const [cuisine, setCuisine] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [mealTypeId, setMealTypeId] = useState('');
  const [mealTypes, setMealTypes] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestType, setSuggestType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestMode, setSuggestMode] = useState('personal');
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const [meals, setMeals] = useState([]);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);

  const fetchMeals = async () => {
    setMealsLoading(true);
    try {
      const data = await api.getMeals();
      setMeals(data.meals || data || []);
    } catch {
      // ignore
    } finally {
      setMealsLoading(false);
    }
  };

  useEffect(() => {
    fetchMeals();
    api.getMealTypes().then(setMealTypes).catch(() => {});
    api.getGroups().then(setGroups).catch(() => {});
  }, []);

  const fetchSuggestions = async (type) => {
    setLoading(true);
    setError('');
    setHasSearched(true);
    setSuggestType(type);
    try {
      const params = {};
      if (cuisine) params.cuisine = cuisine;
      if (priceRange) params.price_range = priceRange;
      if (suggestMode === 'group' && selectedGroupId) {
        params.group_id = selectedGroupId;
      }
      if (type === 'meal') {
        params.type = 'meal';
        if (mealTypeId) params.meal_type_id = mealTypeId;
        const data = await api.getSuggestions(params);
        const results = Array.isArray(data) ? data : data.suggestions || [];
        setSuggestions(results.map(s => ({
          name: s.name,
          restaurant_name: s.restaurant_name,
          restaurant_id: s.restaurant_id,
          cuisine_type: s.cuisine_type,
          dishes: s.dishes || [],
          reason: s.reason,
          type: 'meal',
        })));
      } else {
        const data = await api.getSuggestions(params);
        setSuggestions(data.suggestions || data || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch suggestions');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const dismiss = (index) => {
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-hero">
        <h2>Where should we eat?</h2>

        <div className="filter-bar">
          <div className="filter-chips">
            <select
              className="filter-select"
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
            >
              <option value="">All cuisines</option>
              {CUISINE_OPTIONS.filter(Boolean).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={priceRange}
              onChange={(e) => setPriceRange(e.target.value)}
            >
              {PRICE_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={mealTypeId}
              onChange={(e) => setMealTypeId(e.target.value)}
            >
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
                className={`toggle-btn ${suggestMode === 'personal' ? 'active' : ''}`}
                onClick={() => setSuggestMode('personal')}
              >
                For me
              </button>
              <button
                className={`toggle-btn ${suggestMode === 'group' ? 'active' : ''}`}
                onClick={() => setSuggestMode('group')}
              >
                For group
              </button>
            </div>
            {suggestMode === 'group' && groups.length > 0 && (
              <select
                className="filter-select"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
              >
                <option value="">Select group</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
            <button
              className="btn-primary btn-suggest"
              onClick={() => fetchSuggestions('meal')}
              disabled={loading || (suggestMode === 'group' && !selectedGroupId)}
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
          {/* Hero card — top pick */}
          {suggestions.length > 0 && (
            <div className="suggestion-hero">
              <div className="suggestion-card suggestion-card-hero">
                <div className="card-header">
                  <div className="card-header-left">
                    {suggestions[0].suggestion_type && (
                      <span className={`badge badge-suggestion ${suggestions[0].suggestion_type === 'familiar' ? 'badge-familiar' : 'badge-new'}`}>
                        {suggestions[0].suggestion_type === 'familiar' ? 'Your usual' : 'Try this'}
                      </span>
                    )}
                    <h3 className="card-name">{suggestions[0].name}</h3>
                  </div>
                  <button className="btn-dismiss" onClick={() => dismiss(0)} title="Dismiss">
                    &times;
                  </button>
                </div>
                <div className="card-body">
                  {suggestions[0].cuisine_type && (
                    <span className="badge badge-cuisine">{suggestions[0].cuisine_type}</span>
                  )}
                  {suggestions[0].price_range && (
                    <span className="badge badge-price">{priceDisplay(suggestions[0].price_range)}</span>
                  )}
                  {suggestions[0].avg_rating != null && (
                    <span className="card-rating" title={`${Number(suggestions[0].avg_rating).toFixed(1)} / 5`}>
                      {starDisplay(suggestions[0].avg_rating)}
                    </span>
                  )}
                </div>
                {suggestions[0].restaurant_name && suggestions[0].type === 'meal' && (
                  <p className="card-restaurant">at {suggestions[0].restaurant_name}</p>
                )}
                {Array.isArray(suggestions[0].dishes) && suggestions[0].dishes.length > 0 && (
                  <div className="card-dishes">
                    {suggestions[0].dishes.map((d, j) => (
                      <span key={j} className="dish-chip dish-chip-view">
                        {d.name}{d.from_restaurant && d.from_restaurant !== suggestions[0].restaurant_name ? ` (${d.from_restaurant})` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {suggestions[0].reason && (
                  <p className="card-reason">{suggestions[0].reason}</p>
                )}
              </div>
            </div>
          )}

          {/* Alternatives */}
          {suggestions.length > 1 && (
            <div className="suggestion-alternatives">
              {suggestions.slice(1).map((s, i) => (
                <div key={s.restaurant_id || (i + 1)} className="suggestion-card suggestion-card-alt">
                  <div className="card-header">
                    <div className="card-header-left">
                      {s.suggestion_type && (
                        <span className={`badge badge-suggestion ${s.suggestion_type === 'familiar' ? 'badge-familiar' : 'badge-new'}`}>
                          {s.suggestion_type === 'familiar' ? 'Your usual' : 'Try this'}
                        </span>
                      )}
                      <h3 className="card-name">{s.name}</h3>
                    </div>
                    <button className="btn-dismiss" onClick={() => dismiss(i + 1)} title="Dismiss">
                      &times;
                    </button>
                  </div>
                  <div className="card-body">
                    {s.cuisine_type && (
                      <span className="badge badge-cuisine">{s.cuisine_type}</span>
                    )}
                    {s.price_range && (
                      <span className="badge badge-price">{priceDisplay(s.price_range)}</span>
                    )}
                    {s.avg_rating != null && (
                      <span className="card-rating" title={`${Number(s.avg_rating).toFixed(1)} / 5`}>
                        {starDisplay(s.avg_rating)}
                      </span>
                    )}
                  </div>
                  {s.restaurant_name && s.type === 'meal' && (
                    <p className="card-restaurant">at {s.restaurant_name}</p>
                  )}
                  {Array.isArray(s.dishes) && s.dishes.length > 0 && (
                    <div className="card-dishes">
                      {s.dishes.map((d, j) => (
                        <span key={j} className="dish-chip dish-chip-view">
                          {d.name}{d.from_restaurant && d.from_restaurant !== s.restaurant_name ? ` (${d.from_restaurant})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {s.reason && (
                    <p className="card-reason">{s.reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Meal Timeline */}
      <div className="timeline-section">
        <div className="timeline-header">
          <h3>Recent Meals</h3>
          <button className="btn-primary btn-sm" onClick={() => setShowAddMeal(true)}>
            + Log Meal
          </button>
        </div>

        {showAddMeal && (
          <AddMealModal
            onClose={() => setShowAddMeal(false)}
            onAdded={() => fetchMeals()}
          />
        )}

        {mealsLoading ? (
          <div className="loading">Loading meals...</div>
        ) : meals.length === 0 ? (
          <div className="empty-state">
            <p>No meals yet. Log your first meal to start your food timeline!</p>
          </div>
        ) : (
          <div className="timeline">
            {(() => {
              let lastDateKey = null;
              const items = [];
              meals.forEach((m) => {
                const dateKey = getDateKey(m.visited_at);
                if (dateKey !== lastDateKey) {
                  items.push(
                    <div key={`date-${dateKey}`} className="timeline-date-separator">
                      <div className="timeline-date-line" />
                      <span className="timeline-date-label">{formatDateLabel(m.visited_at)}</span>
                      <div className="timeline-date-line" />
                    </div>
                  );
                  lastDateKey = dateKey;
                }
                items.push(
                  <div key={m.id} className="timeline-card" onClick={() => setSelectedMeal(m)} style={{ cursor: 'pointer' }}>
                    <PhotoCarousel urls={(() => {
                      try {
                        return m.photo_urls ? JSON.parse(m.photo_urls) : m.photo_url ? [m.photo_url] : [];
                      } catch { return []; }
                    })()} />
                    <div className="timeline-content">
                      <div className="timeline-top">
                        <span className="timeline-restaurant">{m.title || m.restaurant_name}</span>
                        <span className="timeline-time">{timeAgo(m.visited_at)}</span>
                      </div>
                      <div className="timeline-rating">
                        {'★'.repeat(m.rating)}{'☆'.repeat(5 - m.rating)}
                      </div>
                      {m.cuisine_type && (
                        <span className="badge badge-cuisine">{m.cuisine_type}</span>
                      )}
                      {m.notes && <p className="timeline-notes">{m.notes}</p>}
                      {m.title && <span className="timeline-sub-restaurant">{m.restaurant_name}</span>}
                    </div>
                  </div>
                );
              });
              items.push(
                <div key="journey-start" className="timeline-journey-start">
                  <div className="journey-start-line" />
                  <div className="journey-start-marker">
                    <span className="journey-start-icon">&#9733;</span>
                    <span className="journey-start-text">Journey starts here</span>
                  </div>
                </div>
              );
              return items;
            })()}
          </div>
        )}
      </div>

      {selectedMeal && (
        <MealDetailModal
          meal={selectedMeal}
          onClose={() => setSelectedMeal(null)}
          onUpdated={() => fetchMeals()}
          onDeleted={() => fetchMeals()}
        />
      )}
    </div>
  );
}
