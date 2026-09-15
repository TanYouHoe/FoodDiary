# FoodDiary: the four-layer shape

*Status: built, 2026-09-15. Behaviour kept. Defects found on the way are recorded below and not fixed.*

The rules are `docs/standards/four-layer.md` in the AI repo. This document records what moved,
how the move was checked, and what the move found.

## Before

| File | Lines | Layers it held |
| --- | --- | --- |
| `server.js` | 608 | All server rules, schema, migrations, seeds, auth, uploads, 30 routes, listen. Over the hard cap. |
| `suggest.js` | 326 | Scoring and meal-suggestion rules mixed with SQL; `Date.now()` and `Math.random()` inside. |
| `profile.js` | 113 | Profile maths mixed with SQL. |
| `src/pages/*`, `src/components/*` | 20 files | Each held fetch calls, state, business checks and markup together. |

Four files were dead: `src/pages/Settings.jsx`, `src/pages/MealTypes.jsx`, `src/pages/DishTypes.jsx`
and `src/components/MealSlots.jsx`. Nothing imported them. They are deleted.

## After

| Where | Layer | What |
| --- | --- | --- |
| `logic/` | Logic | 9 files. Accounts, catalogue, dishes, meal period, meals, planned, profile, restaurants, suggestions. Shared by server and browser. |
| `server/app.js` | Connector | Composition root. `createApp({ db, uploadsDir, distDir, jwtSecret, googleClientId, verifyGoogle, now, rng, log })`. |
| `server/db.js`, `server/routes/*`, `server/auth.js`, `server/uploads.js`, `server/rows.js`, `server/sql.js`, `server/profile-store.js`, `server/suggestions.js` | Connector | SQL, HTTP, JWT, disk. Every response row is mapped through a field list in `rows.js`. |
| `server.js` | Connector | 34 lines. Environment, database, listen. |
| `src/api.js`, `src/token-store.js`, `src/config.js`, `src/google.js`, `src/clipboard.js` | Connector | The only files that know a URL, a header, `localStorage`, `import.meta.env` or a Google script. `api.js` turns the meal `photo_urls` string into a `photos` array. |
| `src/ui/` | UI | Views and pure shaping functions. No hooks, no browser globals, no clock. |
| `src/hooks/`, `src/widgets/`, `src/pages/`, `src/App.jsx`, `src/AuthContext.jsx` | UI connector | State, effects, API calls; pass props and slots to the views. |

Largest file: `logic/suggest.js`, 197 lines. No file is over 400.

### Rules that now have one home

- **Priority order** was written four times: three SQL `CASE` expressions and a browser sort.
  `logic/planned.js` declares it; `server/sql.js` builds the `CASE` from it.
- **Built-in meal types** were written twice: the seed inserts and the backfill `IN (...)` list.
  Both read `SEED_MEAL_TYPES`.
- **Photo limit (10)** was a literal in the multer call and three literals in two dialogs.
- **Cuisine list, price labels, dish category labels, star and price formatting** each had two or
  three copies in the browser.

### Decisions

- **The move changes no behaviour.** `tests/api.test.js` (20 tests, the whole HTTP surface) was
  written first and passed against the *old* server on a fresh database. It then passed against
  the new app unchanged. Set `FOOD_DIARY_TEST_BASE` to run it against any running server.
- **Time and randomness are arguments.** `createApp` takes `now` and `rng`. `generateExplanation`
  took `Date.now()` from the air; it now takes `now`. The meal suggester tests no longer run 50
  random trials; they pass a fixed `rng` and assert exact picks.
- **A view never holds a hook.** Stateful pieces reach a view as a slot (`photos`, `dishEditor`,
  `restaurantDialog`) or as a render prop (`renderPhotos`). `tests/layering.test.js` fails on a
  hook, a browser global, a clock, a random source or a wiring import in `logic/` or `src/ui/`.
- **Client and server checks are twins, not one rule.** The browser's form checks
  (`checkMealTypeForm`, `checkDishTypeForm`, `checkRestaurantForm`, `checkMealForm`,
  `checkPlannedForm`) now sit in `logic/` beside the server's (`checkMealTypeInput`, ...). They
  still disagree (finding 8). Choosing one shape per §9.6 of the standard changes behaviour, so it
  is left for a separate change.
- **`npm test` was fixed.** `node --test tests/` treats `tests/` as one file on Node 24 and failed
  before any test ran. The script is now `node --test "tests/**/*.test.js"`.
- **`tests/auth.test.js` is gone.** It needed a live server on :3004 and wrote `test@test.com` into
  the real database. `tests/api.test.js` covers the same cases in memory.

## Tests

| Before | After |
| --- | --- |
| 32 logic tests; `npm test` broken; auth tests needed a live server | **95 tests, 0 fail**, no server needed |

## Findings — not fixed

Each is existing behaviour. Each needs its own change, because each fix changes what a user sees.

| # | Finding | Where |
| --- | --- | --- |
| 1 | **No ownership checks.** Any signed-in user can edit or delete any restaurant, meal or planned visit by id, upload photos to any meal, and read any group's meals, planned visits and members (`?group_id=`, `/groups/:id/members`) without being a member. | `server/routes/*` |
| 2 | **Stored XSS on the map.** Restaurant name, cuisine and address go into the info window as raw HTML. | `src/ui/lists.js` `infoWindowHtml` |
| 3 | **Dashboard suggestion cards lose their data.** The page keeps only name, restaurant, cuisine, dishes and `reason`. The badge (`suggestion_type`), price, stars and the server's `explanation` are dropped, and `reason` does not exist. The cards show a name and a cuisine only. | `src/ui/suggestions.js` `toMealSuggestions` |
| 4 | **Meal period and weekday depend on the server's time zone.** The browser sends UTC; the server reads local hours. On a UTC host a Malaysian lunch is breakfast. | `logic/meal-period.js` |
| 5 | **The log-a-meal date defaults to the UTC day** while the time defaults to local time. Between midnight and 08:00 in Malaysia the date is yesterday. | `src/ui/format.js` `utcDateInput` |
| 6 | **A cross-filled suggestion keeps its slot's label.** A "familiar" slot filled from the new pool is labelled familiar. | `logic/suggest.js` `assembleMealSuggestions` |
| 7 | **Custom dish types are invisible.** The server categorises a dish as a custom type (e.g. `curry`); the dish chips show only the nine built-in categories, so those dishes disappear from the dish editor and the meal detail. | `src/ui/dishes.js` `groupDishes` |
| 8 | **Form checks disagree across the wire.** The browser rejects a blank meal-type name and an empty slot list; the server accepts `"  "` and `[]`. The server stores a dish type named `"  "` as `""`. | `logic/catalog.js` |
| 9 | **`PUT /api/restaurants/:id` without `name` is a 500** (NOT NULL). No validation on update. | `logic/restaurants.js` `toRestaurantUpdate` |
| 10 | **A `null` in a meal's `dishes` array is a 500.** `typeof null === 'object'`. | `logic/dishes.js` `normalizeMealDishes` |
| 11 | **`JWT_SECRET` falls back to a public default.** | `server.js` |
| 12 | **"+ New" restaurant from the log-a-meal dialog reloads the page.** The add-restaurant `<form>` renders inside the log-a-meal `<form>`. Clicking *Add Restaurant* there fires a native `GET /dashboard?`: no restaurant is created and the half-filled meal is lost. Reproduced in the browser on the pre-refactor build (baseline worktree, port 3997) and on the refactored build — identical. Adding a restaurant from the Restaurants page works. | `src/widgets/AddMealModal.jsx`, `src/widgets/MealDetailModal.jsx` |
| 13 | **Photo preview URLs are never revoked.** The old code created one per render; the new code one per change. Revoking in an effect breaks previews under StrictMode, so it needs a different design. | `src/hooks/usePhotoPicker.js` |
| 14 | **Google sign-in returns the old avatar** in the response right after it sets a new one. | `server/routes/auth.js` |
