---
title: 'DT Processing: dice roller fires from stale pool_validated; require live builder read'
type: 'fix'
issue: 792
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/792
branch: ms/issue-792-dt-proc-roller-stale-pool-gate
created: '2026-06-16'
status: done
recommended_model: 'sonnet — two handler rewrites + test'
context:
  - public/js/admin/downtime-views.js
---

## Intent

Roll buttons in DT Processing currently fire immediately if `pool_validated` is
non-empty from a prior session, bypassing the Player Pool / ST Override gate
entirely. The fix makes the live builder DOM (`_readBuilderExpr`) the
**unconditional primary source** at roll time. `pool_validated` from a prior
session is no longer used as the pool input — the builder's current selection
is always what rolls.

---

## Root cause

### proj handler (`proc-proj-roll-btn`, line 5748)

```js
// CURRENT — reads stale btn.dataset.poolValidated first
let poolValidated = btn.dataset.poolValidated || review?.pool_validated || '';
if (!poolValidated) {
  const builderEl = container.querySelector(...);
  // builder is fallback only
}
if (!poolValidated) return;
```

`btn.dataset.poolValidated` is set at render time from `_refreshPoolExpr(rev.pool_validated, char)` (line 7841). If `rev.pool_validated` was persisted in a prior session, this is non-empty on page load — the builder is never consulted and the roll fires immediately.

### feed handler (`proc-feed-roll-btn`, line 5604)

```js
// CURRENT — reads stale review.pool_validated first
let poolValidated = review?.pool_validated || '';
if (!poolValidated) {
  const builderEl = container.querySelector(...);
  // builder is fallback only
}
if (!poolValidated) return;
```

Same issue — `review.pool_validated` from a prior session bypasses the builder.

### action handler (`proc-action-roll-btn`, line 5548) — dead code

```js
const poolValidated = review?.pool_validated || '';
if (!poolValidated) return;
// NO DOM fallback at all
```

Wired but never rendered (no HTML generation emits `.proc-action-roll-btn`).
Included in this fix for completeness — adding a DOM fallback makes the handler
correct if it is ever rendered in future.

### Resolution of the open question

The issue posed two options:
1. In-memory session flag — track "Player Pool or ST Override clicked this render"
2. Always re-read from builder — ignore stale `pool_validated` at roll time

**Chosen: Option 2.** Always call `_readBuilderExpr` unconditionally. If the
builder has no valid selection (attr or skill not chosen in dropdowns), block
the roll. This is simpler, eliminates all session-state machinery, and matches
the mental model: the builder IS the pool — roll what you see.

Note: the builder dropdowns ARE pre-populated from `rev.pool_validated` at render
time (via `_parsePoolExpr` in the builder rendering). So a returning ST will see
the prior session's attr/skill pre-selected — and can change them before rolling.
If they do not change anything, rolling fires with what the builder shows, which
is the correct intended pool.

---

## Fix

### T1 — Make builder the unconditional pool source in both live handlers

**File:** `public/js/admin/downtime-views.js`

#### proj handler (~line 5748)

Replace the stale-first read block:

```js
// BEFORE (lines 5748-5764):
let poolValidated = btn.dataset.poolValidated || review?.pool_validated || '';
if (!poolValidated) {
  const builderEl = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
  if (builderEl) {
    const builtExpr = _readBuilderExpr(builderEl);
    if (builtExpr) {
      const rpanel = container.querySelector(`.proc-feed-right[data-proc-key="${key}"]`);
      const _roteV = rpanel?.querySelector('.proc-pool-rote')?.checked  || false;
      const _naV   = rpanel?.querySelector('.proc-proj-9a')?.checked    || false;
      const _8aV   = rpanel?.querySelector('.proc-proj-8a')?.checked    || false;
      const _user = getUser();
      const _stName = _user?.global_name || _user?.username || 'ST';
      await saveEntryReview(entry, { pool_validated: builtExpr, nine_again: _naV, rote: _roteV, eight_again: _8aV, pool_confirmed_by: _stName });
      poolValidated = builtExpr;
    }
  }
}
if (!poolValidated) return;
```

With builder-first:

```js
// AFTER:
const builderEl = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
const builtExpr = builderEl ? _readBuilderExpr(builderEl) : null;
if (!builtExpr) return;
const rpanel = container.querySelector(`.proc-feed-right[data-proc-key="${key}"]`);
const _roteV = rpanel?.querySelector('.proc-pool-rote')?.checked  || false;
const _naV   = rpanel?.querySelector('.proc-proj-9a')?.checked    || false;
const _8aV   = rpanel?.querySelector('.proc-proj-8a')?.checked    || false;
const _user = getUser();
const _stName = _user?.global_name || _user?.username || 'ST';
await saveEntryReview(entry, { pool_validated: builtExpr, nine_again: _naV, rote: _roteV, eight_again: _8aV, pool_confirmed_by: _stName });
let poolValidated = builtExpr;
```

The `btn.dataset.poolValidated` read is removed entirely. `poolValidated` is now always fresh from the builder. Everything that follows (spec count, `showRollModal` call, save callback) is unchanged.

#### feed handler (~line 5604)

Replace the stale-first read block:

```js
// BEFORE (lines 5604-5620):
let poolValidated = review?.pool_validated || '';
if (!poolValidated) {
  const builderEl = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
  if (builderEl) {
    const builtExpr = _readBuilderExpr(builderEl);
    if (builtExpr) {
      const rpanel = container.querySelector(`.proc-feed-right[data-proc-key="${key}"]`);
      const _naV = rpanel?.querySelector('.proc-proj-9a')?.checked  || false;
      const _8aV = rpanel?.querySelector('.proc-proj-8a')?.checked  || false;
      const _user = getUser();
      const _stName = _user?.global_name || _user?.username || 'ST';
      await saveEntryReview(entry, { pool_validated: builtExpr, nine_again: _naV, eight_again: _8aV, pool_confirmed_by: _stName });
      poolValidated = builtExpr;
    }
  }
}
if (!poolValidated) return;
```

With builder-first:

```js
// AFTER:
const builderEl = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
const builtExpr = builderEl ? _readBuilderExpr(builderEl) : null;
if (!builtExpr) return;
const rpanel = container.querySelector(`.proc-feed-right[data-proc-key="${key}"]`);
const _naV = rpanel?.querySelector('.proc-proj-9a')?.checked  || false;
const _8aV = rpanel?.querySelector('.proc-proj-8a')?.checked  || false;
const _user = getUser();
const _stName = _user?.global_name || _user?.username || 'ST';
await saveEntryReview(entry, { pool_validated: builtExpr, nine_again: _naV, eight_again: _8aV, pool_confirmed_by: _stName });
let poolValidated = builtExpr;
```

Everything that follows (diceCount parse, `pool_mod_spec`, `showRollModal` call) is unchanged.

#### action handler (~line 5548)

Add builder lookup as a primary path (dead code; no rendered usage):

```js
// BEFORE:
const poolValidated = review?.pool_validated || '';
if (!poolValidated) return;
```

```js
// AFTER:
const builderEl = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
const builtExpr = builderEl ? _readBuilderExpr(builderEl) : null;
const poolValidated = builtExpr || review?.pool_validated || '';
if (!poolValidated) return;
```

Unlike the live handlers, the action handler keeps `review.pool_validated` as a
fallback — it has no save logic and is dead code, so minimal change is correct.

---

### T2 — Source-pattern tests

**File:** `server/tests/fix.792.dt-proc-roller-gate-stale-pool.test.js`

Use `readFileSync` source-pattern assertions.

| # | Test | Assert |
|---|------|--------|
| AC1-proj | proj handler calls `_readBuilderExpr` unconditionally | source contains `const builtExpr = builderEl ? _readBuilderExpr(builderEl) : null` before the `if (!builtExpr) return` in proj context |
| AC2-proj | proj handler no longer reads `btn.dataset.poolValidated` as primary | source does NOT contain `btn.dataset.poolValidated \|\| review?.pool_validated` |
| AC3-proj | proj handler saves fresh expr to pool_validated unconditionally | source contains `pool_validated: builtExpr` in the block immediately before `let poolValidated = builtExpr` |
| AC4-feed | feed handler calls `_readBuilderExpr` unconditionally | source contains the new builder-first block pattern in the feed handler context |
| AC5-feed | feed handler no longer falls back to stale `review.pool_validated` as primary | `let poolValidated = review?.pool_validated` no longer exists in the file |
| AC6-action | action handler has DOM builder fallback | source contains `const builtExpr = builderEl ? _readBuilderExpr(builderEl) : null` followed by `const poolValidated = builtExpr \|\| review?.pool_validated` |
| AC7-merit | `.proc-merit-roll-btn` handler untouched | source still contains `const diceCount = parseInt(btn.dataset.pool, 10) \|\| 0` |

Run with: `npx vitest run server/tests/fix.792.dt-proc-roller-gate-stale-pool.test.js`

---

## Acceptance criteria

- [x] If the builder has no valid attr/skill selection, clicking the roll button
  does not fire (returns silently)
- [x] After the ST selects attr + skill in the builder (regardless of whether
  Player Pool or ST Override was clicked), clicking roll reads the live
  builder state as the pool expression
- [x] `pool_validated` is updated to the fresh builder expression on every
  roll button click (no stale value persists as the roll source)
- [x] `.proc-merit-roll-btn` handler is untouched
- [x] `proc-action-roll-btn` handler gains a builder DOM lookup (dead code
  path — no regression risk)

---

## Dev Agent Record

### Files changed

- `public/js/admin/downtime-views.js` — T1: three handler edits
  - `proc-action-roll-btn` (~line 5547): added builder DOM lookup; keeps `review.pool_validated` as fallback (dead code path)
  - `proc-feed-roll-btn` (~line 5603): builder is now unconditional primary; `if (!builtExpr) return` gates the roll; `let poolValidated = review?.pool_validated` removed
  - `proc-proj-roll-btn` (~line 5748): builder is now unconditional primary; `btn.dataset.poolValidated || review?.pool_validated` stale-first block removed; save called unconditionally before `let poolValidated = builtExpr`
- `server/tests/fix.792.dt-proc-roller-gate-stale-pool.test.js` — T2: 12 source-pattern tests, all passing
- `specs/stories/fix.792.dt-proc-roller-gate-stale-pool.story.md` — this file

### Completion notes

All three handler edits applied. Builder is now the unconditional source for both live handlers (feed + proj). The action handler (dead code) gains a builder lookup with `review.pool_validated` fallback — minimal change, no regression risk. 12/12 tests green. No changes to `_readBuilderExpr`, `_refreshPoolExpr`, the roll-mode button handler, or any save callbacks.

---

## Guardrails

- Only `public/js/admin/downtime-views.js` changes — three roll handler sites.
- `btn.dataset.poolValidated` read is removed from proj handler only. The render-
  time `data-pool-validated` attribute on the button element is NOT removed from
  the HTML generation (line 7841) — it may be useful for debugging and costs nothing.
- The save callback inside the `showRollModal` async result handler (which writes
  `pool: { expression: poolValidated }`) is unchanged.
- `_readBuilderExpr` and `_refreshPoolExpr` are unchanged.
- The `proc-roll-mode-btn` (Player Pool / ST Override / No Roll) handler is unchanged.
- Do NOT add `pool_mod_spec` or spec augmentation changes — those are #791 (done).
