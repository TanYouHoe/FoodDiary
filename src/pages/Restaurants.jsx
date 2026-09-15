// UI connector: the restaurants page. Loads restaurants; opens the dialogs.

import { useState, useEffect } from 'react';
import { api } from '../api';
import { RestaurantsView } from '../ui/PageViews.jsx';
import AddRestaurantModal from '../widgets/AddRestaurantModal';
import RestaurantDetailModal from '../widgets/RestaurantDetailModal';

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
      setRestaurants(await api.getRestaurants());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRestaurants();
  }, []);

  return (
    <RestaurantsView
      loading={loading}
      error={error}
      restaurants={restaurants}
      search={search}
      addDialog={showModal && (
        <AddRestaurantModal onClose={() => setShowModal(false)} onAdded={fetchRestaurants} />
      )}
      detailDialog={selectedRestaurant && (
        <RestaurantDetailModal
          restaurant={selectedRestaurant}
          onClose={() => setSelectedRestaurant(null)}
          onUpdated={fetchRestaurants}
          onDeleted={fetchRestaurants}
        />
      )}
      onSearch={setSearch}
      onAdd={() => setShowModal(true)}
      onSelect={setSelectedRestaurant}
    />
  );
}
