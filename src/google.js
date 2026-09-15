// Connector: loads Google's browser scripts (Identity Services and Maps).

export function loadGoogleIdentity(onLoad) {
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.onload = () => onLoad(window.google.accounts.id);
  document.head.appendChild(script);
  return () => { document.head.removeChild(script); };
}

export function loadGoogleMaps(key) {
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

// The user's position, or null when it is refused or slow.
export function currentPosition(timeout) {
  return new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout },
      );
    } catch {
      resolve(null);
    }
  });
}
