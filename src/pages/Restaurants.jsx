import { useState, useEffect } from 'react';
import { api } from '../api';
import AddRestaurantModal from '../components/AddRestaurantModal';
import RestaurantDetailModal from '../components/RestaurantDetailModal';

function priceDisplay(range) {
  return '$'.repeat(range || 0);
}

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);

  const fetchRestaurants = async () => {
    setLoading(true);
    try {
      const data = await api.getRestaurants();
      setRestaurants(data.restaurants || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRestaurants();
  }, []);

  const filtered = restaurants.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="loading">Loading restaurants...</div>;

  return (
    <div className="restaurants-page">
      <div className="page-header">
        <h2>Restaurants</h2>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Add Restaurant
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showModal && (
        <AddRestaurantModal
          onClose={() => setShowModal(false)}
          onAdded={() => fetchRestaurants()}
        />
      )}

      {selectedRestaurant && (
        <RestaurantDetailModal
          restaurant={selectedRestaurant}
          onClose={() => setSelectedRestaurant(null)}
          onUpdated={() => fetchRestaurants()}
          onDeleted={() => fetchRestaurants()}
        />
      )}

      <div className="search-bar">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
            <div
              key={r.id}
              className="restaurant-row restaurant-row-clickable"
              onClick={() => setSelectedRestaurant(r)}
            >
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
