# FoodDiary: public on the tunnel — defects, invite-only accounts, TOTP, PWA

*Status: planned 2026-09-15. Branch `feat/public-auth-pwa`.*

FoodDiary goes on the internet: it will run on the M6 (`C:\apps\FoodDiary`, port 3115) behind
the `slowmossriver.com` Cloudflare named tunnel. That changes what "safe" means. Every defect in
`2026-09-15-four-layer-shape.md` gets fixed, sign-up closes to invites, every account binds an
authenticator app (TOTP) as a second factor, and the web app becomes an installable PWA.

Decisions taken with the user:

- **Second factor:** TOTP authenticator app (Google Authenticator, Aegis, 1Password). Required for
  every account in production.
- **Sign-up:** invite only. The owner creates invite links. Google sign-in works for existing
  accounts, and for new accounts only with an invite.
- **Host:** the M6. The tunnel is being migrated to the M6.

## Rules for every task

- Read `C:\Users\You Hoe\Documents\AI\docs\standards\four-layer.md` before writing code. One file,
  one layer. Business rules live in `logic/` (pure: no clock, no randomness, no env, no I/O,
  imports only `logic/`). Views in `src/ui/` are pure (no hooks, no browser globals).
  `tests/layering.test.js` enforces this; it must stay green.
- Time and randomness arrive as arguments. `createApp` already takes `now` and `rng`.
- TDD: write the failing test first. Logic tests need no mock. `tests/api.test.js` drives the real
  app on an in-memory database — extend it for every HTTP behaviour change.
- `npm test` and `npm run build` must pass before each commit.
- Never open or modify the real `fooddiary.db`.
- Commit on `feat/public-auth-pwa` only. Never push. End every commit message with
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Update the findings table in `docs/plans/2026-09-15-four-layer-shape.md`: mark each fixed
  finding "Fixed — <commit subject>".
- Windows, PowerShell, Node 24. Paths contain a space (`You Hoe`): quote them.

---

## Task 1 — Server defects and ownership

Fixes findings 1, 6, 8, 9, 10, 11, 14.

1. **Roles.** Add `users.role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member'))`
   (migration in `server/db.js`). If no owner exists, the user with the lowest id becomes owner.
   `role` joins `USER_FIELDS`, so `req.user.role` and `/api/auth/me` carry it.
2. **Access rules in `logic/access.js`** (pure; takes the user and the record):
   - restaurant edit / delete / photo: owner, or `added_by === user.id`;
   - meal edit / delete / photos: `meal.user_id === user.id`;
   - planned visit delete: `planned.user_id === user.id`;
   - custom meal type / dish type edit / delete: owner, or `created_by === user.id`. Add nullable
     `created_by` to `meal_types` and `dish_types`; set it on create. A `NULL` creator means
     owner only. Built-in entries stay locked (403) as today;
   - group data (`?group_id=` on meals, planned and suggest; `GET /groups/:id/members`; creating
     or moving a meal or planned visit into a group): the user must be a member.
3. **Routes** answer 404 `{ error: 'Not found' }` for a missing record and 403
   `{ error: 'Not allowed' }` when the rule refuses, before any write. This covers
   `PUT/DELETE /restaurants/:id`, `POST /restaurants/:id/photo`, `PUT/DELETE /meals/:id`,
   `POST /meals/:id/photos`, `DELETE /planned/:id`, and the catalogue edits. The catalogue keeps
   its existing 404 messages (`Meal type not found`, `Dish type not found`).
4. **Finding 9:** `PUT /restaurants/:id` validates like create (400 `Name required`).
5. **Finding 10:** a `null`, number or other non-string non-object entry in `dishes` is skipped.
6. **Finding 11:** `logic/config.js` `checkServerConfig({ nodeEnv, jwtSecret })` returns a list of
   problems; in production a missing secret, or the development default, is a problem.
   `server.js` prints them and exits 1.
7. **Finding 14:** Google sign-in of an existing user returns the adopted avatar.
8. **Finding 8 — one home:** `checkMealTypeInput` trims the name, rejects a blank name
   (`Name is required`), requires `slots` to be an array with at least one slot whose trimmed
   name is not blank (`Add at least one slot`), and returns trimmed slots. `checkDishTypeInput`
   rejects a blank trimmed name. The browser form checks call these same functions (map the
   form to the body, then call them). No second copy of the rule remains.
9. **Finding 6:** a suggestion cross-filled from the other pool is labelled with the pool it came
   from.

Tests: logic tests for every rule; API tests with a second user proving each 403, each 404, and
that the allowed user still succeeds.

## Task 2 — Time zones

Fixes findings 4 and 5.

1. `logic/meal-period.js`: `getMealPeriod(visitedAt, timeZone)` and `getDayOfWeek(visitedAt,
   timeZone)` read hour and weekday in the given IANA zone (use `Intl.DateTimeFormat` with the
   `timeZone` option — formatting into a given zone is pure). The zone is required; a missing or
   invalid zone throws. Add `isValidTimeZone(tz)`.
2. Thread the zone through `buildProfileRows(meals, timeZone)`, `mealContext(now, timeZone)` and
   `excludeRecentlyEaten(…, mealPeriod, timeZone)`.
3. Add `users.timezone TEXT`. `src/api.js` sends `X-Time-Zone: <browser IANA zone>` on every
   request. The authenticate middleware stores a valid, changed zone on the user and rebuilds that
   user's profile. The zone for a request is: valid header, else the stored zone, else
   `defaultTimeZone` (a `createApp` option; `server.js` reads `DEFAULT_TIME_ZONE`, default
   `Asia/Kuala_Lumpur`). Profile rebuilds use the stored zone.
4. **Finding 5:** the log-a-meal date defaults to the local day (`toDateInput(now)`); delete
   `utcDateInput`.

Tests: one UTC instant lands in different periods and weekdays in `Asia/Kuala_Lumpur` and `UTC`;
an API test proves the header changes the stored zone and the profile.

## Task 3 — Frontend defects

Fixes findings 2, 3, 7, 12, 13.

1. **Finding 2 (XSS):** remove `infoWindowHtml`. A pure UI function returns the info window as
   plain text lines; `src/widgets/GoogleMap.jsx` builds DOM nodes with `textContent`. No HTML
   string made from data remains.
2. **Finding 3:** the dashboard keeps whole suggestion objects. Cards show the badge
   (`suggestion_type`), price, stars (`avg_rating`), cuisine, and the reason from `explanation`.
3. **Finding 7:** dish categories come from `GET /api/dish-types`. The picker lists the built-in
   order, then custom types. `groupDishes` shows every category a dish has: known order first,
   then others alphabetically, labelled with the capitalised name. The meal detail uses the same.
4. **Finding 12:** `MealFormDialog` renders the `restaurantDialog` slot outside its `<form>`
   element, so no form is nested in the DOM or in the React tree.
5. **Finding 13:** `usePhotoPicker` creates object URLs inside an effect, keeps them in state, and
   revokes them in the effect cleanup (safe under StrictMode).

Tests: pure UI functions get tests under `tests/ui/` (they are plain `.js`, importable by
`node --test`).

## Task 4 — Invite-only accounts

1. Table `invites`: `id`, `code_hash` (SHA-256 of the code), `role` (`owner`|`member`),
   `created_by` (nullable), `created_at`, `expires_at`, `used_by`, `used_at`, `revoked_at`.
   A code is 24 random bytes, base64url. Only its hash is stored; the code is shown once.
2. `logic/invites.js`: invite status at `now` (`valid`, `expired`, `used`, `revoked`), the 7-day
   lifetime, and who may create invites (owner only). An owner invite may exist only while there
   is no owner.
3. `POST /api/auth/register` requires `invite_code`; without a valid one → 403
   `A valid invite is required`. Using it marks it used and gives the invite's role.
4. `POST /api/auth/google`: an existing email signs in; a new email needs a valid `invite_code`
   in the body, else 403.
5. Owner routes: `POST /api/invites` → `{ id, code, url, expires_at }` (`url` from the
   `publicOrigin` option, else the request origin: `<origin>/invite/<code>`); `GET /api/invites`
   (no codes); `DELETE /api/invites/:id` (revoke). `GET /api/invites/check/:code` (public) →
   `{ valid }`.
6. `tools/create-invite.js [--owner]`: opens the database at `FOOD_DIARY_DATA_DIR` (or the
   default path), creates an invite, prints the URL. This is how the first owner is made on a
   fresh server.
7. **No stranger becomes owner.** Task 1's `promoteOwner` (lowest user id becomes owner at open)
   exists only for databases created before roles. Once invites exist, a database with no users
   gets its owner only from an owner invite: `ownerToPromote` must return nobody unless the
   database already holds users from before the `invites` table (record that fact in the
   migration). Test: a fresh database, a member signs up through a member invite (created in the
   test), reopen — nobody is owner.
7. Frontend: route `/invite/:code` (reachable signed out) checks the code and shows the
   create-account form with the invite; the Google button there passes the code. The login card
   says sign-up is by invite and drops "Create one". Settings gets an **Invites** tab for owners:
   create (copy link), list, revoke.

Tests: logic status tests; API tests for register without, with, with expired, with used and with
revoked invites; Google new-email path via the injected `verifyGoogle`; owner-only routes.

## Task 5 — TOTP second factor

1. `logic/totp.js` (pure): base32 encode / decode, time step for `now`, candidate steps for a
   ±1 window, code format check, match against codes computed by the caller, replay refusal
   (step ≤ last used step), `otpauth://` URI. `server/totp-crypto.js`: HOTP (HMAC-SHA1) with
   `node:crypto`, secret generation. Verify against the RFC 6238 SHA-1 test vectors.
2. Users get `totp_secret`, `totp_pending_secret`, `totp_enabled_at`, `totp_last_step`,
   `token_version INTEGER NOT NULL DEFAULT 0`. Table `backup_codes` (`user_id`, `code_hash`,
   `used_at`): 10 single-use codes, hashed.
3. **Sign-in:** a correct password or Google credential for a user with TOTP returns
   `{ mfa_required: true, mfa_token }` — a JWT with `typ: 'mfa'`, 5 minutes. `POST
   /api/auth/mfa { mfa_token, code | backup_code }` → `{ token, user }`.
4. **Required enrollment:** `createApp({ requireTotp })`. When on and the user has no TOTP, sign-in
   returns a token with `scope: 'enroll'`; it reaches only `/api/auth/me`, `/api/auth/totp/*` and
   `/api/auth/logout-all`; everything else answers 403 `{ error: 'Two-factor setup required',
   code: 'MFA_ENROLL_REQUIRED' }`.
5. **Enrollment:** `POST /api/auth/totp/setup` → `{ secret, otpauth_url }` (stores the pending
   secret); `POST /api/auth/totp/enable { code }` → enables, returns 10 backup codes (shown once)
   and a new full token. Replacing an enabled factor needs a current code, and the old factor
   keeps working until the new one is confirmed. `POST /api/auth/totp/backup-codes { code }`
   regenerates. `POST /api/auth/totp/disable { code }` only when `requireTotp` is off.
6. **Revocation:** every token carries `token_version`; `authenticate` refuses a stale one.
   `POST /api/auth/logout-all` bumps it. Enabling, replacing or resetting TOTP bumps it.
7. **Owner recovery:** `GET /api/users` (owner) and `POST /api/users/:id/totp/reset` (owner, not
   self) clear the factor and bump the token version.
8. **Lockout** (`logic/lockout.js` policy, stored in table `auth_failures`): 8 failures on one
   account, or 20 from one client IP, within 15 minutes lock that key for 15 minutes. Applies to
   password login, MFA codes, backup codes and registration. A locked key answers 429 without
   checking the credential.
9. **Frontend:** the login card gains the code step ("use a backup code" link). An enrollment
   screen shows a QR code (generate in the browser with the `qrcode` package), the grouped setup
   key, an "Open in authenticator app" `otpauth://` link, the confirm-code field, then the backup
   codes. Settings gets a **Security** tab: factor status, regenerate backup codes, sign out
   everywhere, and for owners the user list with "Reset two-factor".

Tests: RFC vectors, window, replay, lockout policy; API flows computing real codes with
`server/totp-crypto.js` and an injected `now`.

## Task 6 — Public hardening and configuration

1. `server.js` reads `PORT` (3004), `HOST` (`127.0.0.1`), `FOOD_DIARY_DATA_DIR` (when set: DB at
   `<dir>/fooddiary.db`, uploads at `<dir>/uploads`; unset keeps today's paths), `PUBLIC_ORIGIN`,
   `TRUST_PROXY`, `REQUIRE_TOTP` (on by default when `NODE_ENV=production`), `DEFAULT_TIME_ZONE`,
   `JWT_SECRET`, `GOOGLE_CLIENT_ID`. `package.json` `server` script loads `.env` with
   `node --env-file-if-exists=.env`.
2. **CORS:** allow only `PUBLIC_ORIGIN` (and `http://localhost:5176` when not in production). Same-
   origin requests need no CORS.
3. **Headers** (connector middleware): CSP (self; Google Identity and Maps scripts, frames and
   connections; images from self, `data:`, `blob:`, Google avatar and map hosts),
   `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
   strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(),
   microphone=()`, HSTS when `PUBLIC_ORIGIN` is https.
4. `app.set('trust proxy', TRUST_PROXY)` so lockout uses the real client IP behind cloudflared.
5. **Uploads:** stored names are 32 random hex chars plus an extension from the MIME type — never
   the client's file name (today `originalname` can carry `../`, and `x.html` sent as
   `image/png` is served as HTML on the app origin). Check the file's magic bytes (JPEG, PNG,
   WebP) after upload and delete a mismatch. `/uploads` responses carry
   `X-Content-Type-Options: nosniff`. Existing URLs keep working.
6. JSON body limit 1 MB. `/api/health` stays public and says nothing else.
7. `index.html` and `sw.js` are served `Cache-Control: no-cache`; hashed assets long-lived.

Tests: API tests for CORS, the headers, the upload name, and the config checks.

## Task 7 — PWA

1. `vite-plugin-pwa` (`generateSW`, `registerType: 'prompt'`). Manifest: name `Food Diary: First
   Bite`, short name `Food Diary`, `start_url` `/`, `scope` `/`, `display` `standalone`, theme and
   background colours from the app's CSS, icons 192, 512 and maskable 512 PNG, plus a 180 px
   `apple-touch-icon`. Icons come from a committed script (`tools/make-icons.mjs`, no native
   dependencies) and are committed.
2. Workbox: precache the build; `navigateFallback: '/index.html'` with a denylist for `/api/` and
   `/uploads/`; `/uploads/` images CacheFirst (200 entries, 30 days); `/api/` never cached.
3. Update prompt: a hook wraps the plugin's register function; a pure banner view offers
   "Reload". Install: a hook captures `beforeinstallprompt`; Settings → Appearance shows
   "Install app" when available.
4. `index.html`: `theme-color`, `apple-mobile-web-app-capable`, manifest link (the plugin injects).

Tests: the build output contains `manifest.webmanifest` and `sw.js` with the denylist; pure UI
functions tested.

## Deploy and tunnel (controller)

- `deploy/apps.json` entry `fooddiary`, port 3115, persist `data`, `.env`, `logs`.
- M6 `.env`: `NODE_ENV=production`, `HOST`, `PORT=3115`, `FOOD_DIARY_DATA_DIR=data`, `JWT_SECRET`,
  `GOOGLE_CLIENT_ID`, `PUBLIC_ORIGIN`, `TRUST_PROXY`.
- Tunnel ingress for the new hostname; first owner invite with `tools/create-invite.js --owner`.
- Test through the tunnel: invite sign-up, TOTP enrollment and sign-in, ownership, PWA install
  criteria (manifest, service worker, HTTPS).
