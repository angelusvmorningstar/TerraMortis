---
title: 'DT Processing: spec bonus dice missing from project action roll'
type: 'fix'
issue: 729
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/729
branch: ms/issue-729-dt-proc-dice-roll-count
created: '2026-06-14'
status: done
recommended_model: 'sonnet — one-line handler fix + test'
context:
  - public/js/admin/downtime-views.js
---

## Intent

When an ST rolls dice in DT Processing for a **project-type action** (including
rote feed), the `.proc-pool-total` display includes active specialty (+1/+2)
bonuses but the actual dice roll uses only the base pool from `pool_validated`,
producing one fewer die than shown.

---

## Root cause

`pool_mod_spec` is saved to the review document whenever an ST toggles a spec
chip (`proc-spec-chip` click handler, line 5514). The **feeding** roll handler
(`.proc-feed-roll-btn`, line 5548) correctly adds this saved value to
`diceCount` before calling `showRollModal`. The **project** roll handler
(`.proc-proj-roll-btn`, lines 5655-5656) does not — it reads `diceCount` from
`pool_validated` and passes it directly to `showRollModal` without adding
`pool_mod_spec`.

The display is correct: `_augmentPoolWithSpecs` (line 795) appends spec labels
and increments the `= N` total in `.proc-pool-total`, so the ST sees the right
number. The roll uses the wrong number.

### File locations

| File | Lines | Notes |
|------|-------|-------|
| `public/js/admin/downtime-views.js` | 5628–5690 | `.proc-proj-roll-btn` click handler — missing `pool_mod_spec` addition |
| `public/js/admin/downtime-views.js` | 5519–5595 | `.proc-feed-roll-btn` click handler — correct reference; has `pool_mod_spec` at line 5548 |
| `public/js/admin/downtime-views.js` | 5465–5481 | `.proc-action-roll-btn` handler — wired but never rendered (dead); ignore |
| `public/js/admin/downtime-views.js` | 6691–6698 | `_buildPoolExpr` — pool expression format `"Attr N + Skill N ±0 = total"` |

---

## Fix

### T1 — Add `pool_mod_spec` to project roll count [x]

**File:** `public/js/admin/downtime-views.js`

In the `.proc-proj-roll-btn` click handler, after the `diceCount` parse (line
5656), add the spec bonus and use the corrected total throughout:

```js
// BEFORE (lines 5655-5677):
const match = poolValidated.match(/(\d+)\s*$/);
const diceCount = match ? parseInt(match[1], 10) : 0;
if (!diceCount) { alert('Cannot parse dice count from validated pool expression.'); return; }
// ... later:
showRollModal({
  size: diceCount, expression: poolValidated,
  ...
}, async result => {
  await saveEntryReview(entry, {
    roll: result,
    pool: { expression: poolValidated, total: diceCount },
    ...
  });
```

```js
// AFTER:
const match = poolValidated.match(/(\d+)\s*$/);
let diceCount = match ? parseInt(match[1], 10) : 0;
if (!diceCount) { alert('Cannot parse dice count from validated pool expression.'); return; }
diceCount += (review?.pool_mod_spec || 0);
// ... later (no other changes needed — diceCount is already used):
showRollModal({
  size: diceCount, expression: poolValidated,
  ...
}, async result => {
  await saveEntryReview(entry, {
    roll: result,
    pool: { expression: poolValidated, total: diceCount },
    ...
  });
```

The only changes are:
1. `const diceCount` → `let diceCount` (line 5656)
2. Add `diceCount += (review?.pool_mod_spec || 0)` immediately after (new line 5657)

Everything else in the handler stays identical — `diceCount` is already used in
`size`, `pool.total`, and `pool_snapshot`.

---

### T2 — QA: Playwright spec [x]

**File:** `tests/fix-729-dt-proc-dice-roll-count.spec.js`

Use the DT processing test harness (fixture pattern from
`tests/fix-725-rote-feed-inherited-pool.spec.js`).

Mount `renderNormalisedCard` (or `renderProcessingMode`) in a container, inject
a project entry with `pool_validated = "Presence 3 + Empathy 4 ±0 = 7"` and
`pool_mod_spec = 1` in the review document.

Intercept `showRollModal` (or the pool size data written before the modal call)
and assert `size === 8`, not 7.

| # | Setup | Assertion |
|---|-------|-----------|
| AC1 | `pool_validated = "Presence 3 + Empathy 4 ±0 = 7"`, `pool_mod_spec = 1` | Roll button triggers `showRollModal` with `size = 8` |
| AC2 | `pool_validated = "Wits 3 + Stealth 2 ±0 = 5"`, `pool_mod_spec = 0` | Roll triggers `showRollModal` with `size = 5` (zero spec — no regression) |

Because `showRollModal` opens a modal (which would need interaction to
confirm), the cleanest test approach is to spy on `rollPool` or mock
`showRollModal` to capture the `size` argument before it fires.

---

## Acceptance criteria

- [ ] Given a project action with `pool_mod_spec = 1` and `pool_validated` total
  of 7, clicking the roll button triggers a roll with **8 dice** (not 7)
- [ ] Given `pool_mod_spec = 0` (or absent), the roll count is unchanged
  (no regression for entries without active spec chips)
- [ ] The stored `pool.total` in the review document reflects the spec-adjusted
  count (for consistent replay in the roll history)

---

## Guardrails

- Only `public/js/admin/downtime-views.js` changes — one `const` → `let` and
  one line added.
- No schema change. `pool_mod_spec` already exists in the review document.
- Do NOT touch the feeding roll handler (`.proc-feed-roll-btn`) — it already
  handles `pool_mod_spec` correctly at line 5548.
- Do NOT touch `.proc-action-roll-btn` — it is wired but never rendered.
- The fix applies to ALL project-type actions, not just rote feed.

---

## Dev Agent Record

### Files changed

- `public/js/admin/downtime-views.js` — T1: `const diceCount` → `let diceCount` + `diceCount += (review?.pool_mod_spec || 0)` in `.proc-proj-roll-btn` handler (lines 5655-5658)
- `specs/stories/fix.729.dt-proc-dice-roll-count.story.md` — this file
- `tests/fix-729-dt-proc-dice-roll-count.spec.js` — T2: 2 Playwright tests, both passing

### Completion notes

One-line fix. The project roll handler was the only roll handler that didn't add `pool_mod_spec`. The feeding handler already did this at line 5548. Now both handlers are consistent. 2/2 tests passing.
