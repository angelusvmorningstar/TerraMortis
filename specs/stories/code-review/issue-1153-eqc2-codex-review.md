# Adversarial review - EQC-2 (on-me vs owned-elsewhere display distinction, issue #1153),
TerraMortis (TM Suite)

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
   `specs/stories/code-review/issue-1153-eqc2-codex-findings.md`, before you open anything the next
   pass allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if
   a later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. **Quote this path in every shell command you run** - it
  contains a space. The diff is at `specs/stories/code-review/issue-1153-eqc2-diff.txt` (relative to
  that root), taken between base commit `cb863812` (the tip of the prerequisite EQC-1 branch,
  `ms/issue-1152-eqc1-bucket-container-schema`) and the CURRENT, uncommitted working tree on branch
  `ms/issue-1153-eqc2-onme-elsewhere-display` (this story's changes are not yet committed - the diff
  is against the live working tree, not two commits).
- The diff is **deliberately scoped to source and tooling only**. The story spec
  (`specs/stories/feature.1153.eqc2-onme-elsewhere-display.story.md`) is excluded from it on purpose,
  so the earlier passes stay genuinely blind to the author's own account. Do not treat its absence as
  an omission or go hunting for it before Pass 3.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** The working tree is uncommitted - be extra careful with
  any temporary-edit experiment (see below), since there is no commit to `git checkout --` back to if
  you get the restore wrong; use `git diff` to confirm your restore matches the ORIGINAL diff file's
  content exactly, not just "no error".
- **This is an umbrella workspace.** `D:\Terra Mortis\TM Suite` sits alongside three sibling repos:
  `D:\Terra Mortis\TM Wiki`, `D:\Terra Mortis\TM Cockpit`, `D:\Terra Mortis\TM Herald`. **Never modify,
  commit, or push in any of them, under any circumstance**, and you should not need to read them either
  - this change is entirely self-contained within TM Suite.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff` against the diff file above (not just against HEAD, since HEAD here is
  `cb863812` which does NOT yet include this story's own changes), and say so in your output.
- **Environment hazards**: `npm test` (vitest, `server/` directory) needs a local `mongod` for several
  suites - they SKIP rather than fail without one. The equipment-specific suites you'll run
  (`equipment.test.js`, `equipment-client-fixes.test.js`,
  `issue-868-ecm-1-equipment-catalogue-api.test.js`, `issue-871-876-ecm-4-9-bundle.test.js`,
  `issue-872-ecm-5-editor-cache.test.js`, `issue-896-availability-filter.test.js`,
  `issue-879-defence-penalty-wirein.test.js`, `issue-1152-eqc1-bucket-migration.test.js`,
  `issue-873-ecm-6-admin-sidebar.test.js`) need `mongod` for their integration slices - if those skip,
  disclose it and report what DID run.
- **Blast radius**: this is a SMALL, additive change - `isEquipmentOnMe` is a NEW pure predicate with
  no existing callers to break, and it REPLACES (not adds alongside) four previously-duplicated inline
  state checks in `roll.js`/`roll-v2.js`. The real risk here is narrower than EQC-1's: getting the
  consolidation wrong (e.g. accidentally changing which states count) would regress an already-shipped
  mechanic (armour/weapon/skill bonus eligibility) that live characters currently depend on, even
  though the STORY itself is "just a display label."

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: the equipment-related vitest suites named
  above, run individually. Report the real numbers even if they disagree with anything the story
  claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/issue-1153-eqc2-diff.txt` and **nothing else**. No
spec, no story file, no project context. Do not explore the repository. Do not go looking for the
spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

### What this diff claims to be

A new pure predicate `isEquipmentOnMe(item)` in `equipment-derivation.js` (true for
`state` in `{carried, worn, active}`, false otherwise/for a null item), used to (a) REPLACE four
previously-duplicated inline `item.state === 'carried' || ... === 'worn' || ... === 'active'` checks
in `roll.js` and `roll-v2.js` (two call sites each) with calls to the shared function, and (b) drive a
new "On you" / "Stored elsewhere" text label added to six sections of `editor/sheet.js`'s equipment
renderer (Weapons, Armour, Other Combat Gear, Skill Gear, Tools/Utility, Narrative), computed as
`item.state === 'lost' ? null : (isEquipmentOnMe(item) ? 'On you' : 'Stored elsewhere')`. The
`Container` section is claimed to be deliberately EXCLUDED from the new label. Two test files are
updated: new behavioural tests for `isEquipmentOnMe` itself, and updated source-string checks for the
consolidated roll.js predicates.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The consolidation in `roll.js`/`roll-v2.js` is the highest-risk part of this diff** - it replaces
   INLINE, already-shipped logic with a function call. Compare the OLD inline condition
   (`item.state === 'carried' || item.state === 'worn' || item.state === 'active'`) against
   `isEquipmentOnMe`'s own body EXACTLY, character for character. Any divergence (a missing state, an
   extra state, a typo) silently changes which items grant a weapon-reference entry or a skill-bonus
   chip for every character in the game.
2. **The `locationLabel` helper's `lost` special-case**: `item.state === 'lost' ? null : ...` - trace
   every one of the six call sites in `sheet.js` to confirm a `null` return is actually handled
   correctly at each one (some sites build an array and `.filter(Boolean)` it; at least one site
   builds a joined string with `.filter(Boolean).join(' · ')`; the Narrative section handles it via a
   separate `loc` variable with its own conditional block) - a `null` slipping through unfiltered at
   any ONE of the six sites would render the literal string "null" in a player-facing sheet.
3. **Trivially-satisfiable assertions**: scan the new test assertions for anything that would pass even
   if the underlying logic were wrong.
4. **Self-contradiction within the diff**: does the AC/comment claim about Container exclusion actually
   hold - is there truly no `locationLabel` call anywhere in the Container-bucket render block, or did
   one slip in?
5. **Dead code**: is `isEquipmentOnMe` actually called from every site the diff's comments claim, or
   does any comment describe a consolidation that the code doesn't actually perform (e.g. a comment
   saying "consolidated onto isEquipmentOnMe" above a line that still has the old inline check)?
6. **Unused imports**: do `roll.js`/`roll-v2.js` still import `isEquipmentOnMe` if literally nothing in
   the final diff calls it, or vice versa (called but not imported, which would be a runtime
   ReferenceError)?

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/issue-1153-eqc2-codex-findings.md` now, before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need.
You still do **not** have the story spec or any account of the author's intent.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1: a new shared `isEquipmentOnMe` predicate replacing duplicated inline state
checks in two roll-calculator files, plus a new on-me/elsewhere text label added to six of seven
equipment-sheet render sections.

### What to hunt for

1. **Hand-trace all four consolidated call sites** (`roll.js` weapon-reference filter, `roll.js`
   skill-bonus chip filter, `roll-v2.js`'s equivalents) for a `state: 'active'` item and separately for
   a `state: 'stashed'` item. Confirm the post-consolidation behaviour is IDENTICAL to what the removed
   inline condition would have produced for both. This is the single most important trace in this
   review - a wrong answer here is a live regression to an already-shipped mechanic.
2. **`locationLabel`'s "On you"/"Stored elsewhere" text and the EXISTING `stateChip`/`STATE_LABELS`
   display** (`Carried`/`Worn`/`Stashed`/`Lost`/`Active`) now both render on the same equipment row.
   Read the surrounding markup for each of the six sections and confirm there is no case where these
   two labels contradict each other in a way a player would find confusing (e.g. does anything ever
   show "Worn" next to "Stored elsewhere" - trace whether that combination is even reachable given
   `isEquipmentOnMe`'s own definition, since `worn` is one of the three "on me" states).
3. **Grep the WHOLE repo** (not just the six touched files) for any OTHER place that re-derives a
   `carried`/`worn`/`active` state check inline that this diff did NOT consolidate - is `roll.js`/
   `roll-v2.js` really the complete set of duplicated call sites, or does e.g. `downtime-form.js` or
   an admin file have its own copy that was missed?
4. **`editor/sheet.js`'s Container section**: read it in full and confirm independently (not just
   trusting Pass 1's read) that no `locationLabel` call exists there, and that this is a deliberate
   omission consistent with containers being locations rather than carried possessions - not an
   oversight that happens to look intentional.
5. **Malformed/absent input**: what does `locationLabel` (or the inline expression, if it's not
   extracted as its own named function - check which) return for an equipment item with a missing or
   unrecognised `state` value (not one of the five known enum values)? Trace whether it falls to "On
   you", "Stored elsewhere", or `null`/undefined, and whether that's a sensible fail-safe.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/issue-1153-eqc2-codex-findings.md` now, before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/feature.1153.eqc2-onme-elsewhere-display.story.md` - the **Story**,
   **Background**, **Explicitly NOT this story**, and **Acceptance Criteria (1-6)** sections.
2. **Do NOT read the "Dev Agent Record" section yet.** Skip past it entirely for now.
3. Against the six acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**.
   - **"Explicitly NOT this story" is equally load-bearing** - check the change did not quietly do one
     of the excluded things (no new schema field; no change to any bonus-application logic; no
     "available in downtime" wiring; no label on Container rows; no DT form change).
   - AC #4's specific claim that "on you" (carried) and "bonus active" (worn, for armour) are proven
     independent by a test, not merely asserted.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly settled/out of scope for this story, per its own account - do not flag these as gaps if
genuinely absent: a new/stored schema field for on-me/elsewhere (deliberately rejected - it's a
derived predicate over the existing `state` field); any change to `armourDefencePenalty`'s own
`worn`-only gating; a downtime-usable-inventory feature; a Container-row label; any DT form change.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes several specific, checkable claims:
   - `isEquipmentOnMe` consolidated FOUR previously-duplicated call sites (two per file, two files).
   - The Container section was verified via grep to have zero `locationLabel` calls, confirming the
     exclusion was deliberate and complete.
   - Full equipment suite: 9 files, 181/181 (up from EQC-1's own 177).
   - `isEquipmentOnMe` was prove-discriminated (temporarily dropped 'active' from the OR, confirmed
     exactly 1 test failed, restored).
   - A branching mistake (branched from `origin/main` instead of EQC-1's tip) was caught and corrected
     before any EQC-2 code was written - verify this claim is even meaningful given what you can see:
     is there any trace of it in the current diff, or was it genuinely fully cleaned up as claimed?
6. **Verify each claim by running it, not by reading it.** Run the equipment-related vitest suites
   yourself, right now. Grep the files yourself to confirm the "four call sites consolidated" and
   "zero Container calls" claims.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/issue-1153-eqc2-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including the named vitest suites.
- **Anything you could not run, and why.**
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change, since the working tree here has no commit to fall
  back on).
