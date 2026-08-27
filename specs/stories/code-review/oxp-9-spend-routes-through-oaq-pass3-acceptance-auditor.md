# Adversarial review — PASS 3 ACCEPTANCE AUDITOR — oxp-9-spend-routes-through-oaq (Office XP spend routes through the ST Approval Queue), Terra Mortis TM Game

You are reviewing a completed change in a repo you have full read access to.

This is an **isolated single pass** — one of three independent reviews of the same diff, each run
in its own separate session with no memory of the others. Unlike the other two, THIS pass gets the
story spec and the author's own record. Your job is to check the work against its own stated
acceptance criteria, and then to check the author's account of what happened against reality.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs\stories\code-review\oxp-9-spend-routes-through-oaq-diff.txt`, relative to that root, taken
  against base commit `5eecf69f`. The full commit is `c9134abd`.
- The full story spec, including its Dev Agent Record, is at
  `specs\stories\oxp-9-spend-routes-through-oaq.md`. Read it in full as instructed below — this is
  the ONE pass permitted to.
- Read and run freely to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- **Do not touch or read the sibling repos** at `D:\Terra Mortis\TM Admin`, `D:\Terra Mortis\TM Story`,
  or `D:\Terra Mortis\TM Herald` — out of scope.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) is allowed and encouraged — you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- This repo shares a local machine with other active Claude Code sessions on sibling projects. A
  held port (8080 in particular) may be occupied — pick a free alternate port if you need one and
  say which. Several server test suites need a local `mongod` and skip rather than fail without
  one — a skipped suite is not a passing suite; read the actual summary line, not the exit code.
  This story's own accept route needs a **replica-set-capable** mongod for its transaction — if
  yours isn't, say so plainly rather than reporting a skip as a pass.
- This diff widens shared infrastructure (the `contested_roll_requests` discriminator, the shared
  pending-queue GET, and two shared void/challenge guards) used by player-vs-player contested
  rolls, Status Actions, and Humanity Checks. A mistake here can silently break one of those other
  consumers.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing at a severity, say that explicitly rather than omitting the section.
- Report the exact current gate numbers you observe:
  `cd server && npx vitest run tests/oxp-9-spend-routes-through-oaq.test.js
  tests/oxp-3-office-manoeuvre-rank.test.js tests/oxp-4-merit-persistence-handover.test.js
  tests/issue-1141-office-tab-render.test.js tests/oxp-2-derived-office-xp-calculation.test.js
  tests/oaq-2-pending-status-actions.test.js tests/oaq-3-approval-queue.test.js
  tests/gdx-12-humanity-check-oaq-submit-approve.test.js`
  — report the real numbers even if they disagree with anything the story claims, **especially
  then**.

---

## Pass 3a — form findings BEFORE reading the author's own account

1. Read `specs\stories\oxp-9-spend-routes-through-oaq.md` — the **Story**, **Why this story
   exists**, **The scope decision on the budget check**, **What this story is NOT**, **Acceptance
   Criteria** (all 11), and **Tasks/Subtasks** sections ONLY.
2. **Do NOT read the "Dev Agent Record" section yet.** Skip past it entirely. Reading the author's
   own record first anchors you on their framing and turns a review into grading homework.
3. Against the 11 acceptance criteria, check the diff (`specs\stories\code-review\oxp-9-spend-routes-through-oaq-diff.txt`)
   and the real code it touches for:
   - Violations of an AC's literal wording. Read the words, not the surrounding narrative — an AC's
     exception is exactly as narrow as it is written. Pay particular attention to AC1 (schema
     `title`), AC3's exact ordered behaviour list (validate → resolve seat → auth →
     purchase-validity → courtesy affordability → dedupe → insert), AC5's ordered transaction steps
     (resolve pending → claim first → re-read live → re-validate → re-check requester →
     authoritative budget check → apply → record outcome), AC7's exact three guard changes (one
     `$in` widen, two `$nin` widens, `GET /mine` needing NO change — verify this last part yourself
     rather than trusting it), and AC11's exact regression list.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing**
     — check the change did not quietly do an excluded thing (a batch/multi-dot purchase, a
     refund/reversal type, a budget check retrofitted onto the ST-only PUT routes, a change to
     `office-xp.js`'s maths beyond a comment, a WebSocket push, a new MongoDB collection-level
     validator, a change to `office-actions.js`'s or `humanity-check.js`'s own resolution logic
     beyond the one named `$in` widen).
   - Specified behaviour that is missing, or present only in appearance (e.g. a check that exists in
     the code but can never actually be reached, or a status code that doesn't match what the AC
     specifies).
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

### Explicitly settled, do not re-litigate these as gaps

- NOT adding a budget check to the existing ST-only PUT routes, and `left` remaining allowed to go
  negative on those routes — deliberate, with reasons given in the story's own "scope decision"
  section.
- NOT a batch or multi-dot purchase (one request = one dot, by design).
- NOT a refund/reversal/"un-purchase" request type.
- NOT touching `office-xp.js`'s derived-balance maths, only its comment (AC10).
- NOT touching Status Action or Humanity Check resolution logic beyond the one shared `$in` widen
  in `office-actions.js`'s `GET /pending`.
- NOT a WebSocket push; the existing 10-second poll is the update mechanism.
- NOT retiring `spendKnown`.
- NOT adding a MongoDB collection-level validator on `contested_roll_requests`.
- The story's own Dev Agent Record (once you reach it) documents 5 explicit deviations from the
  original spec text, and states two of the story's own AC11 test-file names were WRONG and had to
  be substituted, plus one extra test file edited that wasn't in the original file list
  (`server/tests/oxp-4-merit-persistence-handover.test.js`, one pinned assertion literal widened).
  These are pre-disclosed by the author, not something you need to independently discover as a
  "gotcha" — your job is to verify each one is accurately described, not to treat its disclosure
  as automatically sufficient.

### Pass 3b — now read the author's record and check it against reality

5. Now read the **Dev Agent Record** section of `specs\stories\oxp-9-spend-routes-through-oaq.md`
   in full. It makes these specific, checkable claims — enumerate them precisely as you find them,
   including at minimum:
   - Exact pass/fail/skip counts for: the new suite alone; the 8 named/substituted existing suites
     combined; the wider ~16-file sweep.
   - A claim that `0 skipped` is real because a reachable `mongod` meant the accept transaction was
     genuinely exercised, including two concurrent-accept tests.
   - A claim of three specific prove-discrimination reverts (guard widenings: exactly 4 tests red
     before/green after; budget check disabled → red; claim moved below the purchase write → red),
     plus an "honest caveat" that the BEHAVIOURAL concurrency tests still pass even with the claim
     moved (because Mongo's own transaction retry serialises them anyway), and that only a STATIC
     ordering test actually pins the claim-first requirement.
   - A claim that the `GET /mine` guard needed no change, verified (not assumed) via a test built
     against a deliberately hostile `office_purchase` fixture, which passed before any change was
     made.
   - Specific manual/live-verification claims: balance moved by exactly 1 on accept; decline wrote
     nothing; the unaffordable state correctly reused an existing reason string as its `title`; zero
     request controls leaked to a non-own-office viewer; zero inline styles; zero console errors —
     and the explicit DISCLOSURE that the player-holder auth branch itself was only exercised via
     Supertest, never through a live browser session (because the test auth bypass hardcodes an ST
     role), and that a live player-role pass rendered a blank Office tab as an artefact of that same
     bypass limitation.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now (the
   gate commands are given above). Grep and read the actual test file(s) to confirm the prove-
   discrimination claims (guard widenings, budget-check-disabled, claim-order) genuinely have the
   shape described — a real revert-observe-restore, not just an assertion that one was done. If a
   first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified", or "resolved" label can itself
   be wrong — re-examine each one rather than inheriting it. In particular: is the claim that moving
   the claim below the purchase write causes only the STATIC test (not the behavioural ones) to fail
   actually true? Try it yourself if you can.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to
`specs\stories\code-review\oxp-9-spend-routes-through-oaq-codex-findings-pass3.md`, grouped
`## High` / `## Medium` / `## Low`, each finding tagged with the sub-pass that produced it
(`[Pass 3a]` or `[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Confirmation you read Pass 3a's allowed sections before Pass 3b's Dev Agent Record, in that
  order.
- Every command you ran, with its real result, including the gate commands above.
- Anything you could not run, and why (in particular if your local environment lacks a
  replica-set-capable mongod — say so explicitly rather than reporting a skip as a pass).
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
- Your plain final verdict: ship as-is / needs patches / blocking problem.
