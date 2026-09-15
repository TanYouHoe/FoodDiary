// UI: what the app-update banner says.

// needRefresh: a new version waits. offlineReady: the app shell is cached for
// the first time. Returns { message, canReload, dismissLabel }, or null for no banner.
export function updateBannerState({ needRefresh, offlineReady }) {
  if (needRefresh) return { message: 'A new version of Food Diary is ready.', canReload: true, dismissLabel: 'Later' };
  if (offlineReady) return { message: 'Ready to work offline.', canReload: false, dismissLabel: 'OK' };
  return null;
}
