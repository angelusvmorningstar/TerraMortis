---
issue: 708
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/708
branch: ms/issue-708-cycle-tab-game-phase
epic: CYCLE — Game Cycle Management Tab
story: 6 of 6
status: review
---

# Epic CYCLE — Story 6: Attendance & XP Absorption

## Story

**As an** ST,
**I want** to link a game session to each cycle and view the attendance XP summary in the Cycle tab,
**so that** I can see who attended and how much XP they earned without switching to the Attendance tab.

---

## Epic Context

Story 6 of 6 — the final CYCLE epic story. Stories 1–5 are complete on `dev`.

This story adds an "Attendance" expandable section to each cycle row in the Cycle tab. The ST links a game session to the cycle via a dropdown, then sees a read-only XP summary table (Character | Attend | Costuming | DT | Extra | Total XP). Attendance editing stays in the Attendance tab — this is a focused view only.

---

## Background: Current Attendance System

- **`game_sessions`** collection — each document has an `attendance` array of per-character records with `attended`, `costuming`, `downtime`, `extra` booleans/number.
- **`downtime_cycles`** — entirely separate from `game_sessions`; no link between them currently.
- **`GET /api/game_sessions`** — returns all sessions including full attendance arrays; no auth required.
- **XP formula** (per character per session): `(attended?1:0) + (costuming?1:0) + (downtime?1:0) + (extra||0)`
- Editing attendance stays in `public/js/admin/attendance.js` (the Attendance tab). Story 6 is **read-only** in the Cycle tab.

---

## Acceptance Criteria

- [x] AC-1: Each cycle row in the Game Cycles panel has an "Attendance" toggle button. Clicking it expands an inline section below that row.
- [x] AC-2: The expanded section shows a session dropdown populated with all `game_sessions` (label: `Game N — Title` if `game_number` and title set; fallback to `session_date`). The dropdown pre-selects the session linked to the cycle (`cy.session_id`), or shows a blank placeholder if unlinked.
- [x] AC-3: Selecting a session from the dropdown calls `PUT /api/downtime_cycles/:id` with `{ session_id: <string> }` and updates `cy.session_id` in memory without re-rendering the panel. Selecting the blank option clears the link (`session_id: null`).
- [x] AC-4: When a session is linked, a read-only XP summary table is shown immediately below the dropdown. Columns: Character | Attend | Costuming | DT | Extra | XP. One row per entry in `session.attendance`, sorted by character name. XP total = `(attended?1:0) + (costuming?1:0) + (downtime?1:0) + (extra||0)`.
- [x] AC-5: The table shows a totals row (bold) at the bottom: sum of each column, and sum of XP.
- [x] AC-6: If the linked session has no attendance records, the section shows "No attendance recorded for this session."
- [x] AC-7: API errors on the PUT are caught and shown inline (same pattern as Prep Access).
- [x] AC-8: `session_id` field is added to the `downtimeCycleSchema` in `server/schemas/downtime_submission.schema.js`.
- [x] AC-9: The Story 4 Playwright test `cycle-prep-access.spec.js` is updated: the `nth(3)` locator for cyc-002's prep access detail row is changed to `nth(4)` (because Story 6 inserts one attendance detail row between the two main rows and their prep-access detail rows, shifting the index).
- [x] AC-10: Contract tests pass (≥8 assertions in `server/tests/epic.708.6-attendance-xp-absorption.test.js`).

---

## Dev Notes

### Files to change

**Modified:**
- `server/schemas/downtime_submission.schema.js` — add `session_id` to cycle schema
- `public/js/admin/cycle-views.js` — add `buildAttendanceSection`, update `initCycleView` + `buildCyclesPanel` signature, update `detailTd.colSpan` to 6, add Attendance column to thead
- `tests/cycle-prep-access.spec.js` — fix `nth(3)` → `nth(4)` in one test

**New:**
- `server/tests/epic.708.6-attendance-xp-absorption.test.js` — static-grep contract tests

### downtime_submission.schema.js — add session_id

In the `properties` block of `downtimeCycleSchema` (after `chapter_id`):

```js
session_id: { type: ['string', 'null'] },  // ref to game_sessions _id as string
```

### cycle-views.js — initCycleView

Add `game_sessions` to the parallel fetch:

```js
[chapters, cycles, sessions] = await Promise.all([
  apiGet('/api/chapters'),
  apiGet('/api/downtime_cycles'),
  apiGet('/api/game_sessions'),
]);
```

Update `buildCyclesPanel` call:

```js
el.appendChild(buildCyclesPanel(cycles, chapters, charList, sessions));
```

### cycle-views.js — buildCyclesPanel signature

```js
function buildCyclesPanel(cycles, chapters, charList = [], sessions = []) {
```

### cycle-views.js — thead (6th column)

```html
<thead><tr>
  <th>Label</th>
  <th style="width:270px">Phase</th>
  <th style="width:200px">Chapter</th>
  <th style="width:110px">Prep Access</th>
  <th style="width:130px">Publish</th>
  <th style="width:110px">Attendance</th>
</tr></thead>
```

### cycle-views.js — detailTd.colSpan

Update the existing Prep Access `detailTd.colSpan` from 5 to **6**.

### cycle-views.js — buildAttendanceSection(cy, sessions)

Add as a module-level function alongside `buildAccessSection` and `buildPhaseCell`:

```js
function buildAttendanceSection(cy, sessions) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:8px 0 4px';

  // Session dropdown
  const selectWrap = document.createElement('div');
  selectWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px';

  const label = document.createElement('label');
  label.style.cssText = 'font-size:13px;color:var(--txt2)';
  label.textContent = 'Linked Session:';

  const sel = document.createElement('select');
  sel.style.cssText = 'background:var(--surf);border:1px solid var(--bdr);color:var(--txt);border-radius:4px;padding:3px 6px;font-size:13px';

  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = '— not linked —';
  sel.appendChild(blank);

  const sorted = [...sessions].sort((a, b) => {
    const na = a.game_number ?? 999;
    const nb = b.game_number ?? 999;
    return na - nb;
  });

  sorted.forEach(s => {
    const opt = document.createElement('option');
    opt.value = String(s._id);
    let lbl = s.game_number ? 'Game ' + s.game_number : '';
    if (s.title) lbl += (lbl ? ' — ' : '') + s.title;
    if (!lbl) lbl = s.session_date || String(s._id);
    opt.textContent = lbl;
    sel.appendChild(opt);
  });

  sel.value = cy.session_id || '';

  const errEl = document.createElement('span');
  errEl.style.cssText = 'color:var(--crim);font-size:11px;display:none';

  selectWrap.appendChild(label);
  selectWrap.appendChild(sel);
  selectWrap.appendChild(errEl);
  wrap.appendChild(selectWrap);

  // XP table container
  const tableWrap = document.createElement('div');
  wrap.appendChild(tableWrap);

  function renderTable() {
    tableWrap.innerHTML = '';
    const session = sessions.find(s => String(s._id) === sel.value);
    if (!session) return;
    const att = session.attendance || [];
    if (!att.length) {
      const msg = document.createElement('p');
      msg.style.cssText = 'font-size:13px;color:var(--txt2);margin:4px 0';
      msg.textContent = 'No attendance recorded for this session.';
      tableWrap.appendChild(msg);
      return;
    }

    const rows = [...att].sort((a, b) => {
      const na = (a.character_display || a.character_name || '').toLowerCase();
      const nb = (b.character_display || b.character_name || '').toLowerCase();
      return na < nb ? -1 : na > nb ? 1 : 0;
    });

    const table = document.createElement('table');
    table.className = 'infl-table';
    table.style.cssText = 'width:100%;font-size:13px';
    table.innerHTML = `<thead><tr>
      <th>Character</th>
      <th style="width:70px;text-align:center">Attend</th>
      <th style="width:80px;text-align:center">Costuming</th>
      <th style="width:50px;text-align:center">DT</th>
      <th style="width:50px;text-align:center">Extra</th>
      <th style="width:60px;text-align:center">XP</th>
    </tr></thead>`;

    const tbody = document.createElement('tbody');
    let totAtt = 0, totCos = 0, totDT = 0, totExtra = 0, totXP = 0;

    rows.forEach(a => {
      const xp = (a.attended ? 1 : 0) + (a.costuming ? 1 : 0) + (a.downtime ? 1 : 0) + (a.extra || 0);
      totAtt   += a.attended  ? 1 : 0;
      totCos   += a.costuming ? 1 : 0;
      totDT    += a.downtime  ? 1 : 0;
      totExtra += (a.extra || 0);
      totXP    += xp;

      const name = a.character_display || a.character_name || a.character_id || '?';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${name}</td>
        <td style="text-align:center">${a.attended  ? '●' : '○'}</td>
        <td style="text-align:center">${a.costuming ? '●' : '○'}</td>
        <td style="text-align:center">${a.downtime  ? '●' : '○'}</td>
        <td style="text-align:center">${a.extra || 0}</td>
        <td style="text-align:center;font-weight:600">${xp}</td>`;
      tbody.appendChild(tr);
    });

    // Totals row
    const totTr = document.createElement('tr');
    totTr.style.cssText = 'font-weight:700;border-top:1px solid var(--bdr)';
    totTr.innerHTML = `
      <td style="color:var(--txt2)">Total (${rows.length})</td>
      <td style="text-align:center">${totAtt}</td>
      <td style="text-align:center">${totCos}</td>
      <td style="text-align:center">${totDT}</td>
      <td style="text-align:center">${totExtra}</td>
      <td style="text-align:center">${totXP}</td>`;
    tbody.appendChild(totTr);

    table.appendChild(tbody);
    tableWrap.appendChild(table);
  }

  renderTable();

  sel.addEventListener('change', async () => {
    errEl.style.display = 'none';
    const newId = sel.value || null;
    try {
      await apiPut('/api/downtime_cycles/' + cy._id, { session_id: newId });
      cy.session_id = newId;
      renderTable();
    } catch (err) {
      sel.value = cy.session_id || '';
      errEl.textContent = 'Link failed: ' + err.message;
      errEl.style.display = 'inline';
    }
  });

  return wrap;
}
```

### cycle-views.js — Attendance toggle in buildCyclesPanel

In the `sorted.forEach` loop, after the Publish button block and before `tbody.appendChild(tr)`, add:

```js
// Attendance toggle
const tdAtt = document.createElement('td');
const attBtn = document.createElement('button');
attBtn.className = 'btn-sm';
attBtn.textContent = 'Attendance';
tdAtt.appendChild(attBtn);
tr.appendChild(tdAtt);

const attendTr = document.createElement('tr');
attendTr.style.display = 'none';
const attendTd = document.createElement('td');
attendTd.colSpan = 6;
attendTd.style.cssText = 'padding:4px 12px 12px;background:var(--surf2)';
attendTd.appendChild(buildAttendanceSection(cy, sessions));
attendTr.appendChild(attendTd);

attBtn.addEventListener('click', () => {
  const open = attendTr.style.display !== 'none';
  attendTr.style.display = open ? 'none' : '';
  attBtn.style.borderColor = open ? '' : 'var(--gold2)';
  attBtn.style.color     = open ? '' : 'var(--gold2)';
});
```

The `tbody.appendChild(tr)` and `tbody.appendChild(detailTr)` that end the loop become:

```js
tbody.appendChild(tr);
tbody.appendChild(detailTr);   // Prep Access detail
tbody.appendChild(attendTr);   // Attendance detail
```

### Row index change — Story 4 Playwright test fix

With attendance rows appended **after** prep-access detail rows, the per-cycle row order in tbody becomes:

```
index 0: main row (cyc-001)
index 1: detailTr (cyc-001 prep access)
index 2: attendTr (cyc-001 attendance)
index 3: main row (cyc-002)
index 4: detailTr (cyc-002 prep access)  ← was nth(3), now nth(4)
index 5: attendTr (cyc-002 attendance)
```

In `tests/cycle-prep-access.spec.js`, the test "unchecking then re-checking adds the character back" (line 255) has:

```js
const cyc002Detail = page.locator('#cycle-content table').last().locator('tbody tr').nth(3);
```

Update to:

```js
const cyc002Detail = page.locator('#cycle-content table').last().locator('tbody tr').nth(4);
```

### No new API routes

The `PUT /api/downtime_cycles/:id` endpoint already accepts any field via `$set: updates` and `additionalProperties: true` in the schema. `GET /api/game_sessions` is already available. No new server routes required.

### Test file pattern

Same static-grep pattern as stories 1–5.

```js
import fs from 'fs';
const CYCLE_VIEWS = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');
const SCHEMA      = fs.readFileSync('../server/schemas/downtime_submission.schema.js', 'utf8');
const SPEC        = fs.readFileSync('../tests/cycle-prep-access.spec.js', 'utf8');
```

Required assertions (≥8):
- `CYCLE_VIEWS` contains `buildAttendanceSection`
- `CYCLE_VIEWS` contains `session_id`
- `CYCLE_VIEWS` contains `Attendance`
- `CYCLE_VIEWS` contains `game_sessions` (the apiGet call)
- `CYCLE_VIEWS` contains `character_display`
- `CYCLE_VIEWS` contains `totals` or `Total` (totals row)
- `SCHEMA` contains `session_id`
- `SPEC` contains `nth(4)` (updated locator)
- `SPEC` does NOT contain `nth(3)` (old broken locator gone)

---

## Tasks

- [x] **Task 1** — Add `session_id: { type: ['string', 'null'] }` to the cycle properties block in `server/schemas/downtime_submission.schema.js`
- [x] **Task 2** — Update `initCycleView` in `cycle-views.js` to fetch `game_sessions`; update `buildCyclesPanel` signature to accept `sessions`; update `<thead>` to 6 columns; update `detailTd.colSpan` to 6
- [x] **Task 3** — Add `buildAttendanceSection(cy, sessions)` to `cycle-views.js`; add Attendance toggle + `attendTr` to the `sorted.forEach` loop; append `attendTr` after `detailTr`
- [x] **Task 4** — Fix `tests/cycle-prep-access.spec.js`: change `nth(3)` → `nth(4)` for the cyc-002 prep access detail locator
- [x] **Task 5** — Create `server/tests/epic.708.6-attendance-xp-absorption.test.js` with ≥8 static-grep assertions; run and confirm all pass. Also confirm the existing Story 4 contract tests still pass.

---

## File List

**New:**
- `server/tests/epic.708.6-attendance-xp-absorption.test.js`

**Modified:**
- `server/schemas/downtime_submission.schema.js`
- `public/js/admin/cycle-views.js`
- `tests/cycle-prep-access.spec.js`

---

## Dev Agent Record

### Debug Log
_Empty_

### Completion Notes
- Added `session_id` to `downtimeCycleSchema` in `downtime_submission.schema.js`
- `initCycleView` now fetches `GET /api/game_sessions` in parallel; passes `sessions` to `buildCyclesPanel`
- `buildAttendanceSection(cy, sessions)` added: session dropdown pre-linked from `cy.session_id`; on change PUTs new session_id; renders read-only XP table (sorted by name, totals row) or "No attendance recorded" fallback
- Attendance toggle + `attendTr` appended after `detailTr` per cycle row; thead updated to 6 columns; `detailTd.colSpan` updated to 6
- Story 4 Playwright spec: `nth(3)` updated to `nth(4)` for cyc-002 prep access detail row
- 11 contract tests pass (Story 6); Stories 4 (10) and 5 (13) unaffected — 34 total

### Change Log
- 2026-06-11: Story implemented — attendance session-link + read-only XP summary in Cycle tab; 11 passing contract tests
