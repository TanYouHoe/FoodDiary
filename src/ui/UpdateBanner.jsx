// UI: the app-update banner at the bottom of the screen. Reload starts the new
// version; the other button closes the banner.

import { updateBannerState } from './pwa.js';

export default function UpdateBanner({ needRefresh, offlineReady, onReload, onDismiss }) {
  const state = updateBannerState({ needRefresh, offlineReady });
  if (!state) return null;
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span className="update-banner-text">{state.message}</span>
      <div className="update-banner-actions">
        {state.canReload && <button className="btn-primary btn-sm" onClick={onReload}>Reload</button>}
        <button className="btn-secondary btn-sm" onClick={onDismiss}>{state.dismissLabel}</button>
      </div>
    </div>
  );
}
