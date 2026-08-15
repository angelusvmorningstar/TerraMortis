# Data Sources of Truth — TM Suite

This document maps every data domain to its authoritative source: the MongoDB collection, the API endpoint, and the UI surface where it is managed. Before building any feature that reads or writes data, check here first.

---

## Character Data

| Domain | Collection | API | Managed in UI |
|--------|-----------|-----|---------------|
| Characters (schema, stats, merits) | `characters` | `GET/PUT /api/characters` | admin.html → Player tab (character grid + sheet editor) |
| Character tracker state (vitae/WP/health) | `tracker_state` | `GET/PUT /api/tracker_state` *(ST cross-character; players read+write their own per `server/routes/tracker.js:9-15` `canAccess()`)* | game app → Tracker tab |
| Questionnaire responses | `questionnaire` | `GET/PUT /api/questionnaire` | player.html → questionnaire flow |
| Character history | `history` | `GET/PUT /api/history` | admin.html → Player tab |

**Tracker client note:** Two localStorage implementations currently exist and are fragmented:
- `public/js/game/tracker.js` — keyed by `_id`, used by suite sheet + ST tracker tab *(canonical going forward)*
- `public/js/suite/tracker.js` — keyed by character name, used by feed roller *(legacy, to be replaced)*

Migration to `tracker_state` API is task #10. Until done, tracker state is localStorage only and not shared across devices.

---

## Territory & City

| Domain | Collection | API | Managed in UI |
|--------|-----------|-----|---------------|
| Territories (stats, ambience, regent) | `territories` | `GET` (auth) / `POST,PUT` (ST only) / `PATCH /:id/feeding-rights` (regent or ST) | admin.html → City tab (ST); game app → Regency tab (regent player) |

**Feeding-rights write path (RFR.1):** regent's player writes only `feeding_rights` via `PATCH /api/territories/:id/feeding-rights`. Server enforces:
- Permission: `user.character_ids.includes(territory.regent_id)` OR ST role (via `isRegentOfTerritory` helper in `middleware/auth.js`)
- Lock: cannot remove a character who has already submitted a DT marked `resident` on this territory in the active cycle (ST bypasses the lock)

**Regent and Lieutenant are implicit rights-holders** — stored on `territory.regent_id` / `territory.lieutenant_id`, deliberately NOT duplicated into `feeding_rights[]`. Any feeding-rights check must include all three fields (client helpers at `downtime-form.js:renderFeedingTerritoryPills` and admin `downtime-views.js` mismatch check do this correctly as of 2026-04-23).

---

## Office (Court Positions — Epic OXP)

| Domain | Collection | API | Managed in UI |
|--------|-----------|-----|---------------|
| Office seats (per-seat identity, holder, category) | `office_seats` | `GET` (auth) / `PUT /:seatId/holder` (ST only) | admin.html → City tab (court panel) |
| Manoeuvre purchase rank, per seat | `office_manoeuvre_ranks` | `GET` (auth) / `PUT /:seatId`, `PUT /:seatId/step` (ST only) | admin.html → City tab (Office tab, Manoeuvres section) |
| Merit dot purchases, per seat | `office_merit_dots` | `GET` (auth) / `PUT /:seatId` (ST only) | admin.html → City tab (Office tab, Merit Suite section) |
| Applied Status Action log | `office_actions` | `GET /?game_session_id=X` (auth) / `GET /latest_session` (auth) / `GET /pending`, `PUT /:id/accept`, `PUT /:id/decline` (ST only) / `POST /` (auth; caller must own `actor_id` or be ST) | admin.html → City tab (Office tab, approval queue) |
| Per-session Status Action budget spend | `office_action_budgets` | *(written only, inside the `/:id/accept` transaction — no direct route)* | — |
| Pending Status Action requests (submitted, not yet resolved) | `contested_roll_requests` (`request_type: 'status_action'`) | `POST /api/office_actions`, `GET /api/office_actions/pending`, resolved via `PUT /:id/accept`/`/decline` | admin.html → City tab (Office tab, approval queue) |

**`office_seats`, `office_manoeuvre_ranks` and `office_merit_dots` use SEAT-keyed `_id`s** (`office_seats._id`, a 24-hex string), not office category names — re-keyed from category to seat by oxp-11 (2026-08-13) because two offices (Primogen, Socialite) carry more than one concurrent seat, and a category key cannot tell them apart. `office_actions` uses ordinary MongoDB-generated `_id`s (it is an append-only log, not a per-seat state document); `office_action_budgets` is keyed by the composite string `${game_session_id}:${actor_id}`.

**"No document = the default value" is deliberate, not a migration gap (DBO-4, 2026-08-14).** A seat that has never had a manoeuvre rank or merit dot set simply has no document — the client treats a missing seat key as rank 0 / zero dots for every merit (`public/js/tabs/office-tab.js`); the GET handlers themselves only default a missing *field on an existing document* (`doc.rank || 0`, `doc.dots || {}`), not a wholly absent seat. The one collection-mutating *reset* path (`resetManoeuvreRank`, `server/routes/office-seats.js:501-544`, fired on a handover) explicitly uses `upsert: false` to preserve this: a seat with nothing to destroy gets no document minted just to say so. Do not treat an absent or empty document as evidence of a bug in either collection.

**Migration gap, found and closed 2026-08-14 (DBO-4).** `office_merit_dots` currently holds 2 REAL, pre-oxp-11 documents still keyed by office category (`_id: "Enforcer"`, `_id: "Head of State"`), not by seat — `server/scripts/migrate-office-purchases-to-seats.mjs` (built alongside oxp-11, dry-run default, `--apply` to write) has not yet been run against live `tm_suite`. Until it runs, the current seat-keyed code cannot see these two documents at all — `GET /api/office_merit_dots` reports both seats as having zero dots purchased, even though real (if currently zero-value: `{"Safe Place": 0}`) purchases exist. **DBO-4's own external review found the migration script itself had a real data-loss bug** in exactly this scenario: if an ST set a merit dot on either seat through the live UI before the migration ran, the script would silently DELETE the old category-keyed document once it saw the newer seat-keyed one — not merely leave it orphaned — discarding any field the old document alone held. Fixed the same day: the script now compares the two documents' content and only auto-clears the old one when they are identical (a true interrupted-migration recovery); a genuine mismatch is now REFUSED and reported for a human to reconcile, matching the file's own established "refuse rather than guess" pattern. Running `--apply` is still Angelus's own action, not an agent's, per this project's standing convention for one-off migration scripts — but the script is now safe to run whenever Angelus chooses, with no compounding-loss risk if it's delayed. See `deferred-work.md` and `dbo-4-office-collections-absent-empty-route.md`'s Dev Notes for full detail.

---

## Downtime

| Domain | Collection | API | Managed in UI |
|--------|-----------|-----|---------------|
| Downtime cycles | `downtime_cycles` | `GET/POST /api/downtime_cycles` | admin.html → Downtime tab |
| Downtime submissions (player forms + ST outcomes) | `downtime_submissions` | `GET/PUT /api/downtime_submissions` | player.html (submit) + admin.html Downtime tab (process) |

**Downtime investigations: RETIRED 2026-08-15 (TM Wiki Story 31-7).** `downtime_investigations`,
its `/api/downtime_investigations` route and the "Investigations" panel in admin.html's Downtime tab
are gone. It and `tm_wiki.prior_investigations` were the same concept modelled twice; neither ever
held a document, and `tm_suite.downtime_investigations` was never even created. TM Wiki's version is
the single surviving home, because it is wired into the player-facing downtime form rather than an
ST-only panel, and investigation continuity is story material under Epic 31's ownership test. No
migration was written: there was nothing to move.

**Influence spend:** Not a stored field. Must be derived at render time by summing influence-category action_responses from the character's last resolved downtime submission.

---

## Game Sessions & Attendance

| Domain | Collection | API | Managed in UI |
|--------|-----------|-----|---------------|
| Game sessions (dates, XP grants, payments, finances) | `game_sessions` | `GET/PUT /api/game_sessions` *(coordinator-auth: coordinator, ST, dev)* | admin.html → Attendance tab (ST); game app → Check-In tab + Finance tab (coordinator+) |
| Session logs | `session_logs` | `GET /api/session_logs` *(ST-auth)* | admin.html → Engine tab |
| Attendance | *(within game_sessions)* | `GET /api/attendance` | admin.html + game app Check-In tab |

**Payment data (FIN):** Each `attendance[n]` entry carries structured `payment: { method, amount }` (fin.2 schema). Legacy submissions with flat `payment_method: 'Cash'` are read via `public/js/game/payment-helpers.js` → `readPayment(entry)` which normalises old values ('Cash' → 'cash', 'PayID (Symon)' → 'payid', etc.) and returns `{ method, amount: 0 }` for legacy rows. Both Check-In and Finance tabs read through this helper.

**Finance shape:** `game_sessions[n].finances = { expenses: [{category, amount, date?, note?}], transfers: [{to, amount, date?}], notes }`. Takings card in Finance tab is derived from `attendance[n].payment` via `derivePayments(session)`. Balance = collected − expenses − transfers. Nothing is stored as a computed field.

---

## Players & Auth

| Domain | Collection | API | Managed in UI |
|--------|-----------|-----|---------------|
| Player accounts (Discord link) | `players` | `GET /api/players` | admin.html (ST view) |
| Auth | *(Discord OAuth)* | `/api/auth/discord` | — |

---

## Reference / Rules Data

| Domain | Source | Notes |
|--------|--------|-------|
| Merits database (203+ entries) | `public/js/data/merits-db.js` | Baked into JS — not in MongoDB |
| Devotions database (42 entries) | `public/js/data/devotions-db.js` | Baked into JS |
| Clan/covenant/mask/dirge constants | `public/js/data/constants.js` | Baked into JS |
| Manoeuvre definitions | `public/js/data/man-db.js` | Baked into JS |
| Rules content (powers, errata) | `rules` collection | `GET /api/rules` |
| NPCs | `npcs` | `GET /api/npcs` (ST only) / `GET /api/npcs/for-character/:id` (player-readable for linked NPCs; ST always). Schema adds `is_correspondent` (DTOSL.1), `st_suggested_for` (DTOSL.3 pending), `created_by` (DTOSL.5 pending). Status enum includes `pending` and `archived`. |
| Feed methods + territory data | `public/js/player/downtime-data.js` | Shared constants — import from here, do not duplicate |

---

## Feeding Roll — Shared Constants

`FEED_METHODS` and `TERRITORY_DATA` are defined once in `public/js/player/downtime-data.js`.

The feed roller in the game app (`public/js/suite/tracker-feed.js`) currently has a hardcoded duplicate of both. **Do not add a third copy.** Task #7 will consolidate to the shared source.

---

## Derived Values (never stored)

These are always calculated at render time from character data:

- Size, Speed, Defence, Health max, Willpower max, Vitae max
- XP earned / XP spent / XP remaining
- Influence total (from merit dots)
- Discipline pools, derived pools

---

## Auth Boundaries

| Route prefix | Auth required | Role required |
|---|---|---|
| `/api/auth` | No | — |
| `/api/characters`, `/api/territories`, `/api/downtime_*`, `/api/players`, `/api/questionnaire`, `/api/history`, `/api/ordeal*`, `/api/rules`, `/api/npcs` | Yes (any authenticated) | — |
| `GET /api/office_seats`, `GET /api/office_manoeuvre_rank`, `GET /api/office_merit_dots`, `GET /api/office_actions`, `GET /api/office_actions/latest_session`, `POST /api/office_actions` | Yes | any authenticated (`POST` additionally requires the caller own `actor_id` or be ST) |
| `PUT /api/office_seats/:seatId/holder`, `PUT /api/office_manoeuvre_rank/:seatId(/step)`, `PUT /api/office_merit_dots/:seatId`, `GET /api/office_actions/pending`, `PUT /api/office_actions/:id/accept`, `PUT /api/office_actions/:id/decline` | Yes | ST only |
| `/api/tracker_state` | Yes | ST (cross-character) or owning player (`req.user.character_ids` per `server/routes/tracker.js:9-15`) |
| `/api/session_logs`, `/api/game_sessions` | Yes | ST only |
| `GET /api/st_mods?character_id=<id>` (single) or `GET /api/st_mods?character_ids=<csv>` (bulk; STM-7 / issue #413) | Yes | ST (any character) or owning player (`req.user.character_ids` per `server/routes/st_mods.js#canAccessMods`, applied per-id for bulk) |
| `POST /api/st_mods`, `DELETE /api/st_mods/:id`, `GET /api/st_mod_audit` | Yes | ST only |
