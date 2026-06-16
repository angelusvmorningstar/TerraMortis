---
title: 'DT queue filters: clicking a character pill activates unrelated filters'
type: 'fix'
issue: 802
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/802
branch: ms/issue-802-dt-queue-filter-btn-activate
created: '2026-06-16'
status: done
recommended_model: 'sonnet — single handler block removal + test'
context:
  - public/js/admin/downtime-views.js
---

## Intent

Clicking a CHARACTER filter pill in the DT processing queue always triggers a
"strip and solo" behaviour: it clears every other filter group and sets just
that character (plus their first pending phase) as the active filter. This
means clicking a CHARACTER pill you want to deselect instead re-solos it —
and silently activates a PHASE filter the user never touched.

The fix removes the strip behaviour entirely. All filter pills become
independent toggles, consistent with STATUS, PHASE, SOURCE, and TERRITORY.

---

## Root cause

### The strip-char branch (line 4916-4933)

```js
container.querySelectorAll('.proc-filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.stripChar) {
      // ← ALL CHARACTER pills hit this branch
      _procFilters.statuses    = new Set();
      _procFilters.chars       = new Set([btn.dataset.stripChar]);
      _procFilters.phases      = btn.dataset.stripPhase ? new Set([btn.dataset.stripPhase]) : new Set();
      _procFilters.territories = new Set();
      _procFilters.sources     = new Set();
    } else {
      // ← PHASE / SOURCE / TERRITORY / STATUS pills — correct toggle logic
      const dim = btn.dataset.filterDim;
      const val = btn.dataset.filterVal;
      if (!dim || !val || !_procFilters[dim]) return;
      if (_procFilters[dim].has(val)) _procFilters[dim].delete(val);
      else _procFilters[dim].add(val);
    }
    renderProcessingMode(container);
  });
});
```

Every CHARACTER pill is rendered with `data-strip-char` (line 4579):

```js
h += `<button class="... proc-filter-pill" data-filter-dim="chars" data-filter-val="${esc(char)}"
       data-strip-char="${esc(char)}"${stripPhase ? ` data-strip-phase="${esc(stripPhase)}"` : ''}>`;
```

`stripPhase` is the `phase` of the character's first pending action (line 4577-4578).
For Eve Lockridge, if her first pending action is phase `6` (Defence), then
`data-strip-phase="6"` is set. Clicking Eve — even to deselect her — triggers
the strip branch, which sets `_procFilters.phases = new Set(['6'])`. This makes
"6: Defence" appear active in the PHASE row, looking like a random cross-group click.

Because CHARACTER pills have both `data-strip-char` AND `data-filter-dim="chars"`
+ `data-filter-val`, removing the strip branch lets them fall through to the
standard toggle logic with no other changes needed.

---

## Fix

### T1 — Remove the strip-char branch; use standard toggle for all pills

**File:** `public/js/admin/downtime-views.js`

Replace the split click handler with the uniform toggle path:

```js
// BEFORE (lines 4916-4933):
container.querySelectorAll('.proc-filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.stripChar) {
      _procFilters.statuses    = new Set();
      _procFilters.chars       = new Set([btn.dataset.stripChar]);
      _procFilters.phases      = btn.dataset.stripPhase ? new Set([btn.dataset.stripPhase]) : new Set();
      _procFilters.territories = new Set();
      _procFilters.sources     = new Set();
    } else {
      const dim = btn.dataset.filterDim;
      const val = btn.dataset.filterVal;
      if (!dim || !val || !_procFilters[dim]) return;
      if (_procFilters[dim].has(val)) _procFilters[dim].delete(val);
      else _procFilters[dim].add(val);
    }
    renderProcessingMode(container);
  });
});
```

```js
// AFTER:
container.querySelectorAll('.proc-filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    const dim = btn.dataset.filterDim;
    const val = btn.dataset.filterVal;
    if (!dim || !val || !_procFilters[dim]) return;
    if (_procFilters[dim].has(val)) _procFilters[dim].delete(val);
    else _procFilters[dim].add(val);
    renderProcessingMode(container);
  });
});
```

The `data-strip-char` and `data-strip-phase` attributes on the rendered buttons
can be left in place (they are harmless and cost nothing to remove) — no
change to the rendering code (line 4579) is required.

---

### T2 — Source-pattern tests

**File:** `server/tests/fix.802.dt-queue-filter-btn-activate.test.js`

| # | Test | Assert |
|---|------|--------|
| AC1 | strip-char branch is gone | source does NOT contain `if (btn.dataset.stripChar)` in the proc-filter-pill handler |
| AC2 | all pills use uniform toggle | source contains single toggle block (`_procFilters[dim].has(val)`) without the strip-char conditional |
| AC3 | filter-clear handler is intact | source still contains `proc-filter-clear` click handler that resets all five filter sets |

Run with: `npx vitest run server/tests/fix.802.dt-queue-filter-btn-activate.test.js`

---

## Acceptance criteria

- [x] Given "Eve Lockridge" is active in CHARACTER filters, clicking it deactivates
  only Eve — no PHASE or other group changes state
- [x] Given any active filter pill in any group, clicking it toggles only that pill
- [x] Given no active filters, clicking a CHARACTER pill activates only that
  character (no other groups affected)
- [x] "Clear all" still resets all groups
- [x] 3/3 source-pattern tests passing

---

## Dev Agent Record

### Files changed

- `public/js/admin/downtime-views.js` — removed `if (btn.dataset.stripChar)` strip branch; all pills now use uniform toggle
- `server/tests/fix.802.dt-queue-filter-btn-activate.test.js` — 7 source-pattern tests, all passing
- `specs/stories/fix.802.dt-queue-filter-btn-activate.story.md` — this file

### Completion notes

Strip-char branch removed (8 lines → 4 lines). All `.proc-filter-pill` clicks now go through the same `_procFilters[dim].has/delete/add` toggle path. CHARACTER pills already had `data-filter-dim="chars"` and `data-filter-val` so they work correctly with no rendering changes. 7/7 tests green.

---

## Guardrails

- Only `public/js/admin/downtime-views.js` — the click handler block only.
- Do NOT change the rendering code at line 4579 (the `data-strip-char` attribute
  is harmless to leave on the button element).
- Do NOT change `_filterQueue` (line 4479) or any other filter logic.
- Do NOT change the `proc-filter-clear` handler.
- The `data-filter-dim` and `data-filter-val` attributes are already present on
  CHARACTER pills (line 4579) — they work correctly in the toggle branch.
