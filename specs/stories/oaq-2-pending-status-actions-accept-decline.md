---
id: oaq.2
epic: oaq
epic_file: specs/epic-oaq-office-approval-queue.md
status: done
priority: high
type: feature
depends_on: [oaq.1]
branch: ms/oaq-2-pending-status-actions-accept-decline
---

# Story OAQ.2: Pending Status Actions — submit, ST accept/decline

As a Storyteller running Terra Mortis,
I want a Head of State's Status Action to wait for my sign-off before it changes anyone's City
Status,
so that no character's political standing changes without me having actually seen and approved
it — restated explicitly by Angelus: "because I want to be able to sign off on it. Status changes
need ST oversight."

## Why this story exists

`server/routes/office-actions.js`'s `POST /` currently applies a Status Action's effect
immediately and atomically (issue-1143 made that atomicity provably correct — see its Dev Notes
for the full transaction design). This story does not touch that correctness work; it changes
*when* the write happens. A submission becomes a pending record; only an ST's explicit accept
makes the character mutation and the budget claim real. Building this on the existing
`contested_roll_requests` pending-lifecycle pattern (status enum, discriminator field) rather than
new infrastructure — see oaq.1's data-lock findings, which this story builds directly on.

## Decisions already made (do not re-litigate)

- **Budget spends only on approval, not on submission.** Angelus's explicit call during this
  story's own scoping (2026-08-12): submitting is free — an actor can queue more requests than
  their budget allows, and the budget is claimed at the moment the ST approves, using the exact
  atomic-counter mechanism from issue-1143 (`office_action_budgets`, unchanged). No refund-on-
  decline logic exists because nothing was ever spent by a decline.
- **Reuse `contested_roll_requests`, don't build a new collection** — per oaq.1's data-lock
  finding 6 and the epic's own Goal line. Add a `request_type` discriminator
  (`'contested_roll' | 'status_action'`), defaulting existing documents to `'contested_roll'`
  (no backfill migration — see oaq.1 finding 6). Mirrors `relationships.kind`'s proven pattern
  (oaq.1 finding 3): discriminator enum + type-specific optional sub-fields, cross-field rules
  enforced at the route layer, not JSON Schema conditionals.
- **Budget is claimed against the ORIGINAL session a request was submitted under, not
  re-derived at approval time.** Angelus's explicit call (2026-08-12, review round): if a pending
  request survives across a session boundary and is only approved after a new session has started,
  the budget spend still lands on the session that actually gated and validated the request, not
  whichever session happens to be live when the ST clicks accept. A late-approved request never
  eats into a later session's budget allotment. Same design root as the phase-gate decision below —
  `accept` deliberately trusts the submission-time snapshot rather than re-deriving "what's current
  now" a second time.
- **`old_status` is recomputed fresh at approval time, not trusted from submission.** The target's
  `status.city` can legitimately change between submission and approval (another action approved
  in between). Approval re-reads the live target inside the SAME transaction pattern issue-1143
  already established (read → validate against current state → compare-and-swap write), rather
  than trusting a snapshot taken at submission time. A pending record whose action no longer makes
  sense against the current status (e.g. a `grant_first` on a target that already has a dot, because
  someone else's action landed first) is rejected at approval time with a clear error, not silently
  forced through.

## What this story is NOT

- NOT a UI for STs to browse/approve — that's oaq.3 ("New ST tab — approval queue view"). This
  story only needs the accept/decline **endpoints** to exist and work correctly; oaq.3 builds the
  screen that calls them. (An ST can exercise accept/decline via direct API calls or a temporary
  minimal affordance for this story's own dev-story testing, but a polished queue view is
  explicitly out of scope here.)
- NOT a change to the budget *formula* (`calcEffectiveCityStatus`) or the atomic counter mechanism
  itself — both already correct from issue-1143, reused as-is, just triggered at approval instead
  of submission.
- NOT a change to the game-phase gate (`GATED_TYPES`/`currentCycleInGamePhase`) — still checked at
  submission time (no point queuing a request while no game is live), unchanged from issue-1143.
- NOT Epic OXP's XP-spend approval routing ("ALL XP has to be approved," per the epic's sequencing
  notes) — that is a *future* consumer of this same queue, not built by this story. Do not design
  the schema to be XP-agnostic beyond the discriminator field already doing that job structurally.
- NOT Epic ROLLS (dice roll logging) — a separate epic that may eventually share oaq.3's tab; do
  not let its scope bleed into this story.

## Acceptance Criteria

1. `POST /api/office_actions` no longer applies the action immediately. It creates a `pending`
   record (in `contested_roll_requests`, `request_type: 'status_action'`) after: the existing
   auth check (AC1 unchanged from issue-1143), server-derived session, game-phase gate, ObjectId/
   self-target validation, actor court-office check, and target-precondition validation against
   the target's CURRENT `status.city` (so an obviously-invalid submission — e.g. `grant_first` on
   a target that already has City Status — is rejected at submission time with the same 400 shape
   as today, not silently queued to fail later).
2. A second, concurrent PENDING submission for the same `(game_session_id, actor_id, target_id)`
   combination is rejected (409) — mirrors issue-1143's per-target dedupe, now scoped to `pending`
   status specifically (a NEW submission is allowed once a prior one for the same target resolves
   one way or the other, so a declined attempt doesn't permanently block that actor from ever
   retrying that target).
3. `PUT /api/office_actions/:id/accept` (ST-role only): re-reads the target live, re-validates the
   action's precondition against the CURRENT status (not the value stored at submission time),
   claims a budget slot via the existing atomic counter (paid types only), performs the
   compare-and-swap write to `characters.status.city`, and marks the record `resolved` with an
   `outcome` sub-document — all inside one MongoDB transaction, following issue-1143's established
   pattern (RouteResponse sentinel for deliberate rejections, no spurious transaction retry).
4. `PUT /api/office_actions/:id/decline` (ST-role only): marks the record `declined`. No character
   mutation, no budget claim.
5. Given a pending record whose target precondition no longer holds at approval time (someone
   else's action landed first), `accept` rejects with a clear error and does NOT mark the record
   resolved incorrectly — the ST sees why it failed and the record stays inspectable.
6. Given budget is exhausted at approval time (even though it wasn't checked at submission),
   `accept` rejects with the same 403 "Budget exhausted" shape issue-1143 already uses.
7. The player-facing Office tab (`office-tab.js`) no longer shows "Done — status now N" on submit
   — a submission now means "pending ST review," and the client must not optimistically update
   `selectedChar.status.city` (verified live: `doAction`, `office-tab.js:231-251`, currently does
   exactly that and will show a false result once submissions stop applying immediately).
8. Two different STs cannot both successfully accept (or one accept + one decline) the SAME
   pending record — race-safe, matching `contested_roll_requests`'s own existing `_findChallenge`
   pending-guard pattern (reject with 409 if `status !== 'pending'` by the time the mutation runs).
9. Real behavioural test coverage (Supertest against the mounted app + `tm_suite_test`) for every
   AC above — not source-text assertions alone, per this project's established standard.

## Tasks / Subtasks

- [x] Task 1 — Extend `contested_roll_requests` for the new request type (AC: 1, 2)
  - [x] **DEVIATION**: `server/schemas/contested_roll_request.schema.js` was NOT touched. Verified
        `validate()` (`server/middleware/validate.js`) applies this schema ONLY to
        `contested-rolls.js`'s own `POST /` body — it is application-layer AJV validation of a
        specific route's request body, not a MongoDB-level document validator on the collection.
        `office-actions.js`'s new submission route builds and inserts `contested_roll_requests`
        documents entirely server-side, never validated against this schema. Adding fields to it
        that are never enforced through it would misleadingly imply enforcement that doesn't
        exist. The real shape is documented directly in the route code and in this story instead.
  - [x] Implemented the `request_type`/payload shape as proposed, unchanged from the plan:
        `{ request_type: 'status_action', status: 'pending', outcome: null, game_session_id,
        actor_id, actor_name, target_id, target_name, action_type, created_at, updated_at }`. No
        `old_status`/`new_status` stored — confirmed recomputed fresh at accept time (AC5).
  - [x] Added the partial unique index in `server/index.js`'s boot sequence AND directly in the
        two test files that need it (`createTestApp()` doesn't run `index.js`'s boot sequence —
        same precedent already established for the `office_actions` index).

- [x] Task 2 — Rewrite `POST /api/office_actions` to submit, not apply (AC: 1, 2, 7)
  - [x] Kept unchanged as planned: auth check, `findLatestSession()`, game-phase gate, ObjectId
        parsing, self-target check, actor court-office check, target load, action-type
        precondition validation (now via a shared `computeNewStatus()` helper reused by both the
        submit and accept routes, so the precondition logic exists in exactly one place).
  - [x] Removed the budget claim and CAS write from `POST /` entirely — confirmed no transaction
        is needed for the submission path (a single `insertOne` guarded by the new unique index is
        already atomic).
  - [x] Duplicate-key (E11000) on submission → 409, matching the existing error shape.
  - [x] Response shape: `{ request: {...pending doc...} }`, no `new_status`.

- [x] Task 3 — `PUT /api/office_actions/:id/accept` (AC: 3, 5, 6, 8)
  - [x] ST-role only, via `requireRole('st')`.
  - [x] `_findPending()` helper mirrors `contested-rolls.js`'s `_findChallenge` shape exactly (404
        missing, 409 not-pending).
  - [x] Full transaction: re-load actor/target live, `computeNewStatus()` against the CURRENT
        `old_status` (AC5), budget claim via `office_action_budgets` for paid types (AC6,
        unchanged mechanism), CAS write to `characters.status.city`, insert into `office_actions`
        (kept as the log — resolved to write there per the story's own "more conservative choice"
        note, since it's the established read path `GET /api/office_actions` already serves),
        `contested_roll_requests` marked `resolved` with an `outcome` sub-document, guarded by
        `{_id, status:'pending'}` in the update filter (AC8's race guard — a second concurrent
        accept finds `matchedCount === 0` and gets a clean 409, not a silent double-resolve).

- [x] Task 4 — `PUT /api/office_actions/:id/decline` (AC: 4, 8)
  - [x] ST-role only, same pending/race guard as accept. Sets `status:'declined'`. No character
        mutation, no budget claim, no `office_actions` log entry.

- [x] Task 5 — Player-facing Office tab update (AC: 7)
  - [x] `doAction` no longer sets `selectedChar.status.city` from a response that no longer carries
        `new_status`. Message changed to "Submitted — <name>'s <action> is pending ST review."
        Kept minimal/text-only (no design-lock invoked — this is a one-line message change to
        existing UI chrome, not new UI needing an aesthetic decision).
  - [x] Confirmed `paidUsed()`/`renderBudget()` need NO change: both derive from `priorActions`,
        fetched via `GET /api/office_actions`, which only ever returns APPLIED (accepted) actions
        — a pending request was never written there, so it already correctly excludes itself from
        the budget display without any code change. The `alreadyPaid` per-target dedupe check in
        `renderButtons()` has the same property: it doesn't know about a PENDING submission on the
        currently-selected target (only resolved ones), so a player could attempt a second
        submission for the same target while one is pending and get a live 409 from the server
        (AC2 still protects correctness) rather than a disabled button. Documented as a known,
        deliberately out-of-scope UX gap below rather than silently left unexamined.
        against the displayed remaining budget. Verify this doesn't require a change (the current
        display already derives from `office_actions`, which oaq.2 no longer writes to at
        submission time — confirm this is still correct once the write moves to
        `contested_roll_requests`, not silently assume it).

- [x] Task 6 — Full regression + review prep
  - [x] `issue-1143-office-actions-auth-safety.test.js` needed real rewrites, not just re-runs, as
        anticipated: 2 concurrency REGRESSION tests (grant_first race, different-actor lost-update)
        had to move from racing concurrent SUBMISSIONS to racing concurrent ACCEPTS, since that's
        where the atomicity logic now lives — submitting the same actor/target twice now just hits
        AC2's pending-dedupe (a different, correct rejection reason that would have made the old
        test pass for the wrong reason if left as-is). The "same character" dedupe test similarly
        moved from asserting an `office_actions` count to a `contested_roll_requests` pending
        count. The budget-scoping and budget-formula tests (this file + `otc-2-office-actions-
        api.test.js`) needed a `submitAndAccept` helper since budget only resolves at accept now.
        13/13 and 8/8 pass respectively after rewriting.
  - [x] New test file `server/tests/oaq-2-pending-status-actions.test.js`: 11 tests covering AC1-6
        and AC8 with real Supertest coverage (AC7's client-side change is covered by a source-text
        assertion in `feature.691...test.js` instead, matching that file's own established
        convention for this exact file). Confirmed genuine RED against the pre-oaq.2 route: 8/11
        failed on first run (the 3 that passed were auth/session/phase-gate assertions genuinely
        unaffected by the submission/apply split), all 11 green after implementation — this is
        this story's prove-discrimination evidence for AC1-AC6/AC8 collectively, not a
        per-assertion revert-cycle on top of it.
  - [x] `feature.691.hos-city-status-power.test.js` — one new assertion added (AC7, source-text)
        confirming the optimistic status update is gone and the pending-review message is present.
  - [x] Final changed-area regression: 176/176 across 10 files (the 9 from issue-1143's own final
        count, plus this story's new `oaq-2-pending-status-actions.test.js`).

## Dev Notes

### Current state of `server/routes/office-actions.js` (read in full before starting — this story
substantially restructures it)

147 lines as of commit `94beca64` (issue-1143's final state). `POST /` currently: validates auth →
derives session → phase-gates → parses/validates ids → runs the ENTIRE apply-immediately sequence
(actor/target load, precondition check, budget claim, CAS write, log insert) inside one
transaction. This story splits that into two routes: submission (most of the same up-front checks,
no transaction needed for a single insert) and a NEW accept route (the transaction-wrapped
apply-sequence, moved here almost unchanged from the current `POST /`, just re-triggered by an ST
action instead of the original submission).

### Current state of `server/routes/contested-rolls.js` (read in full — this is the collection
being extended)

176 lines. Four routes: `POST /` (create, sets `status:'pending', outcome:null`), `GET /mine`
(player's own pending challenges targeting them), `PUT /:id/accept` (rolls dice, sets
`status:'resolved'`), `PUT /:id/decline` (`status:'declined'`), `PUT /:id/void` (ST-only,
`status:'voided'`). `_findChallenge` (:136-149) is the shared lookup+pending-guard helper every
mutating route calls — study this shape closely, it's the direct precedent for oaq.2's own
accept/decline pending-guard (AC8).

### Files this story touches (final)

- `server/routes/office-actions.js` — REWRITTEN. `POST /` now submits only;
  `PUT /:id/accept`/`PUT /:id/decline` are new routes. `computeNewStatus()` and `_findPending()`
  extracted as shared helpers.
- `server/schemas/contested_roll_request.schema.js` — NOT touched (deviation, see Task 1).
- `server/routes/contested-rolls.js` — NOT touched. The status-action-specific routes live in
  `office-actions.js` (their own domain's imports — `calcEffectiveCityStatus`,
  `findRegentTerritory` — already live there), sharing the `contested_roll_requests` collection
  without sharing route file.
- `server/index.js` — UPDATE. New partial unique index on `contested_roll_requests` for the
  pending-dedupe (Task 1).
- `public/js/tabs/office-tab.js` — UPDATE. `doAction` (Task 5).
- `server/tests/oaq-2-pending-status-actions.test.js` — NEW.
- `server/tests/issue-1143-office-actions-auth-safety.test.js` — REWRITTEN in part (see Task 6).
- `server/tests/otc-2-office-actions-api.test.js` — UPDATE (`submitAndAccept` helper, 2 tests).
- `server/tests/feature.691.hos-city-status-power.test.js` — UPDATE (1 new AC7 assertion).

### Testing standards (reaffirmed from issue-1143)

Real behavioural Supertest coverage against the mounted app + `tm_suite_test`, not source-text
assertions alone. `server/tests/issue-1143-office-actions-auth-safety.test.js` and
`otc-2-office-actions-api.test.js` are the direct precedents for fixture/cleanup shape.

## Project Context Reference

`specs/project-context.md`, `CLAUDE.md` HARD RULE: never push/merge without explicit instruction
this session.

## Dev Agent Record

### Implementation summary

`POST /api/office_actions` split into submission-only; two new ST-only routes
(`PUT /:id/accept`, `PUT /:id/decline`) added. Pending records live in `contested_roll_requests`
(`request_type: 'status_action'`), reusing that collection's existing status-enum pending lifecycle
rather than building parallel infrastructure, per oaq.1's data-lock findings. Budget claim and the
compare-and-swap target write — both established by issue-1143 — moved from `POST /` into
`PUT /:id/accept` essentially unchanged; the precondition-validation logic
(`computeNewStatus()`) is now a single shared helper called by both routes instead of being
duplicated, so submission still rejects an obviously-invalid request immediately while accept
re-validates authoritatively against whatever the target's live status actually is.

### Deviation: `contested_roll_request.schema.js` left untouched

Task 1 planned to add a `request_type` field to the schema. Verified during implementation that
`validate()` (`server/middleware/validate.js`) applies a schema only to the specific route it's
attached to — `contestedRollRequestSchema` is wired to `contested-rolls.js`'s own `POST /` only.
The new status-action documents are built and inserted entirely server-side in
`office-actions.js`, never passed through that validator. Adding fields there that are never
enforced through it would misleadingly imply a validation guarantee that doesn't exist. The real
shape is documented in the route code's own comments and in this story instead.

### AC-by-AC verification

- **AC1/AC2** (submit creates pending, not apply; per-target dedupe at submission): verified live
  — a raise submission leaves `status.city` unchanged; a second concurrent submission for the same
  `(session, actor, target)` gets 409 via the new partial unique index; a resubmission after a
  decline succeeds (index is scoped to `status:'pending'` specifically).
- **AC3/AC6** (accept applies + claims budget): verified live — accept sets `status.city`,
  resolves the pending record, logs to `office_actions`; submitting 4 raises against a budget of 3
  all succeed (submission never checks budget), accepting the first 3 succeeds, the 4th accept
  gets 403.
- **AC4** (decline): verified live — no character mutation, no budget-doc creation, no
  `office_actions` log entry.
- **AC5** (accept re-validates against CURRENT state): verified live — actor A and B both submit
  `grant_first` on the same target (different actors, so submission-level dedupe doesn't block
  either); accepting A succeeds; accepting B afterward correctly fails (400 — the precondition no
  longer holds against the target's now-current status), and B's pending record stays inspectable
  as `pending`, not silently marked resolved.
- **AC8** (race-safety): verified live — two concurrent accepts on the SAME pending record: exactly
  one succeeds, the target reflects exactly one applied raise; an accept attempted after a decline
  (or vice versa) is rejected 409.
- **AC7** (client no longer optimistic): verified via source-text assertion (this file's own
  established pattern for `office-tab.js`) — the `selectedChar.status.city = result.new_status`
  line is gone; the "pending ST review" message is present.
- **AC9** (real behavioural coverage): 11 new Supertest tests in `oaq-2-pending-status-actions.
  test.js`, prove-discriminated as a set (8/11 genuinely failed against the pre-oaq.2 route on
  first run, all 11 pass against the final implementation).

### Regression

Changed-area suite (10 files): **176/176** pass —
`oaq-2-pending-status-actions.test.js` (11, new), `issue-1143-office-actions-auth-safety.test.js`
(13, rewritten in part — see below), `issue-1143-db-setup-skip.test.js` (3),
`otc-2-office-actions-api.test.js` (8, `submitAndAccept` helper added),
`feature.691.hos-city-status-power.test.js` (32, one new AC7 assertion), `cm1-cycle-phase.test.js`,
`otc-2-city-status-calc.test.js`, `otc-3-office-nav-unconditional.test.js`,
`issue-1141-office-tab-render.test.js`, `issue-1141-office-data-sync.test.js`.

`issue-1143-office-actions-auth-safety.test.js` needed real rewrites, not just re-runs: two
REGRESSION tests (grant_first same-target race, different-actor lost-update) moved from racing
concurrent SUBMISSIONS to racing concurrent ACCEPTS, since the atomicity logic they test moved
there — left as concurrent submissions, they would have passed for the WRONG reason (AC2's
pending-dedupe rejecting the second submission outright, never reaching the mechanism under test).
The same-target dedupe test moved from an `office_actions` count assertion to a
`contested_roll_requests` pending-count assertion. Two budget-formula tests in
`otc-2-office-actions-api.test.js` needed the same submit-then-accept restructuring.

Full suite (`npx vitest run`, no filter) run once against the final code: **2400/2405 passed, 5
failed / 10 files failed** — byte-identical to the established pre-existing baseline (`oath-a-
pledge-helpers.test.js` x1, `n7-n9-allocator-readers.test.js` x1 — #1115 — `epic.708.3-cycle-
phase-controls.test.js` x3, plus the same 7 unrelated file-level errors already confirmed
pre-existing during issue-1143's own review). No new failures.

### File List

- `server/routes/office-actions.js` — REWRITTEN; review round added the resubmit-after-accept
  guard, the `accept`-time `court_category` re-check, and the `findLatestSession()` tiebreak.
- `server/routes/contested-rolls.js` — MODIFIED during review round (was NOT touched by the
  original dev pass): `request_type: { $ne: 'status_action' }` guard added to `_findChallenge` and
  `PUT /:id/void`.
- `server/index.js` — MODIFIED (new `contested_roll_requests` partial unique index).
- `public/js/tabs/office-tab.js` — MODIFIED (`doAction`).
- `server/tests/oaq-2-pending-status-actions.test.js` — NEW; review round added 3 tests (resubmit-
  after-accept regression, different-actor-still-allowed, void-cannot-orphan regression) plus 1
  more closing the AC8 accept-vs-decline race coverage gap — 16 tests total.
- `server/tests/issue-1143-office-actions-auth-safety.test.js` — MODIFIED (rewrote 5 tests, added
  `submitAndAccept` helper, extended timeouts on 2 tests, updated `cleanup()`/index setup); review
  round removed the `submitAndAccept` helper (dead code — never called in this file).
- `server/tests/otc-2-office-actions-api.test.js` — MODIFIED (`submitAndAccept` helper, 2 tests
  rewritten, `cleanup()` extended).
- `server/tests/feature.691.hos-city-status-power.test.js` — MODIFIED (1 new AC7 assertion).
- `server/tests/helpers/test-app.js` — MODIFIED during review round: mounted `contestedRollsRouter`
  (was not mounted in the test app at all — needed to test the `/void` fix via real HTTP).

### Change Log

- 2026-08-12: All tasks complete, all ACs verified against real code. Status → review.
- 2026-08-12: Internal 3-layer review complete. 3 genuine product-design questions surfaced,
  resolved directly by Angelus. 5 real findings patched (accept crash/deadlock via stale index,
  missing court_category re-check, contested-rolls.js orphaning risk, findLatestSession() tiebreak
  flakiness, dead test helper); 1 test-coverage gap closed (AC8 accept-vs-decline race); 3 findings
  reviewed and dismissed with rationale (pre-existing raise lower-bound gap, out-of-scope ST UI
  items); 1 finding (budget-session-boundary attribution) reviewed, flagged to Angelus as an open
  corollary of the phase-gate decision, and confirmed correct-by-design as-is — no patch needed.
  Both structural fixes prove-discriminated. Full untargeted suite run twice post-fix: byte-identical
  to baseline both times, zero new failures. Status → review, ready to ship.
- 2026-08-12: All review findings resolved (patched, dismissed with rationale, or confirmed
  correct-by-design), no unresolved High/Medium remaining. Committed (`ab8145ad`, not pushed).
  Status → done.

## Senior Developer Review

Internal 3-layer review (Blind Hunter / Edge Case Hunter / Acceptance Auditor, all Agent-tool
subagents against the real `tm_suite_test` replica set). Full findings:
`specs/stories/code-review/oaq-2-{blind-hunter,edge-case-hunter,acceptance-auditor}-findings.md`
(untracked, per this project's own convention).

### Product/design questions surfaced by review, resolved by Angelus (2026-08-12)

Two of Blind Hunter's and Edge Case Hunter's independently-converged High findings were genuine
product-design ambiguity, not pure code defects, and were put to Angelus directly rather than
guessed:

1. **Can a target be re-targeted by the same actor after an ST already accepted a prior
   raise/lower on them this session?** Answer: **retargeting is allowed by a DIFFERENT actor, but
   the SAME actor is blocked after their own action on that target is accepted — only a decline
   frees a retry.**
2. **Should `accept` re-check the live game-phase gate?** Answer: **no, it should not require it.**

### Findings — patched

- **[High, Blind Hunter #2 / structurally identical root cause to the above] Accept could crash
  (uncaught 500, empty body) and permanently deadlock a legitimate second raise/lower on the same
  target.** Root cause: the pre-oaq.2 `office_actions` unique index (`{game_session_id, actor_id,
  target_id}`, scoped to `raise`/`lower`) still enforces "one raise/lower per target per session,
  ever" at the log-collection level, but oaq.2's pending-dedupe index only blocks a second
  CONCURRENT pending request — a second request submitted after the first resolves was allowed
  through to accept, where it hit the stale index and threw an uncaught `MongoError`. **Fixed** by
  directly implementing decision 1 above: `POST /` now rejects (409) a resubmission for
  `raise`/`lower` once a prior one on that `(session, actor, target)` tuple has been ACCEPTED
  (`server/routes/office-actions.js`, the `alreadyResolved` check in `POST /`). This makes the
  crash path structurally unreachable — the second pending record that would have triggered it can
  never be created — while also being the correct game-design rule. A decline still frees a retry
  (index scoped to `pending` only). Different actors are unaffected (index and this new check are
  both per-actor). Prove-discriminated: reverted the guard, confirmed the new REGRESSION test goes
  red (`expected 409, got 201`), restored, confirmed green.

- **[Medium, Acceptance Auditor] `accept` never re-validated the actor's court-office eligibility
  (`actor.court_category`).** The pre-oaq.2 atomic route checked this inside the same transaction
  that applied the effect; the split accidentally dropped it from `accept` (it remained only in
  `POST /`'s submission-time courtesy check). **Fixed**: `accept` now re-checks
  `actor.court_category` live, inside the transaction, before applying anything.

- **[Medium, Blind Hunter #3 / Acceptance Auditor, live-reproduced independently by both]
  `contested-rolls.js`'s pre-existing `PUT /:id/void` (and, per the Auditor's Low finding,
  `_findChallenge` — shared by `/accept` and `/decline`) had no `request_type` guard and could
  silently orphan a pending Status Action.** Live-reproduced by the Auditor: submitted a genuine
  `status_action` pending request, called `/void` on it as an ST, got `200`, and the record became
  permanently unreachable by either the correct accept or decline route (`_findPending` only
  matches `status: 'pending'`). **Fixed**: added `request_type: { $ne: 'status_action' }` to both
  `_findChallenge`'s query and `/void`'s update filter — the latter closes the live-reproduced
  orphaning bug directly; the former also hardens `/accept`/`/decline` explicitly rather than
  relying on the field-name coincidence the Auditor noted made them "currently harmless only by
  accident." Prove-discriminated: reverted the `/void` filter, confirmed the new REGRESSION test
  goes red (`expected 404, got 200`), restored, confirmed green.

- **[Low, Blind Hunter #4 / Acceptance Auditor Pass 3b] `findLatestSession()` had no tiebreak for
  two `game_sessions` documents sharing the same date, causing genuine cross-file test flakiness.**
  Independently observed by both passes (Blind Hunter: 2 runs of the same gate command, different
  failing tests; Acceptance Auditor: 9 runs of the full 10-file changed-area suite, 6 clean 176/176
  and 3 with real, differing failures — all shaped "expected 200/201, got 403", consistent with
  session-identity confusion). **Fixed**: `findLatestSession()`'s sort changed from
  `{ session_date: -1 }` to `{ session_date: -1, _id: -1 }`. Re-validated post-fix: full untargeted
  `npx vitest run` (2405+ tests) run twice back-to-back — see Regression below for results.

- **[Low, Blind Hunter #6] `submitAndAccept()` helper in `issue-1143-office-actions-auth-safety.
  test.js` was defined but never called** (every actual conversion was hand-rolled inline instead).
  Confirmed by grep (1 occurrence total = the definition). **Removed** — dead code, no call site to
  fix up.

- **[Low, Acceptance Auditor Pass 3a] AC8's "one accept + one decline" combination was only tested
  SEQUENTIALLY, not raced concurrently**, even though AC8's wording implies both combinations
  should be race-safe. The Auditor independently verified this was already functionally safe via a
  disposable scratch script (10/10 clean). **Closed the coverage gap for real**: added a permanent
  test racing accept against decline on the same pending record via `Promise.all` — exactly one
  wins, the target reflects that outcome consistently (`oaq-2-pending-status-actions.test.js`, new
  test under the AC8 describe block). Run 3× standalone, clean every time.

### Findings — reviewed, not patched (with rationale)

- **[High, Edge Case Hunter #2] Budget is claimed against the session bucket frozen at submission
  time (`pending.game_session_id`), not re-derived at accept.** If a pending request survives
  across a session boundary, the accept still claims budget against the OLD session's bucket, and
  the client's budget display (keyed to today's session) won't reflect it. Traced this to the exact
  same design root as decision 2 above: `accept` deliberately trusts the submission-time snapshot
  for "was this validly initiated" questions (phase-liveness, and by the same logic, which
  session's budget cap this action counts against) rather than re-deriving "what's current right
  now" a second time — the action belongs to the session it was submitted under, the same session
  whose `game` phase gated it in the first place. Flagged plainly to Angelus as a real
  economy-integrity question rather than silently folding it into decision 2's scope. **Angelus's
  decision (2026-08-12): keep it exactly as-is — budget attribution stays pinned to the ORIGINAL
  session the request was submitted under, not re-derived at accept time.** A late-approved request
  never eats into a later session's budget cap; it only ever spends against the allotment of the
  session that actually gated and validated it. **Not patched — confirmed correct-by-design, no
  code change.**

- **[Medium, Edge Case Hunter #4] `raise` has no lower-bound precondition — a target at City
  Status 0 could technically take a paid `raise` instead of the free `grant_first`.** Confirmed
  pre-existing (predates oaq.2 — the same unguarded branch exists in the diff's own removed lines)
  and unreachable through the intended UI (`office-tab.js` only renders the Raise button when
  `targetStatus > 0`). Not this story's regression to fix; worth a follow-up hardening story against
  `computeNewStatus` directly.

- **[Medium, Blind/Edge Case Hunter] No ST-facing UI calls the new accept/decline endpoints; client
  doesn't disable a button for a target with an outstanding PENDING (not yet resolved) request.**
  Both explicitly out of scope: the queue UI is oaq.3's job (stated in this story's own "What this
  story is NOT"); the pending-button UX gap is already documented in this story's own Task 5 notes
  as a deliberate, known gap (server-side 409 is the real gate; AC2 already covers correctness).

- **[Low, Blind Hunter #8] `computeNewStatus()` throws an identically-shaped 400 whether the
  precondition failure happens at submission or at accept**, giving an ST no signal from the
  response alone that a specific accept failed because the target drifted versus being invalid from
  the start. Legitimate simplicity choice, not a functional bug (AC5's test already asserts the
  record stays `pending`, not silently corrupted) — left as-is, noted for future observability
  polish only.

### Regression

Changed-area suite (10 files, same list as the Dev Agent Record): **180/180 pass** after all
patches above (this count already includes the 2 new REGRESSION tests plus the 1 new AC8
concurrency test added during this review round, on top of the Dev Agent Record's original 176).

The Dev Agent Record's **"176/176" changed-area figure is corrected here**: the Acceptance Auditor
ran the identical 10-file command 9 times and got 6× clean 176/176 but 3× real, differing failures
(170/176, 168/176, 175/176), traced to the `findLatestSession()` tiebreak gap just fixed above — so
176/176 was a true but not reliably reproducible number at the time it was recorded, not a false
claim. Post-fix, this review round independently confirmed 180/180 clean on this file set (rerun
standalone after all patches), plus a full untargeted `npx vitest run` (2409 tests) run **twice**
back-to-back post-fix: **2404/2409 passed, 5 failed, both runs byte-identical** — exactly the
established pre-existing baseline (`n7-n9-allocator-readers.test.js` ×1, `oath-a-pledge-
helpers.test.js` ×1, `epic.708.3-cycle-phase-controls.test.js` ×3), plus the same 7 unrelated
file-level `SyntaxError`/`ENOENT` errors already known and unrelated to this diff (none reference
`office-actions`, `contested-roll`, `office-tab`, `db.js`, or `index.js`). Both runs identical, no
oaq.2-related failures in either — the tiebreak fix genuinely resolved the flakiness both Blind
Hunter and Acceptance Auditor independently observed, not just moved it around.

Both structural fixes (the resubmit-after-accept guard and the `/void` request_type guard) were
prove-discriminated individually: temporarily reverted, confirmed the corresponding new REGRESSION
test goes red for the expected reason, restored, confirmed green again.

### Outcome

Ready to ship. No blocking problems found by any of the three passes. All patches applied,
prove-discriminated where structural, and regression-tested; the one flagged design question
(budget-session-boundary attribution) was put to Angelus and confirmed correct-by-design as-is.
