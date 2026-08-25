# Adversarial review — issue-1143-status-actions-auth-safety (Status Actions — actor authorization + write safety), TM Suite

You are reviewing a completed change in a repo you have full access to.

**This is Pass 3 of 3 (Acceptance Auditor), run as an ISOLATED session.** Unlike Pass 1 and Pass 2,
you DO get the spec — that is this pass's whole point.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/issue-1143-diff.txt` and is relative to that root, taken against base
  commit `aca9e996`.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo (`TM Suite`) has sibling repos in the same
  umbrella workspace one level up (`TM Cockpit`, `TM Wiki`, `TM Herald`) — do not read or touch
  them; they are irrelevant to this diff.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) **is allowed and encouraged** — you MUST restore it exactly, confirm
  the restore with `git diff`, and say so in your output.
- Environment hazards: the local MongoDB (`127.0.0.1:27017`, a Windows service) is a STANDALONE
  instance, not a replica set. Vitest hard-overrides the DB name to `tm_suite_test`.
  `fileParallelism` is `false` project-wide. A full `npx vitest run` (no filter) has 6
  known-unrelated pre-existing failures across 11 files (documented in the story's own Dev Agent
  Record, which you will read below) — prefer the targeted command below unless verifying that
  specific claim.
- Blast radius: `server/routes/office-actions.js` is a live production route mutating a
  character's City Status during an in-person LARP session. `server/tests/helpers/db-setup.js` is
  shared test infrastructure used by roughly 15+ other test files project-wide.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing at a severity, say that explicitly.
- Report the exact current gate numbers you observe:
  `cd server && npx vitest run tests/issue-1143-office-actions-auth-safety.test.js tests/issue-1143-db-setup-skip.test.js tests/otc-2-office-actions-api.test.js tests/feature.691.hos-city-status-power.test.js`.
  Report the real numbers even if they disagree with anything the story claims — especially then.

---

## PASS 3 — ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole
document.**

### Pass 3a — form findings BEFORE reading the author's own account

1. Read `specs/stories/issue-1143-status-actions-auth-safety.md` — the **Story**, **Acceptance
   Criteria**, **What this story is NOT**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the "Dev Agent Record" or "Senior Developer Review" sections yet.** Skip past
   them entirely. Reading the author's own record first anchors you on their framing and turns a
   review into grading homework.
3. Against the acceptance criteria (AC1–AC7), check the diff at
   `specs/stories/code-review/issue-1143-diff.txt` and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative.
   - Deviations from stated intent. **The "What this story is NOT" section is equally
     load-bearing** — check the change did not quietly do an excluded thing (e.g. touch the budget
     FORMULA, touch the game-phase gate mechanism, build any part of the ST approval queue,
     restrict Status Actions to Head-of-State specifically at the server level when the story's
     Dev Notes explicitly reasoned that restriction was NOT needed).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint (e.g. "AC2: a client-supplied game_session_id that
     doesn't match the server-derived one is ignored") and the actual code.
   - Pay particular attention to AC3's exact wording ("Given two concurrent paid requests from the
     same actor... at most one succeeds... Given two concurrent requests targeting the same
     character in the same session, at most one succeeds") — is the second sentence, read
     literally, actually satisfied for the NON-paid action types (`grant_first`/`strip_last`) too,
     or only for `raise`/`lower`? Check what the real code does for a concurrent
     `grant_first`/`grant_first` race on the same target.
4. **Write your Pass 3a findings down now, before moving on.**

**Settled decisions — do not re-litigate these, they were explicit calls already made:**

- Explicitly NOT in scope for this story: the ST approval queue (`epic-oaq`), the budget
  *formula* itself (fixed in a prior story), the game-phase gate *mechanism* (fixed in a prior
  story), any change to which office categories exist, any change to `office-tab.js`'s
  network-vs-no-live-game message wording (a separate, already-deferred item).
- The story's Dev Notes explicitly reasoned, with code citations, that NO additional
  Head-of-State-specific restriction should be added server-side beyond the existing
  ownership-or-ST-role check — because `office-tab.js` already gates the entire Status Actions UI
  panel to `category === 'Head of State' && isOwnOffice`, so no other category can reach the
  endpoint through the UI regardless. Do not flag "the server doesn't restrict by court_category
  beyond truthiness" as a gap — that is a documented, deliberate call, not an oversight. (You MAY
  still flag it if you find a NEW angle the story's reasoning didn't consider — e.g. the
  multi-actor-same-target concern below is a legitimate example of exactly that.)
- `game_session_id` deriving from the `game_sessions` collection rather than `downtime_cycles` was
  a deliberate, evidence-based call (the two collections answer different questions) — do not
  re-litigate which collection should be authoritative.
- The atomicity mechanism (a MongoDB transaction) specified in the story's literal Task 3 text was
  DELIBERATELY NOT implemented — the author discovered mid-implementation that local dev MongoDB
  is a standalone instance (not a replica set), making transactions untestable there even though
  Atlas (production) would support them, and substituted a partial unique index +
  insert-then-recount-with-compensating-delete instead. The story's own Dev Notes pre-authorised
  exactly this kind of substitution. Do not flag "this doesn't use a transaction" as a defect in
  itself — evaluate whether the SUBSTITUTE actually delivers the atomicity guarantee AC3 requires.

### Pass 3b — now read the author's record and check it against reality

5. Now read the **Dev Agent Record** section of
   `specs/stories/issue-1143-status-actions-auth-safety.md` in full. It makes specific, checkable
   claims, including:
   - "Changed-area suite (9 files, 161 tests): 100% pass" — run the exact command yourself.
   - "Full suite... 2384/2390 passed, 6 failed / 11 files failed. All confirmed pre-existing" — the
     record claims this was proven by stashing the story's files and re-running against the clean
     baseline, reproducing identical failures. Spot-check at least ONE of the three named files
     (`oath-a-pledge-helpers.test.js`, `n7-n9-allocator-readers.test.js`,
     `epic.708.3-cycle-phase-controls.test.js`) yourself against the current tree — does it still
     fail, and does the failure genuinely have nothing to do with this diff (grep the file for any
     reference to `office-actions`, `db.js`, `index.js`, `db-setup`)?
   - The AC-by-AC "prove-discrimination" section claims specific RED-then-GREEN results for AC1,
     AC2 (x3), AC4 by reverting `office-actions.js` to its pre-story content and re-running the new
     test file. It ALSO explicitly admits AC3's two concurrency tests did NOT reproduce a clean RED
     against the reverted route (because the unique index, created independently in the test
     file's own `beforeAll`, still causes the second concurrent insert to fail even under the old
     route logic) — and that confidence instead rests on 4 repeated GREEN runs with the FIXED code
     showing zero flakiness. Re-run the two AC3 concurrency tests yourself, at least 3 times in a
     row, and report whether you observe any flakiness the author did not.
   - "AC5... verified both directions live" with a specific claimed contrast: the migrated test
     file reports "10 skipped, 0 failed" under a simulated-unreachable DB
     (`MONGODB_URI="mongodb://127.0.0.1:1/"`), while the unmigrated `otc-2-office-actions-api.test.js`
     still reproduces the original double-error under the identical condition. Reproduce this
     yourself with the exact env var.
   - The claim that local MongoDB is a standalone instance, not a replica set — verify this
     yourself (e.g. an `admin.hello` / `isMaster` probe), since it is the load-bearing justification
     for the entire AC3 implementation approach.
6. **Verify each claim by running it, not by reading it.**
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself
   be wrong — re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/issue-1143-acceptance-auditor-findings.md`, grouped
`## High` / `## Medium` / `## Low`, each finding tagged `[Pass 3a]` or `[Pass 3b]`. Write
`- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each sub-pass, and confirmation you did not read the Dev Agent Record
  before finishing Pass 3a.
- Every command you ran, with its real result, including the gate command above and the specific
  reproduction commands named in Pass 3b.
- Anything you could not run, and why. Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
