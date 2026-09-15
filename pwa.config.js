// Plain options for vite-plugin-pwa: the web app manifest and the service
// worker Workbox generates. vite.config.js passes them to the plugin;
// tools/icon-image.mjs reads the colours and icon list; tests read them with no
// build. No imports, so nothing here runs a build or touches a file.

// From src/index.css: the brand orange (buttons, active links) and the light
// theme background (--bg).
export const BRAND_COLOR = '#F97316';
export const BACKGROUND_COLOR = '#FAFAF9';

export const APPLE_TOUCH_ICON = 'apple-touch-icon.png';
export const PHOTO_CACHE = 'photos';

const DAY_SECONDS = 24 * 60 * 60;

export const manifest = {
  name: 'Food Diary: First Bite',
  short_name: 'Food Diary',
  description: 'Log restaurant visits and meals, plan where to eat next, and get suggestions that learn your habits.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: BRAND_COLOR,
  background_color: BACKGROUND_COLOR,
  icons: [
    { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

// Navigations to these paths go to the network, never to the cached app shell:
// API answers, photos and build files are not pages.
export const NAVIGATE_FALLBACK_DENYLIST = [/^\/api\//, /^\/uploads\//, /^\/assets\//];

export const pwaOptions = {
  strategies: 'generateSW',
  // A new worker waits until the user picks Reload (src/hooks/useAppUpdate.js).
  registerType: 'prompt',
  // No inline or injected register script: the CSP allows no inline script.
  injectRegister: false,
  includeAssets: [APPLE_TOUCH_ICON],
  manifest,
  workbox: {
    // The build's scripts, styles and index.html. The plugin itself adds the
    // manifest, its icons and includeAssets; a glob for them lists them twice.
    globPatterns: ['**/*.{js,css,html}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: NAVIGATE_FALLBACK_DENYLIST,
    // Workbox copies each urlPattern into sw.js as source text, so a pattern
    // may use only its own argument.
    runtimeCaching: [
      // Signed-in data is never stored by the worker.
      { urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/uploads/'),
        handler: 'CacheFirst',
        options: {
          cacheName: PHOTO_CACHE,
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * DAY_SECONDS },
          // Only a real photo: no opaque answer, no 404 or 403.
          cacheableResponse: { statuses: [200] },
        },
      },
    ],
    cleanupOutdatedCaches: true,
    clientsClaim: false,
    skipWaiting: false,
  },
  devOptions: { enabled: false },
};
