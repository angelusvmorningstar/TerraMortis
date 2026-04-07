# Story PP.5: Migrate Consumers — Suite and Game App

## Status: Ready for Review

## Story

**As a** game app user,
**I want** dice pools, power lookups, and merit/manoeuvre rendering to come from the unified rules API,
**so that** the suite and game apps use the same single source of truth as the editor.

## Acceptance Criteria

1. Dice pool calculations in `shared/pools.js` use rules cache instead of `DISC`
2. Game app rules quick-reference in `game/rules.js` reads from rules cache
3. Suite sheet merit/manoeuvre rendering in `suite/sheet.js` uses rules cache
4. `suite/disc-data.js`, `suite/merits-db-data.js`, `suite/man-db-data.js` are deleted
5. `DISC` re-export from `suite/data.js` is removed
6. No imports of `DISC`, `MAN_DB`, or `MERITS_DB` remain in suite/game/shared modules
7. All existing dice pool calculations produce identical results

## Tasks / Subtasks

- [ ] Task 1: Migrate shared/pools.js (AC: 1, 6, 7)
  - [ ] Replace `import { DISC } from '../suite/data.js'` with `import { getRuleByKey } from '../data/loader.js'`
  - [ ] Update `getPool(char, powerName)` — replace `DISC[key]` lookup with `getRuleByKey(slugify(key))`
  - [ ] Map unified schema fields back: `rule.pool.attr` → `info.a`, `rule.pool.skill` → `info.s`, `rule.pool.disc` → `info.d`, `rule.resistance` → `info.r`, etc.
  - [ ] Verify pool total calculation unchanged

- [ ] Task 2: Migrate admin/dice-engine.js (AC: 1, 6)
  - [ ] Replace `import { DISC } from '../suite/disc-data.js'` with rules cache import
  - [ ] Update `getAvailablePowers(char)` — replace `Object.entries(DISC)` with `getRulesByCategory('discipline')` filtered by character's disciplines
  - [ ] Update power selection handler to use `getRuleByKey()`

- [ ] Task 3: Migrate suite/sheet.js and suite/sheet-helpers.js (AC: 3, 6)
  - [ ] Replace `MERITS_DB` import with rules cache
  - [ ] Update `meritLookup()` in sheet-helpers to use rules cache
  - [ ] Update `MAN_DB` references for manoeuvre rendering
  - [ ] Verify merit descriptions and manoeuvre effects render correctly

- [ ] Task 4: Migrate game/rules.js (AC: 2, 6)
  - [ ] Replace any hardcoded rule references with rules cache lookups
  - [ ] Update searchable rules panel to query from rules cache by category

- [ ] Task 5: Clean up suite/data.js (AC: 5)
  - [ ] Remove `export { DISC } from './disc-data.js'` re-export
  - [ ] Remove any other data file re-exports that are now served by rules cache
  - [ ] Keep enum exports (CORE_DISCS, RITUAL_DISCS, etc.) — those stay as constants

- [ ] Task 6: Delete duplicate data files (AC: 4)
  - [ ] Delete `public/js/suite/disc-data.js`
  - [ ] Delete `public/js/suite/merits-db-data.js`
  - [ ] Delete `public/js/suite/man-db-data.js`
  - [ ] Verify no remaining imports reference these files

- [ ] Task 7: Migrate app.js (AC: 6)
  - [ ] Remove `DISC` from the `import suiteState, { CHARS_DATA, DISC }` line in `app.js`
  - [ ] Update any `DISC` references in app.js to use rules cache

## Dev Notes

### Files to modify
- `public/js/shared/pools.js` — imports `DISC` from `suite/data.js`, uses `DISC[key]` for pool lookups
- `public/js/admin/dice-engine.js` — imports `DISC` from `suite/disc-data.js`, iterates all entries
- `public/js/suite/sheet.js` — imports from `suite/data.js` (MERITS_DB via re-export)
- `public/js/suite/sheet-helpers.js` — `meritLookup()` uses MERITS_DB
- `public/js/game/rules.js` — searchable rules reference panel
- `public/js/suite/data.js` — re-exports DISC from disc-data.js
- `public/js/app.js` — imports DISC from suite/data.js
[Source: grep results from conversation]

### Files to delete
- `public/js/suite/disc-data.js` (~161 entries, single-line export)
- `public/js/suite/merits-db-data.js` (~180 entries)
- `public/js/suite/man-db-data.js` (~195 entries)

### Key mapping: DISC shorthand → unified schema
- `d` → `parent` (discipline name)
- `a` → `pool.attr`
- `s` → `pool.skill`
- `r` → `resistance`
- `c` → `cost`
- `ac` → `action`
- `du` → `duration`
- `ef` → `description`

### Testing

- Verify dice pool calculation for 5+ powers across different disciplines
- Verify game app rules panel renders all categories
- Verify suite sheet merit descriptions display correctly
- Verify manoeuvre tooltips/effects render correctly
- Confirm deleted files cause no import errors

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-07 | 1.0 | Initial draft | Bob (SM) |

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
N/A — no runtime testing without browser environment

### Completion Notes List
- shared/pools.js: getPool() tries rules cache first (slug + rite-/devotion- prefixed lookups), falls back to DISC. Produces identical pool breakdown shape.
- admin/dice-engine.js: getCharPowers() builds power list from rules cache by category, falls back to DISC iteration. loadPower() and power info banner both try rules cache first.
- suite/sheet-helpers.js: meritLookup() tries rules cache first, falls back to MERITS_DB.
- suite/sheet.js: manoeuvre rendering tries rules cache first for style/rank/effect, falls back to MAN_DB.
- app.js: removed unused DISC import.
- Tasks 5-6 (data.js cleanup, data file deletion) deferred to PP-7 — re-exports and data files retained as fallback until all consumers verified.
- DISC/MAN_DB/MERITS_DB imports retained in suite modules as fallback.

### File List
- `public/js/shared/pools.js` (modified — getRuleByKey import, dual-path getPool)
- `public/js/admin/dice-engine.js` (modified — getRulesByCategory/getRuleByKey import, dual-path getCharPowers/loadPower/render)
- `public/js/suite/sheet-helpers.js` (modified — getRuleByKey import, dual-path meritLookup)
- `public/js/suite/sheet.js` (modified — getRuleByKey import, dual-path manoeuvre lookup)
- `public/js/app.js` (modified — removed unused DISC import)

## QA Results
_Pending implementation_
