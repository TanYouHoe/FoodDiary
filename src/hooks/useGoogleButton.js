// UI connector: renders the Google sign-in button into a ref'd element and
// hands each credential to onCredential. Shared by the login and invite pages.

import { useEffect, useRef } from 'react';
import { GOOGLE_CLIENT_ID } from '../config.js';
import { loadGoogleIdentity } from '../google.js';

const GOOGLE_BUTTON = { theme: 'outline', size: 'large', width: '100%', text: 'continue_with', shape: 'rectangular' };

// enabled: the element is on screen. Returns { ref, show }.
export function useGoogleButton(onCredential, enabled = true) {
  const ref = useRef(null);
  const latest = useRef(onCredential);
  latest.current = onCredential;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !enabled) return;
    return loadGoogleIdentity((identity) => {
      identity.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => latest.current(response.credential),
      });
      if (ref.current) identity.renderButton(ref.current, GOOGLE_BUTTON);
    });
  }, [enabled]);

  return { ref, show: Boolean(GOOGLE_CLIENT_ID) };
}
