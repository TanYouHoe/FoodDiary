import { useState, useEffect } from 'react';
import { api } from '../api';
import AddMealModal from '../components/AddMealModal';
import MealDetailModal from '../components/MealDetailModal';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AddMeal() {
  const [meals, setMeals] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [mData, rData] = await Promise.all([api.getMeals(), api.getRestaurants()]);
      setMeals(mData.meals || mData || []);
      setRestaurants(rData.restaurants || rData || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const restaurantName = (id) => {
    const r = restaurants.find((r) => r.id === id);
    return r ? r.name : 'Unknown';
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="add-meal-page">
      <div className="page-header">
        <h2>Meals</h2>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Log a Meal
        </button>
      </div>

      {showModal && (
        <AddMealModal
          onClose={() => setShowModal(false)}
          onAdded={() => fetchData()}
        />
      )}

      {meals.length === 0 ? (
        <div className="empty-state">
          <p>No meals logged yet. Tap the button above to log your first meal!</p>
        </div>
      ) : (
        <div className="meals-list">
          {meals.map((m) => (
            <div key={m.id} className="meal-row" onClick={() => setSelectedMeal(m)} style={{ cursor: 'pointer' }}>
              {(() => {
                const urls = m.photo_urls ? JSON.parse(m.photo_urls) : m.photo_url ? [m.photo_url] : [];
                return urls.length > 0 && (
                  <div className="meal-thumbnails">
                    {urls.slice(0, 3).map((url, i) => (
                      <img key={i} src={url} alt={`Meal ${i + 1}`} className="meal-thumbnail" />
                    ))}
                    {urls.length > 3 && <span className="meal-thumb-more">+{urls.length - 3}</span>}
                  </div>
                );
              })()}
              <div className="meal-info">
                <span className="meal-restaurant-name">
                  {m.title || m.restaurant_name || restaurantName(m.restaurant_id)}
                </span>
                {m.title && (
                  <span className="meal-sub-restaurant">{m.restaurant_name || restaurantName(m.restaurant_id)}</span>
                )}
                <span className="meal-rating">
                  {'★'.repeat(m.rating)}{'☆'.repeat(5 - m.rating)}
                </span>
                <span className="meal-date">{formatDate(m.visited_at)}</span>
                {m.notes && <span className="meal-notes">{m.notes}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedMeal && (
        <MealDetailModal
          meal={selectedMeal}
          onClose={() => setSelectedMeal(null)}
          onUpdated={() => fetchData()}
          onDeleted={() => { setSelectedMeal(null); fetchData(); }}
        />
      )}
    </div>
  );
}
