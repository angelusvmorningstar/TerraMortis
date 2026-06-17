---
title: 'DT processing ribbon: merit outcome + travel discretion should mark action Complete'
type: 'fix'
issue: 860
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/860
branch: ms/issue-860-ribbon-merit-travel-complete
created: '2026-06-17'
status: review
recommended_model: 'sonnet — single-function logic fix (2 added lines); no handlers, schema, or CSS'
context:
  - public/js/admin/downtime-views.js
---

## Intent

The DT processing action ribbon (Pending → Valid → Complete) never reaches
**Complete** for merit actions (Approved/Partial/Failed) or travel actions
(Obvious/Neutral/Subtle), because completion is derived solely from
`outcome_confirmed` (the typed-outcome path). The ST records a terminal verdict
for these action types via buttons that don't set `outcome_confirmed`, so the
ribbon stalls at Valid. Fix the derivation so the action-type-appropriate signal
completes the ribbon.

## Root cause (do NOT re-investigate)

`_deriveActionRibbonState(rev)` (`public/js/admin/downtime-views.js:8446-8451`):

```js
function _deriveActionRibbonState(rev) {
  const ps = rev?.pool_status || 'pending';
  if (ps === 'pending') return 'pending';
  if (rev?.outcome_confirmed) return 'complete';
  return 'valid';
}
```

- **Merit outcome buttons** save `{ merit_outcome: <approved|partial|failed>,
  pool_status: 'resolved' }` (`downtime-views.js:6361-6369`) — terminal
  `pool_status` but NO `outcome_confirmed` → returns `'valid'`.
- **Travel discretion buttons** save `pool_status` = `obvious|neutral|subtle`
  (persisted to `st_review.travel_discretion`, `:3702-3705`; read back by
  `getEntryReview` at `:3685`). These are already in `DONE_STATUSES` (`:277`) but
  there is NO `outcome_confirmed` → returns `'valid'`.

The buttons already persist the right signal; only the ribbon *derivation* is
missing the cases.

## Fix specification

### T1 — extend `_deriveActionRibbonState` (the entire change)

```js
function _deriveActionRibbonState(rev) {
  const ps = rev?.pool_status || 'pending';
  if (ps === 'pending') return 'pending';
  if (rev?.outcome_confirmed) return 'complete';
  // #860: merit actions complete on an outcome verdict (Approved/Partial/Failed);
  // travel actions complete on a discretion choice (obvious/neutral/subtle).
  if (rev?.merit_outcome) return 'complete';
  if (ps === 'obvious' || ps === 'neutral' || ps === 'subtle') return 'complete';
  return 'valid';
}
```

No other change. Do NOT touch the merit/travel click handlers, `DONE_STATUSES`,
`getEntryReview`, or `saveEntryReview` — they already do their part.

## Acceptance criteria

- [x] **AC-1** Merit action with `merit_outcome` set → ribbon `complete`. _(new
      `if (rev?.merit_outcome) return 'complete'` branch; runtime re-render already
      happens via `renderProcessingMode` in the button handler. Visual confirm =
      smoke.)_
- [x] **AC-2** Travel action with discretion obvious/neutral/subtle → ribbon
      `complete`. _(new `pool_status` branch.)_
- [x] **AC-3** Project / full-merit unchanged — additive branches don't fire for
      them (they carry neither `merit_outcome` nor a discretion `pool_status`);
      `outcome_confirmed` is still checked first.
- [x] **AC-4** Diff confined to `_deriveActionRibbonState` — `git diff --stat` =
      +4 in `downtime-views.js` only; no handler/schema/CSS changes.
- [x] **AC-5** `node --check public/js/admin/downtime-views.js` clean.

## Dev notes

### Why this is safe / additive
- `merit_outcome` is only ever set by the merit outcome buttons
  (`downtime-views.js:6367`), so the new `if (rev?.merit_outcome)` branch fires
  only for merit actions.
- `obvious`/`neutral`/`subtle` are travel-discretion values; no other action type
  uses them as `pool_status`. So the discretion branch is travel-specific in
  practice.
- Project/full-merit completion still flows through `outcome_confirmed`
  (unchanged), which is checked first.
- `DONE_STATUSES`-based phase/character completion counts are unaffected — merit
  `resolved` and the discretion values are already in `DONE_STATUSES`.

### Open question (resolve at implementation)
The issue scopes ALL three merit verdicts (Approved/Partial/Failed) as completing
the ribbon — they are all terminal ST decisions. Default: keep
`if (rev?.merit_outcome)` (any of the three). If the ST later wants ONLY Approved
to complete, narrow to `rev.merit_outcome === 'approved'`. Implement the default.

### Testing approach
No client test framework — verification is reasoning + manual smoke on dev:
1. Open a merit action, click **Approved** → ribbon advances to **Complete**
   (re-render already happens: the handler calls `renderProcessingMode`). Repeat
   for Partial / Failed.
2. Open a travel action, click **Obvious** (then Neutral / Subtle) → ribbon
   **Complete**.
3. A project action with a terminal `pool_status` but no confirmed outcome stays
   at **Valid** until the Outcome is typed + Confirmed (no regression).
Plus `node --check`. Do NOT mandate Playwright.

## Dev Agent Record

### Files to change
- `public/js/admin/downtime-views.js` — `_deriveActionRibbonState` (~:8446): add
  the `merit_outcome` and discretion-`pool_status` complete branches.

### Files changed
- `public/js/admin/downtime-views.js` — `_deriveActionRibbonState` (:8446): added
  two complete branches (`merit_outcome` set → complete; `pool_status` ∈
  obvious/neutral/subtle → complete) after the existing `outcome_confirmed` check.
  +4 lines (2 logic + 2 comment).

### Completion notes
- Implemented exactly as specified — additive, single function, no handler/schema/
  CSS changes. Default scope kept (any of Approved/Partial/Failed completes the
  ribbon).
- Regression-safe by construction: `outcome_confirmed` is still checked first;
  the merit branch only fires when `merit_outcome` is set (only the merit outcome
  buttons set it); the discretion branch only fires for obvious/neutral/subtle
  (travel-only `pool_status` values). Project/full-merit reviews carry none of
  these, so their behaviour is unchanged.
- `node --check` clean; `git diff --stat` = +4 in downtime-views.js only.
- **Pending QA / smoke on dev (cannot run locally):** merit action → Complete
  after Approved (and Partial/Failed); travel action → Complete after a discretion
  button; project action still needs typed+Confirmed outcome.

### Change Log

| Date | Description |
|------|-------------|
| 2026-06-17 | Implemented: ribbon completes on merit_outcome / travel discretion. +4 lines in _deriveActionRibbonState. Status → review. |
