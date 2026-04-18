# Story DTX.2: Compact Panel for Binary Actions

Status: complete

## Story

As an ST processing downtimes,
I want merit, contact, and retainer actions in auto/blocked/fixed-effect mode to render a compact panel instead of the full dice-pool pipeline,
so that I can resolve binary decisions without navigating irrelevant pool builder controls.

## Acceptance Criteria

1. A merit action with `mode === 'auto'` renders the compact panel (no pool builder, no roll card, no validation status buttons, no second opinion button).
2. A merit action with `mode === 'blocked'` renders the compact panel.
3. A merit action with `formula === 'none'` renders the compact panel.
4. A merit action with `meritCategory === 'contacts'` renders the compact panel.
5. A merit action with `meritCategory === 'retainer'` renders the compact panel. (**Note:** the actual stored category value is `'retainer'` singular — the epic file says `'retainers'` but the `MERIT_MATRIX` and queue builder use `'retainer'`.)
6. Compact panel contains: action mode chip + effect text (existing `proc-merit-effect-panel`), automatic successes count (if `mode === 'auto'`), outcome toggle (`Approved` / `Partial` / `Failed`), ST notes textarea.
7. Outcome toggle saves `{ merit_outcome: value }` to `merit_actions_resolved[actionIdx]` via `saveEntryReview`.
8. ST notes textarea in the compact panel saves via the existing `proc-add-note-btn` mechanism (same as left panel — the textarea feeds into `notes_thread`).
9. Full-mode actions (`mode === 'instant'` / `mode === 'contested'` with `formula === 'dots2plus2'`) are unchanged — no compact panel.
10. No regression on any existing E2E tests.

## Dependency

**DTX-3 must be complete before implementing this story.** The compact panel includes an ST notes textarea, so the visual hierarchy (notes vs. feedback) must be settled first.

## Tasks / Subtasks

- [x] Task 1: Add `_isCompactMerit` helper (AC: 1–5)
  - [ ] In `public/js/admin/downtime-views.js`, add a helper function near the top of the merit rendering section (before `_renderMeritRightPanel` at line ~5184):

    ```js
    function _isCompactMerit(entry, mode, formula) {
      if (entry.source !== 'merit') return false;
      if (mode === 'auto' || mode === 'blocked') return true;
      if (formula === 'none') return true;
      if (entry.meritCategory === 'contacts') return true;
      if (entry.meritCategory === 'retainer') return true;
      return false;
    }
    ```

- [x] Task 2: Add `_renderCompactMeritPanel` function (AC: 6–8)
  - [ ] Add a new function `_renderCompactMeritPanel(entry, rev)` immediately before `_renderMeritRightPanel`:

    ```js
    function _renderCompactMeritPanel(entry, rev) {
      const key        = entry.key;
      const category   = entry.meritCategory || 'misc';
      const actionType = entry.actionType || 'misc';
      const matrixRow  = MERIT_MATRIX[category]?.[actionType] || null;
      const mode       = matrixRow?.mode || 'auto';
      const isAuto     = mode === 'auto';
      const isBlocked  = mode === 'blocked';
      const effect     = matrixRow?.effect || '';
      const effectAuto = matrixRow?.effectAuto || '';
      const dots       = entry.meritDots;
      const autoSucc   = isAuto && dots != null ? (dots * 2) + 2 : null;
      const outcome    = rev.merit_outcome || '';
      const thread     = rev.notes_thread || [];

      const MODE_LABELS = { instant: 'Instant', contested: 'Contested', auto: 'Automatic', blocked: 'Cannot' };

      let h = `<div class="proc-feed-right proc-compact-merit-panel" data-proc-key="${esc(key)}">`;

      // ── Effect panel (reuse existing) ──
      h += `<div class="proc-feed-mod-panel proc-merit-effect-panel" data-proc-key="${esc(key)}">`;
      h += `<div class="proc-merit-mode-row">`;
      h += `<span class="proc-mod-label">Action Mode</span>`;
      h += `<span class="proc-merit-mode-chip proc-merit-mode-${mode}">${MODE_LABELS[mode] || mode}</span>`;
      h += `</div>`;
      if (effect) {
        h += `<div class="proc-merit-effect-row"><span class="proc-mod-label">Effect</span><span class="proc-merit-effect-text">${esc(effect)}</span></div>`;
      }
      if (effectAuto) {
        h += `<div class="proc-merit-effect-row proc-merit-effect-auto"><span class="proc-mod-label">Auto</span><span class="proc-merit-effect-text">${esc(effectAuto)}</span></div>`;
      }
      h += `</div>`; // proc-merit-effect-panel

      // ── Automatic successes (auto mode only) ──
      if (isAuto && autoSucc !== null) {
        h += `<div class="proc-feed-mod-panel" data-proc-key="${esc(key)}">`;
        h += `<div class="proc-mod-panel-title">Automatic Successes</div>`;
        h += `<div class="proc-mod-row"><span class="proc-mod-label">Base successes</span><span class="proc-mod-static">${autoSucc}</span></div>`;
        h += `</div>`;
      }

      // ── Outcome toggle ──
      if (!isBlocked) {
        h += `<div class="proc-feed-mod-panel" data-proc-key="${esc(key)}">`;
        h += `<div class="proc-mod-panel-title">Outcome</div>`;
        h += `<div class="proc-merit-outcome-btns">`;
        for (const [val, label] of [['approved', 'Approved'], ['partial', 'Partial'], ['failed', 'Failed']]) {
          h += `<button class="proc-merit-outcome-btn${outcome === val ? ' active' : ''}" data-proc-key="${esc(key)}" data-outcome="${val}">${label}</button>`;
        }
        h += `</div>`;
        h += `</div>`;
      }

      // ── ST Notes quick-add ──
      h += `<div class="proc-feed-mod-panel" data-proc-key="${esc(key)}">`;
      h += `<div class="proc-mod-panel-title">ST Notes</div>`;
      h += `<div class="proc-note-add">`;
      h += `<textarea class="proc-note-textarea" data-proc-key="${esc(key)}" placeholder="Add ST note..." rows="3"></textarea>`;
      h += `<button class="dt-btn proc-add-note-btn" data-proc-key="${esc(key)}">Add</button>`;
      h += `</div>`;
      h += `</div>`;

      h += `</div>`; // proc-compact-merit-panel
      return h;
    }
    ```

- [x] Task 3: Branch in `_renderMeritRightPanel` (AC: 1–5, 9)
  - [ ] At the top of `_renderMeritRightPanel` (line ~5184), after the variable declarations (after `isBlocked` is computed), add an early-return branch:

    ```js
    // Early branch: compact panel for binary/fixed-effect actions
    if (_isCompactMerit(entry, mode, formula)) {
      return _renderCompactMeritPanel(entry, rev);
    }
    ```

  - [ ] Insert this after the `const isBlocked = mode === 'blocked';` line (~line 5203), so that `mode` and `formula` are already computed before the branch

- [x] Task 4: Wire outcome toggle event handler (AC: 7)
  - [ ] In the event wiring section, after the `.proc-second-opinion-btn` handler (~line 4626), add:

    ```js
    container.querySelectorAll('.proc-merit-outcome-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const key = btn.dataset.procKey;
        const entry = _getQueueEntry(key);
        if (!entry) return;
        const outcome = btn.dataset.outcome;
        await saveEntryReview(entry, { merit_outcome: outcome });
        renderProcessingMode(container);
      });
    });
    ```

- [x] Task 5: Add CSS for compact panel and outcome buttons (AC: 6)
  - [ ] In `public/css/admin-layout.css`, add after the proc-xref-callout block (or after `proc-note-textarea`):

    ```css
    /* DTX-2: compact merit panel */
    .proc-compact-merit-panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .proc-merit-outcome-btns {
      display: flex;
      gap: 6px;
    }

    .proc-merit-outcome-btn {
      flex: 1;
      padding: 6px 10px;
      background: var(--surf2);
      border: 1px solid var(--bdr);
      color: var(--txt1);
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      font-family: var(--ft);
      transition: background 0.15s;
    }

    .proc-merit-outcome-btn:hover {
      border-color: var(--gold2);
      color: var(--gold2);
    }

    .proc-merit-outcome-btn.active {
      background: var(--gold2);
      color: var(--bg);
      border-color: var(--gold2);
      font-weight: 600;
    }
    ```

- [x] Task 6: E2E tests (AC: 1–10)
  - [ ] Add 6 tests in a new `test.describe('DTX-2: Compact panel for binary actions')` block:
    1. Auto-mode merit action renders compact panel — `.proc-compact-merit-panel` present, `.proc-val-status` absent
    2. Blocked merit action renders compact panel
    3. Contacts category merit renders compact panel
    4. Retainer category merit renders compact panel
    5. Outcome toggle click saves `merit_outcome` and renders active state on correct button
    6. Full-mode merit (e.g., allies investigate) renders normal panel — `.proc-val-status` present, `.proc-compact-merit-panel` absent

## Dev Notes

### Compact Mode Trigger Logic

```
entry.source === 'merit'
AND (
  mode === 'auto'
  OR mode === 'blocked'
  OR formula === 'none'
  OR entry.meritCategory === 'contacts'
  OR entry.meritCategory === 'retainer'   ← singular, not 'retainers'
)
```

`mode` and `formula` come from `MERIT_MATRIX[category][actionType]` — computed at the top of `_renderMeritRightPanel`. The helper `_isCompactMerit(entry, mode, formula)` receives them after they are computed.

### MERIT_MATRIX Structure

```js
const MERIT_MATRIX = {
  contacts: {
    investigate: { poolFormula: 'contacts', mode: 'contested', ... },
    ...
  },
  retainer: {  // ← singular
    ...
  },
  allies: {
    investigate: { poolFormula: 'dots2plus2', mode: 'instant', ... },
    ...
  },
  ...
}
```

Look up: `MERIT_MATRIX[entry.meritCategory]?.[entry.actionType]` to get `mode` and `formula`.

### What `_renderMeritRightPanel` Currently Renders (Full Path)

The full right panel at line 5184 renders (in order):
1. `proc-merit-effect-panel` — action mode chip + effect text (keep in compact)
2. `if (isRolled)` Automatic Successes panel (keep in compact for `isAuto`)
3. `if (isRolled && actionType === 'investigate')` — Target Secrecy + Lead (moved to project panel by DTX-3/DTQ-3 — already removed)
4. `proc-proj-succ-panel` Success Modifier ticker (omit in compact)
5. `proc-proj-roll-card` Roll card (omit in compact)
6. `proc-feed-right-validation` Validation status buttons + Second Opinion (omit in compact)

The compact panel replaces items 4–6 with: Outcome toggle + ST notes quick-add.

### ST Notes in Compact Panel

The compact panel includes a `proc-note-textarea` + `proc-add-note-btn` using the exact same classes as the left panel note-add area. The existing `proc-add-note-btn` event handler (which saves to `notes_thread`) fires correctly for both — the handler keys on `btn.dataset.procKey` to look up the entry, so it works regardless of which panel the button is in. **Do not add a second handler.** The existing wiring covers it.

### New Field: `merit_outcome`

`merit_outcome` is a new field in `merit_actions_resolved[actionIdx]`. `saveEntryReview(entry, { merit_outcome: value })` merges it in via the existing spread pattern at line ~2239. No schema changes needed — MongoDB stores arbitrary fields.

Valid values: `'approved'` | `'partial'` | `'failed'` | `''` (unset).

### Category Value: `'retainer'` vs `'retainers'`

The epic spec says `meritCategory === 'retainers'` but the actual codebase (queue builder ~line 2051, `MERIT_MATRIX`) uses `'retainer'` (singular). Use `'retainer'` in `_isCompactMerit`. This is not a bug fix — just a correction from the spec to the real value.

### Insertion Point for Early Branch

```js
function _renderMeritRightPanel(entry, rev) {
  const key        = entry.key;
  const poolStatus = rev.pool_status || 'pending';
  const category   = entry.meritCategory || 'misc';
  const actionType = entry.actionType || 'misc';
  const dots       = entry.meritDots;
  const eqMod      = rev.pool_mod_equipment || 0;
  // ...
  const matrixRow  = MERIT_MATRIX[category]?.[actionType] || null;
  const formula    = matrixRow?.poolFormula || 'none';
  const mode       = matrixRow?.mode || 'instant';
  // ...
  const isBlocked  = mode === 'blocked';
  // ← INSERT EARLY BRANCH HERE (mode and formula are now defined)
  if (_isCompactMerit(entry, mode, formula)) return _renderCompactMeritPanel(entry, rev);
  // ... rest of full panel rendering ...
}
```

### Event Handler Wiring Location

Add the `.proc-merit-outcome-btn` handler near line 4626 (after `.proc-second-opinion-btn` handler). Pattern to follow:

```js
// proc-second-opinion-btn handler (~line 4616)
container.querySelectorAll('.proc-second-opinion-btn').forEach(btn => { ... });

// ← ADD AFTER:
container.querySelectorAll('.proc-merit-outcome-btn').forEach(btn => { ... });
```

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Added `_isCompactMerit(entry, mode, formula)` helper: triggers on `mode === 'auto'|'blocked'`, `formula === 'none'`, `meritCategory === 'contacts'|'retainer'`. Inserted before `_renderMeritRightPanel`.
- Added `_renderCompactMeritPanel(entry, rev)`: renders effect panel, auto successes (when `isAuto && dots != null`, using `dots` as count), Approved/Partial/Failed outcome toggle (omitted when `isBlocked`), ST notes quick-add textarea using existing `proc-note-textarea` / `proc-add-note-btn` classes (no new handler needed — existing note-add wiring covers it).
- Early-return branch added to `_renderMeritRightPanel` after `isBlocked` is computed (line ~5302): `if (_isCompactMerit(entry, mode, formula)) return _renderCompactMeritPanel(entry, rev);`
- `.proc-merit-outcome-btn` click handler wired after second-opinion handler (~line 4628): saves `{ merit_outcome: btn.dataset.outcome }` via `saveEntryReview`, triggers `renderProcessingMode`.
- CSS added to `admin-layout.css`: `.proc-compact-merit-panel` flex column, `.proc-merit-outcome-btns` flex row, `.proc-merit-outcome-btn` with gold active state.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `tests/downtime-processing-dt-fixes.spec.js`
- `specs/stories/dtx.2.compact-panel-binary-actions.story.md`
