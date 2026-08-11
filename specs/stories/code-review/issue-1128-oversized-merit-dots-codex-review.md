# Adversarial review - issue-1128-oversized-merit-dots (the trait-dots wrapper), TM Suite

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
   `specs/stories/code-review/issue-1128-oversized-merit-dots-codex-findings.md`, before you open
   anything the next pass allows. Do not revise an earlier pass's findings in light of what a later
   pass taught you - if a later pass contradicts an earlier one, say so as a new finding and leave the
   original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/issue-1128-oversized-merit-dots-diff.txt` and is relative to that root,
  taken against base commit `158a713f` (the tip of `origin/dev` at the time this branch,
  `ms/issue-1128-oversized-merit-dots`, diverged). **The implementation is UNCOMMITTED in the working
  tree.** `git diff 158a713f -- public/js/editor/sheet.js` plus the one untracked new test file
  (`server/tests/issue-1128-dot-wrapper.test.js`) reproduces it.
- **This branch is based on `dev`, not `main`, deliberately** - the bug this fixes only exists in
  `dev`'s unreleased code (introduced by issue #1111 / OATH-B, never merged to `main`). Do not treat
  the `dev` base as an error or go comparing against `main`'s HEAD as if it were the relevant parent;
  `main` never had this bug and the fix's own correctness bar (AC1) is "render exactly what `main`
  already renders for a no-oath character," which the diff/tests do by embedding literal golden
  strings, not by diffing against a live `main` checkout.
- The diff is **deliberately scoped to source and tooling only**. The story spec
  (`specs/stories/issue-1128-oversized-merit-dots.story.md`) and tracking files
  (`sprint-status.yaml`, `deferred-work.md`) are excluded on purpose. Do not treat their absence as an
  omission.
- This is an umbrella workspace with sibling repos `../TM Cockpit`, `../TM Wiki`, `../TM Herald`.
  This diff does not touch any of them; you do not need to and should not open them.
- The working tree also carries unrelated debris (a large scratch pile under `server/scripts/_*`,
  a couple of stray untracked project files). None of it is part of this diff. Ignore it.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- **Do NOT connect to any MongoDB instance beyond what the vitest suite itself does, and do NOT start
  `cd server && npm run dev`.** This change touches no data and no server code at all - it is a pure
  frontend rendering fix. If you find yourself wanting a database connection to verify anything here,
  that's a sign you've misread the change's scope.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards**: none specific to this change - it's small, self-contained, and the touched
  test suites are fast. The full suite is still not a trustworthy gate in this repo generally; stick
  to the scoped commands below.
- **Blast radius**: `public/js/editor/sheet.js` is the single file rendering every character's admin
  sheet, in both view and edit mode, across every merit category (influence, contacts, domain,
  standing, general). This diff touches a small, well-defined slice of it (one helper block plus six
  call sites), but a mistake in the shared helper functions (`_shDotGlyphs`, `_shSuspendBands`) could
  silently affect dot rendering on rows this diff didn't intend to touch, since `shDotsMixed` (used by
  the six untouched "Bucket B" sites) was itself refactored to call the new shared primitive.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  - `cd server && npx vitest run tests/issue-1128-dot-wrapper.test.js tests/oath-b-suspension.test.js tests/oath-a-render-and-gate.test.js tests/n7a-necro-domain-render.test.js tests/stm-polish-408-dots.test.js`
  - `node --check public/js/editor/sheet.js`
  Report the real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/issue-1128-oversized-merit-dots-diff.txt` and
**nothing else**. No spec, no story file, no project context. Do not explore the repository. Do not
go looking for the spec. Read other files only to resolve an import path the diff itself leaves
ambiguous.

The blinding is the point.

### What this diff claims to be

`shDotsSuspended` used to always wrap its output in `<span class="trait-dots">` via `shDotsMixed`, and
six call sites in small-type containers (`.infl-dots-derived`, `.contacts-edit-hdr`,
`.dom-contrib-lbl`) inherited that oversized wrapper by accident, overflowing their layout. The fix
extracts the glyph-generation and suspension-arithmetic logic into two shared primitives
(`_shDotGlyphs`, `_shSuspendBands`), keeps `shDotsSuspended` as the wrapped entry point for rows
designed for it, and adds a new `shDotsSuspendedPlain` sibling for the six small-type rows to call
instead - bare glyphs, no wrapper, using the same shared arithmetic so the two paths can never
disagree about what a suspension looks like. One of the six repointed call sites (the Contacts edit
header) also has its `shSuspendedOf(m)` argument changed to `shSuspendedOf(contactsEntry)` - a
variable name change alongside the function-name change. A new test file asserts byte-identical
output against literal golden strings, suspension behaviour, and a source-level census of all call
sites of both functions.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The `contactsEntry` substitution is not purely mechanical - trace whether it changes behaviour.**
   The Contacts edit header's diff changes BOTH the function name (`shDotsSuspended` ->
   `shDotsSuspendedPlain`, expected) AND the argument to `shSuspendedOf` (`m` -> `contactsEntry`,
   NOT obviously required just to fix the wrapper bug). Without seeing where `m` and `contactsEntry`
   are declared (that requires Pass 2's repository access), reason from the diff alone: is there
   anything here suggesting `m` might have been a real, different, in-scope variable that this
   silently starts reading from a new source instead of a bug being fixed? Flag this as "needs Pass 2
   to resolve" rather than asserting an answer - but flag it prominently, because a variable
   substitution hiding inside what's framed as a purely cosmetic wrapper fix is exactly the kind of
   change that deserves scrutiny it might not get if reviewed as "just a rename."
2. **`shDotsMixed` was itself refactored, not just the new sibling added.** It used to have its own
   inline `if (!purchased && !bonus) return ''` check and its own glyph-building expression; now it
   calls `_shDotGlyphs` and wraps the result conditionally. Confirm the refactored version is
   behaviourally identical to the original for every input, not just the cases the new tests happen to
   cover - in particular the zero-dots case (`purchased=0, bonus=0`) must still return `''`, not
   `'<span class="trait-dots"></span>'`.
3. **The census test's regex-based counting.** `(code.match(/shDotsSuspendedPlain\(/g) || []).length - 1`
   and the equivalent for `shDotsSuspended\(` - verify by inspection that a literal
   `shDotsSuspendedPlain(` call can never be double-counted by the `shDotsSuspended\(` regex (i.e.
   that `shDotsSuspendedPlain(` does not itself contain `shDotsSuspended(` as a matching substring
   for that second regex - work through the exact characters). If it does overlap, the "6 plain / 6
   wrapped / 12 total" assertion could be silently wrong in a way that still happens to pass today.
4. **The `codeLines()` comment-stripping helper** (used throughout the new census test) filters lines
   whose TRIMMED text starts with `*`, `//`, or `/*` - it does not handle a trailing same-line comment
   after real code, nor a multi-line block-comment continuation that doesn't start with `*`. Is there
   any real call site in the visible diff context that could be mis-classified by this (falsely
   excluded because it happens to follow one of those markers on the same logical unit, or falsely
   included because a commented-out example wasn't on its own line)? Flag as "needs Pass 2 to check
   against the real file" if the diff alone doesn't settle it.
5. **Dead code / unused imports / self-contradiction.** Does anything in the diff still reference the
   pre-refactor `shDotsSuspended` behaviour in a comment that's now inaccurate?
6. **Any check whose PASS condition is trivially satisfiable** - in the new test file.
7. **The domain compound-target branch** (visible in the diff context around `dom-contrib-lbl`, the
   `_isCompoundTargetHere` branch) emits `'\u25CF'.repeat(_cmpOwn)` directly, inline, never calling
   `shSuspendedOf` or either dot-render helper at all. Is this pre-existing and genuinely out of this
   diff's scope (nothing here touched it), or does its total absence of suspension-awareness look like
   a related gap worth naming even if not this diff's job to fix? Judge from the diff context alone
   whether this line was touched or not.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/issue-1128-oversized-merit-dots-codex-findings.md` now, before reading
further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

### Orientation (not ground truth - verify against the code)

Same shape as Pass 1's summary: a shared glyph/suspension primitive extracted, a new unwrapped sibling
function added, six call sites repointed to it, one of those six also changed which variable it reads
suspension state from, and a new test file with golden-string, suspension-behaviour, and call-site
census coverage.

### What to hunt for

1. **Resolve Pass 1's `contactsEntry` question with an actual trace.** Read the full
   `shRenderInfluenceMerits` function in `public/js/editor/sheet.js`, specifically how `m` and
   `contactsEntry` are both scoped around the Contacts edit block. Is `m` genuinely out of scope at
   that point (a stale variable from an earlier, already-closed loop, which would make the original
   code a latent bug this diff incidentally fixes), or was `m` a real, different, currently-reachable
   variable whose replacement with `contactsEntry` changes what suspension count gets displayed for a
   real character? Try actually exercising this code path (a targeted test, or reading closely enough
   to trace every assignment) rather than asserting an answer from a skim.
2. **Confirm the regex non-overlap from Pass 1 with an actual character-by-character check** (or write
   a two-line script and run it) - does `/shDotsSuspended\(/g` match inside `shDotsSuspendedPlain(`
   anywhere in the real file content?
3. **Confirm `codeLines()`'s comment-stripping against the real file** - read
   `public/js/editor/sheet.js` around each of the twelve real call sites and confirm none of them sits
   on a line that would be misclassified (a trailing comment, an unusual multi-line comment shape).
4. **Walk every OTHER caller of `shDotsMixed`** (not just the six explicitly repointed sites) to
   confirm the refactored version produces byte-identical output for real inputs those callers
   actually pass - `shDotsThreeTier` and any other function in the same file that might call it.
5. **The domain compound-target branch's suspension gap** (Pass 1 item 7) - confirm with `git blame`
   or a diff against a recent base whether this line was touched by THIS diff or is genuinely
   untouched pre-existing behaviour, and if untouched, whether it represents a real, separate gap
   (a compound-target merit's suspended dots never reflect in its "My dots:" label) worth naming as a
   finding even though it's not this diff's own regression.
6. **Malformed or unusual input** to `_shDotGlyphs`/`_shSuspendBands` - what happens with a negative
   `purchased` or `bonus` (shouldn't be reachable from real merit data, but the pre-existing
   `Math.max(0, ...)` guards suggest someone worried about this before; confirm the refactor preserves
   that same defensiveness)?
7. **Route/matcher and state-mutation concerns**: none obviously apply to a pure render-string diff,
   but confirm nothing in the touched functions mutates the character object `c` or any merit object
   `m` as a side effect of rendering (a render function that mutates state it's supposed to only read
   would be a different, more serious class of concern than a styling bug).
8. **Fixture/mock shape vs. what the real functions actually read** - in the new test file, confirm
   the fixture character/merit objects used accurately reflect the real shape `shSuspendedOf` and the
   render functions expect (particularly `_suspended_dots`), not a simplified stand-in.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/issue-1128-oversized-merit-dots-codex-findings.md` now, before reading
further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/issue-1128-oversized-merit-dots.story.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the "Dev Agent Record" section yet.** Skip past it entirely.
3. Against the 9 acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (no touching the six already-correct call
     sites, no CSS changes at all, no broader OATH-B rework, no touching the two other known-but-
     separate oath gaps mentioned in the underlying GitHub issue).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Settled decisions - already ruled, do not re-litigate (but DO review their implementations):

- **Route (a) (a new unwrapped function) over route (b) (a CSS override)** is a deliberate, reasoned
  choice in the story. Do not propose the CSS route instead; DO check route (a) is implemented
  correctly and genuinely introduces zero CSS changes (AC6).
- **The domain compound-target branch and the six "Bucket B" call sites are explicitly out of scope**
  and must remain byte-identical/untouched. Do not flag their existing behaviour (including any
  suspension gap in the compound branch) as something THIS story should have fixed - it's fine to note
  it as a separate, real observation (per Pass 1/2 item 7), just don't treat it as an AC violation.
- **The two other known oath gaps** (missing `app.js` window handlers; the pledged-dot edit gate
  covering 1 of 7 write paths) are explicitly out of scope. Do not flag their absence.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **"Dev Agent Record"** section in full. It makes specific, checkable claims. Attack
   these:
   - **Exact test counts**: the new suite's count, and the combined targeted-suite figure. Run the
     scoped gate command yourself and compare.
   - **The AC8 "empty diff" claim**: that all six containers render byte-identical content on this
     branch versus `origin/main`, for a representative no-oath character. The golden strings are
     embedded as literal constants in the test file rather than derived from a live `main` checkout at
     test time (deliberately, per the story's own Dev Notes, because "main will move") - verify these
     embedded constants are what they claim to be by checking them against what `git show
     origin/main:public/js/editor/sheet.js` would actually render for the same six containers and the
     same fixture inputs, as closely as you can reconstruct without running a full app boot (reason
     through the six `main`-side code paths by hand if you can't execute them directly, and say
     explicitly which method you used).
   - **The claim of a second, independently-found bug**: that `dev`'s pre-fix code throws a
     `ReferenceError` at the Contacts edit header because `m` is out of scope there, and that this
     would crash the ENTIRE influence section of edit mode for any character with a Contacts merit.
     This is Pass 1/2's `contactsEntry` question from the other direction - confirm from the ORIGINAL
     (pre-diff) code whether this claim is true. If you can, reproduce the crash on `origin/dev`'s
     actual `sheet.js` (a targeted script/test importing it and calling the relevant render function
     for a fixture character with a Contacts merit) rather than just reading the code and trusting the
     record's own narrative.
   - **The claimed diff-hunk-count discrepancy** ("T5 predicted seven regions, git diff shows eight
     hunks, but all six Bucket B sites remain byte-identical") - verify the six named Bucket B line
     numbers are indeed outside every changed hunk in the actual diff.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Grep
   the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem - bearing in mind this is a release blocker for 40 queued commits on `dev`, so a
   real defect here has real cost, but so does an unnecessary delay from a false finding.

---

## Output

Write everything to `specs/stories/code-review/issue-1128-oversized-merit-dots-codex-findings.md`,
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
  debris; only confirm THIS diff's files are clean of unintended changes).
- Explicit confirmation you did NOT start the API server and made no manual MongoDB connection.
