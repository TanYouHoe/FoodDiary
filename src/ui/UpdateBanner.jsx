// UI: the app-update banner at the bottom of the screen. Reload starts the new
// version; Later closes the banner.

import { updateBannerState } from './pwa.js';

export default function UpdateBanner({ needRefresh, onReload, onDismiss }) {
  const state = updateBannerState({ needRefresh });
  if (!state) return null;
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span className="update-banner-text">{state.message}</span>
      <div className="update-banner-actions">
        <button className="btn-primary btn-sm" onClick={onReload}>{state.reloadLabel}</button>
        <button className="btn-secondary btn-sm" onClick={onDismiss}>{state.dismissLabel}</button>
      </div>
    </div>
  );
}
