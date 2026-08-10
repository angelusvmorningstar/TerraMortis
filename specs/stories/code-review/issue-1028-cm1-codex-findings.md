# Adversarial review — issue-1028-cm1-phase-as-data

## High

### [Pass 2] Feeding can bind to a stale legacy game cycle instead of the real prep cycle

- **Severity**: High
- **File:line**: `public/js/downtime/db.js:176`
- **Triggering input or sequence**: The cycles API returns documents in `_id`-descending creation order. A stale/re-imported legacy cycle with raw `status: 'game'` and no `phase` coexists with the current, higher-`game_number` cycle in `phase: 'prep'`, but the stale document has the newer ObjectId. `getFeedingCycle()` calls `find(isFeedingOpen)`, so both qualify and the stale document wins solely by creation order. The feeding tab then fetches the player's submission for that stale cycle and saves `feeding_vitae_allocation` to it.
- **Observable consequence**: A player can see and update the wrong game's feeding record while the actual prep-cycle submission remains untouched. This can silently corrupt Saturday's live-game feeding data rather than presenting an obvious failure.
- **Confidence**: High; the API sort, predicate behavior, first-match selection, submission lookup, and PUT target were all traced in the live code.

### [Pass 3b] Runtime qualification: stale selection requires a legacy-derived game signal, not raw `status` alone

- **Severity**: High (qualification of the preceding High finding)
- **File:line**: `public/js/downtime/db.js:145`; `public/js/downtime/db.js:176`
- **Triggering input or sequence**: I ran `getFeedingCycle()` with the stale candidate first in API order. `{ status: 'game' }` alone did **not** qualify because the bound `deriveCycleStatus` ignores raw status and returned the legacy sign-off result; the current prep cycle won. Adding the normal/stale legacy override `game_phase: 'game'` made that same older game cycle qualify, and it then beat the higher-`game_number` prep cycle solely because it appeared first by ObjectId order.
- **Observable consequence**: The Pass 2 finding's raw-status-only wording was too broad and remains frozen as required, but the ship-blocking wrong-submission consequence is reproducible for a stale pre-CM-1 `game_phase: 'game'` document—precisely the dual-field legacy shape this codebase supports.
- **Confidence**: High; both variants were executed against the real exported `getFeedingCycle()` with mocked API responses.

## Medium

### [Pass 3a] Two required transition sites bypass the one canonical writer

- **Severity**: Medium
- **File:line**: `public/js/downtime/db.js:60`
- **Triggering input or sequence**: The legacy admin flow calls `closeCycle(id)` or `openGamePhase(id)`. Each function directly builds `phaseWrites(...)` and calls `updateCycle(...)`; neither routes through `setCyclePhase`, contrary to AC 3's “ONE place” and AC 4's explicit inventory.
- **Observable consequence**: Current hard-coded transitions happen to write coherent triples, but the application has three phase-writing implementations rather than one. Validation, mirror changes, or safeguards added to `setCyclePhase` will not cover close/game transitions, recreating the drift surface this story says it eliminates.
- **Confidence**: High. This is a literal AC 3/4 violation and is also confirmed by the write-site search.

### [Pass 3a] Two of AC 6's three named feeding readers were not rewired

- **Severity**: Medium
- **File:line**: `public/js/downtime/db.js:150`; `public/js/app.js:2370`
- **Triggering input or sequence**: `getGamePhaseCycle()` remains game-only and a separate `getFeedingCycle()` was added, despite AC 6 requiring the existing function to become prep-aware. The other named file, `public/js/player.js`, does not exist in either the base commit or working tree; the current player lifecycle indicator in `app.js` was not touched and infers readiness from the next session date while loading submissions only from raw `open`/`active` cycles. During `processing`, it can advertise “Your feeding roll is ready” even though the feeding tab is closed; during prep/game, its `activeCycle` is null under the mirror, so it cannot see that the player already rolled and continues advertising readiness.
- **Observable consequence**: The feeding tab itself opens in prep, but the public lookup contract named by the story remains stale and the current player indicator can be false-positive or remain visible after a completed roll.
- **Confidence**: High for the missing rewires and demonstrated predicates; medium that `app.js` is the intended successor to the story's nonexistent `player.js` indicator.

### [Pass 3a] A present but unknown `phase` bypasses the phase-aware write rules

- **Severity**: Medium
- **File:line**: `public/js/downtime/cycle-phase.js:132`
- **Triggering input or sequence**: The unvalidated ST cycle PUT stores `{ phase: 'feeding', status: 'game' }`, then a player sends a general (non-feeding) submission update. AC 5 says a cycle that has a `phase` field uses `cyclePhase(cycle)` and therefore resolves through the fallback to game, where general edits are locked. `openCycleVerdict` instead requires the raw phase to be known before entering that lane, falls to legacy `status: 'game'`, and allows the general edit.
- **Observable consequence**: A malformed but reachable phase document silently disables the new game-phase restriction on general player edits instead of failing closed or following the canonical reader.
- **Confidence**: High on the behavior and literal AC mismatch; medium on operational likelihood because normal UI writes only known phases.

### [Pass 3b] `confirm-feeding` callers are not restricted to the active downtime cycle

- **Severity**: Medium
- **File:line**: `public/js/tabs/regency-tab.js:72`; `public/js/tabs/downtime-form.js:1420`; `server/routes/downtime.js:119`
- **Triggering input or sequence**: A cycle has raw `status: 'game'`. Both caller selectors include `game` (and legacy `prep`) in their live-status lists, and the endpoint rejects only raw `closed`. A regent can therefore post `/confirm-feeding` against the game cycle. New `phase: 'prep'` avoids this only incidentally because its required mirror is raw `closed`, so it is not selected/reachable through the ordinary player surfaces.
- **Observable consequence**: The Dev Agent Record's “active cycle only” premise is false, and feeding-rights confirmation can still mutate a cycle after the downtime window has ended. The conclusion that new prep does not newly block the intended downtime-phase action is true, but for a different reason than claimed.
- **Confidence**: High; both callers and the endpoint predicate were traced.

### [Pass 2] The admin ribbon gives any stale game override precedence over the current prep cycle

- **Severity**: Medium
- **File:line**: `public/js/admin/cycle-views.js:73`
- **Triggering input or sequence**: A historical cycle still has `game_phase: 'game'` while the intended current cycle is `phase: 'prep', game_phase: 'processing'`. `deriveCurrentCycle()` returns the first `game_phase === 'game'` document before considering any other phase, game number, or current prep state. With prep and downtime cycles but no game override, it likewise chooses whichever phased document has the newest ObjectId rather than the highest `game_number`.
- **Observable consequence**: The ST's cycle ribbon can identify and label the wrong cycle during prep, obscuring the cycle players should be feeding against and making an already-dangerous stale-state condition harder to notice.
- **Confidence**: High for the selection behavior; medium for severity because the ribbon itself does not perform the feed write.

### [Pass 1] `setCyclePhase` lets `extra` overwrite either legacy mirror

- **Severity**: Medium
- **File:line**: `public/js/downtime/db.js:184`
- **Triggering input or sequence**: Any caller invokes `setCyclePhase(cycle, 'prep', { status: 'game' })` or supplies a conflicting `game_phase` in `extra`. The function forms `{ ...writes, ...extra }`, so the caller-controlled fields win. The only call site visible in this pass does not pass `extra`, but the exported API explicitly accepts it.
- **Observable consequence**: One supposedly canonical transition writes a self-contradictory document, defeating the function's advertised never-desync guarantee and exposing phase-aware and legacy consumers to different states.
- **Confidence**: High.

### [Pass 1] `phase_sequence` accepts incomplete and duplicate phase orders

- **Severity**: Medium
- **File:line**: `server/schemas/downtime_submission.schema.js:593`
- **Triggering input or sequence**: An ST creates or updates a cycle with `phase_sequence: ['game']` or `['downtime', 'prep', 'prep', 'game']`. Both satisfy the schema; POST default injection only repairs an absent or empty array. `phaseIndex` then treats the stored array as authoritative.
- **Observable consequence**: The database can persist a malformed phase model in which canonical phases have index `-1` or duplicates create ambiguous ordering. Any ordering control that trusts `phaseIndex` can skip, misorder, or misclassify transitions.
- **Confidence**: High that malformed data is accepted; medium on immediate user impact because no consuming ordering UI is visible in the Pass 1 diff.

## Low

### [Pass 3a] The required five-row canonical-writer test does not test the writer

- **Severity**: Low
- **File:line**: `server/tests/cm1-cycle-phase.test.js:48`
- **Triggering input or sequence**: `setCyclePhase` regresses in its update call, mutation, merge ordering, or null behavior. The “golden transition matrix” executes only `phaseWrites` for four non-null rows, while the null row is a source regex. No test invokes `setCyclePhase` for the five rows required by AC 11.
- **Observable consequence**: The named acceptance gate can remain green even though the exported canonical writer does not produce or persist the promised transition table.
- **Confidence**: High.

### [Pass 3b] The “complete” Suite reader enumeration omits multiple cycle-status consumers

- **Severity**: Low
- **File:line**: `public/js/game/tracker.js:188` (representative)
- **Triggering input or sequence**: Compare the Dev Agent Record's purported exhaustive Suite list with repository searches for `/api/downtime_cycles` consumers and cycle-status predicates. Missing readers include `public/js/game/tracker.js:188`, `public/js/tabs/downtime-tab.js:30-40,116`, `public/js/tabs/story-tab.js:110,183,203-205`, `public/js/tabs/status-ranking.js:15,259-264`, `server/routes/territories.js:115`, and `server/routes/game-sessions.js:42-49`.
- **Observable consequence**: AC 10's required audit artefact is incomplete, so its claim that every downstream consumer was classified cannot be used as evidence that the mirror mapping's blast radius was exhaustively reviewed. The sampled omissions appear mostly correct under the mirror, so this is an audit-gap finding rather than a separate runtime failure.
- **Confidence**: High.

### [Pass 1] Empty player PUTs have phase/legacy parity differences

- **Severity**: Low
- **File:line**: `public/js/downtime/cycle-phase.js:129`
- **Triggering input or sequence**: A non-OOW player sends `PUT /api/downtime_submissions/:id` with `{}`. A phase-aware `game` cycle returns `locked` because `keys.length > 0` is false, while its legacy mirror `{ status: 'game' }` returns `allow`. A phase-aware `processing` cycle and its legacy `{ status: 'closed' }` both lock; downtime and active both allow; prep and its closed mirror both lock. Separately, the handler's `every(...)` deadline test treats the empty body as feeding-only.
- **Observable consequence**: The same no-op request is accepted or rejected depending on whether the cycle has been migrated to the new `phase` field, with the sharpest mismatch in game. This is observable API incompatibility, although an empty update has no useful write payload.
- **Confidence**: High.

### [Pass 1] Junk `phase` values leak into admin labels and CSS classes

- **Severity**: Low
- **File:line**: `public/js/admin/cycle-views.js:16`
- **Triggering input or sequence**: A hand-edited or historical cycle contains `phase: 'feeding'` plus otherwise valid legacy fields. `uiPhase` returns the truthy junk value instead of applying the known-value guard used by `cyclePhase`.
- **Observable consequence**: The admin ribbon renders an undefined phase label with class `cy-phase--feeding`, and none of the phase buttons is highlighted even if the legacy fields identify a valid phase. The player-side canonical reader can simultaneously report a different, valid phase.
- **Confidence**: High.

### [Pass 1] Several wiring tests can pass without the claimed wiring being operative

- **Severity**: Low
- **File:line**: `server/tests/cm1-cycle-phase.test.js:214`
- **Triggering input or sequence**: A regression leaves matching text in a comment, dead helper, or unrelated block while disconnecting live behavior. Examples: the deadline test only searches for `FEEDING_ONLY_FIELDS.includes(k)` anywhere; the admin test independently searches for the phase array and `await setCyclePhase(...)`; the POST test finds an assignment anywhere in the routes file; and the sign-off test takes a source slice that becomes empty if either boundary function is renamed, then passes both negative assertions vacuously.
- **Observable consequence**: The CM-1 suite remains green while route or UI wiring it claims to protect is broken, increasing the chance of shipping a regression in behavior that lacks an integration-level assertion.
- **Confidence**: High for the vacuous/weak pass conditions; medium for likelihood of a future regression taking exactly one of these forms.

## Validation notes

### Pass 1

- Opened only `specs/stories/code-review/issue-1028-cm1-codex-review.md` (the controlling review brief) and `specs/stories/code-review/issue-1028-cm1-diff.txt` (the permitted diff). I did not open the story spec, repository source files, sibling repositories, or any later-pass material.
- Commands run:
  - `Get-Content -LiteralPath 'specs/stories/code-review/issue-1028-cm1-codex-review.md' -Raw` — succeeded.
  - `Get-Content -LiteralPath 'specs/stories/code-review/issue-1028-cm1-diff.txt' -Raw` — succeeded.
- No tests or syntax checks were run in Pass 1 because the pass explicitly limits inspection to the diff.

### Pass 2

- Opened repository context only after Pass 1 was written: `public/js/downtime/db.js`, `public/js/downtime/cycle-phase.js`, the relevant sections of `server/routes/downtime.js`, `public/js/tabs/feeding-tab.js`, `public/js/game/signin-tab.js`, `public/js/admin/cycle-views.js`, `public/js/admin/downtime-views.js`, `public/js/dev-fixtures.js`, `public/js/app.js`, `server/middleware/validate.js`, `server/package.json`, and `server/index.js`. Repository searches also enumerated matching JavaScript paths under `public/js`, `server/routes`, `server/schemas`, and `server/tests`. No `AGENTS.md` was found. I did not open the story spec or Dev Agent Record.
- Commands run (all from the repo root unless noted):
  - `rg --files -g 'AGENTS.md' -g '!specs/stories/issue-1028-cm1-phase-as-data.story.md'` — exit 1, no matching file.
  - `Get-Content -LiteralPath 'public/js/downtime/db.js' -Raw` — succeeded.
  - `Get-Content -LiteralPath 'public/js/downtime/cycle-phase.js' -Raw` — succeeded.
  - `$lines = Get-Content -LiteralPath 'server/routes/downtime.js'; $lines[35..125]; $lines[770..870]` — succeeded.
  - `$lines = Get-Content -LiteralPath 'public/js/tabs/feeding-tab.js'; $lines[90..165]; $lines[1000..1065]` — succeeded.
  - `$lines = Get-Content -LiteralPath 'public/js/game/signin-tab.js'; $lines[60..135]` — succeeded.
  - The first parallel wrapper around the preceding six reads returned an aggregate script error because `rg` exited 1; I reran the same six with `Promise.allSettled`, which exposed the successful reads and the expected no-match result.
  - `$lines = Get-Content -LiteralPath 'public/js/tabs/feeding-tab.js'; $lines[145..245]` — succeeded.
  - `$lines = Get-Content -LiteralPath 'public/js/admin/cycle-views.js'; $lines[45..115]; $lines[225..315]` — succeeded.
  - `rg -n -C 4 "downtime_cycles|fetch\\s*=|window\\.fetch|confirm-feeding" public/js/dev-fixtures.js` — succeeded.
  - `rg -n "getGamePhaseCycle|getFeedingCycle|isInGamePhase|setCyclePhase|openGamePhase\\(|closeCycle\\(|phaseIndex\\(" public/js server --glob '!tests/cm1-cycle-phase.test.js'` — succeeded.
  - `rg -n "cyclesRouter\\.(get|post|put|delete)\\(" server/routes/downtime.js` — succeeded.
  - `rg -n -C 5 "export function validate|function validate" server/middleware/validate.js` — succeeded.
  - `$lines = Get-Content -LiteralPath 'server/routes/downtime.js'; $lines[850..925]` — succeeded.
  - `$lines=Get-Content -LiteralPath 'public/js/dev-fixtures.js'; $lines[16..105]` — succeeded.
  - `Get-Content -LiteralPath 'server/middleware/validate.js' -Raw` — succeeded.
  - `$lines=Get-Content -LiteralPath 'server/routes/downtime.js'; $lines[545..590]` — succeeded.
  - `$lines=Get-Content -LiteralPath 'public/js/admin/downtime-views.js'; $lines[2675..2735]` — succeeded.
  - `rg -n -C 3 "deriveCurrentCycle|byIdDesc|view\\.cycles" public/js/admin/cycle-views.js` — succeeded.
  - The initial PowerShell-quoted raw-status search failed with a parser error at the `!==` pattern; focused searches below replaced it.
  - `rg -n "\\bphase\\b|game_phase|status" public/js server/routes server/schemas --glob '*.js' --glob '!server/tests/**' --glob '!public/js/dev-fixtures.js'` — succeeded (broad/noisy enumeration).
  - `node -e "import('./public/js/downtime/cycle-phase.js').then(m => console.log(Object.keys(m).sort().join(',')))"` — succeeded and printed all nine expected exports.
  - `node --check public/js/downtime/cycle-phase.js` — succeeded with no output.
  - `Get-Content -LiteralPath 'server/package.json' -Raw` — succeeded.
  - `rg -n "node index\\.js|scripts|type" server/package.json server/index.js` — succeeded; confirmed ESM and `node index.js` start path.
  - `rg -n "export async function getFeedingCycle|find\\(c => isFeedingOpen|function deriveCurrentCycle|const anyPhase|function uiPhase|const updates = \\{ \\.\\.\\.writes|phase_sequence:" public/js/downtime/db.js public/js/admin/cycle-views.js server/schemas/downtime_submission.schema.js` — succeeded.
  - `$lines=Get-Content -LiteralPath 'public/js/app.js'; $lines[2035..2085]; $lines[2345..2420]` — succeeded.
  - `rg -n "cycles?\\.(find|filter|sort)|allCycles|DT_CYCLES|downtime_cycles" public/js server/routes --glob '*.js' | Select-String -Pattern "status|game_phase|phase"` — succeeded.
  - `rg -n --glob '*.js' --glob '!server/tests/**' "c\\.status === '(active|open|closed|game|prep)'|c\\.status !== '(active|open|closed|game|prep)'|cycle\\.status === '(active|open|closed|game|prep)'|cycle\\.status !== '(active|open|closed|game|prep)'" public/js server` — succeeded.
- Pass 2 behavioral conclusions with no finding: the prep feeding allocation path reaches the phase verdict with every projected field it reads, passes the handler's feeding-only deadline carve-out, and reaches `$set`; an OOW general edit has the same deadline-dependent result in both phase and legacy lanes; prep bypasses rather than trips the #537 fallback; sign-in deliberately selects the highest-`game_number` closed/prep cycle; null-clear ends with coherent fields because `deriveCycleStatus` ignores `phase`; POST's injected sequence is schema-legal; route ordering is not shadowed; the browser-adjacent module imports from the repo-root/server start arrangement; existing cycle PUTs fall through the fixture interceptor as before; and prep → processing → clear → game mutates the row object used by button/ribbon refreshes without closure leakage.

### Pass 3a

- Opened only the permitted pre-record portions of `specs/stories/issue-1028-cm1-phase-as-data.story.md`: Story, Acceptance Criteria, Tasks/Subtasks, and Dev Notes. I first located section boundaries, then read lines 15–128 and 147–231; I did not read the Symon hand-test section or any part of the Dev Agent Record. I then opened/searched the named implementation and test surfaces needed to audit those criteria: `public/js/app.js`, `public/js/downtime/db.js`, `public/js/admin/cycle-views.js`, `public/js/admin/downtime-views.js`, and `server/tests/cm1-cycle-phase.test.js`. The AC-named `public/js/player.js` could not be opened because it does not exist in the working tree or base commit.
- Commands run:
  - `rg -n "^## " 'specs/stories/issue-1028-cm1-phase-as-data.story.md'` — succeeded; located the Dev Agent Record at line 232 without reading its contents.
  - `$lines = Get-Content -LiteralPath 'specs/stories/issue-1028-cm1-phase-as-data.story.md'; $lines[14..127]; $lines[146..230]` — succeeded; read only the four permitted sections.
  - `$lines=Get-Content -LiteralPath 'public/js/player.js'; $lines[430..470]` — failed because the file does not exist.
  - `rg -n -C 4 "setCyclePhase|five-row|null row|golden transition" server/tests/cm1-cycle-phase.test.js server/tests` — succeeded.
  - `git diff 77bd3d0d -- public/js/player.js public/js/downtime/db.js public/js/admin/cycle-views.js public/js/admin/downtime-views.js` — succeeded (with a non-fatal global-ignore permission warning); confirmed no `player.js` diff and exposed all named write changes.
  - `rg -n "phase\\s*:|game_phase\\s*:|phaseWrites\\(|setCyclePhase\\(" public/js server/routes --glob '*.js' --glob '!server/tests/**' --glob '!public/js/dev-fixtures.js'` — succeeded.
  - `rg --files | rg '(^|[\\\\/])player\\.js$|player'` — succeeded; found player-related files but no `public/js/player.js`.
  - `rg -n -C 5 "cycle-open|cycleOpen|feeding.*open|open.*feeding|getGamePhaseCycle|getFeedingCycle" public --glob '*.js' --glob '*.html'` — succeeded but was very broad/noisy due fixture and content text.
  - `git ls-tree -r --name-only 77bd3d0d | rg '(^|/)player\\.js$'` — exit 1, confirming no base-commit `player.js`.
  - `(Get-Content -LiteralPath 'server/tests/cm1-cycle-phase.test.js').Count` — succeeded (268 lines).
  - `git status --short` — succeeded, showing the pre-existing dirty implementation/story/tracking changes, extensive unrelated untracked scratch artefacts, and this review output.
  - `git ls-tree -r --name-only 77bd3d0d -- public | rg 'player\\.js$'` — exit 1, independently confirming the missing base path.
  - `rg -n -C 4 "cycle-open|getGamePhaseCycle|getFeedingCycle|Feeding card|feedingOpen" public/js --glob '*.js' --glob '!dev-fixtures.js'` — succeeded; identified the current indicator in `public/js/app.js`.
  - `git status --short --untracked-files=no` — succeeded; listed only the user's tracked implementation/story/tracking changes.
  - `git status --short -- 'specs/stories/code-review/issue-1028-cm1-codex-findings.md' 'server/_probe-cycles.mjs'` — succeeded; showed the required review output and the explicitly excluded probe as untracked.
- Pass 3a spec conclusions with no new finding: schema enums and POST injection satisfy their literal wording; the pure module has no imports/globals; null-clear semantics are coherent; the tracker reset remains game-only; prep uses the ruled processing/closed mirror; sign-off/manual-open appear untouched in the scoped diff; tasks 10/11 are deploy-gated; and Pass 1's arbitrary/duplicate-sequence risk is not a literal AC 1 violation because AC 1 specifies only the item enum, although the earlier risk finding remains frozen.

### Pass 3b

- Opened the Dev Agent Record only after Pass 3a was written. Also opened the specifically authorised sibling context: `../TM Cockpit/scripts/set-cycle-deadline.mjs`, `../TM Wiki/server/downtime-cycle-phase.js`, and the Wiki gate it directly names/imports, `../TM Wiki/server/downtime-cycle-gate.js`. Cockpit verification used read-only grep over the explicitly permitted `lib/`, `scripts/`, and `server.mjs`; no sibling file was modified.
- Commands run and actual results:
  - `$lines = Get-Content -LiteralPath 'specs/stories/issue-1028-cm1-phase-as-data.story.md'; $lines[231..($lines.Count-1)]` — succeeded; read the Dev Agent Record in full.
  - From `server/`: `npx vitest run tests/cm1-cycle-phase.test.js tests/derive-cycle-status.test.js tests/epic.708.1-cycle-schema-api.test.js` — **3 test files passed; 80/80 tests passed**.
  - From `server/`: `npx vitest run tests/epic.708.3-cycle-phase-controls.test.js` — **1 file failed; 3 failed | 11 passed (14)**. Failures were exactly `exports setGamePhase function`, `uses data-phase attribute on phase buttons`, and `highlights active phase with gold2 colour`. This matched the documented stale set, so no repeat was required.
  - From `server/`: `npx vitest run tests/cm1-cycle-phase.test.js` — **1 file passed; 46/46 tests passed**.
  - `node --check public/js/admin/cycle-views.js` — exit 0, no output.
  - `node --check public/js/admin/downtime-views.js` — exit 0, no output.
  - `node --check public/js/downtime/db.js` — exit 0, no output.
  - `node --check public/js/tabs/feeding-tab.js` — exit 0, no output.
  - `node --check server/routes/downtime.js` — exit 0, no output.
  - `node --check server/schemas/downtime_submission.schema.js` — exit 0, no output.
  - `node --check public/js/downtime/cycle-phase.js` — exit 0, no output.
  - In-memory base/working function comparison using `git show 77bd3d0d:public/js/downtime/db.js` and `public/js/downtime/db.js` — `signoffPhase` identical, 498/498 normalised characters. The first `setManualOpen` extraction used a bad PowerShell newline marker and produced empty blocks plus substring errors, so that result was invalid; the corrected comparison was run twice and both runs reported `identical=True`, 988/988 characters for the region ending at `isInGamePhase`.
  - `rg -n -F -e "status === 'game'" -e 'status === "game"' -e "status == 'game'" -e 'status == "game"' -e 'game_phase' -e 'phase_sequence' '../TM Cockpit/lib' '../TM Cockpit/scripts' '../TM Cockpit/server.mjs'` — succeeded; the only exact hit was the display echo in `scripts/set-cycle-deadline.mjs:81,86`.
  - `rg -n "downtime.?cycles?|cycle.*status|status.*cycle|feeding" '../TM Cockpit/lib' '../TM Cockpit/scripts' '../TM Cockpit/server.mjs'` — succeeded; broader cycle tooling exists, including active-cycle selectors, but no `status === 'game'` coupling was found.
  - `Get-Content -LiteralPath '../TM Wiki/server/downtime-cycle-phase.js' -Raw` — succeeded; confirmed verbatim nullish-coalescing read and the stale `'feeding'` constant.
  - `Get-Content -LiteralPath '../TM Wiki/server/downtime-cycle-gate.js' -Raw` — succeeded; confirmed only `'downtime'` opens the form.
  - `node -e "import('../TM Wiki/server/downtime-cycle-gate.js')...formOpenFor({phase:'prep',...})"` — exit 0; printed `{"open":false,"reason":"cycle_closed"}`, verifying the Wiki claim at runtime.
  - `rg -n -C 6 "confirm-feeding" public/js server --glob '*.js' --glob '!server/tests/**'` and the narrower `rg -n -C 8 "confirm-feeding" public/js --glob '*.js' --glob '!dev-fixtures.js'` — succeeded; found the two production callers.
  - `$lines=Get-Content -LiteralPath 'public/js/tabs/regency-tab.js'; $lines[50..90]; $lines[500..540]` and `$lines=Get-Content -LiteralPath 'public/js/tabs/downtime-form.js'; $lines[1390..1445]; $lines[1635..1685]; $lines[5105..5150]` — succeeded; disproved the active-only caller claim.
  - Enumeration searches: `rg -n "downtime_cycles|game_phase|deriveCycleStatus|getGamePhaseCycle|isInGamePhase|\\.status" public/js server/routes --glob '*.js' --glob '!server/tests/**' --glob '!public/js/dev-fixtures.js'`; `rg -n "apiGet\\('/api/downtime_cycles|fetch\\([^\\r\\n]*downtime_cycles|getCycles\\(\\)" public/js --glob '*.js' --glob '!dev-fixtures.js'`; and `rg -n "downtime_cycles|cycles\\(\\)" server/routes --glob '*.js'` — succeeded; the first was broad/noisy, while the latter two provided the consumer inventory.
  - Follow-up reads/searches of `public/js/game/tracker.js`, `public/js/tabs/downtime-tab.js`, `public/js/tabs/archive-tab.js`, `public/js/tabs/status-ranking.js`, `public/js/tabs/story-tab.js`, `public/js/admin/downtime-story.js`, `server/routes/territories.js`, and `server/routes/game-sessions.js` — succeeded and confirmed the named omissions. The sampled omitted consumers appear correct under the prep→closed mirror.
  - `Get-Content` of `public/js/data/api.js:1-46` — succeeded to prepare executable client-module probes.
  - Mocked runtime `getFeedingCycle()` probe with stale `{status:'game'}` first and current prep second — exit 0, selected `current` game 7 (raw status alone does not qualify through bound `deriveCycleStatus`).
  - The same probe with stale `{status:'game', game_phase:'game'}` — exit 0, selected `stale` game 5, reproducing the High defect.
  - Runtime pure-module probe for `{phase:'feeding',status:'game'}` — exit 0, printed `{"canonical":"game","verdict":"allow"}`, confirming the unknown-phase gate mismatch.
  - Runtime `setCyclePhase(cycle,'prep',{status:'game'})` probe with mocked fetch — exit 0; both sent and local objects were `{phase:'prep',game_phase:'processing',status:'game'}`, confirming the override hole.
  - Runtime Ajv checks for `phase_sequence: ['game']` and `['downtime','prep','prep','game']` — both reported `valid:true`.
  - `git status --short --branch --untracked-files=no`, `git rev-parse HEAD`, and merge-base checks — succeeded; branch is `cm/issue-1028-phase-as-data`, HEAD/base is `77bd3d0d`, and `8ff0acf1` is an ancestor. No source file was changed by the review.
- Dev Agent Record claim audit:
  - **TRUE**: 80/80 combined gate; 46/46 CM-1-only gate; exact 3/11 stale UI-test split; all seven `node --check` results; `signoffPhase`/`setManualOpen` unchanged; no Cockpit `status === 'game'` coupling beyond the display echo; Wiki prep fails safe.
  - **FALSE/OVERSTATED**: `closeCycle`/`openGamePhase` “both now rewired” (they triple-write but bypass `setCyclePhase`); “no feeding indicator reader remains” (`app.js:2399-2402` is one and is not phase-aware); “the enumeration is complete” (named omissions above); and “confirm-feeding callers operate on the active cycle only” (both admit raw game/legacy prep).

### Anything not run

- The full test suite was intentionally not run because the brief states it silently skips database-dependent coverage and contains unrelated permanent failures; it is not an authorised substitute for the targeted gates.
- Symon's production hand-test and Tasks 10/11 were not run because they are explicitly deploy/approval-gated.
- No live MongoDB/server integration was run; the required gates are DB-free, and the review brief warns that mongod is absent. The real route path was traced statically and its pure decisions/client selection were executed with mocked inputs.
- `public/js/player.js` could not be opened or checked because it does not exist in either HEAD or base commit.

### Ship assessment

- **Blocking problem; do not ship as-is.** Patch and regression-test feeding-cycle selection so it uses game order/current-cycle semantics rather than API/ObjectId order (including coexistence with a stale legacy `game_phase:'game'` cycle) before Wednesday's deploy. The canonical-writer bypass and malformed-phase gate should also be patched; the incomplete audit artefact and test gaps should be corrected before sign-off.

### Final integrity check

- `rg -n "^## |^### \\[Pass|^### Validation|^### Anything|^### Ship" specs/stories/code-review/issue-1028-cm1-codex-findings.md` — succeeded; confirmed the required severity grouping, pass tags, validation section, gaps, and ship assessment.
- `git status --short --untracked-files=no` — showed the same scoped implementation/story/tracking modifications supplied for review; no tracked file was modified by this review. Git emitted the pre-existing global-ignore permission warning.
- `git status --short -- specs/stories/code-review/issue-1028-cm1-codex-findings.md server/_probe-cycles.mjs` — showed only the required findings file and the brief's explicitly excluded probe as untracked.
- The findings file measured 232 lines / 31,286 characters before this final integrity note.
- I did not temporarily edit any implementation file. The only file created or modified by this review is `specs/stories/code-review/issue-1028-cm1-codex-findings.md`; no restore was necessary, and the final status contains no unintended review change.
