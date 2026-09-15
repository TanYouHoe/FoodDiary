// UI connector: the service worker registration (vite-plugin-pwa). Says when a
// new version waits and starts it. Looks for a new worker every hour, when the
// page becomes visible, and at once when an API answer names a new build.
// In `npm run dev` the plugin gives a register function that does nothing.

import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { onNewBuild } from '../api.js';

// An open app never navigates, so the browser would not look for a new worker.
const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function useAppUpdate() {
  const registrationRef = useRef(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      registrationRef.current = registration ?? null;
    },
  });

  useEffect(() => {
    const check = async () => {
      const registration = registrationRef.current;
      if (!registration || !navigator.onLine) return;
      await registration.update().catch(() => {});
      // A worker already waiting (the user picked Later) brings the banner back.
      if (registration.waiting) setNeedRefresh(true);
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') check(); };

    const timer = setInterval(check, UPDATE_CHECK_MS);
    document.addEventListener('visibilitychange', onVisibility);
    const stopListening = onNewBuild(check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      stopListening();
    };
  }, [setNeedRefresh]);

  return {
    needRefresh,
    // Tells the waiting worker to take over; the page reloads when it does.
    update: () => updateServiceWorker(true),
    dismiss: () => setNeedRefresh(false),
  };
}
