# Story 2.5: Consolidate Feeding — Single API-Backed Implementation + Always in More Grid

Status: review

## Story

As an ST or player,
I want feeding to be accessible from the More grid at any time and to work identically regardless of how I reach it,
So that there is one feeding experience with no divergence between surfaces.

## Background

Currently two feeding implementations exist:
- `player/feeding-tab.js` — **canonical**, API-backed (EPA.2), saves roll to `downtime_submissions`, confirms vitae+influence to `tracker_state`
- `suite/tracker-feed.js` — legacy localStorage-based implementation in the roll tab

This story removes the legacy implementation and wires the canonical one into the More grid. Feeding must always appear in More grid regardless of cycle phase (the contextual promotion card is Story 3.1).

## Acceptance Criteria

1. **Given** a player accesses Feeding from More grid **When** the view opens **Then** `renderFeedingTab()` from `player/feeding-tab.js` renders correctly
2. **Given** the feeding roll is completed and confirmed **When** confirm is tapped **Then** vitae and influence are written to `/api/tracker_state` (not localStorage)
3. **Given** the user navigates away and returns to Feeding **When** the tab re-renders **Then** the previously-rolled result is shown (persisted to API)
4. **Given** any user opens More **When** the grid renders **Then** the Feeding icon is always present regardless of game cycle phase
5. **Given** `suite/tracker-feed.js` is removed **When** the app loads **Then** no errors — the legacy feeding section in the roll tab is also removed from `index.html`

## Tasks / Subtasks

- [ ] Wire Feeding to More grid (AC: #1, #4)
  - [ ] `goTab('feeding')` calls `renderFeedingTab(el, currentChar)` from `player/feeding-tab.js`
  - [ ] For ST: pass `suiteState.chars` selected character; for player: pass their own character
  - [ ] Feeding icon always in More grid app registry (no condition)
- [ ] Remove legacy feeding section from Roll tab (AC: #5)
  - [ ] Remove `<div class="feed-section" id="feed-section">...</div>` from `index.html` roll tab
  - [ ] Remove `feedToggle`, `feedInit`, `feedBuildPool`, `feedRoll`, `feedReset`, `feedAdjApply`, `feedApplyVitae`, `feedSelectMethod`, `feedClearState` exports from `app.js`
  - [ ] Remove import of `suite/tracker-feed.js` from `app.js`
- [ ] Remove `suite/tracker-feed.js` (AC: #5)
  - [ ] Delete `public/js/suite/tracker-feed.js`
  - [ ] Confirm no other files import it
- [ ] Verify API-backed persistence (AC: #2, #3)
  - [ ] Feeding confirm writes `{ vitae, influence }` to `PUT /api/tracker_state/:id`
  - [ ] Roll result saved to `PUT /api/downtime_submissions/:id` as `feeding_roll_player`
  - [ ] On re-open: `feeding_roll_player` is present → renders 'rolled' state
- [ ] CSS check: feeding tab styles accessible in unified app (AC: #1)
  - [ ] Feeding UI uses styles from `player-layout.css` — confirm these load in unified app context
  - [ ] If not loaded, add relevant rules to `suite.css`

## Dev Notes

- `public/js/player/feeding-tab.js` — `renderFeedingTab(el, char)` is the canonical export
- `public/js/suite/tracker-feed.js` — DELETE after migration
- `public/js/app.js` — remove tracker-feed import and all feed* exports from `Object.assign(window, {...})`
- `public/index.html` — remove `#feed-section` div from roll tab
- **API:** `PUT /api/tracker_state/:id` (vitae + influence), `PUT /api/downtime_submissions/:id` (roll result), `GET /api/downtime_submissions` (on init), `GET /api/downtime_cycles` (active cycle check)
- **No localStorage** — EPA.2 already removed the bridge. Canonical impl writes to API only.
- `isSTRole()` imported in feeding-tab.js — already handles ST confirm panel visibility

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: specs/architecture/system-map.md#Section 6] — feeding data flow
- [Source: public/js/player/feeding-tab.js]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
