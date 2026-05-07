# Story issue-101: DT form — explicit Add/Remove row buttons for in-slot XP Spend grid

Status: review

issue: 101
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/101
branch: morningstar-issue-101-dt-xp-add-remove

---

## Story

As a player using the XP Spend action in the downtime form,
I want an explicit Add button and per-row Remove button on the XP grid,
so that I can manage my purchase rows without relying on implicit dropdown interactions.

---

## Background

Surfaced as a non-blocking UX concern in PR #100 review (dt-form.26, closes #82).

`_renderProjectXpRows` (line 3961) appends a trailing empty row as the implicit "add" affordance. Players must pick a category in that trailing row, then wait ~2s for the save debounce to fire and renderForm to re-run before the next trailing row appears. Perceived: "I picked a thing and nothing happened."

Remove is worse: clearing the category dropdown is the only removal path. Nothing tells the player this works.

The sorcery target row add/remove at lines 2724–2742 is the established pattern: click handler calls `collectResponses()`, mutates the array, sets `responseDoc.responses`, then calls `renderForm(container)` immediately (no debounce). Same pattern applies here.

---

## Acceptance Criteria

- [ ] Clicking an explicit "Add row" button at the bottom of the XP grid immediately inserts a new empty row (no 2s debounce wait)
- [ ] Each non-empty row has a "×" Remove button; clicking it removes the row from the DOM immediately and triggers a save
- [ ] The trailing-empty-row implicit add pathway may remain (implementer's call — keeping it is fine)
- [ ] `collectResponses` logic (`project_N_xp_rows` JSON shape) is unchanged
- [ ] Tab order and keyboard navigation remain functional

---

## Tasks / Subtasks

- [x] Task 1: Add slot param to `renderXpRow` and emit remove button
  - [x] 1a: Add `slotN` as a 5th parameter to `renderXpRow(idx, row, xpActions, dotsRemaining, slotN)`
  - [x] 1b: Inside `renderXpRow`, after the cost display, if `row.category` is non-empty emit: `<button type="button" class="dt-xp-row-remove" data-xp-remove-slot="${slotN}" data-xp-remove-idx="${idx}" title="Remove this row">×</button>`
  - [x] 1c: Update both call sites in `_renderProjectXpRows` (line 4025) and the admin xp grid (line 6409) to pass the slot number

- [x] Task 2: Add "Add row" button at the bottom of the XP grid in `_renderProjectXpRows`
  - [x] 2a: After the `for` loop that renders rows (after line 4026), before `h += '</div>'; // dt-xp-grid`, emit: `<button type="button" class="dt-xp-row-add" data-xp-add-slot="${n}">+ Add row</button>`

- [x] Task 3: Wire click handlers in the existing `container.addEventListener('click', ...)` block (around line 2683)
  - [x] 3a: Add handler for `dt-xp-row-add`: collect responses, parse `project_${slot}_xp_rows`, push `{ category: '', item: '', dotsBuying: 0 }`, assign back, `renderForm(container)`
  - [x] 3b: Add handler for `dt-xp-row-remove`: collect responses, parse `project_${slot}_xp_rows`, splice out `idx`, assign back, `renderForm(container)`. Trigger `scheduleSave()` after renderForm.

- [x] Task 4: CSS — minimal styling for the two new buttons

---

## Dev Notes

### Architecture — follow the sorcery target pattern exactly

The sorcery target add/remove (lines 2724–2742) is the canonical pattern in this file:

```js
// ADD (lines 2724–2735)
const addTargetBtn = e.target.closest('.dt-sorcery-target-add-btn');
if (addTargetBtn) {
  const responses = collectResponses();
  const slot = addTargetBtn.dataset.sorcerySlot;
  const key = `sorcery_${slot}_targets`;
  const arr = Array.isArray(responses[key]) ? responses[key] : [];
  arr.push({ type: '', value: '' });
  responses[key] = arr;
  if (responseDoc) responseDoc.responses = responses;
  else responseDoc = { responses };
  renderForm(container);
  return;
}
```

Mirror this for `dt-xp-row-add`. Key difference: the XP rows are JSON-stringified, so:
```js
const addXpRowBtn = e.target.closest('[data-xp-add-slot]');
if (addXpRowBtn) {
  const responses = collectResponses();
  const slot = addXpRowBtn.dataset.xpAddSlot;
  const key = `project_${slot}_xp_rows`;
  let rows = [];
  try { rows = JSON.parse(responses[key] || '[]'); } catch { rows = []; }
  rows.push({ category: '', item: '', dotsBuying: 0 });
  responses[key] = JSON.stringify(rows);
  if (responseDoc) responseDoc.responses = responses;
  else responseDoc = { responses };
  renderForm(container);
  return;
}
```

For remove:
```js
const removeXpRowBtn = e.target.closest('[data-xp-remove-slot]');
if (removeXpRowBtn) {
  const responses = collectResponses();
  const slot = removeXpRowBtn.dataset.xpRemoveSlot;
  const idx = Number(removeXpRowBtn.dataset.xpRemoveIdx);
  const key = `project_${slot}_xp_rows`;
  let rows = [];
  try { rows = JSON.parse(responses[key] || '[]'); } catch { rows = []; }
  rows.splice(idx, 1);
  responses[key] = JSON.stringify(rows);
  if (responseDoc) responseDoc.responses = responses;
  else responseDoc = { responses };
  renderForm(container);
  scheduleSave();
  return;
}
```

### `renderXpRow` signature change

Current: `renderXpRow(idx, row, xpActions, dotsRemaining)`
After:   `renderXpRow(idx, row, xpActions, dotsRemaining, slotN)`

The 5th param `slotN` is only needed to emit the remove button's `data-xp-remove-slot` attribute. If `slotN` is undefined (e.g. the admin non-slot grid at line 6409), no remove button is emitted — use `if (slotN != null && row.category) { h += removeBtn; }`.

### Call sites to update

| Line | Current | After |
|------|---------|-------|
| `_renderProjectXpRows` line 4025 | `renderXpRow(i, xpRows[i], xpActions, dotsRemaining)` | `renderXpRow(i, xpRows[i], xpActions, dotsRemaining, n)` |
| Admin xp grid line 6409 | `renderXpRow(i, xpRows[i], xpActions, dotsRemaining)` | leave as-is (no slot — remove button suppressed by `slotN == null`) |

### Remove button: only on non-empty rows

```js
if (slotN != null && row.category) {
  h += `<button type="button" class="dt-xp-row-remove" data-xp-remove-slot="${slotN}" data-xp-remove-idx="${idx}" title="Remove this row">×</button>`;
}
```

`row.category` is `''` on the trailing empty row, so it gets no remove button. Correct — you can't remove the placeholder.

### CSS — keep it minimal

The remove button is inline in the row div. A tight `×` button: small, red-tinted on hover, aligned right within the row flex.
The add button sits below the grid. A muted "+ Add row" link-style button.

Look at the existing `.dt-sorcery-remove` rule for the established removal button style — reuse or mirror it for `.dt-xp-row-remove`.

### What must not break

- `collectResponses()` at line 594–607: reads `[data-xp-row]` elements and their `[data-xp-cat]`, `[data-xp-item]`, `[data-xp-dots]` children — untouched
- `project_N_xp_rows` JSON shape: `{ category, item, dotsBuying }` objects — unchanged
- Top-level `responses.xp_spend` mirror (line 949–974) — unchanged
- Admin xp grid at line 6378+ (uses `dt-xp-grid` without `data-proj-xp-grid`) — remove button is suppressed by `slotN == null`
- Trailing empty row implicit-add path — can be kept; it's harmless alongside the explicit button

---

## Dev Agent Record

### File List

- `public/js/tabs/downtime-form.js`
- `public/css/components.css` (minimal CSS for new buttons)

### Completion Notes

`renderXpRow` signature extended to 5 params (`slotN`); remove button emitted when `slotN != null && row.category` — trailing empty row gets no button. "Add row" button appended after the row loop in `_renderProjectXpRows`. Two click handlers added in the existing `container.addEventListener('click', ...)` block following the sorcery target pattern: add handler calls `renderForm` immediately (no debounce); remove handler calls `renderForm` then `scheduleSave`. XP rows are JSON-stringified so handlers use `JSON.parse/stringify`. Admin xp grid call site left without `slotN` — remove button suppressed automatically. CSS mirrors `.dt-sorcery-remove` for the remove button; add button is underline link-style. Parse-check clean (exit 0).

### Change Log

- 2026-05-07: Add explicit Add/Remove row buttons for in-slot XP Spend grid; remove button on non-empty rows, add button below grid, immediate renderForm on both (downtime-form.js, components.css)
