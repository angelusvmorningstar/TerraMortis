# oaq-2 (Pending Status Actions — submit, ST accept/decline) — Edge Case Hunter findings (Pass 2)

Reviewed the current on-disk `server/routes/office-actions.js`, `server/index.js` (index-creation
block), `public/js/tabs/office-tab.js`, `server/middleware/auth.js`, `server/routes/game-sessions.js`,
`server/schemas/office_action.schema.js`, `server/schemas/contested_roll_request.schema.js`, and
the full diff at `specs/stories/code-review/oaq-2-diff.txt` (base `ed181d8f`). Working tree matched
the diff's post-image for every file I checked — no drift to flag this time (unlike the prior
issue-1143 pass on this same route). No story spec consulted, per Pass 2 scope.

## High

### 1. `PUT /:id/accept` never re-checks the game-phase gate — a stale pending request can be approved outside the live game window

- **Severity**: High
- **File:line**: `server/routes/office-actions.js:200-290` (`router.put('/:id/accept', ...)`) vs
  `:129-134` (the `GATED_TYPES` phase check, which lives ONLY in `POST /`)
- **The triggering input or sequence**: `currentCycleInGamePhase` is imported once and called
  exactly once in the whole file — line 131, inside `POST /`'s submission path (confirmed by
  grepping the file for the symbol: two hits total, the import and that one call). The accept
  handler calls `_findPending`, then goes straight into `dbSession.withTransaction(...)` — actor
  lookup, target lookup, `computeNewStatus`, budget claim, CAS write, log, resolve. Nothing in that
  path re-derives "is a game currently live" the way submission does. So: actor submits
  `grant_first`/`raise`/`lower`/`strip_last` while a cycle is genuinely in `game` phase (submission
  passes the gate, pending record created) — the ST does not act on it immediately (entirely
  plausible; STs triage a queue) — the cycle then moves on (`prep`/`processing`/`downtime`, or a
  brand new cycle opens) — an ST later clicks Accept on the now-stale request. Nothing rejects
  this. The transaction runs to completion and the target's `status.city` changes for real, weeks
  after the game session that was supposed to gate this action ended.
- **The observable consequence**: This directly undermines the business rule otc.2 introduced
  specifically for this route (its own removed comment, visible in the diff, reads "Status Actions
  must only fire while a game is live" — restated verbatim as the reason `GATED_TYPES` exists). The
  two-step split silently narrowed that guarantee to "must have been live at some point when
  someone clicked the button," not "must be live when the effect actually lands." An ST doing
  routine end-of-cycle cleanup (accepting a backlog of pending requests during downtime/prep) would
  apply City Status changes the phase gate was written to prevent, with no error, no warning, and
  no code path that would ever catch it.
- **Confidence**: High — confirmed by exhaustive grep of the file (only one call site, inside
  `POST /`) and by reading the full accept handler top to bottom; there is no conditional, no
  early-return, and no comment anywhere in the accept path that references phase at all. Not
  independently reproduced live (would require seeding a cycle in `game` phase, submitting, then
  flipping the cycle to another phase and calling accept) — but the absence of the function call is
  unambiguous from the code, not a probabilistic race.

### 2. Budget is claimed against a session bucket frozen at submission time, not the live session at approval time — accepts spanning a session boundary silently misattribute (or duck) budget

- **Severity**: High
- **File:line**: `server/routes/office-actions.js:226` (`budgetKey = \`${pending.game_session_id}:${pending.actor_id}\``)
- **The triggering input or sequence**: `pending.game_session_id` is whatever `findLatestSession()`
  resolved to at SUBMISSION time (line 124-127, inside `POST /`). The accept handler never calls
  `findLatestSession()` — grepped the whole file: `findLatestSession` has exactly two call sites,
  both inside `POST /` (line 91 for `GET /latest_session`, line 124 for submission); accept and
  decline call neither. So if a pending request survives from one game session into the next (a
  request submitted near the end of a game night, left unresolved, then an ST accepts it after the
  next month's session record exists — this project runs one game session roughly per month per
  the project's own game-to-month calendar convention, and downtime/prep between sessions routinely
  spans weeks, so an unresolved pending request outliving its session is an entirely ordinary
  occurrence, not a contrived one), the accept still claims budget against the OLD, now-stale
  `budgetKey`, not a bucket tied to whatever session is actually live when the ST clicks Accept.
  Compounding this: `PUT /:id/accept` never looks up `game_sessions` at all to check the referenced
  session even still exists — `DELETE /api/game_sessions/:id` exists (`server/routes/game-sessions.js:94`)
  with no referential-integrity check, so an accept can silently create/increment a budget document
  keyed to a session id that has since been deleted, with nothing surfacing that anywhere.
- **The observable consequence**: Two-sided bug. (a) The budget consumed by that late accept is
  attributed to the OLD session's bucket, not today's — so it does NOT count against the actor's
  current-session cap of `calcEffectiveCityStatus(...)`, meaning the actor effectively gets extra
  budget beyond the per-session allotment purely by having a leftover pending request accepted
  after a new session starts. (b) The client's budget display (`office-tab.js`'s `renderBudget()`)
  computes remaining budget by querying `GET /api/office_actions?game_session_id=<today's id>` —
  which will never include a log entry stamped with the OLD session id — so the UI shows an
  inflated "remaining budget" that doesn't reflect what was actually spent moments earlier by that
  stale accept. The economy-integrity guarantee issue-1143/otc.2 built (budget genuinely capped per
  session) is quietly bypassed for any accept that crosses a session boundary, and there is no
  code path anywhere that flags this to the ST performing the accept.
- **Confidence**: High for the mechanism (direct code reading — no `findLatestSession` call in
  accept, confirmed by exhaustive grep). Medium-High for real-world reachability: I did not create
  two `game_sessions` documents and empirically race an accept across the boundary (time-boxed out
  of this pass), but the project's own operating cadence (session records created roughly monthly,
  with the same-day `session_date <= today` matching logic meaning a NEW record is required to
  shift `findLatestSession()`'s answer at all) makes a pending request outliving its session
  entirely ordinary rather than a rare edge case — this is the same root cause as Finding #1
  (accept trusts the frozen submission-time snapshot with no revalidation of "what's current now"),
  just with the budget-bucket consequence instead of the phase-gate consequence.

## Medium

### 3. Client never disables an action button for a target that already has a PENDING (not yet resolved) request against it

- **Severity**: Medium
- **File:line**: `public/js/tabs/office-tab.js:191-229` (`renderButtons()`), specifically the
  `alreadyPaid` computation (line 196-199, derived solely from `priorActions`) and the
  `grant_first`/`strip_last` buttons (lines 223-228, `disabled` hardcoded to `false`)
- **The triggering input or sequence**: `priorActions` is populated exactly once per tab load from
  `GET /api/office_actions?...` (line 139-146), which per the route's own comment
  (`office-actions.js:96-97`) "Reads the APPLIED action log... pending/declined requests live in
  contested_roll_requests and are not surfaced here." `doAction()` never re-fetches `priorActions`
  after a successful submit (line 249 calls `renderButtons()` directly against the stale array, not
  a refetch) — so after submitting `raise` on a target, `alreadyPaid` for that target is still
  `false`, and the Raise/Lower buttons stay enabled with no "pending" indication. Worse, the
  `grant_first`/`strip_last` buttons don't consult `alreadyPaid` at all — `disabled` is a literal
  `false` — so those are always clickable regardless of an existing pending request. A player can
  click Raise (or Grant First Dot) a second time on the same target while their first submission is
  still awaiting ST review.
- **The observable consequence**: The second `POST /api/office_actions` call reaches the server and
  is correctly rejected — the pending-scoped partial unique index on `contested_roll_requests`
  (keyed on `{game_session_id, actor_id, target_id}`, no `action_type` component, so ANY second
  action type on the same target collides too) throws a duplicate-key error, caught at
  `office-actions.js:180-183` and turned into a 409 `"A pending request already exists for this
  target"`. So there is no data-corruption or double-application risk (confirmed both by reading
  the unique index's key shape and by the passing AC2 test in `oaq-2-pending-status-actions.test.js`
  covering the same-actor-same-target duplicate case) — this is purely a UX gap: a button that
  looks actionable, shows no "pending" state, and always fails with a generic conflict message if
  clicked while its own prior submission is outstanding.
- **Confidence**: High that this is reachable exactly as described (direct code reading of both the
  client gating logic and the server's dedupe index); confirmed the server-side 409 protection by
  reading the index definition and the existing passing test rather than adding new coverage.

### 4. `raise` has no lower-bound precondition — a target at City Status 0 can take a PAID `raise` instead of the FREE `grant_first`

- **Severity**: Medium
- **File:line**: `server/routes/office-actions.js:52-56` (`computeNewStatus`, the `raise` branch)
- **The triggering input or sequence**: `raise`'s only guard is `if (old_status >= 10) throw ...`;
  there is no `old_status < 1` (or `=== 0`) check the way `lower` has one (`old_status <= 1` throws,
  correctly forcing a target at exactly 1 to use `strip_last` instead). So `computeNewStatus('raise', 0)`
  returns `1` without complaint — identical output to `grant_first` on the same input, except
  `raise` is in `PAID_TYPES` (consumes a budget slot) while `grant_first` is free. This is
  pre-existing behaviour (the removed block in the diff shows the exact same unguarded `raise`
  branch before oaq.2 — not a regression this diff introduced), but oaq.2's refactor now runs this
  exact flawed check at BOTH submission time (the "courtesy" reject) and accept time (the
  "authoritative" reject) via the same shared `computeNewStatus` — so the split didn't just fail to
  fix it, it doubled down on reusing the same gap in both places that are supposed to catch invalid
  transitions.
- **The observable consequence**: The normal player UI never reaches this path — `office-tab.js:213`
  only renders the Raise button when `targetStatus > 0`, so a player using the tab as intended
  can't trigger it. But the server has no independent enforcement of the free/paid boundary at
  status 0 — any direct API call (or a future client change/bug that relaxes that `> 0` guard)
  would let an actor spend a budget slot on what should be a free `grant_first`-equivalent action,
  or conversely let an ST manually "raise" a status-0 target through this endpoint without it
  reading as the semantically-distinct grant event it actually is.
- **Confidence**: High that the gap exists as described (direct code reading, and the removed diff
  hunk confirms it predates oaq.2). Medium on severity, given the client-side gate makes it
  unreachable through the intended UI today — flagged because the hunt list explicitly asked to
  verify this exact scenario and the shared-validator refactor is new even though the flaw itself
  isn't.

## Low

- **Hunt item 1 (AC5's true-concurrency race — different actors' accepts racing on the same
  `grant_first` target): no gap found.** Traced the CAS filter (`old_status === 0` →
  `{$or: [{'status.city': {$exists:false}}, {'status.city': 0}]}`) and confirmed MongoDB's
  write-conflict detection operates at the document level (via the storage engine's MVCC snapshot
  isolation), not per-filter-shape — a second transaction attempting to modify a document another
  uncommitted transaction already touched gets a real `WriteConflict`, which `session.withTransaction()`
  retries by re-running the ENTIRE callback from a fresh snapshot; on retry, `old_status` is
  re-read as the now-current value, so `computeNewStatus` correctly rejects the loser (400, "Target
  already has City Status") rather than both landing. This is exactly what the pre-existing
  regression test (`issue-1143-office-actions-auth-safety.test.js`, "concurrent grant_first on one
  target — at most one succeeds", updated by this diff to race two different actors' accepts via
  `Promise.all`) asserts across 10 iterations — I ran it as part of the gate command below and it
  passed with 0/10 double-wins, empirically confirming the filter shape does not create the gap the
  hunt item hypothesised. [Pass 2]

- **Hunt item 2 (different action types racing, no shared pending-index collision): correctly
  caught at accept time, no data-integrity gap.** Traced `raise` (target at 0, passes courtesy
  check per Medium finding #4 above) racing `grant_first` (also passes, different actor) on the
  same target. Both submissions succeed (dedupe is per-actor). Whichever accept lands first CAS-
  writes the target to 1; the second accept re-reads the target live (`old_status` now 1) and
  `computeNewStatus` correctly rejects it (`grant_first` requires `old_status === 0`; `raise` at 1
  would instead succeed and stack correctly rather than corrupt anything). This exact sequential
  scenario is covered by the new AC5 test in `oaq-2-pending-status-actions.test.js`, which passed.
  The only real gap surfaced by this item is Medium finding #4 (raise's missing lower bound), not a
  race/integrity defect. [Pass 2]

- **Hunt item 5 (`/:id/accept` or `/:id/decline` against a real `contested_roll` document's id): no
  gap found.** `_findPending`'s query is `pendingCol().findOne({ _id: oid, request_type: 'status_action' })`
  — a genuine `contested_roll` document (any `request_type` other than `'status_action'`) simply
  does not match, `doc` is `null`, and the handler returns a clean 404, not a 500 and not a
  wrongly-processed contested-roll record. Also checked for an index-name collision risk: only one
  `createIndex` call targets `contested_roll_requests` anywhere in `server/` (the oaq.2 one in
  `server/index.js`), so there's no `IndexOptionsConflict` risk from a second differently-scoped
  index sharing the same auto-generated name on that collection. [Pass 2]

- **Hunt item 6 (budget claim leaking if the CAS write fails after it): no gap found.** Both the
  budget `findOneAndUpdate` and the CAS `updateOne` run inside the same `dbSession.withTransaction()`
  callback, using the same `dbSession` for every operation. When the CAS write's `matchedCount === 0`,
  the handler throws `RouteResponse(409, ...)` synchronously inside the callback, before
  `commitTransaction()` is ever reached — per the MongoDB driver's documented `withTransaction`
  semantics, an uncaught throw from the callback (that isn't itself a transient/retryable error —
  confirmed `RouteResponse` carries no MongoDB error labels, so it isn't retried) causes the driver
  to abort the transaction and rethrow the original error to the caller. The outer `try/catch`
  around `dbSession.withTransaction(...)` (lines 282-284) then maps that back to the 409 response.
  The budget increment is rolled back along with everything else — verified by reading the actual
  control flow, not assumed from "should be transaction-protected." [Pass 2]

- **`game_session_id` remains a required schema field the client sends but the server now fully
  ignores at submission (unchanged from the prior issue-1143 pass's Low finding on this same
  point).** `server/schemas/office_action.schema.js:3,6`. Not a bug, just a slightly confusing
  contract; not introduced by this diff. [Pass 2]

## Validation notes

**Files opened**: `server/routes/office-actions.js` (in full, current on-disk), `server/index.js`
(index-creation block via targeted read), `public/js/tabs/office-tab.js` (in full),
`server/middleware/auth.js` (`isStRole`/`requireRole` via grep+context), `server/routes/game-sessions.js`
(in full), `server/schemas/office_action.schema.js`, `server/schemas/contested_roll_request.schema.js`
(grepped, empty match confirmed no index/request_type logic there), `public/js/data/api.js`
(`apiPost`/`apiRaw` shape), `specs/stories/code-review/oaq-2-diff.txt` (in full, both pages), and
the prior `specs/stories/code-review/issue-1143-edge-case-hunter-findings.md` purely to match this
pass's output shape (not treated as ground truth about the current code — re-verified everything
against the live diff/files independently).

**Commands run, with real results**:

- `cd server && npx vitest run tests/oaq-2-pending-status-actions.test.js tests/issue-1143-office-actions-auth-safety.test.js tests/issue-1143-db-setup-skip.test.js tests/otc-2-office-actions-api.test.js tests/feature.691.hos-city-status-power.test.js`
  → `Test Files 5 passed (5)`, `Tests 67 passed (67)`, 53.16s. DB was reachable (real 3-node Atlas
  replica set per this project's `.env`) — no suites skipped. This run is what empirically confirms
  the Low finding on hunt item 1 (0/10 double-wins on the concurrent-accept regression test).
- `Grep` for `currentCycleInGamePhase` and `findLatestSession` across `server/routes/office-actions.js`
  — each returns exactly the 2 hits reported in High findings #1 and #2 (one import + one call
  site each, both confined to `POST /`). This is the direct evidence for both High findings.
- `Grep` for `contested_roll_requests` across `server/` — 7 files, only `server/index.js` calls
  `createIndex` on that collection, ruling out the index-name-collision concern under hunt item 5's
  Low writeup.

**Anything I could not run, and why**: Did not empirically reproduce High finding #2 (cross-session
budget bucket) by creating two `game_sessions` documents and racing an accept across the boundary —
time-boxed out of this pass; the finding rests on direct code reading (exhaustive grep confirming
no `findLatestSession` call anywhere in the accept path) rather than a live reproduction, and I've
marked confidence accordingly (High on mechanism, Medium-High on real-world reachability). Did not
independently reproduce Medium finding #3 (stale-pending-button UX gap) end-to-end through a
browser — confirmed via direct reading of `office-tab.js`'s gating logic and the server's existing
passing AC2 test for the resulting 409, which together fully account for both halves of the claim
(client doesn't block; server does) without needing a live UI session.

**Modifications**: None. No files were edited, no temporary scripts were written to disk for this
pass — every finding was reachable via reading plus the one specified gate-test command. `git
status --short` was not re-checked at the end since nothing was touched; the repo's pre-existing
untracked/modified state (visible in the session's initial git status, all unrelated to this route)
was left exactly as found.
