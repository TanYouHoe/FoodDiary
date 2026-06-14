import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

function loadGoogleMaps(key) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve(window.google.maps);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
}

function RestaurantList({ restaurants }) {
  return (
    <div className="restaurant-list-fallback">
      {restaurants.length === 0 ? (
        <div className="empty-state">
          <p>No restaurants found. Add some on the Restaurants page.</p>
        </div>
      ) : (
        restaurants.map((r) => (
          <div key={r.id} className="restaurant-row">
            <div className="restaurant-info">
              <span className="restaurant-name">{r.name}</span>
              {r.cuisine_type && (
                <span className="badge badge-cuisine">{r.cuisine_type}</span>
              )}
              {r.address && <span className="restaurant-address">{r.address}</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function GoogleMap({ restaurants }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [mapError, setMapError] = useState('');
  const [mapReady, setMapReady] = useState(false);

  const initMap = useCallback(async () => {
    try {
      const maps = await loadGoogleMaps(MAPS_KEY);

      // Get user location or default to Kuala Lumpur
      let center = { lat: 3.139, lng: 101.6869 };
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch {
        // Use default center
      }

      const map = new maps.Map(mapRef.current, {
        center,
        zoom: 13,
      });
      mapInstance.current = map;
      setMapReady(true);

      // Add markers for restaurants that have addresses
      // In a real app, you'd geocode addresses. Here we just add info windows.
      const geocoder = new maps.Geocoder();
      restaurants.forEach((r) => {
        if (!r.address) return;
        geocoder.geocode({ address: r.address }, (results, status) => {
          if (status === 'OK' && results[0]) {
            const marker = new maps.Marker({
              map,
              position: results[0].geometry.location,
              title: r.name,
            });
            const infoWindow = new maps.InfoWindow({
              content: `<strong>${r.name}</strong>${r.cuisine_type ? `<br/>${r.cuisine_type}` : ''}${r.address ? `<br/>${r.address}` : ''}`,
            });
            marker.addListener('click', () => {
              infoWindow.open(map, marker);
            });
          }
        });
      });
    } catch (err) {
      setMapError(err.message);
    }
  }, [restaurants]);

  useEffect(() => {
    if (mapRef.current) {
      initMap();
    }
  }, [initMap]);

  if (mapError) {
    return (
      <div className="error-message">
        <p>Failed to load map: {mapError}</p>
        <p>Showing restaurant list instead:</p>
        <RestaurantList restaurants={restaurants} />
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      className="google-map"
      style={{ width: '100%', height: '500px' }}
    />
  );
}

export default function MapView() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await api.getRestaurants();
        setRestaurants(data.restaurants || data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading) return <div className="loading">Loading map...</div>;

  return (
    <div className="map-page">
      <h2>Map View</h2>

      {error && <div className="error-message">{error}</div>}

      {!MAPS_KEY ? (
        <div className="map-no-key">
          <p className="info-message">
            Set <code>VITE_GOOGLE_MAPS_KEY</code> in <code>.env</code> to enable map view.
          </p>
          <h3>Restaurants</h3>
          <RestaurantList restaurants={restaurants} />
        </div>
      ) : (
        <GoogleMap restaurants={restaurants} />
      )}
    </div>
  );
}
