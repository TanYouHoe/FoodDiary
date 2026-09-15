// UI: the tabs of the settings popup. Whether the user may see the invites tab
// is logic/invites.js; the caller passes the answer.

export const SETTINGS_TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'meal-types', label: 'Meal Types' },
  { id: 'dish-types', label: 'Dish Types' },
  { id: 'patterns', label: 'Eating Patterns' },
];

export const INVITES_TAB = { id: 'invites', label: 'Invites' };

export function settingsTabs({ showInvites }) {
  return showInvites ? [...SETTINGS_TABS, INVITES_TAB] : SETTINGS_TABS;
}
