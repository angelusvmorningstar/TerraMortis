# Adversarial review - oxp-4 (Merit purchase — persists across handover), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

This is a SMALL diff (one file gains two comments, one new test file) — scale your effort
proportionally. Do not manufacture findings to fill sections; a short, honest "nothing found" is a
better outcome than padding.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. In particular: **the story spec is
   deliberately NOT in the diff.** Do not go looking for it during the earlier passes.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/oxp-4-codex-findings.md`, before you open anything the next pass
   allows.
3. At the very end, **attest** to what you actually did.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at `specs/stories/code-review/oxp-4-diff.txt`,
  taken against base commit `ddf059f8`.
- The diff is **deliberately scoped to source and tooling only**. The story spec and
  `sprint-status.yaml` are excluded on purpose — do not treat their absence as an omission.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it.
- **Do NOT modify, commit, or push anything.** `TM Suite` sits inside an umbrella workspace
  (`D:\Terra Mortis`) alongside sibling repos `TM Cockpit`, `TM Wiki`, `TM Herald`, and non-repo
  content folders. Stay entirely inside `D:\Terra Mortis\TM Suite`.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails,
  restore it) **is allowed and encouraged** - restore it exactly, confirm with `git diff`, say so.
- **This machine may run DB-backed tests against a real local MongoDB.** If it's unreachable, the
  `describe.skipIf(!dbAvailable)` blocks skip rather than fail — say explicitly whether your run
  genuinely exercised the DB-backed tests or whether they skipped, and don't report a skip as green.
- **Known shared-tree hazard**: this working directory has been used by more than one concurrent
  process today (an earlier review session for a different story hit stray orphaned processes and
  branch-checkout collisions from OTHER Claude Code sessions working on unrelated Epic EQC branches
  in this same directory). If `git status`/`git branch --show-current` ever looks inconsistent with
  what you expect mid-review, note it in your Validation notes rather than assuming your own error.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing in a pass or at a severity, say that explicitly.
- Report the exact current gate numbers you observe:
  `cd server && npx vitest run tests/oxp-4-merit-persistence-handover.test.js tests/office-merit-dots.test.js tests/issue-1141-office-tab-render.test.js`.
  Report the real numbers even if they disagree with anything else you're told.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/oxp-4-diff.txt` and **nothing else**.

### What this diff claims to be

A small, comment-plus-test change. `server/routes/office-merit-dots.js` gains two explanatory
comments (no logic change) documenting that its `office_merit_dots` collection is keyed purely by
office category, with no character/holder reference, and that this is what makes an existing
feature ("merit purchase state") survive a change of officeholder. `server/tests/oxp-4-merit-persistence-handover.test.js`
is a new test file that exercises this claim end to end through real HTTP routes (character
creation, a character update route that changes `court_category`, and the merit-dots GET/PUT
routes), plus a static source-analysis block asserting the client-side wiring in a different file
(`office-tab.js`, not itself part of this diff) never threads a character identifier into the
merit-dots API calls.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **Do the two added comments actually match the code they sit next to?** Read the GET and PUT
   handlers in full (not just the diff's `+` lines) and confirm the comments' claims ("keyed by
   category alone", "no character id is ever stored") are literally true of the code as it exists,
   not just plausible-sounding.
2. **The delete-cascade test** (`'deletes of the holder character leave the office merit suite
   intact'`) asserts a NEGATIVE about a file entirely outside this diff (`characters.js`'s hard-
   delete cascade). A negative assertion about code you cannot see in the diff is easy to get wrong
   by assumption. Is there anything in the test itself that would make it pass even if the cascade
   DID silently touch `office_merit_dots` (e.g. checking the wrong collection, checking before the
   delete actually completes, a response code that doesn't confirm what it seems to)?
3. **Test-isolation risk**: this new file's `beforeEach` does `office_merit_dots.deleteMany({})` and
   `characters.deleteMany({ name: { $regex: ... } })` — a blanket wipe of the ENTIRE
   `office_merit_dots` collection, not just this file's own fixtures. The pre-existing sibling file
   `office-merit-dots.test.js` does the identical blanket wipe in its own `beforeEach`. If vitest
   runs test files concurrently against one shared test database, could these two files' blanket
   wipes race and cause spurious failures in either file depending on scheduling? Flag as "worth
   checking" rather than asserting either way from the diff alone.
4. **The unescaped-regex shape**: `{ name: { $regex: \`^${FIXTURE_PREFIX}\` } }` interpolates a
   constant string directly into a MongoDB regex with no escaping. `FIXTURE_PREFIX` ('OXP4 Handover
   ') happens to contain no regex metacharacters today, so this is not currently exploitable, but is
   the PATTERN itself worth flagging as fragile (a future edit to the prefix string, e.g. adding
   parentheses or a dot, would silently change matching semantics)?
5. **Self-contradiction / weak assertions**: does `expect(block).not.toMatch(/\b_id\b/)` (the
   "never references a character... or a holder" test) risk being too broad — could it start failing
   for an unrelated, legitimate future reason (e.g. a DOM element id containing `_id` as a
   substring) that has nothing to do with the guarantee it's meant to protect? Is the regex boundary
   (`\b_id\b`) actually correctly scoped, or could it either over-match (false failures later) or
   under-match (miss a real character-id leak, e.g. `characterId` or `char._id` without a word
   boundary before `_id`)?
6. Standard sweep: assertions whose pass condition is weaker than their label claims, dead code,
   whether the new test file's `it(...)` titles (which cite AC numbers) actually match what their
   bodies assert.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/oxp-4-codex-findings.md` now,
before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`.

### What to hunt for

1. **Resolve the test-isolation question from Pass 1 for real.** Read this project's vitest config
   (`server/vitest.config.*` or equivalent) and determine whether test FILES run sequentially or in
   parallel against the shared test database, and whether that makes the blanket-`deleteMany`
   pattern (shared by this new file and the pre-existing `office-merit-dots.test.js`) actually safe
   or actually racy in practice, not just in theory.
2. **Read `server/routes/characters.js` in full** (not just the pieces the test exercises) and
   confirm independently: (a) `PUT /api/characters/:id` really does accept a partial
   `{ court_category: ... }` body and persist it without requiring the rest of the character
   document, (b) the hard-delete route really does NOT touch `office_merit_dots` anywhere in its
   cascade, matching the new test's claim, and (c) whether `POST /api/characters` genuinely accepts
   `court_category` at creation time the way the test's `createChar` helper assumes, or whether that
   field is silently dropped/ignored by the create schema and the test's initial holder assignment
   is actually happening some other way than it appears to.
3. **Read the full `_wireMeritDots`/`_adjustMeritDots` functions in `office-tab.js`** (the file the
   new client-wiring tests exercise via static source analysis) and confirm by hand that no
   character/holder identifier reaches either the fetch or the PUT call, through any path — not just
   the specific regex patterns the new tests happen to check for. Is there a way a character
   reference COULD sneak in that these specific regexes wouldn't catch (e.g. via a differently-named
   variable, or through the `el`/DOM argument rather than a literal `char`-named one)?
4. **Route registration / auth check**: confirm `PUT /api/characters/:id` and
   `POST /api/characters`/`DELETE /api/characters/:id` are all genuinely reachable in the test
   harness (`server/tests/helpers/test-app.js`) the same way they are in production
   (`server/index.js`), so the new tests are exercising production-equivalent behaviour, not a
   test-only shortcut.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/oxp-4-codex-findings.md` now,
before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/oxp-4-merit-purchase-persists-handover.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.**
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's literal wording (there are 5 ACs; check each against what was actually
     built, especially AC5's "no code change to `_adjustMeritDots`... or any handover/reset
     mechanism" — confirm the diff genuinely contains zero logic changes, comments only).
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing**
     - confirm nothing here quietly built new persistence mechanism, touched the pre-existing
     lost-update race in the merit-dots stepper, or added manoeuvre-reset logic.
   - Specified behaviour that is missing or present only in appearance.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate - do not flag these as gaps: any new persistence mechanism
(the story's whole premise is that persistence already exists and needs proving, not building), the
pre-existing lost-update race in `_adjustMeritDots`/`office-merit-dots.js` (already logged in
`specs/deferred-work.md`, explicitly deferred by this story on purpose), and manoeuvre-rank
reset-on-handover logic (oxp.5, a separate still-backlog story).

### Pass 3b - now read the author's record and check it against reality

5. Read the **Dev Agent Record** in full. It makes specific, checkable claims — notably a claimed
   "38/38 passed, 3 files, 0 failed, 0 skipped" gate result, and two described mutation-testing
   sabotages (one to the character-update route, one adding a `char` parameter to
   `_adjustMeritDots`) each said to fail an exact, specific subset of tests. Reproduce both mutations
   yourself, run the exact gate, confirm which tests actually fail, restore, confirm `git diff`
   clean.
6. Verify by running, not reading.
7. Flag anything FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED.
8. State plainly whether this is ready to ship as-is, needs patches, or has a blocking problem —
   and if the honest answer for a diff this size is "ship as-is, nothing found", say that directly
   rather than inventing Low findings to avoid an empty report.

---

## Output

Write everything to `specs/stories/code-review/oxp-4-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it. Write `- None found.`
under any empty heading.

For each finding: one-line title, severity, file:line, triggering input/sequence, observable
consequence, confidence.

Close with a **Validation notes** section: which files you opened in each pass, every command you
ran with its real result, anything you could not run and why, confirmation you modified nothing (or
restored and verified anything you did).
