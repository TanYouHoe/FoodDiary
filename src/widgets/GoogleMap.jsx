// UI connector: a Google map with a marker for each restaurant that has an
// address. Falls back to the plain list when the map cannot load.

import { useState, useEffect, useRef } from 'react';
import { loadGoogleMaps, currentPosition } from '../google.js';
import { infoWindowLines } from '../ui/lists.js';
import { MapCanvas, MapError } from '../ui/MapViews.jsx';

const KUALA_LUMPUR = { lat: 3.139, lng: 101.6869 };
const GEOLOCATION_TIMEOUT_MS = 5000;

// The info window as DOM nodes. Every line is set as text, so a restaurant
// name never becomes markup.
function infoWindowNode(restaurant) {
  const root = document.createElement('div');
  infoWindowLines(restaurant).forEach((line, i) => {
    if (i > 0) root.appendChild(document.createElement('br'));
    const el = document.createElement(line.strong ? 'strong' : 'span');
    el.textContent = line.text;
    root.appendChild(el);
  });
  return root;
}

export default function GoogleMap({ apiKey, restaurants }) {
  const canvasRef = useRef(null);
  const [mapError, setMapError] = useState('');

  useEffect(() => {
    if (!canvasRef.current) return;
    (async () => {
      try {
        const maps = await loadGoogleMaps(apiKey);
        const center = (await currentPosition(GEOLOCATION_TIMEOUT_MS)) || KUALA_LUMPUR;
        const map = new maps.Map(canvasRef.current, { center, zoom: 13 });

        const geocoder = new maps.Geocoder();
        restaurants.forEach((r) => {
          if (!r.address) return;
          geocoder.geocode({ address: r.address }, (results, status) => {
            if (status !== 'OK' || !results[0]) return;
            const marker = new maps.Marker({ map, position: results[0].geometry.location, title: r.name });
            const infoWindow = new maps.InfoWindow({ content: infoWindowNode(r) });
            marker.addListener('click', () => infoWindow.open(map, marker));
          });
        });
      } catch (err) {
        setMapError(err.message);
      }
    })();
  }, [apiKey, restaurants]);

  if (mapError) return <MapError message={mapError} restaurants={restaurants} />;
  return <MapCanvas canvasRef={canvasRef} />;
}
