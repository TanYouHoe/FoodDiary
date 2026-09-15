// UI connector: the map page. Loads restaurants; shows the map when a key is set.

import { useState, useEffect } from 'react';
import { api } from '../api';
import { GOOGLE_MAPS_KEY } from '../config.js';
import { MapPageView } from '../ui/MapViews.jsx';
import GoogleMap from '../widgets/GoogleMap';

export default function MapView() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getRestaurants()
      .then(setRestaurants)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <MapPageView
      loading={loading}
      error={error}
      hasKey={Boolean(GOOGLE_MAPS_KEY)}
      restaurants={restaurants}
      map={<GoogleMap apiKey={GOOGLE_MAPS_KEY} restaurants={restaurants} />}
    />
  );
}
