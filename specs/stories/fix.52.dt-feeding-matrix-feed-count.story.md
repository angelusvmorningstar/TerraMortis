# Story fix.52: DT Feeding Matrix — four-state feed-count display

**Story ID:** fix.52
**Epic:** Fixes
**Issue:** 273
**Issue URL:** https://github.com/angelusvmorningstar/TerraMortis/issues/273
**Branch:** morningstar-issue-273-feeding-matrix-feed-count
**Status:** review
**Date:** 2026-05-12

---

## User Story

As an ST viewing the DT Feeding Matrix, I want each cell to show how many times a character fed in a territory (O / O O / X / X X) and the Ambience overfeeding column to display the correct total feed count and penalty, so the matrix accurately reflects what actually happened rather than collapsing all feeds to a single binary marker.

---

## Background

`_getSubFedTerrs(sub)` returns `Set<csvKey>` — binary presence only.
`_computeMatrixFeederCounts()` increments +1 per character per territory regardless of count.
`_buildMatrixTableHtml()` renders O / X / — based on set membership.

The Overfeeding column in the Ambience table shows `cap/feeders | gap` (reversed and uses cap−feeders gap, not the ×2 penalty).

Feed Action identification is out of scope (follow-up issue). For now count=1 per game-start feed.

---

## Acceptance Criteria

- [x] Cell renders `—` when count = 0
- [x] Cell renders `O` when count = 1 and character has feeding rights
- [x] Cell renders `O O` when count = 2 and character has feeding rights
- [x] Cell renders `X` when count = 1 and no feeding rights
- [x] Cell renders `X X` when count = 2 and no feeding rights
- [x] `_computeMatrixFeederCounts().byTerrId` sums feed counts (single source of truth via `_getSubFedTerrs`)
- [x] Matrix `<tfoot>` row shows total feed count per territory column
- [x] Overfeeding column displays `feeders/cap | -penalty` (not `cap/feeders | gap`)
- [x] Matrix legend updated to explain O / O O / X / X X
- [ ] Feed Action +1 per territory — **DEFERRED** to follow-up issue

---

## Tasks / Subtasks

- [x] Task 1: Change `_getSubFedTerrs` to return `Map<csvKey, number>`
- [x] Task 2: Update `_buildMatrixTableHtml` for four-state rendering + tfoot
- [x] Task 3: Update `_computeMatrixFeederCounts` to use `_getSubFedTerrs` Map
- [x] Task 4: Fix Overfeeding column display in `_buildAmbienceHtml`

---

## Dev Notes

- `_getSubFedTerrs` is in `downtime-views.js` near line 9891
- `_buildMatrixTableHtml` is near line 9945
- `_computeMatrixFeederCounts` is near line 3585
- Overfeeding cell render is at line 10112; gap vars at 10083-10085
- `AMBIENCE_STEPS_LIST` ordering: worst→best (Hostile=0, The Rack=top)
- ST override path in `_getSubFedTerrs` (lines 9896-9904) handles array of territory IDs — must support count >1 if same ID repeated
- Barrens fallback: `'The Barrens (No Territory)'` — must set count=1 in Map, not use `.add()`
- Feed Action: stub with TODO comment, do not implement

---

## Dev Agent Record

### Completion Notes

**Task 1 — `_getSubFedTerrs` Map refactor:**
Changed `new Set()` → `new Map()`. All `.add(csvKey)` calls replaced with `.set(csvKey, (fed.get(csvKey) || 0) + 1)`. ST override path supports repeated territory IDs (counts them). Barrens fallback uses `fed.set(..., 1)`. Added TODO comment for Feed Action stub.

**Task 2 — `_buildMatrixTableHtml` four-state + tfoot:**
`fedTerrs` is now `Map`, `new Set()` fallback changed to `new Map()`. Cell logic uses `fedMap.get(t.csvKey) || 0` for count; renders `O O` / `X X` for count ≥ 2. Footer accumulation runs during body loop. `<tfoot>` row added with per-column feed totals. Legend updated.

**Task 3 — `_computeMatrixFeederCounts` unified source:**
Removed queue-based traversal. Now iterates submissions, calls `_getSubFedTerrs(s)` per submission, sums Map values into `byCsvKey` and `byTerrId`. ST overrides and legacy fallback respected via `_getSubFedTerrs`. `subByCharId` built in same loop.

**Task 4 — Overfeeding display `feeders/cap | -penalty`:**
Removed gap vars (lines 10083-10085). Cell now shows `feeders/cap` with optional `| overfeed` suffix when feeders > cap (uses `r.overfeed` which is already the signed penalty value).

---

## File List

- `public/js/admin/downtime-views.js`

---

## Change Log

- 2026-05-12: Implemented four-state feeding matrix (O/OO/X/XX), tfoot feed totals, unified `_computeMatrixFeederCounts`, fixed overfeeding column display.
