// UI: what the app-update banner says.

// needRefresh: a new version waits. Returns { message, reloadLabel,
// dismissLabel }, or null for no banner.
export function updateBannerState({ needRefresh }) {
  if (!needRefresh) return null;
  return { message: 'A new version of Food Diary is ready.', reloadLabel: 'Reload', dismissLabel: 'Later' };
}
