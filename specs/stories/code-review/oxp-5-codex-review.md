# Adversarial review — oxp-5-handover-logic (Handover logic: seat holder change, manoeuvre reset), Terra Mortis TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

## How to run this — read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. Do not open a file a later pass
   grants you until you reach that pass. In particular: **the story spec is deliberately NOT in the
   diff.** Do not go looking for it during the earlier passes. The final pass will hand you the path.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/oxp-5-codex-findings.md`, before you open anything the next pass
   allows. Do not revise an earlier pass's findings in light of what a later pass taught you — if a
   later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap — see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at `specs/stories/code-review/oxp-5-diff.txt`
  and is relative to that root, taken against base commit `2ab6a8aa` (the last commit before this
  story's work began, immediately after oxp-11 merged).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo (`TM Suite`) sits in an umbrella workspace
  alongside sibling repos `TM Wiki`, `TM Cockpit` (`TerraMortis-cockpit`), and `TM Herald`, plus a
  second worktree of THIS SAME repo at `D:\Terra Mortis\TM Suite-eqc` (a different branch, currently
  mid-session for an unrelated epic). Do not read, run, or touch anything outside `D:\Terra Mortis\TM
  Suite` for any reason — that includes not running tests from `TM Suite-eqc`, even though it is the
  same codebase.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** — you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazard, real and already reproduced once this session**: `server/tests/*.test.js`
  DB-backed suites all run against ONE shared Atlas database, `tm_suite_test` — there is no
  per-process namespacing or locking. Running two `vitest` invocations against it AT THE SAME TIME
  (from this review session and from anywhere else — another terminal, another agent, another editor
  window) produces genuine cross-process data corruption: one process's `deleteMany`/`insertMany`
  interleaving with another's mid-test. This was independently reproduced and diagnosed earlier
  today (two concurrent gate runs produced non-deterministic failure counts, traced to exactly this).
  If your own test run looks flaky or produces a `duplicate key` error, **do not assume it is a code
  bug** — first confirm nothing else could be hitting `tm_suite_test` concurrently, re-run alone, and
  say explicitly in your output whether you ran solo or suspect contention.
- **Blast radius**: `office_merit_dots` and `office_manoeuvre_ranks` are collections SHARED with four
  other stories' own test suites (oxp-1, oxp-2, oxp-3, oxp-4, oxp-11) and, live, with the real ST
  admin tools those stories built. A mistake in this diff's fixture cleanup or in the route's own
  writes does not just break this story's own tests — it silently breaks those other suites and that
  live data too. A test-hygiene bug of exactly this shape (unfiltered `deleteMany({})` on these two
  collections) was already found and fixed once during this story's own development; verify the fix
  actually holds rather than assuming the fix described in the Dev Agent Record is real.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe (see GATE_COMMANDS below). Report the real
  numbers even if they disagree with anything the story claims — especially then.

---

## PASS 1 — BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/oxp-5-diff.txt` and **nothing else**. No spec, no
story file, no project context. Do not explore the repository. Do not go looking for the spec. Read
other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A new transactional Express route, `PUT /api/office_seats/:seatId/holder`, that changes who holds a
court office seat: it keeps a `characters` document's `court_category`/`court_title` and an
`office_seats` document's `holder_id` in sync inside one MongoDB multi-document transaction, refuses
(409) rather than silently reassigning a target who already holds a different seat, and resets a
`office_manoeuvre_ranks` document's `rank` to 0 on a real handover while accumulating a
`manoeuvre_xp_destroyed` counter recording what was lost. A companion client change rewrites an admin
court-management panel (`public/js/admin/city-views.js`) from category-keyed rows with raw
per-character PUTs into seat-keyed rows that call the new route. Two adjacent test files pick up
small restatements. A new test file, `server/tests/oxp-5-handover-logic.test.js`, is entirely new.

**That is the shape it claims. Do not trust the shape — verify it.**

### What to hunt for

1. **The compare-and-swap baseline read.** `office-seats.js`'s handler reads a seat document ONCE,
   outside `session.withTransaction(...)`, captures its `holder_id` into a variable, and then filters
   a `updateOne` CAS write on that captured value from INSIDE the transaction callback — even though
   the callback also does its own in-session re-read of the same seat for other purposes. Is there
   any path where the outer read and the inner logic disagree in a way that produces a WRONG
   accept/reject — e.g. does a transaction retry ever re-run the code that captured the baseline, or
   only the callback? If `withTransaction` retries only the callback, does every retry keep reusing
   the SAME stale baseline forever, and is that actually correct on every retry, including one where
   the seat was legitimately deleted or reassigned since?
2. **`RouteResponse extends Error` used for business rejections thrown INSIDE `withTransaction`.**
   Does the MongoDB driver's transient-error detection have any chance of misclassifying this custom
   error as retryable (causing a spurious re-run of side-effecting code), or of the driver's own
   retry silently swallowing it? Check exactly how the outer `catch` distinguishes `RouteResponse`
   from a real driver error.
3. **The manoeuvre-reset pipeline update** (`resetManoeuvreRank`, aggregation-pipeline
   `findOneAndUpdate`/`updateOne`): confirm the ORDER of pipeline stages actually reads the
   pre-reset `rank` before zeroing it, by reading the pipeline array itself, not the comments next to
   it. A swapped stage order would silently record 0 destroyed every time — check whether that
   specific inversion is actually impossible given the code as written, not just documented as
   dangerous.
4. **The same-holder / no-op branch.** Confirm the manoeuvre reset function is NEVER reached on this
   path by tracing control flow (an early `return` inside the transaction callback, or a call that is
   conditionally skipped?). A missed guard here would let a routine "re-save the panel with nothing
   changed" wipe a real manoeuvre ladder.
5. **The conflict check** (a target character who already holds a different seat, 409'd rather than
   cascaded): confirm the query genuinely excludes the seat being assigned (`_id: { $ne: seatOid }`)
   and is scoped correctly — could a target legitimately holding NO seat but a stale `court_category`
   ever be wrongly treated as conflicting, or could a genuine conflict ever be missed because the
   query runs before or after the wrong write?
6. **Assertions/checks whose PASS condition is trivially satisfiable** — anywhere in the new test
   file or the two restated tests where a check would pass even if the underlying behaviour were
   wrong (a loose `toBeDefined()`, a status-code-only check where the body should also be verified, a
   count check using `>=` where `===` is what the claim actually requires).
7. **A check whose label claims more than the check actually tests** — read every `it(...)` title in
   the new test file against its body; flag any title that promises more than its assertions verify.
8. **Resource cleanup on the THROWN path**, not just the happy path — does `dbSession.endSession()`
   genuinely run on every exit, including an exception thrown before `withTransaction` is even
   entered (e.g. from the outer baseline read)?
9. **Dead code, unused imports, unreachable branches** — the diff removes two DOM event handlers
   (add-slot / remove-slot) from `city-views.js`; confirm nothing else in the file still references
   the removed elements, classes, or handler functions.
10. **Self-contradiction within the diff** — does any comment describe behaviour the code next to it
    does not actually implement (e.g. a comment claiming a field is "never written" adjacent to code
    that could write it under some condition)?
11. Anything you cannot judge without the spec, flag as "worth checking" rather than asserting it is
    fine or broken.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/oxp-5-codex-findings.md` now,
before reading further.**

---

## PASS 2 — EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into (in particular
`server/routes/office-actions.js`'s `PUT /:id/accept`, which this route's transaction scaffolding is
explicitly modelled on, and `server/routes/office-manoeuvre-rank.js`'s `PUT /:seatId/step`, which the
reset pipeline idiom is modelled on). You still do **not** have the story spec or any account of the
author's intent — work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth — verify against the code)

Same summary as Pass 1. Do not trust it; the point of this pass is to find what it leaves out.

### What to hunt for

1. **Hand-trace the full write sequence** in `PUT /:seatId/holder`, step by step, against what
   actually executes: read seat → (same-holder no-op check) → read target character → conflict check
   → CAS-claim the seat → clear departing holder → set incoming holder → reset manoeuvre rank. Confirm
   by reading the real code, not by trusting order-implying comments, that this is genuinely the
   sequence executed, and that the CAS-claim on the seat happens BEFORE any character-collection write
   — a late claim would let a genuine concurrent loser reach a write it should never have made.
2. **Route matcher order** in `server/routes/office-seats.js`: does the new `PUT /:seatId/holder`
   registration interact badly with the existing `GET /` (or any other route in the file) — could a
   request ever be shadowed?
3. **Malformed/edge input at the new entry point**: seat id with mixed-case hex (is it normalised
   consistently for both the route param AND any internal lookups?), `holder_id` as an empty string,
   `holder_id` equal to the SAME 24-hex value as the seat id itself, `court_title` as an empty string
   vs `null` vs whitespace-only, a request body that is not JSON at all.
4. **What happens when the transaction genuinely retries** (a real `WriteConflict` from a concurrent
   write): does EVERY read inside the callback re-run cleanly on retry (i.e. nothing computed before
   `withTransaction` that should have been recomputed leaks a stale value into the retried attempt,
   beyond the deliberately-frozen CAS baseline)?
5. **The manoeuvre-reset response contract**: when a seat has no existing `office_manoeuvre_ranks`
   document at all (never purchased anything), what does the route's response body report for
   `manoeuvre_reset` — confirm it is distinguishable from "a reset happened and destroyed 0", by
   reading the actual returned shape, not assuming it from the field name.
6. **`city-views.js`'s rewritten `saveCourt`**: walk the exact sequence for a save where TWO rows
   both target the SAME character (the pre-existing UI bug the old code allowed — does the new code
   send two conflicting handover calls, and if so what actually happens: does the second's conflict
   check correctly 409, and does the panel surface that legibly or silently swallow it?). Also check:
   are seats re-fetched and the panel re-rendered using fresh data after each save round, or could a
   stale in-memory seat array cause a SECOND save (without a page reload) to send a stale
   `holder_id` comparison and mis-fire a no-op or a spurious handover?
7. **Fixture/mock shape vs what the real consumer reads**: in the new test file, do the seeded
   `office_seats`/`office_manoeuvre_ranks`/character fixtures match, field for field, what the real
   route and the real `GET` routes for those collections actually read and return? Specifically check
   the `notes` redaction behaviour for non-ST callers is preserved by whatever serialises the seat in
   the new route's response, not just in the pre-existing `GET /`.
8. **State mutated by one step leaking into a later step in the same run** — does anything in the
   route (or in `city-views.js`'s render/save cycle) hold a reference to a document or DOM row from
   before a write that becomes stale immediately after that write commits, and get used anyway?

**STOP. Write your Pass 2 findings to `specs/stories/code-review/oxp-5-codex-findings.md` now,
before reading further.**

---

## PASS 3 — ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a — form findings BEFORE reading the author's own account

1. Read `specs/stories/oxp-5-handover-logic.md` — the **Story**, **Acceptance Criteria** (there are
   10, AC1–AC10), **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative — an
     AC's exception is exactly as narrow as it is written. Pay particular attention to AC3's exact
     write-sequence ordering, AC6's exact pipeline-stage-order requirement, AC7's "byte-identical
     including `updated_at`" requirement for `office_merit_dots`, and AC8's "never writes
     `seat_label`" requirement.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing**
     — check the change did not quietly do an excluded thing (it explicitly excludes: any change to
     `court_category` read sites, seat creation/deletion, backfilling the 7 live seats' `holder_id`,
     any change to `office_merit_dots` in either direction, any change to `public/js/data/office-xp.js`,
     any change to `public/js/tabs/office-tab.js`'s client-side seat resolution, richer handover UX
     beyond the court panel rewire, XP-spend-approval routing, and `OFFICE_DATA`'s static-JS
     migration).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Explicitly settled, by Angelus directly, before ACs were written — do not re-litigate these, only
check the code actually implements them as stated:**
- `court_category` stays a real, independently-readable field on `characters`; it is NOT derived from
  `office_seats.holder_id`. This route is the one place the two are kept in sync, deliberately not a
  larger refactor.
- The existing admin court-slots panel (`city-views.js`) is rewired to call the new route rather than
  left as a bypass path — including removing its "+ Add slot"/"remove slot" controls, which is a
  deliberate reduction in what the panel can do, not an oversight (in-app seat creation/deletion has
  no story yet and is out of scope here).
- `resolveOfficeSeat()` in `server/lib/office-seat-resolve.js` is deliberately NOT reused by this
  route (it 400s any seat whose office has no `OFFICE_DATA` entry, e.g. Administrator, and takes no
  session parameter) — only its exported `SEAT_ID_PATTERN` constant is reused. Do not flag "should
  have reused resolveOfficeSeat" as a finding.

### Pass 3b — now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims — attack these in
   particular:
   - "46 passed / 46, 0 skipped" for the new suite alone, run three times consecutively.
   - "204 passed / 204, 0 failed" for the full seven-file targeted gate
     (`oxp-5-handover-logic`, `oxp-2-derived-office-xp-calculation`, `oxp-4-merit-persistence-handover`,
     `oxp-11-office-purchase-seat-keying`, `oxp-3-office-manoeuvre-rank`, `office-merit-dots`,
     `issue-823-test-db-guard`), run three consecutive times with identical results.
   - The three prove-discrimination claims: inverting AC6's two pipeline stages fails exactly the
     destroyed-counter tests; removing AC2's conflict check fails exactly the refusal tests; removing
     the AC4 same-holder branch fails exactly the no-op tests — each a single change, reverted after,
     confirmed byte-identical to the pre-mutation file via `diff`.
   - The claim that `office_merit_dots` is genuinely untouched by a handover, "byte-identical
     including `updated_at`", proved by a real DB-backed test rather than assumed.
   - The claim that `seat_label` is never written by the route, both by a runtime test AND by a
     source-contract check that the string `seat_label` does not appear as a write target anywhere
     in the route.
   - The AC10 deviation: the story's literal "two simultaneous handovers must produce exactly one 200
     and one 409" was replaced with a 10-iteration invariant loop, justified as the two-request race
     being measured (on the author's machine, 5 runs of a throwaway diagnostic) to genuinely
     interleave only 4 times in 5 — the fifth being two legitimate SEQUENTIAL handovers rather than a
     race, for which two 200s is correct, not a bug. Check whether the replacement loop actually
     still proves what AC10 cares about (a genuine concurrent double-win never happens, and no XP is
     ever destroyed twice) or whether it has been weakened into something that would not actually
     catch a real regression.
   - The "two bugs found in verification" account: (1) the new suite's `beforeEach`/`afterAll`
     originally ran unfiltered `deleteMany({})` on `office_merit_dots` and `office_manoeuvre_ranks`,
     fixed by scoping all four deletes to this suite's own seat ids; (2) an apparent flaky/corrupted
     run was root-caused NOT to a code defect but to two concurrent `vitest` processes racing against
     the same shared `tm_suite_test` database, reproduced deliberately by running two gates at once.
     Check the FIRST claim against the actual current state of the test file's `beforeEach`/`afterAll`
     (are all deletes genuinely scoped now, with no unfiltered `deleteMany({})` remaining anywhere in
     the file?). For the SECOND claim, you cannot re-reproduce a deliberate concurrent collision
     safely inside this review (see the environment-hazard ground rule above) — say plainly that you
     are taking it on the author's word rather than re-proving it, and instead verify the LOGICAL
     claim it rests on: does the route's own code genuinely commit and fully settle its transaction
     (via `endSession()` in a `finally`) before the HTTP response is sent, with no plausible way for a
     write to land after the response resolves? If you can find a real mechanism by which this
     route's own code — not test-harness contention — could produce a delayed write, that would
     contradict the "not a code bug" conclusion and is worth flagging as High.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now (see
   GATE_COMMANDS below — run ONLY this, solo, nothing else concurrently). Run any driver scripts
   yourself. Grep the files yourself. If a first run is inconsistent, run it twice, confirm you were
   not running anything else against `tm_suite_test` at the same time, and say so either way.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong — re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/oxp-5-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`, `[Pass 2]`,
`[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including:
  ```
  cd server
  npx vitest run tests/oxp-5-handover-logic.test.js tests/oxp-2-derived-office-xp-calculation.test.js tests/oxp-4-merit-persistence-handover.test.js tests/oxp-11-office-purchase-seat-keying.test.js tests/oxp-3-office-manoeuvre-rank.test.js tests/office-merit-dots.test.js tests/issue-823-test-db-guard.test.js
  ```
  (Run this ALONE — confirm nothing else is concurrently hitting `tm_suite_test` first — and report
  the real Test Files / Tests summary line, not a paraphrase.)
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
