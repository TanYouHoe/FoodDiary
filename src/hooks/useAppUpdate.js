// UI connector: the service worker registration (vite-plugin-pwa). Says when a
// new version waits or the app first works offline, and starts the new version.
// In `npm run dev` the plugin gives a register function that does nothing.

import { useRegisterSW } from 'virtual:pwa-register/react';

// An open app never navigates, so the browser would not look for a new worker.
const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function useAppUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => {});
      }, UPDATE_CHECK_MS);
    },
  });

  return {
    needRefresh,
    offlineReady,
    // Tells the waiting worker to take over; the page reloads when it does.
    update: () => updateServiceWorker(true),
    dismiss: () => { setNeedRefresh(false); setOfflineReady(false); },
  };
}
