# Story proto.1: DT Processing — Filter Engine

Status: review

## Story

As an ST,
I want a filter engine in the DT processing queue,
so that I can narrow the action list by status, character, phase, and territory without losing orientation of the full queue structure.

## Acceptance Criteria

1. `procHideDone` flag, its button, and its click handler are fully removed.
2. A `_procFilters` module-level object exists with four `Set` properties: `statuses`, `chars`, `phases`, `territories`. All sets start empty.
3. A `_entryTerritories(entry)` helper returns a `Set` of territory name strings for an entry, drawn from `entry.primaryTerr`, `entry.projTerritory`, and all keys of `entry.feedTerrs`.
4. A `_filterQueue(queue)` helper returns the full queue unchanged when all four sets are empty; otherwise filters by AND across dimensions, OR within each dimension. Status dimension uses `_deriveActionRibbonState(review)` to map each entry to `'pending'`, `'valid'`, or `'complete'`. Territory dimension passes if any of the entry's territories intersect the active set.
5. Inside `renderProcessingMode`, `_filterQueue` is applied to the full queue before the phase loop. The `byPhase` map is still built from the **full** queue so all phases appear in their natural order.
6. Within the phase loop, `visibleEntries` for each phase is derived from the filtered queue (not from `procHideDone` logic). When any filter is active and a phase has zero visible entries, the phase section renders with class `proc-phase-filtered-out`: header stays visible, forced collapsed, not clickable. When no filters are active, all phases render normally.
7. The progress counter (`_totalDone / _totalCount`) and the character strip both read from the **full** unfiltered queue.
8. Manually hardcoding a test filter (e.g. `_procFilters.chars.add('Alice')` before render) correctly narrows the queue while leaving other phases visible but greyed.

## Tasks / Subtasks

- [x] Remove `procHideDone` (AC: 1)
  - [x] Delete declaration at line 71
  - [x] Remove button HTML at line 4459 (`proc-hide-done-btn` / `proc-hide-done-toggle`)
  - [x] Remove click handler block (~lines 4579–4582)
  - [x] Remove the `visibleEntries` / `procHideDone` filter logic at lines 4482–4485 (will be replaced in a later task)

- [x] Add `_procFilters` state (AC: 2)
  - [x] Add alongside the other module-level `proc*` vars (near line 71):
    ```js
    let _procFilters = {
      statuses:    new Set(),
      chars:       new Set(),
      phases:      new Set(),
      territories: new Set(),
    };
    ```

- [x] Add `_entryTerritories(entry)` helper (AC: 3)
  - [x] Place near the other `_entry*` helpers in the file
  - [x] Returns a `Set<string>` — union of `entry.primaryTerr`, `entry.projTerritory`, and `Object.keys(entry.feedTerrs || {})`

- [x] Add `_filterQueue(queue)` helper (AC: 4)
  - [x] Short-circuit: if all four sets are empty, return `queue` unchanged
  - [x] Status check: `_deriveActionRibbonState(getEntryReview(e))` must be in `_procFilters.statuses`
  - [x] Char check: `e.charName` must be in `_procFilters.chars`
  - [x] Phase check: `e.phase` (the string key, e.g. `'feeding'`) must be in `_procFilters.phases`
  - [x] Territory check: at least one territory from `_entryTerritories(e)` must be in `_procFilters.territories`

- [x] Wire filter into `renderProcessingMode` (AC: 5, 6, 7)
  - [x] After `buildProcessingQueue`, call `const filteredQueue = _filterQueue(queue)`
  - [x] Keep `byPhase` built from full `queue`
  - [x] In the phase loop, compute: `const visibleEntries = filteredQueue.filter(e => e.phase === phaseKey)`
  - [x] Determine: `const isGreyedOut = _anyFilterActive() && visibleEntries.length === 0`
  - [x] Add helper `_anyFilterActive()` (returns true if any set is non-empty)
  - [x] Render `proc-phase-section` with `proc-phase-filtered-out` class when greyed out
  - [x] When greyed out: force `isExpanded = false`, skip body render
  - [x] Progress counter (`_totalDone`, `_totalCount`) and `renderCharacterStrip(queue)` remain on full `queue`

- [x] Add CSS for `proc-phase-filtered-out` (AC: 6)
  - [x] In `public/css/admin-layout.css`, add:
    ```css
    .proc-phase-filtered-out .proc-phase-header {
      opacity: 0.38;
      cursor: default;
      pointer-events: none;
    }
    ```

- [x] Smoke test on proto (AC: 8)
  - [x] Temporarily hardcoded `_procFilters.chars.add('Alice Vunder')` — parse clean, logic verified
  - [x] Removed hardcoded value before commit

## Dev Notes

### Key file
- `public/js/admin/downtime-views.js` — single file for all changes. 11,530 lines; be precise with line references.

### Things being retired
| Item | Location | Action |
|---|---|---|
| `let procHideDone = false` | line 71 | Delete |
| Button HTML (`proc-hide-done-btn`) | line 4459 | Delete |
| `visibleEntries` / hide-done filter | lines 4482–4485 | Replace with `_filterQueue` wiring |
| Click handler for `proc-hide-done-toggle` | ~lines 4579–4582 | Delete |

### Entry shape — fields used by filter engine
```
entry.charName        — string, always present
entry.phase           — string key: 'feeding', 'resolve_first', 'ambience', etc. (from PHASE_NUM_TO_LABEL)
entry.primaryTerr     — string | '' (feeding: highest-priority territory)
entry.projTerritory   — string | '' (project entries)
entry.feedTerrs       — object | undefined (feeding: { territoryName: relationship })
```

### Three-state status mapping
`_deriveActionRibbonState(rev)` already exists at line 7832:
- `'pending'` — `pool_status` not set
- `'valid'`   — `pool_status` in `DONE_STATUSES`, but no narrative yet
- `'complete'` — `pool_status` in `DONE_STATUSES` AND has `player_facing_note` or `story_context`

Use this directly — do not reimplement the logic.

### Phase key strings (entry.phase)
Phase keys come from `PHASE_NUM_TO_LABEL` (lines 144–161). Relevant ones:
`'resolve_first'`, `'feeding'`, `'joint'`, `'ambience'`, `'hide_protect'`, `'investigate'`, `'attack'`, `'support_patrol'`, `'misc'`, `'allies'`, `'status'`, `'retainers'`, `'contacts'`, `'resources_retainers'`, `'other_merit'`, `'resources'`

### CSS — match existing patterns
- Check `public/css/admin-layout.css` for existing `.proc-phase-*` rules before adding
- Use CSS custom property `--text-muted` or `opacity` for greying — do not introduce bare colour values
- Token system is enforced: zero bare hex in rule bodies (see CLAUDE.md)

### Prototype surface
- Entry point: `http://localhost:8080/dt-proto.html`
- Fake data lives in gitignored `public/dt-proto-data/` (characters, cycles, submissions, territories JSON)
- Proto uses the same `downtime-views.js` as production — changes here affect both
- The proto has real character names in `characters.json`; use one of those for the smoke test

### This story does NOT include
- Filter bar UI (pills, click handlers) — that is proto.2
- Character strip click → filter shortcut — that is proto.3
- Any changes to `public/js/admin.js` or `public/js/app.js`

### References
- `procHideDone` declaration: `downtime-views.js` line 71
- `renderProcessingMode`: `downtime-views.js` lines 4402–4550
- `_deriveActionRibbonState`: `downtime-views.js` line 7832
- `_renderPhaseHeader`: `downtime-views.js` line 823
- `DONE_STATUSES`: `downtime-views.js` line 281
- `PHASE_NUM_TO_LABEL`: `downtime-views.js` lines 144–161
- `PHASE_LABELS`: `downtime-views.js` lines 122–141

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Retired `procHideDone` flag, button, and click handler entirely
- Added `_procFilters` module-level state object (four empty Sets)
- Added `_anyFilterActive()`, `_entryTerritories(entry)`, `_filterQueue(queue)` helpers after `_getQueueEntry`
- `filteredQueue` derived immediately after `_procQueueMap` assignment in `renderProcessingMode`
- Phase loop now uses `effectiveCollapsed` (forced true when greyed out) to skip body render
- CSS `.proc-phase-filtered-out .proc-phase-header` added after deleted-section rules
- Parse verified clean; smoke test with Alice Vunder confirmed filter logic correct

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
