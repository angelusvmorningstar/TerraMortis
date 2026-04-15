# Story DT-Fix-17: Committed Chip Amber + ST Attribution on Status Changes

## Status: ready-for-dev

## Story

**As an** ST processing downtime actions,
**I want** the "Committed" status to display in amber, show my name when I commit or resolve an action, and have merit automatic actions show only relevant status buttons,
**so that** committed actions are visually distinct, I can see who actioned each entry, and the merit panel isn't cluttered with buttons that don't apply.

## Background

Three related gaps in the status display system:

**Bug 1 — "Committed" colour is wrong**

`committed` currently renders in grey (`rgba(100,100,100,.25)` / `var(--txt2)`) in the queue row badge, in the `[COMMITTED]` inline label inside the Dice Pool Modifiers panel, and in the active state of the status button. Amber (`var(--gold2)`) is the correct colour for "pool confirmed but not yet terminal" — it matches the amber used for Second Opinion and other in-progress indicators.

Three CSS locations need updating (dark theme), plus one light-theme override:
- `.proc-row-status.committed` (queue row badge) — line 4441 dark, line 5753 light
- `.proc-val-status button.active.committed` (status button) — line 4674
- `.proc-pool-committed-badge` (inline `[Committed]` panel label) — line 5463

**Bug 2 — No ST attribution for Committed / Resolved**

The `validated` status already stores and displays the ST's name (`pool_validated_by`). The same pattern is not applied to `committed` or `resolved`, so there is no record of which ST locked the pool or marked the outcome.

Note: there is no `approved` pool_status in this system. The merit "Approved" button (line 5315) uses `pool_status: 'resolved'`. Attribution for merit approvals is therefore covered by `pool_resolved_by`.

- `pool_committed_by` should be stored and shown alongside `committed` queue row badges
- `pool_resolved_by` should be stored and shown alongside `resolved` queue row badges (projects, sorcery, and merit "Approved" outcomes all set `pool_status: 'resolved'`)

**Bug 3 — Merit AUTOMATIC actions show "Committed" button unnecessarily**

In `_renderMeritRightPanel` (line 5165), the status button section at lines 5312-5321 is rendered unconditionally for all merit actions. When the action mode is `auto` (i.e., `isAuto === true`, line 5189), the panel already shows "No roll required — effect applies automatically" but still renders the full button set including `Committed`. AUTOMATIC mode has no dice pool to commit.

The current button set for all merit actions (line 5315):
```js
const meritBtns = [['pending', 'Pending'], ['committed', 'Committed'], ['resolved', 'Approved'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']];
```

When `isAuto` is true, `committed` should be omitted.

---

## Acceptance Criteria

1. `.proc-row-status.committed` renders amber: `background: rgba(180,140,60,0.18); color: var(--gold2);`
2. `.proc-val-status button.active.committed` renders amber: `border-color: var(--gold2); color: var(--gold2); background: rgba(180,140,60,0.15);`
3. `.proc-pool-committed-badge` text colour changed from `var(--story-compl)` to `var(--gold2)`.
4. Light-theme override for `.proc-row-status.committed` updated to amber equivalents.
5. When the ST clicks `Committed`, `pool_committed_by` is stored alongside `pool_status: 'committed'`.
6. When the ST clicks `Resolved` (or the merit "Approved" button, which also sets `resolved`), `pool_resolved_by` is stored alongside `pool_status: 'resolved'`.
7. In the queue row, when status is `committed`, the ST's name appears before the status badge.
8. In the queue row, when status is `resolved`, the ST's name appears before the status badge.
9. Attribution applies to all action types (feeding, project, merit, sorcery, st\_created).
10. Merit AUTOMATIC action panels (`isAuto === true`) show status buttons `[Pending, Resolved/Approved, No Roll Needed, Skip]` — no `Committed` button.
11. Merit roll-based action panels (`isAuto === false`) are unaffected (keep `Committed` in their button row).

---

## Tasks / Subtasks

- [ ] Task 1: Fix committed colour in `admin-layout.css`
  - [ ] 1.1: Line 4441 — `.proc-row-status.committed` dark theme → amber
  - [ ] 1.2: Line 4674 — `.proc-val-status button.active.committed` → gold2 border + text + amber-tint background
  - [ ] 1.3: Line 5464 — `.proc-pool-committed-badge` → change `color: var(--story-compl)` to `color: var(--gold2)`
  - [ ] 1.4: Line 5753 — `.proc-row-status.committed` light-theme override → amber equivalents

- [ ] Task 2: Store ST attribution in status button handler (`downtime-views.js`)
  - [ ] 2.1: Lines 3490-3494 — extend the existing `statusPatch` attribution block to cover `committed` and `resolved` in addition to `validated`

- [ ] Task 3: Display attribution in queue row (`downtime-views.js`)
  - [ ] 3.1: Line 3252 — replace `_validatorName` single-status check with a multi-status `_attributedName` check covering `validated`, `committed`, and `resolved`
  - [ ] 3.2: Line 3254 — update the span render to use `_attributedName`

- [ ] Task 4: Remove `Committed` button from merit AUTOMATIC panels (`downtime-views.js`)
  - [ ] 4.1: Line 5315 — split `meritBtns` into two sets based on `isAuto` (already in scope at line 5189)
  - [ ] 4.2: When `isAuto` is true, use button set without `committed`
  - [ ] 4.3: When `isAuto` is false, keep existing set unchanged

---

## Dev Notes

### Key files

All changes split across two files:
- `public/css/admin-layout.css` — CSS-only colour changes (4 rules)
- `public/js/admin/downtime-views.js` — JS changes (handler + queue row renderer + merit button set)

### Architecture note: no `approved` pool_status

There is no `approved` value in `POOL_STATUS_LABELS` (lines 257-266) or `DONE_STATUSES` (line 269). The merit "Approved" button is `['resolved', 'Approved']` — it sets `pool_status: 'resolved'` with the label "Approved". Do not add a new `approved` pool_status. Attribution for all merit approval outcomes is handled by `pool_resolved_by`.

### CSS — exact changes

**`public/css/admin-layout.css` line 4441 (dark theme queue badge):**
```css
/* BEFORE: */
.proc-row-status.committed   { background: rgba(100,100,100,.25); color: var(--txt2); }

/* AFTER: */
.proc-row-status.committed   { background: rgba(180,140,60,0.18); color: var(--gold2); }
```

**`public/css/admin-layout.css` line 4674 (active status button):**
```css
/* BEFORE: */
.proc-val-status button.active.committed   { border-color: var(--story-compl); color: var(--story-compl); background: var(--story-compl-a15); }

/* AFTER: */
.proc-val-status button.active.committed   { border-color: var(--gold2); color: var(--gold2); background: rgba(180,140,60,0.15); }
```

**`public/css/admin-layout.css` lines 5463-5471 (committed badge — change `color` only, leave all other properties):**
```css
/* BEFORE: */
.proc-pool-committed-badge {
  color: var(--story-compl);
  font-size: 10px;
  ...
}

/* AFTER: change only the color line */
  color: var(--gold2);
```

**`public/css/admin-layout.css` line 5753 (light-theme override):**
```css
/* BEFORE: */
html:not([data-theme="dark"]) .proc-row-status.committed { background: rgba(100,100,100,.15); color: var(--label-secondary); }

/* AFTER: */
html:not([data-theme="dark"]) .proc-row-status.committed { background: rgba(180,140,60,0.12); color: var(--gold2); }
```

### JS — status button handler patch

**`public/js/admin/downtime-views.js` lines 3490-3494** — current code:
```js
const statusPatch = { pool_status: status };
if (status === 'validated') {
  const user = getUser();
  statusPatch.pool_validated_by = user?.global_name || user?.username || 'ST';
}
await saveEntryReview(entry, statusPatch);
```

Replace with:
```js
const statusPatch = { pool_status: status };
if (['validated', 'committed', 'resolved'].includes(status)) {
  const user = getUser();
  const stName = user?.global_name || user?.username || 'ST';
  if (status === 'validated')  statusPatch.pool_validated_by  = stName;
  if (status === 'committed')  statusPatch.pool_committed_by  = stName;
  if (status === 'resolved')   statusPatch.pool_resolved_by   = stName;
}
await saveEntryReview(entry, statusPatch);
```

### JS — queue row attribution

**`public/js/admin/downtime-views.js` line 3252** — current code:
```js
const _validatorName = (status === 'validated' && review?.pool_validated_by) ? review.pool_validated_by : '';
h += `<span class="proc-row-status-cell">`;
if (_validatorName) h += `<span class="proc-row-validator">${esc(_validatorName)}</span>`;
h += `<span class="proc-row-status ${status}">${POOL_STATUS_LABELS[status] || status}</span>`;
```

Replace with:
```js
const _attributedName =
  (status === 'validated' && review?.pool_validated_by) ? review.pool_validated_by :
  (status === 'committed' && review?.pool_committed_by) ? review.pool_committed_by :
  (status === 'resolved'  && review?.pool_resolved_by)  ? review.pool_resolved_by  : '';
h += `<span class="proc-row-status-cell">`;
if (_attributedName) h += `<span class="proc-row-validator">${esc(_attributedName)}</span>`;
h += `<span class="proc-row-status ${status}">${POOL_STATUS_LABELS[status] || status}</span>`;
```

### JS — merit AUTOMATIC button set

**`public/js/admin/downtime-views.js` lines 5312-5321** — the status section in `_renderMeritRightPanel`.

The variable `isAuto` is defined at line 5189:
```js
const isAuto = mode === 'auto';
```
where `mode` comes from `matrixRow?.mode || 'instant'` at line 5176.

Current line 5315 (single unconditional button set for all merit actions):
```js
const meritBtns = [['pending', 'Pending'], ['committed', 'Committed'], ['resolved', 'Approved'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']];
```

Replace with:
```js
const meritBtns = isAuto
  ? [['pending', 'Pending'], ['resolved', 'Approved'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']]
  : [['pending', 'Pending'], ['committed', 'Committed'], ['resolved', 'Approved'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']];
```

Note: the label `'Approved'` on `['resolved', 'Approved']` is intentional and correct — it sets `pool_status: 'resolved'` while displaying "Approved" to the ST. Do not change this.

### No schema change needed

`additionalProperties: true` on all review shapes. `saveEntryReview` spread-patches freely. `pool_committed_by` and `pool_resolved_by` will persist without schema changes.

### No test framework

Manual verification:
- Open DT processing panel. Find a merit with AUTOMATIC mode (e.g., Allies ambience_increase). Confirm no "Committed" button in status row.
- Find a merit with roll-based mode. Confirm "Committed" still present.
- Click "Committed" on a project action. Verify ST name appears in queue row badge area. Reload page — confirm persists.
- Click "Resolved" (or merit "Approved"). Verify ST name appears in queue row. Reload — confirm persists.
- Confirm amber colour on `[Committed]` badge in Dice Pool Modifiers panel header.
- Confirm amber colour on queue row status chip when status is `committed`.
- Confirm amber colour on the active "Committed" status button.

---

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/css/admin-layout.css`
- `public/js/admin/downtime-views.js`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (SM) + Angelus |
| 2026-04-15 | 1.1 | Added approved attribution + merit AUTOMATIC button set correction | Bob (SM) + Angelus |
| 2026-04-15 | 1.2 | Closed all gaps: exact line numbers, confirmed no `approved` pool_status, confirmed `isAuto` variable, added light-theme override | CS workflow |
