# Story: dt.prep — DT Prep Phase (Phase 0 in Downtime Workflow)

## Status: review

## Summary

Add a "DT Prep" step as phase 0 in the downtime admin phase ribbon, before the existing "City & Feeding" step. This phase lets STs create a new cycle, set auto-open and deadline datetimes, and grant early access to specific players. Players see a countdown or locked state until the cycle opens. STs always bypass the gate.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/admin.html` | Add DT Prep button to phase ribbon (or render dynamically) |
| `public/js/admin/downtime-views.js` | New `'prep'` phase logic, DT Prep panel render, ribbon update |
| `public/js/tabs/downtime-tab.js` | Check `auto_open_at` + early access before showing form; ST bypass |
| `server/routes/downtime.js` | Ensure cycle POST/PUT accepts `auto_open_at`, `early_access_player_ids` |

---

## Acceptance Criteria

1. "DT Prep" appears as the first step in the phase ribbon — always accessible when no active cycle exists, or when current cycle is in prep status
2. DT Prep panel contains: "New Cycle" button, auto-open datetime picker, deadline datetime picker, early access player list (add/remove per player)
3. "New Cycle" button calls `createCycle()` and sets cycle status to `'prep'`
4. When `auto_open_at` is reached the cycle status automatically... actually this is a client-side check — when a player loads the DT form, the form checks `auto_open_at <= now` and opens access
5. Players NOT in early access and before `auto_open_at` see: countdown if date is set, locked message if not
6. Players IN `early_access_player_ids` see the form regardless of `auto_open_at`
7. ST role always sees the DT form (no gate)
8. The existing phases (City & Feeding = 0, Downtimes = 1 etc.) shift by one — DT Prep is now step 0, City & Feeding is step 1

---

## Tasks / Subtasks

- [x] Add `'prep'` cycle status and fields to server (AC: #3)
  - [x] `downtimeCycleSchema` updated: status enum now includes 'prep','game','active','open','closed'; added `auto_open_at` and `early_access_player_ids`
- [x] Update phase ribbon in `downtime-views.js` (AC: #1, #8)
  - [x] `getCyclePhase()`: prep→0, game→1, active→2, closed→3/4
  - [x] `getSubPhases()`: case 0 = prep subphases (Auto-Open Set, Deadline Set)
  - [x] `mainSteps` prepended with 'DT Prep'
  - [x] `renderPrepPanel()` called from `loadCycleById()`
- [x] Render DT Prep panel (AC: #2, #3)
  - [x] "New Cycle" button in toolbar calls `handleNewCycle()` → `createCycle(n, {status:'prep'})`
  - [x] `renderPrepPanel()`: auto-open input, deadline input, early access player list with add/remove
  - [x] "Open City & Feeding Phase →" button transitions status to 'game'
- [x] Update player-facing DT form gate (`downtime-tab.js`) (AC: #4, #5, #6, #7)
  - [x] Imports `isSTRole`, `getUser` from discord.js
  - [x] `canAccess` = isST || inEarlyAccess || autoOpenPassed || cycleIsOpen
  - [x] Locked: shows countdown if `auto_open_at` set, locked message if not
  - [x] Countdown via `_startCountdown()` — updates every second, clears on unmount

---

## Dev Notes

### Current phase logic (downtime-views.js:216-222)
```js
function getCyclePhase(cycle, subs) {
  if (!cycle) return null;
  if (cycle.status === 'game')   return 0;   // → becomes 1
  if (cycle.status === 'active') return 1;   // → becomes 2
  // closed: phase 2 or 3 depending on pending subs
}
```
After this story: `prep` → 0, `game` → 1, `active` → 2, `closed` → 3 or 4.

### mainSteps array (line 266)
```js
const mainSteps = ['City & Feeding', 'Downtimes', 'ST Processing', 'Push Ready'];
// → becomes:
const mainSteps = ['DT Prep', 'City & Feeding', 'Downtimes', 'ST Processing', 'Push Ready'];
```

### Player access check in downtime-tab.js (line 28-29)
```js
const activeCycle = cycles.find(c => c.status === 'open' || c.status === 'active') || null;
```
Replace with the full access check described in tasks above. Note `status === 'open'` is a legacy value — keep it for backward compatibility.

### Countdown component
Simple inline countdown using `setInterval` to update every second. Format: "Opens in Xd Xh Xm Xs". Clear interval on unmount (when tab changes). No external library.

### Early access player list
The `players` collection has `_id` and `player_name`. Load players from `/api/players` (already available in admin context) to render the add dropdown.

### New cycle creation
`createCycle()` in `downtime/db.js` currently sets `status: 'active'`. Add an optional `status` param or create a separate `createPrepCycle()` that sets `status: 'prep'`.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- Server schema extended: status enum + auto_open_at + early_access_player_ids
- createCycle() now defaults to status 'prep'
- Phase ribbon: 5 phases now — DT Prep(0), City&Feeding(1), Downtimes(2), ST Processing(3), Push Ready(4)
- renderPrepPanel(): full CRUD for auto-open, deadline, early access players; Open Phase button
- Player gate: ST always passes; players check early access list and auto_open_at; countdown timer live

### File List

- `server/schemas/downtime_submission.schema.js`
- `public/js/downtime/db.js`
- `public/js/admin/downtime-views.js`
- `public/admin.html`
- `public/js/tabs/downtime-tab.js`
- `public/css/admin-layout.css`

### Change Log

- 2026-04-23: Implemented dt.prep — DT Prep phase with cycle creation, auto-open gate, early access, countdown
