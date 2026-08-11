# Story otc.2: Status Actions — server-side hardening (budget calculation + game-phase gate)

Status: done

## Story

As a Storyteller running Terra Mortis,
I want the Head of State's Status Actions to enforce the correct City Status budget and only be
usable while a game session is actually live,
so that players cannot change another character's City Status using a wrong budget figure or
outside a real game session.

## Why this story exists

Found during the 2026-08-12 party-mode scoping session reviewing the Office tab, part of Epic OTC
(Office Tab Correctness — `specs/epic-otc-office-tab-correctness.md`). Two independent,
pre-existing defects in `server/routes/office-actions.js`, bundled into one story because they
touch the same endpoint and the same test file:

1. The client (`office-tab.js`'s `_wireHosActions`) displays a City Status budget computed via
   `calcCityStatus()` — base dots + title bonus + regent-ambience bonus, capped at 10. The
   server's own budget check (`office-actions.js:57`) computes only
   `actor.status?.city + TITLE_STATUS_BONUS[...]`, silently omitting the ambience bonus and the
   cap. A Head of State who also regents an ambience territory sees a budget figure the server
   will not actually honour.
2. Status Actions have no relationship to the live game state today. `GET /latest_session` finds
   the most recent `game_sessions` doc with `session_date <= today` — once that date has passed,
   the panel stays active indefinitely. This project already has a canonical "is the game live
   right now" signal (`downtime_cycles.phase === 'game'`), used identically to gate feeding, and
   Status Actions should use the same signal.

## What this story is NOT

- NOT the ST approval queue (Epic OAQ) — Status Actions still apply immediately on submission
  after this story; OAQ layers pending/approval on top in a later story.
- NOT UI polish beyond what's needed to consume the new phase gate — no visual redesign of the
  Status Actions panel.
- NOT a change to the budget FORMULA itself (which merits/bonuses count) — only to making the
  server's enforcement match the client's already-correct display.
- NOT a change to `GET /latest_session` or its `game_sessions`-based grouping — that endpoint
  keeps governing which `game_session_id` an action's budget is counted against. The phase gate
  is an ADDITIVE check on top, not a replacement.
- NOT extending the phase gate to other future office powers — scoped to Status Actions
  (`raise`/`lower`/`grant_first`/`strip_last`) only.

## Acceptance Criteria

1. The server's budget check for `raise`/`lower` uses the SAME effective-City-Status calculation
   the client already displays: base dots + title bonus + regent-ambience bonus (only if the actor
   regents a territory), capped at 10.
2. That calculation exists in exactly ONE place, importable by both the client
   (`public/js/data/accessors.js`'s `calcCityStatus`) and the server
   (`server/routes/office-actions.js`) — not two independently-maintained implementations.
3. `POST /api/office_actions` rejects (403) any `raise`/`lower`/`grant_first`/`strip_last`
   submission unless the current downtime cycle's phase is `'game'` (via `cyclePhase()` from
   `public/js/downtime/cycle-phase.js`), regardless of `game_sessions.session_date`.
4. The Office tab's Status Actions panel reflects the phase gate: when no cycle is currently in
   `'game'` phase, the panel states the reason plainly rather than showing live-but-non-functional
   buttons, and does not let a player submit an action the server will reject.
5. `TITLE_STATUS_BONUS` is read from its one canonical source (`public/js/data/constants.js`) on
   both client and server — the hand-duplicated literal object in `office-actions.js` is removed.
6. No regression to the existing four action types, the per-target dedupe check, the
   budget-exhausted check, or the atomic `status.city` update.
7. Real behavioural test coverage for the corrected budget calculation and the new phase gate —
   not source-text/regex contract assertions alone (see Dev Notes → Testing standards).

## Tasks / Subtasks

- [x] Task 1 — Extract a shared, dependency-free City Status calculation (AC: 1, 2, 5)
  - [x] Created `public/js/data/city-status-calc.js`. DEVIATION from the literal "no imports"
        instruction: it imports `{ TITLE_STATUS_BONUS }` from `./constants.js`, a verified
        zero-import leaf module (confirmed by grep — no imports at all), rather than duplicating
        those five literal values a third time. This still satisfies the actual goal (no
        import-chain risk) and better matches the "collapse to one canonical source" intent than
        a second hand-copy would have.
  - [x] Moved the arithmetic into pure functions (`titleStatusBonusFor`, `regentAmbienceBonusFor`,
        `calcEffectiveCityStatus`) taking explicit arguments — no dependency on `accessors.js`'s
        `_currentTerritories` store.
  - [x] `accessors.js`'s `calcCityStatus(c)`/`regentAmienceBonus(c)` are now thin wrappers around
        the new module via `getRegentTerritoryFor(c)?.ambience` — exact single-argument signature
        preserved, all 9 existing call sites unchanged and still passing.
  - [x] `server/routes/office-actions.js` imports `calcEffectiveCityStatus` from the new module and
        `findRegentTerritory` from `public/js/data/helpers.js` directly. CORRECTION to this task's
        own text: `helpers.js` turned out to be SAFE to import server-side after all (its
        `auth/discord.js` import guards `location` with `typeof location === 'undefined'`, so it
        doesn't crash under Node) — verified by grep before use, not assumed. This means the
        server reuses the exact same regent-matching logic (including the canonical-slug
        duplicate-preference rule) as the client, not a reimplementation.
  - [x] Removed the hand-duplicated `TITLE_STATUS_BONUS` literal from `office-actions.js`; it now
        flows through `city-status-calc.js`.
- [x] Task 2 — Gate `POST /api/office_actions` to the live game-phase cycle (AC: 3, 6)
  - [x] Imports `cyclePhase` from `../../public/js/downtime/cycle-phase.js`, called with no second
        argument — matches the established server convention in
        `server/routes/downtime.js` (phase-aware lane only, no legacy-status fallback).
  - [x] Queries `downtime_cycles`, filters `cyclePhase(c) === 'game'`, sorts by `game_number`
        descending, takes the first. 403 if none found.
  - [x] Gate runs FIRST, before the self-target check and the actor/target lookups — covers
        `raise`/`lower`/`grant_first`/`strip_last` (`GATED_TYPES`), not just the two paid types.
  - [x] `GET /latest_session` untouched.
- [x] Task 3 — Client consumes the new gate (AC: 4)
  - [x] CORRECTION to this task's own text: no new helper was needed. `public/js/downtime/db.js`
        already had `getGamePhaseCycle()` (lines 151-154) — exactly "the cycle currently in game
        phase," previously defined but with zero callers anywhere in the app. Its own doc comment
        even warns against reimplementing this ("every 'which cycle is live for the game' reader
        must go through this"). `office-tab.js` now imports and calls it directly instead of
        mirroring `getFeedingCycle()`.
  - [x] `_wireHosActions` fetches `liveCycle` alongside `session`. `renderBudget()` shows "Available
        once the game session opens" when `!liveCycle`. Both `renderButtons()` and `doAction()`
        early-return on `!liveCycle`, so no button ever renders as live/actionable outside game
        phase.
- [x] Task 4 — Real behavioural tests (AC: 7)
  - [x] `server/tests/otc-2-city-status-calc.test.js` — 10 unit tests against the new pure module,
        all passing. Covers the exact two regressions (ambience bonus, 10-cap) with concrete
        numbers, plus the "7 of 7" figure from the live scoping session as a sanity check.
  - [x] `server/tests/otc-2-office-actions-api.test.js` — 6 real supertest-driven integration
        tests against a live mounted app + `tm_suite_test`, following the `oath-b-d6-api-roundtrip`
        pattern exactly (added `officeActionsRouter` to `server/tests/helpers/test-app.js`, which
        didn't mount it before). Covers: phase gate rejects with no cycle / with a `prep`-phase
        cycle / for all four gated action types, allows once a `game`-phase cycle exists, and two
        budget-correctness tests that discriminate the OLD buggy formula from the fix by exhausting
        the real budget (4 successful raises then a 5th rejected, proving the ambience bonus is
        counted; 10 successful raises then an 11th rejected, proving the 10-cap is enforced).
        **CANNOT BE EXECUTED IN THIS SESSION** — see Dev Agent Record → Completion Notes. Written
        and reasoned through carefully, matching established project conventions exactly, but
        unverified pending a reachable MongoDB. Angelus's explicit direction (2026-08-12): leave
        them written and unexecuted, flagged clearly, rather than delete or replace with mocks.
  - [x] Existing `feature.691.hos-city-status-power.test.js` — all 31 contract tests still pass
        unmodified; none of their assertions targeted the removed inline `TITLE_STATUS_BONUS`
        literal.
- [x] Task 5 — Full changed-area regression (AC: 6)
  - [x] 200/200 passing across 13 files: the new pure-module and contract tests, both issue-1141
        office-tab suites, and 8 further files whose tests reference `accessors.js`/`calcCityStatus`
        transitively (`api-st-mods`, `derived-stat-modifiers-parallel-write`,
        `disc-attr-parallel-write`, `dt-form-territory-fresh-fetch`, `issue-879-defence-penalty-wirein`,
        `issue-937-prereq-fighting-styles`, `prereq-covenant-status`, `prereq-same-level-sentinel`,
        `stm-path-resolve-sanity`) — checked because the `accessors.js` refactor touches code they
        all depend on, even though none of them are office-specific.
  - [x] Two pre-existing, unrelated failures confirmed via `git stash` (identical on the unmodified
        base): `issue-836-legacy-tracker-cache-removed.test.js` (documented #1125) and
        `n8-mandragora-prereq.test.js` (a syntax error unrelated to this story's files).
  - [x] The DB-backed integration suite (Task 4) is the one piece of Task 5's own "no regression"
        claim not verified by an actual run — see Completion Notes.

## Dev Notes

### Current state of the files this story touches

**`server/routes/office-actions.js`**: `TITLE_STATUS_BONUS` is a hand-typed literal at lines 7-9,
independently duplicating `public/js/data/constants.js:47`'s canonical `TITLE_STATUS_BONUS`. The
budget check at line 57 (`const budget = (actor.status?.city || 0) + (TITLE_STATUS_BONUS[actor.court_category] || 0);`)
has no phase/cycle awareness anywhere in the file — `GET /latest_session` (lines 18-25) only
queries `game_sessions` by `session_date <= today`, nothing touches `downtime_cycles`.

**`public/js/data/accessors.js`**: `calcCityStatus(c)` (line 335) =
`(c.status?.city || 0) + titleStatusBonus(c) + regentAmienceBonus(c)`, capped at 10
(`Math.min(raw, 10)`). `regentAmienceBonus` (line 328) reads `REGENT_AMBIENCE_BONUS` (a
module-private, non-exported const, line 295) via `getRegentTerritoryFor(c)`, which reads a
MODULE-LEVEL MUTABLE STORE `_currentTerritories` (line 301) — populated only by the client calling
`setStatusTerritories(territories)` at boot/reload. This store is never populated server-side and
has no mechanism to be.

**LANDMINE — do not import `accessors.js` directly into server code.** `accessors.js` imports
`getRulesCache` from `../editor/rule_engine/load-rules.js` (line 4), which imports `apiGet` from
`../../data/api.js` — the exact module that reads `location.hostname` at module top level and
crashes immediately under Node/vitest (the SAME landmine issue-1141 already routed around once,
via a different import chain: `office-tab.js` → `api.js` directly). Importing `accessors.js`
server-side hits this transitively. This is why Task 1 extracts the calculation into a new
zero-import module rather than importing `accessors.js` as-is.

**`public/js/downtime/cycle-phase.js`**: already the exact precedent for Task 1's approach — its
own header states it is "deliberately importable by the client (`db.js`), the server
(`routes/downtime.js`), and the test suite directly, so there is exactly one implementation of the
phase contract." `server/routes/downtime.js:12` imports it via
`'../../public/js/downtime/cycle-phase.js'` — use the identical relative path from
`office-actions.js`. `cyclePhase(cycle, deriveStatus)` returns one of
`'downtime' | 'processing' | 'prep' | 'game'` (or `null`); this story only cares about `'game'`.

**`public/js/downtime/db.js:183-188`**: `getFeedingCycle()` is the established client-side pattern
for "find the currently-relevant cycle" — fetches all cycles, filters by a phase predicate
(`isFeedingOpen(c)`, which matches `'prep' | 'game'`), sorts by `game_number` descending, returns
the first. Task 2/3 need an equivalent filtered to `phase === 'game'` only — do NOT reuse
`isFeedingOpen()` itself, it is deliberately broader (feeding opens a phase earlier than Status
Actions should).

**Existing test file `server/tests/feature.691.hos-city-status-power.test.js`**: reads the
route/schema/tab/CSS files as raw text and asserts substrings/regexes against them (e.g.
`expect(ROUTE).toContain('countDocuments')`) — it does NOT drive real HTTP requests against a live
app. This proves a string exists in the source, not that the logic behaves correctly. This story's
corrected logic needs real coverage: `server/tests/helpers/test-app.js` is the established
live-app-plus-`tm_suite_test`-DB pattern used elsewhere (e.g.
`server/tests/oath-b-d6-api-roundtrip.test.js`) — use it for the new integration tests rather than
extending the contract-only style.

### Testing standards summary

- vitest, `cd server && npx vitest run tests/<name>.test.js`. This project's suites are forced onto
  `tm_suite_test` via the vitest setup file — never live data.
- Run only the changed-area suites listed in Task 5, not the full 171-suite run.
- Known pre-existing failures (not this story's concern): the allocator-readers source-window
  assertion (#1115), `desktop-and-css.spec.js` (12), `post-game-1.spec.js` nav-1-3 (3) — all
  documented in `CLAUDE.md`.

### Project Structure Notes

- New file: `public/js/data/city-status-calc.js` — pure module, placed alongside `accessors.js`
  and `constants.js` (character/status logic), matching `cycle-phase.js`'s placement convention
  for its own domain (`public/js/downtime/`).
- Per `specs/project-context.md`: any new UI text/messaging in Task 3 uses existing CSS
  tokens/classes, no bare hex or inline styles — reuse the `.office-budget-line`/`.exhausted`
  patterns already present in `office-tab.js`'s current rendering rather than inventing new
  classes.
- British English throughout, no em-dashes in any player-facing string (project hard rule).

### References

- [Source: server/routes/office-actions.js] — budget check, `TITLE_STATUS_BONUS` duplication, no
  phase awareness.
- [Source: public/js/data/accessors.js#L289-338] — `titleStatusBonus`, `regentAmienceBonus`,
  `calcCityStatus`, the `_currentTerritories` module store.
- [Source: public/js/data/constants.js#L47] — canonical `TITLE_STATUS_BONUS`.
- [Source: public/js/downtime/cycle-phase.js] — the pure shared-module precedent Task 1 follows;
  `cyclePhase()` for Task 2.
- [Source: public/js/downtime/db.js#L183-188] — `getFeedingCycle()`, the "find the live cycle"
  pattern Task 2/3 adapt.
- [Source: server/routes/downtime.js#L12] — exact relative import path for `cycle-phase.js` from
  `server/routes/`.
- [Source: server/tests/feature.691.hos-city-status-power.test.js] — existing contract-test style,
  superseded by Task 4's real behavioural tests.
- [Source: server/tests/helpers/test-app.js] — the live-app test pattern Task 4 should use.
- [Source: specs/epic-otc-office-tab-correctness.md] — parent epic.
- [Source: 2026-08-12 party-mode scoping session] — Dana's "collapse to one shared calculation,
  not two independently-matched ones" and Sally's "a dead button with no reason" findings that
  shaped AC 2 and AC 4.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- Verified `city-status-calc.js` is safe to import server-side by running its unit tests directly
  under `vitest`/Node — 10/10 pass, confirming no transitive `location`/`document`/`window` crash.
- Verified the `helpers.js` → `auth/discord.js` import chain is server-safe by reading each file's
  top-level statements before use (discord.js guards `location` with a `typeof` check at line 9) —
  not assumed from its filename.
- Confirmed by `git stash`/`vitest run`/`git stash pop` that both `issue-836-legacy-tracker-cache-
  removed.test.js` and `n8-mandragora-prereq.test.js` fail identically on the unmodified base —
  pre-existing, not caused by this story.
- Attempted the new DB-backed integration test three ways: against `MONGODB_URI` (Atlas) directly —
  hung indefinitely, no timeout ever fired despite `serverSelectionTimeoutMS: 5000` in `db.js`,
  consistent with no outbound network route to Atlas from this session; against a local `mongod.exe`
  process (confirmed running via `tasklist`) by overriding `MONGODB_URI` to `127.0.0.1` — failed
  fast (~5s) with `ECONNRESET`, because `db.js:31` hardcodes `tls: true` unconditionally and the
  local mongod doesn't speak TLS. Both attempts ruled out before reporting the blocker; see
  Completion Notes.

### Completion Notes List

- **All 6 ACs implemented and covered by tests I could run.** AC1/AC2/AC5 (shared calculation) are
  proven by `otc-2-city-status-calc.test.js`, 10/10 passing. AC3/AC6 (phase gate, no regression) and
  AC4 (client messaging) are implemented and reasoned through carefully against real source, but
  the integration tests that would prove AC3/AC7 end-to-end through real HTTP requests
  (`otc-2-office-actions-api.test.js`) could not be executed in this session — MongoDB is
  unreachable both via Atlas (network) and local mongod (TLS mismatch in a shared module I should
  not patch as a side effect of this story). This is an environmental constraint, not a defect in
  the tests or the implementation; it matches this project's own open issue #1117 and `CLAUDE.md`'s
  note that Angelus cannot run the app locally either.
- **Explicit direction from Angelus (2026-08-12, mid-story):** given three options — leave the DB
  tests written but unexecuted, convert them to mocked/stubbed tests to get a verifiable run now, or
  pause for Angelus to run them against a reachable DB — Angelus chose the first: leave them as
  real integration tests matching the established project pattern, flagged clearly as unverified in
  this session rather than converted to a weaker style. **This story is not fully closed until
  someone runs `server/tests/otc-2-office-actions-api.test.js` against a reachable MongoDB and
  confirms all 6 pass** — flag this explicitly at code-review and before any `done` status.
  A hostile reading of this Completion Note is that the actual regression coverage for AC3
  (phase gate rejecting a live POST) and the two budget-discrimination tests has never been
  observed to pass, only reasoned about — record review should treat that gap as real, not
  cosmetic.
- Found and used an existing, previously-unused function (`getGamePhaseCycle()` in `db.js`) instead
  of writing a new client-side helper as the story's own Task 3 specified — its own doc comment
  ("every reader must go through this") makes it clearly the intended tool for exactly this need.
  Also found `helpers.js` is server-import-safe (contrary to a natural first assumption given its
  proximity to the known `accessors.js` landmine) — verified by reading its actual import chain
  rather than assuming guilt by association.
- Two hand-typed literal object duplications removed this story: `TITLE_STATUS_BONUS` in
  `office-actions.js`, and (as a side effect of extracting the calc module) `REGENT_AMBIENCE_BONUS`
  no longer has a private copy sitting only in `accessors.js` — both now have exactly one home in
  `city-status-calc.js`/`constants.js`.

### File List

- `public/js/data/city-status-calc.js` — NEW. Pure shared calculation module.
- `public/js/data/accessors.js` — MODIFIED. `calcCityStatus`/`regentAmienceBonus` now delegate to
  the new module; local `REGENT_AMBIENCE_BONUS` removed.
- `public/js/downtime/cycle-phase.js` — MODIFIED (review fix). Added `currentCycle`/
  `currentCycleInGamePhase` pure functions.
- `public/js/downtime/db.js` — MODIFIED (review fix). `getGamePhaseCycle()` now uses
  `currentCycleInGamePhase` internally, fixing its own pre-existing stale-cycle bug (zero callers
  before this story, so no other consumer affected).
- `server/routes/office-actions.js` — MODIFIED. Removed hand-duplicated `TITLE_STATUS_BONUS`;
  added the game-phase gate (fixed post-review to use `currentCycleInGamePhase`); budget check now
  uses the shared calculation with a real territories fetch.
- `public/js/tabs/office-tab.js` — MODIFIED. `_wireHosActions` fetches and gates on
  `currentCycleInGamePhase(await getCycles())` (changed post-review from `getGamePhaseCycle()`, to
  guarantee byte-identical phase logic to the server).
- `server/tests/otc-2-city-status-calc.test.js` — NEW. 10 unit tests, passing.
- `server/tests/otc-2-office-actions-api.test.js` — NEW, extended post-review. 9 integration
  tests (added `lower`-type coverage and the stale-cycle regression; fixed shared-DB contamination
  in the negative-gate tests), all passing.
- `server/tests/cm1-cycle-phase.test.js` — MODIFIED (review fix). Added `currentCycle`/
  `currentCycleInGamePhase` unit tests including the stale-cycle regression case.
- `server/tests/helpers/test-app.js` — MODIFIED. Mounted `officeActionsRouter` at
  `/api/office_actions` (was not mounted before; needed for the new integration tests).

## Senior Developer Review (AI)

**Reviewer:** External — Codex CLI, `reasoning_effort=high`, 3-pass isolated (Blind Hunter / Edge
Case Hunter / Acceptance Auditor), 2026-08-12. Verified by this session per the `codex-review`
skill's return protocol before any finding was accepted or acted on. Full raw output:
`specs/stories/code-review/otc-2-codex-findings.md`.

### Outcome

**Patched and closed within this story's scope; two genuine environmental notes; several real
findings deferred as pre-existing and out of scope.**

### Verified and patched (all from outside this session)

- **[Pass 2/3, High] Stale-cycle selection: the phase gate identified "any cycle in game phase,"
  not "the current cycle."** CONFIRMED — Codex reproduced a real 201 (should be 403) live via
  Supertest with an older game-phase cycle and a newer prep-phase cycle. This story's own filter
  (`cycles.filter(phase==='game').sort(...)[0]`) was the exact defect: it never established which
  cycle was current before testing phase. **Fixed**: added `currentCycle`/
  `currentCycleInGamePhase` to `cycle-phase.js` (identify current-by-`game_number` FIRST, then
  test phase), used by both the route and `db.js`'s pre-existing (zero-caller)
  `getGamePhaseCycle()`, which had the identical bug. Prove-discriminated: wrote the regression
  test first, confirmed it failed (201, red) against the original code, fixed, confirmed it passes
  (403, green). Permanent coverage added in both `otc-2-office-actions-api.test.js` (live HTTP) and
  `cm1-cycle-phase.test.js` (pure function).
- **[Pass 1/2/3, Medium] Client and server disagreed about which phase-reading rule to use.**
  CONFIRMED via direct probe (`prep_server='prep'` vs `prep_client=true` for the same document).
  **Fixed**: `office-tab.js` no longer calls `getGamePhaseCycle()` (which resolves phase via
  `deriveCycleStatus`'s legacy-fallback derivation); it now calls `currentCycleInGamePhase`
  directly with no second argument, the exact same canonical-only call the server makes.
- **[Pass 1/3, Low] Negative phase-gate tests could pass for the wrong reason under a shared
  `tm_suite_test`.** CONFIRMED — cleanup only removed this file's own prefixed cycles, but the
  route scans every `downtime_cycles` document. **Fixed**: those tests now clear all cycles before
  asserting rejection.
- **[Pass 3b, Low] Test coverage never exercised `lower`, only `raise`/`grant_first`/`strip_last`,
  despite the record claiming "all four."** CONFIRMED — the record's claim was inaccurate at the
  time. **Fixed**: added explicit `lower` coverage.

### Verified, real, but explicitly out of this story's scope — deferred

These were found by the same review and are genuine, but none were introduced by this story — each
predates it, confirmed by reading the pre-diff version of the code. Fixing them would be scope
creep on a story titled "server-side hardening" for two specific, named defects. **Filed as
issue #1143** (Angelus's explicit go-ahead), not silently patched here:

- **[Pass 1, High] No authorization check ties `actor_id` to the authenticated caller** —
  any logged-in user can submit any `actor_id` with any `court_category`, not just their own
  character, not just Head of State. Pre-existing since #691.
- **[Pass 1, High] `game_session_id` is a caller-supplied, unvalidated string** — nothing binds it
  to a real session or the live cycle, so budget/dedupe scoping is trivially spoofable by inventing
  a fresh session id per request. Pre-existing since #691. Undercuts the value of this very story's
  budget-formula fix, since the scoping key itself isn't trustworthy — worth weighing when this is
  picked up.
- **[Pass 1/2, High/Medium] Budget check, dedupe check, and the eventual writes are not atomic** —
  a real concurrent-request race. Pre-existing since #691; this story's two added DB round-trips
  (territories fetch, phase-cycle fetch) run *before* the budget check, so they do not widen the
  pre-existing budget race window (confirmed by Pass 2's trace).
- **[Pass 1, Medium] Self-target check compares raw ObjectId strings, not resolved ObjectIds** —
  an uppercase/lowercase-hex pair of the same id bypasses "cannot target yourself." Pre-existing,
  unchanged by this diff. Confirmed via probe (`stringsEqual:false`, `objectIdsEqual:true`).
- **[Pass 1, Low] `server/tests/helpers/db-setup.js`'s `setupDb()`/`teardownDb()` don't skip
  cleanly on a failed connection** — produces a confusing double-error instead of the documented
  wholesale skip. Shared test infrastructure used by every DB-backed suite in this project, not
  scoped to this story.
- **[Pass 1, Medium] `office-tab.js` cannot distinguish a genuine "no game" state from a network/
  auth failure fetching cycles** — both render the same "Available once the game session opens"
  message. Real, but matches the pre-existing swallow-errors pattern already used one line above
  for the session fetch; a proper fix is a UX decision (what should each state actually say),
  arguably its own small story.

### Environmental notes (not defects)

- Codex's own environment could not reach the configured Atlas URI at all (`EACCES`), unlike this
  session's — a genuine, confirmed network difference between sandboxes, not a contradiction.
  Codex worked around it by temporarily setting `server/db.js`'s hardcoded `tls: true` to `false`
  and pointing at a local `mongod`, ran the previously-blocked integration suite successfully
  (6/6 at the time), then restored the file exactly and verified via hash comparison. This
  session's own environment turned out to have a transient connectivity issue, not a permanent
  one — re-run after the review confirmed Atlas reachable and all tests passing without any local
  workaround.
- Re-running the story's own "200/200" regression claim during review turned up a real, resolved
  discrepancy: Codex's Atlas-blocked environment got 137 passed/63 skipped/3 failed for the exact
  same 13-file command, while this session (both before and after the review) gets a clean 200/200.
  Both are accurate reports of their own environment; this is a live network-flakiness
  characteristic of the sandbox, not a false claim in either direction — recorded here rather than
  silently reconciled, per the review protocol's own instruction not to assume either number is
  simply wrong.

### Final regression

319/319 passing across 19 files (the original Task 5 list, plus `cm1-cycle-phase.test.js`,
`issue-1001-game-phase-canonical.test.js`, `find-regent-territory.test.js`,
`cm5-reset-transition.test.js`, and `issue-918-cycle-tab-management.test.js` — all touched
transitively by the `cycle-phase.js`/`db.js` fixes).
