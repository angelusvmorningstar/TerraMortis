---
issue: 708
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/708
branch: ms/issue-708-cycle-tab-game-phase
epic: CYCLE — Game Cycle Management Tab
story: 4 of 6
status: review
---

# Epic CYCLE — Story 4: DT Prep Access Controls

## Story

**As an** ST,
**I want** to grant individual characters out-of-window downtime access from the Cycle tab,
**so that** all cycle-level controls live in one place rather than being split across Cycle and DT Prep tabs.

---

## Epic Context

Story 4 of 6 in the CYCLE epic (#708). Stories 1–3 (schema/API, tab shell, phase controls) are complete and on `main`.

This story moves the "Out-of-Window Access" character checkbox list from the DT Prep tab (`renderPrepPanel` in `downtime-views.js`) into the Cycle tab (`cycle-views.js`). The server endpoint, server-side gate, and all client-side access gates are **unchanged**.

Stories 5–6 will add the publish pipeline and attendance/XP absorption.

---

## Acceptance Criteria

- [x] AC-1: Each cycle row in the Game Cycles panel has a "Prep Access" toggle button. Clicking it expands an inline detail section below that row showing a checkbox list of all non-retired characters.
- [x] AC-2: Characters already in `out_of_window_player_ids` for that cycle are pre-checked. Characters not in the list are unchecked.
- [x] AC-3: Toggling a checkbox calls `PUT /api/downtime_cycles/:id` with the updated `out_of_window_player_ids` array and updates the in-memory cycle object without re-rendering the panel.
- [x] AC-4: The "Out-of-Window Access" section (the `<div class="dt-prep-early">` block and its checkbox event handler) is removed from `renderPrepPanel` in `downtime-views.js`. The rest of the DT Prep panel is unchanged.
- [x] AC-5: All existing server-side and client-side access gates are preserved with no changes: `requireOpenCycle` middleware in `downtime.js`, `_hasWindowAccess` in `downtime-form.js`, `hasWindowAccess` in `downtime-tab.js`.
- [x] AC-6: Contract tests pass (≥8 assertions in `server/tests/epic.708.4-dt-prep-access-controls.test.js`).

---

## Dev Notes

### Files to change

**Modified:**
- `public/js/admin/cycle-views.js` — add `buildAccessSection(cy, charList)` helper; add Prep Access toggle to each cycle row; update `buildCyclesPanel()` signature to accept `charList`; update call in `initCycleView`
- `public/js/admin/downtime-views.js` — remove the `dt-prep-early` block and its `.dt-early-toggle` event handler from `renderPrepPanel`

**New:**
- `server/tests/epic.708.4-dt-prep-access-controls.test.js` — static-grep contract tests

### cycle-views.js — API import

`apiPut` is already imported. No import changes needed.

### cycle-views.js — charList through to buildCyclesPanel

`initCycleView(charList)` already receives `charList`. Pass it through to `buildCyclesPanel`:

```js
el.appendChild(buildCyclesPanel(cycles, chapters, charList));
```

Update `buildCyclesPanel` signature:
```js
function buildCyclesPanel(cycles, chapters, charList = []) {
```

The active (non-retired) list is derived inside `buildAccessSection`:
```js
const activeChars = charList.filter(c => !c.retired)
  .sort((a, b) => sortName(c) vs sortName(c) — see below);
```

For sort, use `(a.moniker || a.name || '')` vs `(b.moniker || b.name || '')` — same pattern used throughout the admin.

### cycle-views.js — buildAccessSection

Add as a module-level function alongside `buildPhaseCell`:

```js
function buildAccessSection(cy, charList) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:8px 0 4px;max-height:220px;overflow-y:auto';

  const activeChars = charList
    .filter(c => !c.retired)
    .sort((a, b) => (a.moniker || a.name || '').localeCompare(b.moniker || b.name || ''));

  if (!activeChars.length) {
    wrap.textContent = 'No active characters.';
    wrap.style.color = 'var(--txt2)';
    return wrap;
  }

  const oowIds = new Set((cy.out_of_window_player_ids || []).map(String));

  activeChars.forEach(c => {
    const id = String(c._id);
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;font-size:13px';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = oowIds.has(id);

    const span = document.createElement('span');
    span.textContent = c.moniker || c.name || c._id;

    label.appendChild(cb);
    label.appendChild(span);
    wrap.appendChild(label);

    cb.addEventListener('change', async () => {
      const current = new Set((cy.out_of_window_player_ids || []).map(String));
      if (cb.checked) current.add(id); else current.delete(id);
      const updated = [...current];
      try {
        await apiPut('/api/downtime_cycles/' + cy._id, { out_of_window_player_ids: updated });
        cy.out_of_window_player_ids = updated;
      } catch (err) {
        cb.checked = !cb.checked; // revert on failure
      }
    });
  });

  return wrap;
}
```

### cycle-views.js — Prep Access toggle in buildCyclesPanel

Each cycle row in the table gets a 4th column with a small toggle button. Clicking it shows/hides a detail `<tr>` spanning all columns.

Update the `<thead>` to add a 4th column:
```html
<thead><tr>
  <th>Label</th>
  <th style="width:270px">Phase</th>
  <th style="width:200px">Chapter</th>
  <th style="width:110px">Prep Access</th>
</tr></thead>
```

In the `sorted.forEach` loop, after appending `tdChapter`, add:

```js
// Prep Access toggle button
const tdAccess = document.createElement('td');
const accessBtn = document.createElement('button');
accessBtn.className = 'btn-sm';
accessBtn.textContent = 'Prep Access';
tdAccess.appendChild(accessBtn);
tr.appendChild(tdAccess);

// Detail row (hidden by default)
const detailTr = document.createElement('tr');
detailTr.style.display = 'none';
const detailTd = document.createElement('td');
detailTd.colSpan = 4;
detailTd.style.cssText = 'padding:4px 12px 12px;background:var(--surf2)';

const accessSection = buildAccessSection(cy, charList);
detailTd.appendChild(accessSection);
detailTr.appendChild(detailTd);

accessBtn.addEventListener('click', () => {
  const open = detailTr.style.display !== 'none';
  detailTr.style.display = open ? 'none' : '';
  accessBtn.style.borderColor = open ? '' : 'var(--gold2)';
  accessBtn.style.color = open ? '' : 'var(--gold2)';
});

tbody.appendChild(tr);
tbody.appendChild(detailTr);
```

Note: the existing `tbody.appendChild(tr)` at the bottom of the forEach is **replaced** by the block above (which appends both `tr` and `detailTr`).

### downtime-views.js — removal from renderPrepPanel

Remove lines 2630–2633 (the `dt-prep-early` div):
```js
// REMOVE THIS BLOCK:
`<div class="dt-prep-early">` +
`<div class="dt-prep-early-title">Out-of-Window Access</div>` +
`<div class="dt-early-list">${earlyContent}</div>` +
`</div>` +
```

Also remove the `oowIds`, `activeChars`, `toggleHtml`, `earlyContent` variable declarations (lines 2600–2618) and the `.dt-early-toggle` event handler block (lines 2681–2694). Leave all other `renderPrepPanel` content intact.

### No server changes

The `PUT /api/downtime_cycles/:id` endpoint already accepts `out_of_window_player_ids`. No server-side changes required. Verify by grepping `downtime.js` — the PUT handler uses `$set: updates` and imposes no field-level restrictions.

### Character naming

Use `c.moniker || c.name || c._id` for display. This is consistent with the rest of the admin app's character name rendering in non-ST-identity contexts.

### Test file

Same static-grep pattern as stories 1–3.

```js
import fs from 'fs';
const CYCLE_VIEWS = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');
const DT_VIEWS    = fs.readFileSync('../public/js/admin/downtime-views.js', 'utf8');
```

Required assertions (≥8):
- `CYCLE_VIEWS` contains `buildAccessSection`
- `CYCLE_VIEWS` contains `out_of_window_player_ids`
- `CYCLE_VIEWS` contains `apiPut` (already present from Story 3)
- `CYCLE_VIEWS` contains `Prep Access`
- `CYCLE_VIEWS` contains `charList`
- `CYCLE_VIEWS` contains `detailTr`
- `DT_VIEWS` does NOT contain `dt-prep-early` (removed)
- `DT_VIEWS` does NOT contain `dt-early-toggle` (removed)

---

## Tasks

- [x] **Task 1** — Add `buildAccessSection(cy, charList)` to `cycle-views.js`; thread `charList` through `buildCyclesPanel`; add Prep Access toggle + detail row to each cycle row
- [x] **Task 2** — Remove `dt-prep-early` block, variable declarations, and `.dt-early-toggle` handler from `renderPrepPanel` in `downtime-views.js`
- [x] **Task 3** — Create `server/tests/epic.708.4-dt-prep-access-controls.test.js` with ≥8 static-grep assertions; run and confirm all pass

---

## File List

**New:**
- `server/tests/epic.708.4-dt-prep-access-controls.test.js`

**Modified:**
- `public/js/admin/cycle-views.js`
- `public/js/admin/downtime-views.js`

---

## Dev Agent Record

### Debug Log
_Empty_

### Completion Notes
- Added `buildAccessSection(cy, charList)` to `cycle-views.js`; renders sorted non-retired character checkboxes; pre-checks `out_of_window_player_ids`; toggles via `PUT /api/downtime_cycles/:id`; reverts checkbox on failure
- Threaded `charList` through `buildCyclesPanel(cycles, chapters, charList = [])`; added "Prep Access" toggle button + expandable `detailTr` per cycle row (gold highlight when open); `buildCyclesPanel` call in `initCycleView` updated to pass `charList`
- Removed `dt-prep-early` block, `oowIds`/`activeChars`/`toggleHtml`/`earlyContent` declarations, and `.dt-early-toggle` event handler from `renderPrepPanel` in `downtime-views.js`; remainder of DT Prep panel unchanged
- 10 static-grep contract tests pass; Stories 1–3 (49 tests) unaffected

### Change Log
- 2026-06-11: Story implemented — Prep Access controls moved from DT Prep tab into Cycle tab; 10 passing contract tests
