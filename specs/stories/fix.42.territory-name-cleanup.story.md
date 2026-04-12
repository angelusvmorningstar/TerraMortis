# Story fix.42: Territory Name Cleanup

## Status: done

## Story

**As an** ST,
**I want** the five territories to use their formal canonical names throughout the codebase,
**so that** territory references are consistent between the player form, the admin tools, and the game's fiction.

## Background

Three territories are currently named incorrectly in code:

| Current (wrong) | Formal (correct) |
|---|---|
| The City Harbour | The Harbour |
| The Docklands | The Dockyards |
| The Northern Shore | The North Shore |

These wrong names appear in `FEEDING_TERRITORIES` (the player form keys), `TERRITORIES` (city-views.js), `TERRITORY_DATA` (feeding-engine.js), `MATRIX_TERRS` (downtime-views.js), and `TERRITORY_SLUG_MAP` (downtime-views.js).

Because `FEEDING_TERRITORIES` defines the keys stored in MongoDB submission documents, existing submissions in the database contain the old names. A translation map must be kept in the submission readers to handle legacy data alongside the rename.

The Barrens full name in the form is `'The Barrens (No Territory)'` — this is correct and stays as-is.

## Acceptance Criteria

1. `FEEDING_TERRITORIES` in `public/js/player/downtime-data.js` uses the three corrected names
2. `TERRITORIES` in `public/js/admin/city-views.js` uses the corrected names
3. `TERRITORY_DATA` in `public/js/admin/feeding-engine.js` uses the corrected names
4. `MATRIX_TERRS` in `public/js/admin/downtime-views.js` uses corrected `csvKey`, `label`, and `ambienceKey` values
5. `TERRITORY_SLUG_MAP` in `public/js/admin/downtime-views.js` maps old form slugs AND new form slugs to canonical territory IDs
6. All display labels throughout `downtime-views.js` that hardcode old territory name strings are updated
7. A `LEGACY_TERR_KEY_MAP` (or equivalent) in `downtime-views.js` translates old submission keys to new keys when reading `_raw.feeding.territories` — so existing MongoDB submissions still render correctly
8. The player form territory grid labels display the corrected names
9. No existing functionality breaks: ambience lookups, feeding matrix, pool builder territory dropdown, vitae tally territory lookup

## Tasks / Subtasks

- [x] Task 1: Update `FEEDING_TERRITORIES` in `downtime-data.js` (AC: 1, 8)
  - [x] Change `'The City Harbour'` → `'The Harbour'`
  - [x] Change `'The Docklands'` → `'The Dockyards'`
  - [x] Change `'The Northern Shore'` → `'The North Shore'`

- [x] Task 2: Update `TERRITORIES` in `city-views.js` (AC: 2)
  - [x] Update `name` fields for the three territories — already correct, no change needed
  - [x] Verify `id` fields are unchanged — confirmed correct

- [x] Task 3: Update `TERRITORY_DATA` in `feeding-engine.js` (AC: 3)
  - [x] Update `name` fields for the three territories — already correct, no change needed

- [x] Task 4: Update `MATRIX_TERRS` and `TERRITORY_SLUG_MAP` in `downtime-views.js` (AC: 4, 5)
  - [x] Updated `MATRIX_TERRS` csvKeys to new canonical names; updated Barrens csvKey to `'The Barrens (No Territory)'`
  - [x] Added `the_harbour`, `the_north_shore` to `TERRITORY_SLUG_MAP` slug section; added `'The North Shore'` and `'The Barrens (No Territory)'` to display-name section; marked old entries as legacy

- [x] Task 5: Add legacy key translation for existing submissions (AC: 7)
  - [x] Defined `LEGACY_TERR_KEY_MAP` after `MATRIX_TERRS` (includes Barrens legacy)
  - [x] Added `_normTerrKeys()` helper function
  - [x] Applied `_normTerrKeys()` in `renderFeedingMatrix()` — activeCols filter, residentCounts loop, row rendering
  - [x] `renderAmbienceDashboard()` uses `resolveTerrId()` which already handles both old/new names — no change needed
  - [x] `renderFeedingScene()` uses `getPrimaryTerritory()` → `FEEDING_TERRITORIES` — new names returned automatically

- [x] Task 6: Audit remaining hardcoded old strings in `downtime-views.js` (AC: 6, 9)
  - [x] Updated regex in `renderFeedingScene` (~line 4984) to include `Dockyards`
  - [x] Updated `db.js` `normaliseTerritoryGrid` nameToSlug map — new names added, legacy retained
  - [x] Updated `parser.js` `_raw.feeding.territories` keys to canonical names
  - [x] All remaining old-name occurrences in `downtime-views.js` are intentional legacy map entries with comments

- [x] Task 7: Verify player form display (AC: 8)
  - [x] `FEEDING_TERRITORIES` updated — grid labels will display new formal names
  - [x] `INFLUENCE_TERRITORIES` is `FEEDING_TERRITORIES.filter(...)` — updates automatically

## Dev Notes

### Key files

| File | Change |
|------|--------|
| `public/js/player/downtime-data.js` | `FEEDING_TERRITORIES` — three name changes |
| `public/js/admin/city-views.js` | `TERRITORIES` — three name changes |
| `public/js/admin/feeding-engine.js` | `TERRITORY_DATA` — three name changes |
| `public/js/admin/downtime-views.js` | `MATRIX_TERRS`, `TERRITORY_SLUG_MAP`, `LEGACY_TERR_KEY_MAP`, audit hardcoded strings |

### Legacy translation scope

Only `downtime-views.js` reads territory keys from MongoDB submission documents (`_raw.feeding.territories`). The player form and city-views don't read old submissions. So legacy translation is only needed in `downtime-views.js`.

### TERRITORY_SLUG_MAP

Currently maps player form slugs (e.g. `the_northern_shore`) to TERRITORY_DATA ids (e.g. `northshore`). After this fix, the player form will use new names so new slugs will be generated. Add new slug entries while keeping old ones. Example:

```js
const TERRITORY_SLUG_MAP = {
  // new canonical slugs
  'the_harbour':    'harbour',
  'the_dockyards':  'dockyards',
  'the_north_shore': 'northshore',
  // legacy slugs (old form names)
  'the_city_harbour':   'harbour',
  'the_docklands':      'dockyards',
  'the_northern_shore': 'northshore',
  // unchanged
  'the_academy':     'academy',
  'the_second_city': 'secondcity',
};
```

### No test framework

There is no automated test framework. Verification is manual in-browser. Mark tasks complete after confirming the changes are correct in the code.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-12 | 1.0 | Initial draft | Amelia (claude-sonnet-4-6) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- `city-views.js` and `feeding-engine.js` already used canonical names — no changes needed.
- `TERRITORY_SLUG_MAP` extended with new slug keys (`the_harbour`, `the_north_shore`) and display-name keys (`'The North Shore'`, `'The Barrens (No Territory)'`); old entries kept as legacy.
- `LEGACY_TERR_KEY_MAP` + `_normTerrKeys()` helper added in `downtime-views.js` for backward-compatible reading of legacy MongoDB submissions.
- `db.js` `normaliseTerritoryGrid` updated to map new canonical names to new slugs; legacy names retained.
- `parser.js` CSV import output keys updated to canonical names; future CSV imports will store new names.
- Ambience dashboard unaffected — uses `resolveTerrId()` which already handled both name variants.
- Feeding Scene Summary unaffected — `getPrimaryTerritory()` reverse-maps from slugs through `FEEDING_TERRITORIES`.

### File List
- `public/js/player/downtime-data.js`
- `public/js/admin/downtime-views.js`
- `public/js/downtime/db.js`
- `public/js/downtime/parser.js`
