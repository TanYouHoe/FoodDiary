// UI connector: the browser's install offer (Chrome, Edge, Android). Keeps the
// beforeinstallprompt event so the app can show it from its own button.
// Mount once, early (src/App.jsx): the browser sends the event one time.

import { useState, useEffect } from 'react';

export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null);

  useEffect(() => {
    const onPrompt = (event) => { event.preventDefault(); setPromptEvent(event); };
    const onInstalled = () => setPromptEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) return;
    setPromptEvent(null); // an event can prompt one time only
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch {
      // The browser refused to show the prompt; nothing to undo.
    }
  };

  return { canInstall: promptEvent !== null, install };
}
