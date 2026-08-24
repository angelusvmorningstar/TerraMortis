---
title: 'DT Processing: dice roller formula label excludes spec bonuses'
type: 'fix'
issue: 791
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/791
branch: ms/issue-791-dt-proc-roller-label-spec-bonus
created: '2026-06-16'
status: done
recommended_model: 'sonnet — two-line handler fix + test'
context:
  - public/js/admin/downtime-views.js
---

## Intent

When an ST rolls dice in DT Processing, the active specialty chips already
add their bonus to the **dice count** (size), but the **formula label** shown
inside the Roll Modal still reads the bare `pool_validated` string without the
spec augmentation. The label and the actual roll size are out of sync.

This fix passes the augmented expression string (produced by
`_augmentPoolWithSpecs`) as the `expression` argument to `showRollModal` in
both affected handlers.

---

## Root cause

`_augmentPoolWithSpecs(poolValidated, activeSpecs, char)` (line 796) appends
spec names and their per-die bonuses to the pool expression, e.g.:

```
Wits 2 + Computer 0 ±0 = 2 + Covert Networks +1 = 3
```

It is already called in the pool-total display path (rendering `.proc-pool-total`)
so the ST sees the right string in the sidebar. It is **not** called when
building the `expression` argument to `showRollModal`.

Two handlers are affected:

| Handler | Line | Current expression | Bug |
|---------|------|--------------------|-----|
| `.proc-proj-roll-btn` | ~5779 | `expression: poolValidated` | bare — no spec label |
| `.proc-feed-roll-btn` | ~5653 | `expression: \`Feeding: ${poolValidated}\`` | bare — no spec label |

`.proc-merit-roll-btn` uses `btn.dataset.pool` for its dice count (a
pre-computed integer, not a pool expression) and is **not in scope** for this
fix.

### Variables already in scope at fix sites

**proj-roll-btn** (line 5778 context):
- `_specChar` — resolved at line 5770 via `_charForSub(_specSub)` ✓
- `review?.active_feed_specs || []` — already used for count at line 5771 ✓
- `poolValidated` — base expression string ✓

**feed-roll-btn** (line 5652 context):
- `sub` — resolved at line 5630 via `submissions.find(...)` ✓
- `review?.active_feed_specs || []` — already used for count bonus at line 5624 ✓
- `poolValidated` — base expression string ✓
- `_charForSub` — helper available in scope; `char` needed for `hasAoE` lookup ✓

---

## Fix

### T1 — Augment expression label in both roll handlers [x]

**File:** `public/js/admin/downtime-views.js`

#### proj-roll-btn handler (~line 5778)

Before the `showRollModal` call, compute the augmented expression:

```js
// BEFORE:
showRollModal({
  size: diceCount, expression: poolValidated,
  existingRoll: review?.roll || null,
  again, initialRote: roteChecked,
}, async result => {
```

```js
// AFTER:
const augExpr = _augmentPoolWithSpecs(poolValidated, review?.active_feed_specs || [], _specChar);
showRollModal({
  size: diceCount, expression: augExpr || poolValidated,
  existingRoll: review?.roll || null,
  again, initialRote: roteChecked,
}, async result => {
```

`_augmentPoolWithSpecs` returns the original string unchanged when there are
no active specs, so the no-spec path is a no-op.

#### feed-roll-btn handler (~line 5652)

Resolve the char and augmented base before the `showRollModal` call:

```js
// BEFORE:
showRollModal(
  { size: diceCount, expression: `Feeding: ${poolValidated}`, existingRoll: sub?.feeding_roll,
    again, rote: isRote },
```

```js
// AFTER:
const _feedChar = _charForSub(sub);
const _feedAugBase = _augmentPoolWithSpecs(poolValidated, review?.active_feed_specs || [], _feedChar);
showRollModal(
  { size: diceCount, expression: `Feeding: ${_feedAugBase || poolValidated}`, existingRoll: sub?.feeding_roll,
    again, rote: isRote },
```

`sub` is already resolved at line 5630 — no additional lookup needed.

---

### T2 — Source-pattern tests [x]

**File:** `server/tests/fix-791-dt-proc-roller-label-spec-bonus.test.js`

Use `readFileSync` to assert the source patterns exist in
`public/js/admin/downtime-views.js` (same approach as
`fix-787-st-override-lock-pool.test.js`).

| # | Test | Assert |
|---|------|--------|
| AC1-proj | `_augmentPoolWithSpecs` called before proj showRollModal | source contains `_augmentPoolWithSpecs(poolValidated, review?.active_feed_specs` before `size: diceCount, expression: augExpr` |
| AC2-proj | proj handler passes `augExpr \|\| poolValidated` | source contains `expression: augExpr \|\| poolValidated` |
| AC3-feed | `_feedChar` resolves via `_charForSub(sub)` before feed showRollModal | source contains `const _feedChar = _charForSub(sub)` |
| AC4-feed | feed handler uses augmented base in expression | source contains `expression: \`Feeding: \${_feedAugBase \|\| poolValidated}\`` |
| AC5-nochange | merit roll handler untouched | source still contains `const diceCount = parseInt(btn.dataset.pool` (merit handler signature) |

Run with: `npx vitest run server/tests/fix-791-dt-proc-roller-label-spec-bonus.test.js`

---

## Acceptance criteria

- [x] Given a project action with one active spec chip, clicking the roll button
  opens the modal with a label that includes the spec name and bonus (e.g.
  `Wits 2 + Covert Networks +1 = 3`) — not just the bare `pool_validated` string
- [x] Given a feeding action with one active spec chip, the modal label reads
  `Feeding: Resolve 3 + Streetwise 2 + Underworld Ties +1 = 6` (example)
- [x] Given no active spec chips, the modal label is unchanged from the current
  behaviour (no regression)
- [x] `.proc-merit-roll-btn` handler is untouched

---

## Guardrails

- Only `public/js/admin/downtime-views.js` changes — two `showRollModal` call sites.
- Do NOT change the stored `pool.expression` in the review document (line 5791) — that
  is a separate concern and not in scope for this fix.
- Do NOT touch `.proc-merit-roll-btn` — it uses a data-attribute integer, not a pool
  expression string.
- `_augmentPoolWithSpecs` already exists at line 796 — do not rewrite or move it.
- Do NOT add `pool_mod_spec` to the proj handler — the count is already computed
  dynamically from `active_feed_specs` at line 5771 (done by prior fix #729).

---

## Dev Agent Record

### Files changed

- `public/js/admin/downtime-views.js` — T1: two showRollModal call sites updated (proj + feed handlers); feed handler's character resolution corrected during review (see below)
- `public/js/downtime/roller.js` — escapes `pool.expression` before rendering, added during review (see below)
- `server/tests/fix.791.dt-proc-roller-label-spec-bonus.test.js` — T2: 14 source-pattern tests (corrected from an inaccurate "9" in the original note — 7 describe blocks, several with multiple `it`s — plus 2 more (AC8) added during review), all passing
- `specs/stories/fix.791.dt-proc-roller-label-spec-bonus.story.md` — this file

### Completion notes

**proj handler:** Added `const augExpr = _augmentPoolWithSpecs(poolValidated, review?.active_feed_specs || [], _specChar)` before `showRollModal`. Changed `expression: poolValidated` to `expression: augExpr || poolValidated`. `_specChar` was already in scope (line 5770 at the time; drifted to ~5910 by merge time, confirmed still correct).

**feed handler:** Added `const _feedChar = _charForSub(sub)` and `const _feedAugBase = _augmentPoolWithSpecs(poolValidated, review?.active_feed_specs || [], _feedChar)` after `sub` is resolved. Changed `\`Feeding: ${poolValidated}\`` to `\`Feeding: ${_feedAugBase || poolValidated}\``.

Stored `pool.expression` in the save callback intentionally left as `poolValidated` — storing the augmented form is out of scope for this fix.

Original note claimed "9/9 tests pass" and described a "narrowed" absence-check test that does not match what the test file actually contains — corrected 2026-08-18, see Review Findings.

### Review Findings

Internal 3-layer review (Blind Hunter / Edge Case Hunter / Acceptance Auditor), run 2026-08-18
after this branch was reconciled from a 2-month stranded state. Two real, independently-confirmed
defects were found and patched before merge (not deferred — both were small and unambiguous).

- [x] [Review][Patch] **Feed-handler label could diverge from the actual dice rolled**
  [`public/js/admin/downtime-views.js`, feed handler] — the original `_feedChar = _charForSub(sub)`
  resolves by `character_id` only. But the feed handler's actual `diceCount` comes from
  `review.pool_mod_spec`, computed at spec-toggle time using an id-**or-name** fallback
  (`characters.find(...) || charMap.get(sub.character_name...)`, matching the on-page pool-total
  display's own resolution). If a submission's `character_id` is stale/missing but
  `character_name` still resolves, the roll's dice count would include an AoE spec's full +2 while
  the new label fell back to `char == null` and showed only +1 — the label would understate what
  was actually rolled, recreating the class of bug #791 exists to fix, just relocated into the
  fix's own new lookup. Fixed by using the same id-then-name fallback pattern already established
  elsewhere in this file. Independently confirmed by both Edge Case Hunter and Acceptance Auditor,
  and verified directly against the real code before patching. Prove-discriminated: reverting the
  fix fails exactly the AC3 test (`fix.791...test.js:67`), nothing else.

- [x] [Review][Patch] **Freeform player text reached an unescaped `innerHTML` sink for the first
  time** [`public/js/downtime/roller.js:127`] — skill specialty names are freeform, player-authored
  text. Before this diff, `showRollModal`'s `expression` argument was always machine-generated
  (dropdown-built via `_buildPoolExpr`), so `roller.js`'s `${pool.expression}` interpolation into
  `innerHTML` with no `esc()` was harmless. This diff was the first thing to route real spec names
  into that same argument — and unlike the sibling pool-total display (which already wraps the
  identical `_augmentPoolWithSpecs(...)` call in `esc()`, `downtime-views.js:9529` etc.),
  `roller.js` didn't escape it. Fixed by importing the shared, DOM-free `esc()` from
  `public/js/data/helpers.js` and wrapping `pool.expression` before interpolation. Confirmed no
  other `showRollModal` caller in the codebase passes intentional HTML markup as `expression`
  (grepped all 7 call sites) so this is safe for every existing caller, not just the two this diff
  touches. Prove-discriminated: reverting the fix fails exactly the new AC8 test, nothing else.

- Also corrected during review, not blocking: the story's line-number citations (e.g.
  `_augmentPoolWithSpecs` "line 796", proj handler "~line 5779") had drifted from the real current
  file (actual: 821, 5918) after two months of unrelated feature growth in the same file — the
  diff's own hunk context lines still matched and applied clean, so this was a documentation
  staleness finding only, not a functional defect.

- Dismissed as noise (Blind Hunter, blind to the repo, flagged these without being able to check):
  "wrong specs field used for Projects roll" (`active_feed_specs` is confirmed the genuinely
  shared field name for both feed and proj rendering elsewhere in this same file) and "`_specChar`
  used but never declared" (it is declared, just outside the diff's narrow hunk, exactly where the
  story said it would be).
