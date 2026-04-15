# Story DT-Fix-22: Roll Button Unlocks on Committed

## Status: done

## Story

**As an** ST processing downtime actions,
**I want** the Roll button to become available as soon as I click "Committed",
**so that** I can roll dice immediately after locking the pool without needing to click "Validated" first.

## Background

The current flow is: Pending → Committed → **Validated** → Roll available → Resolved.

"Validated" was acting as an intermediate gate before rolling, but it's redundant — when the ST clicks "Committed", the status button handler already saves `pool_validated` (the pool expression) to the review object as part of the same operation. The Roll button's only hard requirement is that `pool_validated` is non-empty, which is already satisfied at the Committed step.

The correct flow is: Pending → Committed (Roll unlocks) → Roll → Validated (outcome confirmed).

**Root cause (line 5488 in `_renderProjectRightPanel`):**
```js
const showRollBtn = poolStatus === 'validated' || !!projRoll;
```

The button only renders when `poolStatus === 'validated'` or a roll already exists. Adding `poolStatus === 'committed'` to the condition is the entire fix.

**Why `pool_validated` is already set on Committed:** The `.proc-val-btn` handler (line ~3470) saves `pool_validated: expr` from the pool builder BEFORE saving the status. Both Committed and Validated clicks go through this path identically — the pool is saved either way.

**DT-Fix-18 note:** DT-Fix-18 (auto-advance to "Rolled" status after rolling) was superseded by this story. With Committed unlocking the Roll button, the intermediate "Rolled" status is unnecessary — the roll result's presence is sufficient signal.

---

## Acceptance Criteria

1. The Roll button renders and is clickable when `poolStatus === 'committed'` (in addition to `validated` and when a prior roll exists).
2. The Roll button does not render when `poolStatus === 'pending'`, `no_roll`, `no_effect`, `resolved`, `skipped`.
3. After rolling from Committed state, the roll result saves correctly and the panel re-renders with the result displayed.
4. "Validated" remains a valid status and the Roll button continues to work from that state (no regression).
5. The fix applies to all action types that use `_renderProjectRightPanel` (project, merit roll-based, sorcery — wherever `showRollBtn` is gated the same way).

---

## Tasks / Subtasks

- [x] Task 1: Fix `showRollBtn` condition in `_renderProjectRightPanel` (`downtime-views.js`)
  - [x] 1.1: Line 5488 — change:
    ```js
    // BEFORE:
    const showRollBtn = poolStatus === 'validated' || !!projRoll;

    // AFTER:
    const showRollBtn = poolStatus === 'committed' || poolStatus === 'validated' || !!projRoll;
    ```

- [x] Task 2: Check for identical gating in other right-panel functions
  - [x] 2.1: Search for `showRollBtn` in `_renderFeedRightPanel` — if the same gate exists, apply the same fix
  - [x] 2.2: Search for `showRollBtn` in `_renderSorcRightPanel` or sorcery rendering — apply fix if present
  - [x] 2.3: Merit right panel (`_renderMeritRightPanel`) — DT-Fix-23 removed roll from merit entirely; no action needed

---

## Dev Notes

### Key file

`public/js/admin/downtime-views.js` — primary change is 1 line in `_renderProjectRightPanel`.

### Why `pool_validated` is already available at Committed

The `.proc-val-btn` click handler (line ~3470) for feeding and project entries:

```js
// Runs for ANY status button click on feeding/project entries:
const builder = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
if (builder) {
  const expr = _readBuilderExpr(builder);
  if (expr) {
    await saveEntryReview(entry, { pool_validated: expr, ... });  // saved here
  }
}
// Then:
await saveEntryReview(entry, { pool_status: status });  // committed saved here
```

By the time `pool_status: 'committed'` is saved, `pool_validated` already has the expression. The Roll button's click handler (line ~3920) checks `if (!poolValidated) return` — this check already passes after Committed.

### Roll button data attribute

The roll button is rendered with `data-pool-validated="${esc(poolValidated)}"` where `poolValidated = rev.pool_validated`. With `pool_validated` saved at Committed, this attribute is populated correctly.

### `_readBuilderExpr` returns null if builder is incomplete

`_readBuilderExpr` (line ~4927) returns `null` if attr or skill are not selected. If the ST clicks Committed without filling the pool builder, `pool_validated` won't be saved and the Roll button won't render (since `!!projRoll` is also false). This is correct behaviour — a pool must be set before rolling.

### No CSS changes

No new CSS needed.

### No test framework

Manual verification:
1. Open a project action, set the pool builder (attr + skill), click Committed — Roll button should appear immediately.
2. Click Roll — roll result saves, panel re-renders with result.
3. Click Validated — Roll/Re-roll button still present.
4. Open an action that already has a saved roll — Roll/Re-roll present regardless of status (existing behaviour via `!!projRoll`).

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- Task 1: Added `poolStatus === 'committed'` to the `showRollBtn` condition at line 5488 in `_renderProjectRightPanel`. Single-line change.
- Task 2: `showRollBtn` only appears once in downtime-views.js (in `_renderProjectRightPanel`). `_renderFeedRightPanel` has no roll button at all. There is no `_renderSorcRightPanel` function — sorcery uses the project panel path. `_renderMeritRightPanel` confirmed no roll button (DT-Fix-23 already handled). No additional changes needed.

### File List
- `public/js/admin/downtime-views.js`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft — research confirmed single-line fix | Bob (SM) + Angelus |
