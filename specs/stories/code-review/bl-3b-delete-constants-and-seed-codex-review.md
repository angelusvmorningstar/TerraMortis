# Adversarial review - bl-3b-delete-constants-and-seed (delete the bloodline constants, retire the seed), TM Suite

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
   `specs/stories/code-review/bl-3b-delete-constants-and-seed-codex-findings.md`, before you open
   anything the next pass allows. Do not revise an earlier pass's findings in light of what a later
   pass taught you - if a later pass contradicts an earlier one, say so as a new finding and leave the
   original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/bl-3b-delete-constants-and-seed-diff.txt` and is relative to that root,
  taken against base commit `70e1c02c`. **The implementation is UNCOMMITTED in the working tree** on
  branch `bl/bl-1-bloodline-collection`; `git diff 70e1c02c -- public/js server/routes
  server/schemas server/scripts server/lib server/tests server/ws.js CLAUDE.md` plus the two
  untracked new test files (`server/tests/helpers/bloodline-fixtures.js`,
  `server/tests/bl3b-constants-deleted.test.js`) reproduces it.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/bl-3b-delete-constants-and-seed.story.md`, `sprint-status.yaml`,
  `deferred-work.md`) are excluded from it on purpose, so the earlier passes stay genuinely blind to
  the author's own account. Do not treat their absence as an omission or go hunting for them.
- This is an umbrella workspace with sibling repos `../TM Cockpit`, `../TM Wiki`, `../TM Herald`.
  This diff does not touch any of them; you do not need to and should not open them.
- The working tree also carries unrelated debris - a large scratch pile under `server/scripts/_*`
  (map-generation tooling, over a thousand untracked files), plus two other untracked project files
  (`.claude/session-start.md`, `.claude/session-wrap.md`) and a stray `tm-map.html`. None of it is
  part of this diff or this story. Ignore it entirely; do not treat it as scope.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- **Do NOT connect to any MongoDB instance beyond what the vitest suite itself does, and do NOT
  start `cd server && npm run dev`.** `server/.env` in this repo carries LIVE PRODUCTION
  credentials - there is no sandbox mode. The project's own vitest suite forces every test onto a
  `tm_suite_test` database via its setup file, so running vitest is safe; hand-starting the API
  server is not, because it would connect to the real chronicle. This story writes NO data of any
  kind (it deletes code and moves a file), so there should be no reason to need a live server at all.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards**: the full test suite is NOT a trustworthy signal in this repo right now.
  Seven-plus pre-existing failures are known and unrelated to this change (#1116, #1115, #1125,
  #1117, `issue-837-xp-totals-deprecation`, `n8-mandragora-prereq`, `issue-836-legacy-tracker-cache-removed`),
  and this story's own author claims to have found two more, also unrelated
  (`epic.708.3-cycle-phase-controls`, `n7-n9-allocator-readers` - grep both against the diff yourself
  to confirm they touch nothing this change modifies before accepting that claim). Do not run the
  full suite and treat its raw result as information; use the scoped gate commands below.
- **Blast radius**: `public/js/dev-fixtures.js` is loaded whole as ONE script for every local-dev
  session under `local-test-token` - it is not just the bloodline fixture, it is `CHARS`,
  `TERRITORIES`, `DT_CYCLES`, `DT_SUBS`, `GAME_SESSIONS` and `TRACKER_STATE` too, all in the same
  file. A single malformed line anywhere in this diff's edit to that file (a JSON syntax error in the
  new `BLOODLINES` blob, a broken `window.fetch` shim) would break local dev testing for EVERYTHING,
  not just bloodlines. `public/js/data/constants.js` is imported by many files across this app for
  the exports that are NOT being touched (`CLANS`, `COVENANTS`, `CLAN_DISCS`, etc.) - a mistake in
  where the three deleted exports sat relative to the rest of the file could corrupt something
  unrelated.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  - `cd server && npx vitest run tests/bl3b-constants-deleted.test.js tests/bl1-bloodlines-api.test.js tests/bl2-clandisclist-miss-path.test.js tests/bl2-bloodlines-cache.test.js tests/bl3a-one-inclan-implementation.test.js tests/bl4-bloodlines-write-api.test.js tests/bl4-bloodlines-refetch.test.js tests/bl4-bloodlines-admin-view.test.js tests/bloodline-parallel-write.test.js tests/dt-form-territory-fresh-fetch.test.js tests/repo-no-nul-bytes.test.js`
  - `node --check` on every JS file named in the diff (note the archived seed script moved directory;
    check it at its NEW path, `server/scripts/archive/seed-bloodlines.js`).
  Report the real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/bl-3b-delete-constants-and-seed-diff.txt` and
**nothing else**. No spec, no story file, no project context. Do not explore the repository. Do not
go looking for the spec. Read other files only to resolve an import path the diff itself leaves
ambiguous.

The blinding is the point.

### What this diff claims to be

This is a deletion/retirement story: three JS constants (`BLOODLINE_DISCS`, `BLOODLINE_CLANS`,
`APPROVED_BLOODLINES`) are removed from `public/js/data/constants.js` (a sibling export,
`CLAN_DISCS`, is explicitly kept). A one-time migration script,
`server/scripts/seed-bloodlines.js`, is moved to `server/scripts/archive/` and made self-contained -
the two constants it needs are inlined as frozen literals rather than imported, and every relative
import gains a directory level. Two remaining live importers of the deleted constants are rewired:
`public/js/dev-fixtures.js` (a local-dev fixture interceptor, now serving a frozen JSON blob instead
of computing one from the constants) and `public/js/tabs/wizard.js` (a dead file with zero
importers, fixed anyway so a future revival doesn't inherit a broken import). Four test files that
depended on the constants or the seed are repointed or retired, and a new test file,
`bl3b-constants-deleted.test.js`, adds a suite of repo-wide guards - source greps proving nothing
still references the deleted names, and an equality check proving two frozen fixture copies
(`dev-fixtures.js`'s blob and a new `server/tests/helpers/bloodline-fixtures.js`) cannot silently
drift apart.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The CRLF/regex extraction in the new test's AC 8 equality check.** `bl3b-constants-deleted.test.js`
   parses the `var BLOODLINES=` line back out of `dev-fixtures.js`'s raw source text with
   `/^var BLOODLINES=(\[.*\]);$/m`, then `JSON.parse`s the captured group. The file is CRLF (a
   DIFFERENT test in the same suite explicitly says so and handles it by `.trim()`-ing each line
   before matching). This regex-based extraction does NOT visibly trim anything before matching - `.`
   in a JS regex matches `\r` (it excludes only `\n` by default). Walk through what happens if the
   line actually ends `...];\r\n` in the raw file: does `(\[.*\])` greedily consume into the `\r`
   before backtracking to satisfy `;$`, could a trailing `\r` end up inside the captured group text
   fed to `JSON.parse`, and would that throw, silently succeed with mangled data, or is this concern
   unfounded because of some detail in how the regex engine actually resolves `$` in multiline mode
   against a `\r\n` pair? Reason through this carefully; it is exactly the kind of thing that looks
   fine in review and fails on the one platform where line endings are actually CRLF (which, per the
   diff's own git warnings, this repository's checkout is).
2. **The `code()` helper's comment-stripping regex**, used throughout the new test file to strip
   `/* */` and `//` comments before every grep-based assertion:
   `.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')`. Is this regex safe against
   a `//` that occurs INSIDE a string literal elsewhere in one of the files it's applied to (a URL, a
   regex literal containing `//`, a comment-like sequence in a template string)? If it can
   mis-classify code-as-comment, the grep-proof tests built on top of it (AC 1, AC 2) could have a
   false-negative blind spot - a real remaining reference to a deleted constant that happens to sit
   after a `//`-containing string earlier in the same line or file could be silently excluded from
   the check it's supposed to be caught by.
3. **The archived seed's inlined constants** (`server/scripts/archive/seed-bloodlines.js`) are frozen
   `const BLOODLINE_DISCS = {...}` / `const BLOODLINE_CLANS = {...}` literals, copy-pasted from what
   was deleted out of `constants.js`. A single dropped entry, a mistyped discipline name, or a
   transposed clan mapping here would silently corrupt the ONLY remaining bulk-migration path into a
   fresh collection, and nothing in a diff-only read can prove it's byte-for-byte faithful. Flag this
   explicitly as "needs a full diff against the original, which Pass 2 can do" rather than asserting
   an answer you can't have yet.
4. **Any check whose PASS condition is trivially satisfiable.** One candidate already visible: a test
   asserting `expect(specs.length).toBeGreaterThan(0)` on the archived seed's resolved relative
   imports, before checking each one resolves - a file with ANY import passes this half regardless of
   whether it's the RIGHT imports. Look for others of the same shape across the new test file.
5. **Dead code, unused imports, self-contradiction within the diff.** Does anything import something
   it no longer uses after the rewire (e.g. `wizard.js`'s new `bloodlinesByClan` import versus its
   old `BLOODLINE_CLANS` one - is the old one actually gone from the import list, not just unused)?
6. **Error paths and resource cleanup**: none of this diff appears to touch runtime error handling
   directly (it's mostly deletions and a test file), but check whether the new
   `bl3b-constants-deleted.test.js`'s file-walking helper (`walkJs`) has any failure mode on a
   permission error, a symlink, or an unreadable file that would make the whole suite report a false
   "no offenders found" rather than a hard failure.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/bl-3b-delete-constants-and-seed-codex-findings.md` now, before reading
further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec
or any account of the author's intent - work from the code itself.

### Orientation (not ground truth - verify against the code)

Same shape as Pass 1's summary: three dead constants deleted, a migration script archived and made
self-contained, two remaining importers rewired, four coupled test files repointed or retired, and a
new guard suite proving the deletion is total and two frozen fixture copies stay in sync.

### What to hunt for

1. **Deep-compare the archived seed's inlined `BLOODLINE_DISCS`/`BLOODLINE_CLANS` against the
   original.** Run `git show 70e1c02c:public/js/data/constants.js` and diff its `BLOODLINE_DISCS`
   and `BLOODLINE_CLANS` blocks against `server/scripts/archive/seed-bloodlines.js`'s inlined
   literals, entry by entry - all 23 bloodline names, all four disciplines each, all five clan
   mappings. This is the single highest-value check in this pass: a silent transcription error here
   would only ever surface the day someone actually re-runs the archived seed against an empty
   collection, by which point the source of truth is gone.
2. **Resolve the CRLF/regex question from Pass 1 with an actual read.** Open
   `public/js/dev-fixtures.js` and inspect the raw bytes around the `var BLOODLINES=` line (a hex
   dump or an explicit check for `\r` characters near the end of that line is more conclusive than
   reasoning about the regex alone). Then actually run the extraction the test performs (you have
   full tool access - write a tiny standalone script if that's the fastest way to prove it either way)
   and confirm whether it succeeds, and if so, whether the parsed result is byte-identical to what
   `JSON.parse` on a clean, LF-only copy of the same line would produce.
3. **Walk what `bl4-bloodlines-write-api.test.js` now asserts in place of the deleted
   `seed.deriveSlug === shared.deriveSlug` identity check.** Read the replacement assertions in full
   and judge whether they still meaningfully guard against a second slug implementation reappearing
   somewhere in `server/`, or whether they only check that the OLD file path no longer exists (a much
   weaker guarantee that would not catch a NEW duplicate implementation showing up somewhere else).
4. **Confirm the repointed test files still test something real, not just a swapped import.** Read
   `bl2-clandisclist-miss-path.test.js` and `bl3a-one-inclan-implementation.test.js` in full,
   specifically the assertions the story's own notes say used to read "matches `BLOODLINE_DISCS`" and
   now read "matches the 23 as migrated" - confirm the actual expected values in those assertions are
   still meaningful (drawn from the fixture helper, not accidentally hardcoded to something stale or
   trivially true) after the repoint.
5. **Confirm `wizard.js` genuinely still has zero importers** after this diff - grep the whole repo
   (`public/`, `server/`, any test directory) for any static or dynamic import of `wizard.js`. The
   story's own premise for fixing rather than deferring its dangling import depends on this being
   true; if anything DOES import it (even a test), the risk calculus changes.
6. **Read the deleted `bl1-seed-bloodlines.test.js` at its last committed state**
   (`git show 70e1c02c:server/tests/bl1-seed-bloodlines.test.js`) and compare its full coverage
   against what survives: the `deriveSlug` block should have relocated into
   `bl4-bloodlines-write-api.test.js`, and the AC 6 guard suite should cover the unique-index
   creation behaviour. Is there anything else in the deleted file - the integrity gate, drift
   detection, cross-check logic - that tested a behaviour NOT otherwise covered by anything still in
   the suite, even though the migration itself is retired? A behaviour losing its only test coverage
   silently, because the file testing it happened to be a migration-script test, is worth flagging
   even if the behaviour itself is deliberately no longer exercised in production.
7. **Read the `CLAUDE.md` diff and check it against the real current code** - does its corrected
   description of where bloodlines now live (collection, cache module, admin screen, archived seed
   path) actually match the real file paths and module names in this repo right now, or does it
   contain any stale/incorrect reference introduced by the correction itself?
8. **Route/matcher and module-load-order concerns**: does deleting the three exports from
   `constants.js` change the file's overall structure in any way that could affect what other,
   unrelated exports from the same file resolve to (e.g. if the deletion left a stray brace, a
   dangling comma in an adjacent object literal, or shifted something that depends on declaration
   order)? Read the whole file, not just the diff hunk.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/bl-3b-delete-constants-and-seed-codex-findings.md` now, before reading
further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/bl-3b-delete-constants-and-seed.story.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the "Dev Agent Record" section yet.** Skip past it entirely.
3. Against the 9 acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (no BL-5 write-once work, no change to the
     `bloodlines` collection's live data, no change to `CLAN_DISCS`, no change to BL-4's admin
     screen/routes/shared modules, no wiring `wizard.js` into any app, no new `dev-fixtures.js`
     branches for BL-4's admin endpoints, no fixing of unrelated `deferred-work.md` items).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Settled decisions - already ruled, do not re-litigate (but DO review their implementations):

- **The after-Game-7 timing gate does NOT bind this story** - the story argues this change has zero
  live behavioural effect (nothing reads the deleted constants for costing after BL-3a; the seed
  isn't part of the running app; `dev-fixtures.js` only executes under `local-test-token`). Do not
  flag the absence of a deploy-timing gate as a gap; DO check the underlying premise (zero live
  behaviour change) actually holds.
- **`wizard.js` is fixed, not deferred, and stays completely unwired** - a deliberate call, reasoned
  in the story. Do not propose deferring it instead; DO check the fix itself is correct and that
  nothing wires the file in as a side effect.
- **No `bmad-data-lock` pass was run**, by the story's own explicit judgement that this deletes code
  and writes no data. Do not flag its absence as a process gap unless you find this story DOES
  actually depend on an unverified data shape somewhere.
- **`CLAN_DISCS` is explicitly out of scope** and must remain untouched, still exported, still used by
  `accessors.js`'s no-bloodline fallback.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **"Dev Agent Record"** section in full. It makes specific, checkable claims. Attack
   these:
   - **Exact test counts** for the touched/adjacent suites (the record states specific green counts
     for the new suite plus two other groupings, and a full-suite figure of 165/174 files passing with
     9 named reds, 7 on the known list and 2 newly flagged as NOT on it -
     `epic.708.3-cycle-phase-controls` and `n7-n9-allocator-readers`). Run the scoped gate command
     yourself and compare. For the two newly-flagged reds specifically: confirm by reading their
     source that they genuinely grep/assert against files this diff does not modify, so the claim
     "pre-existing, not caused by this story" is actually verifiable rather than just asserted.
   - **The browser-verification claim**: "11 bloodline characters, zero misses, no warn banner,
     Actaeon and Malkovians costing correct" under `local-test-token`. You cannot re-run a browser
     session, but you CAN check this claim for code-level plausibility: read the fixture data
     (`dev-fixtures.js`'s `CHARS` blob) for how many carry a `bloodline` field, and trace
     `bloodlinesByClan()`/`isInClanDisc()` by hand for the Hounds of Actaeon and Malkovians cases
     specifically (both are cited in the epic's own history as the two-way costing-error cases that
     motivated this whole epic) to confirm the code would genuinely produce the claimed correct
     result against the new frozen fixture data.
   - **"The admin-to-player WS hop is only HALF observable locally"** - the record states
     `refetchBloodlines()` fires and re-resolves under a WS frame, but `dev-fixtures.js` intercepts
     the refetch's own fetch too, so new admin-side data still can't reach a `local-test-token`
     session. Verify this by reading the actual refetch code path and confirming it really does hit
     the same intercepted `fetch` the boot load uses, with no separate code path that would behave
     differently.
   - **"Production still holds ZERO bloodline documents, 13 characters carry a bloodline, 13/13
     resolve"** - a live-data claim. You do NOT have credentials or permission to query production
     yourself in this review; do not attempt to. Note this as unverifiable-by-you rather than treating
     silence as confirmation, and do not flag it as a defect merely because you can't check it.
   - **Any claim about which files were "declared" as a deviation** (fixture field shape, the
     `CLAUDE.md` edit, the `bloodline-slug.js` stale-comment note) - read the cited files and confirm
     the deviation is real and accurately described, not overstated or understated.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Grep
   the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/bl-3b-delete-constants-and-seed-codex-findings.md`,
grouped `## High` / `## Medium` / `## Low`, each finding tagged with the pass that produced it
(`[Pass 1]`, `[Pass 2]`, `[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading
rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the gate commands from the Honesty section.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change - note the working tree has pre-existing unrelated
  debris, listed in Ground rules above; only confirm THIS diff's files are clean of unintended
  changes, not the whole tree).
- Explicit confirmation you did NOT start the API server and made no manual MongoDB connection beyond
  what the scoped vitest gate itself performs.
