# Adversarial review - issue-1122-pledge-pool-overcommit (Standing pledge-overcommitment indicator, render-time, both renderers), TM Game

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
   `specs/stories/code-review/issue-1122-pledge-pool-overcommit-codex-findings.md`, before you open
   anything the next pass allows. Do not revise an earlier pass's findings in light of what a later
   pass taught you - if a later pass contradicts an earlier one, say so as a new finding and leave the
   original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/issue-1122-pledge-pool-overcommit-diff.txt` and is relative to that root,
  taken against base commit `dab928ed` (the commit this story's branch, `ms/issue-1122-pledge-pool-overcommit`,
  was cut from `main`). The story's own commit is `492185f1`.
- The diff is **deliberately scoped to source and tooling only** (`public/js/editor/sheet.js` and the
  new `server/tests/issue-1122-pledge-overcommit-indicator.test.js`). The story-spec file
  (`specs/stories/issue-1122-pledge-pool-overcommit.story.md`) and the sprint-tracking file
  (`specs/stories/sprint-status.yaml`) are excluded from it on purpose, so the earlier passes stay
  genuinely blind to the author's own account. Do not treat their absence as an omission or go
  hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo (`TM Game`) lives inside an umbrella
  workspace alongside three sibling repos at `D:\Terra Mortis\TM Story`, `D:\Terra Mortis\TM Herald`,
  `D:\Terra Mortis\TM Admin`, and a `D:\Terra Mortis\TM Design System` repo. Do not read, open, or
  touch any of them - this review is scoped entirely to `TM Game`.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards.** The four test files this diff's own gate command names need **no database**
  - they stub `globalThis.location`/`localStorage`/`window`/`document` and dynamic-import the ES
    modules directly (no server, no Mongo, no fixtures on disk). If a run reports a DB-related skip or
    error, that is a genuine anomaly worth flagging, not something to route around silently. Other
    suites elsewhere in this repo DO need a local `mongod` and will legitimately SKIP without one - do
    not run the full 171-file suite; only the four/five files named below. This repo is on Windows;
    use forward-slash paths in commands, and run everything from `D:\Terra Mortis\TM Game`.
- **Blast radius, and a fact worth double-checking rather than assuming settled.**
  `shRenderGeneralMerits` (the function this diff modifies) renders the Merits section for **every**
  character, and is called from TWO separate apps sharing the one function: the ST-only admin editor
  (`public/js/editor/sheet.js` itself, both `editMode=true` and `editMode=false`) AND the
  player-facing read-only Suite sheet (`public/js/suite/sheet.js:739`, which calls
  `shRenderGeneralMerits(c, false)` - always view mode). **This means the new indicator this diff adds
  to the view-mode branches is player-visible, not admin-only, on every character with an
  over-committed pledge.** Check whether that is consistent with how the pre-existing `_pledgeBadge` /
  `_oathPledgeNote` badges already work (same call sites, unchanged by this diff - are they also
  already player-visible today?), and flag plainly if the new indicator's wording or implications
  read differently to a player than to an ST, or if this cross-app exposure looks like it was
  overlooked rather than deliberate. A mistake in the shared function affects both apps at once, not
  just the admin sheet.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `cd server && npx vitest run tests/issue-1122-pledge-overcommit-indicator.test.js tests/oath-a-render-and-gate.test.js tests/oath-a-pledge-helpers.test.js tests/issue-1128-dot-wrapper.test.js`
  and `node --check public/js/editor/sheet.js`. Report the real numbers even if they disagree with
  anything the story claims - especially then. (Reference point from this session's own run, for your
  own verification, not to be trusted uncritically: 114 passed / 1 failed across the four files; the 1
  failure is `oath-a-pledge-helpers.test.js`'s CRLF-vs-LF byte-identical-source assertion at line 388,
  against `xp.js`/`domain.js`, neither of which this diff touches - documented as a pre-existing
  environment artifact in this repo's own `CLAUDE.md`. Verify this independently rather than trusting
  the claim; if you get a different result, say so.)

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/issue-1122-pledge-pool-overcommit-diff.txt` and
**nothing else**. No spec, no story file, no project context. Do not explore the repository. Do not
go looking for the spec. Read other files only to resolve an import path the diff itself leaves
ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

Adds a render-time-derived "pledge overcommitment" indicator to `shRenderGeneralMerits` in
`public/js/editor/sheet.js`: a new `_pledgeOvercommitNote(m)` helper compares pledged dots (read from
the existing `buildPledgeIndex(c)` reverse index, via `_pledgeIdx.get(pledgeKeyFor(m))`) against owned
dots (`meritRating(c, m)`), and renders a `<div class="dom-cap-warn">` warning line when pledged
exceeds owned by some positive amount. It is wired into all four render branches of that function
(edit-mode granted-merit sub-branch, edit-mode plain-merit sub-branch, view-mode granted-merit
sub-branch, view-mode plain-merit sub-branch), so it appears on load with no prior edit required. It
reuses the existing `.dom-cap-warn` class (no new CSS rule added anywhere in this diff) and writes
nothing onto the merit object - purely a function of current state, computed fresh each render. A new
test file, `server/tests/issue-1122-pledge-overcommit-indicator.test.js`, adds 17 tests exercising it.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The `by` string drops per-oath dot amounts.** `_pledgeOvercommitNote` builds
   `[...new Set(e.oaths.map(o => o.oath))].join(', ')` - deduplicated oath NAMES only. A sibling
   function a few lines above it, `_pledgeBadge`, instead renders
   `e.oaths.map(o => o.oath + ' (' + o.dots + ')').join(', ')` - names WITH each oath's own dot
   contribution. Is dropping the per-oath breakdown in the new function an intentional
   simplification, or a real loss of information a reader would want (especially once two oaths both
   pledge against the same merit)? Check whether the summed "short" figure alone is enough to
   reconstruct what each oath is owed, or whether the wording could read as ambiguous/misleading with
   two-plus oaths in the list.
2. **Possible unescaped numeric interpolation.** `e.dots`, `owned`, and `short` are concatenated
   directly into the output HTML string without passing through `esc()` (unlike the oath-name list,
   which does use `esc()`). Trace where `e.dots` ultimately comes from: `buildPledgeIndex` does
   `entry.dots += att.dots || 0` where `att` is a `sworn_by.attachments[]` entry. If `att.dots` can
   ever be attacker- or ST-mistake-controlled as a non-numeric value (a string, say), JS's `+=`
   coerces via string concatenation, not numeric addition, once either side is non-numeric - so a
   crafted `dots` value could inject markup into an admin-rendered (and, per the Ground Rules blast
   radius note, player-rendered) HTML string with no escaping. Is this reachable in practice (check
   how `sworn_by.attachments` gets written - `validatePledge` and the API layer, if you can find it),
   is it a pre-existing exposure in `buildPledgeIndex`/`_pledgeBadge` this diff merely inherits rather
   than introduces, or is it newly exposed specifically by this diff's un-escaped concatenation? Say
   which.
3. **A defensive `'a standing oath'` fallback that may be dead code.** `esc(by || 'a standing oath')`
   - is there a real path where `e.dots > 0` but `e.oaths` is empty (making `by` an empty string), or
   is this fallback unreachable given how `buildPledgeIndex` always pushes into `oaths` in the same
   loop iteration it increments `dots`? If unreachable, is that worth flagging as dead code, or is it
   legitimate defensive coding?
4. **Self-contradiction check.** The diff's own doc comment on `_pledgeOvercommitNote` states the two
   notices (`_pledgeFloorNote` and the new one) "are NOT mutually exclusive and must not be merged"
   and describes a scenario where both can legitimately co-render on the same row. Does the actual
   code the diff writes support that claim, or does an early return somewhere silently prevent
   co-rendering despite the comment's claim?
5. **Assertions whose PASS condition might be too loose**, in the new test file: are there any
   `toContain`/`toMatch` checks whose target string could trivially match something unrelated (e.g. a
   generic substring that also appears in unrelated static markup this renderer already emits)?
6. **Placement relative to sibling calls.** In each of the four branches, the new call is inserted
   next to existing calls (`_pledgeFloorNote`, `_oathPledgeEditor`, `_prereqWarn`/`pw`). Is the
   resulting HTML tag structure still well-formed at each of the four insertion points (no
   unclosed/mismatched divs introduced by concatenation order)?
7. Standard sweep: dead code, unused imports, unreachable branches; error paths and resource cleanup
   (unlikely to apply here, this is synchronous pure rendering, but check); any check whose label
   claims more than it actually tests.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/issue-1122-pledge-pool-overcommit-codex-findings.md` now, before reading
further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need to
understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1's "What this diff claims to be" above - re-read it, then verify against the
real repository rather than trusting it.

### What to hunt for

1. **Hand-trace `_pledgeOvercommitNote(m)` for a merit pledged by TWO oaths, one at 0 dots.** Read
   `buildPledgeIndex` (`public/js/data/rules-helpers.js`) in full. Construct the exact sequence:
   oath A pledges 3 dots against merit X, oath B pledges 0 dots against merit X (a legal-looking but
   degenerate `sworn_by.attachments` entry with `dots: 0`). Walk the loop by hand: does oath B's name
   end up listed in the rendered "short against ..." text even though it contributed nothing to the
   sum? Is that correct or misleading?
2. **Renamed/deleted merit target.** If a `sworn_by.attachments` entry names a merit (by
   name+qualifier via `pledgeKeyFor`) that no longer exists on `c.merits` (renamed or removed after
   the oath was sworn), does ANYTHING render the over-commitment - or does it silently vanish because
   the rendering loop only iterates over `c.merits` that currently exist? Is this a pre-existing gap
   shared with `_pledgeBadge`/`_oathPledgeNote` (same iteration shape), or does it interact
   differently with the new function specifically?
3. **`meritRating`'s fallback branch.** Read `meritRating(c, m)` in `public/js/editor/xp.js` in full.
   It has an early-return fallback (`if (m.cp === undefined && m.xp === undefined) return m.rating || 0`).
   Trace whether any real general-merit shape reaching `shRenderGeneralMerits`'s loop could hit that
   fallback (e.g. legacy-format data, or a merit added via a path that never sets `cp`/`xp`), and if
   so, whether `_pledgeOvercommitNote`'s comparison still behaves sensibly against a `m.rating`-only
   merit.
4. **OATH-B suspension interaction.** `_pledgeOvercommitNote` deliberately reads `meritRating` (owned),
   NOT the suspension-adjusted effective rating (`shSuspendedOf`/`shDotsSuspended`, OATH-B's
   mechanic). Confirm by reading both mechanisms that a SUSPENDED merit (dots forcibly reduced only in
   the DISPLAYED solid-dot count, not in `owned`) does not spuriously trigger this indicator merely
   because of suspension, and that the two mechanics genuinely do not interact. State what you traced,
   not just that the doc comment claims zero accessor changes.
5. **Fixture fidelity.** In the new test file, `overcommittedFixture()` and the inline test fixtures
   construct `sworn_by` via `buildSwornBy(...)` and merit objects with `cp`/`xp`/`free_grants` fields
   directly (bypassing the normal edit path entirely, deliberately, per the diff's own comments -
   confirm you understand why before judging it as unrealistic). Cross-check the fixture shapes
   (`buildSwornBy`'s actual parameters, the `free_grants` map shape) against what the REAL write paths
   in this codebase actually produce, field for field - not just against what the test file assumes.
6. **Route/branch order**: are there exactly four call sites (not two, not six) once you count both
   the `granted_by` fork inside each mode? Verify by reading the full modified function, not just the
   diff hunks in isolation (diff context can hide a fifth site outside the shown hunks).

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/issue-1122-pledge-pool-overcommit-codex-findings.md` now, before reading
further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/issue-1122-pledge-pool-overcommit.story.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an
     AC's exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
   - Specifically check AC4 (warning tone, never `--err`/`.rel-error`) and AC7 (nothing persisted) -
     both are checkable by direct inspection.
4. **Write your Pass 3a findings down now, before moving on.**

**Explicitly NOT in scope, and deliberate - do not flag these as gaps, but DO flag if the diff quietly
does one of them anyway:**
- Wiring pledge/over-commitment awareness into `shRenderDomainMerits`, `shRenderInfluenceMerits`, or
  the standing-merits renderer. The story's own research found `sworn_by`/`buildPledgeIndex`/
  `_pledgeBadge` referenced nowhere else in `sheet.js` - confirm that claim is still true of the diff
  (i.e. it did not accidentally touch those renderers), but do not fault the diff for not extending
  them.
- Any change to `_pledgeFloorNote`, `_applyPledgeFloor` (`public/js/editor/edit.js`), or
  `_oathPledgeEditor`. These must be byte-identical to base.
- Closing the "1 of 7 merit-write paths gated by `_applyPledgeFloor`" gap (issue #1128's own finding).
  This story only makes an existing over-commitment visible; it does not prevent one arising.
- Any change to a dot count, `meritRating`'s own arithmetic, or the OATH-B suspension mechanic.
- The two notices (`_pledgeFloorNote` and the new indicator) being ALLOWED to co-render on the same
  row in the same pass - this is a deliberate, argued design decision in the spec (see its Dev Notes),
  not an oversight to flag.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims, including:
   - Exact test counts: 17 new tests, a genuine RED (10 failed / 7 passed) to GREEN (17/17) cycle
     against the unmodified base code.
   - The targeted regression set: 114 passed / 1 failed across the four named files, with the 1
     failure independently proven pre-existing via a `git stash push -u` A/B comparison against base
     (claimed: same test, same failing line, same result at base).
   - `node --check public/js/editor/sheet.js` clean.
   - Zero CSS files touched (claimed verified by grepping the diff).
   - A claimed in-browser verification: headless Chromium (Playwright) rendering the REAL
     `shRenderGeneralMerits` output against the real stylesheet, reading computed CSSOM colour values
     for the indicator in both Parchment and dark theme, and asserting they match `--warn-dk` and NOT
     `--err`, with specific `rgb(...)` values quoted for each theme.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Grep
   the files yourself. If a first run is inconsistent, run it twice and say so. You will not be able
   to reproduce the Playwright/CSSOM claim exactly (it depended on a scratch harness not committed to
   the repo) - say so plainly, and instead independently verify the underlying, checkable fact: read
   `.dom-cap-warn` and the `--warn-dk`/`--err` token definitions in `public/css/theme.css` and
   `public/css/components.css` yourself, and confirm by static reading that the class the diff's
   `_pledgeOvercommitNote` emits (`dom-cap-warn`) genuinely resolves to the warn token and not the
   error token, in both themes.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to
`specs/stories/code-review/issue-1122-pledge-pool-overcommit-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including the vitest gate command and `node --check`
  above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
