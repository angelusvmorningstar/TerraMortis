# Story EPC.2: Integrate Feeding Roll into Game App

Status: ready-for-dev

## Story

**As an** ST on a tablet during the live game,
**I want** to run feeding rolls from the game app without switching to the player portal,
**so that** I can handle feeding for any character in one place.

## Background

`renderFeedingTab()` in `public/js/player/feeding-tab.js` is the canonical feeding roll implementation — it's API-backed, handles the full flow (roll, lock, confirm vitae/influence, deferred state). It already runs in player.html.

The game app (index.html) needs access to this same function, wired to the currently-selected character. When an ST selects a character in the game app and opens the feeding tab, it should render exactly the same feeding flow — including the ST confirm panel.

## Acceptance Criteria

1. The game app has a feeding tab (or feeding panel within the character view) that renders `renderFeedingTab()` for the selected character.
2. All feeding states work: loading, ready, rolled, deferred, no_submission.
3. The ST confirm panel (vitae gained + influence spent steppers + Confirm Feed button) is present and functional.
4. Confirming feed writes vitae and influence to `/api/tracker_state` via API (EPA.2 already handles this).
5. State survives character navigation (EPA.4 already handles this).
6. No localStorage usage — API-only (already enforced by EPA.2).

## Tasks / Subtasks

- [ ] Find the character view in the game app (index.html) — locate where tabs or panels show per-character content
- [ ] Add a feeding tab/panel container to the character view
- [ ] Import `renderFeedingTab` from `player/feeding-tab.js` into `app.js` or the relevant game module
- [ ] Call `renderFeedingTab(el, char)` when the feeding tab is activated for the selected character
- [ ] Verify the ST confirm panel renders (requires `isSTRole()` — check this works in the suite app context)

## Dev Notes

- `public/js/player/feeding-tab.js` — `renderFeedingTab(el, char)` is already exported; import directly
- `public/js/auth/discord.js` — `isSTRole()` is exported; verify it works in suite app context
- `public/js/app.js` — suite app entry; add import and wiring here
- `index.html` — add the feeding container to the character detail view
- CSS for feeding UI is in `player-layout.css` — already loaded in index? Check. If not, add the relevant rules to `suite.css` or layout.css.

### References
- [Source: public/js/player/feeding-tab.js]
- [Source: public/js/app.js]

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
