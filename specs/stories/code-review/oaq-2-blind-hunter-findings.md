# OAQ-2 — Pass 1: Blind Hunter findings

Reviewed `specs/stories/code-review/oaq-2-diff.txt` against base `ed181d8f`, with no story
spec and no prior-pass context. All findings below were checked against the actual working-tree
files (which already contain the diff, uncommitted, at `ed181d8f` HEAD) and, where marked
"confirmed by reproduction", against a live 3-node Atlas replica set through throwaway probe test
files that were deleted before finishing (see Validation notes).

## High

### 1. `accept` never re-validates the game-live-phase gate or the actor's court office — confirmed by reproduction
- **Severity:** High
- **File:line:** `server/routes/office-actions.js:200-290` (the whole `PUT /:id/accept` handler)
  vs. `server/routes/office-actions.js:129-134` (`GATED_TYPES`/`currentCycleInGamePhase` check) and
  `:147-148` (`actor.court_category` check) — both submission-only.
- **Triggering input/sequence:** A player submits a valid Status Action while a game is live and
  their character holds court office. Before an ST accepts it, the ST ends the session (cycle
  leaves `game` phase) and/or strips the actor's `court_category`. The ST then accepts the
  now-stale pending request.
- **Observable consequence:** `accept` applies the effect anyway — `status.city` is written, the
  budget is claimed (for paid types), and the request is marked resolved. Confirmed live: submitted
  while the cycle was in `game` phase and the actor held `Head of State`; then the cycle was flipped
  to `processing` and the actor's `court_category` was unset; the subsequent accept still returned
  `200` and the target's `status.city` moved from 3 to 4. The diff's own comment on
  `computeNewStatus` explains exactly why re-validation at accept time matters ("the target can
  legitimately change in between via another accepted action") — the identical reasoning applies to
  "is a game still live" and "does the actor still hold office", both of which are just as capable
  of changing between submission and approval, but neither is re-checked. This directly undercuts
  otc.2's stated rule ("Status Actions must only fire while a game is live") once "fire" is
  redefined by this diff to mean "apply at accept", not "apply at submission".
- **Confidence:** High — reproduced live against `tm_suite_test` on the real replica set; not
  reasoning from code alone.

### 2. Accept crashes (uncaught 500) and permanently deadlocks a legitimate second raise/lower on the same target — confirmed by reproduction
- **Severity:** High
- **File:line:** `server/routes/office-actions.js:265` (`const insertedLog = await
  actionsCol().insertOne(logDoc, { session: dbSession });` — no duplicate-key handling) interacting
  with the **unmodified** partial unique index at `server/index.js:206-216`
  (`{game_session_id, actor_id, target_id}` scoped to `action_type: {$in:['raise','lower']}` on
  `office_actions`, added under issue-1143 for the old atomic-apply flow and never revisited by this
  diff).
- **Triggering input/sequence:** Actor A submits and gets accepted for a `raise` on target T this
  session (logs one `office_actions` doc for the `{session, actor:A, target:T}` tuple). The new
  pending-dedupe index on `contested_roll_requests` only blocks a second **concurrent pending**
  request for the same tuple — once the first request is `resolved`, a brand-new `raise` submission
  against the same target is explicitly allowed (this is exercised and asserted by the diff's own
  `oaq.2 AC2` test, "allows a NEW submission... once the prior one is declined", and the same index
  scoping permits it after a resolve too). The ST then accepts this second, independently-valid
  request.
- **Observable consequence:** The old `office_actions` unique index — still enforcing "one
  raise/lower per target per session, ever" at the log-collection level — rejects the second insert
  with a MongoDB `E11000` duplicate-key error. This error is a plain `MongoError`, not a
  `RouteResponse`, so it falls through `catch (err) { if (err instanceof RouteResponse) ... else
  throw err; }` uncaught. The transaction itself aborts correctly (confirmed: the target's
  `status.city` stayed at its pre-accept value, the budget claim was rolled back, the pending record
  stayed `status: 'pending'` — no data corruption), but the HTTP response is an unhandled `500` with
  an **empty JSON body** (`{}`), and — critically — this is not transient: every future accept
  attempt on that same pending record will hit the identical duplicate-key error forever, because
  the colliding `office_actions` doc from the first accept never goes away. The only way an ST can
  clear the stuck request is `decline`, silently dropping a legitimate second raise/lower that the
  rest of the system (the pending-dedupe index, the AC2 test, `computeNewStatus`'s `old_status <
  10` / `> 1` bounds) was clearly designed to allow. Matches the story's own stated blast radius —
  "a bug here either lets an unapproved change through... or silently blocks a legitimate one" —
  this is the latter, and it presents to the ST as an opaque server crash with no diagnostic
  message, not a clean rejection.
- **Confidence:** High — reproduced live: `accept1` → `200`, `submit2` → `201`, `accept2` → `500
  {}`, target's `status.city` correctly still `4` (only the first raise applied) after the crash.

## Medium

### 3. `contested_roll_requests`' pre-existing accept/decline/void routes have no `request_type` scope and can silently orphan a pending Status Action
- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:136-149` (`_findChallenge` — `col().findOne({
  _id: oid })`, no `request_type` filter) and `:119-132` (`PUT /:id/void`, ST-gated, no ownership
  check at all beyond that).
- **Triggering input/sequence:** An ST (or any tooling that already knows/guesses a request `_id`)
  calls `PUT /api/contested_roll_requests/<id>/void` where `<id>` is a pending `status_action`
  record's `_id` (both request types share one collection and one `_id` namespace). `/void` requires
  no field ownership check, only `requireRole('st')`.
- **Observable consequence:** The status_action record is silently marked `status: 'voided'` without
  ever applying the effect, claiming budget, or logging to `office_actions`. `office-actions.js`'s
  `_findPending` only accepts `status: 'pending'`, so the record becomes permanently unreachable by
  either the correct `accept` or `decline` route afterward — orphaned with no error surfaced
  anywhere. (`contested-rolls.js`'s own `accept`/`decline` additionally check
  `challenge.target_character_id`, a field status_action docs never have, so those two specifically
  cannot succeed against a status_action doc for a player — but `/void`'s lack of *any* field check
  means it can.) This file is untouched by the diff, but the diff's own design decision — reusing
  `contested_roll_requests` for a second, differently-shaped request type — is what creates the
  exposure, and the hunt brief's point 2 asks exactly this question.
- **Confidence:** Medium — traced by code reading, not reproduced live (reproducing requires
  fabricating a plausible operator mistake rather than an app-triggered path, and the instructions
  ask me not to assert what I can't fully judge without the spec — it's possible the ST tooling
  never surfaces `contested_roll_requests` IDs generically enough for this to be reachable in
  practice; worth checking against the spec/ST UI).

### 4. The specified gate command is non-deterministic — cross-file DB state pollution
- **Severity:** Medium
- **File:line:** Not a single line — shared `game_sessions`/`downtime_cycles`/`office_action_budgets`
  collections across `server/tests/oaq-2-pending-status-actions.test.js`,
  `server/tests/issue-1143-office-actions-auth-safety.test.js`, and
  `server/tests/otc-2-office-actions-api.test.js`, each of which seeds via unscoped wipes
  (e.g. `downtime_cycles.deleteMany({})`, `game_sessions.deleteMany({session_date: {$lte: today}})`
  with no `NAME_PREFIX` scoping) inside per-test seed helpers.
- **Triggering input/sequence:** Running exactly the gate command specified in the review brief.
- **Observable consequence:** Two consecutive runs of the identical command produced different
  failure counts and different failing tests (`5 failed` then `9 failed`, different assertions each
  time — phase-gate and budget-cap tests flipping between `403`/`200`/`201` unpredictably). Every
  implicated file passes cleanly in complete isolation (`otc-2-office-actions-api.test.js`: 8/8 alone;
  `issue-1143-office-actions-auth-safety.test.js`: 13/13 alone). This means the gate command as
  specified cannot currently be trusted as a pass/fail signal — it can go green or red on the exact
  same code depending on execution order/timing, which could just as easily hide a real regression
  as manufacture a false one. Not caused by the route logic itself (isolated runs are clean), but a
  genuine reliability gap introduced or exposed by this diff's new/rewritten test files sharing
  unscoped seed/wipe helpers.
- **Confidence:** High that it's non-deterministic (directly observed across three separate runs);
  Medium on exact root cause (traced to shared unscoped collections, not fully bisected to one
  specific interaction).

### 5. No ST-facing UI anywhere calls the new accept/decline endpoints — worth checking against the spec
- **Severity:** Medium (flagged as "worth checking", not asserted as a bug)
- **File:line:** N/A — absence. Searched all of `public/js/` (including `public/js/admin/`) for any
  caller of `PUT /api/office_actions/:id/accept` or `/:id/decline`; found none.
  `public/js/suite/status.js:263-271` and `public/js/tabs/office-tab.js` only ever call
  `GET /api/office_actions` (the applied log) and `GET /latest_session`.
- **Triggering input/sequence:** N/A.
- **Observable consequence:** As shipped in this diff, a submitted Status Action has no in-app path
  to ever be accepted or declined — the only way to resolve one is a raw HTTP `PUT` (curl/Postman/a
  future admin page not present here). If this story's scope was meant to include a working
  end-to-end review flow, the feature is currently inert for real STs. Equally plausible: the ST
  review surface is intentionally deferred to a follow-up story under the same epic (OAQ), given the
  naming pattern seen elsewhere in this codebase (otc.2 vs oaq.2 as separate story slices) — I have
  no spec to confirm either way, so flagging rather than asserting.
- **Confidence:** High on the absence (exhaustive grep); Medium on whether this is actually in-scope
  for oaq.2 (spec-dependent, genuinely unknown to this blind pass).

## Low

### 6. `submitAndAccept()` helper defined but never called
- **Severity:** Low
- **File:line:** `server/tests/issue-1143-office-actions-auth-safety.test.js:137`
- **Triggering input/sequence:** N/A — static dead code.
- **Observable consequence:** The helper is added specifically to convert this file's tests to the
  new submit-then-accept two-step flow, but every actual call site in the file was hand-converted
  inline instead (`grep -c 'submitAndAccept('` on the file returns exactly `1`, the definition
  itself). Harmless — the inline conversions are correct — but it's unused code, and its presence
  without any call site is worth a second look in case a conversion was meant to use it and didn't
  (i.e. an inline test that should have called the helper but got hand-rolled slightly differently).
  The sibling file `server/tests/otc-2-office-actions-api.test.js` defines the same-shaped helper
  and does call it (4 call sites), so this isn't a case of the pattern being unavailable — just
  unused in this one file.
- **Confidence:** High (confirmed by grep — 1 total occurrence, the definition line).

### 7. Submit no longer optimistically updates client-side pending state — button re-render can go stale
- **Severity:** Low
- **File:line:** `public/js/tabs/office-tab.js:231-253` (`doAction`) vs. `:191-199`
  (`renderButtons`'s `alreadyPaid` check, driven by `priorActions`).
- **Triggering input/sequence:** A player submits a `raise`/`lower` against a target, then
  immediately tries to submit another action against the *same* target before an ST has resolved
  the first (or before the page's next fetch of `priorActions`).
- **Observable consequence:** The old code pushed the applied result onto `priorActions` so
  `alreadyPaid` (and thus button disabling) reflected the new state immediately. The new code drops
  that push entirely (correctly — there's no applied result to push yet) but never substitutes
  anything to reflect "a request against this target is now pending", so the button remains
  enabled and a same-target resubmission attempt is only caught server-side by the pending-dedupe
  index (409). Purely a UX rough edge — no data-integrity impact, since the server is the actual
  gate — but worth polishing.
- **Confidence:** High (confirmed by reading; the removed `priorActions.push(result.action)` line
  has no replacement).

### 8. `computeNewStatus()`'s error is identically shaped whether it fires at submission or accept
- **Severity:** Low
- **File:line:** `server/routes/office-actions.js:39-68` (`computeNewStatus`), called from `:156`
  (submission, courtesy check) and `:219` (accept, authoritative check).
- **Triggering input/sequence:** A pending request's stored precondition becomes invalid by accept
  time (e.g. another action changed the target in between).
- **Observable consequence:** Both call sites throw the exact same `RouteResponse(400, {error:
  'VALIDATION_ERROR', message: '...'})` shape with wording that doesn't distinguish "this was never
  a valid transition" from "this became invalid after submission because the target changed". An ST
  seeing a `400` on `accept` has no signal, from the response alone, that this is the target-drifted
  case specifically (as opposed to, hypothetically, a client bug that let an already-invalid request
  through). Not a functional bug — `AC5`'s test in the new file does correctly assert this returns
  `400` and leaves the record `pending` rather than corrupting it — just an observability gap.
- **Confidence:** Medium — a legitimate design choice could defend the shared shape as intentional
  simplicity; flagging as worth checking rather than asserting it's wrong.

## Validation notes

**Files opened/read in full:** `server/routes/office-actions.js` (current, post-diff),
`server/index.js` (lines 195-240), `server/routes/contested-rolls.js` (full),
`server/schemas/office_action.schema.js` (full), `server/tests/helpers/test-app.js` (full),
`server/tests/helpers/db-setup.js` (full), `public/js/tabs/office-tab.js` (relevant range),
`public/js/suite/status.js` (relevant range, via grep+context). Plus the full diff at
`specs/stories/code-review/oaq-2-diff.txt` (1221 lines, read in two passes).

**Commands run, with real results:**
- Gate command exactly as specified, run twice:
  - Run 1: `Test Files 2 failed | 3 passed (5)` / `Tests 5 failed | 62 passed (67)`
  - Run 2: `Test Files 3 failed | 2 passed (5)` / `Tests 9 failed | 58 passed (67)`
  - Different specific tests failed each run (see Finding 4). Neither run's failures are the
    5 pre-existing unrelated failures called out in the review brief (those are in different files:
    `n7-n9-allocator-readers.test.js`, `desktop-and-css.spec.js`, `post-game-1.spec.js` — none of
    which are in this gate set).
- `npx vitest run tests/otc-2-office-actions-api.test.js` alone: `8 passed (8)`.
- `npx vitest run tests/issue-1143-office-actions-auth-safety.test.js` alone: `13 passed (13)`.
- Two throwaway probe test files, written to `server/tests/`, run via `npx vitest run
  <file> --reporter=verbose`, then **deleted** immediately after capturing output:
  - `_blind-hunter-probe.test.js` — reproduced Finding 2 (second accepted raise on the same target
    this session → `500 {}` on the second `accept`, target correctly still at the first raise's
    value, second pending record correctly still `pending`).
  - `_blind-hunter-probe2.test.js` — reproduced Finding 1 (accept still applies after the cycle
    left `game` phase and the actor's `court_category` was stripped between submit and accept →
    `200`, target's `status.city` changed 3→4).
- `grep -c 'submitAndAccept('` equivalent (via Grep tool, count mode) on both test files —
  confirmed Finding 6's "1 occurrence = definition only" and the sibling file's "5 occurrences
  = definition + 4 call sites".
- Grep across `public/js/` (including `public/js/admin/`) for `office_actions` accept/decline
  call sites — confirmed Finding 5's absence claim.

**Could not run / did not attempt:** Did not attempt to reproduce Finding 3 (the
`contested-rolls.js` cross-route orphaning) live — doing so means simulating an operator mistake
rather than exercising an app-triggered path, and I have no spec to say whether that URL is ever
realistically reachable from ST tooling. Flagged as Medium/"worth checking" rather than confirmed.
Did not attempt a live repro of the malformed-stored-`ObjectId` scenario the review brief's hunt
point 5 asks about (`new ObjectId(pending.actor_id)` throwing inside the transaction) — every write
path that creates a `contested_roll_requests` status_action doc already validates both ids via
`new ObjectId(...)` at submission time (`office-actions.js:137-140`), so I could not find an
app-reachable way to get a malformed id into a stored pending record to trigger it; noting it as
theoretically the same failure *shape* as Finding 2 (any non-`RouteResponse` error inside the
`accept` transaction produces the same uncaught `500 {}`), but not separately confirmed, so I did
not write it up as its own finding.

**Confirmation nothing was left modified:** Both probe test files were deleted with `rm` immediately
after use. `git status --porcelain` on `server/tests/` after cleanup shows only the diff's own new
file (`server/tests/oaq-2-pending-status-actions.test.js`, untracked, expected — part of what's
under review) and the diff's own modifications to the four pre-existing tracked files already
present in the working tree at session start (confirmed via `git log --oneline -1` showing `HEAD`
at the base commit `ed181d8f`, meaning the working tree already carried the uncommitted oaq-2
changes before I touched anything). No file was edited, committed, or pushed by this review pass.
