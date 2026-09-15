// UI: the map page. The restaurant list shown without a map key or when the
// map fails, and the frame around the map. Slot: `map`.

export function RestaurantList({ restaurants }) {
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

export function MapError({ message, restaurants }) {
  return (
    <div className="error-message">
      <p>Failed to load map: {message}</p>
      <p>Showing restaurant list instead:</p>
      <RestaurantList restaurants={restaurants} />
    </div>
  );
}

export function MapCanvas({ canvasRef }) {
  return <div ref={canvasRef} className="google-map" style={{ width: '100%', height: '500px' }} />;
}

export function MapPageView({ loading, error, hasKey, restaurants, map }) {
  if (loading) return <div className="loading">Loading map...</div>;

  return (
    <div className="map-page">
      <h2>Map View</h2>

      {error && <div className="error-message">{error}</div>}

      {!hasKey ? (
        <div className="map-no-key">
          <p className="info-message">
            Set <code>VITE_GOOGLE_MAPS_KEY</code> in <code>.env</code> to enable map view.
          </p>
          <h3>Restaurants</h3>
          <RestaurantList restaurants={restaurants} />
        </div>
      ) : (
        map
      )}
    </div>
  );
}
