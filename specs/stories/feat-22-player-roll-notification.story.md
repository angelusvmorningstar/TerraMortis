# Story feat-22: Player-to-Player Roll Notification Workflow

Status: review

## Story

As a player,
I want to be able to initiate a contested roll against another player from my character sheet,
so that mechanical interactions (power use, social manoeuvres) can be resolved in-app without hunting down an ST in a busy room.

## Acceptance Criteria

1. A player can initiate a roll challenge from their character sheet by tapping a power or discipline action that triggers a contested roll.
2. The challenge creates a pending record visible to the target player, who receives a visual notification badge in the app.
3. The target player can accept the challenge, at which point both pools are shown and the roll resolves in-app.
4. The ST is notified of the challenge initiation and outcome via the session log (same `session_logs` mechanism as existing contested rolls).
5. The ST can override or void any challenge outcome from the session log view.
6. Resolved challenges disappear from the notification queue; declined challenges are logged and dropped.
7. Polling-based notification check (every 10 seconds when app is active) — no WebSocket required for MVP.
8. The workflow is available in the unified app (not admin-only).

## Tasks / Subtasks

- [x] Task 1 — Server: `contested_roll_requests` collection + API endpoints (AC: 1, 2, 3, 4)
  - [x] `server/schemas/contested_roll_request.schema.js` created
  - [x] `server/routes/contested-rolls.js` created with POST, GET /mine, PUT /:id/accept, PUT /:id/decline, PUT /:id/void
  - [x] Registered in `server/index.js` under `/api/contested_roll_requests`
  - [x] On accept: dice rolled server-side, outcome stored, session_log posted directly via getCollection()

- [x] Task 2 — Client: polling + notification badge (AC: 2, 7)
  - [x] `startChallengePoller()` in `challenge-notification.js` polls every 10s
  - [x] Badge on `#more-badge` (existing `.nav-badge` element) updated with pending count
  - [x] Poller started after auth success only when `getRole() !== 'st'`
  - [x] Imported and wired in `app.js`

- [x] Task 3 — Client: incoming challenge notification UI (AC: 2, 3, 6)
  - [x] Modal overlay shown when new pending challenge detected (`_showIncomingModal`)
  - [x] Shows challenger name, roll type, pool sizes; Accept / Decline buttons
  - [x] On Accept: `PUT /:id/accept`, result returned with rolled dice; displayed via `_showResult()`
  - [x] On Decline: `PUT /:id/decline`, modal dismissed
  - [x] Dice display uses existing `mkColsEl` from `suite/roll.js`

- [x] Task 4 — Client: challenge initiation (AC: 1)
  - [x] `challenge-initiation.js` — modal with target selector, roll type, pool inputs, optional power name
  - [x] `challenge` tile added to MORE_APPS player section (`playerOnly: true` — hidden from STs who have full contested roll tool)
  - [x] `goTab('challenge')` intercepted in `app.js` to open modal rather than navigate
  - [x] POSTs to `/api/contested_roll_requests` on confirm; toast shown on success

- [x] Task 5 — ST oversight (AC: 4, 5)
  - [x] Resolved challenges auto-posted to `session_logs` with `type: 'player_contested_roll'`
  - [x] `PUT /:id/void` endpoint available (ST-auth only)
  - [x] Session log entries queryable by STs via existing `/api/session_logs` endpoint

## Dev Notes

### Architecture

- Dice rolled **server-side** on accept for consistency; full roll data (each die value) returned to client for visual display
- Polling uses `setInterval` every 10s; `_shown` Set tracks already-displayed challenges to prevent repeat modals
- `session_logs` is ST-only at HTTP level; route handler writes directly via `getCollection('session_logs')` bypassing HTTP middleware
- `playerOnly` flag on MORE_APPS tile filters the Challenge tile from ST views (STs have dedicated contested roll overlay)
- `goTab('challenge')` early-return pattern keeps routing clean — no DOM tab element needed

### Files Changed

- `server/schemas/contested_roll_request.schema.js` — new
- `server/routes/contested-rolls.js` — new
- `server/index.js` — import + registration
- `public/js/game/challenge-notification.js` — new
- `public/js/game/challenge-initiation.js` — new
- `public/js/app.js` — imports, MORE_APPS entry, goTab intercept, poller start, playerOnly filter
- `public/css/suite.css` — challenge modal + toast CSS

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Server-side dice rolling avoids client-side tamper; full roll data returned for visual display
- mkColsEl used for dice display; falls back gracefully if unavailable
- `_shown` Set in poller prevents the same challenge triggering repeated modals within a session

### File List

- server/schemas/contested_roll_request.schema.js
- server/routes/contested-rolls.js
- server/index.js
- public/js/game/challenge-notification.js
- public/js/game/challenge-initiation.js
- public/js/app.js
- public/css/suite.css
