# Story fix.401: DT Processing — add per-action processed indicator

**Story ID:** fix.401
**Epic:** DT Processing QoL
**Status:** review
**Date:** 2026-05-19
**Issue:** [#401](https://github.com/angelusvmorningstar/TerraMortis/issues/401)
**Branch:** ms/issue-401-dt-processing-processed-indicator

---

## User Story

As an ST processing a downtime cycle, I want each action row in DT Processing to show a clear visual indicator when it has been fully processed, so that I can see at a glance which actions I have handled without relying on memory.

---

## Background

### Problem

DT Processing action rows have a `.proc-row-status` badge that shows `pool_status` as text (e.g., "Pending", "Resolved", "No Roll"). The badge colour distinguishes states but does not make "done vs not done" immediately obvious at the row level — the entire row looks the same whether it is pending or resolved. STs working through a long queue lose track of which actions they have already completed within a session, leading to double-processing or missed actions.

### What already exists

- `DONE_STATUSES` (line 244, `downtime-views.js`): `new Set(['validated', 'no_roll', 'no_feed', 'maintenance', 'resolved', 'no_effect', 'skipped', 'obvious', 'neutral', 'subtle'])` — the canonical set of statuses that mean "done, nothing more to do".
- `procHideDone` toggle (line 35) already hides rows in `DONE_STATUSES` from the queue entirely. This toggle is working and in scope to stay as-is.
- Phase-level progress badge in each phase header: `_progressBadge(doneCount, entries.length, '')` (line 4426) already shows "X/Y" or "✓ Done" per phase. The helper is reusable.
- `getEntryReview(entry)` (line 3594): returns the resolved object for any entry source type; always has `pool_status`.

### "Processed" definition — code-level

The issue brief uses `outcome_roll`/`outcome_note` language that does not map to actual field names. The correct code-level check for "an action is processed / done" is:

```js
DONE_STATUSES.has(review?.pool_status)
```

This applies uniformly to all entry source types (merit, project, feeding, travel, sorcery, st_created, acquisition) because `getEntryReview` normalises them all to an object with `pool_status`.

### Row rendering sites

There are two places where `.proc-action-row` divs are built:

1. **`renderProcessingMode`** — lines 4463-4485: the main queue loop, solo (non-joint) actions.
2. **`renderJointGroup`** — lines 852-877: participant rows inside a joint project group.

Both sites already compute `review` and `status` from `getEntryReview`. Both need the same CSS class added.

### Session-level progress counter

The controls bar (line 4414) currently only has the "Hide done / Show all" button. A total progress counter ("X / Y done") is optional in the issue. The `_progressBadge` helper supports this pattern and can be called with the totals from `queue` (the flat array of all entries passed to `renderProcessingMode`).

---

## Acceptance Criteria

- [ ] Given an action row where `DONE_STATUSES.has(review?.pool_status)` is true, when DT Processing renders, then the row div has the CSS class `proc-action-done` and is visually de-emphasised (e.g., reduced opacity or muted text colour).
- [ ] Given an action row where the action is not in `DONE_STATUSES`, the row renders without `proc-action-done` and is visually unchanged from current state.
- [ ] The processed indicator applies to both the main queue loop (solo actions) and joint participant rows in `renderJointGroup`.
- [ ] The existing hide-done toggle continues to work as before (hides `DONE_STATUSES` rows when active).
- [ ] Optionally: the proc-queue controls bar shows a total session progress counter ("X / Y done") derived from `DONE_STATUSES` counts across all queue entries.

---

## Implementation

### Pre-flight

This branch is based on `Morningstar`, which is behind `origin/dev`. Run `git merge origin/dev` before starting — `downtime-views.js` on `dev` has changes not yet on `Morningstar`.

### 1. `public/js/admin/downtime-views.js` — `renderProcessingMode` row loop (~line 4463)

```js
// Before:
h += `<div class="proc-action-row${isExpanded ? ' expanded' : ''}" data-proc-key="${esc(entry.key)}">`;

// After:
const isDone = DONE_STATUSES.has(status);
h += `<div class="proc-action-row${isExpanded ? ' expanded' : ''}${isDone ? ' proc-action-done' : ''}" data-proc-key="${esc(entry.key)}">`;
```

`status` is already set two lines above as `review?.pool_status || 'pending'`.

### 2. `public/js/admin/downtime-views.js` — `renderJointGroup` row loop (~line 853)

Same change, same pattern — `status` is already computed above the div:

```js
// Before:
h += `<div class="proc-action-row proc-joint-row${isExpanded ? ' expanded' : ''}" data-proc-key="${esc(entry.key)}">`;

// After:
const isDone = DONE_STATUSES.has(status);
h += `<div class="proc-action-row proc-joint-row${isExpanded ? ' expanded' : ''}${isDone ? ' proc-action-done' : ''}" data-proc-key="${esc(entry.key)}">`;
```

### 3. `public/js/admin/downtime-views.js` — controls bar total counter (optional, ~line 4414)

```js
// In the proc-queue-controls block, after the hide-done button:
const totalDone  = queue.filter(e => DONE_STATUSES.has(getEntryReview(e)?.pool_status)).length;
const totalCount = queue.length;
const progressTxt = totalDone === totalCount && totalCount > 0
  ? `<span class="proc-progress-total proc-progress-all-done">✓ All done (${totalCount})</span>`
  : `<span class="proc-progress-total">${totalDone} / ${totalCount} done</span>`;
h += progressTxt;
```

`queue` is the flat array already in scope at that point in `renderProcessingMode`.

### 4. `public/css/admin-layout.css` — new `.proc-action-done` rule

Add after the existing `.proc-action-row.expanded` rule (~line 4517):

```css
.proc-action-row.proc-action-done {
  opacity: 0.55;
}
.proc-action-row.proc-action-done:hover {
  opacity: 0.8;
}
.proc-action-row.proc-action-done .proc-row-char,
.proc-action-row.proc-action-done .proc-row-label,
.proc-action-row.proc-action-done .proc-row-desc {
  color: var(--txt3);
}
```

And for the optional total counter badge, add:

```css
.proc-progress-total {
  font-size: 0.78rem;
  color: var(--txt2);
  margin-left: auto;
  padding: 2px 8px;
}
.proc-progress-total.proc-progress-all-done {
  color: var(--result-succ);
}
```

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-views.js` | Add `proc-action-done` class in `renderProcessingMode` row loop; same in `renderJointGroup`; optional total counter in controls bar |
| `public/css/admin-layout.css` | Add `.proc-action-row.proc-action-done` opacity/colour rules; optional `.proc-progress-total` badge style |

No schema changes. No API changes. No new stored fields.

---

## Dev Notes

- `DONE_STATUSES` at line 244 is the single source of truth for "is this action finished." Do not inline your own status checks — use it.
- `procHideDone` filters the `visibleEntries` array before the loop, so when hide-done is active, `proc-action-done` rows are already excluded and the CSS class never appears. The two mechanisms are orthogonal.
- The optional progress counter uses `queue` (all entries), not `visibleEntries`, so it always shows the true total even when hide-done is active.
- `renderJointGroup` is called before `renderProcessingMode`'s main loop. The function is defined at a different location in the file — search for `function renderJointGroup` to locate it.
- Verify `isDone` is declared with `const` inside the loop body, not before the loop, to avoid variable shadowing issues if the loop is nested.
- No tests required (pure render-path; no business logic introduced). Verify manually in admin DT Processing with a submission that has at least one resolved and one pending action.
