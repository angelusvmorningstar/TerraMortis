# Story feature.310: DT Processing — Confirmed Ribbon Redesign

## Status: review

---

## Metadata

```yaml
issue: 310
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/310
branch: morningstar-issue-310-dt-confirmed-ribbon-redesign
```

---

## Story

**As an** ST processing downtimes,
**I want** the pool progress steps labelled Pending / Confirmed / Rolled with a "Confirm Dice Pool" button and "Roll Dice Pool" button in the Roll card,
**so that** the workflow is unambiguous and there is a deliberate one-click action to confirm a pool before rolling, while still allowing direct roll from Pending as a shortcut.

---

## Background

Feature.96 (#308) replaced the Committed/Rolled clickable buttons with a read-only ribbon. This left a gap: the ribbon showed "Committed" as a step but there was no way to advance to it. After reviewing the design with the ST team:

- The intermediate step is renamed `committed` → `confirmed` (both the DB value and the label).
- A "Confirm Dice Pool" button is added inside the Roll card, visible from `pending`.
- The "Roll" button label becomes "Roll Dice Pool".
- The "Pending" button is removed from the Validation Status row — Clear Pool is the only reset path.
- Rolling directly from `pending` remains valid (shortcut that skips Confirm).

**Status flow after this story:**

| `pool_status` | Ribbon active step | Confirm button | Roll Dice Pool button |
|---|---|---|---|
| `pending` | **Pending** | Visible | Visible |
| `confirmed` | **Confirmed** | Hidden | Visible |
| `rolled` | **Rolled** | Hidden | Visible (re-roll) |
| terminal | Hidden | Hidden | Hidden |

---

## Acceptance Criteria

1. `'committed'` → `'confirmed'` everywhere as a `pool_status` value in JS code and CSS classes.
2. Ribbon label shows "Confirmed" (not "Committed") when that step is active.
3. No "Pending" button in the Validation Status button row for any of the 4 pool-builder action types.
4. "Confirm Dice Pool" button renders inside the Roll card when `pool_status === 'pending'`; absent when `'confirmed'`, `'rolled'`, or terminal.
5. Clicking "Confirm Dice Pool" saves the builder expression to `pool_validated`, sets `pool_status: 'confirmed'`, sets `pool_confirmed_by: stName`.
6. For feeding entries, clicking "Confirm Dice Pool" also snapshots the vitae tally to `feeding_vitae_tally` (mirrors the old Committed button logic).
7. "Roll Dice Pool" button label (first roll) replaces the plain "Roll" label. Re-roll label stays "Re-roll".
8. "Roll Dice Pool" button is visible from `pending` AND `confirmed` AND `rolled` (no regression).
9. "Clear Pool" resets `pool_validated`, `pool_status: 'pending'`, and `pool_confirmed_by: ''` in one save.
10. Pool roll handlers (`proc-feed-roll-btn`, `proc-proj-roll-btn`) advance `pool_status → 'rolled'` when current status is `pending` OR `confirmed` (previously only checked for `pending`/`committed`).
11. DB migration script updates any existing `pool_status: 'committed'` records in `entry_reviews` to `'confirmed'`.
12. All feature.96 E2E tests updated: `'committed'` → `'confirmed'`, "Committed" label checks → "Confirmed", tests for Pending button absence, tests for "Confirm Dice Pool" and "Roll Dice Pool" buttons.

---

## Tasks / Subtasks

### [x] Task 1: Rename `committed` → `confirmed` in `_renderStatusRibbon`

**File:** `public/js/admin/downtime-views.js`, line 6642

```js
// BEFORE:
const steps = [['pending', 'Pending'], ['committed', 'Committed'], ['rolled', 'Rolled']];

// AFTER:
const steps = [['pending', 'Pending'], ['confirmed', 'Confirmed'], ['rolled', 'Rolled']];
```

### [x] Task 2: Update ribbon guard conditions at the 4 call sites

Each of the 4 call sites has `['pending', 'committed', 'rolled'].includes(poolStatus)`. Change `'committed'` → `'confirmed'` at all four:

- **Merit non-auto** — line 6902: `if (!isAuto && ['pending', 'confirmed', 'rolled'].includes(poolStatus))`
- **Sorcery** — line 6967: `if (['pending', 'confirmed', 'rolled'].includes(poolStatus))`
- **Project** — line 7108: `if (['pending', 'confirmed', 'rolled'].includes(poolStatus))`
- **Feeding** — line 7357: `if (['pending', 'confirmed', 'rolled'].includes(poolStatus))`

### [x] Task 3: Remove "Pending" button from the 4 call sites

Each `_renderValStatusButtons(...)` call currently includes `['pending', 'Pending']`. Remove it from all four.

**Merit non-auto** (line 6901, variable `meritBtns`):
```js
// BEFORE:
const meritBtns = [['pending', 'Pending'], ['resolved', 'Validated'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']];

// AFTER:
const meritBtns = [['resolved', 'Validated'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']];
```

**Sorcery** (line 6968):
```js
// BEFORE:
h += _renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['resolved', 'Resolved'], ['no_effect', 'No Effect'], ['skipped', 'Skip']]);

// AFTER:
h += _renderValStatusButtons(key, poolStatus, [['resolved', 'Resolved'], ['no_effect', 'No Effect'], ['skipped', 'Skip']]);
```

**Project** (line 7109):
```js
// BEFORE:
h += _renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['validated', 'Validated'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']]);

// AFTER:
h += _renderValStatusButtons(key, poolStatus, [['validated', 'Validated'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']]);
```

**Feeding** (line 7358):
```js
// BEFORE:
h += _renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['validated', 'Validated'], ['no_feed', 'No Valid Feeding']]);

// AFTER:
h += _renderValStatusButtons(key, poolStatus, [['validated', 'Validated'], ['no_feed', 'No Valid Feeding']]);
```

### [x] Task 4: Add "Confirm Dice Pool" button + rename "Roll" in `_renderRollCard`

**File:** `public/js/admin/downtime-views.js`, function `_renderRollCard` at line 7433.

**4a.** Add `showConfirm = false` and `confirmKey = ''` to the opts destructure (line ~7434):
```js
const {
  btnClass        = 'proc-proj-roll-btn',
  btnDataAttrs    = '',
  canRoll         = true,
  noRollMsg       = 'No roll available',
  targetSuccesses = null,
  successModifier = 0,
  contestedRoll   = null,
  showConfirm     = false,   // NEW: show Confirm Dice Pool button
} = opts;
```

**4b.** Inside the `if (canRoll)` block (line ~7450), add the Confirm button BEFORE the Roll button, and rename "Roll" to "Roll Dice Pool":
```js
if (canRoll) {
  if (showConfirm) {
    h += `<button class="dt-btn proc-confirm-pool-btn" data-proc-key="${esc(key)}">Confirm Dice Pool</button>`;
  }
  const btnLabel = roll ? 'Re-roll' : 'Roll Dice Pool';
  h += `<button class="dt-btn ${esc(btnClass)}" data-proc-key="${esc(key)}"${btnDataAttrs}>${btnLabel}</button>`;
  // ... rest unchanged
```

### [x] Task 5: Pass `showConfirm` to the Project and Feeding roll card calls

**Project** — lines 7134–7141. The `poolStatus` variable is in scope at this point:
```js
// BEFORE:
h += _renderRollCard(key, projRoll, null, {
  btnClass:        'proc-proj-roll-btn',
  btnDataAttrs:    ` data-pool-validated="${esc(poolValidated)}"`,
  canRoll:          showRollBtn,
  noRollMsg:       'Validate pool first',
  successModifier:  succMod,
  contestedRoll:    rev.contested_roll || null,
});

// AFTER:
h += _renderRollCard(key, projRoll, null, {
  btnClass:        'proc-proj-roll-btn',
  btnDataAttrs:    ` data-pool-validated="${esc(poolValidated)}"`,
  canRoll:          showRollBtn,
  noRollMsg:       'Validate pool first',
  successModifier:  succMod,
  contestedRoll:    rev.contested_roll || null,
  showConfirm:      poolStatus === 'pending',
});
```

**Feeding** — lines 7381–7386. The `poolStatus` variable is in scope (line 7354):
```js
// BEFORE:
h += _renderRollCard(key, feedRollObj, null, {
  btnClass:  'proc-feed-roll-btn',
  btnDataAttrs: ` data-sub-id="${esc(entry.subId)}" data-rote="${isRote}"`,
  canRoll:   showFeedRollBtn,
  noRollMsg: 'Commit pool first',
});

// AFTER:
h += _renderRollCard(key, feedRollObj, null, {
  btnClass:     'proc-feed-roll-btn',
  btnDataAttrs: ` data-sub-id="${esc(entry.subId)}" data-rote="${isRote}"`,
  canRoll:      showFeedRollBtn,
  noRollMsg:    'Confirm pool first',
  showConfirm:  poolStatus === 'pending',
});
```

Note: also update `noRollMsg` from `'Commit pool first'` to `'Confirm pool first'` on the feeding call.

### [x] Task 6: Wire `.proc-confirm-pool-btn` click handler

Add immediately after the `.proc-pool-clear-btn` handler block (after line 4757):

```js
// Wire confirm pool button — saves pool expr and advances to confirmed status
container.querySelectorAll('.proc-confirm-pool-btn').forEach(btn => {
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    const key   = btn.dataset.procKey;
    const entry = _getQueueEntry(key);
    if (!entry) return;

    const user   = getUser();
    const stName = user?.global_name || user?.username || 'ST';
    const patch  = { pool_status: 'confirmed', pool_confirmed_by: stName };

    // Read builder expression if not already saved
    let poolExpr = getEntryReview(entry)?.pool_validated || '';
    if (!poolExpr) {
      const builderEl = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
      if (builderEl) poolExpr = _readBuilderExpr(builderEl) || '';
    }
    if (poolExpr) {
      const rpanel     = container.querySelector(`.proc-feed-right[data-proc-key="${key}"]`);
      const _naV       = rpanel?.querySelector('.proc-proj-9a')?.checked  || false;
      const _8aV       = rpanel?.querySelector('.proc-proj-8a')?.checked  || false;
      patch.pool_validated = poolExpr;
      patch.nine_again     = _naV;
      patch.eight_again    = _8aV;
      if (entry.source === 'project') {
        patch.rote = rpanel?.querySelector('.proc-pool-rote')?.checked || false;
      }
    }

    // For feeding: snapshot vitae tally on confirm
    if (entry.source === 'feeding') {
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

    await saveEntryReview(entry, patch);
    renderProcessingMode(container);
  });
});
```

### [x] Task 7: Update Clear Pool handler to fully reset state

**File:** `public/js/admin/downtime-views.js`, line 4754.

```js
// BEFORE:
await saveEntryReview(entry, { pool_validated: '' });

// AFTER:
await saveEntryReview(entry, { pool_validated: '', pool_status: 'pending', pool_confirmed_by: '' });
```

### [x] Task 8: Update Roll handlers for `confirmed` status

**Feed roll handler** (~line 5209–5212):
```js
// BEFORE:
const cur = getEntryReview(entry)?.pool_status || 'pending';
if (cur === 'pending' || cur === 'committed') {
  await saveEntryReview(entry, { pool_status: 'rolled' });
}

// AFTER:
const cur = getEntryReview(entry)?.pool_status || 'pending';
if (cur === 'pending' || cur === 'confirmed') {
  await saveEntryReview(entry, { pool_status: 'rolled' });
}
```

**Project roll handler** (~line 5298–5301): same pattern:
```js
// BEFORE:
const cur = getEntryReview(entry)?.pool_status || 'pending';
if (cur === 'pending' || cur === 'committed') {
  await saveEntryReview(entry, { pool_status: 'rolled' });
}

// AFTER:
const cur = getEntryReview(entry)?.pool_status || 'pending';
if (cur === 'pending' || cur === 'confirmed') {
  await saveEntryReview(entry, { pool_status: 'rolled' });
}
```

**Feed roll handler builder-fallback save** (line 5166):
```js
// BEFORE:
await saveEntryReview(entry, { pool_validated: builtExpr, nine_again: _naV, eight_again: _8aV, pool_committed_by: _stName });

// AFTER:
await saveEntryReview(entry, { pool_validated: builtExpr, nine_again: _naV, eight_again: _8aV, pool_confirmed_by: _stName });
```

**Project roll handler builder-fallback save** (line 5272):
```js
// BEFORE:
await saveEntryReview(entry, { pool_validated: builtExpr, nine_again: _naV, rote: _roteV, eight_again: _8aV, pool_committed_by: _stName });

// AFTER:
await saveEntryReview(entry, { pool_validated: builtExpr, nine_again: _naV, rote: _roteV, eight_again: _8aV, pool_confirmed_by: _stName });
```

### [x] Task 9: Clean up dead code in the `proc-val-btn` click handler

**File:** `public/js/admin/downtime-views.js`, lines 4678–4707.

`'committed'` can no longer be clicked via a val button (the Confirm button uses its own class). Remove dead code:

```js
// BEFORE (lines 4679–4684):
if (['validated', 'committed', 'resolved'].includes(status)) {
  const user = getUser();
  const stName = user?.global_name || user?.username || 'ST';
  if (status === 'validated')  statusPatch.pool_validated_by  = stName;
  if (status === 'committed')  statusPatch.pool_committed_by  = stName;
  if (status === 'resolved')   statusPatch.pool_resolved_by   = stName;
}

// AFTER:
if (['validated', 'resolved'].includes(status)) {
  const user = getUser();
  const stName = user?.global_name || user?.username || 'ST';
  if (status === 'validated')  statusPatch.pool_validated_by  = stName;
  if (status === 'resolved')   statusPatch.pool_resolved_by   = stName;
}
```

Also remove the old committed-vitae-snapshot block (~lines 4688–4707) — this logic now lives in the Confirm button handler (Task 6):

```js
// REMOVE entirely:
// When committing a feeding pool, persist the vitae tally...
if (status === 'committed' && entry.source === 'feeding') {
  ...
}
```

### [x] Task 10: Update CSS — rename `committed` class to `confirmed`

**File:** `public/css/admin-layout.css`

Line 4975 (dark theme active state):
```css
/* BEFORE: */
.proc-ribbon-step.ribbon-active.committed { border-color: var(--gold2); color: var(--gold2); }

/* AFTER: */
.proc-ribbon-step.ribbon-active.confirmed { border-color: var(--gold2); color: var(--gold2); }
```

Line 6213 (parchment theme override):
```css
/* BEFORE: */
html:not([data-theme="dark"]) .proc-ribbon-step.ribbon-active.committed { border-color: var(--story-compl); color: var(--story-compl); }

/* AFTER: */
html:not([data-theme="dark"]) .proc-ribbon-step.ribbon-active.confirmed { border-color: var(--story-compl); color: var(--story-compl); }
```

### [x] Task 11: Write DB migration script

**New file:** `server/scripts/migrate-pool-status-committed-to-confirmed.js`

Pattern follows other scripts in that folder (ES modules, `dotenv/config`, direct MongoDB driver).

```js
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');

const result = await db.collection('entry_reviews').updateMany(
  { pool_status: 'committed' },
  { $set: { pool_status: 'confirmed' }, $rename: { pool_committed_by: 'pool_confirmed_by' } }
);

console.log(`Updated ${result.modifiedCount} entry_review records.`);
await client.close();
```

Note: `$rename` and `$set` can be combined in a single `updateMany` call. Run this AFTER deploying the code changes, not before.

### [x] Task 12: Update E2E tests in `tests/downtime-processing-feature96.spec.js`

All `'committed'` string literals → `'confirmed'`. All `"Committed"` label checks → `"Confirmed"`. Specific changes:

1. **F96-1 ribbon tests**: `.proc-ribbon-step.ribbon-active.committed` → `.proc-ribbon-step.ribbon-active.confirmed`; label assertion `"Committed"` → `"Confirmed"`.
2. **F96-2 button-absent tests**: The Pending button is now also absent — add assertions that `.proc-val-btn[data-status="pending"]` has count 0 alongside the existing confirmed/rolled absent checks.
3. **F96-4 Roll from pending tests**: The roll button label is now `"Roll Dice Pool"` — update label assertions if any.
4. **F96-5 / F96-6**: Update any `pool_committed_by` references to `pool_confirmed_by` in mock response checks.
5. Add a new test group **F96-7: Confirm button** — verify `.proc-confirm-pool-btn` is visible when poolStatus is `pending`, hidden when `confirmed`, hidden when terminal.

---

## Dev Notes

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | Tasks 1–9: ribbon rename, no Pending button, Confirm button, Roll rename, Clear Pool reset, roll handler updates, dead code removal |
| `public/css/admin-layout.css` | Task 10: CSS class rename |
| `server/scripts/migrate-pool-status-committed-to-confirmed.js` | Task 11: new migration script |
| `tests/downtime-processing-feature96.spec.js` | Task 12: test updates |

### Where each `'committed'` reference lives

| Line | Context | Change |
|------|---------|--------|
| 6642 | `_renderStatusRibbon` step definition | `'committed'` → `'confirmed'` |
| 6902, 6967, 7108, 7357 | Ribbon guard conditions | `'committed'` → `'confirmed'` |
| 4679 | `proc-val-btn` click handler includes array | Remove `'committed'` entirely |
| 4683 | `pool_committed_by` assignment | Remove entirely |
| 4690 | Committed feeding vitae snapshot | Remove block entirely |
| 5166 | Feed roll handler builder fallback | `pool_committed_by` → `pool_confirmed_by` |
| 5210 | Feed roll pool_status advance check | `'committed'` → `'confirmed'` |
| 5272 | Project roll handler builder fallback | `pool_committed_by` → `pool_confirmed_by` |
| 5299 | Project roll pool_status advance check | `'committed'` → `'confirmed'` |
| 7133 | `showRollBtn` | `poolStatus === 'committed'` → `poolStatus === 'confirmed'` |
| 7380 | `showFeedRollBtn` | `poolStatus === 'committed'` → `poolStatus === 'confirmed'` |
| CSS 4975 | `.ribbon-active.committed` | → `.ribbon-active.confirmed` |
| CSS 6213 | parchment `.ribbon-active.committed` | → `.ribbon-active.confirmed` |

### Confirm button wiring location

The `.proc-confirm-pool-btn` handler goes immediately after the `.proc-pool-clear-btn` handler block, which ends at line 4757. Insert after line 4757, before line 4759 (the feeding description card event wires).

### `_renderRollCard` receives `canRoll` from caller — check the feeding `showFeedRollBtn` and project `showRollBtn` conditions

Both currently include `poolStatus === 'committed'`. Update to `poolStatus === 'confirmed'`:

- Line 7133: `poolStatus === 'committed'` → `poolStatus === 'confirmed'`
- Line 7380: `poolStatus === 'committed'` → `poolStatus === 'confirmed'`

These are NOT covered by the "each `committed` reference" table above — easy to miss. Do not forget them.

### Vitae tally fields passed to `proc-feed-vitae-panel`

The `data-*` attributes read in the Confirm handler are the same as the old committed-click block (lines 4693–4701). They are `data-herd`, `data-ambience`, `data-terr-label`, `data-oof`, `data-ghouls`, `data-rite-cost`, `data-manual`, `data-total-bonus`. These attribute names are set elsewhere in the rendering code; do not change them.

### Sorcery roll card — no Confirm button

The sorcery roll card (line 6957) passes `canRoll = !!ritInfo` — not poolStatus-based. Sorcery pools are auto-computed, not ST-built. Do NOT add `showConfirm` to the sorcery call. Leave it unchanged.

### Merit non-auto — no dedicated roll card in this render path

The merit compact panel (`_renderCompactMeritPanel`) does not call `_renderRollCard`. Merit rolls (if applicable) use `.proc-merit-roll-btn` (line 5307), which is a separate auto-computed pool mechanism. The merit section only needs Tasks 2–3 (ribbon guard + remove Pending button). No Confirm button for merits.

### `pool_confirmed_by` field is new — no migration concern for the field name

Only `pool_status: 'committed'` values need migration. The `pool_committed_by` field in old records can stay as-is (it's a name string, not a status gate). The migration script renames it using `$rename` for completeness, but it is not functionally required.

### Clear Pool must reset `pool_status` explicitly

Currently (line 4754) Clear Pool only clears `pool_validated`. Without an explicit `pool_status: 'pending'` in the patch, a confirmed or rolled entry would clear its pool expression but stay at `confirmed`/`rolled` on the ribbon — wrong. The fix in Task 7 resets all three fields atomically.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
All 12 tasks implemented. Key decisions: (1) "Not yet committed" placeholder text updated to "Not yet confirmed" (missed in task scope but caught during final grep sweep). (2) Internal CSS class names `.proc-feed-committed-pool`, `.proc-pool-committed`, `.proc-pool-committed-badge` intentionally left unchanged — these are visual lock-state selectors, not pool_status data values, and renaming them would require coordinated JS+CSS changes with no functional benefit. (3) Light-theme `.proc-val-status button.active.committed` (line 6209) was missed in the initial sweep but caught during final CSS verification pass. All 39 E2E tests pass (34 original + 5 new F96-7 Confirm Dice Pool tests).

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `server/scripts/migrate-pool-status-committed-to-confirmed.js`
- `tests/downtime-processing-feature96.spec.js`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-14 | 1.0 | Created from issue #310 and conversation scope | BMAD SM |
| 2026-05-14 | 1.1 | All 12 tasks implemented; 39/39 E2E tests passing | claude-sonnet-4-6 |
