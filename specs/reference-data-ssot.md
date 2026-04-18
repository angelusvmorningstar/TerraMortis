# Data Sources of Truth — TM Suite

This document maps every data domain to its authoritative source: the MongoDB collection, the API endpoint, and the UI surface where it is managed. Before building any feature that reads or writes data, check here first.

---

## Character Data

| Domain | Collection | API | Managed in UI |
|--------|-----------|-----|---------------|
| Characters (schema, stats, merits) | `characters` | `GET/PUT /api/characters` | admin.html → Player tab (character grid + sheet editor) |
| Character tracker state (vitae/WP/health) | `tracker_state` | `GET/PUT /api/tracker_state` *(ST-auth only)* | game app → Tracker tab |
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
| Territories (stats, ambience, regent) | `territories` | `GET/PUT /api/territories` | admin.html → City tab |
| Territory residency | `territory_residency` | `GET/PUT /api/territory-residency` | admin.html → City tab |

---

## Downtime

| Domain | Collection | API | Managed in UI |
|--------|-----------|-----|---------------|
| Downtime cycles | `downtime_cycles` | `GET/POST /api/downtime_cycles` | admin.html → Downtime tab |
| Downtime submissions (player forms + ST outcomes) | `downtime_submissions` | `GET/PUT /api/downtime_submissions` | player.html (submit) + admin.html Downtime tab (process) |
| Downtime investigations | `downtime_investigations` | `/api/downtime_investigations` | admin.html → Downtime tab |

**Influence spend:** Not a stored field. Must be derived at render time by summing influence-category action_responses from the character's last resolved downtime submission.

---

## Game Sessions & Attendance

| Domain | Collection | API | Managed in UI |
|--------|-----------|-----|---------------|
| Game sessions (dates, XP grants) | `game_sessions` | `GET /api/game_sessions` *(ST-auth)* | admin.html → Attendance & Finance tab |
| Session logs | `session_logs` | `GET /api/session_logs` *(ST-auth)* | admin.html → Engine tab |
| Attendance | *(within game_sessions)* | `GET /api/attendance` | admin.html → Attendance & Finance tab |

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
| NPCs | `npcs` | `GET /api/npcs` |
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
| `/api/characters`, `/api/territories`, `/api/downtime_*`, `/api/players`, `/api/questionnaire`, `/api/history`, `/api/ordeal*`, `/api/rules`, `/api/npcs`, `/api/tickets` | Yes (any authenticated) | — |
| `/api/tracker_state`, `/api/session_logs`, `/api/game_sessions` | Yes | ST only |
