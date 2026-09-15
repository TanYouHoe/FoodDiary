// Connector: the service worker's photo cache in this browser.

import { PHOTO_CACHE } from '../pwa.config.js';

// Removes the cached photos, so the next person on this device does not get
// them. Never throws. Resolves true when a cache was removed.
export function clearPhotoCache() {
  if (!('caches' in window)) return Promise.resolve(false);
  return window.caches.delete(PHOTO_CACHE).catch(() => false);
}
