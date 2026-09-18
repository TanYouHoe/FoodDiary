// UI: the tabs of the settings popup.
//
// Signing in, the authenticator, the people and the roles are not here any more:
// the shared auth module serves its own console at /accounts, and the Account
// tab points at it.

export const ACCOUNT_TAB = { id: 'account', label: 'Account' };

export const SETTINGS_TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'meal-types', label: 'Meal Types' },
  { id: 'dish-types', label: 'Dish Types' },
  { id: 'patterns', label: 'Eating Patterns' },
  ACCOUNT_TAB,
];

export function settingsTabs() {
  return SETTINGS_TABS;
}
