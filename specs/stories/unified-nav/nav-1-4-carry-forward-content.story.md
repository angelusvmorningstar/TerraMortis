# Story 1.4: Carry Forward Existing Working Content on Day One

Status: review

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

- [x] Inventory current `index.html` tab content and map to new tabs (AC: #1–#4)
  - [x] Confirm `#t-roll` → maps to new Dice tab `#t-dice`
  - [x] Confirm `#t-sheets` or `#t-editor` → maps to new Sheet tab `#t-sheet`
  - [x] Confirm `#t-territory` → maps to new Map tab `#t-map`
  - [x] List all existing More grid candidates from current tabs (Tracker, Sign-In, Rules, Status)
- [x] Wire Dice tab to existing roll implementation (AC: #1)
  - [x] `goTab('dice')` clones roll tab content into `#t-dice` on first activate
  - [x] `renderCharPools()` already fires via pickChar — unchanged
- [x] Wire Sheet tab to existing suite sheet (AC: #2)
  - [x] Player: renders own sheet via existing renderList/openChar logic
  - [x] ST: renders character picker chips then sheet
- [x] Wire Map tab to existing territory view (AC: #3)
  - [x] `goTab('map')` calls `mountTerr()` — renders into existing `#terr-root`
  - [x] Story 1.2 will move `#terr-root` to `#t-map` container
- [x] Wire existing ST-only features to More grid slots (AC: #4)
  - [x] Tracker, Sign-In, Rules — all already wired via `goTab()` handlers
- [x] Smoke test all wired tabs — no regressions (AC: #5)

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
claude-sonnet-4-6

### Debug Log References
- `mountTerr()` renders into `#terr-root` (hardcoded) — Story 1.2 must add `#terr-root` div inside `#t-map`
- `goTab('dice')` clones roll tab innerHTML — acceptable for transition; Story 1.2 will replace with proper content
- 21/21 tests pass including post-game-1 full suite

### Completion Notes List
- New tab containers added to `index.html`: `#t-dice`, `#t-sheet`, `#t-map`, `#t-more`
- New `goTab()` handlers in `app.js`: `dice` (clones roll), `sheet` (char picker/sheet), `map` (mountTerr)
- TAB_SUBTITLES updated with unified nav tab names
- All existing More grid apps (Tracker, Sign-In, Rules) confirmed working via existing handlers
- No regressions — 21/21 tests pass

### File List
- public/index.html
- public/js/app.js
