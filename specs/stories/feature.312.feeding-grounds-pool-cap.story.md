# Story feature.312: Feeding Grounds pool modifier capped at 5

## Status: review

---

## Metadata

```yaml
issue: 312
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/312
branch: morningstar-issue-312-feeding-grounds-fwb-cap
```

---

## Story

**As an** ST processing a feeding action,
**I want** the Feeding Grounds dice modifier to never exceed +5 in the pool display,
**so that** the pool total reflects the merit's actual maximum rating regardless of any bonus dots applied by Friends With Benefits or other rule-engine channels.

---

## Background

Eve's DT processing panel was showing Feeding Grounds +20 in Dice Pool Modifiers. The culprit: `fg.rating` is the *effective* merit rating, which includes `free_fwb` bonus dots auto-applied by the rule engine (Friends With Benefits adds MCI + Status dots). The code passed that raw value directly to the pool modifier without capping at the merit's maximum of 5.

The fix is a `Math.min(..., 5)` at three read sites. The live-update path (`_updatePoolModTotal`) reads the capped value from a DOM `data-fg` attribute, so it self-corrects once the render path is fixed.

---

## Acceptance Criteria

1. Given a character with Feeding Grounds whose effective rating (including FwB or other bonuses) exceeds 5, the Dice Pool Modifiers row shows at most +5.
2. Given a character with Feeding Grounds at 3 effective dots (no FwB), the modifier shows +3.
3. `buildFeedingPool` — the generic best-pool computation used elsewhere in the admin panel — also caps Feeding Grounds at 5.
4. The character sheet merit dot display is unaffected.
5. No regressions in pool builder total or live modifier recalculation.

---

## Tasks / Subtasks

### [x] Task 1: Cap `fgDice` in `_renderFeedRightPanel`

**File:** `public/js/admin/downtime-views.js`, line 7076

This is the **primary fix**. The capped value is stored in `data-fg` on the mod panel div, so `_updatePoolModTotal` (line 6375) self-corrects automatically.

```js
// BEFORE:
const fgDice = fg ? (fg.rating || 0) : null; // null = char not loaded

// AFTER:
const fgDice = fg ? Math.min(fg.rating || 0, 5) : null; // null = char not loaded; cap at merit max
```

### [x] Task 2: Cap `fgDice0` in the pool builder init block

**File:** `public/js/admin/downtime-views.js`, line 8107

This block mirrors `_renderFeedRightPanel` to compute the initial pool total shown in the pool builder. It must match to avoid a flicker / mismatch on first render.

```js
// BEFORE:
const fgDice0 = fg0 ? (fg0.rating || 0) : 0;

// AFTER:
const fgDice0 = fg0 ? Math.min(fg0.rating || 0, 5) : 0;
```

### [x] Task 3: Cap `fgVal` in `buildFeedingPool`

**File:** `public/js/admin/downtime-views.js`, line 960

`buildFeedingPool` is the generic "best feeding pool" computation used by the admin panel for pool suggestions and feeding breakdowns. If uncapped, it also over-inflates the suggested pool.

```js
// BEFORE:
const fgVal = fg ? (fg.rating || 0) : 0;

// AFTER:
const fgVal = fg ? Math.min(fg.rating || 0, 5) : 0;
```

---

## Dev Notes

### Why `fg.rating` can exceed 5

`fg.rating` is the **effective** merit rating — base CP/XP dots plus all bonus channels written by the rule engine:

- `free_fwb` — Friends With Benefits: adds MCI + Status dots (auto-bonus rule)
- `free_mci`, `free_pt`, `free_bloodline`, `free_attache` — other bonus channels
- These are summed in `domain.js:42` and `domain.js:262`

The rule engine writes `free_fwb` via `mci.js:106`. It is intentional that the merit shows more than 5 on the character sheet — FwB is a genuine bonus. The cap only applies when the dots are used as a dice modifier.

### The live-update path self-corrects

`_updatePoolModTotal` (line 6375) reads `data-fg` from the DOM:

```js
const fgData = modPanel.dataset.fg;
const fgDice = fgData !== '' ? parseInt(fgData || '0', 10) : 0;
```

`data-fg` is written from `fgDice` at line 7097. Once Task 1 caps `fgDice`, `data-fg` will hold the capped value and the live updater inherits the fix for free. **Do not touch line 6375.**

### Three sites, same one-line change

All three fixes are identical in form: `Math.min(x || 0, 5)`. Each is independent; all three must be applied together for consistency.

### Character sheet display is a different code path

`public/js/editor/sheet.js:973` renders the merit dot display including FwB bonus. That path is untouched by this story.

### Grep verification after fixing

Run after changes to confirm no remaining uncapped reads:

```
grep -n "fg\.rating\|fgVal\s*=\|fgDice\s*=" public/js/admin/downtime-views.js
```

Expect every hit to now use `Math.min(...)`.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
Three identical one-line fixes applied: `Math.min(fg.rating || 0, 5)` at lines 960 (`buildFeedingPool`), 7076 (`_renderFeedRightPanel`), and 8107 (pool builder init block). The live-update path at line 6375 reads `data-fg` from the DOM and self-corrects automatically — untouched as specified. 8/8 E2E tests pass covering: inflated rating displays +5 not +20, normal rating displays +3, `data-fg` attribute holds capped value, and pool builder total respects the cap.

### File List
- `public/js/admin/downtime-views.js`
- `tests/downtime-processing-feature312.spec.js`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-14 | 1.0 | Created from issue #312 | BMAD SM |
| 2026-05-14 | 1.1 | Implemented and tested — 3 Math.min fixes + 8 E2E tests | claude-sonnet-4-6 |
