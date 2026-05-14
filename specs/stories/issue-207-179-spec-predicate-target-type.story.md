# Story issue-207+179: Stale nine_again predicate + target_type ternary gap

Status: review

issue: 207
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/207
issue_2: 179
issue_2_url: https://github.com/angelusvmorningstar/TerraMortis/issues/179
branch: morningstar-issue-207-179-spec-predicate-target-type

---

## Story

Two one-liner cleanup fixes in the DT codebase, bundled because both are sub-five-minute changes with no new imports, no new functions, and no UI changes.

---

## Fix A — Issue #207: Remove stale `nine_again` branch from `feeding-pool.js`

### Diagnosis

PR #267 established the canonical spec-bonus predicate: **AoE-only** (`hasAoE(char, spec) ? 2 : 1`). Nine-again is not a bonus-die trigger.

That PR corrected both surfaces in `downtime-form.js` (lines 3789 and 4902), but missed `feeding-pool.js:127`:

```js
// CURRENT (stale)
specBonus = (sk?.nine_again || hasAoE(char, spec)) ? 2 : 1;
```

The `sk?.nine_again` branch fires for any skill with intrinsic `nine_again` set to true, giving them +2 regardless of AoE. This contradicts the post-#267 rule.

The JSDoc comment at `feeding-pool.js:38` also still reads:
> "The bonus is +2 if the speciality is an Area of Expertise (`hasAoE`) or the picked skill has nine_again, else +1."

That trailing clause is now incorrect.

### Files

- `public/js/data/feeding-pool.js`

### Changes

**Line 127** — remove `sk?.nine_again ||`:
```js
// BEFORE
specBonus = (sk?.nine_again || hasAoE(char, spec)) ? 2 : 1;
// AFTER
specBonus = hasAoE(char, spec) ? 2 : 1;
```

**Line 38 (JSDoc)** — remove the nine_again clause:
```
// BEFORE
"The bonus is +2 if the speciality is an Area of Expertise (`hasAoE`) or the picked skill has nine_again, else +1."
// AFTER
"The bonus is +2 if the speciality is an Area of Expertise (`hasAoE`), else +1."
```

---

## Fix B — Issue #179: Apply Lesson #105 if-guard to `target_type` write

### Diagnosis

`downtime-form.js:668` collects the project slot's `target_type` radio using a ternary:

```js
// CURRENT (ternary — clobbers with '' when radio not present)
responses[`project_${n}_target_type`] = targetTypeRadio ? targetTypeRadio.value : '';
```

When a player changes a slot's action to one that doesn't render the target-zone radio, `targetTypeRadio` is null and this write clobbers any pre-existing `target_type` value with `''`. That breaks silent-leave symmetry.

The three sibling fields immediately below (lines 675-680) already use the correct if-guard pattern from the Lesson #105 / #170 fix:
```js
const targetValueEl = document.getElementById(`dt-project_${n}_target_value`);
if (targetValueEl) responses[`project_${n}_target_value`] = targetValueEl.value;
// ...same for target_terr and target_other
```

`target_type` is the one gap.

### Files

- `public/js/tabs/downtime-form.js`

### Change

**Line 668** — replace ternary write with if-guard:
```js
// BEFORE
responses[`project_${n}_target_type`] = targetTypeRadio ? targetTypeRadio.value : '';
// AFTER
if (targetTypeRadio) responses[`project_${n}_target_type`] = targetTypeRadio.value;
```

No other changes in this function. The existing comment block at lines 669-674 already documents the silent-leave pattern for the sibling fields; it remains accurate and covers `target_type` by extension.

---

## Acceptance Criteria

**AC-1 — feeding-pool.js predicate is AoE-only**
Given a character with a skill that has `nine_again: true` but no Area of Expertise on the feeding spec,
When `computeBestFeedingPool` is called with that spec,
Then `specBonus` is `1` (not `2`).

**AC-2 — AoE still grants +2 in feeding-pool.js**
Given a character with an Area of Expertise speciality on the feeding skill,
When `computeBestFeedingPool` is called with that spec,
Then `specBonus` is `2`.

**AC-3 — target_type silently leaves on action-change**
Given a project slot with a saved `target_type` value,
When the player changes the action to one that does not render the target-zone radio,
Then the prior `target_type` value is NOT overwritten with `''` in the collected responses.

**AC-4 — target_type still collects when radio is present**
Given a project slot whose action renders the target-zone radio and the player has selected a value,
When responses are collected,
Then `target_type` is written with the selected radio value.

**AC-5 — No regression on other spec-bonus surfaces**
Given the `downtime-form.js` spec-bonus calculations (lines 3789, 4902, and the feed-spec chip at 4691),
When any of those paths compute spec bonus,
Then they continue to use `hasAoE` only and are unaffected by this story.

---

## Implementation Notes

- Both changes are surgical one-liners. Do not refactor surrounding code.
- Do not add or remove any imports.
- Do not touch `skNineAgain` or `hasAoE` helper definitions — both remain correct as-is.
- The JSDoc fix at `feeding-pool.js:38` is a single sentence edit; preserve all other JSDoc content in that block.
- After both edits, run the JS parse check: `node --input-type=module < public/js/data/feeding-pool.js` and `node --input-type=module < public/js/tabs/downtime-form.js` to confirm no syntax errors.

---

## Dev Agent Record

### Files Modified
- `public/js/data/feeding-pool.js` — line 127: removed `sk?.nine_again ||` from specBonus predicate; line 38: removed nine_again clause from JSDoc
- `public/js/tabs/downtime-form.js` — line 670: ternary write replaced with if-guard

### Completion Notes
Both fixes applied as specified. Parse checks pass (feeding-pool.js, downtime-form.js). No imports added, no surrounding code touched.

---

## Out of Scope

- Issue #205 (admin feeding-detail spec-validity narrower than canonical) — related family but separate issue, not addressed here.
- Issue #242 (_gatherProjectAmbience multi-territory) — future-proof parking note, not touched.
- Issue #245 (Ambience Change mechanic design call) — requires ST ruling, not touched.
