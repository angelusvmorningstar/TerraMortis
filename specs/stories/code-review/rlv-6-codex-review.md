# Adversarial review - rlv.6 (Delete dice-engine.js and its dead sidecar wiring), Terra Mortis TM Game

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

This is a small, mechanical, low-risk change (dead-code deletion) — match your effort accordingly.
Do not manufacture findings to fill space; a clean "nothing found" in a pass is a legitimate,
expected outcome here.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. Do not open a file a later pass
   grants you until you reach that pass. In particular: **the story spec is deliberately NOT in the
   diff.** Do not go looking for it during the earlier passes. The final pass will hand you the path.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/rlv-6-codex-findings.md`, before you open anything the next pass allows.
   Do not revise an earlier pass's findings in light of what a later pass taught you - if a later pass
   contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at `specs/stories/code-review/rlv-6-diff.txt` and
  is relative to that root, taken against base commit `7d80228c`.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/epic-rlv-roller-harmonisation.md`, `specs/stories/sprint-status.yaml`, and the story file
  itself) are excluded from it on purpose, so the earlier passes stay genuinely blind to the author's
  own account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo (`TM Game`) is one of several sibling repos
  in an umbrella workspace (`TM Story`, `TM Herald`, `TM Admin`, `TM Design System`, all outside this
  repo root) - do not read or touch any of them even out of curiosity; they are unrelated to this diff.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazard, specific to this repo**: this app registers a Service Worker (`public/sw.js`)
  that has been confirmed, in a prior story's own review round, to intercept `/api/characters` ahead
  of Playwright's `page.route()` stubs and serve real cached production data. This diff's own test
  changes (`tests/admin.spec.js`) don't depend on character data at all, so it's unlikely to matter
  here, but if you see unexpected real character names in any Playwright output you run yourself,
  that is this known, disclosed, unrelated hazard — not a new bug, and not something to re-diagnose.
- **Blast radius**: `public/js/admin.js`'s `switchDomain()` is the dispatcher for every admin-app
  domain (Player, City, Spheres, Downtime, Attendance, Data, Ordeals, Rules, and formerly Engine). A
  mistake in removing one branch could plausibly disturb the branches around it, not just the one
  meant to go.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe (see Author Claims below for the exact
  commands). Report the real numbers even if they disagree with anything the story claims -
  especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/rlv-6-diff.txt` and **nothing else**. No spec, no
story file, no project context. Do not explore the repository. Do not go looking for the spec. Read
other files only to resolve an import path the diff itself leaves ambiguous.

### What this diff claims to be

A dead-code deletion: an entire unreferenced admin-app file (`public/js/admin/dice-engine.js`, a
one-time dice-roller tool) is deleted; the one file that imported it (`public/js/admin.js`) drops
that import and a no-op domain-switch branch that referenced it; an orphaned CSS block for the
deleted file's own markup is removed from `public/css/admin-layout.css`; two now-pointless Playwright
test blocks are deleted from `tests/admin.spec.js`; a new vitest suite proves the deletions took and
stay taken.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. `public/js/admin.js`'s diff hunk around the dropped import: confirm the replacement comment text
   doesn't accidentally swallow or duplicate the pre-existing `#836` comment immediately below it, and
   that the file's import block still parses as valid JS (no orphaned punctuation from the removed
   line).
2. `public/js/admin.js`'s `switchDomain()` hunk: confirm removing the `if (domain === 'engine') {...}`
   line did not also remove, merge, or reorder any adjacent `if (domain === '...')` branch — the diff
   should show exactly one line removed from that function, nothing else touched.
3. `public/css/admin-layout.css`'s diff hunk: this removes a very large contiguous block (~187 lines).
   Confirm the diff's own context lines show a clean removal — no stray leftover `{`/`}` at either
   boundary, no rule split in half, no unrelated rule accidentally caught in the deletion.
4. `tests/admin.spec.js`'s diff hunks (two separate deletions): confirm each deleted block is a
   complete, self-contained `test(...)` or `test.describe(...)` call — removing a check for orphaned
   trailing `});`/`}` or a dangling opening brace with no matching close.
5. The new file `server/tests/rlv-6-dice-engine-removed.test.js`: check each `expect(...).not.toMatch(...)`
   regex is specific enough that it couldn't already have been passing before this diff for an
   unrelated reason (i.e. the regex genuinely targets what the diff removed, not something that was
   never there to begin with) — flag anything you can't confirm without the pre-diff file state as
   "worth checking in Pass 2."
6. Self-contradiction check: does anything in the diff's own remaining comments (e.g. the `#836`
   comment block) claim something was removed/never existed that this very diff's context shows is
   still present, or vice versa?
7. Standard sweep: dead code, unused imports, unreachable branches left behind, any assertion whose
   PASS condition is trivially satisfiable.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/rlv-6-codex-findings.md` now, before
reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1 above.

### What to hunt for

1. Repo-wide grep for `dice-engine`, `initDiceEngine`, `#dice-engine`, `#feeding-engine`, and
   `de-char`/`de-roll` (the deleted file's own internal element IDs) across `public/**`, `tests/**`,
   and `server/**`. Confirm genuinely nothing outside what this diff already touched still references
   any of them.
2. Read `public/admin.html` in full (or grep it for "engine", case-insensitively). Confirm there is
   really no `data-domain="engine"` button, `#d-engine` element, or `#engine-content` element anywhere
   — i.e. that the deleted `switchDomain()` branch and the deleted CSS block were genuinely already
   unreachable before this diff, not merely "unreachable after" it.
3. Read `public/js/admin.js`'s `switchDomain()` function in full as it stands now (not just the diff
   hunk). Walk every remaining `if (domain === '...')` branch and confirm each one still corresponds
   to a real `data-domain="..."` button in `admin.html` — i.e. this deletion didn't silently strand
   any OTHER domain the same way Engine already was, and didn't miss a second dead branch this diff
   should also have caught.
4. Read the surviving parts of `tests/admin.spec.js` around both deletion points (the "Admin —
   Sidebar" describe block, and the boundary between "Admin — City Domain" and "Admin — Theme"). Trace
   that the file's structure is still a valid Playwright test module and that no other test in either
   surrounding describe block implicitly depended on ordering or shared state from a deleted test.
5. Read `public/css/admin-layout.css` around both deletion boundaries (before line ~2570 and after the
   deletion, where `.cd-player-view` now follows directly). Confirm no selector that legitimately
   needs to survive (e.g. anything under the separate `#session-tracker` block that follows) was
   caught in the deleted range, and that the file overall still has balanced braces (count `{` vs `}`
   yourself and report the numbers).
6. Malformed/absent input: is there any code path anywhere that could still try to call
   `initDiceEngine` dynamically (e.g. via a string-keyed dispatch table, `window[...]`, or similar)
   rather than the plain static import this diff removed? Grep broadly enough to be sure, not just the
   obvious literal import.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/rlv-6-codex-findings.md` now, before
reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/rlv-6-delete-legacy-roller-and-flag.md` - the **Story**, the **"CRITICAL"**
   section, **Acceptance Criteria**, **Tasks/Subtasks**, **"What this story is NOT"**, and **Dev
   Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record section yet.** Skip past it entirely. Reading the author's own
   record first anchors you on their framing and turns a review into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an
     AC's exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the diff did NOT touch `admin-layout.css`'s separate `#session-tracker` block, and did NOT
     touch `tests/admin.spec.js`'s "Admin — Next Session Panel" describe block or its
     `data-domain="engine"` clicks — both are explicitly named as out of scope, on purpose, with a
     real reason given in the story.
   - Specified behaviour that is missing, or present only in appearance (e.g. AC6 names four specific
     checks the new test file must contain — confirm all four are genuinely present and meaningful).
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Already ruled on - do not re-litigate these, and do not flag their absence as a gap:**
- The epic's original framing ("delete once ported by rlv.4") was investigated and corrected before
  this story was written — the story's own "CRITICAL" section explains why in full. Do not
  re-question whether this deletion is safe on the "was it really unblocked" axis; that was already
  settled by direct investigation (zero live callers, no DOM mount point, a prior 2026-06-17
  investigation note already flagging it as dead).
- `admin-layout.css`'s `#session-tracker` block and `tests/admin.spec.js`'s "Next Session Panel"
  tests are DELIBERATELY left untouched — confirmed pre-existing, unrelated bugs/debt, explicitly
  named as out of scope. Do not flag their continued existence as something this diff should have
  fixed.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes these specific, checkable claims:
   - The new suite `server/tests/rlv-6-dice-engine-removed.test.js` passes 7/7. Run it yourself:
     `cd "D:\Terra Mortis\TM Game\server" && npx vitest run tests/rlv-6-dice-engine-removed.test.js`
   - A 14-suite vitest batch (grep `server/tests/*.test.js` yourself for files referencing
     `admin.js` if you want to reproduce the exact list) passes 342/342, with exactly one suite
     (`issue-836-legacy-tracker-cache-removed.test.js`) failing to *load* on an unrelated, pre-existing
     `ENOENT` for `public/js/suite/tracker.js` — verify this specific claim: does that file's failure
     really trace to a path this diff never touches, i.e. is the claimed unrelatedness true?
   - The full `tests/admin.spec.js` Playwright suite (all tests, not a subset) was run twice: once
     against this diff (claimed **11 passed / 14 failed**) and once `git stash`-isolated against the
     pre-diff base (claimed **11 passed / 20 failed**), with the claim that the 6-test delta is
     *exactly* the tests this diff deliberately removed, and every one of the remaining 14 failures is
     identical between both runs. You do not need to reproduce the full stash isolation yourself
     (that's expensive) — but DO run `npx playwright test tests/admin.spec.js --reporter=line` once
     against the current diff yourself and confirm the 11/14 split, then spot-check that the 14
     failing test *names* you see match what the record claims (Auth Gate's "player gets redirected
     away from admin", Sidebar's "cross-app nav buttons exist", the 7 "Next Session Panel" tests,
     Player Domain's "character grid container exists", 4 City Domain tests, Theme's "CSS custom
     properties load").
   - The claim that `admin-layout.css` is brace-balanced after the deletion (2308 open, 2308 close).
     Verify with your own count.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. If a
   first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed"/"verified" label can itself be wrong -
   re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/rlv-6-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including the commands named in Pass 3b step 5.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
