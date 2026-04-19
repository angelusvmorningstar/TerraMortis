# Story nav-1-hf1: Fix Third Primary Tab — Status (not Map)

Status: ready-for-dev

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

- [ ] Rename third nav button: `id="n-map"` → `id="n-status"`, `onclick="goTab('map')"` → `goTab('status')`, label "Map" → "Status" (AC: #5)
- [ ] Update SVG icon on third button to a status/hierarchy icon (AC: #5)
- [ ] Update `goTab()` so `t === 'status'` calls `renderSuiteStatusTab(document.getElementById('t-status'))` (AC: #2)
  - [ ] Remove `if (t === 'map') mountTerr()` from the unified nav init block
- [ ] Add Territory to More grid app registry in `MORE_APPS` (AC: #3)
  - [ ] `{ id: 'territory', label: 'Territory', icon: <grid SVG>, stOnly: false, playerOnly: false }`
  - [ ] Wire `goTab('territory')` to call `mountTerr()` — existing handler already does this
- [ ] Ensure `#t-map` container rename is consistent — or reuse `#t-status` which already exists (AC: #1)
- [ ] Update `NAV_ALIAS` — remove `territory: 'map'` entry, add any new aliases needed (AC: #3)
- [ ] Fix Dice tab padding (AC: #4)
  - [ ] Add `padding: 16px` to `#t-dice` in `suite.css` or ensure `.tab-wrap .tab` has consistent padding

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
### Debug Log References
### Completion Notes List
### File List
