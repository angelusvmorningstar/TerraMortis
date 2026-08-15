# Adversarial review - EQC-4 (Programmatic Purchase: Stat-Tweak Request), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. Do not open a file a later pass
   grants you until you reach that pass. In particular: **the story spec is deliberately NOT in the
   diff.** Do not go looking for it during the earlier passes. The final pass will hand you the path.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/issue-1155-eqc4-codex-findings.md`, before you open anything the next
   pass allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if
   a later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite-eqc`. The diff is at
  `specs/stories/code-review/issue-1155-eqc4-diff.txt` and is relative to that root, taken against
  base commit `41dd40ef` (the tip of the prior story, EQC-3).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- This directory (`D:\Terra Mortis\TM Suite-eqc`) is a **git worktree**, separate from
  `D:\Terra Mortis\TM Suite` which a concurrent, unrelated session may be using. Operate ONLY inside
  `D:\Terra Mortis\TM Suite-eqc`. Do not read or write anything under `D:\Terra Mortis\TM Suite` (no
  trailing `-eqc`) or any other sibling directory under `D:\Terra Mortis\`.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- This repo has no browser test harness - `vitest` runs source-file static analysis (regex/substring
  assertions against real file content) plus pure-function unit tests via dynamic import with a
  browser-globals stub. There is no live DOM to click a checkbox in; verify DOM-facing claims by
  reading the render code carefully, not by assuming a static-analysis test proves runtime behaviour.
  A long-running full-suite command exists (`npx vitest run server/tests`, ~30-60s) but most of its
  ~100 failing suites are a PRE-EXISTING, unrelated DB-connection guard
  (`Refusing to connect: test context (VITEST) targeting non-test database 'tm_suite'`) - do not treat
  that baseline noise as something this diff caused; compare counts, not raw pass/fail totals.
- This diff touches a SHARED module (`equipment-derivation.js`) that every equipment consumer in the
  codebase imports (roll.js, roll-v2.js, editor/sheet.js, suite/sheet.js) - a mistake in the two new
  exported functions here is silently available to any future consumer, not just the DT form. Also
  note issue #896's own pre-existing test asserts an EXACT-match regex on the neighbouring
  `equipment-derivation.js` import line in `downtime-form.js` - the diff deliberately keeps the two
  new imports on a SEPARATE `import` statement rather than merging them into that line, specifically
  to avoid breaking that assertion. Confirm that reasoning is sound rather than flagging the split
  import as untidy.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `npx vitest run server/tests/issue-879-defence-penalty-wirein.test.js server/tests/issue-871-876-ecm-4-9-bundle.test.js server/tests/issue-896-availability-filter.test.js`
  (should be 3 files / all passing). Report the real numbers even if they disagree with anything the
  story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/issue-1155-eqc4-diff.txt` and **nothing else**. No
spec, no story file, no project context. Do not explore the repository. Do not go looking for the
spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

Two new pure functions in `equipment-derivation.js` (`equipmentTweakableField`,
`tweakedAvailability`) that decide whether a catalogue item has a single tweakable numeric stat and
what the "+1 tweak" costs in availability. A DT-form UI change wires those into
`renderEquipmentRow`/`collectResponses`/a delegated change-handler in `downtime-form.js` so a player
can request the tweak on an equipment-acquisition row, with an over-cap warning. Two test files gain
new describe blocks: pure-function unit tests and DT-form static-analysis (regex/substring) tests.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. `equipmentTweakableField(entry)`: for `bucket === 'combat_gear'`, it checks
   `isCombatGearWeaponShaped(entry)` FIRST and returns `'damage_mod'` if true, only falling through to
   the armour check otherwise. If a real catalogue entry could plausibly have BOTH a populated
   weapon-shape field (`weapon_type`/`damage_mod`/`damage_type`) AND a populated armour-shape field
   (`armour_value`/`defence_penalty`) at once, this silently and permanently prefers the weapon
   interpretation with no way to request the armour tweak instead. Is that a real gap, or is
   weapon/armour mutual exclusivity actually guaranteed elsewhere (schema, catalogue-admin UI)? Flag
   as "worth checking" if you cannot tell from the diff alone.
2. `tweakedAvailability(entry)` returns `(entry.availability ?? treated as 0) + 1` - it reads
   `entry.availability` directly, NOT any Fixer-adjusted or character-aware figure. Trace how the
   caller in `downtime-form.js` uses this value (`tweakCost > rawMax`) and check the units genuinely
   match - i.e. that `rawMax` on the caller side is expressed in the SAME (raw, non-Fixer-adjusted)
   units as `tweakCost`, not a units mismatch that would silently over- or under-warn.
3. The new DT-form checkbox's `checked` state is read from `saved[\`equipment_${n}_tweak\`] === 'true'`
   independent of WHICH item is currently selected in that same row's dropdown. Trace what happens
   when a player: selects a tweakable item, checks the tweak box, then changes the dropdown to a
   DIFFERENT but also-tweakable item in the same row. Does the checked state carry over onto the new
   item's tweak request, and if so, is that a defect or an acceptable simplification for this scope?
4. The delegated change-handler branch added checks `e.target.classList.contains('dt-equip-cat')`.
   Confirm the class name genuinely exists on the exact element the diff renders (`<select
   id="dt-equipment_${n}_catalogue_id" class="qf-input dt-equip-cat">` per the earlier, unchanged
   `renderEquipmentRow` code) and that no OTHER element anywhere in this large file also carries that
   class, which would cause an unrelated element's change to spuriously trigger this branch's
   `collectResponses()` + full-form re-render.
5. Assertions/checks whose PASS condition is trivially satisfiable (`>= 0`, "truthy", a regex that
   would still match if the feature were broken).
6. A check whose label claims more than the check actually tests - in particular, the new test titled
   "renders a checkbox... ONLY when the selected item is tweakable" - does the test actually verify the
   conditional gating, or only that the checkbox markup and the gating function both appear somewhere
   in the file (which would pass even if the gating were wired incorrectly)?
7. Dead code, unused imports, unreachable branches introduced by this diff specifically.
8. Self-contradiction WITHIN the diff (does a comment claim one behaviour while the code beside it does
   another - e.g. the comment on the split-import decision versus what the import actually declares).

**STOP. Write your Pass 1 findings to `specs/stories/code-review/issue-1155-eqc4-codex-findings.md`
now, before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite-eqc`. Read whatever surrounding code you
need to understand what this change is actually plugging into. You still do **not** have the story
spec or any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1. Now verify it against the real files: `public/js/data/equipment-derivation.js`
(the whole file, to see how `isCombatGearWeaponShaped`/`isCombatGearArmourShaped` and the
`availabilityCap`/`fixerReduction`/`effectiveAvailability`/`isAffordable` family are actually shaped)
and `public/js/tabs/downtime-form.js` (`renderEquipmentRow`, `renderEquipmentSection`,
`collectResponses`'s equipment loop, the `[data-remove-equipment]` slot-shift handler, and the
delegated `container.addEventListener('change', ...)` block this diff adds a branch to).

### What to hunt for

1. Read `equipmentTweakableField` and `isCombatGearWeaponShaped`/`isCombatGearArmourShaped` (both
   defined earlier in the same file, unchanged by this diff) in full. Hand-construct a catalogue entry
   fixture for every bucket value that exists in this codebase's taxonomy
   (`combat_gear`/`skill_gear`/`tool_utility`/`narrative`/`container`) and, for `combat_gear`, one
   fixture with ONLY `armour_value` set, one with ONLY `damage_mod` set, one with BOTH set, and one
   with NEITHER shape-field set but `bucket: 'combat_gear'` anyway (a malformed/legacy row). Trace the
   exact return value for each by hand and compare to what the new unit tests in
   `server/tests/issue-879-defence-penalty-wirein.test.js` actually assert - do the tests cover the
   "both set" and "neither set" cases, and does the traced behaviour look intentional or accidental?
2. Read the FULL `renderEquipmentRow` function as it now stands (with this diff applied), start to
   end. Confirm `rawMax`, `cap`, `fixer`, `selectedId`, and `selectedEntry` are all genuinely in scope
   at the point the new tweak-checkbox block reads them (no shadowing, no use-before-definition, no
   stale closure over a prior render's values).
3. Read the `[data-remove-equipment]` handler in full (the "Remove Equipment button" branch). Confirm
   the newly-added `equipment_${n}_tweak` shift/delete lines sit in exactly the right place relative to
   the loop and the "Clear last slot" block - i.e. that removing row 2 of 3 correctly moves row 3's
   tweak flag into row 2's slot and clears what was row 3's, matching how `_catalogue_id`/`_qty`/
   `_notes` already behave, not silently reading `equipment_${n}_tweak` from the WRONG index due to an
   off-by-one against the other three keys' shift logic.
4. Read `collectResponses`'s equipment loop in full. Confirm `equipmentSlots` (used elsewhere in this
   file, e.g. the `dt-completeness.js` "minimal complete" check the file imports) does not get
   confused by a slot whose `equipment_${n}_catalogue_id` is empty but whose `equipment_${n}_tweak` is
   `'false'` (i.e. an empty/unselected row that nonetheless has a rendered-but-unchecked tweak flag,
   or - per finding 3 above - a STALE tweak flag left over from a previous selection) - would that
   slot get miscounted as "used" anywhere downstream that reads `equipment_${n}_*` keys generically?
5. Route/matcher ORDER: the new `classList.contains('dt-equip-cat')` branch is inserted directly after
   the Carthian Pull `id ===` checks and before the `dt-rote-disc`/`dt-rote-custom-attr`/
   `dt-rote-custom-skill` `includes()` check and the `[data-feed-terr]` closest() check, inside one long
   `container.addEventListener('change', ...)` delegate. Could ANY of the branches below the new one in
   this same handler also match an equipment-catalogue `<select>` element (e.g. because it too carries
   a `data-*` attribute or id pattern one of the later `closest()`/`includes()` checks would catch),
   such that both branches fire, or such that the new `return` after the equipment branch silently
   prevents a LATER branch from ever running for some other element it should have handled?
6. Malformed or absent input: what happens when `getCatalogueEntry(selectedId)` returns `undefined`
   (item deleted from the catalogue after being selected, or catalogue not yet loaded) - does
   `equipmentTweakableField(undefined)` and the surrounding `if (tweakField)` block degrade cleanly, or
   does anything downstream assume `selectedEntry` is truthy once `selectedId` is truthy?
7. Fixture/mock shape vs what the real consumer actually reads: do the new unit tests' fixture objects
   (`{ bucket: 'combat_gear', weapon_type: 'melee', damage_mod: 1 }` etc.) match the SHAPE a real
   catalogue document actually has (field names, whether `availability` is ever a string vs a number in
   real data, whether `_id` is expected anywhere these tests omit it)?

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/issue-1155-eqc4-codex-findings.md` now, before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/feature.1155.eqc4-purchase-stat-tweak.story.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written. In particular, re-read AC #5's exact wording
     ("exceeds the character's effective availability cap") against what the code actually compares
     (`tweakCost > rawMax`, where `rawMax = cap + fixer`) - is that genuinely the same threshold the AC
     names, or a related-but-different one?
   - Deviations from stated intent. **The "Explicitly NOT this story" section is equally load-bearing**
     - check the change did not quietly do an excluded thing (a schema field, automated granting, a
     downward tweak, stacking multiple tweaks, a tweak surface on a non-tweakable bucket, or a change
     to the existing affordability-gate DROPDOWN filtering logic itself).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate - do not flag these as gaps: a stat-override field on the
character's `equipment[]` row (rejected by design - see the story's Architecture decision); any
automated ST-granting flow (the story is request-capture only; granting stays on the existing
catalogue-admin CRUD, unchanged); downward tweaks; stacking more than one tweak per item; a tweak
surface on `tool_utility`/`narrative`/`container` items.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims:
   - A full scoped regression (`npx vitest run server/tests`) BEFORE this story's changes measured
     "100 failed suites / 79 passed, 2 failed tests, 1149 passed, 1153 skipped (181 files)", with all
     100 failed suites attributed to a pre-existing, unrelated DB-connection guard.
   - An AFTER-fix full scoped regression measured "100 failed suites / 79 passed, 2 failed tests (the
     SAME two pre-existing failures) / 1163 passed (+14) / 1153 skipped" - zero new failures.
   - A claim that an EARLIER attempt (merging the two new imports into the existing
     `equipment-derivation.js` import line in `downtime-form.js`) broke issue #896's own test via an
     exact-match regex, and that this was caught by the FULL regression rather than by the two touched
     test files alone (which the record claims passed 88/88 and 116/116 in isolation even with the
     broken merged-import version).
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now:
   `npx vitest run server/tests` for the full-suite numbers, and
   `npx vitest run server/tests/issue-879-defence-penalty-wirein.test.js server/tests/issue-871-876-ecm-4-9-bundle.test.js server/tests/issue-896-availability-filter.test.js`
   for the three specifically-relevant files. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/issue-1155-eqc4-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`, `[Pass 2]`,
`[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the vitest commands named above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
