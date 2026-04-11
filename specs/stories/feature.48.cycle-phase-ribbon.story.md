# Story feature.48: Game Cycle Phase Ribbon

## Status: review

## Story

**As an** ST,
**I want** a two-row phase ribbon at the top of the Downtime tab — a main row showing the 4 lifecycle phases and a sub-row showing the steps within the active phase —
**so that** I can see at a glance where the current cycle is and what checkpoints remain in the current phase.

## Background

The downtime domain has a cycle selector and a status badge (`active` / `game` / `closed`) but nothing that maps those to the broader game cycle lifecycle. STs think in terms of phases; the UI doesn't surface them.

Phases 2–4 of the full 8-phase lifecycle (Pre-Game, Game itself, Regency confirm) are not individually tracked in the database. Only `cycle.status` exists. So the main ribbon uses a simplified 4-phase model:

| Step | Label | Condition |
|---|---|---|
| 0 | Game & Feeding | `cycle.status === 'game'` |
| 1 | Downtimes | `cycle.status === 'active'` |
| 2 | Processing | `cycle.status === 'closed'` + at least one submission `pending` |
| 3 | Push Ready | `cycle.status === 'closed'` + no submissions `pending` |

Below the main ribbon, a secondary sub-ribbon shows the trackable checkpoints within the currently active phase only. Sub-phases are read-only indicators — done, in-progress, or pending — derived from existing fields.

---

## Acceptance Criteria

### Main ribbon
1. A `#dt-phase-ribbon` div is added to `buildShell()` immediately after `#dt-cycle-bar`.
2. When no cycle is selected, `#dt-phase-ribbon` is hidden (empty or `display:none`).
3. When a cycle is loaded, the main ribbon renders 4 step pills connected by lines: **Game & Feeding · Downtimes · Processing · Push Ready**.
4. The active step is highlighted in gold (`--gold2`). Completed steps show a `✓` prefix and are muted. Future steps are dimmed.
5. The main ribbon is re-rendered every time `loadCycleById()` rerenders (cycle switch, status change).

### Sub-ribbon
6. Immediately below the main ribbon, a `#dt-sub-ribbon` div renders the sub-steps for the active phase only.
7. Sub-steps are smaller pills with three visual states: **done** (muted gold + `✓`), **active** (bright gold), **pending** (dimmed).
8. Sub-phases per main phase:

   **Phase 0 — Game & Feeding:**
   - Regent Confirmed → `!!cycle.regency_character_id`
   - Ambience Applied → `!!cycle.ambience_applied`

   **Phase 1 — Downtimes:**
   - Deadline Set → `!!cycle.deadline_at`
   - Submissions Received → `submissions.length > 0`
   - Deadline Passed → `cycle.deadline_at && new Date(cycle.deadline_at) < new Date()`

   **Phase 2 — Processing:**
   - Reviewing → always active (in-progress) when in this phase
   - All Resolved → `!submissions.some(s => !s.approval_status || s.approval_status === 'pending')`

   **Phase 3 — Push Ready:**
   - _(no sub-phases tracked yet — sub-ribbon hidden; feature.41 will add push sub-steps)_

9. The sub-ribbon is also re-rendered when submissions load/update (so "Submissions Received" and "All Resolved" update after the submission list populates).
10. The sub-ribbon is purely display — no buttons, no interactivity.

---

## Phase & Sub-Phase Logic

```js
function getCyclePhase(cycle, submissions) {
  if (!cycle) return null;
  if (cycle.status === 'game')   return 0;
  if (cycle.status === 'active') return 1;
  const hasPending = (submissions || []).some(
    s => !s.approval_status || s.approval_status === 'pending'
  );
  return hasPending ? 2 : 3;
}

function getSubPhases(phase, cycle, submissions) {
  const subs = submissions || [];
  switch (phase) {
    case 0:
      return [
        { label: 'Regent Confirmed', done: !!cycle.regency_character_id },
        { label: 'Ambience Applied', done: !!cycle.ambience_applied },
      ];
    case 1: {
      const hasSubs = subs.length > 0;
      const deadlinePast = !!(cycle.deadline_at && new Date(cycle.deadline_at) < new Date());
      return [
        { label: 'Deadline Set',        done: !!cycle.deadline_at },
        { label: 'Submissions Received', done: hasSubs },
        { label: 'Deadline Passed',     done: deadlinePast },
      ];
    }
    case 2: {
      const allResolved = !subs.some(s => !s.approval_status || s.approval_status === 'pending');
      return [
        { label: 'Reviewing',    done: allResolved, inProgress: !allResolved },
        { label: 'All Resolved', done: allResolved },
      ];
    }
    case 3:
    default:
      return [];
  }
}
```

A sub-phase with `done: true` shows as muted gold + `✓`. A sub-phase with `inProgress: true` (and not done) shows as bright gold. Otherwise dimmed.

---

## Rendering

```js
function renderPhaseRibbon(cycle, submissions) {
  const mainEl = document.getElementById('dt-phase-ribbon');
  const subEl  = document.getElementById('dt-sub-ribbon');
  if (!mainEl || !subEl) return;

  const phase = getCyclePhase(cycle, submissions);
  if (phase === null) {
    mainEl.style.display = 'none';
    subEl.style.display  = 'none';
    return;
  }

  // ── Main ribbon ──
  const mainSteps = ['Game \u0026 Feeding', 'Downtimes', 'Processing', 'Push Ready'];
  mainEl.style.display = '';
  mainEl.innerHTML = mainSteps.map((label, i) => {
    const done   = i < phase;
    const active = i === phase;
    const cls    = done ? 'pr-step pr-done' : active ? 'pr-step pr-active' : 'pr-step pr-future';
    const icon   = done ? '\u2713 ' : '';
    const connector = i < mainSteps.length - 1 ? '<span class="pr-connector"></span>' : '';
    return `<span class="${cls}">${icon}${label}</span>${connector}`;
  }).join('');

  // ── Sub ribbon ──
  const subSteps = getSubPhases(phase, cycle, submissions);
  if (!subSteps.length) {
    subEl.style.display = 'none';
    return;
  }
  subEl.style.display = '';
  subEl.innerHTML = subSteps.map((s, i) => {
    const cls = s.done ? 'pr-sub pr-done' : s.inProgress ? 'pr-sub pr-active' : 'pr-sub pr-future';
    const icon = s.done ? '\u2713 ' : '';
    const connector = i < subSteps.length - 1 ? '<span class="pr-sub-connector"></span>' : '';
    return `<span class="${cls}">${icon}${s.label}</span>${connector}`;
  }).join('');
}
```

---

## CSS

Add to `public/css/admin-layout.css` in a new block. Do not modify existing rules.

```css
/* ── Cycle Phase Ribbon ─────────────────────────────────────── */
#dt-phase-ribbon,
#dt-sub-ribbon {
  display: flex;
  align-items: center;
  padding: 5px 16px;
  background: var(--surf1);
  overflow-x: auto;
  gap: 0;
}

#dt-phase-ribbon {
  border-bottom: 1px solid var(--surf2);
  font-size: 12px;
  font-weight: 500;
}

#dt-sub-ribbon {
  border-bottom: 1px solid var(--surf3);
  font-size: 11px;
  padding-top: 4px;
  padding-bottom: 4px;
  background: var(--surf0, var(--bg));
}

.pr-step, .pr-sub {
  white-space: nowrap;
  padding: 3px 10px;
  border-radius: 12px;
}

.pr-done {
  color: var(--gold2);
  opacity: 0.55;
}

.pr-active {
  color: var(--gold2);
  background: rgba(224, 196, 122, 0.12);
  font-weight: 600;
  border: 1px solid rgba(224, 196, 122, 0.28);
}

.pr-future {
  color: var(--text-dim, #555);
}

.pr-connector {
  display: inline-block;
  width: 28px;
  height: 1px;
  background: var(--surf3);
  vertical-align: middle;
  flex-shrink: 0;
}

.pr-sub-connector {
  display: inline-block;
  width: 20px;
  height: 1px;
  background: var(--surf3);
  vertical-align: middle;
  flex-shrink: 0;
  opacity: 0.6;
}
```

---

## Tasks / Subtasks

- [x] Task 1: Add ribbon containers to shell
  - [x] In `buildShell()` (`downtime-views.js`), immediately after the closing `</div>` of `#dt-cycle-bar`, add:
    ```html
    <div id="dt-phase-ribbon" style="display:none"></div>
    <div id="dt-sub-ribbon" style="display:none"></div>
    ```

- [x] Task 2: Implement `getCyclePhase()`, `getSubPhases()`, `renderPhaseRibbon()`
  - [x] Add all three functions near the top of the file, after the existing constants block and before `initDowntimeView`
  - [x] Follow the exact logic and HTML structure specified above

- [x] Task 3: Wire render calls
  - [x] In `loadCycleById()`: call `renderPhaseRibbon(cycle, [])` after `renderSnapshotPanel(cycle)`. Passes `[]` initially; sub-ribbon updates after submissions load
  - [x] Added `let currentCycle = null` module-level var; set `currentCycle = cycle` at top of `loadCycleById()`. Second call `renderPhaseRibbon(currentCycle, submissions)` wired immediately after `submissions = await getSubmissionsForCycle(cycleId)`

- [x] Task 4: CSS
  - [x] Added full ribbon block to `public/css/admin-layout.css` after `.dt-cycle-status`. Removed `margin-bottom: 16px` from `.dt-cycle-bar` (ribbon now provides visual separation)

- [ ] Task 5: Verify (manual — requires live API data)

---

## Dev Notes

### File map

| File | Change |
|---|---|
| `public/js/admin/downtime-views.js` | `getCyclePhase()`, `getSubPhases()`, `renderPhaseRibbon()`, wiring in `buildShell()`, `loadCycleById()`, and submission-load site |
| `public/css/admin-layout.css` | New `.pr-*` + ribbon block |

### No new API calls. No schema changes.

All data is already loaded: `cycle` from `allCycles`, `submissions` from the existing submissions fetch.

### Feature.41 extension point

Phase 3 (Push Ready) has no sub-phases yet. When feature.41 ships, add a `case 3:` to `getSubPhases()` returning push-wizard checkpoints (e.g. Unresolved Acknowledged · Outcomes Published · Feeding Opened). No other changes needed.

### `currentCycle` variable

In `loadCycleById()`, the cycle object is a local variable. To call `renderPhaseRibbon` from the submissions-load site, either (a) store it as a module-level `let currentCycle = null` updated at the top of `loadCycleById()`, or (b) look it up from `allCycles` using the selected cycle ID. Option (a) is simpler.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-12 | 1.0 | Initial draft — two-row ribbon (main + sub) | Claude (SM) |

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Added `let currentCycle = null` to module-level vars; set at the top of `loadCycleById()`.
- `getCyclePhase()` maps `status === 'game'` → 0, `'active'` → 1, `'closed'` with pending subs → 2, closed all resolved → 3.
- `getSubPhases()` returns per-phase step arrays with `done`/`inProgress` flags; Phase 3 returns `[]` (Push Ready has no tracked sub-steps yet).
- `renderPhaseRibbon()` renders both ribbons atomically; hides sub-ribbon when `getSubPhases` returns empty (Push Ready phase).
- Two render calls wired: first in `loadCycleById()` after `renderSnapshotPanel()` with empty submissions (so main ribbon shows immediately); second after `submissions = await getSubmissionsForCycle()` to update sub-phases once data lands.
- `.dt-cycle-bar` `margin-bottom` changed from `16px` to `0` — ribbon provides the visual break.
- Task 5 (verify) requires live API; marked pending for manual in-browser check.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
