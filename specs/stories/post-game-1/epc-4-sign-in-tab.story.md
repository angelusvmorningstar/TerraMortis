# Story EPC.4: Sign-In Tab in Game App

Status: done

## Story

**As an** ST signing players in at the door,
**I want** a dedicated sign-in tab in the game app,
**so that** I can record attendance, character choice, payment method, and starting resources in one place without using the desktop admin.

## Background

Currently, attendance is managed in admin.html on desktop. During the live game the STs need a tablet-friendly sign-in flow. Each player should be quick to process: find their name, confirm character, note payment, see starting resources.

Attendance data is stored in `game_sessions.attendance[]` and written via `PUT /api/game_sessions/:id`. The autosave pattern from EPA.3 applies here too.

## Acceptance Criteria

1. A Sign-In tab exists in the game app (index.html).
2. The tab shows a list of all attendance entries for the most recent game session, sorted by player name A–Z.
3. Each entry shows: player name, character name, payment method selector, attended checkbox.
4. Below each entry: starting Vitae/max, WP/max, Influence/max — derived from character data.
5. Ticking "attended" and selecting a payment method auto-saves to the API (same debounce pattern as EPA.3).
6. The layout is finger-friendly: min 44px tap targets, large touch-friendly checkboxes.
7. If no game session exists, show a message directing to admin.

## Tasks / Subtasks

- [ ] Add a Sign-In tab to `index.html` game app tab bar with id `t-signin`
- [ ] Create `public/js/game/signin-tab.js` — new module
- [ ] On tab open: fetch current game session via `GET /api/game_sessions`, take most recent, load attendance + character data
- [ ] Render list sorted by player name; each row: player, character, payment dropdown, attended tick
- [ ] Derive and display starting V/WP/Inf from character data using `calcVitaeMax`, `calcWillpowerMax`, `calcTotalInfluence`
- [ ] On change: debounced PUT to `/api/game_sessions/:id` (reuse pattern from attendance.js)
- [ ] Add CSS to `suite.css` or `layout.css` for sign-in row layout using design tokens

## Dev Notes

- `public/js/admin/attendance.js` — reference for the autosave pattern (EPA.3), payment methods constant, and PUT logic
- `public/js/data/accessors.js` — `calcVitaeMax`, `calcWillpowerMax`
- `public/js/editor/domain.js` — `calcTotalInfluence`
- `public/js/data/api.js` — `apiGet`, `apiPut`
- Payment methods: `['', 'Cash', 'PayPal', 'PayID (Symon)', 'Transfer (Lyn)', 'Exiles', 'Waived']` (same as attendance.js)
- Stepper display rule: always show `current / max` — per project memory
- CSS: use `--surf2`, `--bdr`, `--txt`, `--label-secondary`; no hardcoded colours

### References
- [Source: public/js/admin/attendance.js] — autosave pattern, payment methods
- [Source: server/routes/game-sessions.js] — PUT endpoint
- [Source: public/js/data/accessors.js]

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
