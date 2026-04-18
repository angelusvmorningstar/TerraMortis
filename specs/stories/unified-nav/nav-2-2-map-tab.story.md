# Story 2.2: Map Tab Renders Territory View

Status: ready-for-dev

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

- [ ] Wire Map tab to existing territory view (AC: #1)
  - [ ] `goTab('map')` calls `mountTerr(document.getElementById('t-map'))`
  - [ ] Confirm `#t-map` container exists in `index.html` (from Story 1.2)
- [ ] Verify territory data loads correctly (AC: #1, #2)
  - [ ] `GET /api/territories` called on mount
  - [ ] Regent and ambience fields display per territory
- [ ] Responsive check (AC: #3)
  - [ ] Confirm territory view works at 390px — no overflow or hidden content
  - [ ] If territory component has fixed widths, add responsive overrides in `suite.css`
- [ ] Refresh on re-open (AC: #4)
  - [ ] Ensure `mountTerr()` re-fetches on each `goTab('map')` call, not cached from first load

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
