// Connector: build-time settings read from the Vite environment.

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

// This page's build id, set by vite.config.js `define`.
export const APP_BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '';
