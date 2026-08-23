# Adversarial review - rlv-1-fix-combat-tab-quick-roll-silent-failure (fix combat-tab's Quick Roll silently no-oping under the new-roller flag), TM Game

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
   `specs/stories/code-review/rlv-1-fix-combat-tab-quick-roll-silent-failure-codex-findings.md`,
   before you open anything the next pass allows. Do not revise an earlier pass's findings in light
   of what a later pass taught you - if a later pass contradicts an earlier one, say so as a new
   finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/rlv-1-fix-combat-tab-quick-roll-silent-failure-diff.txt` and is relative
  to that root, taken against base commit `6672fd5c` (the merge-PR-#1195 commit, the tip of `main`
  immediately before this story's branch was cut).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo is one of several sibling repos in a larger
  umbrella workspace (`TM Story`, `TM Herald`, `TM Admin`, `TM Design System` all live as siblings
  under `D:\Terra Mortis\`) - do not read or touch anything outside `D:\Terra Mortis\TM Game` for
  this review.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards**: Playwright tests spin up a local dev server on port 8080 with
  `reuseExistingServer` - never run two Playwright invocations concurrently, and if a stray server is
  already holding that port your run may pass against stale content rather than what's on disk.
  Chromium must be installed (`npx playwright install chromium` if a run fails on a missing browser).
  If either happens, disclose it rather than silently retrying or skipping.
- **Blast radius**: `public/js/app.js` is this app's single SPA entry point, loaded by every player
  and ST on every boot. This diff makes `combat-tab.js` import a value FROM `app.js` - which already
  imports `combat-tab.js` itself at an earlier line - the first circular module reference anywhere in
  this codebase. If ES module circular-resolution doesn't behave the way this diff assumes, the
  failure mode is not confined to the Combat tab or Quick Roll: it could break `app.js`'s own module
  evaluation for every consumer, i.e. the whole app failing to boot.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `cd server && npx vitest run tests/rlv-1-combat-tab-quick-roll.test.js`,
  `npx playwright test tests/rlv-1-quick-roll-tab-fix.spec.js`, and
  `npx playwright test tests/issue-1018-parallel-roll-tab-flag.spec.js` (run from the repo root).
  Report the real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at
`specs/stories/code-review/rlv-1-fix-combat-tab-quick-roll-silent-failure-diff.txt` and **nothing
else**. No spec, no story file, no project context. Do not explore the repository. Do not go looking
for the spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

`combat-tab.js`'s `quickRoll()` previously always wrote a pool into `roll.js` and always called
`goTab('dice')`, which silently no-ops once `app.js`'s boot-time DOM-subtree removal has deleted
`#t-dice` (whenever a `tm-use-new-dice-roller` flag is on, only `#t-roll` survives). The fix reads
`app.js`'s newly-exported `USE_NEW_ROLLER` const to choose both the `loadPool` call (`roll.js` vs
`roll-v2.js`) and the `goTab` target (`dice` vs `roll`) together. This introduces a circular import:
`combat-tab.js` now imports from `app.js`, which already imports `combat-tab.js` at a line preceding
`USE_NEW_ROLLER`'s own declaration. Two new test files are added - a vitest unit suite mocking every
one of `combat-tab.js`'s dependencies, and a Playwright spec doing source-fetch regex assertions plus
two live-browser boot-smokes - since no test previously covered `combat-tab.js` at all.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. `export const USE_NEW_ROLLER = ...` sits mid-file in `app.js`, not at the top. Confirm this is
   genuinely valid, unremarkable ESM (it is legal to export a `const` anywhere at module top level)
   and not a syntax or ordering hazard the diff introduces.
2. The new `combat-tab.js` import order is `roll.js`, then `roll-v2.js`, then `app.js`. Does import
   statement ORDER matter at all here given the circular reference, or is that a red herring (ESM
   import bindings are hoisted regardless of textual order)? State your reasoning, don't just assert.
3. `const load = USE_NEW_ROLLER ? loadPoolV2 : loadPoolV1;` inside `quickRoll()` - `USE_NEW_ROLLER` is
   declared `const` in `app.js`. Confirm this ternary reads a value that is fixed for the lifetime of
   the page (only changes on a full reload) and that nothing in this diff assumes it could change
   without one.
4. `window.goTab(USE_NEW_ROLLER ? 'roll' : 'dice')` - the diff alone gives you no evidence that
   `'roll'` is a real, navigable tab id recognised by whatever `goTab` actually does. Flag this as
   "needs verification against the real `goTab`" rather than asserting it's fine or broken from the
   diff alone.
5. `doRoll` stays imported into `combat-tab.js` from `roll.js` and, per the diff, still unused after
   this change. Self-contradiction check: does anything in this diff actually reference it now
   (search the full diff, not just the changed lines), making the "still unused" framing wrong?
6. The new vitest suite mocks `app.js` with a plain object literal containing `get USE_NEW_ROLLER()
   { return mockUseNewRoller; }`, and flips `mockUseNewRoller` between tests without re-importing the
   module under test. Is this a pass condition that's trivially satisfiable for the wrong reason -
   e.g., would the test still "pass" if `combat-tab.js` had imported `USE_NEW_ROLLER` as a plain
   destructured value captured once at import time (stale) rather than read fresh each call, given
   how the mock and the getter interact? Reason through Vitest's actual ESM mock semantics here rather
   than assuming.
7. The two new Playwright boot-smokes only assert on the ABSENCE of `pageerror`/console-error text
   matching a specific regex (`/USE_NEW_ROLLER|combat-tab|Cannot access.*before initialization|circular/i`).
   Could a genuine circular-import failure manifest silently instead - e.g. an import resolving to
   `undefined` without throwing, causing `USE_NEW_ROLLER` to be falsy regardless of the real flag,
   with no console error at all? If so, this pass condition would be trivially satisfiable even when
   the underlying assumption is broken.
8. General sweep: unhandled rejections, resource cleanup on the thrown path, dead code, unreachable
   branches introduced anywhere in the four changed/new files.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/rlv-1-fix-combat-tab-quick-roll-silent-failure-codex-findings.md` now,
before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1's "What this diff claims to be" section above - re-derive it against the real
code now that you can read the repo, rather than trusting the restated shape.

### What to hunt for

1. Open `public/js/app.js` in full and hand-trace its own top-level module evaluation order: every
   `import` statement, then every top-level statement in file order. `combat-tab.js` is imported via
   `import { initCombatTab } from './game/combat-tab.js';` well before the line that now reads
   `export const USE_NEW_ROLLER = ...`. Confirm, by reading `combat-tab.js`'s own top-level code (not
   just `quickRoll()`), that nothing there reads `USE_NEW_ROLLER` at module-evaluation time rather
   than inside a function body called later - that's the entire safety argument for this circular
   import, and it needs to be verified against the real file, not assumed from the diff.
2. Open `public/js/game/combat-tab.js` in full. Confirm `quickRoll()` (via
   `window.combatQuickRoll`) is the ONLY call site in this file that navigates to a roller tab -
   search for every other `goTab(` call in the file and confirm none of them were missed by this fix.
3. Open `public/js/app.js`'s `goTab(t, ctx)` function and confirm `goTab('roll')` actually resolves to
   a real, distinct, navigable tab (`document.getElementById('t-roll')`) and doesn't collide with some
   other meaning of the string `'roll'` elsewhere in that function or in `NAV_ALIAS`/`TAB_SUBTITLES`.
4. Open `public/js/suite/roll.js` and `public/js/suite/roll-v2.js` and diff their two `loadPool`
   function bodies yourself, byte for byte. The Dev Agent Record (which you haven't read yet) is
   irrelevant here - independently confirm whether they are actually identical, and if there is ANY
   difference at all (even whitespace/comments), note it precisely.
5. `suiteState.rollChar = c;` is set immediately before `load(pool, label, { total: pool })` is
   called. Trace into whichever `loadPool` you just diffed and confirm it reads `state.rollChar` (the
   module-scoped state in that same file, NOT `combat-tab.js`'s `suiteState`) at a point AFTER that
   assignment has had a chance to matter - or confirm the two `rollChar`/`state.rollChar` references
   are in fact different, unconnected objects entirely, and explain what that means for the banner
   text `loadPool` writes.
6. Malformed/absent input: what does `quickRoll(charId, pool, label)` do if `pool` is `0`,
   negative, or `NaN`? This behaviour predates this diff (unchanged), but confirm it behaves
   IDENTICALLY regardless of which `loadPool` (`v1` or `v2`) ends up being called - i.e. that the
   flag-based branch this diff adds doesn't accidentally introduce a NEW divergence for this
   pre-existing edge case.
7. In the new vitest suite (`server/tests/rlv-1-combat-tab-quick-roll.test.js`), the mocked
   `loadPool` fns are bare `vi.fn()`, called and asserted with positional args
   `(pool, label, { total: pool })`. Cross-check that shape, field for field, against what the REAL
   `loadPool` in `roll.js`/`roll-v2.js` actually destructures as its parameters (`total, name, pi`) -
   confirm the test's mock genuinely matches the real call signature and isn't silently testing a
   shape the real function doesn't use.
8. Read the new Playwright spec (`tests/rlv-1-quick-roll-tab-fix.spec.js`) end to end and, for each
   regex assertion, find the exact line(s) in the real `combat-tab.js`/`app.js` it's meant to match.
   Confirm each regex could not ALSO match an unintended location (a comment, a different function, a
   test file it might accidentally fetch instead of the real source) given the actual current file
   contents.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/rlv-1-fix-combat-tab-quick-roll-silent-failure-codex-findings.md` now,
before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/rlv-1-fix-combat-tab-quick-roll-silent-failure.md` - the **Story**,
   **Acceptance Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or Change Log sections yet.** Skip past them entirely. Reading
   the author's own record first anchors you on their framing and turns a review into grading
   homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate - do not flag these as gaps: cleaning up the dead `doRoll`
import in `combat-tab.js` (explicitly deferred to a later `rlv.6` story, when `roll.js` itself is
deleted); any change to `combat-tab.js`'s own inline `d10()` initiative-roll code; any change to the
BODIES of `roll.js` or `roll-v2.js` themselves (both files are required to stay byte-identical on
every gameplay-critical function per this epic's own Phase 0 audit, and this diff must not be the one
that breaks that); a full interactive Playwright click-through of the Combat tab itself (it sits
behind Discord OAuth with no test-account fixture anywhere in this suite, matching the established
precedent already in `tests/issue-1018-parallel-roll-tab-flag.spec.js` for this exact area, which you
are free to open and compare against).

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** and **Change Log** in full. It makes specific, checkable claims:
   - `loadPool` is byte-identical between `roll.js` and `roll-v2.js` ("no surprise to flag").
   - The circular import is safe because `USE_NEW_ROLLER` is only read inside `quickRoll()`'s function
     body, at call time - "verified empirically... two live-browser Playwright boot-smokes... both
     pass clean."
   - The new vitest suite has exactly 6 tests; the new Playwright spec has exactly 5 tests.
   - A regression run across "11 vitest files / 346 tests" came back green.
   - Re-running `tests/issue-1018-parallel-roll-tab-flag.spec.js` came back "7/8 passing", with the
     one failure (`roll-v2.js`'s `doRoll` being `async` vs a regex written for the non-async form)
     confirmed pre-existing via a `git stash` A/B comparison against this same diff, unrelated to it.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Run the
   drivers yourself. Grep the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to
`specs/stories/code-review/rlv-1-fix-combat-tab-quick-roll-silent-failure-codex-findings.md`, grouped
`## High` / `## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`,
`[Pass 2]`, `[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than
dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the vitest and Playwright gate commands
  named above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
