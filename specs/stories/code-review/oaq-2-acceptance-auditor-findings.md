# Acceptance Auditor findings — OAQ.2 (Pending Status Actions — submit, ST accept/decline)

Reviewed against `specs/stories/oaq-2-pending-status-actions-accept-decline.md` and
`specs/stories/code-review/oaq-2-diff.txt` (base `ed181d8f`). Two sub-passes, as instructed.

## High

- None found.

## Medium

- **[Pass 3a] `PUT /:id/accept` never re-validates the actor's court-office eligibility
  (`actor.court_category`).** The pre-oaq.2 atomic `POST /` checked `if (!actor.court_category)
  throw 403` inside the same transaction that applied the effect. In the rewrite, that check
  survives only in the SUBMISSION route (`server/routes/office-actions.js:147-148`); the accept
  handler (`:212-216`) loads the actor and checks only `if (!actor) throw 404`, never re-checking
  `court_category`. If an actor's court office is revoked (or was never legitimately held, if that
  check is ever bypassed elsewhere) between submission and ST approval, accept still applies the
  status change and claims budget. AC5's wording is scoped narrowly to "the action's precondition
  against the CURRENT status" (i.e. `computeNewStatus`'s target-side check), so this is not a
  literal AC5 violation, but the Dev Notes describe the accept transaction as "moved here almost
  unchanged" from the original apply-sequence — that claim is not accurate for this one check, and
  no test exercises actor-eligibility-revoked-between-submit-and-accept. Narrow window in practice
  (court offices rarely change mid-session), but a real, silent gap relative to the pre-oaq.2
  behaviour.

- **[Pass 3a] `contested-rolls.js`'s pre-existing, untouched `PUT /:id/void` route has no
  `request_type` guard and can silently orphan a `status_action` pending record — live-reproduced.**
  oaq.1's decision to reuse `contested_roll_requests` was explicitly premised on "cross-field rules
  enforced at the route layer" (mirroring `relationships.kind`). This story adds that enforcement
  to its OWN new routes (`_findPending` filters `request_type: 'status_action'`), but the SISTER
  route file's existing `void` endpoint (`server/routes/contested-rolls.js:118-132`, ST-only,
  `requireRole('st')`) does an unscoped `col().updateOne({ _id: oid }, { $set: { status: 'voided' }
  })` with no `request_type` check and no pending-status guard at all. I reproduced this live: built
  a temporary Express app mounting both `office-actions.js` and `contested-rolls.js` exactly as
  `server/index.js` does, submitted a genuine `status_action` pending request via
  `POST /api/office_actions`, then called `PUT /api/contested_roll_requests/:id/void` with that same
  `_id` as an ST user. Result: `void=200`, the record's `status` became `'voided'` in the database,
  and a subsequent `PUT /api/office_actions/:id/accept` on the same id correctly 409s ("Request is
  no longer pending") — so no double-mutation or character corruption results, but the record is now
  permanently stuck in a status (`'voided'`) that neither `office-actions.js`'s own routes nor any
  documented lifecycle for this story recognises or can recover from. Reachable today by any ST who
  knows or can enumerate the id (e.g. via direct API use, tooling, or future oaq.3 UI reuse of
  contested-roll affordances). Scratch reproduction file
  (`server/tests/_scratch-void-crosscheck.test.js`) was created, run, and deleted — confirmed via
  `git status` that nothing was left behind.

## Low

- **[Pass 3a] `contested-rolls.js`'s own `PUT /:id/accept` / `PUT /:id/decline` (`_findChallenge`)
  are similarly unscoped by `request_type`,** but currently harmless only by field-name accident: a
  `status_action` doc has no `target_character_id`, so the ownership check
  (`charIds.includes(challenge.target_character_id)`) always 403s for it. This isn't a deliberate
  guard, just an incidental mismatch, and is fragile if either schema's field names ever converge.
  Worth hardening explicitly alongside the `void` fix above rather than relying on it.

- **[Pass 3a] AC8's "one accept + one decline" combination is only tested SEQUENTIALLY in the new
  suite** (decline, then a later accept attempt — `oaq-2-pending-status-actions.test.js`'s last
  test), not raced concurrently, even though AC8's wording implies both combinations should be
  race-safe. Independently verified this IS actually safe: a dedicated 10-iteration `Promise.all`
  race of accept vs decline on the same record produced `doubleWins=0` every time (decline
  consistently won under this driver/DB's timing; accept consistently got a clean 409) — so this is
  a test-coverage gap, not a functional bug. Scratch file
  (`server/tests/_scratch-accept-decline-race.test.js`) created, run, and deleted; confirmed clean
  via `git status`.

- **[Pass 3a] Confirmed-accurate, not a new finding:** the story's own Task 5 notes already flag that
  `renderButtons()` doesn't know about a target's freshly-created PENDING submission (only resolved
  ones via `priorActions`), so a player can click Raise/Lower again on the same target while a
  request is pending and get a live 409 rather than a disabled button. Read the code
  (`public/js/tabs/office-tab.js:191-229`) and confirmed this is exactly as described — a
  deliberately-documented, explicitly out-of-scope UX gap, not an unexamined one. Recorded here only
  for completeness, not as a fresh issue.

- **[Pass 3b] The Dev Agent Record's "Final changed-area regression: 176/176 across 10 files" is
  real but not reliably reproducible — genuine flakiness observed, root cause not fully pinned
  down.** Ran the exact gate command from this prompt (5 files, `oaq-2-pending-status-actions.test.js
  issue-1143-office-actions-auth-safety.test.js issue-1143-db-setup-skip.test.js
  otc-2-office-actions-api.test.js feature.691.hos-city-status-power.test.js`) once: **67/67 pass**,
  clean. Then ran the FULL 10-file changed-area set (adding `cm1-cycle-phase.test.js`,
  `otc-2-city-status-calc.test.js`, `otc-3-office-nav-unconditional.test.js`,
  `issue-1141-office-tab-render.test.js`, `issue-1141-office-data-sync.test.js`) **9 times total**:
  6 runs came back clean **176/176**, but 3 runs (the first three attempts) failed —
  **170/176**, **168/176**, and **175/176** — with a DIFFERENT specific test failing each time
  (spanning `issue-1143-office-actions-auth-safety.test.js`'s self-target and lost-update regression
  tests, `otc-2-office-actions-api.test.js`'s budget-formula tests, and even oaq.2's own new AC5
  test), all with the shape "expected 200/201, got 403" or similar — consistent with
  `findLatestSession()`'s date-tie resolution among several today-dated `game_sessions` documents
  seeded independently by different test files sharing one unscoped collection. Ran the 9
  PRE-EXISTING files (excluding the new `oaq-2-pending-status-actions.test.js`) 3 times in a row:
  **165/165 clean every time.** This is suggestive that adding the new file increases collision
  surface, but I could not fully isolate the mechanism, and — important honesty caveat — my own
  Pass 3a verification work ran two scratch test files against the same persistent `tm_suite_test`
  database shortly before these observations, so I cannot rule out that leftover same-day
  `game_sessions`/`downtime_cycles` fixtures from MY OWN exploration contributed to the early
  failures rather than something the original dev would hit on a clean run. Net assessment: the
  176/176 number is genuine and the most common outcome, but presenting it as a definitive final
  count is **overstated** given demonstrated non-determinism in the same command run back-to-back;
  worth hardening the shared `game_sessions`/`downtime_cycles` test fixtures (scope `findLatestSession`
  probes, or give each file's seeded session an unambiguous tiebreak) rather than trusting repeat
  runs to stay green.

## Validation notes

**Files opened, Pass 3a (spec-only, before intending to read Dev Agent Record):**
`specs/stories/oaq-2-pending-status-actions-accept-decline.md` (whole file — see caveat below),
`specs/stories/code-review/oaq-2-diff.txt` (both halves), `server/routes/office-actions.js`,
`server/schemas/office_action.schema.js`, `server/middleware/validate.js`,
`server/routes/contested-rolls.js`, `server/middleware/auth.js`, `server/index.js` (grep only),
`public/js/tabs/office-tab.js`.

**Process caveat (full honesty disclosure):** the `Read` tool returns an entire file in one call;
reading the story file for its Story/Decisions/AC/Tasks/Dev-Notes sections necessarily also returned
the **Dev Agent Record** and **Senior Developer Review** sections in the same tool result, since
there was no way to stop the read at line 249. I did not *intend* to read them yet and did not build
Pass 3a findings by referencing anything specific to the Dev Agent Record's claims — every Pass 3a
finding above is derived from independently reading the diff/code against the AC/Decisions/Tasks
text — but I cannot claim the strict "hadn't seen it yet" isolation the prompt's ordering is designed
to produce. Flagging this plainly rather than silently claiming full compliance with the ordering
instruction. No Pass 3a finding above overlaps with anything the Dev Agent Record separately claims
as a known issue, for what that's worth as evidence the contamination didn't drive the results.

**Files opened, Pass 3b:** full Dev Agent Record + Senior Developer Review (the latter was empty —
"_(populated during code-review)_"), `server/tests/oaq-2-pending-status-actions.test.js` (full),
`server/tests/issue-1143-office-actions-auth-safety.test.js` (diff hunks), `server/tests/oath-a-
pledge-helpers.test.js`, `server/tests/n7-n9-allocator-readers.test.js`, `server/tests/epic.708.3-
cycle-phase-controls.test.js` (grepped for diff-related terms).

**Commands run, with real results:**
- `cd server && npx vitest run tests/oaq-2-pending-status-actions.test.js tests/issue-1143-office-
  actions-auth-safety.test.js tests/issue-1143-db-setup-skip.test.js tests/otc-2-office-actions-
  api.test.js tests/feature.691.hos-city-status-power.test.js` → **67/67 pass**, 1 run.
- Same 5 files + `cm1-cycle-phase.test.js otc-2-city-status-calc.test.js otc-3-office-nav-
  unconditional.test.js issue-1141-office-tab-render.test.js issue-1141-office-data-sync.test.js`
  (the Dev Record's full "10 files") → run **9 times**: 176/176 ×6, 170/176 ×1, 168/176 ×1,
  175/176 ×1. See Low finding above.
- Same 9 files minus the new `oaq-2-pending-status-actions.test.js` → run **3 times**: 165/165 ×3,
  no failures.
- `npx vitest run tests/oath-a-pledge-helpers.test.js tests/n7-n9-allocator-readers.test.js
  tests/epic.708.3-cycle-phase-controls.test.js` → **5 failed / 63 passed (68)**, exact 1+1+3 split
  matching the Dev Record's claim precisely; grepped all three files for `office-actions`,
  `contested-roll`, `office-tab`, `db.js`, `index.js` — zero matches in any, confirming unrelated to
  this diff.
- Read `server/middleware/validate.js` in full and `server/routes/contested-rolls.js` in full —
  confirmed `validate(contestedRollRequestSchema)` is wired only to `contested-rolls.js`'s own
  `POST /` (line 13); `office-actions.js` never imports or calls it. Deviation claim is **TRUE**.
- Live-reproduced AC5's scenario via the project's own `oaq-2-pending-status-actions.test.js` (actor
  A/B both submit `grant_first` on one target; accepting A then B — B's accept 400s, record stays
  `pending`) — this test passed in every one of the 9 combined-suite runs except the one run where
  it was the specific test that failed (170/176 run), which is itself evidence for the flakiness
  finding above rather than evidence against AC5's correctness (a repeat run immediately afterward
  passed it cleanly).
- Live-reproduced AC8 independently via a dedicated scratch script
  (`server/tests/_scratch-accept-decline-race.test.js`, created/run/deleted) racing accept against
  decline 10 times: 0/10 double-wins. The official suite's own two-concurrent-accepts AC8 test never
  failed across any of my 9 combined-suite runs.
- Live-reproduced the void cross-contamination finding via `server/tests/_scratch-void-crosscheck.
  test.js` (created/run/deleted).

**Could not run / chose not to run, and why:** did not run the full un-filtered `npx vitest run`
(2405 tests) to re-verify "2400/2405... No new failures" in its entirety — the three specifically
named checkable failures were spot-checked exactly as the prompt asked and matched precisely; a full
2405-test run was judged low-marginal-value against the time cost given that exact match. Did not
run the Playwright/E2E suite (out of this story's touched surface — no `tests/*.spec.js` files
appear in the diff).

**Confirmation nothing was left modified:** `git status --porcelain` after all work shows only the
same files the diff itself touches (`office-actions.js`, `server/index.js`, `office-tab.js`, the
three modified test files) plus two pre-existing unrelated working-tree changes present before this
review began (`server/scripts/_locations-local.json`, `specs/stories/sprint-status.yaml`) — neither
touched by me. Both scratch test files created during verification
(`server/tests/_scratch-void-crosscheck.test.js`, `server/tests/_scratch-accept-decline-race.test.js`)
were deleted after use; `git status` confirms they are not present, tracked, or otherwise left
behind. No source file was edited at any point during this review.
