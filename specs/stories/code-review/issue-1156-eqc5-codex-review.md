# Adversarial review - feature.1156.eqc5-remove-skill-acquisition (EQC-5 — Remove Skill-Based Acquisition), TM Suite

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
   `specs/stories/code-review/issue-1156-eqc5-codex-findings.md`, before you open anything the next
   pass allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if
   a later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite-eqc`. The diff is at
  `specs/stories/code-review/issue-1156-eqc5-diff.txt` and is relative to that root, taken against base
  commit `061f6ce6` (the change itself is committed at `e619f4f4` on branch
  `ms/issue-1156-eqc5-remove-skill-acquisition`).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/feature.1156.eqc5-remove-skill-acquisition.story.md`, `specs/deferred-work.md`) are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own account.
  Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo (`TM Suite`) sits in an umbrella workspace
  alongside three sibling repos - `TM Wiki`, `TM Cockpit`, `TM Herald`. Do not touch them even to read;
  they are out of scope for this review and this diff claims (checkably) to leave them untouched.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- Environment hazards to disclose rather than silently skip around: **never run two Playwright
  invocations concurrently** - they share port 8080 with `reuseExistingServer`, and this repo has other
  processes that may already hold it. Several vitest suites need a local `mongod`; without one they
  **SKIP rather than fail** - read the summary line, not just the exit code, and say explicitly if a
  suite skipped rather than ran. `npm test` is a no-op stub in this repo (`echo "Error: no test
  specified" && exit 1`) - the real gate is `npx vitest run server/tests`, run from the repo root.
- **Blast radius note**: the Acquisitions section's shared chrome - `.dt-acq-*` CSS classes,
  `PHASE_ACQUISITION`, the generic `data-acq-add-row`/`data-acq-row-remove`/`data-acq-dot`/
  `data-acq-unknown` delegated handlers, and the `acquisitions_resolved[]` two-slot array on the ST
  side - is **shared** with the Resources Acquisition channel, which stays fully live after this
  change. A mistake in the diff could silently break Resources acquisitions too, not just fail to
  remove Skill cleanly as intended. Weight findings on the Resources side accordingly - it is a
  regression risk, not an out-of-scope area.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `npx vitest run server/tests` (test files /
  tests passed / failed / skipped). Report the real numbers even if they disagree with anything the
  story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/issue-1156-eqc5-diff.txt` and **nothing else**. No
spec, no story file, no project context. Do not explore the repository. Do not go looking for the
spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

Removes a "Skill-Based Acquisition" sub-table (a form section letting a player roll a skill to acquire
a free item) from a Downtime Submission form used by a tabletop RPG character-management app. Touches
two client JS files (`downtime-data.js` - a question-definition data module, `downtime-form.js` - the
form renderer/collector, ~7500 lines total), two schema/doc files annotating now-unused fields as
legacy rather than deleting them, and adds one new static-analysis test file (vitest, source-string
assertions - no browser harness in this repo). A sibling "Resources Acquisition" sub-table in the same
form section is claimed to be untouched and must keep working identically.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The `if (resourceRows.length)` gate.** Before this diff it was
   `if (resourceRows.length || skillRows.length)`, guarding a block that rebuilds ~10 legacy mirror
   keys (`acq_slot_count`, `acq_${n}_*`, `acq_description`, `resources_acquisitions`, etc.). Confirm
   nothing inside that block still implicitly depended on the OR'd second condition, and that the
   simplification doesn't change behaviour for the resource-only case in any way beyond "skill mirror
   keys are no longer written inside it" (which is the intended change).
2. **Dangling references.** Grep the diff itself for any remaining use of `skillRows`, `_s0`,
   `skSkills`, `skillRow0`, `_renderSkillRow`, `_readSkillRows`, `skillAcqPoolStr`,
   `data-acq-skill`, `data-skill-acq-spec`, `rowKey === 'skill'`. Any surviving reference is either a
   `ReferenceError` waiting to happen or an incomplete removal.
3. **The Add/Remove row handlers.** They used to branch `rowKey === 'skill' ? 'acq_skill_rows' :
   'acq_resource_rows'` and are now hardcoded to `'acq_resource_rows'`. Confirm this diff's own new
   code never reads a `rowKey`/`dataset.acqAddRow` value it then ignores (dead parameter), and that no
   OTHER call site anywhere in the diff still emits a `data-acq-add-row`/`data-acq-row-remove` value
   other than `"resource"`.
4. **Self-contradiction within the diff.** The diff's own comments repeatedly claim "the ST-facing read
   side is untouched" and "the Resources sub-table is unchanged." Does anything in the actual code
   changes contradict that framing - e.g. a Resources-path line accidentally touched, deleted, or
   reordered alongside a Skill-path deletion?
5. **The schema/doc annotation changes.** `server/schemas/downtime_submission.schema.js` and
   `schemas/downtime_submission.schema.md` are claimed to be comment/prose-only edits with zero
   structural change. Verify: no field's `type` changed, no field was actually deleted, no duplicate
   key introduced, the JS object literal is still syntactically valid (mentally parse it), and the
   Markdown table's column count/structure is unchanged.
6. **The new test file's assertion quality.** `server/tests/issue-1156-eqc5-remove-skill-acquisition.test.js`
   - for each `it(...)`, does the assertion actually test what the title claims, or is it a
   trivially-satisfiable check (a `.toMatch` against a huge haystack that would pass for unrelated
   reasons, a regex loose enough to match something else entirely)? Pay particular attention to the
   test asserting the import line no longer names `skillAcqPoolStr` - does its regex definitely target
   the ONE import line intended, or could it silently match zero lines and the `.match(...)[0]` throw
   be masked by something?
7. Standard sweep: unused imports/variables left behind by the removal, unreachable branches, resource
   cleanup on error/throw paths (not applicable to most of this diff, but check the DOM-collector
   function for any leftover early-return path that now short-circuits incorrectly), and dead code.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/issue-1156-eqc5-codex-findings.md`
now, before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite-eqc`. Read whatever surrounding code you
need to understand what this change is actually plugging into. You still do **not** have the story
spec or any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Removes a "Skill-Based Acquisition" sub-table (a form section letting a player roll a skill to acquire
a free item) from a Downtime Submission form. A sibling "Resources Acquisition" sub-table in the same
form section is claimed to be untouched and must keep working identically. The ST-facing admin views
(`public/js/admin/downtime-views.js`, `public/js/admin/downtime-story.js`) and player summary
(`public/js/tabs/story-tab.js`) are claimed to be deliberately left unmodified so that historical
downtime cycles which already contain skill-acquisition data keep rendering correctly - only the
WRITE side (this form) is claimed to be removed, not the READ side.

### What to hunt for

1. **Trace `collectResponses()`'s acquisitions block end to end in `public/js/tabs/downtime-form.js`**,
   reading the ACTUAL current file (not just the diff hunks) from the `_collectAcqRows` definition
   through the end of the mirror-builder `if` block. Confirm, by tracing by hand: (a) with one or more
   resource rows present in the DOM, every previously-written mirror key still gets written with the
   same values as before this diff; (b) with ZERO resource rows in the DOM (edge case: section
   collapsed/never rendered), the block is skipped entirely and - per the code's own "spread base"
   comment - any PRE-EXISTING value for every one of those keys (including the `skill_acq_*` ones) on
   the response document is left completely alone, not cleared. This second case is the one the diff's
   own comments claim to fix; verify it is actually true by reading how `responses` is initialized at
   the top of `collectResponses()` (is it really built from a spread/copy of the previously-saved
   document, or could it start empty in some path?).
2. **Find the top of `collectResponses()`** and confirm exactly what `responses` is before this
   function's acquisitions block runs - grep for where `responses` (the local variable this block
   assigns into) is first declared/assigned in this function, and read enough of the function to state
   with certainty whether a pre-existing `skill_acq_description` (say) on a real saved submission
   really does survive an unrelated field's save now, or whether there's a code path where it
   wouldn't.
3. **Cross-module reference check.** `_renderSkillRow`/`_readSkillRows` were plain top-level (not
   exported) functions. Grep the WHOLE repository (not just the diff) for any reference to either name,
   and separately for `skill_acq_pool_skill`, `skill_acq_pool_spec`, `skill_acq_description`,
   `skill_acq_availability`, `skill_acq_merits`, `skill_acquisitions`, `acq_skill_rows` outside of
   `downtime-form.js`, the two schema files, and the new test file, to confirm nothing else in the
   codebase (admin views, story panel, CSV import/export scripts, migration scripts) was relying on the
   form still producing these keys going forward, or on the two now-deleted functions.
4. **Route/matcher order for the delegated click handlers.** `downtime-form.js` has one large
   click-delegation listener with many `if (...) { ...; return; }` branches checked in sequence. Confirm
   the removal of several skill-specific branches didn't change which branch a given click target now
   matches for anything ELSE in the form (i.e., no other handler's selector could now accidentally
   shadow or be shadowed differently because an earlier `return` is gone).
5. **The new test file's import-line regex** (`/^import \{[^}]*\} from '\.\.\/data\/accessors\.js';$/m`)
   - read the ACTUAL current import statement in `downtime-form.js` character-for-character and confirm
   this regex genuinely matches it as a single line (not wrapped, no trailing comment on the same line
   that would break the `$` anchor). If this test is fragile to an unrelated future formatting change,
   note it, but the priority is: does it correctly assert the RIGHT thing right now.
6. **Fixture/schema shape check.** In the schema file, confirm every `skill_acq_*`/`skill_acquisitions`/
   `acq_skill_rows` property really still exists with `{ type: 'string' }` (not silently narrowed,
   widened, or given a new `enum`/`pattern` that could reject legitimate historical data on a future
   read-modify-write cycle through this schema, if anything validates against it - check whether
   anything actually validates `responses` against this schema at runtime, or whether it's
   documentation-only given `additionalProperties: true`).
7. **State leakage between the Resources and (removed) Skill code paths** - was there ever a shared
   mutable variable, closure, or DOM query that Skill's removal could have subtly changed the timing or
   ordering of for Resources (e.g. `_collectAcqRows` is a shared closure; confirm its removed
   `rowKey === 'skill'` branch removal didn't change its behaviour for `rowKey === 'resource'` calls in
   any way, including code that runs even when the `if` branch isn't taken).

**STOP. Write your Pass 2 findings to `specs/stories/code-review/issue-1156-eqc5-codex-findings.md`
now, before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/feature.1156.eqc5-remove-skill-acquisition.story.md` - the **Story**,
   **Acceptance Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "Explicitly NOT this story" section is equally load-bearing** -
     check the change did not quietly do an excluded thing.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate - do not flag these as gaps: any code change to
`public/js/admin/downtime-views.js`, `public/js/admin/downtime-story.js`, or `public/js/tabs/story-tab.js`
(deliberately untouched - the story's own "stop writing, keep reading" shape); deleting any
`skill_acq_*`/`skill_acquisitions`/`acq_skill_rows` schema field (fields are intentionally kept,
annotated legacy rather than removed, to preserve historical-cycle rendering); any CSS change to
`.dt-acq-*` classes (intentionally untouched - shared with Resources); fixing or modifying
`tests/fix-493-skill-acq-outcome-summary.spec.js` or `tests/fix-player-skill-acq-outcome.spec.js`
(the story's own record documents these as having pre-existing, unrelated failures it deliberately
did not fix - you may independently verify that claim in Pass 3b, but "the story didn't fix them" is
not itself a gap); adding a PATCH/edit endpoint for acquisitions; resolving the EQC-1-era
container-instance-identity ambiguity; touching `schemas/downtime_v1.schema.json` (a separate legacy
CSV-import schema, deliberately out of scope).

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims:
   - "`npx vitest run server/tests` post-change: 100 failed suites / 80 passed, 2 failed tests / 1191
     passed / 1153 skipped - zero new failures vs. the pre-change baseline (100 failed / 79 passed, 2
     failed / 1169 passed / 1153 skipped)." Run it yourself and compare exactly.
   - "The new test file (`server/tests/issue-1156-eqc5-remove-skill-acquisition.test.js`) has 22 tests,
     all passing." Run just that file and confirm the count and result.
   - "`tests/fix-491-skill-acquisition-outcome-card.spec.js` and
     `tests/fix-914-acquisition-outcome-field-slot.spec.js` are fully green (14/14 combined) after this
     change." Run them.
   - "`tests/fix-493-skill-acq-outcome-summary.spec.js` (4/4) and one test in
     `tests/fix-player-skill-acq-outcome.spec.js` fail, but this is PRE-EXISTING and unrelated - the
     author claims to have confirmed this via `git stash` isolation against the pre-story baseline
     (commit `061f6ce6`), and attributes it to both files' fixtures placing skill-acquisition outcome
     data at `acquisitions_resolved[0]` (the pre-fix.914 slot) instead of `[1]` (the post-fix.914,
     currently-correct slot)." This is the single highest-value claim to attack: (a) run
     `git log --oneline -- tests/fix-493-skill-acq-outcome-summary.spec.js tests/fix-player-skill-acq-outcome.spec.js`
     and confirm neither file was touched by this story's commit (`e619f4f4`); (b) read the failing
     fixture(s) directly and confirm they really do place skill data at index `[0]`; (c) if you have
     time, actually check out `061f6ce6`, run the same two spec files, and confirm the identical
     failures exist there too, then return to `e619f4f4` — do not leave the repo checked out anywhere
     other than `e619f4f4`/the review branch when you finish.
   - "This change removed one handler beyond the AC's own enumerated list
     (`[data-acq-skill-spec]`/`acqSkillSpec`) as provably dead code." Grep the current file for any
     surviving emitter of that attribute to confirm the claim.
   - "TM Wiki, TM Cockpit, and TM Herald are completely untouched." Trivially true for a change
     confined to this repo, but confirm the diff and commit really do only touch paths inside this repo.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Run the
   drivers yourself. Grep the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/issue-1156-eqc5-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including `npx vitest run server/tests`.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
