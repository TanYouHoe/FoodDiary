import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Dishes() {
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  useEffect(() => {
    api.getDishes().then(data => {
      setDishes(Array.isArray(data) ? data : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const categories = [...new Set(dishes.map(d => d.category).filter(Boolean))].sort();

  const filtered = dishes.filter(d => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory && d.category !== filterCategory) return false;
    return true;
  });

  if (loading) return <div className="loading">Loading dishes...</div>;

  return (
    <div className="dishes-page">
      <div className="page-header">
        <h2>Dishes</h2>
      </div>

      <div className="dishes-filters">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search dishes..."
          className="search-input"
        />
        <select
          className="filter-select"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">All types</option>
          {categories.map(c => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>{search || filterCategory ? 'No dishes match your filters.' : 'No dishes logged yet. Log a meal with dishes to see them here!'}</p>
        </div>
      ) : (
        <div className="dishes-list">
          {filtered.map((d, i) => (
            <div key={i} className="dish-row">
              <div className="dish-row-info">
                <span className="dish-row-name">{d.name}</span>
                {d.category && (
                  <span className="badge badge-cuisine">{d.category.charAt(0).toUpperCase() + d.category.slice(1)}</span>
                )}
              </div>
              <div className="dish-row-meta">
                <span className="dish-row-count">{d.times_eaten}x eaten</span>
                {d.best_rating && (
                  <span className="dish-row-rating">{'★'.repeat(d.best_rating)}{'☆'.repeat(5 - d.best_rating)}</span>
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
