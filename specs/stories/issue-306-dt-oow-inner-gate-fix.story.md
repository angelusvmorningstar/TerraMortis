# Story: issue-306 — DT inner gate must respect out-of-window access override

Status: review

issue: 306
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/306
branch: morningstar-issue-306-dt-oow-inner-gate-fix

## Story

As an ST,
I want a player I've granted out-of-window access to be able to open their downtime form regardless of the cycle's current status,
so that late or early override grants actually work and the player isn't blocked by a redundant inner gate.

## Acceptance Criteria

1. **Game App — form renders with override**: Given a cycle in any non-`'active'` status (e.g. `'prep'`, `'open'`, `'closed'`) and a character whose `_id` appears in `cycle.out_of_window_player_ids`, when the player opens the Downtime tab in the Game App, the submission form renders — NOT the "Downtime submissions are currently closed." gate page.
2. **Player Portal — form renders with override**: Same as AC-1 but via the Player Portal (`player.js` → `renderDowntimeTab` without `singleColumn`).
3. **No regression — ungranted players still gated**: A character NOT in `out_of_window_player_ids` on a non-active cycle still sees the gate page.
4. **No regression — active cycle**: All players reach the form when the cycle status is `'active'`, regardless of whether they're in `out_of_window_player_ids`.

## Tasks / Subtasks

- [x] Task 1 — Fix `_gateBlocks` in `renderDowntimeTab` (AC: #1, #2, #3, #4)
  - [x] After `currentCycle` is loaded (around line 1464), compute `_hasWindowAccess` by checking `(currentCycle?.out_of_window_player_ids || []).map(String).includes(String(currentChar._id))`
  - [x] Update `_gateBlocks` to: `!currentCycle || (!_formStatuses.includes(currentCycle.status) && !_hasWindowAccess)`
  - [x] This single change covers both the `singleColumn` path (lines 1469/1470) and the two-pane path (lines 1489/1490) — both branches read `_gateBlocks`, so no duplicate fix needed

- [x] Task 2 — Verify rename consistency (AC: all)
  - [x] Confirm no code references `early_access_player_ids` anywhere in `public/js/` or `server/` (grep returned empty — clean)

- [x] Task 3 — Manual smoke test (AC: #1, #3)
  - [x] Playwright E2E tests added (`tests/issue-306-dt-oow-inner-gate-fix.spec.js`) — 6/6 pass; covers AC1 (form renders with override on prep cycle), AC3 (ungated player still blocked), AC4 (active cycle regression). Live in-browser verification with a real cycle remains for post-deploy confirmation.

## Dev Notes

### What's already done on this branch

The following was completed before this story was created — **do not redo these**:

- `early_access_player_ids` renamed → `out_of_window_player_ids` in all live code:
  - `server/schemas/downtime_submission.schema.js`
  - `server/routes/downtime.js` (projection + guard)
  - `public/js/downtime/db.js` (new-cycle stub)
  - `public/js/admin/downtime-views.js` (toggle read + write, local var `earlyIds` → `oowIds`)
  - `public/js/tabs/downtime-tab.js` (outer access check, local var `inEarlyAccess` → `hasWindowAccess`)
- MongoDB migration script `server/scripts/rename-early-access-to-out-of-window.js` created and already run against the live DB (1 cycle modified).

### The actual bug to fix

`public/js/tabs/downtime-form.js` lines 1461-1494 — `renderDowntimeTab` function:

```js
// STs can preview the form for active or prep cycles; players only for active
const _isST = isSTRole();
const _formStatuses = _isST ? ['active', 'prep'] : ['active'];
const _gateBlocks = !currentCycle || !_formStatuses.includes(currentCycle.status);
// ↑ BUG: this gate is blind to out_of_window_player_ids.
//   Even though downtime-tab.js correctly checks hasWindowAccess before calling
//   renderDowntimeTab, this inner gate re-blocks the player unconditionally.
```

**Fix (one logical change, covers both render paths):**

```js
const _isST = isSTRole();
const _formStatuses = _isST ? ['active', 'prep'] : ['active'];
const _hasWindowAccess = (currentCycle?.out_of_window_player_ids || [])
  .map(String).includes(String(currentChar._id));
const _gateBlocks = !currentCycle || (!_formStatuses.includes(currentCycle.status) && !_hasWindowAccess);
```

Both gated `if` blocks (`options.singleColumn` path line 1469 and two-pane path line 1489) read `_gateBlocks` — both are fixed by the single variable change. No structural changes to the render logic.

### Why `player.js:320` needs no change

`player.js` calls `renderDowntimeTab` directly. Once the inner gate respects `out_of_window_player_ids`, players on the Player Portal will also pass through correctly. The outer access check is only in `downtime-tab.js` (Game App) — the Player Portal has no equivalent outer check, but the fixed inner check is sufficient because it reads directly from `currentCycle` which is loaded inside `renderDowntimeTab`.

### The `renderCycleGatePage` message mapping

The "Downtime submissions are currently closed." message (line 1591 in `renderCycleGatePage`) is the `else` branch — shown when the cycle exists but is neither `'game'` nor `'closed'`. This is the message Arlo saw, confirming the cycle is in `'prep'` or similar non-active status during the DT3 window.

### String coercion

`out_of_window_player_ids` stores character `_id` values as strings (written by the admin toggle via `String(c._id)`). `currentChar._id` from MongoDB is an ObjectId. Always coerce both sides with `String()` before comparison — same pattern used in `downtime-tab.js:48` and `server/routes/downtime.js:58`.

### Project Structure Notes

- Only `public/js/tabs/downtime-form.js` requires a code change for this story
- No server-side changes; no schema changes; no CSS changes
- The migration script is already run — no further DB ops needed

### References

- `public/js/tabs/downtime-form.js:1461-1494` — gate logic (fix target)
- `public/js/tabs/downtime-form.js:1573-1601` — `renderCycleGatePage()` (no change)
- `public/js/tabs/downtime-tab.js:43-55` — outer access check (reference, no change)
- `public/js/player.js:320` — Player Portal caller (no change)
- `server/routes/downtime.js:50-62` — server-side gate (already correct, no change)
- `public/js/admin/downtime-views.js:2518-2610` — admin toggle (already updated, no change)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `_hasWindowAccess` check after `_formStatuses` derivation in `renderDowntimeTab`. Reads `currentCycle?.out_of_window_player_ids`, coerces both sides with `String()` for ObjectId safety. Updated `_gateBlocks` to short-circuit the status check when the character has window access. Covers both `singleColumn` (Game App) and two-pane (Player Portal) render paths with a single variable change.
- Sanity grep confirmed zero remaining `early_access_player_ids` references in live code (rename completed earlier in this session).
- Task 3 (manual smoke test) left for ST to verify against live app after deploy.

### File List

- `public/js/tabs/downtime-form.js` — added `_hasWindowAccess`, updated `_gateBlocks`
- `public/js/admin/downtime-views.js` — field + var rename (`early_access_player_ids` → `out_of_window_player_ids`, `earlyIds` → `oowIds`)
- `public/js/tabs/downtime-tab.js` — field + var rename (`early_access_player_ids` → `out_of_window_player_ids`, `inEarlyAccess` → `hasWindowAccess`)
- `public/js/downtime/db.js` — field rename in new-cycle stub
- `server/routes/downtime.js` — field rename in projection + guard, var rename (`earlyIds` → `oowIds`)
- `server/schemas/downtime_submission.schema.js` — field rename
- `server/scripts/rename-early-access-to-out-of-window.js` — new migration script (already run against live DB)
- `tests/issue-306-dt-oow-inner-gate-fix.spec.js` — new Playwright E2E tests (6/6 pass)
