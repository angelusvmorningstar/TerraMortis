# Acceptance Auditor findings — issue-1143-status-actions-auth-safety

Pass 3 of 3 (Acceptance Auditor), reviewed against `specs/stories/issue-1143-status-actions-auth-safety.md`
and the live code in `server/routes/office-actions.js` / `server/tests/issue-1143-office-actions-auth-safety.test.js`
(current on-disk state, post external-review fix — not the stale `issue-1143-diff.txt`).

## High

### 1. AC3's second sentence is violated for `grant_first`/`strip_last` — a same-actor race on one target lets both requests succeed
- **Severity**: High
- **File:line**: `server/routes/office-actions.js:150-225` (non-paid branch, lines 215-225); the partial unique
  index that protects `raise`/`lower` (`server/index.js:209-217`) is explicitly scoped via
  `partialFilterExpression: { action_type: { $in: ['raise', 'lower'] } }` and does not cover
  `grant_first`/`strip_last` at all.
- **The triggering input or sequence**: Two concurrent `POST /api/office_actions` requests, same actor,
  same target, `action_type: 'grant_first'` (or `strip_last`), both submitted before either request's
  `insertOne`/`updateOne` completes. There is no unique index, no atomic conditional update, and no lock
  between the `target.status.city` read (line 112/116) and the write (lines 219-223) for these two action
  types — the code's own comment (lines 215-218) argues this is "harmless" because both writes converge on
  the same fixed value (1 or 0), but that only protects `status.city`'s final value, not the AC's actual
  requirement.
- **The observable consequence**: Both requests receive `201`, and two `office_actions` log documents are
  written for what the audit trail will read as two separate grants/strips of the same character's first
  City Status dot. This directly contradicts AC3's literal second sentence: "Given two concurrent requests
  targeting the same character in the same session, at most one succeeds" — no restriction to paid
  (`raise`/`lower`) types is stated there, and the story's own "settled decisions" list explicitly flagged
  this exact angle as legitimate to check ("Check what the real code does for a concurrent
  `grant_first`/`grant_first` race on the same target").
- **Confidence**: High — reproduced live against real `tm_suite_test` with a tight direct-collection probe
  mirroring the route's own logic (bypassing HTTP staggering, the same methodology the Dev Agent Record
  says the external Codex review used for the raise/lower bug): **29 of 30 tight races produced a
  double-201** (`{"201,400":1,"201,201":29}`). A separate full-HTTP-layer Supertest probe (less tight,
  closer to real-world timing) still produced one double-201 out of a handful of runs. Scratch test files
  used to prove this were written to `server/tests/`, run, and deleted — confirmed via `git status --short`
  that no trace remains.

### 2. AC3's second sentence is violated across DIFFERENT actors on the same target — worse than #1, includes a silent lost update
- **Severity**: High
- **File:line**: `server/routes/office-actions.js:150-213` (paid branch); `server/index.js:209-217` (unique
  index keyed on `{ game_session_id, actor_id, target_id }`, i.e. scoped **per actor**, not per target
  alone).
- **The triggering input or sequence**: Two DIFFERENT actors (e.g. two different Head-of-State office
  holders — a realistic scenario since multiple territories can each have their own) both `POST` a `raise`
  against the SAME target character concurrently, in the same session. Because the unique index key
  includes `actor_id`, the two inserts have different keys and neither collides — the per-target dedupe
  that protects same-actor races (via the index) does not apply here at all.
- **The observable consequence**: Both requests can receive `201` (confirmed), AND the underlying
  `target.status.city` read-then-write (lines 112/116 read, 207-210 write) is not atomic, so this is a
  classic lost-update race: both requests read `old_status = 3`, both compute `new_status = 4`, both log a
  `3→4` action, and the character's real `status.city` ends at `4` instead of the `5` that two genuinely
  sequential raises would produce — one of the two logged, 201-confirmed raises silently never took effect,
  and nothing in the response or the audit log reveals this happened.
- **Confidence**: High — reproduced live 5 times against real `tm_suite_test`/Supertest: **4 of 5 runs**
  showed both requests returning `201` with the target's final `status.city` at `4` (lost update) rather
  than the `5` two real raises should produce; the 5th run happened to land the two writes serialized enough
  to reach `5` (i.e. this is a genuine race, not deterministic — undercounting how often it would surface,
  not overcounting). This is a materially worse failure mode than finding #1: it doesn't just duplicate a
  log entry, it makes the log actively describe a status transition that didn't happen. Scratch test file
  used to prove this was written, run, and deleted — confirmed via `git status --short`.

## Medium

### 3. Dev Agent Record's test-count claims are stale for the current on-disk test file
- **Severity**: Medium
- **File:line**: `specs/stories/issue-1143-status-actions-auth-safety.md` — "File List" ("NEW. Real Supertest
  coverage for AC1–AC4 (**10 tests**)") and the AC5 verification note ("reported '**10 skipped**, 0
  failed'"); `server/tests/issue-1143-office-actions-auth-safety.test.js` (actual current test count).
- **The triggering input or sequence**: Simply running the file as it exists now (no special input needed).
- **The observable consequence**: The file actually contains **11** tests, not 10 — the "REGRESSION
  (external review, Pass 1...)" test was added later (as part of the documented external-review fix) and
  the earlier "10 tests" / "10 skipped" notes were never updated to match. Same drift shows up in the
  Regression section's "Changed-area suite (9 files, **161 tests**): 100% pass" — the current real number is
  **162**. None of this is dishonest in direction (all runs genuinely pass/skip cleanly, verified below) but
  the specific numbers a future reader would use to sanity-check "did anything change unexpectedly" are
  wrong as written, and would mask a real off-by-one if one existed.
- **Confidence**: High — directly counted via `npx vitest run tests/issue-1143-office-actions-auth-safety.test.js --reporter=verbose` (11 passed) and the 9-file changed-area command (162 passed), and via the
  `MONGODB_URI="mongodb://127.0.0.1:1/"` simulated-unreachable run (11 skipped, 0 failed).

## Low

### 4. AC1's ownership check uses raw string equality, not ObjectId-normalized equality
- **Severity**: Low
- **File:line**: `server/routes/office-actions.js:61-63`
  (`callerCharIds.includes(String(actor_id))`).
- **The triggering input or sequence**: A `req.user.character_ids` entry and the request's `actor_id` that
  represent the same underlying character but differ only in hex case (the exact scenario AC4 explicitly
  guards against for the self-target check, a few lines later in the same handler).
- **The observable consequence**: A legitimate owner would be incorrectly rejected with 403 ("You may not
  act as this character") rather than allowed. This **fails safe** — it is not a bypass or security
  defect — so it does not undermine AC1's actual security property. It is included only because it's an
  inconsistency with the story's own AC4 reasoning about why case-normalized `ObjectId` comparison matters
  in this exact route, and because `character_ids` is not itself guaranteed to always be DB-canonical
  lowercase (it's user-session-derived data, not a fresh Mongo read). In practice, real Mongo `_id` values
  are always emitted in canonical lowercase, so this is unlikely to ever trigger.
- **Confidence**: Medium — confirmed by code inspection (not exercised live); the practical likelihood of
  the triggering condition arising is low given how `character_ids` is actually populated in this project's
  auth flow, which I did not trace further.

## Validation notes

**Pass 3a** (formed before reading the Dev Agent Record): opened `specs/stories/issue-1143-status-actions-auth-safety.md` in full via the `Read` tool. The `Read` tool returns entire files by default and this file is short enough that the whole thing — including the "Dev Agent Record" and the empty "Senior Developer Review" placeholder — came back in one call; I did not intend to read those sections yet and did not use their framing, claims, or the "external review finding" narrative to form any Pass 3a finding. Both High findings above were derived independently from the **Story / Acceptance Criteria / What this story is NOT / Tasks / Dev Notes** sections plus direct inspection of `server/routes/office-actions.js`, `server/index.js`, and live reproduction — not from anything stated in the Dev Agent Record. I'm disclosing this rather than silently claiming clean separation, per the honesty requirements outranking completeness. Also read: `specs/stories/code-review/issue-1143-diff.txt` (noted as stale per the task brief — used only to understand what changed vs. `aca9e996`, cross-checked against the live file), `server/routes/office-actions.js`, `server/index.js` (index-creation block), `server/tests/issue-1143-office-actions-auth-safety.test.js`, `server/tests/helpers/test-app.js` (mount line + `character_ids`/`stUser`/`playerUser` shape), `server/middleware/auth.js` (`isStRole`), `server/schemas/office_action.schema.js` (confirmed untouched via `git diff HEAD`), `public/js/tabs/office-tab.js` (confirmed untouched via `git diff HEAD --stat`), `server/db.js` (confirmed no `getClient()` added).

**Pass 3b**: read the Dev Agent Record in full, then verified each checkable claim by running it:

- Gate command (exact, as specified):
  `cd server && npx vitest run tests/issue-1143-office-actions-auth-safety.test.js tests/issue-1143-db-setup-skip.test.js tests/otc-2-office-actions-api.test.js tests/feature.691.hos-city-status-power.test.js`
  → **53 passed (53), 4 files passed** — matches the story's "100% pass" claim for this subset.
- 9-file changed-area suite (adding `cm1-cycle-phase.test.js`, `otc-2-city-status-calc.test.js`,
  `otc-3-office-nav-unconditional.test.js`, `issue-1141-office-tab-render.test.js`,
  `issue-1141-office-data-sync.test.js`): → **162 passed (162), 9 files passed**. Story claims "161 tests" —
  see Medium finding #3.
- Spot-checked all three named pre-existing-failure files (not just one):
  `npx vitest run tests/oath-a-pledge-helpers.test.js tests/n7-n9-allocator-readers.test.js tests/epic.708.3-cycle-phase-controls.test.js`
  → **3 files failed, 5 tests failed, 63 passed** — exactly the claimed shape (oath-a x1, n7-n9 x1 = #1115,
  epic.708.3 x3). Grepped all three files for `office-actions`, `db.js`, `index.js`, `db-setup` — **zero
  hits in all three**, corroborating "unrelated to this diff."
- AC3 concurrency tests run 3x in a row via `-t "AC3"`: all 3 tests green all 3 times — **no flakiness
  observed**, matching the story's own claim.
- Standalone-instance claim: live `hello` probe via a Node one-liner against `127.0.0.1:27017` →
  `setName: undefined`, `isWritablePrimary: true` — confirms standalone, no replica set, corroborating the
  transaction-unavailability justification.
- AC5 both-directions claim: `MONGODB_URI="mongodb://127.0.0.1:1/" npx vitest run tests/issue-1143-office-actions-auth-safety.test.js`
  → clean skip, **11 skipped, 0 failed** (story says "10 skipped" — see Medium finding #3; direction is
  correct, number is stale). Same env against `tests/otc-2-office-actions-api.test.js` → reproduced the
  exact claimed double-error: failed `beforeAll` (`MongoNetworkError: ECONNREFUSED`) plus a second error
  from `cleanup()` calling `getCollection()`/`getDb()` against an uninitialised connection, **1 file
  failed, 8 skipped**.
- Prove-discrimination cycle for the new regression test's algorithm mirror (the specific claim this pass
  was asked to re-verify): edited the `attempt()` helper inside the "REGRESSION" test in
  `server/tests/issue-1143-office-actions-auth-safety.test.js` to replace the rank-based check with the old
  raw `countDocuments() > budget` comparison, ran `npx vitest run tests/issue-1143-office-actions-auth-safety.test.js -t "REGRESSION"` →
  **RED**, observed shapes `["201,403/count=3", "403,403/count=2"]` — i.e. the exact "both racers self-evict"
  failure mode the record describes, reproduced faithfully. Reverted the edit back to the rank-based logic,
  re-ran the same command → **GREEN** (1 passed). Confirmed the restore was exact via
  `git diff -- server/tests/issue-1143-office-actions-auth-safety.test.js` (55 insertions, 0 deletions —
  identical to the file's state before I touched it) and `git status --short` (only the same
  pre-existing-modified files, nothing new).

**Additional live verification beyond what Pass 3b's checklist named** (used to substantiate the two High
Pass 3a findings above): wrote two temporary scratch test files directly under `server/tests/`
(`_audit-scratch-grantfirst-race.test.js`/`race2.test.js` and `_audit-scratch-multiactor-race.test.js`), ran
each against real `tm_suite_test`, then deleted them. Confirmed via `git status --short` both before and
after that no trace of these scratch files remains (untracked, never staged, fully removed).

**What I could not / did not run**: the full unfiltered `npx vitest run` (2384/2390 claim) — not run,
because the task brief's own guidance says to prefer the targeted spot-check over the full run "unless
verifying that specific claim," and the specific claim (pre-existing, unrelated failures) was independently
verified by running all three named suspect files directly (see above) rather than the full suite. I did not
independently re-derive the "7 additional FILE-LEVEL errors" list (`issue-1013-...` through
`n8-mandragora-prereq.test.js`) — those are asserted in the record as pre-existing/unrelated by name and two
were "inspected directly" per the record, but I did not re-open them myself; this is named explicitly as an
unverified-by-me claim rather than silently accepted.

**Confirmation nothing was left modified**: `git status --short` at the end of this review shows exactly the
same set of pre-existing modified/untracked files present at the start of the session
(`server/routes/office-actions.js`, `server/scripts/_locations-local.json`,
`server/tests/issue-1143-office-actions-auth-safety.test.js`, `specs/stories/issue-1143-status-actions-auth-safety.md`,
plus the large pre-existing set of untracked `_acad-*`/scratchpad files that predate this session and are
unrelated to it). No new modifications, no new untracked files, beyond this findings file itself.
