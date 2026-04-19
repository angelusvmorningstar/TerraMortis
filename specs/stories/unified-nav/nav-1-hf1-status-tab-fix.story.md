# Story nav-1-hf1: Fix Third Primary Tab — Status (not Map)

Status: review

## Story

As a user of the unified game app,
I want the third primary tab to show court Status (prestige, hierarchy),
So that the most-needed game reference is one tap away.

## Background

nav-1-2 implemented the third tab incorrectly as "Map" wired to `mountTerr()` (territory bid tracker). The UX specification (specs/ux-design-unified-nav.md) always defined the primary nav as:

> **Dice · Sheet · Status · More**

Map/Territory belongs in the More grid as its own app — not in the primary nav. This hotfix corrects:
1. Third nav button: `#n-map` → `#n-status`, label "Map" → "Status"
2. Tab container: `#t-map` → `#t-status` (existing) — `renderSuiteStatusTab()` called on open
3. Territory moves to More grid app registry
4. `mountTerr()` is no longer called from the primary nav
5. Dice tab padding — layout has no outer padding; content sits against edges

## Acceptance Criteria

1. **Given** any user taps the third primary tab **When** it renders **Then** the label reads "Status" and shows the court hierarchy / prestige display
2. **Given** the Status tab opens **When** it renders **Then** `renderSuiteStatusTab()` is called, not `mountTerr()`
3. **Given** an ST opens the More grid **When** the grid renders **Then** a Territory app icon is present and tapping it opens the territory view
4. **Given** the Dice tab renders **When** viewed on a phone **Then** content has consistent padding on all sides (minimum 16px)
5. **Given** the bottom nav **When** viewed **Then** the third button reads "Status" with an appropriate status-related SVG icon

## Tasks / Subtasks

- [x] Rename third nav button: `id="n-map"` → `id="n-status"`, label "Map" → "Status", calls `goTab('status')` (AC: #5)
- [x] Updated SVG icon to status/hierarchy layers icon (AC: #5)
- [x] `goTab('status')` calls `renderSuiteStatusTab(document.getElementById('t-status'))` (AC: #2)
  - [x] Removed `if (t === 'map') mountTerr()` — replaced with `if (t === 'territory') mountTerr()`
- [x] Added Territory to `MORE_APPS` registry with grid SVG icon (AC: #3)
- [x] Renamed `#t-map` → `#t-territory` in `index.html` so `goTab('territory')` activates it (AC: #3)
- [x] Updated `NAV_ALIAS`: `territory → 'more'`, removed old `territory: 'map'` (AC: #3)
- [x] Updated `TAB_SUBTITLES`: `map` → `status` + `territory` entries
- [x] Updated `applyRoleRestrictions`: `n-map` → `n-status` in primary nav array (AC: #1)
- [x] Fixed Dice tab padding: `#t-dice` gets same flex+padding rules as `#t-roll` (AC: #4)

## Dev Notes

- `public/index.html` — third nav button currently `#n-map` calling `goTab('map')`, label "Map"
- `public/js/app.js` — `goTab()` init block has `if (t === 'map') mountTerr()`; `NAV_ALIAS` has `territory: 'map'`
- `public/js/app.js` — `MORE_APPS` array needs Territory entry added
- `public/js/suite/status.js` — `renderSuiteStatusTab(el)` is the correct function for this tab
- `public/css/suite.css` — `.tab` padding rules; Dice tab content currently has no outer padding
- The existing `#t-status` container in `index.html` is already there — `goTab('status')` already calls `renderSuiteStatusTab()` — just need to route the third nav button to it

### References
- [Source: specs/ux-design-unified-nav.md] — "Dice · Sheet · Status · More" is the specified primary nav
- [Source: specs/epic-unified-nav.md#Story 1.2] — nav-1-2 where the error was introduced

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- `#t-map` was the renamed `#t-territory` — renamed back to `#t-territory` so `goTab('territory')` resolves correctly
- `renderSuiteStatusTab` already existed and `#t-status` container already existed — routing was the only fix
- 24/24 tests pass

### Completion Notes List
- Third primary tab: Map → Status. Correct per UX spec (Dice · Sheet · Status · More).
- Territory moved to More grid, accessible via `goTab('territory')` from More grid icon.
- Dice tab now has correct padding (was rendering against edges).

### File List
- public/index.html
- public/js/app.js
- public/css/suite.css
