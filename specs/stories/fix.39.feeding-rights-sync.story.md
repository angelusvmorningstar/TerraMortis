# Story fix.39: Feeding Rights Sync — Player Portal ↔ City Tab

## Status: done

## Story

**As an** ST,
**I want** the feeding rights set by a Regent in the player portal to be visible in the City tab Territories section (and vice versa),
**so that** there is a single source of truth for who has feeding rights in each territory.

## Background

There are currently **two separate data systems** for feeding rights:

| Location | Collection | Field | API |
|---|---|---|---|
| ST admin — City tab Territories | `territories` | `feeding_rights: string[]` | `POST /api/territories` |
| Player portal — Regency tab | `territory_residency` | `residents: string[]` | `PUT /api/territory-residency` |

These do not sync. A Regent saving feeding rights in the player portal updates `territory_residency.residents` but the ST's City tab reads from `territories.feeding_rights`. Conversely, if the ST assigns feeding rights in the City tab, the player portal won't see them.

This must be resolved so both views read and write from the same source.

---

## Design Decision Required

Before implementing, decide which collection is canonical:

**Option A — `territories` is canonical (recommended)**
- Both the ST City tab and the player portal read/write `territories.feeding_rights`
- The `territory_residency` collection is retired or repurposed
- The player portal's `saveRegency()` calls `POST /api/territories` with `{ id, feeding_rights }` instead of `PUT /api/territory-residency`
- The ST's `saveFeedingRights()` is unchanged
- Player portal reads territory data from `GET /api/territories` (which the player portal may already load for regency detection)

**Option B — `territory_residency` is canonical**
- ST City tab is updated to read/write `territory_residency`
- More disruptive to the admin side

**Recommendation:** Option A. The `territories` collection is already the source of truth for regent, lieutenant, and ambience. Feeding rights logically belong there too.

---

## Technical Details

**Player portal — current flow:**
- `public/js/player/regency-tab.js` loads from `GET /api/territory-residency?territory=...`
- Saves to `PUT /api/territory-residency`

**ST City tab — current flow:**
- `public/js/admin/city-views.js` reads `doc.feeding_rights` from territory docs loaded at startup
- Saves via `saveFeedingRights()` → `POST /api/territories { id, feeding_rights }`

**If Option A:**
1. Update `regency-tab.js` to read `feeding_rights` from the territory document (passed in from `_territories` array, which is already loaded in `player.js`).
2. Update `saveRegency()` to call `POST /api/territories { id: territory.id, feeding_rights: [...] }` instead of `PUT /api/territory-residency`.
3. The `territory_residency` collection and route can be left in place but are no longer used for feeding rights.
4. Check whether `territory_residency` is used for anything else (e.g. lieutenant slot display) — if so, preserve that.

**Regency tab slot display (current):**
The regency tab shows 10 feeding right slots. The ST City tab shows a simple list. After sync:
- Regency tab continues to show the same slot layout, sourced from `territory.feeding_rights`
- The capacity cap (feeding rights cap) is already derived from territory ambience in the regency tab

---

## Acceptance Criteria

1. Feeding rights saved in the player portal Regency tab are visible in the ST City tab Territories section after page refresh.
2. Feeding rights set by the ST in the City tab Territories section are visible in the player portal Regency tab after page refresh.
3. The over-capacity highlighting in the player portal continues to work correctly.
4. No duplicate entries appear from a previously unsynchronised state.

---

## Dependency

- This story should be implemented after fix.38 (Save Feeding Rights button broken) is resolved, or alongside it.

---

## Files to Change

- `public/js/player/regency-tab.js` — switch data source and save target to `territories` collection
- `public/js/player.js` — ensure territory docs are passed into `renderRegencyTab`
- `server/routes/territories.js` — confirm `feeding_rights` field is accepted in POST body (check schema)
- `server/schemas/character.schema.js` is NOT affected — this is a territory schema concern, not character schema

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Story authored | Claude (SM) |
| 2026-04-11 | 1.1 | Implemented Option A: territories collection is canonical. Removed territory-residency GET/PUT from regency-tab.js. Feeding rights now read from territory doc in _territories array; saved via POST /api/territories. Regent/Lieutenant rows are display-only. Local cache updated on save. | Claude (SM) |
