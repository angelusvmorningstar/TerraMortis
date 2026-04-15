# Story DT-Fix-9: Feeding Sidebar — Add Committed Status Button

## Status: done

## Story

**As an** ST processing a feeding action,
**I want** the feeding sidebar status buttons to include Committed (matching action panels),
**so that** I can lock the feeding pool before marking it Validated, consistent with how project and merit actions work.

## Background

Action panels (project, merit) gained a `committed` intermediate status in DT-Proc-E2. The feeding sidebar was not updated to match. The status buttons in `_renderFeedRightPanel` currently only offer Pending / Validated / No Valid Feeding — missing Committed.

---

## Current Code

**File:** `public/js/admin/downtime-views.js`
**Function:** `_renderFeedRightPanel()` (~line 5669)

```js
h += _renderValStatusButtons(key, poolStatus, [
  ['pending', 'Pending'],
  ['validated', 'Validated'],
  ['no_feed', 'No Valid Feeding']
]);
```

**Compare — project panel** (~line 5418):
```js
h += _renderValStatusButtons(key, poolStatus, [
  ['pending', 'Pending'],
  ['committed', 'Committed'],
  ['validated', 'Validated'],
  ['no_roll', 'No Roll Needed'],
  ['skipped', 'Skip']
]);
```

---

## Required Change

**File:** `public/js/admin/downtime-views.js`
**Function:** `_renderFeedRightPanel()` (~line 5669)

```js
h += _renderValStatusButtons(key, poolStatus, [
  ['pending', 'Pending'],
  ['committed', 'Committed'],
  ['validated', 'Validated'],
  ['no_feed', 'No Valid Feeding']
]);
```

Add `['committed', 'Committed']` between Pending and Validated. `committed` is already in `DONE_STATUSES`? No — check: committed is NOT in DONE_STATUSES (by design: committed means locked but not resolved). Verify `DONE_STATUSES` does not include `committed` before shipping.

Also verify the committed pool display block already exists in `_renderFeedRightPanel` — it was added in E2 for merit/project. If not present in feeding, add it:

```js
// After status buttons:
const poolValidatedFeed = rev.pool_validated || '';
h += `<div class="proc-feed-committed-pool" data-proc-key="${esc(key)}">${
  poolValidatedFeed ? esc(poolValidatedFeed) : '<span class="dt-dim-italic">Not yet committed</span>'
}</div>`;
if (poolValidatedFeed) h += `<button class="dt-btn proc-pool-clear-btn" data-proc-key="${esc(key)}">Clear Pool</button>`;
```

---

## Acceptance Criteria

1. Feeding sidebar status buttons are: Pending / Committed / Validated / No Valid Feeding.
2. Committed status saves correctly to `feeding_review.pool_status`.
3. Committed is NOT in `DONE_STATUSES` — a committed feeding entry is not counted as resolved.
4. The committed pool expression display renders beneath the status buttons (showing the current `pool_validated` expression or "Not yet committed").
5. Clear Pool button appears when a pool expression is saved.

---

## Tasks / Subtasks

- [x] Task 1: Add Committed button to `_renderFeedRightPanel` status array
- [x] Task 2: Verify/add committed pool display block in feeding right panel
- [x] Task 3: Confirm `committed` is absent from `DONE_STATUSES`
- [ ] Task 4: Manual verification — set feeding to Committed, confirm display, set to Validated, confirm counts as done

---

## Dev Notes

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Modify `_renderFeedRightPanel()` — add Committed button + pool display |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- Added `['committed', 'Committed']` to feeding status button array in `_renderFeedRightPanel()` (line 5490)
- Committed pool display block (`proc-feed-committed-pool`) already present from E2 — no addition needed
- Clear Pool button already conditional on `poolValidated` — no addition needed
- `DONE_STATUSES` confirmed: `committed` absent; feeding committed entries correctly not counted as resolved

### File List
- `public/js/admin/downtime-views.js`
