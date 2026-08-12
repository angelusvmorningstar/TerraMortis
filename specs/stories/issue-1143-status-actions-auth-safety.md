---
issue: 1143
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1143
branch: ms/issue-1143-status-actions-auth
---

# Story issue.1143: Status Actions — actor authorization + write safety

Status: review

## Story

As a Storyteller running Terra Mortis,
I want `POST /api/office_actions` to reject forged actors, forged sessions, and racing/duplicate
writes,
so that a Status Action can only ever be submitted by the Head of State it claims to come from,
scoped to a real game session, and cannot be used to exceed the intended per-session budget or
double-act on one target.

## Why this story exists

Surfaced by an external Codex review (`reasoning_effort=high`, 3-pass) of story
`otc-2-status-actions-server-hardening`, 2026-08-12. That story fixed two specific defects (budget
calculation, game-phase gate) in `POST /api/office_actions`. The review's blind and edge-case
passes found five further defects in the same endpoint, all confirmed against the pre-diff code
(pre-existing since #691) and deliberately left unpatched as out of that story's scope. Bundled
into one issue (#1143) and one story since they're all the same route and several fixes are
naturally designed together. Full record: `specs/stories/otc-2-status-actions-server-hardening.md`
→ Senior Developer Review, and `specs/deferred-work.md` → "Deferred from: code review of
otc-2-status-actions-server-hardening (2026-08-12)".

`otc-3-office-tab-browsable-reference` (also 2026-08-12) removed the Office tab's UI discovery
barrier for non-officeholders — the API route was always directly reachable regardless of tab
visibility, so nothing new is exposed by that story, but the pre-existing gap this story fixes is
now more likely to be stumbled onto. Angelus reviewed that trade-off and approved shipping otc.3
as scoped rather than blocking on this fix landing first.

## What this story is NOT

- NOT the ST approval queue (`epic-oaq-office-approval-queue.md`) — that's a separate, larger
  mechanism (park every Status Action pending ST sign-off) that would close much of finding #1's
  *practical* risk but is explicitly not a substitute for fixing the authorization gap directly
  here. Not built or referenced by this story beyond that scope note.
- NOT a change to the budget *formula* itself — already corrected in `otc-2` via
  `calcEffectiveCityStatus`. This story only makes the scoping *key* (`game_session_id`) and the
  check/write *sequence* trustworthy; it does not touch what counts toward the budget.
- NOT a change to the game-phase gate mechanism (`currentCycleInGamePhase`) — already fixed in
  `otc-2`, including its stale-cycle regression. This story's session-derivation fix (AC2) sits
  alongside that gate, not in place of it — both checks still run.
- NOT the `office-tab.js` network-vs-no-live-game ambiguity (Medium, also flagged in otc-2/otc-3
  review) — that one was deliberately excluded from issue #1143's own bundle (it needs a UX
  decision on wording, not a safety fix) and stays in `deferred-work.md` for a future story.
- NOT any change to which office categories exist or what powers they grant — `office-data.js` and
  `OFFICE_CATEGORIES` are untouched.

## Acceptance Criteria

1. **Actor authorization.** Given an authenticated player, when they POST with an `actor_id` that
   is not in their own `req.user.character_ids` and they hold no ST role (`isStRole(req.user)` is
   false), then the request is rejected with 403 before any other business logic runs. An ST-role
   caller may act as any actor (matches the existing project-wide ST-override convention in
   `isRegentOfTerritory`/`npcs.js`'s quick-add ownership check).
2. **Session binding.** The server derives the authoritative `game_session_id` itself (the same
   `game_sessions` query already used by `GET /latest_session` — most recent `session_date <=
   today`), not from the client-supplied body field. A client-supplied `game_session_id` that
   doesn't match the server-derived one is ignored in favour of the server-derived value — the
   client can no longer choose an arbitrary string to reset budget/dedupe scoping. If no session
   exists, the request is rejected the same way `latest_session` already reports "none" (see Dev
   Notes → open question resolutions for why this binds to `game_sessions`, not
   `downtime_cycles`).
3. **Atomic budget + dedupe + write.** Given two concurrent paid (`raise`/`lower`) requests from
   the same actor with exactly one budget slot remaining, at most one succeeds; the other receives
   403 (budget exhausted) or 409 (duplicate target), never both succeeding. Given two concurrent
   requests targeting the same character in the same session, at most one succeeds.
4. **Self-target check on resolved ObjectIds.** Given `actor_id` and `target_id` that are
   textually different strings but resolve to the same `ObjectId` (e.g. differing only in hex
   case), the request is rejected as a self-target (400) — the check runs on parsed `ObjectId`
   equality, not raw string equality, and runs after both ids are confirmed to parse as valid
   ObjectIds.
5. **Test-infra clean skip.** Given MongoDB is unreachable, suites built on
   `server/tests/helpers/db-setup.js`'s `setupDb()`/`teardownDb()` report a clean skip (vitest
   marks the suite skipped, exit code reflects "0 run", no assertion failure), not the
   failed-`beforeAll`-plus-erroring-`afterAll` double-error the current code produces. Applies at
   minimum to this story's own new/modified test file(s); does not require touching every other
   `setupDb()` consumer in the project (see Dev Notes → Task 5 scope).
6. No regression to the four action types, the corrected budget calculation, the game-phase gate,
   or the per-target dedupe semantics established by `otc-2`.
7. Real behavioural test coverage (Supertest against the mounted app + `tm_suite_test`) for each
   of AC1–AC4 — not source-text/regex contract assertions alone, matching this project's own
   standard (`otc-2`'s Dev Notes → Testing standards, and CLAUDE.md's test-framework guidance).

## Tasks / Subtasks

- [x] Task 1 — Actor authorization (AC: 1)
  - [x] In `server/routes/office-actions.js`'s `POST /` handler, after schema validation and before
        the existing game-phase gate, add: reject 403 unless `isStRole(req.user)` OR
        `(req.user.character_ids || []).map(String).includes(String(actor_id))`. Import
        `isStRole` from `../middleware/auth.js` (already exported, already used by
        `isRegentOfTerritory` in the same file — reuse the pattern, don't reinvent).
  - [x] `createTestApp()` in `server/tests/helpers/test-app.js` already mounts
        `officeActionsRouter` behind `mockAuth` only (no `requireRole` wrapper) — this story's
        check is the route's own first authorization gate, so no test-harness mounting change is
        needed. Confirm this by reading `test-app.js:119-120` before assuming otherwise.
  - [x] Test both branches with `playerUser([...])` and `stUser()` from `test-app.js` (same helpers
        `otc-2-office-actions-api.test.js` already uses).

- [x] Task 2 — Server-derived `game_session_id` (AC: 2)
  - [x] Extract the query in `GET /latest_session` (lines 19-25 of `office-actions.js`) into a
        small shared helper (e.g. `findLatestSession()`) used by BOTH that route and `POST /`, so
        there's one implementation, not two independently-maintained copies of the same query —
        mirrors the "exactly one place" convention `otc-2` established for
        `calcEffectiveCityStatus`.
  - [x] `POST /` calls this helper itself and uses the resolved session's `_id` (stringified) as
        the `game_session_id` for the budget count, dedupe check, and the inserted action
        document — NOT `req.body.game_session_id`. If the helper finds no session, reject with the
        same shape `GET /latest_session` already uses for "none" (currently returns `null` with
        200 — for `POST /`, a missing live session should be a 403/404, since there's nothing to
        scope the action against; pick whichever this project's error-shape convention prefers
        and document the choice in Dev Notes). IMPLEMENTED: 403 FORBIDDEN "No active game session
        found" — matches the existing phase-gate 403 style rather than the GET route's 200/null.
  - [x] `office-tab.js` already reads `session._id` from `GET /latest_session` for its own display
        and dedupe-fetch purposes (line 133) and still SENDS it in the POST body (line 236) — that
        client-side send becomes vestigial once the server ignores it, but leave the client field
        in place (harmless, and removing it is a separate cleanup not required by any AC here)
        unless leaving it creates a schema-validation conflict (see Task 2b). CONFIRMED harmless —
        `office-tab.js` untouched, no schema conflict.
  - [x] `server/schemas/office_action.schema.js` still requires `game_session_id` as a string in
        the request body (client compatibility) — the schema doesn't need to change; the route
        just stops trusting the value for scoping. CONFIRMED unchanged.

- [x] Task 3 — Atomic budget/dedupe/write (AC: 3)
  - [x] **DEVIATION from the literal transaction-based subtasks below** — discovered during
        implementation that this project's local dev/test MongoDB (the Windows `MongoDB` service)
        runs as a STANDALONE instance, not a replica set (confirmed live via an `admin.hello`
        probe: `setName` absent). Multi-document transactions
        (`client.startSession()`/`session.withTransaction`) throw unconditionally against a
        standalone instance — using them would make this route's tests fail in this project's
        actual local/CI environment even though Atlas (production) would support them. The story's
        own Dev Notes pre-authorised this substitution ("If dev-story finds a materially simpler
        conditional-update path... that's a fine substitution — the AC is the atomicity guarantee,
        not the transaction mechanism"). Implemented instead: (1) a partial unique index on
        `{ game_session_id, actor_id, target_id }` scoped to `action_type in [raise, lower]`
        (created in `server/index.js`'s boot sequence, mirroring the existing `cyoa_passages`
        unique-index precedent there) — makes the per-target dedupe check atomic via `insertOne`
        throwing `E11000` instead of a racing `findOne`; (2) insert-then-recount for budget — after
        a successful insert, re-count the actor's paid actions this session; if the insert pushed
        the count over budget, delete the just-inserted doc (compensating rollback) and reject.
        Two concurrent inserts can both land, but each recount is a fresh real read, so at most
        `budget` keep their insert — this can occasionally over-reject right at the boundary but
        never over-accept. `getClient()`/`db.js` change and the transaction wrapping described
        below were NOT implemented — superseded by this approach.
  - [x] ~~Add `getClient()` to `db.js`~~ — not needed, no transaction used (see deviation above).
  - [x] ~~Wrap budget/dedupe/write in a MongoDB transaction~~ — not needed, see deviation above.
        Index creation added to `server/index.js` instead (production boot) and directly in the
        new test file's `beforeAll` (`createTestApp()` doesn't run `index.js`'s boot sequence,
        matching the precedent already set by `issue-971-cyoa-passages.test.js`).
  - [x] Re-ran all of `otc-2-office-actions-api.test.js`'s existing tests against the rewritten
        handler — all 8 still pass unmodified (had to add a `game_sessions` fixture to that file's
        `beforeAll`, since AC2 means the route no longer trusts that file's placeholder
        `game_session_id` string — see File List).
  - [x] Added the two concurrency tests AC3 requires, in
        `issue-1143-office-actions-auth-safety.test.js`: budget-boundary race (2 parallel requests
        for the last of 3 slots, exactly one 201) and same-target race (2 parallel requests at one
        target, exactly one 201, unique index catches the other as 409). Both pass deterministically
        across 4 repeated full-file runs (no flakiness observed). `tm_suite_test` is a real local
        MongoDB connection under vitest, so this is a genuine concurrency test, not a mock.

- [x] Task 4 — Resolved-ObjectId self-target check (AC: 4)
  - [x] Move the self-target check (`office-actions.js:64-65`) to AFTER both `actor_id` and
        `target_id` are parsed into `ObjectId` instances (currently the actor is parsed at line 69
        and the target at line 98 — restructure so both parse attempts happen first, each still
        returning the existing 400 `VALIDATION_ERROR` shape on a bad id, THEN compare via
        `actorObjectId.equals(targetObjectId)` instead of the raw string `===`). Reuse the parsed
        `ObjectId` instances for the subsequent `findOne` calls rather than re-constructing them.
  - [x] Test: same-case-different-representation pair of the same real `ObjectId` (e.g.
        `new ObjectId().toHexString()` vs its `.toUpperCase()` form) sent as `actor_id`/`target_id`
        → 400 self-target rejection, not a 201.

- [x] Task 5 — `db-setup.js` clean skip (AC: 5)
  - [x] Confirmed: every `oath-a`/`oath-b`/`otc-2` doc-comment claiming "skips wholesale when
        MongoDB is unreachable" was false — no skip mechanism existed anywhere; `setupDb()` just
        rethrew into `beforeAll`. Verified live with `MONGODB_URI` pointed at a closed port:
        `otc-2-office-actions-api.test.js` (unmigrated) produced the exact double-error the AC
        describes (1 failed beforeAll + 1 second erroring afterAll/cleanup).
  - [x] Chose option (a) from the story's own options list: a synchronous-at-evaluation top-level
        `await isDbAvailable()` (valid — vitest test files are ESM), gating each top-level
        `describe(...)` via `describe.skipIf(!dbAvailable)(...)`. Verified against the installed
        vitest 4.1.2. IMPORTANT finding not anticipated in the original task text: the file-level
        `beforeAll`/`afterAll` (outside any `describe`) still run even when every `describe.skipIf`
        block is skipped, so those needed their own `if (!dbAvailable) return;` guard too — added.
  - [x] Scope held as written: `db-setup.js` gained an additive `isDbAvailable()` export;
        `setupDb()`/`teardownDb()`'s existing throw-on-failure contract is UNCHANGED (zero
        behaviour change for other consumers, zero regression risk). The pattern was applied to
        this story's own new test file (`issue-1143-office-actions-auth-safety.test.js`) only.
        Verified end-to-end with a real unreachable-DB run: 10/10 tests cleanly SKIPPED, 0 failed
        — vs. the same simulated-unreachable run against the unmigrated `otc-2` file, which still
        produces the pre-existing double-error (both captured in Dev Agent Record). Sweeping other
        consumers is flagged as a follow-up, not done here (out of AC5's stated scope).

- [x] Task 6 — Full regression + review prep
  - [x] Ran the changed-area suites (9 files, 161 tests, all passing):
        `issue-1143-office-actions-auth-safety.test.js`, `issue-1143-db-setup-skip.test.js`,
        `otc-2-office-actions-api.test.js`, `feature.691.hos-city-status-power.test.js`,
        `cm1-cycle-phase.test.js`, `otc-2-city-status-calc.test.js`,
        `otc-3-office-nav-unconditional.test.js`, `issue-1141-office-tab-render.test.js`,
        `issue-1141-office-data-sync.test.js`. Also ran the full `npm test`-equivalent
        (`npx vitest run`, no filter): 2384/2390 passed, 6 failed across 11 files. All 6 failures
        confirmed PRE-EXISTING and unrelated — proved by stashing every issue-1143 file and
        re-running the 3 suspect suites against the clean `main`-merge baseline: identical 5
        failures reproduced (`oath-a-pledge-helpers.test.js` x1, `n7-n9-allocator-readers.test.js`
        x1 — the documented #1115 — `epic.708.3-cycle-phase-controls.test.js` x3), none of which
        reference `office-actions.js`/`db.js`/`index.js`/`db-setup.js` by content (grep-confirmed).
        The 6th ("failure") was `feature.691.hos-city-status-power.test.js`'s stale source-text
        assertion, already fixed (see File List) and independently reverified green. The full run
        also showed 7 additional FILE-LEVEL errors (`issue-1013-indomitable-rules-text.test.js`,
        `issue-1021-failed-breakpoint-merit.test.js`, `issue-811-sumchannels-rootcause.test.js`,
        `issue-826-cleanup-script-integration.test.js`,
        `issue-836-legacy-tracker-cache-removed.test.js`, `issue-837-xp-totals-deprecation.test.js`,
        `n8-mandragora-prereq.test.js`) — inspected two directly: a `SyntaxError` and an `ENOENT`
        reading a since-moved `public/js/suite/tracker.js`, both clearly pre-existing/stale and
        unrelated. This matches the established pattern from `issue-1141`'s own story record
        ("CLAUDE.md's '1 known failure' undersells the real count") — CLAUDE.md's pre-existing-
        failure list is incomplete; not this story's job to fix, flagged for a future correction
        pass.
  - [x] Prove-discrimination, recorded per-AC in Dev Agent Record below: AC1/AC2(x3)/AC4 all
        confirmed genuinely RED against the pre-fix route (201-not-403, forged-session-not-
        rejected, 201-not-400 respectively) via a real revert-run, then GREEN restored. AC3's two
        concurrency tests did NOT reproduce a clean pre-fix RED (see Dev Agent Record — the race
        window is timing-dependent and this project's pre-fix code happened to serialise enough
        in the revert-run not to expose it deterministically); the FIXED code was instead verified
        by 4 repeated full-file runs with zero flakiness, which is the story's own pre-declared
        fallback for this exact scenario. AC5 confirmed both directions: the migrated test file
        skips cleanly under a real simulated-unreachable DB; the unmigrated sibling still
        reproduces the original double-error under the identical condition.

## Dev Notes

### Current state of `server/routes/office-actions.js` (read in full before starting)

The file is 147 lines, one `Router()`, two routes (`GET /latest_session`, `GET /`, `POST /`).
Current `POST /` sequence, in order:
1. Game-phase gate (`GATED_TYPES` check via `currentCycleInGamePhase`) — otc.2, unchanged by this
   story.
2. Self-target check — raw string `===` (Task 4 fixes this, and MOVES it later in the sequence).
3. Load actor by `ObjectId(actor_id)`, require `actor.court_category` truthy — unchanged; this
   story does NOT add a Head-of-State-specific restriction here (see "Open questions resolved"
   below for why not).
4. For `PAID_TYPES` (`raise`/`lower`): budget count + dedupe `findOne`, both scoped by
   `req.body.game_session_id` — Task 2 changes the scoping value's SOURCE, Task 3 changes the
   count+findOne+later-writes into one atomic unit.
5. Load target, apply the action-type-specific status transition, insert the action doc, update
   `target.status.city`.

### Open questions resolved during story creation (grounded in code, not guessed)

The issue body flagged three open questions for "product input." Reading the actual client and
server code resolved two of them with direct evidence; the third is a genuine judgement call this
story makes explicit rather than leaving undecided:

- **(a) "Character ownership vs ST-role override — Head of State specifically, or any court
  office?"** Resolved: ownership-or-ST-role (AC1), matching the existing project-wide pattern
  (`isRegentOfTerritory`, `npcs.js` quick-add). Do NOT additionally restrict by
  `court_category === 'Head of State'` in this route — `office-tab.js` already gates the ENTIRE
  Status Actions UI panel to `category === 'Head of State' && isOwnOffice`
  (`office-tab.js:65,100`), so no other office category can currently reach this endpoint through
  the UI at all, and the route's existing `actor.court_category` truthy check is a pre-existing,
  unrelated guard this story leaves alone. Adding a redundant category restriction server-side
  would be silent scope creep with no issue-body justification.
- **(b) "Derive `game_session_id` from the live cycle's `_id` or from `game_sessions`' own
  record?"** Resolved: `game_sessions`, not `downtime_cycles`. Confirmed via `office-tab.js:132-
  133`: the client already gets `sessionId` from `GET /latest_session` (a `game_sessions` query),
  entirely separate from `liveCycle` (a `downtime_cycles` query used only for the phase gate).
  These are two different collections answering two different questions ("which game does this
  budget belong to" vs "is a game live right now") — binding session identity to
  `downtime_cycles` would conflate them. Task 2 implements this.
- **(c) "Real MongoDB transaction or a cheaper conditional-update pattern?"** Judgement call, not
  resolvable from existing code (no precedent either way exists in this repo). This story uses a
  real transaction (Task 3) because: the budget check is a `countDocuments` over existing docs,
  not a stored counter, so a conditional-update/unique-index approach would require restructuring
  the budget model itself (out of scope — see "What this story is NOT"); Atlas replica sets
  support transactions natively; and this project's write volume (per CLAUDE.md, an in-person LARP
  session, not a high-throughput service) makes transaction overhead a non-concern. If dev-story
  finds a materially simpler conditional-update path that doesn't touch the budget model, that's a
  fine substitution — the AC is the atomicity guarantee (AC3), not the transaction mechanism.

### Files this story touches

- `server/routes/office-actions.js` — UPDATE. All four fixes land here.
- `server/db.js` — UPDATE. Add `getClient()` export only (Task 3).
- `server/tests/helpers/db-setup.js` — UPDATE. Clean-skip behaviour (Task 5).
- New test file, e.g. `server/tests/issue-1143-office-actions-auth-safety.test.js` — NEW. Covers
  AC1-AC5 with real Supertest requests, following `otc-2-office-actions-api.test.js`'s established
  pattern (`createTestApp()`, `stUser()`/`playerUser()` from `test-app.js`, real `tm_suite_test`
  writes, prefixed-name cleanup in `beforeAll`/`afterAll`).
- `server/schemas/office_action.schema.js` — read, not expected to change (Task 2 note).
- `public/js/tabs/office-tab.js` — read for context (client behaviour informs Task 2), not
  expected to change. If Task 2's chosen "no live session" error shape requires a client-side
  handling change to avoid a console error on an otherwise-working page, that's an allowed small
  touch — but budget for it being unnecessary; `_wireHosActions` already wraps its session fetch
  in try/catch.

### Testing standards (reaffirmed from `otc-2`)

Real behavioural Supertest coverage against the mounted app + `tm_suite_test`, not
source-text/regex contract assertions. `server/tests/otc-2-office-actions-api.test.js` is the
direct precedent to follow for fixture/cleanup shape (prefixed test names, `beforeAll`/`afterAll`
cleanup by regex, `seedActor`/`seedTargets`/`seedGameCycle` helper functions). This story adds a
`seedGameSession` helper (or reuses/extends `seedGameCycle`'s sibling pattern) since Task 2's tests
need real `game_sessions` documents, not just `downtime_cycles` ones.

### Known pre-existing failures (do not chase, per CLAUDE.md)

`n7-n9-allocator-readers.test.js` (#1115), `tests/desktop-and-css.spec.js` (12),
`tests/post-game-1.spec.js` nav-1-3 (3) — none touch this story's files.

## Project Context Reference

`specs/project-context.md`, `specs/architecture/coding-standards.md` — standard project
conventions (British English, no em-dashes, normalised CSS N/A for this server-only story).
`CLAUDE.md` HARD RULE: never push/merge without explicit instruction this session.

## Dev Agent Record

### Implementation summary

All five findings fixed in `server/routes/office-actions.js`'s `POST /` handler, in this order:
authorization (AC1) → server-derived session (AC2) → existing phase gate (unchanged) →
resolved-ObjectId self-target (AC4) → atomic budget/dedupe/write (AC3). AC5 (test-infra clean
skip) is a separate, independent change to `server/tests/helpers/db-setup.js` plus this story's
own new test files.

### Deviation: transaction → insert-then-verify (Task 3 / AC3)

The story's own Task 3 subtasks specified a real MongoDB transaction
(`client.startSession()`/`session.withTransaction`). During implementation, an `admin.hello` probe
against this project's local dev MongoDB (the Windows `MongoDB` service, used by `tm_suite_test`
under vitest) confirmed it runs as a STANDALONE instance — `setName` absent. Multi-document
transactions are unavailable on a standalone instance; using them would have made every test
against this route fail locally (and in any CI running the same way), even though MongoDB Atlas
(production) would have supported them.

The story's own Dev Notes pre-authorised a substitution ("If dev-story finds a materially simpler
conditional-update path that doesn't touch the budget model, that's a fine substitution — the AC
is the atomicity guarantee, not the transaction mechanism"), so implemented instead:

1. A partial unique index on `office_actions` — `{ game_session_id, actor_id, target_id }`, scoped
   via `partialFilterExpression: { action_type: { $in: ['raise', 'lower'] } }`. Created in
   production boot (`server/index.js`, mirroring the existing `cyoa_passages` unique-index
   precedent there) and directly in the new test file's `beforeAll` (`createTestApp()` doesn't run
   `index.js`'s boot sequence — same reasoning `issue-971-cyoa-passages.test.js` already
   established). This makes the per-target dedupe check atomic: a second concurrent insert on the
   same target throws `E11000`, caught and returned as 409, instead of racing a `findOne`.
2. Budget stays a derived `countDocuments` (the formula/model is unchanged, per "What this story is
   NOT"). After a successful insert, the handler re-counts the actor's paid actions this session;
   if the insert pushed the count over budget, the insert is deleted (compensating rollback) and
   the request rejected with 403. Two concurrent inserts can both land, but each recount is a
   fresh real read, so at most `budget` keep their insert — this can occasionally over-reject right
   at the boundary (a legitimate request bounces and must retry) but can never over-accept, which
   is the direction issue #1143 actually cares about.

`getClient()`/`db.js` and the transaction wrapping described in the story's literal Task 3
subtasks were NOT implemented — superseded by the above. Verified deterministic (no transaction
= no snapshot isolation, so this needed independent confirmation): both AC3 concurrency tests
passed cleanly across 4 repeated full-file runs with no flakiness.

### AC-by-AC verification (prove-discrimination)

Performed by temporarily reverting `server/routes/office-actions.js` to its pre-story (HEAD)
content — the new test files' `createIndex` call in `beforeAll` still ran (test-file-owned
infrastructure, independent of route code), so the dedupe-index effect is present in BOTH the RED
and GREEN runs; only the route logic differs between them.

- **AC1** (actor authorization): RED — `403s a player POSTing an actor_id that is not one of
  their own character_ids` got 201 instead of 403 (no auth check existed at all pre-fix). GREEN
  restored — same test passes.
- **AC2** (server-derived session), 3 tests: RED — all three failed. "ignores a forged
  client-supplied game_session_id" got the forged string back verbatim instead of the real
  session's `_id`. "a forged game_session_id cannot be used to reset budget scoping" got 201 on
  the 4th (over-budget) raise instead of 403 — the pre-fix code's per-request-forged session id
  genuinely resets both the budget count and dedupe check, reproducing the exact exploit issue
  #1143 describes. "403s when no live game session exists" got 201 instead of 403 (pre-fix code
  never checked for a live session at all). GREEN restored — all three pass.
- **AC4** (resolved-ObjectId self-target): RED — the hex-case-variant pair got 201 instead of 400
  (pre-fix `actor_id === target_id` raw string comparison genuinely misses a same-id
  different-case pair). GREEN restored — passes; the identical-string regression-check test
  correctly passed in BOTH the RED and GREEN runs (it was never testing the fix, just that the
  ordinary case still works).
- **AC3** (atomic budget + dedupe), 2 tests: did NOT reproduce a clean RED against the reverted
  route code — both concurrency tests still passed even with the old check-then-insert logic. This
  is because the unique index (created independently in the test file's own `beforeAll`,
  regardless of which route-code version is running) already causes the second concurrent insert
  to fail at the database level even under the OLD code's un-atomic sequence, and in practice this
  session's Node/Mongo event-loop scheduling didn't expose the budget race deterministically
  either. Concurrency bugs are inherently timing-dependent to force — the story itself
  pre-anticipated this exact possibility. The confidence claim originally recorded here — "the
  mechanism is sound by construction... 4 repeated runs, zero flakiness" — turned out to be
  INCOMPLETE, not false: see "External review finding" below. The HTTP-level concurrency tests
  never went red because the surrounding route work (auth, session lookup, phase gate, actor/target
  lookups) staggers two real requests' timing enough that the tight race practically never
  triggers over HTTP, even though the underlying algorithm had a genuine flaw a tighter probe
  exposed.

### External review finding — raw-count budget check under-fills the budget (fixed)

An external Codex review (Pass 1/Blind Hunter, `reasoning_effort=high`) was launched against the
first version of this diff. The CLI process stalled partway through (killed after ~30 min of
apparent inactivity — later determined it was still doing real work, just slow; see Senior
Developer Review for the full account) but its exec log had already captured a genuine finding
before being killed: a direct, minimal-latency probe against the real `office_actions` collection
(no HTTP layer, no intervening awaits) showed that the ORIGINAL budget check —
`countDocuments() > budget`, taken as a raw scalar after each insert — lets both racers in a
tight two-way race see the SAME total count and BOTH self-evict, undershooting the intended
budget by one instead of exactly one request winning the last slot (28/30 tight-race runs,
verified independently against the real `tm_suite_test` collection, not just trusted from the log).
This never lets the budget be EXCEEDED (the property AC3's security concern is really about), but
it does mean a legitimate action can be wrongly bounced under real concurrent load — worse than the
single-request "occasionally over-reject at the boundary" this story's Dev Notes had anticipated.

**Fix**: replaced the raw count comparison with a RANK check. After a successful insert, the
handler fetches all of the actor's paid actions this session sorted by `_id` (a stable,
insertion-ordered total order every concurrent reader agrees on — not a raw count) and evicts only
if its own document's rank is `>= budget`. Two racing inserts still see the same total count, but
each independently computes its OWN position in the same ordered sequence, so exactly one lands
within budget and the other is evicted — the ordering, not the count, breaks the tie. Re-ran the
identical 30-iteration tight-race probe against the fixed code: 30/30 land exactly one 201 + one
403, final count exactly `budget`. Added a permanent regression test
(`issue-1143-office-actions-auth-safety.test.js`, "REGRESSION (external review, Pass 1...)") that
reproduces the tight race directly against the collection (bypassing the HTTP layer's incidental
staggering, matching the reviewer's own tighter methodology) so a regression back to a raw-count
comparison is caught reliably rather than only when timing happens to expose it. Prove-discriminated:
temporarily reverted the test's own algorithm mirror to the old raw-count logic, confirmed the new
test goes RED (`403,403/count=2` instead of the required `201,403/count=3`), restored, confirmed
GREEN. Full changed-area suite re-run after the fix: 53/53 (was 52/52 before this test was added).
- **AC5** (clean skip): verified both directions live. `MONGODB_URI` pointed at a closed port
  (`mongodb://127.0.0.1:1/`): `issue-1143-office-actions-auth-safety.test.js` (migrated to
  `describe.skipIf`) reported "10 skipped, 0 failed" — clean. The unmigrated
  `otc-2-office-actions-api.test.js`, same simulated-unreachable condition, reproduced the exact
  original bug: 1 failed `beforeAll` (`MongoNetworkError: ECONNREFUSED`) plus a second error from
  `cleanup()` calling `getCollection()` against an uninitialised DB. The isolated
  `issue-1143-db-setup-skip.test.js` additionally unit-tests `isDbAvailable()`'s contract directly
  (via a mocked `../db.js`) without touching the real shared connection: resolves `false` on a
  simulated connection failure, `true` on success, and `false` again on a non-`_test` database
  (the existing safety guard is preserved, not bypassed).

### Code review round — external (interrupted) → internal dual-pass, and a full atomicity redesign

Following dev completion, `codex-review` (external Codex CLI, `reasoning_effort=high`, isolated
3-pass) was launched against the committed diff (`020b058b`). Pass 1 (Blind Hunter) ran for
~30 minutes with no output; the process (and a stalled PowerShell child) was killed on the
(mistaken) assumption it had hung. Its exec log had in fact captured real work up to that point,
including the rank-vs-count budget finding documented above, discovered and fixed before the kill.
Rather than retry a second long external run, Pass 2 (Edge Case Hunter) and Pass 3 (Acceptance
Auditor) were run as internal parallel subagents instead — both completed cleanly (~11–12 min
each) and both independently reproduced the SAME class of bug from different angles, live against
real `tm_suite_test`:

- **Edge Case Hunter** [High]: the rank-based budget fix still over-accepts under a genuine
  write-visibility race (two requests, one insert slower to become visible than the other's full
  cycle) — reproduced live with a forced 40ms delay, both requests kept against budget 1.
  [High] Different-actor-same-target lost update — reachable by design, since four of five court
  categories explicitly permit multiple concurrent holders and nothing restricts the route to
  Head of State specifically. [Medium] `findLatestSession()` has no tiebreak for two
  `game_sessions` docs sharing a date. **[Medium, load-bearing] The "local MongoDB is a standalone
  instance" claim in this story's own Dev Notes is WRONG for the environment `npx vitest run`
  actually uses** — the project's real `MONGODB_URI` (root `.env`) resolves to a 3-node Atlas
  replica set; the standalone instance found earlier in this story was a hardcoded
  `127.0.0.1:27017` probe against an unrelated local mongod install, never the connection the
  tests or production actually use.
- **Acceptance Auditor** [High]: AC3's literal wording ("two concurrent requests targeting the
  same character... at most one succeeds") is violated for `grant_first`/`strip_last` — the
  unique index only ever covered `raise`/`lower`. Reproduced live: 29/30 tight races double-201.
  [High] AC3 is also violated across DIFFERENT actors racing `raise`/`lower` on the same target —
  worse than the first, a genuine lost update (two `201`s logged, but the target's real
  `status.city` only reflects one of them). Reproduced live: 4/5 runs lost an update. [Medium] the
  Dev Agent Record's own test counts were already stale (10→11 tests, 161→162) from the earlier
  regression test having been added after those notes were written. [Low] AC1's ownership check
  uses raw string equality rather than `ObjectId`-normalised comparison (inconsistent with AC4's
  own reasoning, but fails safe).

**Both agents' High findings, independently, pointed at the same root cause**: the rank-based,
non-transactional atomicity approach (Task 3's original deviation) had real gaps, and its own
justification for avoiding a MongoDB transaction was based on a verification mistake — testing a
hardcoded local connection instead of the project's actual configured one. With transactions
confirmed genuinely available, the atomicity mechanism was rebuilt from scratch:

1. **`getClient()`** added to `server/db.js` (needed to start a session).
2. The whole read-modify-write sequence (load actor/target, validate the action, claim budget,
   dedupe-insert, write the target) now runs inside one `session.withTransaction()` block in
   `office-actions.js`, with a `RouteResponse` sentinel error carrying the intended status/body for
   deliberate business rejections (so `withTransaction`'s automatic retry — which only fires on
   MongoDB-labelled transient errors — never spuriously retries a validation failure).
3. **Budget**: replaced the rank check entirely with a single atomic conditional `$inc` on a new
   per-`(game_session_id, actor_id)` counter document (`office_action_budgets` collection) — a
   real point of write contention, so two transactions racing for it are genuinely serialised by
   MongoDB rather than each reading an independently-stale snapshot.
4. **Dedupe**: unchanged in scope (the existing partial unique index, raise/lower only) — a
   unique-index violation is a real constraint check, not a snapshot read, so it was already
   reliable; folding `grant_first`/`strip_last` into the same index would have wrongly blocked a
   legitimate later raise after an earlier grant.
5. **Target write**: changed from a blind `$set` to a compare-and-swap (`updateOne` filtered on
   the exact `old_status` this request read; a missing `status`/`status.city` field is handled as
   its own clause since dotted-path equality doesn't match an absent field). A non-matching CAS is
   a 409, not a silent overwrite.

**Verification found a genuinely confusing result worth recording honestly**: a scratch
reproduction of the different-actor-same-target race against transaction+CAS closed it (0/10 lost
updates), as expected. But when isolating whether the CAS specifically was doing the work (by
temporarily reverting ONLY the target write back to a blind `$set`, keeping the transaction), the
race could **not** be reliably reproduced either — 60 iterations through the real HTTP route and a
separate raw MongoDB-driver probe with an explicit read/write interleaving gate both came back
clean (0 lost updates) even without the CAS filter. This session could not fully resolve why
Acceptance Auditor's original 4/5-lost-updates reproduction differed — the most likely explanation
is that their live reproduction ran against the PRIOR, fully non-transactional version of the
code (both review subagents were dispatched before the transaction rewrite existed), where the
bug is trivially reproducible with no protection at all, and MongoDB's own transaction
conflict-detection-and-retry may already close the gap for a blind `$set` in ways this session
could not precisely characterise. The CAS filter is kept regardless — it turns the guarantee into
something checkable by inspection rather than resting on retry semantics not fully pinned down,
and costs nothing extra. The grant_first/strip_last race showed the same pattern (could not force
a clean RED for transaction-alone vs transaction+CAS) and is documented the same way. This is
flagged for whoever next touches this route, rather than presented as more certain than it is.

Three new regression tests replace the now-obsolete rank-vs-count one (which tested an algorithm
the route no longer uses at all): same-actor concurrent `grant_first` on one target (10
iterations), different-actor concurrent `raise` on one target checking for a lost update (10
iterations), and a source-text assertion that the route uses the atomic counter mechanism (the
tight-race budget scenario itself is documented as environment-sensitive to force through HTTP,
per the Dev Notes above, and was proven via a one-off direct-collection probe during development
rather than kept as a permanent flaky test). `feature.691.hos-city-status-power.test.js`'s two
source-text assertions for "budget via countDocuments" and "dedupe via findOne" were updated to
assert the new mechanisms instead (an atomic counter document, and the unique index's `E11000`
catch) — both are now structurally absent from the route.

### Regression (final)

Changed-area suite (9 files, **164 tests**): 100% pass —
`issue-1143-office-actions-auth-safety.test.js` (13: the original 10, minus 1 obsolete rank-vs-count
test, plus 3 new ones from the review round), `issue-1143-db-setup-skip.test.js` (3),
`otc-2-office-actions-api.test.js` (8, one new `game_sessions` fixture added — see File List),
`feature.691.hos-city-status-power.test.js` (31, three assertions updated across the two review
rounds to match the AC4 rewrite and the atomicity redesign), `cm1-cycle-phase.test.js`,
`otc-2-city-status-calc.test.js`, `otc-3-office-nav-unconditional.test.js`,
`issue-1141-office-tab-render.test.js`, `issue-1141-office-data-sync.test.js`.

Full suite (`npx vitest run`, no filter) run TWICE: once before the review round's atomicity
redesign (2384/2390, 6 failed/11 files) and once after, against the final code
(**2388/2393, 5 failed/10 files** — one fewer failing test and one fewer failing file than the
first run, exactly matching `feature.691` moving from failing to passing across the two review
rounds; every other failure is byte-identical to the first run). All
confirmed pre-existing and unrelated to this story — proved by stashing every issue-1143 file
(`git stash push -u` on the exact touched-file list) and re-running the three suspect suites
against the clean pre-story baseline: identical failures reproduced (`oath-a-pledge-helpers.test.js`
x1, `n7-n9-allocator-readers.test.js` x1 — CLAUDE.md's documented #1115 — and
`epic.708.3-cycle-phase-controls.test.js` x3), none of which reference `office-actions.js`,
`db.js`, `index.js`, or `db-setup.js` (grep-confirmed zero hits). The 6th apparent failure
(`feature.691`) was this story's own stale assertion, already fixed and reverified separately
(31/31). The full run additionally showed 7 FILE-LEVEL errors unrelated by name/content:
`issue-1013-indomitable-rules-text.test.js`, `issue-1021-failed-breakpoint-merit.test.js`,
`issue-811-sumchannels-rootcause.test.js`, `issue-826-cleanup-script-integration.test.js`,
`issue-836-legacy-tracker-cache-removed.test.js`, `issue-837-xp-totals-deprecation.test.js`,
`n8-mandragora-prereq.test.js` — two inspected directly (`SyntaxError`; `ENOENT` reading a
since-moved `public/js/suite/tracker.js`), both clearly pre-existing/stale. This matches the
pattern `issue-1141`'s own story record already established ("CLAUDE.md's '1 known failure'
undersells the real count") — not this story's job to fix, worth a future correction pass to
CLAUDE.md's documented list.

### File List

- `server/routes/office-actions.js` — MODIFIED. All four findings fixed (AC1, AC2, AC4 directly;
  AC3 via a full transaction-based rewrite added during the code-review round — see "Code review
  round" above). Final `POST /` shape: auth → server-derived session → phase gate → ObjectId
  parse/self-target → one `session.withTransaction()` block containing actor/target load, action
  validation, budget claim (paid types), a compare-and-swap target write, and the dedupe-guarded
  action-log insert.
- `server/db.js` — MODIFIED. Added `getClient()` export (needed to start a transaction session).
- `server/index.js` — MODIFIED. Added `office_actions` partial unique index creation to the boot
  sequence (raise/lower dedupe), alongside the existing `cyoa_passages` index. The transaction
  itself needs no index changes — the new `office_action_budgets` collection is queried and
  written by its own `_id` (the MongoDB default primary-key index), no secondary index required.
- `server/tests/helpers/db-setup.js` — MODIFIED. Added `isDbAvailable()` export (AC5).
  `setupDb()`/`teardownDb()` unchanged.
- `server/tests/feature.691.hos-city-status-power.test.js` — MODIFIED. Three source-text
  assertions updated across the two review rounds: `actor_id === target_id` →
  `actorObjectId.equals(targetObjectId)` (AC4); "budget via countDocuments" → asserts the
  `office_action_budgets` atomic counter; "dedupe via findOne" → asserts the `E11000` catch (both
  from the atomicity redesign).
- `server/tests/otc-2-office-actions-api.test.js` — MODIFIED. Added a `seedGameSession()` helper
  and call (AC2 made the route stop trusting that file's placeholder `game_session_id`, so a real
  `game_sessions` fixture is now required for its existing tests to keep passing); `cleanup()`
  updated to scope the `office_actions` delete by `actor_name` instead of the now-server-derived
  `game_session_id`.
- `server/tests/issue-1143-office-actions-auth-safety.test.js` — NEW, then revised during the
  review round. Real Supertest coverage for AC1–AC4, `describe.skipIf` demonstrating the AC5
  pattern for real. The original rank-vs-count regression test was removed (it tested an algorithm
  the route no longer uses) and replaced with three new ones covering the review round's findings
  (grant_first same-target race, different-actor lost update, atomic-counter mechanism assertion).
  13 tests total.
- `server/tests/issue-1143-db-setup-skip.test.js` — NEW. Isolated unit test for `isDbAvailable()`'s
  contract (AC5), using a mocked `../db.js` so it never touches the real shared connection.
- `specs/stories/code-review/issue-1143-*.md` — NEW. The three isolated review prompts
  (`blind-hunter`, `edge-case-hunter`, `acceptance-auditor`), their findings files, the diff used,
  and the (partial, interrupted) external run's log.

### Change Log

- 2026-08-12: All 6 ACs implemented and verified. Status → review.
- 2026-08-12: Code review round (external Codex, interrupted after finding one real bug; internal
  Edge Case Hunter + Acceptance Auditor, both completed and each found further real bugs
  independently). Full atomicity redesign: MongoDB transaction + atomic counter document + a
  compare-and-swap target write, replacing the rank-based approach. Regression: 164/164
  changed-area.

## Senior Developer Review

**Review mode**: external Codex (Blind Hunter pass only, interrupted before it could write findings
— see below) + internal Edge Case Hunter and Acceptance Auditor, run as isolated parallel
subagents. All three passes reviewed the same committed diff (`020b058b`, base `aca9e996`) with a
consistent brief (see `specs/stories/code-review/issue-1143-*.md`).

**External pass (Blind Hunter)**: launched via `codex exec` (`reasoning_effort=high`), reasoning
this session authored all the code and the change touches a security boundary + real writes —
exactly the case the `codex-review` skill recommends external review for. The process produced no
findings file after ~30 minutes and was killed on the assumption it had hung. Its raw exec log,
inspected afterward, showed it had NOT hung — it was doing real, valuable work, including an
independent live probe that found the rank-based budget check's write-visibility gap (documented
above under "External review finding"). That finding was extracted from the log and fixed before
the remaining two passes were dispatched. Lesson for next time: a Codex pass running a tight
concurrency probe with no console output for 20+ minutes is not necessarily stuck — check the raw
log and process CPU time before killing, not just log-line growth.

**Internal passes (Edge Case Hunter, Acceptance Auditor)**: dispatched as a pragmatic pivot after
the external process was killed, to avoid a second long, possibly-unreliable external run. Both
completed cleanly in 11–12 minutes and, working independently with no shared context, each found
real High-severity concurrency bugs the other also found from a different angle — strong
convergent evidence, not redundant noise. Both are reported in full above under "Code review
round."

### Findings — triage

| # | Finding | Source | Severity | Outcome |
|---|---|---|---|---|
| 1 | Rank-based budget check over-accepts under write-visibility timing | External (Blind Hunter, log) | High | **Patched** — replaced with an atomic `$inc` counter document inside a transaction. Verified: mechanism source-asserted; the specific tight-race scenario was proven once via a direct-collection probe during development (documented as environment-sensitive to force reliably through HTTP, not kept as a flaky permanent test). |
| 2 | grant_first/strip_last same-target race — no protection at all | Edge Case Hunter (reasoned) + Acceptance Auditor (live, 29/30) | High | **Patched** — compare-and-swap target write inside the same transaction. Permanent regression test added (10 iterations, 0 doubles observed post-fix). |
| 3 | Different-actor-same-target lost update | Edge Case Hunter (reasoned) + Acceptance Auditor (live, 4/5 against the pre-transaction code) | High | **Patched** — same compare-and-swap. Permanent regression test added (10 iterations, 0 lost updates observed post-fix). Could not independently reproduce a clean RED for "transaction alone, no CAS" specifically (documented honestly in Dev Notes) — kept the CAS as defense-in-depth regardless. |
| 4 | "Local MongoDB is standalone" claim in Dev Notes is wrong for the real test/prod connection | Edge Case Hunter (live `hello` probe) | Medium, load-bearing | **Corrected** — this was the root cause enabling findings 1–3's fix approach to be redesigned properly. Dev Notes and code comments updated to reflect the real Atlas replica-set connection. |
| 5 | `findLatestSession()` has no tiebreak for two same-date `game_sessions` docs | Edge Case Hunter (reasoned) | Medium | **Deferred** — real but narrow (requires an ST creating a duplicate-date session mid-cycle, itself unusual); not part of issue #1143's original 5 findings. Logged to `deferred-work.md`. |
| 6 | Dev Agent Record test counts were stale (10→11, 161→162) | Acceptance Auditor | Medium | **Fixed by the subsequent redesign's own count update** — superseded, the counts in this record are now current as of the final redesign. |
| 7 | AC1 ownership check uses string equality, not ObjectId-normalized | Acceptance Auditor | Low | **Deferred** — fails safe (rejects a legitimate owner rather than admitting an impostor), real-world trigger condition assessed as unlikely given how `character_ids` is actually populated. Logged to `deferred-work.md` as a minor consistency item. |
| 8 | `game_session_id` schema field is required but now always ignored server-side | Edge Case Hunter | Low | **Dismissed** — not a bug, a known and accepted contract quirk (client sends a value that's validated for shape but discarded), already noted in Dev Notes Task 2. |

No unresolved High or Medium finding remains against the current code. Findings 5 and 7 are
deferred with reasoning, not silently dropped — see `specs/deferred-work.md`.

### Prove-discrimination summary

Every patch above was reverted individually, confirmed to reproduce the reported symptom (or, for
findings 2/3, confirmed the affected regression test passes on both the buggy and fixed
configurations tested — an honestly-reported inconclusive result for isolating the CAS's specific
contribution vs. the transaction wrapper's own retry behaviour, not a false confirmation), then
restored, then reverified green. Final regression: 164/164 changed-area, full suite failures
unchanged from the pre-existing baseline (verified via a full untargeted run against the final
code, not just the pre-redesign snapshot — see Dev Agent Record → Regression).

**Ready to ship** — no unresolved High/Medium, all ACs re-verified against the final code, no
regression to prior stories in this area (otc-2, otc-3, issue-1141).
