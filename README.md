# Food Diary: First Bite

A full-stack food-journaling web app: an Express + [`better-sqlite3`](https://www.npmjs.com/package/better-sqlite3) API with a React/[Vite](https://vitejs.dev) single-page front end. Log restaurant visits and meals (ratings, calories, dishes, photos), keep a wishlist of places to try, share logging with a group via invite codes, and get personalized **restaurant and meal suggestions** from a built-in recommendation engine that learns your habits.

Self-contained: one SQLite file, one Express process. The server also serves the built React app, so a production deploy is a single `node server.js`.

## Features

- **Auth** — email + password (bcrypt hashing, 7-day JWT) and Google Sign-In (verifies Google ID tokens via [`google-auth-library`](https://www.npmjs.com/package/google-auth-library)). Sign-up is **invite only** — see [Account invites](#account-invites). A second factor (an authenticator app, TOTP) is **required in production** — see [Two-factor sign-in](#two-factor-sign-in).
- **Restaurants** — CRUD with cuisine / price-range / name-search filters and a single cover photo upload.
- **Meals** — log a visit with rating (1–5), title, calories, notes, a visit date, structured dishes, and up to 10 photos.
- **Dishes** — each meal's dishes are auto-categorized by keyword (Soup, Rice, Noodle, …); an aggregated `/api/dishes` view shows what you've eaten, how often, and where.
- **Meal types** — named slot templates (e.g. *Japanese Teishoku* = Soup / Rice / Main / Side). 12 cuisine templates are seeded; built-in (`is_seed`) ones are read-only.
- **Dish types** — editable keyword categories used for dish auto-categorization (9 seeded, built-in ones read-only).
- **Groups** — create or join a group with a generated invite code (owner / member roles) to share meals and planned visits.
- **Planned visits** — a wishlist of restaurants with low / medium / high priority.
- **Recommendation engine** — see [Recommendation engine](#recommendation-engine).
- **Tests** — `node --test` suite: the whole HTTP API on an in-memory database, the profile and suggestion rules, and a layering guard.

## Code layout

The code follows the four-layer standard (`docs/standards/four-layer.md` in the AI repo). Each file holds one layer; `tests/layering.test.js` keeps the pure files pure.

| Folder | Layer | Holds |
| ------ | ----- | ----- |
| `logic/` | Logic | Business rules. Pure functions, shared by the server and the browser. |
| `server/` | Connector | `app.js` composition root, `db.js`, `routes/*`, auth, uploads, the suggestion and profile stores. SQL lives here, rules do not. |
| `server.js` | Connector | Entry point: reads the environment, opens the database, listens. |
| `src/api.js`, `src/token-store.js`, `src/config.js`, `src/google.js`, `src/clipboard.js` | Connector | The browser's HTTP client, token storage, build settings, Google scripts, clipboard. |
| `src/ui/` | UI | Views (props in, markup out) and the pure functions that shape data into props. No hooks. |
| `src/hooks/`, `src/widgets/`, `src/pages/`, `src/App.jsx`, `src/AuthContext.jsx` | UI connector | Hooks, and the components that load data, hold state and pass props and slots to the views. |

## Run

```sh
npm install
```

### Production (single process)

Build the React app once, then start the server, which serves both the API and the built SPA from `dist/`:

```sh
npm run build      # vite build -> dist/
npm run server     # node server.js
```

Then open <http://localhost:3004>.

### Development (two processes)

Run the API and the Vite dev server side by side. Vite proxies `/api` and `/uploads` to the API, so use the Vite URL in the browser:

```sh
npm run server     # API on :3004  (or: npm run server:dev for --watch)
npm run dev        # Vite dev server on :5176, proxies to :3004
```

Then open <http://localhost:5176>.

### Tests

```sh
npm test           # node --test "tests/**/*.test.js"
```

The tests need no running server. `tests/api.test.js` builds the app on an in-memory database. To run the same assertions against a server that is already running on a fresh database, set `FOOD_DIARY_TEST_BASE=http://127.0.0.1:<port>` and `FOOD_DIARY_TEST_OWNER_INVITE=<code>` (from `node tools/create-invite.js --db <that server's database> --owner`).

### Ports

| Port   | Process                | Notes                                               |
| ------ | ---------------------- | --------------------------------------------------- |
| `3004` | Express API + SPA      | Override with the `PORT` env var.                   |
| `5176` | Vite dev server        | Dev only; proxies `/api` and `/uploads` to `:3004`. |

### Environment variables

| Var                     | Used by | Default                 | M6 value | Description                                                              |
| ----------------------- | ------- | ----------------------- | -------- | ---------------------------------------------------------------------- |
| `HOST`                  | server  | `127.0.0.1`             | `127.0.0.1` | Listen address. The default reaches this machine only; cloudflared on the same machine dials it. An IP address or host name, else the server refuses to start. |
| `PORT`                  | server  | `3004`                  | `3115` | API / SPA listen port, 1–65535. |
| `FOOD_DIARY_DATA_DIR`   | server, `tools/*` | _(unset)_     | `data` | Data directory: the database is `<dir>/fooddiary.db` and photos `<dir>/uploads`, created if missing. A relative path resolves against the app directory, not the working directory. Unset, the server uses `./fooddiary.db` and `./uploads`; the tools refuse to run without it or `--db`. |
| `NODE_ENV`              | server  | _(unset)_               | `production` | `production` enforces the checks below and drops the Vite dev origin from CORS. |
| `JWT_SECRET`            | server  | `food-diary-dev-secret` | a random value | HMAC secret for signing JWTs. **In production it must be set, at least 32 characters, and not the default**; the server refuses to start otherwise. |
| `GOOGLE_CLIENT_ID`      | server  | _(unset)_               | the OAuth client ID | Google OAuth client ID; the audience that Google ID tokens are verified against. Required for Google Sign-In. |
| `DEFAULT_TIME_ZONE`     | server, `tools/*` | `Asia/Kuala_Lumpur` | _(default)_ | IANA time zone for users whose browser has not sent one yet. The server refuses to start with an unknown zone. |
| `PUBLIC_ORIGIN`         | server, `tools/create-invite.js` | _(request origin)_ / `http://localhost:3004` | `https://3393715fc3.slowmossriver.com` | The app's public origin: account invite links, the CORS allow-list, and HSTS when https. **Required in production, and must be https**; the server refuses to start otherwise. Outside production, http also works and an unset value uses the request's origin. |
| `TRUST_PROXY`           | server  | _(unset: no proxy)_     | `loopback` | Proxies trusted to name the client IP in `X-Forwarded-For`, so the sign-in lockout counts the real IP: `loopback` (a proxy on this machine, such as cloudflared), a hop count, or a comma-separated IP/CIDR list. `true` and anything else stop the server: any client could then pick its own IP. |
| `REQUIRE_TOTP`          | server  | `1` in production, else `0` | _(default: on)_ | `1`: every account must bind an authenticator app before it can use the app. `0`: optional. Any other value stops the server. |
| `VITE_GOOGLE_CLIENT_ID` | client  | _(unset)_               | — | Same client ID, exposed to the front end (read in `src/config.js`, used through `src/hooks/useGoogleButton.js`). Set in `.env`. If unset, the Google button is hidden. |

`npm run server` and `npm run server:dev` load `.env` when it exists (`node --env-file-if-exists=.env`); variables already set in the environment win. Every server value is checked at start-up (`logic/config.js` `checkServerConfig`), and a bad value stops the server with a message. The client-side `VITE_GOOGLE_CLIENT_ID` is read from `.env` at build/dev time by Vite. A Google OAuth client and its `client_secret_*.json` are gitignored.

### Public hardening

- **CORS** — only `PUBLIC_ORIGIN` (plus `http://localhost:5176` outside production) gets CORS headers. Any other origin gets none, and its preflight is not approved. Same-origin requests need no CORS.
- **Security headers** on every response: a Content-Security-Policy (`default-src 'self'`; scripts only from this origin, Google Identity Services and Google Maps, never inline or eval; inline styles allowed because React style attributes and Google's widgets need them; `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(), microphone=()`, `Cross-Origin-Opener-Policy: same-origin-allow-popups` (Google sign-in popups), and `Strict-Transport-Security` when `PUBLIC_ORIGIN` is https. The values are built in `logic/http-policy.js`.
- **Caching** — `index.html` (also as the SPA fallback), `sw.js` and `manifest.webmanifest` are `no-cache`; hashed build files under `/assets/` are cached for a year (`immutable`).
- **Body limit** — JSON bodies over 1 MB answer 413 with a JSON error.

## API

All routes are JSON. Every route except the auth endpoints and `/api/health` requires an `Authorization: Bearer <token>` header. Tokens come from register / login / Google and expire after 7 days.

### Auth

| Method | Path                 | Description                                              |
| ------ | -------------------- | ------------------------------------------------------- |
| `GET`  | `/api/health`        | Liveness check — `{ status: "ok" }`.                    |
| `POST` | `/api/auth/register` | Register `{ name, email, password, invite_code }` → `{ token, user }`. 403 without a valid invite. |
| `POST` | `/api/auth/login`    | Login `{ email, password }` → `{ token, user }`, or `{ mfa_required: true, mfa_token }` when the account has a second factor. |
| `POST` | `/api/auth/mfa`      | `{ mfa_token, code }` or `{ mfa_token, backup_code }` → `{ token, user }`. The mfa token lasts 5 minutes. |
| `GET`  | `/api/auth/me`       | Current user (auth required), with `totp_enabled` and `totp_required`. |
| `POST` | `/api/auth/logout-all` | Ends every session of the user and forgets a pending authenticator setup (204). |
| `POST` | `/api/auth/google`   | Exchange a Google ID token `{ credential, invite_code? }` → `{ token, user }` (or the code step): 200 for an existing account, 201 for a new one (needs `invite_code`). A token whose email Google has not verified gets 401. |
| `POST` | `/api/auth/totp/setup` | → `{ secret, otpauth_url }`. Replacing an enabled factor needs `{ code }` or `{ backup_code }`. A first setup returns the same pending secret for 30 minutes, until it is confirmed or cancelled. |
| `POST` | `/api/auth/totp/cancel` | Forgets the pending secret (204). |
| `POST` | `/api/auth/totp/enable` | `{ code }` from the new secret → `{ backup_codes, token, user }`. |
| `POST` | `/api/auth/totp/backup-codes` | `{ code }` → `{ backup_codes }` (a new set of 10). |
| `POST` | `/api/auth/totp/disable` | `{ code }` → `{ token, user }`. 403 when `REQUIRE_TOTP` is on. |
| `GET`  | `/api/users`         | Owner. Users with `totp_enabled`.                        |
| `POST` | `/api/users/:id/totp/reset` | Owner, not self. When the owner has a factor, the owner's own `{ code }` or `{ backup_code }` is required. Clears that user's factor, backup codes and code lockout, and ends their sessions. |

### Two-factor sign-in

Every account can bind an authenticator app (Google Authenticator, Aegis, 1Password). With `REQUIRE_TOTP` on (the production default), a user without one gets a session that reaches only `/me`, setup, enable and logout-all; every other route answers 403 `{ code: 'MFA_ENROLL_REQUIRED' }`, and the app shows the setup screen (QR code, setup key, 10 backup codes shown once).

- **Codes** are single use: a code whose 30-second step is not newer than the last accepted step is refused. One step of drift either side is accepted.
- **Backup codes** (`xxxx-xxxx`) work once each. They are stored as HMAC-SHA256 under a key derived from `JWT_SECRET`, so changing `JWT_SECRET` makes existing backup codes stop working. A new set replaces the old one. A backup code can stand in for a current code at sign-in, to replace the authenticator, and to make new backup codes. To replace the authenticator, setup only checks the backup code; confirming the new authenticator spends it, and fails (409) if it was used meanwhile.
- **Sessions** carry a token version. Sign out everywhere, and enabling, replacing, disabling or resetting the factor, raise it, so older tokens answer 401 `Session expired`.
- **Lost phone:** the owner resets the user's factor in **Settings → Security**, confirming with the owner's own current code or backup code; the user then sets up a new one at the next sign-in. The owner cannot reset their own factor there; they replace it in **Settings → Security** with a current code or a backup code. An owner who has lost the phone **and** the backup codes resets from the server's console:

  ```sh
  node tools/reset-two-factor.js --db <path-to>/fooddiary.db --email owner@example.com
  FOOD_DIARY_DATA_DIR=<dir> node tools/reset-two-factor.js --email owner@example.com
  ```

  It removes the authenticator and backup codes of that user and ends every session; exit 1 if no user has that email. Like `tools/create-invite.js`, it refuses to run unless the database is named.
- **Lockout:** 8 failures on one account (password by email, codes by user) or 20 from one IP within 15 minutes lock that key for 15 minutes (429). Codes and backup codes also count per user over a day: 30 failures within 24 hours lock codes for 24 hours. That code lock also blocks Google sign-in for the account (it reaches the same code step) and any authenticator change; an owner reset or `tools/reset-two-factor.js` clears it. Registration, Google sign-up with an invite and the invite check count by IP only. A success clears the 15-minute account count only.
- **Lockout trade-off:** the password lock is per email, whether or not the account exists, so anyone who knows an email can lock that person's password login for 15 minutes. Google sign-in still works for them meanwhile. The same holds for codes once the password is known.
- **Code step:** an mfa token works once and lasts 5 minutes. A login for an unknown email still runs one bcrypt comparison (against a dummy hash), so timing does not reveal accounts.
- **Deploy note:** tokens from before this version carry no token version, so every session ends at the first deploy of this version and every user signs in again.

### Account invites

Sign-up is by invite only. An account invite (not a group invite code) is a link `<origin>/invite/<code>`: it makes one account, gives that account its role (`owner` or `member`) and works for 7 days. Only a SHA-256 hash of the code is stored; the code is shown once.

On a fresh server, make the first owner from the command line, then open the printed link:

```sh
node tools/create-invite.js --db <path-to>/fooddiary.db --owner   # only while there is no owner; else prints an error and exits 1
FOOD_DIARY_DATA_DIR=<dir> node tools/create-invite.js             # a member invite in <dir>/fooddiary.db
```

The tool refuses to run unless the database is named: `--db <path>`, or `FOOD_DIARY_DATA_DIR` (then `<dir>/fooddiary.db`; the M6 deploy sets it). It builds the link on `PUBLIC_ORIGIN` (default `http://localhost:3004`). After that, the owner creates member invites in **Settings → Invites**. A database that had users before invites existed keeps the old rule: when nobody is owner, the lowest user id becomes owner at start-up. A newer database never promotes anyone.

| Method   | Path                         | Description                                                   |
| -------- | ---------------------------- | ------------------------------------------------------------ |
| `POST`   | `/api/invites/check`         | Public. Body `{ code }` → `{ valid }` and nothing else.       |
| `POST`   | `/api/invites`               | Owner. Create a member invite → `{ id, code, url, role, expires_at }`. |
| `GET`    | `/api/invites`               | Owner. List invites with status and who used them; no codes. |
| `DELETE` | `/api/invites/:id`           | Owner. Revoke (404 if missing, 409 if already used).         |

### Restaurants

| Method   | Path                          | Description                                                   |
| -------- | ----------------------------- | ------------------------------------------------------------ |
| `GET`    | `/api/restaurants`            | List; filters `?cuisine=`, `?price_range=`, `?search=`.      |
| `GET`    | `/api/restaurants/:id`        | Single restaurant.                                           |
| `POST`   | `/api/restaurants`            | Create.                                                      |
| `POST`   | `/api/restaurants/:id/photo`  | Upload cover photo (multipart, field `photo`).              |
| `PUT`    | `/api/restaurants/:id`        | Update.                                                      |
| `DELETE` | `/api/restaurants/:id`        | Delete.                                                      |

### Meals & dishes

| Method   | Path                      | Description                                                       |
| -------- | ------------------------- | ---------------------------------------------------------------- |
| `GET`    | `/api/meals`              | List your meals; `?restaurant_id=` or `?group_id=` to scope.    |
| `POST`   | `/api/meals`             | Create a meal (rebuilds your meal profile).                      |
| `POST`   | `/api/meals/:id/photos`   | Add photos (multipart, field `photos`, up to 10).               |
| `PUT`    | `/api/meals/:id`          | Update a meal (rebuilds your meal profile).                      |
| `DELETE` | `/api/meals/:id`          | Delete a meal (rebuilds your meal profile).                      |
| `GET`    | `/api/dishes`             | Aggregated view of dishes you've eaten (count, best rating, where). |

### Meal types & dish types

| Method   | Path                  | Description                                          |
| -------- | --------------------- | --------------------------------------------------- |
| `GET`    | `/api/meal-types`     | List; `?cuisine_type=` filters (plus generic ones). |
| `POST`   | `/api/meal-types`     | Create a custom meal type.                           |
| `PUT`    | `/api/meal-types/:id` | Update (built-in `is_seed` types rejected, 403).    |
| `DELETE` | `/api/meal-types/:id` | Delete (built-in `is_seed` types rejected, 403).    |
| `GET`    | `/api/dish-types`     | List dish categories.                               |
| `POST`   | `/api/dish-types`     | Create a custom dish type.                           |
| `PUT`    | `/api/dish-types/:id` | Update (built-in rejected, 403).                    |
| `DELETE` | `/api/dish-types/:id` | Delete (built-in rejected, 403).                    |

### Groups & planned visits

| Method   | Path                       | Description                                        |
| -------- | -------------------------- | ------------------------------------------------- |
| `GET`    | `/api/groups`              | Groups you belong to (with your role).            |
| `POST`   | `/api/groups`              | Create a group (you become owner; get an invite code). |
| `GET`    | `/api/groups/:id/members`  | List a group's members.                           |
| `POST`   | `/api/groups/join`         | Join via `{ invite_code }`.                       |
| `GET`    | `/api/planned`             | Planned visits; `?group_id=` to scope to a group. |
| `POST`   | `/api/planned`             | Add a planned visit (`priority` low/medium/high). |
| `DELETE` | `/api/planned/:id`         | Remove a planned visit.                           |

### Suggestions & profile

| Method | Path                      | Description                                                            |
| ------ | ------------------------- | --------------------------------------------------------------------- |
| `GET`  | `/api/suggest`            | Recommendations. `?type=meal` → profile-driven meal suggester; otherwise restaurant scorer. Also accepts `?group_id=`, `?cuisine=`, `?price_range=`, `?meal_type_id=`. |
| `GET`  | `/api/profile`            | Your learned per-(day, meal-period) meal profile rows.                |

### Static

| Path             | Description                                                  |
| ---------------- | ---------------------------------------------------------- |
| `/uploads/*`     | Uploaded restaurant/meal photos.                          |
| `*` (catch-all)  | Serves `dist/index.html` for client-side routing.          |

## Recommendation engine

Two algorithms, selected by the `type` query param on `/api/suggest`. The rules are in [`logic/suggest.js`](logic/suggest.js); [`server/suggestions.js`](server/suggestions.js) reads the rows and calls them.

**Restaurant scorer** (`getSuggestions`, default) ranks restaurants by a weighted sum and returns the top 3, each with a human-readable explanation:

| Signal      | Weight | Meaning                                                       |
| ----------- | ------ | ------------------------------------------------------------ |
| `recency`   | 0.35   | Days since last visit ÷ 30 (capped at 1); never-visited = 1. |
| `rating`    | 0.30   | Average rating ÷ 5.                                          |
| `variety`   | 0.20   | 1 if the cuisine isn't in your last 3 meals, else 0.         |
| `frequency` | 0.15   | Visit count ÷ most-visited count (proven favorites).        |
| planned bonus | —    | +0.3 / +0.2 / +0.1 added for high / medium / low planned priority. |

**Meal suggester** (`suggestMeal`, `?type=meal`) is profile-driven. For the current day-of-week and meal period it reads your learned profile (`user_meal_profiles`) and blends *familiar* favorites with *new* picks according to your `adventure_ratio` for that slot. With little history it falls back to the restaurant scorer.

Meal periods (from [`logic/meal-period.js`](logic/meal-period.js), by hour of `visited_at` in the user's time zone — the browser sends it as `X-Time-Zone`, the server stores it on the user, and `DEFAULT_TIME_ZONE` covers users it has not heard from): `breakfast` (<11), `lunch` (11–15), `tea` (15–17), `dinner` (17–21), `supper` (≥21).

The profile (`user_meal_profiles`) is **rebuilt automatically** on every meal create / update / delete, and when the user's stored time zone changes. The rebuild after a zone change runs after the response, so the very next request may still see the old profile. `buildProfileRows` ([`logic/profile.js`](logic/profile.js)) computes, per (day-of-week, meal-period), the average price range, adventure ratio, average rating, meal frequency (per week), group ratio, and total meals.

## Data & storage

- **Database** — a single SQLite file, `fooddiary.db`, in the project root (or in `FOOD_DIARY_DATA_DIR`). Opened with WAL journaling and foreign keys on. The schema is created idempotently (`CREATE TABLE IF NOT EXISTS`) on startup, with in-code migrations (`ALTER TABLE` guarded by `pragma_table_info` checks) and seeding of meal types and dish types when empty. The DB and its `-wal` / `-shm` sidecars are gitignored.
- **Uploads** — photos are stored on disk under `uploads/` (or `<FOOD_DIARY_DATA_DIR>/uploads`, created at startup) and served from `/uploads`. Accepted types: JPEG, PNG, WebP; max 5 MB per file. Restaurant cover = 1 photo; meals = up to 10 photos. The server names each file: 32 random hex characters plus `.jpg`, `.png` or `.webp` from the declared type — never the client's file name. After the upload the file's first bytes must match that type (JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF….WEBP`); otherwise every file of the request is deleted and the answer is 400 `{ error: 'Not a supported image' }`. `/uploads` never serves dot files or directory indexes, and the global `nosniff` header stops a browser from reading a photo as another type. Older `<timestamp>-<original>` names keep working. The `uploads/` directory is gitignored.

## Integration

This app is self-contained — it makes no outbound calls to sibling localhost servers, and uses only its own Express API + SQLite. In dev, the Vite server (`:5176`) proxies `/api` and `/uploads` to the API (`:3004`).

**Nova integration: planned only.** [Nova](../Nova) does not currently proxy or embed this app — there is no `/proxy/fooddiary` mount in Nova and it is not in the Monitor service registry. Nova's PA-completion roadmap lists "fooddiary" as an intended proxied service but assigns it no working port (and reuses `:3004` for a different planned service, which would collide with this app's actual port). Treat any Nova wiring as aspirational until it actually exists.
