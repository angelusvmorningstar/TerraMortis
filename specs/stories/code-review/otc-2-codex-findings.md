## Pass 1 — Blind Hunter

### High

- **[Pass 1] Any authenticated user can impersonate any office holder and execute Status Actions**
  - **Severity:** High
  - **File:line:** `server/routes/office-actions.js:61`; `server/routes/office-actions.js:67`; `server/index.js:185`
  - **The triggering input or sequence:** While any cycle passes the game-phase gate, an ordinary authenticated player posts a valid body with `actor_id` set to any known character that has any truthy `court_category` (it does not even have to be `Head of State`) and a different target. Production supplies only `requireAuth`; the handler never checks `req.user`, actor ownership, an ST role, or `actor.court_category === 'Head of State'`.
  - **The observable consequence:** The request is recorded under the impersonated actor and changes the target's City Status. Any logged-in user can exercise this Head-of-State power, including through non-Head-of-State office holders.
  - **Confidence:** High — the production middleware and complete handler contain no authorization check beyond authentication and a truthy office category.

- **[Pass 1] Caller-controlled session IDs reset both the budget and per-target uniqueness checks**
  - **Severity:** High
  - **File:line:** `server/routes/office-actions.js:78`; `server/routes/office-actions.js:83`; `server/schemas/office_action.schema.js:6`
  - **The triggering input or sequence:** During a live game phase, submit successive paid `raise`/`lower` actions with a fresh arbitrary string in `game_session_id` each time. The schema accepts any string, and the route neither verifies that the session exists nor binds it to the live cycle/latest game session.
  - **The observable consequence:** `used` is zero and `dup` is absent in every new caller-created session bucket, so a caller can exceed the effective-City-Status budget and repeatedly act on the same target. The inserted audit records preserve the invented session IDs.
  - **Confidence:** High — both limiting queries are scoped exclusively by the untrusted body value.

- **[Pass 1] Budget checks, duplicate checks, logging, and the status mutation are not atomic**
  - **Severity:** High
  - **File:line:** `server/routes/office-actions.js:78`; `server/routes/office-actions.js:83`; `server/routes/office-actions.js:131`
  - **The triggering input or sequence:** Send two paid requests concurrently when the actor has one budget slot left, or double-submit the same actor/target while both requests are between the count/duplicate reads and the insert. A separate thrown-path trigger is a successful `office_actions.insertOne()` followed by a failed `characters.updateOne()`.
  - **The observable consequence:** Concurrent distinct-target requests can both pass and overspend the budget. Concurrent same-target raises can create two action records while both write the same `old_status + 1`, consuming two actions for one dot. If the second write throws, a phantom action remains, consumes budget, and makes a retry conflict even though the target never changed.
  - **Confidence:** High — the operations are separate reads/writes with no transaction, conditional update, or unique/atomic claim in this handler; DB-backed reproduction was blocked by MongoDB connectivity.

### Medium

- **[Pass 1] The client and server do not use the same phase reader**
  - **Severity:** Medium
  - **File:line:** `public/js/tabs/office-tab.js:89`; `public/js/downtime/db.js:146`; `public/js/downtime/db.js:151`; `server/routes/office-actions.js:52`
  - **The triggering input or sequence:** Return a cycle whose canonical field is `phase: 'game'` but whose legacy mirror fields are absent or stale. This is also the exact phase-only shape seeded by the new integration tests. The server's pure `cyclePhase(c)` accepts it, while `getGamePhaseCycle()` calls `isInGamePhase()`/`deriveCycleStatus()` and never consults `cycle.phase`.
  - **The observable consequence:** The server permits Status Actions, but the Office tab reports that the game session is not open and renders no action buttons. A direct read-only probe returned `selectedByUiHelper: null` for a phase-only game cycle while the server gate classified it as `game`.
  - **Confidence:** High for the code-path disagreement; medium-high for production incidence because normal phase writes are documented to mirror legacy fields, while the schema does not require those mirrors.

- **[Pass 1] Phase-fetch failures are silently presented as a closed game**
  - **Severity:** Medium
  - **File:line:** `public/js/tabs/office-tab.js:89`; `public/js/tabs/office-tab.js:108`
  - **The triggering input or sequence:** `/api/downtime_cycles` fails because the network is offline, authentication has expired, the server returns 500, or the response is not valid JSON. `apiGet` throws, the bare catch leaves `liveCycle = null`, and rendering continues.
  - **The observable consequence:** A Head of State sees “Available once the game session opens” and no buttons even if the game is live. The UI turns an operational/authentication failure into a false game-state assertion and provides no retry/error diagnosis.
  - **Confidence:** High — every rejection from the shared request helper is discarded without classification.

- **[Pass 1] Self-targeting can be bypassed with a different textual spelling of the same ObjectId**
  - **Severity:** Medium
  - **File:line:** `server/routes/office-actions.js:58`
  - **The triggering input or sequence:** Send `actor_id` as uppercase 24-digit hexadecimal and `target_id` as the lowercase form of the same Mongo ObjectId. The raw strings are unequal, so the self-target check passes, but both `new ObjectId(...)` conversions resolve to the same character.
  - **The observable consequence:** The actor can grant, raise, lower, or strip their own City Status despite the explicit self-target prohibition.
  - **Confidence:** High — a read-only Node probe confirmed the strings compare unequal while the resulting Mongo `ObjectId`s compare equal.

### Low

- **[Pass 1] Every gated request materializes and sorts the entire cycle history**
  - **Severity:** Low
  - **File:line:** `server/routes/office-actions.js:50`
  - **The triggering input or sequence:** Any of the four valid action types reaches the authenticated route, including a self-targeting or otherwise invalid actor/target request, when `downtime_cycles` contains a large history.
  - **The observable consequence:** The server transfers every cycle document, filters it, and sorts all game cycles in application memory merely to test existence. This adds avoidable latency and memory pressure to every action and gives authenticated callers an unnecessarily expensive pre-validation request path. An absent/empty collection itself is safe and returns the intended 403.
  - **Confidence:** High for the unbounded work; impact depends on collection growth and request rate.

- **[Pass 1] Negative phase-gate tests are contaminated by pre-existing cycles**
  - **Severity:** Low
  - **File:line:** `server/tests/otc-2-office-actions-api.test.js:86`; `server/tests/otc-2-office-actions-api.test.js:102`; `server/tests/otc-2-office-actions-api.test.js:120`
  - **The triggering input or sequence:** Run the integration suite against a shared `tm_suite_test` database containing any non-`OTC-2 Probe` cycle that the route classifies as game phase. Each negative test deletes only cycles whose label starts with the test prefix, but the production query examines all cycles.
  - **The observable consequence:** Requests expected to return 403 instead pass the phase gate, making the suite order/environment-dependent and potentially returning 201 or another later validation result.
  - **Confidence:** High from the fixture cleanup/query mismatch; it could not be reproduced here because MongoDB was unreachable.

- **[Pass 1] A failed DB setup causes a second teardown failure instead of the documented wholesale skip**
  - **Severity:** Low
  - **File:line:** `server/tests/otc-2-office-actions-api.test.js:73`; `server/tests/otc-2-office-actions-api.test.js:79`
  - **The triggering input or sequence:** MongoDB connection setup rejects. `beforeAll` fails, but `afterAll` still calls `cleanup()`, whose first `getCollection()` throws because no DB was connected.
  - **The observable consequence:** The file fails with two suite errors and six skipped tests rather than “skips wholesale when MongoDB is unreachable” as its header claims. The extra teardown error adds noise and can obscure the primary connection failure.
  - **Confidence:** High — this happened in the mandated run in this environment.

### Validation notes

- I opened the supplied `specs/stories/code-review/otc-2-diff.txt`; all seven files named by that diff; and only directly relevant import/type/mount/test-harness dependencies: `public/js/data/helpers.js`, `public/js/data/constants.js`, `public/js/data/api.js`, `public/js/downtime/db.js`, `public/js/downtime/cycle-phase.js`, `server/index.js`, `server/routes/territories.js`, `server/db.js`, `server/schemas/character.schema.js`, `server/schemas/territory.schema.js`, `server/schemas/office_action.schema.js`, the cycle portion of `server/schemas/downtime_submission.schema.js`, `server/tests/helpers/db-setup.js`, and `server/tests/helpers/setup-env.js`. Vitest also loaded `server/tests/find-regent-territory.test.js` and `server/tests/feature.691.hos-city-status-power.test.js` in the targeted regression run. I did not look for or open the story spec, any later-pass file, or anything outside `D:\Terra Mortis\TM Suite`.

- Commands run and observed results:

  - `$pwd.Path; git status --short; Get-Item ...otc-2-diff.txt; Get-Content ...otc-2-diff.txt` — repo path confirmed; baseline was heavily dirty with the reviewed implementation paths already modified/untracked plus many unrelated files; the combined output was truncated by the tool.
  - `rg -n "^diff --git|^@@" -- specs/stories/code-review/otc-2-diff.txt` — succeeded and identified seven diff sections/hunks.
  - Two numbered `Get-Content` range commands for diff lines 1–180 and 181–EOF — both succeeded; the supplied diff has 518 lines.
  - Numbered `Get-Content` over the seven modified/new files — succeeded, although the combined tool display was truncated; the affected files were subsequently checked in bounded reads/searches.
  - Combined `rg` for `findRegentTerritory`/`regent_id`, `getGamePhaseCycle`/`cyclePhase`, the production mount, constants, and new symbol uses — timed out after about 11.9 seconds but returned the relevant matches before timeout.
  - Bounded `rg` checks of the territory route/schema, helper implementation, downtime phase helpers, and production/test mounts — succeeded. They confirmed string `regent_id`, and matching `auth -> noCache() -> router` production/test stack shape (with `mockAuth` substituting for `requireAuth`).
  - `cd server && npx vitest run tests/otc-2-city-status-calc.test.js` — **passed: 1 test file, 10 tests**.
  - `cd server && npx vitest run tests/otc-2-office-actions-api.test.js` — **failed: 1 test file, 6 tests skipped**. MongoDB connection failed after about five seconds with `MongoServerSelectionError: connect EACCES 159.143.141.178:27017`; teardown then raised `Database not connected — call connectDb() first`.
  - Numbered reads of `server/tests/helpers/db-setup.js`, `server/db.js`, `server/tests/helpers/setup-env.js`, and the relevant schemas — succeeded; the first attempt used the wrong setup-env path and reported it missing, then the actual helper path succeeded later.
  - Combined `rg` for character status, Office-tab phase handling, API errors, and `regent_id` writes — returned the needed matches but exited 1 because `-g` options were accidentally placed after `--` and PowerShell passed them as paths. No files were changed.
  - Numbered reads of the relevant sections of `public/js/downtime/db.js`, `public/js/downtime/cycle-phase.js`, `public/js/data/api.js`, and `server/tests/helpers/setup-env.js` — succeeded.
  - `Test-Path`/scoped `git status`/scoped `git diff` for the findings and reviewed paths — succeeded; the findings file did not yet exist, and the source diff matched the supplied change (with new files still untracked in the baseline).
  - Two read-only inline Node probes of the phase helpers — succeeded. The final probe returned `{"selectedByUiHelper":null,"serverGatePhases":["game","game"],"canonicalClientPhases":["game",null]}` for phase-only and legacy-status-only sample cycles.
  - `rg` checks for City-Status call sites and use of new locals/imports — succeeded; no new unused import or unreachable branch was found.
  - `rg --files server/tests | rg 'city-status|accessor|status.*calc|find-regent'` — succeeded and identified relevant regression suites.
  - `cd server && npx vitest run tests/find-regent-territory.test.js tests/feature.691.hos-city-status-power.test.js` — **passed: 2 test files, 44 tests**.
  - Read-only inline Node `ObjectId` case probe — succeeded with `stringsEqual:false`, `objectIdsEqual:true`, and the uppercase form canonicalized to lowercase.
  - Targeted schema `rg` for cycle `phase`, `game_phase`, and `status` — succeeded and confirmed the fields are optional and the canonical phase is independently recognized.
  - Final `Get-Content` plus scoped `git status --short`, trailing-whitespace scan, and report heading/count checks — succeeded; only the requested report was added beyond the pre-existing reviewed-path state, and the report contains one Pass 1 heading, 3 High, 3 Medium, and 3 Low findings.

- MongoDB-backed request behavior could not be exercised because outbound access to the configured Atlas address was denied with `EACCES`. I did not attempt to rewrite `server/db.js` for local MongoDB because it hardcodes `tls: true`, matching the stated local-connectivity hazard. Consequently, the authorization, budget-bypass, concurrency, and shared-DB contamination findings are code-traced rather than DB-reproduced.

- I made no temporary source/tooling edits. The only change I made is this requested findings file. A final scoped status/diff check was performed after writing; the pre-existing dirty source state was not altered.

## Pass 2 — Edge Case Hunter

### High

- **[Pass 2] A stale historical `game` cycle keeps Status Actions live while the current cycle is not in game**
  - **Severity**: High
  - **File:line**: `server/routes/office-actions.js:51-55`; `public/js/downtime/db.js:151-153`; `public/js/admin/cycle-views.js:79-93,256-281`
  - **The triggering input or sequence**: Game 5 is left at `phase: 'game'`, then the higher-`game_number` Game 6 is set to `phase: 'prep'`, `processing`, or `downtime`. This is reachable through the normal phase UI: `setCyclePhase` updates only the selected cycle and neither the schema, route, nor database has a single-game-phase constraint. The repository's cycle UI defines Game 6 as current, but the new server gate first filters *all* cycles for `game` and the client uses `find` for any derived game cycle, so both select stale Game 5.
  - **The observable consequence**: The Office panel renders actionable buttons and the server accepts and immediately applies City Status changes even though the actual current cycle is outside game phase, defeating the main hardening this change is meant to add.
  - **Confidence**: High. The writers and current-cycle rule were traced end to end, and a runtime probe reproduced `clientPicked: "old"`, `serverPicked: "old"`, `actualHighest: "new"`.

### Medium

- **[Pass 2] Client and server use different phase representations and disagree on valid legacy or desynchronised cycles**
  - **Severity**: Medium
  - **File:line**: `public/js/downtime/db.js:86-102,146-153`; `server/routes/office-actions.js:50-55`; `public/js/downtime/cycle-phase.js:58-71`
  - **The triggering input or sequence**: A legacy cycle has `game_phase: 'game'`, `status: 'active'`, and no `phase` (the exact divergence protected by `issue-1001-game-phase-canonical.test.js`). `getGamePhaseCycle()` calls `deriveCycleStatus`, so the client considers it live; the server calls `cyclePhase(c)` without the client derivation, falls back only to raw `status`, resolves `downtime`, and rejects. The reverse is also reachable because cycle POST/PUT accepts a phase-only document: `{ phase: 'game' }` is live to the server but derives as non-game on the client. For a hand-edited malformed `{ phase: 'feeding', game_phase: 'game', status: 'closed' }`, the unknown `phase` falls through: client resolves `game`, server resolves `processing`.
  - **The observable consequence**: Players can see and click live-looking buttons only to receive a 403, or the panel can hide actions that the API would accept. The client-side mirror required to explain the server gate is therefore unreliable at precisely the legacy/corrupt-document boundary the phase helpers were designed to handle.
  - **Confidence**: High. Existing regression tests establish that the legacy divergence is real, and the runtime probe produced client/server results of `true/downtime`, `false/game`, and `true/processing` for the three cases above.

- **[Pass 2] The new phase gate is a check-then-act race and can apply an action after game phase closes**
  - **Severity**: Medium
  - **File:line**: `server/routes/office-actions.js:50-55,61-95,118-135`
  - **The triggering input or sequence**: A POST reads a live `game` cycle at line 51; before it reaches `insertOne`/the character update, an ST moves that cycle to `processing`. Paid actions have actor lookup, the new territories fetch, budget count, duplicate lookup, and target lookup after the phase read; free actions still have actor and target lookups. There is no recheck, transaction, or write condition tied to the phase observed at the start.
  - **The observable consequence**: A request already in flight can record and apply a City Status mutation after the game has closed, despite the endpoint's claimed server-side phase enforcement. The extra territories round-trip does not enlarge the old budget `countDocuments`-to-`insertOne` window (it occurs before the count), but it does enlarge this new phase-check-to-write window for paid actions.
  - **Confidence**: High on the race's existence; Medium on frequency because it requires a phase transition during one request.

### Low

- **[Pass 2] The “no game cycle” integration tests are contaminated by any pre-existing game-phase document**
  - **Severity**: Low
  - **File:line**: `server/tests/otc-2-office-actions-api.test.js:27-32,84-136`
  - **The triggering input or sequence**: `tm_suite_test` contains a game-phase cycle left by a prior/manual test whose label does not start with `OTC-2 Probe`. The setup and individual rejection tests delete only prefixed cycles, while the production route scans the entire `downtime_cycles` collection.
  - **The observable consequence**: Tests expecting 403 can receive 201 because the unrelated cycle satisfies the gate. The persistent shared test DB is not reset wholesale, so the new behavioural coverage is order/state dependent.
  - **Confidence**: High from the cleanup query and route query; not observed end to end because MongoDB was unreachable.

- **[Pass 2] The DB-backed suite says it skips when MongoDB is unavailable but instead fails twice**
  - **Severity**: Low
  - **File:line**: `server/tests/otc-2-office-actions-api.test.js:12-13,73-81`
  - **The triggering input or sequence**: MongoDB cannot be reached during `beforeAll`. `setupDb()` rethrows instead of selecting a skip path, and `afterAll` then unconditionally calls `cleanup()` against an uninitialised database.
  - **The observable consequence**: The required gate reports one failed file with all 6 tests skipped, plus a second teardown error (`Database not connected`), rather than the wholesale skip promised by the file header. This makes the suite noisy and unusable in the explicitly documented no-Mongo environment.
  - **Confidence**: High; this exact outcome was observed in the mandated run.

### Validation notes

- **Files opened**: `specs/stories/code-review/otc-2-diff.txt`; `specs/stories/otc-2-status-actions-server-hardening.md`; `server/routes/office-actions.js` (plus its base-commit version), `server/routes/downtime.js`, `server/routes/territories.js`; `server/schemas/office_action.schema.js`, `server/schemas/downtime_submission.schema.js`, `server/schemas/territory.schema.js`; `server/db.js`, `server/package.json`, `server/vitest.config.js`; `server/tests/otc-2-city-status-calc.test.js`, `server/tests/otc-2-office-actions-api.test.js`, `server/tests/helpers/test-app.js`, `server/tests/helpers/db-setup.js`, `server/tests/helpers/setup-env.js`, `server/tests/issue-1001-game-phase-canonical.test.js`, `server/tests/find-regent-territory.test.js`, `server/tests/feature.691.hos-city-status-power.test.js`; `public/js/data/city-status-calc.js`, `public/js/data/accessors.js` (plus its base-commit version), `public/js/data/helpers.js`, `public/js/data/api.js`; `public/js/auth/discord.js`; `public/js/downtime/cycle-phase.js`, `public/js/downtime/db.js` (plus its base-commit version); `public/js/tabs/office-tab.js` (plus its base-commit version); relevant ranges of `public/js/app.js`, `public/js/admin/cycle-views.js`, `public/js/editor/csv-format.js`, `public/js/editor/sheet.js`, `public/js/suite/status.js`, and `public/js/suite/sheet.js`. I did not open this findings file or any other pass's findings before appending.
- **Required gate**: `cd server && npx vitest run tests/otc-2-city-status-calc.test.js` — exit 0; **1 file passed, 10 tests passed**.
- **Required DB gate**: `cd server && npx vitest run tests/otc-2-office-actions-api.test.js` — exit 1 after 6.77s; **1 file failed, 0 passed, 6 skipped**. Atlas connection failed with `MongoServerSelectionError: connect EACCES 159.143.141.178:27017`; teardown then failed with `Database not connected — call connectDb() first`. I could not execute any behavioural MongoDB assertions. This is the known MongoDB connectivity hazard; `server/db.js` also hardcodes `tls: true`, so I did not attempt a non-TLS local `mongod` workaround.
- `cd server && npx vitest run tests/issue-1001-game-phase-canonical.test.js tests/find-regent-territory.test.js tests/feature.691.hos-city-status-power.test.js` — exit 0; **3 files passed, 51 tests passed**.
- `cd server && npx vitest run tests/issue-1141-office-tab-render.test.js` — exit 0; **1 file passed, 3 tests passed**.
- The inline Node phase/formula probe (browser globals stubbed, no file written) — exit 0. It reproduced stale-cycle selection (`old/old` while `new` had the highest game number), the three client/server phase divergences, `regentAmbienceBonusFor(undefined) === 0`, and old/current wrapper parity of `9/9`, `10/10`, and `0/0` including equal title/regency components.
- Read-only repository commands run: `git status --short; git rev-parse --show-toplevel; git rev-parse HEAD` (exit 0; root `D:/Terra Mortis/TM Suite`, HEAD/base `9bdd8ad0876a8d5a03a29f94afeb2acf82993e35`, heavily pre-dirty worktree); path-scoped `git status --short -- ...` (exit 0; only the supplied story changes plus the pre-existing untracked findings file); `Get-Content specs/stories/code-review/otc-2-diff.txt` (exit 0); `rg --files -g AGENTS.md ...` (no matches; the first parallel wrapper surfaced exit 1, the normalised rerun exited 0); `rg -n` reference searches for the changed functions, phase writers, territory fields/routes, action types, API paths, indexes, and `TITLE_STATUS_BONUS` (all successful; the only route occurrence of `TITLE_STATUS_BONUS` is a comment at line 72, and no alternate client POST path exists); line-numbered `Get-Content`/`rg -n '^'` reads of the files and ranges listed above (exit 0); `git show 9bdd8ad0:public/js/data/accessors.js`, `git show 9bdd8ad0:server/routes/office-actions.js`, `git show 9bdd8ad0:public/js/tabs/office-tab.js`, and `git show 9bdd8ad0:public/js/downtime/db.js` (exit 0). `rg` searches intentionally returning no matches were normalised to exit 0 where rerun; the unnormalised `/api/office_actions` quoting attempt returned exit 1 and was rerun successfully with `rg -F`.
- Branch conclusions with no finding: `GATED_TYPES` exactly equals the schema enum, so after validation its conditional cannot be skipped; the new pre-count queries do not widen the old budget count-to-insert critical section; a null regent becomes `undefined` through optional chaining and object lookup of `undefined` returns `undefined`, then `|| 0` returns numeric 0; the bare territory query returns complete documents and the territory schema/route expose every field read by `findRegentTerritory`; `csv-format.js`, `suite/status.js`, and `suite/sheet.js` consume the unchanged numeric `calcCityStatus` result and the probe confirmed byte-identical values to the old expression; `office-tab.js` has only one POST path, creates no buttons before `liveCycle` resolves, and both button rendering and submission check it (although the captured value can become stale, the server remains the final gate).
- **Repository state**: I modified no source, test, story-spec, or tooling file. I appended only this required Pass 2 section. A temporary append-mechanism probe was created under `D:/tmp` and deleted with `apply_patch`; it never touched the repository. Final path-scoped status/diff verification follows this append.

## Pass 3 — Acceptance Auditor

### 3a

#### High

- **The server treats any historical game-phase cycle as permission to act**
  - **Severity**: High
  - **File:line**: `server/routes/office-actions.js:51`
  - **Triggering input or sequence**: Leave an older cycle at `phase: 'game'`, create a newer/current cycle in `prep`, `processing`, or `downtime`, then submit any of `raise`, `lower`, `grant_first`, or `strip_last`.
  - **Observable consequence**: The route filters all cycles for any game-phase document and accepts the Status Action even though the current downtime cycle is not in game phase. A player can change another character's City Status outside the live game window, violating AC3's literal current-cycle gate and the story's core outcome.
  - **Confidence**: High. The selection never identifies the current cycle before testing its phase; sorting only the already-game-filtered subset cannot notice a newer non-game cycle.

#### Medium

- **The Office panel and server disagree about the canonical phase field**
  - **Severity**: Medium
  - **File:line**: `public/js/tabs/office-tab.js:89`
  - **Triggering input or sequence**: Load the Office tab with a cycle whose canonical `phase` and legacy `game_phase`/`status` fields diverge, for example `{ phase: 'prep', game_phase: 'game', status: 'game' }` or `{ phase: 'game', game_phase: 'processing', status: 'closed' }`. Such divergence is reachable through the unrestricted generic cycle PUT route and is also the stale-data class the phase model explicitly handles.
  - **Observable consequence**: `getGamePhaseCycle()` uses `isInGamePhase()`/`deriveCycleStatus()` and ignores `cycle.phase`, while the server uses `cyclePhase()` where `phase` wins. In the first example the UI exposes buttons whose requests receive 403; in the second it hides valid actions. This violates AC4's requirement that the panel not permit an action the server will reject.
  - **Confidence**: High. A direct Node probe returned `prep_server='prep'` with `prep_client=true`, and `game_server='game'` with `game_client=false`.

- **An already-open panel remains actionable after the game phase closes**
  - **Severity**: Medium
  - **File:line**: `public/js/tabs/office-tab.js:184`
  - **Triggering input or sequence**: Open the Office tab during game phase, leave it open while an ST advances/closes the cycle, then click a previously rendered Status Action button.
  - **Observable consequence**: `doAction()` checks only the truthiness of the one-time `liveCycle` snapshot captured at initial wiring and submits. The server rechecks current data and returns 403, so the panel does let the player submit an action the server will reject, contrary to AC4.
  - **Confidence**: High on the stale snapshot and request; medium on whether AC4 was intended to require live revalidation across a phase transition.

#### Low

- **Behavioural phase coverage omits `lower` and the stale-cycle/current-cycle distinction**
  - **Severity**: Low
  - **File:line**: `server/tests/otc-2-office-actions-api.test.js:78`
  - **Triggering input or sequence**: Regress the `lower` entry in `GATED_TYPES`, or leave an old cycle in game while the current/newest cycle is not game.
  - **Observable consequence**: The six-test integration file can remain green: it asserts off-phase behaviour for `raise`, `grant_first`, and `strip_last`, but never submits `lower`, and it deletes only probe-labelled cycles rather than proving that a newer non-game cycle overrides a stale game cycle. The literal all-four AC3 contract and current-cycle semantics are not fully defended.
  - **Confidence**: High.

### 3b

#### High

- **The record's “all ACs implemented” claim is false: a real off-phase request succeeded**
  - **Severity**: High
  - **File:line**: `specs/stories/otc-2-status-actions-server-hardening.md:261`
  - **Triggering input or sequence**: Against local `tm_suite_test`, seed game 910000 as `phase: 'game'`, seed the newer game 910001 as `phase: 'prep'`, then POST `grant_first` through the mounted Express app.
  - **Observable consequence**: The real HTTP response was 201 with `new_status: 1`. Thus AC3 is not implemented for the current cycle despite the record's completion claim (which also miscounts the story's seven ACs as six), and a player can alter City Status outside the current live game.
  - **Confidence**: High. This was reproduced through Supertest against MongoDB, not inferred from source alone; probe records were deleted afterward.

#### Medium

- **The claimed 200/200 regression gate is not reproducible as stated in the available environments**
  - **Severity**: Medium
  - **File:line**: `specs/stories/otc-2-status-actions-server-hardening.md:131`
  - **Triggering input or sequence**: Run the exact 13-file Task 5 command. Against configured Atlas, repeat it twice; then temporarily disable the hardcoded client TLS option and run the same command against the listening local MongoDB and `tm_suite_test`.
  - **Observable consequence**: Both Atlas runs reported 137 passed, 63 skipped, 3 failed suites because outbound MongoDB was denied with `EACCES`. The reachable local run improved this to 177 passed, 23 skipped, 2 failed suites, but the two rule parallel-write suites could not start because the local test DB lacks `rule_derived_stat_modifier` and `rule_disc_attr` seed documents. The record's historical 200/200 may have been obtained against a populated DB, but it is UNVERIFIABLE-AS-STATED here and is not the current gate result.
  - **Confidence**: High on all observed counts; medium on whether the author's earlier environment really had the missing fixtures.

#### Low

- **The record incorrectly says the integration suite covers all four gated action types**
  - **Severity**: Low
  - **File:line**: `specs/stories/otc-2-status-actions-server-hardening.md:118`
  - **Triggering input or sequence**: Remove `lower` from `GATED_TYPES` and run `otc-2-office-actions-api.test.js`.
  - **Observable consequence**: The suite can still pass: it submits off-phase `raise`, `grant_first`, and `strip_last`, but never `lower`. The record's “all four” coverage claim is FALSE even though the current implementation's set does contain all four.
  - **Confidence**: High.

### Validation notes

- **Order and files opened:** I completed and appended 3a before opening any Dev Agent Record content. In 3a I opened only the requested Story, What this story is NOT, Acceptance Criteria, and Dev Notes ranges of `otc-2-status-actions-server-hardening.md`; the complete `otc-2-diff.txt`; and the relevant real code in `server/routes/office-actions.js`, `public/js/tabs/office-tab.js`, `public/js/data/city-status-calc.js`, `public/js/data/accessors.js`, `public/js/data/constants.js`, `public/js/data/helpers.js`, `public/js/downtime/cycle-phase.js`, `public/js/downtime/db.js`, `server/schemas/office_action.schema.js`, `server/routes/downtime.js`, and `server/tests/issue-1001-game-phase-canonical.test.js`. I did not open the Dev Agent Record before 3a was written. In 3b I opened the Dev Agent Record and Tasks/Subtasks ranges, `public/js/auth/discord.js`, `server/db.js`, `server/vitest.config.js`, `server/tests/helpers/setup-env.js`, the named test files via execution, and the referenced seed-script locations.

- **Inspection commands:** `rg --files -g "AGENTS.md"` found no repo instruction file; `rg -n "^#{1,3} " specs/stories/otc-2-status-actions-server-hardening.md` located section boundaries; bounded `Get-Content` calls read only the permitted 3a ranges and later the Dev Agent Record/Tasks ranges; `rg -n "^diff --git|^@@"` plus `Get-Content specs/stories/code-review/otc-2-diff.txt` inspected the diff; bounded line-numbered `Get-Content` and `rg -n` calls inspected the code and call sites listed above. `node --input-type=module` comparing the client and server phase readers returned `{"prep_server":"prep","prep_client":true,"game_server":"game","game_client":false}`. `node --input-type=module -e "await import('./public/js/data/helpers.js')"` returned `helpers import OK`. `public/js/auth/discord.js:9` is exactly `const _LOC = typeof location === 'undefined' ? null : location;`, so the server-import-safety claim is TRUE.

- **Caller research:** Current-tree `rg -n "getGamePhaseCycle\\(" public server` found the definition, the new Office-tab caller, and two test calls. `git grep -n "getGamePhaseCycle(" 9bdd8ad0 -- public server` found only the definition plus the two test calls, so “zero callers anywhere in the app” before this diff is TRUE when tests are correctly excluded from “the app.”

- **New calculator test command:** From `server`, `npx vitest run tests/otc-2-city-status-calc.test.js` passed **10/10 tests in 1/1 file**. The record's 10/10 claim is TRUE.

- **Exact 13-file regression command:** From `server`, I ran the following exact list twice against the configured Atlas URI:

  `npx vitest run tests/otc-2-city-status-calc.test.js tests/feature.691.hos-city-status-power.test.js tests/issue-1141-office-tab-render.test.js tests/issue-1141-office-data-sync.test.js tests/api-st-mods.test.js tests/derived-stat-modifiers-parallel-write.test.js tests/disc-attr-parallel-write.test.js tests/dt-form-territory-fresh-fetch.test.js tests/issue-879-defence-penalty-wirein.test.js tests/issue-937-prereq-fighting-styles.test.js tests/prereq-covenant-status.test.js tests/prereq-same-level-sentinel.test.js tests/stm-path-resolve-sanity.test.js`

  Both runs were identical: **13 files total; 10 passed and 3 failed; 200 tests total; 137 passed and 63 skipped**. The three failed suites were `api-st-mods`, `derived-stat-modifiers-parallel-write`, and `disc-attr-parallel-write`, all at DB setup with `connect EACCES 159.143.141.178:27017`. With the one-line local TLS proof edit and `MONGODB_URI=mongodb://127.0.0.1:27017`, the same command reached MongoDB and produced **13 files total; 11 passed and 2 failed; 200 tests total; 177 passed and 23 skipped**. The remaining two suites reported missing `rule_derived_stat_modifier` and `rule_disc_attr` documents in the local `tm_suite_test`; the test messages' seed-script paths are stale because those scripts now live under `server/scripts/archive/`.

- **New API integration test commands and MongoDB result:** `npx vitest run tests/otc-2-office-actions-api.test.js` against Atlas failed suite setup with **1 failed file, 6 skipped tests, 0 executed**, `connect EACCES 159.143.141.178:27017`. `Test-NetConnection 127.0.0.1 -Port 27017` returned `True`, and a `mongod` process was present. With the normal hardcoded `tls: true`, `$env:MONGODB_URI='mongodb://127.0.0.1:27017'; npx vitest run tests/otc-2-office-actions-api.test.js` failed suite setup with **1 failed file, 6 skipped tests**, `read ECONNRESET`. I then temporarily changed only `server/db.js:31` to `tls: false`, kept Vitest's hard override to `tm_suite_test`, and reran the same local command: **1/1 file passed, 6/6 tests passed**. I therefore could reach MongoDB and execute the previously unexecuted integration suite successfully.

- **Direct current-cycle behavioural probe:** With the same temporary local TLS setting, a one-off Node/Supertest command seeded an older game cycle and a newer prep cycle in `tm_suite_test`, submitted `grant_first`, and printed `{"status":201,"message":null,"new_status":1}`. Its `finally` block deleted both characters, both cycles, and the office action, then closed MongoDB.

- **Named pre-existing failures:** `npx vitest run tests/issue-836-legacy-tracker-cache-removed.test.js tests/n8-mandragora-prereq.test.js` on the current tree produced **2 failed files, 0 tests collected**: the first throws `ENOENT` for missing `public/js/suite/tracker.js`; the second throws `SyntaxError: Invalid or unexpected token`. I did not execute a separate base checkout. `git diff --name-status 9bdd8ad0 --` over both tests, `server/vitest.config.js`, `server/package.json`, and `server/package-lock.json` showed no differences, and `public/js/suite/tracker.js` is missing on both current tree and base. That strongly corroborates the claim, but the exact `git stash` base execution remains not independently reproduced in this pass.

- **Temporary edit restoration and workspace state:** I temporarily changed only `server/db.js:31` for the local runs, restored `tls: true` after each run, and normalised its original CRLF ending. Final checks report no `git status --short -- server/db.js` entry, empty `git diff --exit-code -- server/db.js`, byte length 1935, and matching filtered hashes `67c1b2e91aeab07b156a5bcec80376c79cdabbf1` for worktree and HEAD. The repository was already heavily dirty at the initial status check; I did not alter any pre-existing source/test changes. The only lasting filesystem edit from this pass is the requested append to `specs/stories/code-review/otc-2-codex-findings.md`.

- **Verdict:** **Needs patches; not ready to ship or mark done.** The integration-test question is no longer open in this audit because all 6/6 tests executed and passed locally, so that question itself should no longer block `done`. However, the real 201 response with an older game cycle plus a newer prep cycle proves the central AC3 gate is wrong, and AC4's client/server phase disagreement remains. Fix the current-cycle selection, make the UI use the same canonical phase decision (including transition-time revalidation), and add regression cases before marking the story done. The exact 13-file 200/200 gate also still needs a populated/reachable test DB to reproduce fully.
