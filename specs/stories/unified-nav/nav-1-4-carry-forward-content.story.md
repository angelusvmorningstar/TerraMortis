# Story 1.4: Carry Forward Existing Working Content on Day One

Status: ready-for-dev

## Story

As a user on day one of the new unified app,
I want the Dice, Sheet, and Map tabs to work with real content immediately,
So that the app is usable from the moment it ships — not a skeleton.

## Background

This story is an inventory and wiring pass — no new functionality. It ensures that existing working implementations from `index.html` (dice roller, suite sheet, territory view) are correctly wired to the new 4-tab structure when Story 1.2 ships. Runs in parallel with Story 1.1.

## Acceptance Criteria

1. **Given** any user opens the unified app after Epic 1 ships **When** they tap Dice **Then** the dice roller (`suite/roll.js` + char pool chips) functions identically to the current game app
2. **Given** any user taps Sheet **When** the tab renders **Then** the existing suite sheet renders (1-col mobile, wider desktop) for the relevant character(s)
3. **Given** any user taps Map **When** the tab renders **Then** the existing territory view renders from `/api/territories`
4. **Given** an ST taps More **When** the grid renders **Then** ST-only apps already in `index.html` (Tracker, Sign-In, Rules) are wired and functional in the More grid
5. **Given** any existing functionality from the current `index.html` game app **When** tested after this story **Then** it works as before — no regressions

## Tasks / Subtasks

- [ ] Inventory current `index.html` tab content and map to new tabs (AC: #1–#4)
  - [ ] Confirm `#t-roll` → maps to new Dice tab `#t-dice`
  - [ ] Confirm `#t-sheets` or `#t-editor` → maps to new Sheet tab `#t-sheet`
  - [ ] Confirm `#t-territory` → maps to new Map tab `#t-map`
  - [ ] List all existing More grid candidates from current tabs (Tracker, Sign-In, Rules, Status)
- [ ] Wire Dice tab to existing roll implementation (AC: #1)
  - [ ] Ensure `suite/roll.js` initialises correctly on `goTab('dice')`
  - [ ] Ensure `renderCharPools()` fires when character is selected
- [ ] Wire Sheet tab to existing suite sheet (AC: #2)
  - [ ] Player: renders own sheet via `suiteRenderSheet()`
  - [ ] ST: renders character picker chips then selected character's sheet
- [ ] Wire Map tab to existing territory view (AC: #3)
  - [ ] `mountTerr()` called on `goTab('map')`
  - [ ] Territory data from `GET /api/territories`
- [ ] Wire existing ST-only features to More grid slots (AC: #4)
  - [ ] Tracker → `initTracker()` on More grid Tracker tap
  - [ ] Sign-In → `initSignIn()` on More grid Sign-In tap
  - [ ] Rules → `initRules()` on More grid Rules tap
- [ ] Smoke test all wired tabs — no regressions (AC: #5)

## Dev Notes

- This story does NOT change any implementation — it maps and wires what already exists
- `public/js/app.js` — `goTab()`, `initTracker()`, `initRules()`, `initSignIn()`, `mountTerr()` all already defined
- `public/js/suite/roll.js` — existing dice roller
- `public/js/suite/sheet.js` — existing suite sheet renderer
- `public/js/suite/territory.js` — existing territory view
- `public/js/game/tracker.js` — `initTracker(el)`
- `public/js/game/signin-tab.js` — `initSignIn(el, chars)`
- `public/js/game/rules.js` — `initRules(el)`
- **No new CSS** — all existing styles carry over
- **API:** `GET /api/territories`, `GET /api/characters`, `GET /api/tracker_state` — all existing

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: specs/architecture/system-map.md#Section 4] — frontend module map

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
