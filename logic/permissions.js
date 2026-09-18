// What a person may do in Food Diary.
//
// Pure. The shared auth module (family-auth) owns WHO you are and which roles
// you hold; this file says what those roles mean here. The module adds its own
// three account permissions to this catalog.
//
// A permission is asked for by name at the route, so adding one here and ticking
// it on a role changes what somebody can do without touching a route.

export const PERMISSIONS = [
  { key: 'diary.read', label: 'See meals, restaurants and plans', group: 'Food diary' },
  { key: 'diary.write', label: 'Add and change meals, restaurants and plans', group: 'Food diary' },
  { key: 'diary.catalog', label: 'Change the shared meal and dish types', group: 'Food diary' },
  { key: 'diary.groups', label: 'Make groups and invite people into them', group: 'Food diary' },
]

// The roles a new database starts with. An admin may change them, and add more,
// from the account console.
export const ROLES = [
  {
    key: 'admin',
    name: 'Admin',
    builtin: true,
    permissions: ['*'],
  },
  {
    key: 'member',
    name: 'Member',
    builtin: true,
    permissions: ['diary.read', 'diary.write', 'diary.catalog', 'diary.groups'],
  },
]

export default { PERMISSIONS, ROLES }
