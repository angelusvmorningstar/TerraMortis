# Story feature.96: DT Processing — Committed/Rolled Progress Ribbon

## Status: done

---

## Metadata

```yaml
issue: 308
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/308
branch: morningstar-issue-308-dt-committed-rolled-ribbon
```

---

## Story

**As an** ST processing downtimes,
**I want** the intermediate Committed and Rolled states to advance automatically rather than requiring manual button clicks,
**so that** the Validation Status row shows only meaningful decision points and new STs aren't confused by two opaque intermediate buttons.

---

## Background

Feature.80 introduced a `committed` status that locks the pool builder and gates the Roll button. `rolled` was already auto-advanced by Re-roll (line 5161). The manual `Committed` and `Rolled` buttons are now vestigial for the normal workflow: STs click Committed, then Roll (which auto-advances to Rolled), then a terminal button. The two intermediates are invisible state-machine internals that don't need separate affordance.

**This story makes them read-only.** The intermediate states are shown as a progress ribbon; only terminal buttons (Validated, No Roll Needed, Skip, etc.) and Pending (reset) remain clickable. The pool-lock side-effects that previously fired on the Committed button click now fire implicitly when a terminal button or the Roll button is clicked.

---

## Acceptance Criteria

1. `committed` and `rolled` are no longer separate clickable buttons on the Validation Status row for pool-builder action types (feeding, projects, sorcery, non-auto merits).
2. A read-only progress ribbon is rendered showing the current intermediate state: `Pending → Committed → Rolled → terminal`. The active step is highlighted; prior steps are dimmed; future steps are greyed out.
3. Clicking Re-roll still auto-advances `pool_status` to `rolled` (line 5161 — no change needed; verify no regression).
4. When any terminal status button is clicked and the entry's current `pool_status` is `pending` or `committed` (i.e., pool not yet formally committed), the committed side-effects fire implicitly before the terminal status is saved:
   - `pool_committed_by` is set to the ST's name.
   - For feeding entries: the vitae tally is snapshotted (same logic as lines 4690–4705).
5. The pool builder still locks (read-only) when `pool_status` is `committed` (existing behaviour via `.proc-pool-committed` class — no change needed if the implicit commit fires correctly).
6. Terminal buttons (Validated, No Roll Needed, Skip, No Effect, Resolved, No Valid Feeding) remain as manual clickable buttons.
7. Pending remains as a clickable reset button.
8. Auto-resolving action types (`auto` merits, inline "other" entries at line 8349) that already exclude `committed`/`rolled` are unaffected.

---

## Tasks / Subtasks

### Task 1: Add `_renderStatusRibbon(key, poolStatus)` helper ✅

Add a new pure-render helper near `_renderValStatusButtons` (~line 6567):

```js
/**
 * Read-only progress ribbon for intermediate pool states.
 * Renders Pending → Committed → Rolled with the active step highlighted.
 * Shown alongside (not instead of) the terminal button row.
 */
function _renderStatusRibbon(key, poolStatus) {
  const steps = [
    ['pending',   'Pending'],
    ['committed', 'Committed'],
    ['rolled',    'Rolled'],
  ];
  const activeIdx = steps.findIndex(([val]) => val === poolStatus);
  let h = '<div class="proc-status-ribbon">';
  steps.forEach(([val, label], i) => {
    let cls = 'proc-ribbon-step';
    if (i < activeIdx)  cls += ' ribbon-past';
    if (i === activeIdx) cls += ' ribbon-active ' + val;
    if (i > activeIdx)  cls += ' ribbon-future';
    h += `<span class="${cls}">${label}</span>`;
    if (i < steps.length - 1) h += '<span class="proc-ribbon-arrow">›</span>';
  });
  h += '</div>';
  return h;
}
```

### Task 2: Update `_renderValStatusButtons` call sites ✅

Four call sites render the pool-builder button rows. In each, remove `['committed', 'Committed']` and `['rolled', 'Rolled']` from the buttons array. Add the ribbon just before the button row.

**2a. Feeding** (~line 7275):
```js
// Before:
h += _renderValStatusButtons(key, poolStatus, [['pending','Pending'],['committed','Committed'],['rolled','Rolled'],['validated','Validated'],['no_feed','No Valid Feeding']]);
// After:
h += _renderStatusRibbon(key, poolStatus);
h += _renderValStatusButtons(key, poolStatus, [['pending','Pending'],['validated','Validated'],['no_feed','No Valid Feeding']]);
```

**2b. Project** (~line 7027):
```js
// Before:
h += _renderValStatusButtons(key, poolStatus, [['pending','Pending'],['committed','Committed'],['rolled','Rolled'],['validated','Validated'],['no_roll','No Roll Needed'],['skipped','Skip']]);
// After:
h += _renderStatusRibbon(key, poolStatus);
h += _renderValStatusButtons(key, poolStatus, [['pending','Pending'],['validated','Validated'],['no_roll','No Roll Needed'],['skipped','Skip']]);
```

**2c. Sorcery** (~line 6887):
```js
// Before:
h += _renderValStatusButtons(key, poolStatus, [['pending','Pending'],['committed','Committed'],['rolled','Rolled'],['resolved','Resolved'],['no_effect','No Effect'],['skipped','Skip']]);
// After:
h += _renderStatusRibbon(key, poolStatus);
h += _renderValStatusButtons(key, poolStatus, [['pending','Pending'],['resolved','Resolved'],['no_effect','No Effect'],['skipped','Skip']]);
```

**2d. Merit (non-auto)** (~line 6822):
```js
// Before (non-auto path):
[['pending','Pending'],['committed','Committed'],['rolled','Rolled'],['resolved','Validated'],['no_roll','No Roll Needed'],['skipped','Skip']]
// After:
h += _renderStatusRibbon(key, poolStatus);
h += _renderValStatusButtons(key, poolStatus, [['pending','Pending'],['resolved','Validated'],['no_roll','No Roll Needed'],['skipped','Skip']]);
```
The auto merit path (`isAuto === true`) at line 6821 is unchanged — it already omits committed/rolled.

### Task 3: Implicit committed side-effects in the click handler ✅

In the `.proc-val-btn` click handler (~line 4648), before saving `statusPatch`, add an implicit-commit block:

```js
// Determine terminal statuses (all non-intermediate statuses that aren't pending)
const TERMINAL_STATUSES = new Set(['validated','resolved','no_roll','no_feed','no_effect','skipped','maintenance']);

if (TERMINAL_STATUSES.has(status)) {
  const curStatus = entry.review?.pool_status || 'pending';
  if (curStatus === 'pending' || curStatus === 'committed') {
    // Implicit commit: set committed_by if not already set
    if (!entry.review?.pool_committed_by) {
      const user = getUser();
      const stName = user?.global_name || user?.username || 'ST';
      await saveEntryReview(entry, { pool_status: 'committed', pool_committed_by: stName });
      // Reload entry review after save
      const updatedEntry = _getQueueEntry(key);
      if (updatedEntry) Object.assign(entry, updatedEntry);
    }
    // Implicit vitae tally snapshot for feeding (mirrors lines 4690–4705)
    if (entry.source === 'feeding' && !entry.review?.feeding_vitae_tally) {
      const vitaePanel = container.querySelector(`.proc-feed-vitae-panel[data-proc-key="${key}"]`);
      if (vitaePanel) {
        const vitateTally = {
          herd:               parseInt(vitaePanel.dataset.herd,       10) || 0,
          ambience:           parseInt(vitaePanel.dataset.ambience,   10) || 0,
          ambience_territory: vitaePanel.dataset.terrLabel || '',
          oath_of_fealty:     parseInt(vitaePanel.dataset.oof,        10) || 0,
          ghouls:             parseInt(vitaePanel.dataset.ghouls,     10) || 0,
          rite_cost:          parseInt(vitaePanel.dataset.riteCost,   10) || 0,
          manual:             parseInt(vitaePanel.dataset.manual,     10) || 0,
          total_bonus:        parseInt(vitaePanel.dataset.totalBonus, 10) || 0,
        };
        await updateSubmission(entry.subId, { feeding_vitae_tally: vitateTally });
        const sub = submissions.find(s => s._id === entry.subId);
        if (sub) sub.feeding_vitae_tally = vitateTally;
      }
    }
  }
}
```

**Important:** This block runs BEFORE the existing `const statusPatch = { pool_status: status }` at line 4678. The `saveEntryReview(entry, { pool_status: 'committed', ... })` is a side-effect only — the final `statusPatch` still sets the terminal status.

**Note on `entry.review`:** Check the actual property name used to access the current review object on an entry. It may be `rev` (a local variable) rather than `entry.review`. Use whatever pattern the surrounding handler uses. The local `rev` is likely obtained by calling `getEntryReview(entry)` earlier in the handler block — if it isn't already computed, call it before the block above.

### Task 4: CSS for the progress ribbon ✅

Add to `public/css/admin-layout.css`, near the `.proc-val-status` block (~line 4934):

```css
.proc-status-ribbon {
  display: flex; align-items: center; gap: 4px;
  margin-bottom: 6px; font-size: 0.75rem;
}
.proc-ribbon-step {
  padding: 2px 8px; border-radius: 10px;
  border: 1px solid transparent; color: var(--txt3);
  white-space: nowrap;
}
.proc-ribbon-step.ribbon-past   { color: var(--txt2); border-color: var(--surf3); }
.proc-ribbon-step.ribbon-active { font-weight: 600; }
.proc-ribbon-step.ribbon-active.pending   { border-color: var(--result-pend); color: var(--result-pend); }
.proc-ribbon-step.ribbon-active.committed { border-color: var(--gold2); color: var(--gold2); }
.proc-ribbon-step.ribbon-active.rolled    { border-color: var(--gold2); color: var(--gold2); }
.proc-ribbon-step.ribbon-future { opacity: 0.35; }
.proc-ribbon-arrow { color: var(--txt3); font-size: 0.7rem; }
```

Also add parchment-theme overrides near the `.proc-val-status button.active` light-theme block (~line 6186):
```css
html:not([data-theme="dark"]) .proc-ribbon-step.ribbon-active.committed { border-color: var(--story-compl); color: var(--story-compl); }
html:not([data-theme="dark"]) .proc-ribbon-step.ribbon-active.rolled    { border-color: var(--story-compl); color: var(--story-compl); }
```

---

## Dev Notes

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | Add helper, update 4 call sites, update click handler |
| `public/css/admin-layout.css` | Add ribbon CSS, parchment theme overrides |

### What does NOT change

- `pool_status` data values in MongoDB — `committed` and `rolled` remain valid DB values.
- `DONE_STATUSES` — no change.
- The `.proc-pool-committed` pool-builder lock CSS — still works as before (pool builder dims when `poolStatus === 'committed'` on render).
- The Re-roll auto-advance to `rolled` at line 5161 — already works, no change.
- Auto-merit and inline-other button sets (line 8349) — already omit committed/rolled.
- The `pool_committed_by` field still gets written; it just fires implicitly rather than from a button.

### `entry.review` vs `rev` naming

Inside the `.proc-val-btn` click handler, the pattern for getting the current review object is:
```js
const entry = _getQueueEntry(key);
```
Then later the code calls `getEntryReview(entry)` to get `rev`. Check whether `rev` is already computed in the handler before adding the implicit-commit block, or compute it:
```js
const rev = getEntryReview(entry) || {};
const curStatus = rev.pool_status || 'pending';
```

### Ribbon when status is terminal

When `poolStatus` is `validated`, `resolved`, etc., the ribbon will show `Pending → Committed → Rolled` with all three steps in `ribbon-past` state. This is correct — all intermediate steps are "done". The active terminal state is conveyed by the active terminal button, not by the ribbon.

Alternatively, hide the ribbon when a terminal status is active. The simplest check:
```js
const INTERMEDIATE = new Set(['pending', 'committed', 'rolled']);
if (INTERMEDIATE.has(poolStatus)) { h += _renderStatusRibbon(key, poolStatus); }
```
Either approach is acceptable. Hiding it when terminal is cleaner — use that unless it causes visual jumpiness.

### Vitae tally — idempotency guard

The implicit-commit block in Task 3 guards with `!entry.review?.feeding_vitae_tally` before re-snapshotting. This prevents double-writes if the ST clicks a terminal button on an already-committed feeding entry where the tally was already captured.

### Manual verification checklist

- [ ] Open a **feeding** action. Confirm ribbon shows `Pending` active. Click `Validated` — confirm pool expression is saved, vitae tally is saved, `committed` intermediate fires, then `validated` is set as final status.
- [ ] Open a **project** action. Confirm ribbon shows `Pending` active. Click Roll button — pool commits, then roll fires. Then click `Validated`.
- [ ] Open a **sorcery** action. Click `Resolved` — confirm pool is committed implicitly, then resolved.
- [ ] Open a **non-auto merit** action. Click `Validated` (shown as "Validated") — confirm pool commits implicitly.
- [ ] Click **Re-roll** — confirm ribbon advances to `Rolled` automatically (existing behaviour).
- [ ] Click **Pending** — confirm ribbon resets to `Pending` active.
- [ ] Open an **auto merit** action — confirm button set is unchanged (no ribbon, no committed/rolled).
- [ ] Open an **inline other** action — confirm button set unchanged.
- [ ] Confirm **submission checklist** still does not count `committed` or `rolled` as done.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes

- Task 1: Added `_renderStatusRibbon(key, poolStatus)` helper at line 6641, after `_renderValStatusButtons`. Renders `Pending › Committed › Rolled` with `ribbon-past`, `ribbon-active <val>`, `ribbon-future` classes. Hidden when `poolStatus` is terminal (guard is at each call site: `if (['pending','committed','rolled'].includes(poolStatus))`).
- Task 2: Updated all 4 call sites. Removed `['committed','Committed']` and `['rolled','Rolled']` from each button array; prefixed each with the ribbon guard. Auto-merit path unchanged (no ribbon, no committed/rolled buttons).
- Task 2 extra: Also updated `showFeedRollBtn` (feeding) and `showRollBtn` (project) to include `poolStatus === 'pending'` so the Roll button is visible from the `pending` state (required since there is no longer a Committed button to click first). Also added `poolStatus === 'rolled'` to the project condition for consistency with feeding.
- Task 3: Added `_TERMINAL` Set and implicit-commit block in the `.proc-val-btn` click handler, before `statusPatch`. Sets `pool_committed_by` if not already set; snapshots `feeding_vitae_tally` for feeding entries if not already saved. Uses `getEntryReview(entry)` to read current state rather than `entry.review` (which does not exist).
- Task 3 extra: Updated both Roll button handlers (feeding `.proc-feed-roll-btn` at ~5112, project `.proc-proj-roll-btn` at ~5203) to read pool expression from the DOM builder if `pool_validated` is empty. This allows a fresh `pending` entry to be rolled without clicking a committed button first. Also saves `pool_committed_by` implicitly in the same builder-fallback save.
- Task 4: Added `.proc-status-ribbon`, `.proc-ribbon-step`, `.proc-ribbon-arrow` CSS in `admin-layout.css` after `.proc-val-status button.active.rolled`. Added parchment-theme overrides after the existing light-theme `.proc-val-status` block.
- No test framework; manual verification required per checklist in Dev Notes.
- QA: Generated `tests/downtime-processing-feature96.spec.js` — 34 Playwright E2E tests covering F96-1 through F96-6 (ribbon rendering, removed buttons, terminal buttons retained, auto-merit unchanged, Roll from pending, implicit commit API write). All 34 pass.
- QA: Updated DT-Fix-22 test in `downtime-processing-dt-fixes.spec.js` to assert Roll IS visible from pending (previous assertion was the opposite; the feature change made it correct). All 4 DT-Fix-22 tests pass.
- QA: Fixed pre-existing test breakage in all three DT spec files: changed `TEST_CYCLE.status` from `'open'` to `'active'` so the DTUX-1 phase ribbon opens the projects panel (where the processing queue lives) on load. This was broken since DTUX-1 was introduced.

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `specs/stories/feature.96.dt-status-ribbon.story.md`
- `tests/downtime-processing-feature96.spec.js`
- `tests/downtime-processing-dt-fixes.spec.js`
- `tests/downtime-processing.spec.js`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-14 | 1.0 | Initial draft from issue #308 | BMAD SM |
| 2026-05-14 | 1.1 | Implementation complete | claude-sonnet-4-6 |
| 2026-05-14 | 1.2 | QA: 34 E2E tests, DT-Fix-22 update, cycle status fix | claude-sonnet-4-6 |
