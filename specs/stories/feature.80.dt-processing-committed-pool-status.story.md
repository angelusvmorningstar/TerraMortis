# Story feature.80: Committed Pool Status (E2)

## Status: ready-for-dev

## Story

**As an** ST processing downtimes,
**I want** a "Commit Pool" step separate from "Validated",
**so that** I can lock in a dice pool (ready to roll) without implying the full action outcome has been approved.

## Background

Currently `validated` conflates two distinct events: the pool being finalised and the full mechanical outcome being approved. In practice the ST often commits the pool size before rolling, then confirms the result separately.

Adding a `committed` intermediate status lets the ST lock the pool without triggering the "done" signal used by the DT Story checklist and submission progress counters.

---

## Acceptance Criteria

1. A `committed` pool status exists. It is **not** in `DONE_STATUSES` — a committed entry is not considered resolved.
2. The status button set for **project**, **sorcery**, and **merit** (rolled) action panels includes a `Committed` button (label: `Committed`), positioned between `Pending` and `Validated`.
3. When pool status is `committed`:
   - Pool builder inputs are read-only / disabled — the pool is locked.
   - The Roll button remains active and rollable.
   - A small locked indicator appears near the pool builder heading (e.g. `🔒` or `[Committed]` text label).
4. Transitioning from `committed` → any other status re-enables pool builder inputs.
5. The submission checklist and progress counters treat `committed` as incomplete (same as `pending`).
6. The DT Story checklist treats `committed` as incomplete — no narrative section unlocked yet.
7. No other functional or visual changes.

---

## Tasks / Subtasks

- [ ] Task 1: Add `committed` to pool status constants
  - [ ] Confirm it is NOT added to `DONE_STATUSES`
  - [ ] Add to any status-label maps used for display

- [ ] Task 2: Add `Committed` button to project, sorcery, and merit (rolled) status button sets
  - [ ] Project: `[['pending','Pending'], ['committed','Committed'], ['validated','Validated'], ['no_roll','No Roll Needed'], ['skipped','Skip']]`
  - [ ] Sorcery: `[['pending','Pending'], ['committed','Committed'], ['validated','Validated'], ['no_roll','No Roll Needed'], ['skipped','Skip']]`
  - [ ] Merit rolled: `[['pending','Pending'], ['committed','Committed'], ['resolved','Approved'], ['no_roll','No Roll Needed'], ['skipped','Skip']]`
  - [ ] Feeding does not need committed (no pool builder in the same sense)

- [ ] Task 3: Pool builder read-only when committed
  - [ ] When `poolStatus === 'committed'`, disable all pool builder `<select>` and `<input>` elements
  - [ ] Add a `[Committed]` label or lock indicator near the pool builder heading
  - [ ] Ensure Roll button remains enabled

- [ ] Task 4: Manual verification
  - [ ] Click Committed on a project action — pool inputs grey out, Roll still works
  - [ ] Click Pending — pool inputs re-enable
  - [ ] Confirm submission checklist does not count committed as done

---

## Dev Notes

### Status constants

```js
const DONE_STATUSES = new Set([...]);  // committed is NOT added here
```

### Pool builder disable pattern

After rendering, iterate `.proc-pool-builder` inputs and selects:
```js
if (poolStatus === 'committed') {
  builder.querySelectorAll('select, input').forEach(el => el.disabled = true);
}
```
Or add a CSS class `.proc-pool-committed` to the builder wrapper and use `pointer-events: none; opacity: 0.6`.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Add status button; pool builder disable logic |
| `public/css/admin-layout.css` | Optional: `.proc-pool-committed` style |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (bmad-agent-sm) |
