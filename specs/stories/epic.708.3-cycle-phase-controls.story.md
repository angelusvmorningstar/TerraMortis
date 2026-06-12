---
issue: 708
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/708
branch: ms/issue-708-cycle-tab-game-phase
epic: CYCLE — Game Cycle Management Tab
story: 3 of 6
status: review
---

# Epic CYCLE — Story 3: Phase Controls

## Story

**As an** ST,
**I want** to manually set a game cycle's phase (Game / Downtime / Processing) from the Cycle tab,
**so that** the entire system reflects the current game state without requiring auto-derived logic or navigating multiple tabs.

---

## Epic Context

Story 3 of 6 in the CYCLE epic (#708). Stories 1 (schema/API) and 2 (tab shell) are complete and on `main`.

This story adds the interactive phase controls to the Game Cycles panel in the Cycle tab, and adds a server-side tracker reset endpoint so entering Game phase clears stale per-character tracker data.

Stories 4–6 will add DT prep access controls, the publish pipeline, and attendance/XP absorption.

---

## Acceptance Criteria

- [ ] AC-1: Each cycle row in the Game Cycles panel shows three phase buttons: "Game", "Downtime", "Processing".
- [ ] AC-2: The button matching the cycle's current `game_phase` is highlighted as the active state; the others are styled as inactive. Cycles with `game_phase: null` (legacy) show all three as inactive.
- [ ] AC-3: Clicking a non-active phase button calls `PUT /api/downtime_cycles/:id` with `{ game_phase: '<phase>' }` and updates the row's button states on success without a full panel rebuild.
- [ ] AC-4: Clicking "Game" shows a confirmation dialog before writing. On confirm: calls `DELETE /api/tracker_state` (bulk tracker wipe) then sets `game_phase: 'game'`.
- [ ] AC-5: A new `DELETE /api/tracker_state` endpoint (ST-only) deletes all `tracker_state` documents and returns `{ deleted: N }`. Returns 403 if caller is not ST/dev role.
- [ ] AC-6: API errors are caught and shown inline below the affected row — no unhandled promise rejections.
- [ ] AC-7: Contract tests pass (≥10 assertions in `server/tests/epic.708.3-cycle-phase-controls.test.js`).

---

## Dev Notes

### Files to change

**Modified:**
- `server/routes/tracker.js` — add `DELETE /` endpoint (ST/dev role guard, bulk `deleteMany`)
- `public/js/admin/cycle-views.js` — update `buildCyclesPanel()` for interactive phase buttons; add `setGamePhase()` helper; add `apiPut` to import

**New:**
- `server/tests/epic.708.3-cycle-phase-controls.test.js` — static-grep contract tests

### server/routes/tracker.js — DELETE endpoint

Add before `export default router`:

```js
// DELETE /api/tracker_state — ST/dev only, wipes all docs for game-start reset
router.delete('/', async (req, res) => {
  const role = req.user?.role;
  if (role !== 'st' && role !== 'dev') return res.status(403).json({ error: 'FORBIDDEN' });
  const result = await col().deleteMany({});
  res.json({ deleted: result.deletedCount });
});
```

The router is already mounted with `requireAuth` in `server/index.js` (verify before implementing) — `req.user` is therefore guaranteed set. The role check inside the handler is the authorization gate.

### cycle-views.js — import change

Add `apiPut` to the existing import:

```js
import { apiGet, apiPost, apiDelete, apiPut } from '../data/api.js';
```

### cycle-views.js — setGamePhase helper

Add as a module-level function (before or after `buildCyclesPanel`):

```js
async function setGamePhase(cycleId, phase) {
  if (phase === 'game') {
    if (!confirm('Setting to Game phase will reset the live tracker (all characters reload with default states). Continue?')) return false;
    try {
      await apiDelete('/api/tracker_state');
    } catch (err) {
      throw new Error('Tracker reset failed: ' + err.message);
    }
  }
  await apiPut('/api/downtime_cycles/' + cycleId, { game_phase: phase });
  return true;
}
```

### cycle-views.js — buildCyclesPanel update

**Current** `buildCyclesPanel` renders a read-only table with columns: Label | Phase (text) | Chapter.

**Change**: Replace the plain Phase text column with three interactive phase buttons. The table columns become: Label | Phase (buttons) | Chapter.

The phase column should be ~270px wide to fit three `btn-sm` buttons side-by-side.

For each cycle row, render three buttons:

```js
const PHASES = ['game', 'downtime', 'processing'];

function phaseCell(cy) {
  const td = document.createElement('td');
  td.style.cssText = 'white-space:nowrap';
  const errEl = document.createElement('span');
  errEl.style.cssText = 'color:var(--crim);font-size:11px;display:none;margin-left:6px';
  td.appendChild(errEl);

  PHASES.forEach(phase => {
    const btn = document.createElement('button');
    btn.className = 'btn-sm';
    btn.textContent = PHASE_LABELS[phase];
    btn.dataset.phase = phase;
    btn.style.marginRight = '4px';
    const isActive = cy.game_phase === phase;
    if (isActive) {
      btn.style.cssText += ';border-color:var(--gold2);color:var(--gold2)';
      btn.disabled = true;
    }
    btn.addEventListener('click', async () => {
      errEl.style.display = 'none';
      try {
        const ok = await setGamePhase(cy._id, phase);
        if (!ok) return; // user cancelled confirm
        cy.game_phase = phase;
        // Refresh button states in this row
        td.querySelectorAll('button').forEach(b => {
          const active = b.dataset.phase === phase;
          b.disabled = active;
          b.style.borderColor = active ? 'var(--gold2)' : '';
          b.style.color = active ? 'var(--gold2)' : '';
        });
      } catch (err) {
        errEl.textContent = 'Phase change failed: ' + err.message;
        errEl.style.display = 'inline';
      }
    });
    td.insertBefore(btn, errEl);
  });

  return td;
}
```

Update the cycle row construction to use `phaseCell(cy)` instead of the plain `<td>` for phase:

```js
const tr = document.createElement('tr');
// Label cell
const tdLabel = document.createElement('td');
tdLabel.textContent = cy.label || cy._id;
tr.appendChild(tdLabel);
// Phase cell (interactive buttons)
tr.appendChild(phaseCell(cy));
// Chapter cell
const tdChapter = document.createElement('td');
tdChapter.style.color = 'var(--txt2)';
tdChapter.textContent = chapter ? `${chapter.number} — ${chapter.label}` : '—';
tr.appendChild(tdChapter);
tbody.appendChild(tr);
```

Update the `<thead>` to widen the phase column:

```html
<th style="width:270px">Phase</th>
```

### Tracker reset semantics

`DELETE /api/tracker_state` deletes all `tracker_state` documents from MongoDB. When the Game App next loads and fetches `GET /api/tracker_state/:character_id`, it receives 404 and falls back to per-character computed defaults: max vitae (calcVitaeMax), max willpower, no damage, no conditions. This is the intended clean-slate state for a new game session. The ST adjusts vitae/damage from there using the live tracker.

### index.js — verify tracker mount

Before implementing, verify `server/index.js` mounts the tracker router with `requireAuth`. The expected line is something like:

```js
app.use('/api/tracker_state', requireAuth, trackerRouter);
```

If `requireAuth` is already there, no index.js change is needed. If not, add it — but check with grep first before touching index.js.

### Test file pattern

Same static-grep pattern as stories 1 and 2. Read files with `fs.readFileSync`, assert with `toContain`/`toMatch`.

```js
import fs from 'fs';
const TRACKER = fs.readFileSync('../server/routes/tracker.js', 'utf8');
const CYCLE_VIEWS = fs.readFileSync('../public/js/admin/cycle-views.js', 'utf8');
```

Required assertions (≥10):

- `TRACKER` contains `router.delete`
- `TRACKER` contains `deleteMany`
- `TRACKER` contains `'FORBIDDEN'`
- `TRACKER` contains `'deleted'`
- `CYCLE_VIEWS` import line contains `apiPut`
- `CYCLE_VIEWS` contains `setGamePhase`
- `CYCLE_VIEWS` contains `/api/tracker_state`
- `CYCLE_VIEWS` contains `confirm(`
- `CYCLE_VIEWS` contains `data-phase`
- `CYCLE_VIEWS` contains `game_phase` assignment after success

---

## Tasks

- [x] **Task 1** — Add `DELETE /` endpoint to `server/routes/tracker.js` (ST/dev role guard, bulk `deleteMany`)
- [x] **Task 2** — Update `public/js/admin/cycle-views.js`: add `apiPut` to import; add `setGamePhase()` helper; refactor `buildCyclesPanel()` to render interactive phase buttons via `buildPhaseCell()`
- [x] **Task 3** — Create `server/tests/epic.708.3-cycle-phase-controls.test.js` with ≥10 static-grep assertions; run and confirm all pass

---

## File List

**New:**
- `server/tests/epic.708.3-cycle-phase-controls.test.js`

**Modified:**
- `server/routes/tracker.js`
- `public/js/admin/cycle-views.js`

---

## Dev Agent Record

### Debug Log
_Empty_

### Completion Notes
- Added `DELETE /api/tracker_state` (ST/dev-only, `deleteMany({})`) to `server/routes/tracker.js`; returns `{ deleted: N }`
- Added `apiPut` to `cycle-views.js` import; added `setGamePhase(cycleId, phase)` helper (confirm + tracker wipe before Game, then PUT game_phase)
- Replaced read-only Phase column in `buildCyclesPanel` with `buildPhaseCell(cy)` — three `btn-sm` buttons per row, active phase gold-highlighted + disabled, inline error span below on failure
- 14 static-grep contract tests — all pass (no regressions vs 5-file pre-existing failure baseline)

### Change Log
- 2026-06-11: Story implemented — interactive phase buttons with tracker reset on Game entry; DELETE /api/tracker_state endpoint; 14 passing contract tests
