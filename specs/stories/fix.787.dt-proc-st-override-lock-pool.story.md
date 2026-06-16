---
title: 'DT proc: ST Override locks current builder selection into pool_validated'
type: 'fix'
issue: 787
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/787
branch: ms/issue-787-dt-proc-st-override-lock-pool
created: '2026-06-16'
status: review
recommended_model: 'sonnet — single handler change, one render site read'
context:
  - public/js/admin/downtime-views.js
---

## Intent

When an ST manually changes the Dice Pool Builder dropdowns (attr/skill/disc) and then
clicks "ST Override", the panel re-renders with the player's original pool instead of
the ST's selection. This is the opposite of the intended behaviour.

The fix is a two-line change inside the existing roll-mode click handler.

---

## Root cause (do NOT re-investigate)

### How dropdown pre-population works at render time

`renderProcessingMode` re-renders the full panel on every state change. The dropdown
pre-population logic (lines 9247-9256 in downtime-views.js) runs in this priority order:

1. If `rev.pool_validated` is set → parse it with `_parsePoolExpr` → use those
   attr/skill/disc values to pre-select the dropdowns.
2. Else if player submission responses exist → use player's submitted pool fields
   (`project_N_pool_attr`, `project_N_pool_skill`, `project_N_pool_disc`).

### What the ST Override button actually saves

The roll-mode click handler (lines 5370-5395) is shared by all three buttons: Player
Pool, ST Override, No Roll Needed. When any button is clicked it saves only
`{ roll_mode: <mode> }` (plus `pool_status` advances in some cases) then calls
`renderProcessingMode(container)`.

**The handler never writes `pool_validated`.** So when the re-render runs after
"ST Override" is clicked, `rev.pool_validated` is still empty (or has a stale value
from a prior session), and the dropdowns fall back to priority-2: the player's
submitted pool. This is why the dropdowns reset.

### Fix

In the roll-mode handler, when `mode === 'st_override'`:
- Read the current builder dropdowns with `_readBuilderExpr(builderEl)` (already
  exists, used in roll-dice and confirm-pool handlers).
- Include `pool_validated: expr` in the save patch.

When `mode === 'player'`:
- Clear `pool_validated: ''` so the re-render falls back to the player's submitted
  values (priority-2 path).

No other files need changing. No new helpers needed.

---

## Fix specification

### T1 — Update the roll-mode click handler (single site)

**File:** `public/js/admin/downtime-views.js`
**Location:** lines 5370-5395 — the `'.proc-roll-mode-btn'` click handler.

```js
// BEFORE (current — only saves roll_mode):
const patch = { roll_mode: mode };
if (mode === 'no_roll') {
  patch.pool_status = 'no_roll';
} else if ((mode === 'player' || mode === 'st_override') && hasPool && !rev.roll) {
  patch.pool_status = 'validated';
}
await saveEntryReview(entry, patch);
renderProcessingMode(container);

// AFTER:
const patch = { roll_mode: mode };
if (mode === 'no_roll') {
  patch.pool_status = 'no_roll';
} else if ((mode === 'player' || mode === 'st_override') && hasPool && !rev.roll) {
  patch.pool_status = 'validated';
}
if (mode === 'st_override') {
  const builderEl = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
  if (builderEl) {
    const expr = _readBuilderExpr(builderEl);
    if (expr) patch.pool_validated = expr;
  }
} else if (mode === 'player') {
  patch.pool_validated = '';
}
await saveEntryReview(entry, patch);
renderProcessingMode(container);
```

### What `_readBuilderExpr` returns

`_readBuilderExpr(builder)` (line 6885) reads the `.proc-pool-attr`, `.proc-pool-skill`,
`.proc-pool-disc`, and `.proc-pool-mod-val` elements from the builder DOM, then calls
`_buildPoolExpr` to produce a human-readable string like `"Wits 2 + Computer 0 = -1"`.
Returns `null` if attr or skill are not selected.

The `if (expr)` guard handles the null case — if the ST hasn't selected an attr+skill
yet, no `pool_validated` key is written and the save is a normal mode-only save.

### Why Player Pool clears pool_validated

Without clearing `pool_validated`, if the ST clicks ST Override (writes pool_validated),
then clicks Player Pool, the re-render still uses the saved pool_validated (priority-1)
instead of the player's submitted values. Clearing it restores priority-2 (player's
original pool fields).

---

## Acceptance criteria

- [ ] **AC-1** ST selects Wits + Computer in the builder, clicks ST Override → re-render
      shows Wits + Computer in the dropdowns (not the player's original Manipulation +
      Subterfuge).
- [ ] **AC-2** After clicking ST Override, refreshing the page still shows the ST's
      chosen pool (because `pool_validated` is persisted to DB).
- [ ] **AC-3** Clicking Player Pool after ST Override reverts the dropdowns to the
      player's submitted values.
- [ ] **AC-4** No Roll Needed behaviour is unchanged (sets `pool_status: 'no_roll'`,
      no pool_validated change).

---

## Dev notes

### Do NOT change

- `_readBuilderExpr` — already correct, no changes needed.
- `_autoSetStOverride` — the auto-set helper for rote/again buttons; it saves
  `roll_mode: 'st_override'` only. Leave it. The pool_validated will already be set
  from the earlier explicit ST Override click. If the ST hasn't clicked ST Override
  yet when rote/again fires, pool_validated isn't set — acceptable, user can click
  ST Override when ready.
- `renderProcessingMode` — no changes.
- `saveEntryReview` — no changes.
- All other buttons (Rote, 9-Again, 8-Again, confirm, roll) — unaffected.

### hasPool guard

`hasPool` on line 5384 checks `rev.pool_validated || rev.pool_player || entry.poolPlayer`.
After this fix, clicking ST Override will write pool_validated. The next time any mode
button is clicked, `hasPool` will be true from pool_validated. This is correct.

### Two render sites (project + merit panels)

Both panels use the same `.proc-roll-mode-btn` class and the same event listener
registered in `wireProcessingEvents`. The fix is in the shared handler — it covers
both render sites automatically. No per-panel changes needed.

### Testing approach

No Playwright needed. Manual smoke test on dev:

1. Open DT processing panel, expand any action where the player submitted a pool
   (e.g. Yusuf's "Deadman Info Drop" — player pool Manipulation + Subterfuge).
2. Change the Attribute dropdown to Wits, Skill dropdown to Computer.
3. Click "ST Override".
4. Verify the re-render shows Wits + Computer (not Manipulation + Subterfuge).
5. Reload the page — verify Wits + Computer still selected.
6. Click "Player Pool" — verify Manipulation + Subterfuge restored.
7. Click "No Roll Needed" — verify pool_status moves to no_roll, dropdowns unchanged.

---

## Dev Agent Record

### Files to change

- `public/js/admin/downtime-views.js`
  - Lines 5385-5392: insert pool_validated save/clear logic inside roll-mode handler

### Files changed

- `public/js/admin/downtime-views.js`

### Completion notes

Single change in the `.proc-roll-mode-btn` click handler (~line 5385):
- `mode === 'st_override'`: reads current builder dropdowns via `_readBuilderExpr`,
  writes result as `pool_validated` in the save patch — survives re-render and reload.
- `mode === 'player'`: clears `pool_validated: ''` so re-render falls back to
  player's submitted form values (priority-2 path in dropdown pre-population logic).
All other buttons (No Roll Needed, Rote, 9-Again, 8-Again) are unaffected.
