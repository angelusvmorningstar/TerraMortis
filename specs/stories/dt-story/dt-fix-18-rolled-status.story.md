# Story DT-Fix-18: Rolled Intermediate Status After Dice Roll

## Status: complete

## Story

**As an** ST processing downtime actions,
**I want** the status to automatically advance to "Rolled" when I roll dice for an action,
**so that** I can distinguish at a glance between actions where the pool is set but dice haven't been rolled yet, versus actions where dice have been rolled and I'm deciding the outcome.

## Background

The current status flow is: Pending → Committed → (manual) Resolved / No Effect / Skip.

After clicking Roll/Re-roll, the roll result displays and the status stays `committed`. There is no way to see from the queue whether an action has had dice rolled or just has its pool confirmed. During a busy processing session with multiple STs, this forces extra clicks to inspect each action.

A `rolled` status sits between `committed` and the terminal statuses. It is set **automatically** when a roll result is saved (Roll/Re-roll button clicked), eliminating manual work.

`rolled` is NOT a terminal status — it does not appear in `DONE_STATUSES`. The ST still manually advances to Resolved, No Effect, or another terminal status after interpreting the result.

---

## Acceptance Criteria

1. `POOL_STATUS_LABELS` includes `rolled: 'Rolled'`.
2. The status button row includes a `Rolled` button between `Committed` and `Resolved` for all action types.
3. `rolled` is **not** in `DONE_STATUSES`.
4. When the Roll/Re-roll button is clicked and a roll result is saved, `pool_status` is automatically set to `'rolled'` — provided the current status is `pending` or `committed` (do not downgrade from a terminal status or from `rolled` itself if re-rolling).
5. `.proc-row-status.rolled` is visually distinct from `committed` — use a slightly more saturated amber.
6. `.proc-val-status button.active.rolled` uses the amber scheme matching committed (gold2 family).
7. The `Rolled` button is present in feeding, project, merit, sorcery, and st\_created action panels.

---

## Tasks / Subtasks

- [x] Task 1: Add `rolled` to labels and NOT to done statuses (`downtime-views.js`)
  - [x] 1.1: Add `rolled: 'Rolled'` to `POOL_STATUS_LABELS` (line ~257)
  - [x] 1.2: Confirm `rolled` is absent from `DONE_STATUSES` (line ~269) — do not add it

- [x] Task 2: Add `Rolled` button to all status button call sites
  - [x] 2.1: Find all `_renderValStatusButtons(...)` calls that include `['committed', 'Committed']` and insert `['rolled', 'Rolled']` after `committed` and before `resolved` in the array

- [x] Task 3: Auto-advance status on roll
  - [x] 3.1: In the `.proc-proj-roll-btn` handler (line ~3905), after `await saveEntryReview(entry, { roll: result })`, check current status:
    ```js
    const currentStatus = review?.pool_status || 'pending';
    if (currentStatus === 'pending' || currentStatus === 'committed') {
      await saveEntryReview(entry, { pool_status: 'rolled' });
    }
    ```
  - [x] 3.2: If a separate feeding roll button exists, apply the same auto-advance logic there

- [x] Task 4: Add CSS for `rolled` state (`admin-layout.css`)
  - [x] 4.1: `.proc-row-status.rolled` — amber, slightly more saturated than committed:
    ```css
    .proc-row-status.rolled { background: rgba(180,140,60,0.28); color: var(--gold2); }
    ```
  - [x] 4.2: `.proc-val-status button.active.rolled` — amber scheme:
    ```css
    .proc-val-status button.active.rolled { border-color: var(--gold2); color: var(--gold2); background: rgba(180,140,60,0.2); }
    ```

---

## Dev Notes

### Key file

- `public/js/admin/downtime-views.js` — labels, button arrays, roll handler
- `public/css/admin-layout.css` — two new CSS rules

### POOL_STATUS_LABELS patch (line ~257)

```js
// BEFORE:
const POOL_STATUS_LABELS = {
  pending:     'Pending',
  committed:   'Committed',
  validated:   'Validated',
  ...
  resolved:    'Resolved',
  ...
};

// AFTER — add rolled between committed and validated:
const POOL_STATUS_LABELS = {
  pending:     'Pending',
  committed:   'Committed',
  rolled:      'Rolled',
  validated:   'Validated',
  ...
  resolved:    'Resolved',
  ...
};
```

### Status button arrays — where to find them

Search for `_renderValStatusButtons` calls across `renderActionPanel`. The buttons array argument always lists status/label pairs. Find every call that has `['committed', 'Committed']` and insert `['rolled', 'Rolled']` immediately after it. There will be multiple call sites (one per action type).

Example pattern:
```js
// BEFORE:
_renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['committed', 'Committed'], ['resolved', 'Resolved'], ['no_effect', 'No Effect'], ['skipped', 'Skip']])

// AFTER:
_renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['committed', 'Committed'], ['rolled', 'Rolled'], ['resolved', 'Resolved'], ['no_effect', 'No Effect'], ['skipped', 'Skip']])
```

### Roll handler auto-advance (line ~3905)

Current handler saves roll result then re-renders:
```js
showRollModal({ ... }, async result => {
  await saveEntryReview(entry, { roll: result });
  renderProcessingMode(container);
});
```

Add the status advance before the re-render:
```js
showRollModal({ ... }, async result => {
  await saveEntryReview(entry, { roll: result });
  const freshReview = getEntryReview(entry);
  const cur = freshReview?.pool_status || 'pending';
  if (cur === 'pending' || cur === 'committed') {
    await saveEntryReview(entry, { pool_status: 'rolled' });
  }
  renderProcessingMode(container);
});
```

### CSS placement

Add `.proc-row-status.rolled` immediately after `.proc-row-status.committed` in the status badge block (line ~4443).

Add `.proc-val-status button.active.rolled` immediately after `.proc-val-status button.active.committed` (line ~4674).

### No test framework

Manual verification: commit an action, roll dice — confirm status badge jumps to "Rolled" (amber). Manually click "Resolved" from Rolled — confirm it works. Re-roll from Rolled state — confirm status stays Rolled (not downgraded).

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- `POOL_STATUS_LABELS`: added `rolled: 'Rolled'` between `committed` and `validated`
- `DONE_STATUSES`: confirmed `rolled` absent (not added)
- `_renderValStatusButtons` — 4 call sites updated: merit (non-auto branch), sorcery, project, feeding — `['rolled', 'Rolled']` inserted after `['committed', 'Committed']` in each
- Roll handler auto-advance added to `proc-proj-roll-btn`, `proc-merit-roll-btn`, `proc-feed-roll-btn` — checks `pending | committed` before setting `pool_status: 'rolled'`; ritual roll skipped (auto-resolves to `resolved`/`no_effect`)
- CSS: `.proc-row-status.rolled` (darker amber 0.28 vs committed 0.18) and `.proc-val-status button.active.rolled` (gold2 scheme) added after committed rules in both dark and parchment theme blocks

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (SM) + Angelus |
