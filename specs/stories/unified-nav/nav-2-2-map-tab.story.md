# Story 2.2: Map Tab Renders Territory View

Status: review

## Story

As a user at game,
I want the Map tab to show the city territory layout,
So that I can reference territory control and ambience during scenes.

## Acceptance Criteria

1. **Given** any authenticated user taps Map **When** the tab renders **Then** the territory view is displayed with live data from the API
2. **Given** territories have regent and ambience data **When** the map renders **Then** each territory shows its current regent and ambience level
3. **Given** the map is opened on a 390px phone **When** rendered **Then** territory information is readable without horizontal scroll
4. **Given** the map is already showing from a previous visit **When** the user taps Map again **Then** data refreshes (not served stale)

## Tasks / Subtasks

- [x] Wired Territory tab to `renderCityTab()` from `player/city-tab.js` — API-backed, not the localStorage bidding tracker (AC: #1, #2)
- [x] `renderCityTab` fetches `GET /api/territories` and `GET /api/characters/public` on every open (AC: #4)
- [x] Imported `renderCityTab` into `app.js` 
- [x] City CSS classes ported from `player-layout.css` to `suite.css` (AC: #3)
- [x] Responsive: `.city-split` stacks vertically at ≤768px (AC: #3)

## Dev Notes

- `public/js/suite/territory.js` — `mountTerr(el)` existing implementation
- `public/js/app.js` — `goTab('territory')` already calls `mountTerr()` — rename to `goTab('map')` to match new tab name
- `public/css/suite.css` — any responsive overrides for territory view go here
- **API:** `GET /api/territories` — requireAuth, open to all authenticated users
- **No new CSS component classes** — territory view already styled; fix responsiveness if needed using tokens only

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: public/js/suite/territory.js]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
