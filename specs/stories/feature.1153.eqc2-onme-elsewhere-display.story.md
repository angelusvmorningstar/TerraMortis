# Story feature.1153: EQC-2 — On-Me vs Owned-Elsewhere Display Distinction

## Status: done

---
issue: 1153
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1153
branch: ms/issue-1153-eqc2-onme-elsewhere-display
depends_on: ms/issue-1152-eqc1-bucket-container-schema (EQC-1, #1152) — branched from ITS tip, not
  main, because this story reads the new bucket taxonomy and predicates EQC-1 introduces. TM Suite's
  own CLAUDE.md convention is "branch from up-to-date main" — this is a disclosed, dependency-forced
  deviation. Rebase onto main once EQC-1 merges.
---

## Story

**As a** player or Storyteller reading a character sheet,
**I want** to see at a glance which equipment is on the character right now (its bonus applies in
game) versus owned but stored elsewhere (available only as a downtime resource, no in-game bonus),
**so that** "why isn't my gear showing a bonus" stops being a state-dropdown mystery and becomes a
visible, labelled fact.

## Background

Epic #1038, desired-behaviour item 3: *"Display distinction: 'on me' (bonus applies in game) vs
'owned but elsewhere' (available in downtime only)."* The 2026-07-25 meeting notes call this "the
on-me/elsewhere flag."

**Investigation finding, this session**: the mechanical GATING this distinction describes already
exists and is already correct — `armourDefencePenalty` only counts `state === 'worn'` armour;
`roll.js`/`roll-v2.js`'s weapon-reference and skill-bonus-chip filters only count
`carried`/`worn`/`active` items. What's missing is not the mechanic, it's making the distinction
**visible** — nothing today labels an item "on you" vs "stored elsewhere" for a player to actually
see; it's only inferable from the raw state dropdown value.

**Design decision this session (documented here, not asked again — see the Debug Log for the
reasoning)**: this story does NOT add a new schema field. `container_id` (already introduced by
EQC-1) is a *placement* concept (inside a container or not); on-me/elsewhere is a *possession*
concept, already fully expressed by the existing `state` enum (`carried`/`worn`/`active` = on me;
`stashed` = owned elsewhere; `lost` = neither — the item is gone). Adding a second, independent field
for the same underlying fact would create exactly the "two things that can disagree" class of bug
this session's own EQC-1 review just found and fixed (the combat_gear weapon/armour discriminator).
One extracted, shared predicate — `isEquipmentOnMe(item)` — is the "flag" the meeting notes name; it's
computed, not stored, and every consumer that currently re-derives this state-based check inline
(`roll.js`, `roll-v2.js`) is refactored to import the same function, so the concept can't drift
between call sites the way the combat_gear shape check just did.

**Nuance worth recording**: "on me" (physical possession — carried/worn/active) is a *broader* concept
than "bonus is currently active" for armour specifically, which additionally requires the narrower
`state === 'worn'` (a breastplate slung over your shoulder is on you, but grants no AR until worn).
This story's label answers "is this near me right now", not "is every possible bonus from it currently
firing" — the existing `Worn`/`Carried`/`Stashed` state chip already answers the latter, unchanged by
this story.

## Explicitly NOT this story

- **No new schema field.** `isEquipmentOnMe` is a derived predicate over the existing `state` field,
  not a stored value. See Background for why.
- **No change to any bonus-application logic.** `armourDefencePenalty`, the roll-calculator filters,
  and every other existing mechanic keep their exact current gating (which is already correct, per
  this session's investigation) — this story is additive display only.
- **The "available in downtime" half of the epic's own sentence is NOT wired to anything.** No code
  anywhere today reads a character's existing equipment inventory as a downtime resource (the DT form
  only handles NEW acquisitions). Making stashed items actually usable in downtime is real future
  work with no current consumer to attach to — out of scope here, not silently dropped.
- **`container`-bucket items (havens, vehicles, safes) do not get an on-me/elsewhere label.** They are
  locations, not carried possessions — "on me" has no meaning for a haven. Only `combat_gear`,
  `skill_gear`, `tool_utility`, and `narrative` items get the new label.
- **The DT form's equipment dropdown is untouched.** It lists catalogue items for acquisition, never a
  character's current inventory — nothing there reads `state` today, so there is nothing for this
  story to label.

## Acceptance Criteria

1. `equipment-derivation.js` exports `isEquipmentOnMe(item)`: `true` for `state` in
   `{carried, worn, active}`, `false` for `{stashed, lost}` or a missing/null item.
2. `roll.js` and `roll-v2.js`'s weapon-reference and skill-bonus-chip filters import and use
   `isEquipmentOnMe` in place of their existing inline `item.state === 'carried' || ... === 'worn' ||
   ... === 'active'` repetition — same behaviour, single source of truth, matching the precedent set
   by EQC-1's own `isCombatGearArmourShaped`/`isCombatGearWeaponShaped` extraction.
3. `editor/sheet.js`'s equipment renderer shows an "On you" / "Stored elsewhere" label on every
   `combat_gear`, `skill_gear`, `tool_utility`, and `narrative` equipment row, computed from
   `isEquipmentOnMe`. A `lost` item shows neither label (it's gone, not "elsewhere").
   `container`-bucket rows are unaffected (no label).
4. No behavioural regression: `armourDefencePenalty`'s `worn`-only gating for the AR bonus itself is
   completely unchanged — an item that is "on you" (carried) but not worn still shows the new "On you"
   label while correctly granting no armour bonus, proving the two concepts are genuinely independent.
5. `npm test`: every equipment-related suite green; no new failures beyond the same pre-existing
   baseline EQC-1 already documented and verified.
6. TM Wiki, TM Cockpit, and TM Herald are completely untouched — TM Suite-only.

## Tasks / Subtasks

- [x] **Task 1 — Shared predicate** (AC #1)
  - [x] `equipment-derivation.js`: export `isEquipmentOnMe(item)`.
  - [x] Unit tests: every state value, null/undefined item.

- [x] **Task 2 — Consolidate the roll-calculator filters onto the shared predicate** (AC #2)
  - [x] `roll.js`: weapon-reference filter, skill-bonus-chip filter.
  - [x] `roll-v2.js`: same two filters.
  - [x] Update `equipment-client-fixes.test.js`'s source-string checks to match the new call shape.

- [x] **Task 3 — Sheet display label** (AC #3, #4)
  - [x] `editor/sheet.js`: add the "On you"/"Stored elsewhere" label to the six applicable sections
        (Weapons, Armour, Other Combat Gear, Skill Gear, Tools/Utility, Narrative — NOT Containers).
  - [x] A new test proving the "on you but not worn, no bonus" independence claim from AC #4.

- [x] **Task 4 — Full regression** (AC #5, #6)
  - [x] Every equipment-related vitest suite green (9 files, 181/181).
  - [x] Confirm zero diff under TM Wiki, TM Cockpit, TM Herald (only Read/Grep/Bash-read-only used there this story).

## Dev Notes

- This is a small, additive story by design — the mechanical work was already done correctly before
  this story exists; the gap was purely visibility. Resist the temptation to fold in the "available in
  downtime" half, the container-instance-identity question EQC-1's review deferred, or anything from
  EQC-3/4/5 because "it's related" — those are separate stories with their own scope for a reason.
- `isEquipmentOnMe`'s home is `equipment-derivation.js` (not a new file) — it's a natural sibling to
  `isCombatGearArmourShaped`/`isCombatGearWeaponShaped`, same "single shared predicate, not a
  duplicated inline check" pattern EQC-1's own review just established.

### Project Structure Notes

- Modified: `public/js/data/equipment-derivation.js`, `public/js/suite/roll.js`,
  `public/js/suite/roll-v2.js`, `public/js/editor/sheet.js`,
  `server/tests/equipment-client-fixes.test.js`, plus a new/extended test file for
  `isEquipmentOnMe` itself (likely `server/tests/issue-879-defence-penalty-wirein.test.js`, which
  already covers `equipment-derivation.js`'s other predicates).
- No schema files touched — no new field, per the Background decision.

### References

- Epic EQC, issue #1038, desired-behaviour item 3.
- `2026-07-25_meeting-lessons.md` — "Key display distinction: on me... versus owned but elsewhere."
- `specs/stories/feature.1152.eqc1-bucket-container-schema.story.md` — the shared-predicate
  extraction pattern this story follows, and the branch this one stacks on.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5.

### Debug Log References

- Branching mistake caught and corrected mid-session: `git switch -c ... origin/main` was run first
  (TM Suite's default branch-from-main convention), which silently checked out origin/main's OLD
  taxonomy since EQC-1 hasn't merged - confirmed via the system's own file-state warnings showing
  `equipment-derivation.js` reverted to its pre-EQC-1 shape. Verified EQC-1's work was untouched on
  its own branch (`git log`/`git show` against `ms/issue-1152-eqc1-bucket-container-schema` - both
  commits and `isCombatGearArmourShaped` present), deleted the wrongly-based branch, recreated it
  from EQC-1's tip instead. No work was lost; caught before any EQC-2 code was written.
- Investigated whether the epic's "on-me/elsewhere flag" required a new schema field before writing
  any code: confirmed the mechanical gating (`armourDefencePenalty`'s `worn`-only check; the roll
  calculators' `carried|worn|active` filters) already existed and was already correct - the actual
  gap was visibility, not mechanics. Decided against a new field (see story Background) specifically
  to avoid re-creating the "two things that can independently disagree" class of bug EQC-1's own
  review just found in the combat_gear discriminator.

### Completion Notes List

- `isEquipmentOnMe` extracted and used to consolidate FOUR previously-duplicated inline
  `carried|worn|active` checks (roll.js's two filters, roll-v2.js's two filters - four call sites,
  two files) onto one shared predicate.
- Sheet display label added to exactly 6 render sections (Weapons, Armour, Other Combat Gear, Skill
  Gear, Tools/Utility, Narrative) per AC #3; Containers explicitly excluded and verified via grep
  (`locationLabel` appears once in its definition and 6 times in call sites - Container's own render
  block was never touched).
- AC #4's independence claim (on-me carried-but-unworn armour grants no AR bonus) proven by a new
  behavioural test, not merely asserted.
- Full equipment suite: 9 files, 181/181 (up from EQC-1's 177 - this story's own new tests).
- Prove-discriminated `isEquipmentOnMe` itself (temporarily dropped 'active' from the OR, confirmed
  exactly 1 test failed, restored).
- Zero diff under TM Wiki/TM Cockpit/TM Herald - this story used Read/Grep only there (checking the
  meeting-lessons doc), no Edit/Write/mutating Bash call issued against any sibling repo.

### File List

- `public/js/data/equipment-derivation.js` (modified - `isEquipmentOnMe` + `equipmentLocationLabel` exports)
- `public/js/suite/roll.js` (modified - both filters consolidated onto the shared predicate)
- `public/js/suite/roll-v2.js` (modified - same two filters)
- `public/js/editor/sheet.js` (modified - `locationLabel` alias + 6 render sections)
- `server/tests/equipment-client-fixes.test.js` (modified - #752 describe block rewritten)
- `server/tests/issue-879-defence-penalty-wirein.test.js` (modified - new `#1153 EQC-2` describe blocks, scoped a pre-existing whole-file regex to its actual target function)

## Senior Developer Review (AI)

**Reviewer**: Codex (external, CLI-direct via `codex exec`, `model_reasoning_effort=high`), invoked through the `codex-review` skill under `bmad-loop`. Independent of the session that wrote this story. Full prompt at `specs/stories/code-review/issue-1153-eqc2-codex-review.md`, full findings at `specs/stories/code-review/issue-1153-eqc2-codex-findings.md`.

**Method**: 3-pass single-session review (Blind Hunter -> Edge Case Hunter -> Acceptance Auditor) against the uncommitted working-tree diff (base `cb863812`, EQC-1's tip), scoped to the 6 touched source/test files.

**Ship assessment (Codex's own words)**: *"Ready to ship as-is. No High or Medium defect was found... The malformed-state display fallback and the two record-quality issues above are low-risk follow-ups, not blockers."*

### Findings and disposition

- **[Low, Pass 2] Malformed/unrecognised equipment states rendered a confident but unsupported "Stored elsewhere" claim.** VERIFIED TRUE - the original `locationLabel` treated ANY non-`'lost'` state as elsewhere, including a missing or garbage `state` value (schema validation prevents this on write, but pre-existing/imported/directly-written bad records could carry one). **PATCHED**: extracted the logic as `equipmentLocationLabel` in `equipment-derivation.js` (directly unit-testable, matching this module's own established pattern), now returning `null` (no label) for anything that isn't a recognised on-me state or the one known elsewhere state (`'stashed'`), rather than guessing. Four new tests added including the exact malformed-state case the review found; prove-discriminated (temporarily removed the `stashed`-only guard, confirmed exactly 2 tests failed - the `lost` and malformed-state cases share the same code path - restored).
- **[Low, Pass 3b] The Dev Agent Record's Completion Notes said "THREE" consolidated call sites while its own parenthetical listed four.** VERIFIED TRUE (internally contradictory wording; the underlying implementation was already correct - 4 real call sites, independently confirmed by Codex's own grep). **PATCHED**: corrected to "FOUR" to match the parenthetical and the actual count.
- **[Low, Pass 3b] The sibling-repository (TM Wiki/Cockpit/Herald) "zero diff, Read-only" claim could not be independently verified within this review's own permitted scope** (its ground rules explicitly forbid reading those repos). **NO ACTION** - this is a disclosed scope limitation on the reviewer's side, not a false claim; the claim itself remains accurate from this session's own tool-call history (no `Edit`/`Write`/mutating `Bash` call was ever issued against any sibling repo during this story).

### Verification performed this pass

- Fixing the malformed-state finding surfaced a SECOND, pre-existing test whose whole-file source-string regex (`expect(src).not.toMatch(/item\.state === 'stashed'/)`) broke the moment `equipmentLocationLabel` (a different function, for a different purpose) legitimately introduced that same substring elsewhere in the module. Scoped the test to `armourDefencePenalty`'s own function body instead of the whole file, preserving its real intent (that function uses a positive `worn` check, not a negative `stashed` exclusion) without banning the substring module-wide.
- Re-ran the full 9-file equipment suite after every patch - final state: 9/9 files, 185/185 tests green (up from this story's own pre-review 181, +4 from the new `equipmentLocationLabel` tests).
- Prove-discrimination (single-change revert -> exact expected test(s) fail -> restore -> green) performed for the one code-level patch.
- `node --check` on every touched `.js` file after the full patch set - all clean.

**Status**: no unresolved High/Medium findings; both addressable Low findings patched and verified, the third correctly dispositioned as a reviewer-side scope limitation -> `done`.
