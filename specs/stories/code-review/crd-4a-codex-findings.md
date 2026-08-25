# Adversarial review findings — crd-4a

## High

### [Pass 2] A persisted `NaN` bypasses `/accept`'s null guard and becomes a zero-die defence

- **Severity:** High
- **File:line:** `server/routes/contested-rolls.js:269,288,333-343`
- **Triggering input or sequence:** An otherwise eligible defender document has a truthy non-numeric `blood_potency` such as `"unknown"`, the defender resolves with the exact valid term `"bp"`, and then calls `/accept`.
- **Observable consequence:** `/resolve` concatenates the base number and string, the clamp produces `NaN`, and Mongo can retain that numeric value. Although JSON serialization displays it as `null`, `NaN == null` is false, so `/accept` treats it as resolved; `_roll(NaN)` produces no dice and silently resolves a zero-die defence. A Node reproduction confirmed the clamp result, serialized-null appearance, false null guard, and zero loop iterations.
- **Confidence:** High for the control flow and JavaScript behavior; Medium-High for reachability because normal character API writes schema-constrain Blood Potency to an integer, while legacy/direct Mongo corruption remains possible.

_No Pass 3a high-severity findings._

- [Pass 1] None found.

## Medium

### [Pass 3a] The new defender-owned field violates the story's untouched-POST boundary

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:35-53`; `specs/stories/crd-4a-defensive-status-choice.md:289-292`
- **Triggering input or sequence:** The attacker includes a schema-valid `defender_status_term` in challenge creation before the defender resolves anything.
- **Observable consequence:** The story says POST is untouched and describes this as a field the resolved challenge persists alongside the defender's other choices. Because the schema change silently expands what POST accepts and the strip list omits the new field, an attacker can write the defender's purported selection. This is a literal trust-boundary deviation, not merely an undocumented response field.
- **Confidence:** High.

### [Pass 3a] Closed-gate responses violate AC1's byte-for-byte requirement

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:267-321`; `specs/stories/crd-4a-defensive-status-choice.md:41-51,86-103`
- **Triggering input or sequence:** Resolve a non-power contest or any power contest whose game/attendance/status gate is closed.
- **Observable consequence:** AC1 says the response is byte-for-byte what crd.3a returned, but the route stores and returns `defender_status_term: null`. AC4 simultaneously asks for null in the normal gate-never-open case, so the specification is internally tense; the implementation chose AC4 and violates AC1's literal response wording.
- **Confidence:** High.

### [Pass 2] The attacker can pre-populate the defender's new choice through POST

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:35-53`; `server/schemas/contested_roll_request.schema.js:62-68`
- **Triggering input or sequence:** A challenger creates a contested-roll request with `defender_status_term: "bp"` or `"city"` in the POST body. The newly expanded schema accepts it, `doc = { ...req.body }` copies it, and the existing trust-boundary cleanup deletes only `defender_aspect`, `defender_wp_spent`, and `defender_merit_ids`.
- **Observable consequence:** Before the defender has interacted, the stored pending document falsely records a defender-owned selection authored by the attacker. A later `/resolve` currently overwrites it, so this does not directly alter the final pool, but it violates the route's established ownership boundary and creates incorrect persisted/audit state for any consumer reading the pending request.
- **Confidence:** High from the complete POST handler and schema.

### [Pass 2] The gate's “latest session” query can select a future or nondeterministic session

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:134-137`; `server/routes/office-actions.js:31-43`
- **Triggering input or sequence:** A future game-session document exists, or two sessions share the same `session_date`, while a power contest is resolved during an active game phase. The new gate sorts every session only by `session_date: -1`. The repository's explicitly documented single source of truth for the current game session instead filters `session_date <= today` and adds `_id: -1` as a deterministic tie-breaker.
- **Observable consequence:** Attendance can be checked against a scheduled future session rather than the current game, incorrectly closing or opening the City Status gate. Same-date records can make the answer implementation-dependent. The new DB fixtures also delete only sessions at or before today, so an unrelated future fixture can make the suite exercise the wrong document.
- **Confidence:** High that the selectors diverge; high that future sessions produce the stated selection, medium on how commonly future sessions exist in production.

### [Pass 2] The non-gated resolve path is not byte-for-byte unchanged

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:259-321`
- **Triggering input or sequence:** Resolve any ordinary challenge with no `power_name` and compare the resulting write/response with base commit `30468501db0c28a63310358524a992b68e953d49`.
- **Observable consequence:** The base route wrote only `defender_pool`, `defender_aspect`, `defender_wp_spent`, `defender_merit_ids`, and `updated_at`. The new route additionally writes `defender_status_term: null`, so every ordinary contested-roll document and response acquires a new field. Pool calculation and the existing fields remain equivalent, and the gate performs no DB query after its initial power check, but exact persisted/response shape compatibility is broken for all contests.
- **Confidence:** High; verified directly against `git show` for the named base commit.

### [Pass 1] Missing defender identity can match an identity-less attendance row

- **Severity**: Medium
- **File:line**: `server/routes/contested-rolls.js:143`
- **Triggering input or sequence**: A power challenge reaches `_statusChoiceEligibility` with `challenge.target_character_id` missing and a defender character whose `name` is also missing/empty, while the latest session contains an `{ attended: true }` row with no `character_id` (or both sides use the same empty ID representation). `attendedIn` evaluates `String(a.character_id) === String(charId)`, so two missing values both become the string `"undefined"` and match.
- **Observable consequence**: The defender-attendance half of the eligibility gate can pass without an attendance row identifying that defender. If the challenger and status checks pass, the endpoint offers and applies a bonus that should have remained gated off.
- **Confidence**: Medium. The equality flaw is definite in the diff; Pass 1 was intentionally not allowed to inspect whether earlier route checks make a missing target ID unreachable.

### [Pass 1] A non-numeric Blood Potency can persist `NaN` as the defender pool

- **Severity**: Medium
- **File:line**: `server/routes/contested-rolls.js:174`, `server/routes/contested-rolls.js:268`, `server/routes/contested-rolls.js:285`
- **Triggering input or sequence**: An otherwise eligible defender document has a truthy non-numeric `blood_potency` such as `"unknown"`, and the request supplies the exact valid term `defender_status_term: "bp"`. The base numeric pool is concatenated with the string; the final clamp then executes `Math.max(0, Math.min(30, <non-numeric>))`.
- **Observable consequence**: The clamp produces `NaN`, and no finite-number guard prevents that value from being written as `defender_pool`. The response/database can therefore violate the schema's stated 0–30 numeric domain. A `NaN` produced inside either City Status calculation does not reach this point because `defenderStatus > challengerStatus` is then false; the newly exposed BP path remains vulnerable.
- **Confidence**: High from direct JavaScript semantics and the shown write path.

### [Pass 1] Gate-closed resolves are not document-shape preserving

- **Severity**: Medium
- **File:line**: `server/routes/contested-rolls.js:276`
- **Triggering input or sequence**: Any ordinary challenge with no `power_name` is resolved, with or without a caller-supplied `defender_status_term`.
- **Observable consequence**: Although the supplied term cannot influence the pool and cannot be copied through, every such resolve now `$set`s `defender_status_term: null`; the subsequent `findOne` response consequently contains that new field. Existing non-gated documents are mutated and responses change shape, contradicting the diff comment that this path falls through unchanged and the trust-boundary requirement that the non-gated path remain byte-for-byte unchanged.
- **Confidence**: High. The unconditional `$set` and post-update response are explicit in the diff.

## Low

### [Pass 3a] AC6 literally forbids the selected `.on` state that the implementation renders

- **Severity:** Low
- **File:line:** `public/js/game/contested-resolve.js:346-356`; `specs/stories/crd-4a-defensive-status-choice.md:118-122`
- **Triggering input or sequence:** The player selects `bp` or `city` and the next gate-open response renders.
- **Observable consequence:** The chosen button receives `class="on"`. That is sensible and matches the story's selected-state styling decision and mockup, but AC6 says neither option carries `.on` "on render, ever," not merely on the initial/unselected render. The code therefore fails the criterion's literal wording.
- **Confidence:** High; this appears to be an AC wording defect rather than undesirable UI behavior.

### [Pass 3a] AC9 says the next request omits the term, but the client sends it as null

- **Severity:** Low
- **File:line:** `public/js/game/contested-resolve.js:198-203,217-223`; `specs/stories/crd-4a-defensive-status-choice.md:139-143`
- **Triggering input or sequence:** Select a term, receive a later gate-closed response, then make another resolve-triggering choice.
- **Observable consequence:** State is correctly discarded, but the body always contains `defender_status_term: null`; it does not "simply omit" the field as AC9 literally requires. The server currently treats null like omission, so the practical effect is equivalent.
- **Confidence:** High.

### [Pass 3a] AC10's literal token-only rule is not met for spacing and font values

- **Severity:** Low
- **File:line:** `public/css/suite.css:2574-2603`; `specs/stories/crd-4a-defensive-status-choice.md:144-147`
- **Triggering input or sequence:** Inspect the new CSS against AC10's statement that every colour, spacing, and font value is an existing `theme.css` token.
- **Observable consequence:** Colours and font families use variables and the added block has no hex/rgba literal, but spacing and typography include raw values such as `3px`, `2px`, `10px 4px`, `52px`, `12px`, `15px`, `9px`, and numeric font weights. The code matches the locked mockup, but not AC10's broader literal token-only wording.
- **Confidence:** High on the textual mismatch; medium that the AC intended to constrain anything beyond colours/tokens already used by the mockup.

### [Pass 3a] AC12 still requests a disabled-Roll test after AC8's correction

- **Severity:** Low
- **File:line:** `specs/stories/crd-4a-defensive-status-choice.md:129-138,152-166`; `server/tests/crd-3b-resolution-screen.test.js:521-536`
- **Triggering input or sequence:** Compare corrected AC8 and its test with AC12's required coverage list.
- **Observable consequence:** AC8 and the implementation deliberately keep the button enabled, while AC12 still calls the expected state "placeholder/disabled-Roll." The test correctly asserts not disabled, but the story text was not fully corrected and its acceptance criteria contradict each other.
- **Confidence:** High.

### [Pass 3a] Task 9 claims nine new client tests, but the diff adds eight

- **Severity:** Low
- **File:line:** `specs/stories/crd-4a-defensive-status-choice.md:212-216`; `server/tests/crd-3b-resolution-screen.test.js:455-604`
- **Triggering input or sequence:** Count added `it(...)` cases in the client test diff.
- **Observable consequence:** The task checklist overstates the added client cases by one (3 gate render + 2 unselected/higher + 2 selection/placeholder + 1 gate-close = 8). This makes the completion checklist and expected suite arithmetic harder to audit.
- **Confidence:** High; verified with `git diff` and a count of added test declarations.

### [Pass 3a] Pass 2's future-session behavior follows the story's mandated legacy selector

- **Severity:** Low
- **File:line:** `specs/stories/crd-4a-defensive-status-choice.md:92-99,231-240`; `server/routes/contested-rolls.js:134-137`
- **Triggering input or sequence:** Compare the implementation with the now-visible AC1/Dev Notes rather than the repository's newer `office-actions.js` current-session helper.
- **Observable consequence:** The code exactly mirrors `attendance.js`'s unfiltered, single-key sort as the story explicitly commands. Thus the Pass 2 future/tie issue is not an implementation deviation; it is a risk inherited by the specified mechanism and by the story's simultaneous use of the phrase "current game session."
- **Confidence:** High. This intentionally does not revise the frozen Pass 2 finding.

### [Pass 2] Pass 1's missing-ID attendance concern is blocked by earlier route guards

- **Severity:** Low
- **File:line:** `server/routes/contested-rolls.js:169-191,145-152`
- **Triggering input or sequence:** Attempt to send a challenge with an absent/empty target ID or challenger ID through the real `/resolve` handler.
- **Observable consequence:** Contrary to the closure-only concern recorded in Pass 1, a missing target cannot pass the ownership comparison and an invalid target cannot pass `new ObjectId`; an absent/invalid challenger ID makes its `ObjectId` construction return gate-closed. The unsafe sentinel comparison remains locally present but is not reachable end to end through this handler under ordinary `req.user.character_ids` values.
- **Confidence:** High after reading the full route. This intentionally does not revise the frozen Pass 1 observation.

### [Pass 2] The status-choice client mocks are deliberately partial, not field-for-field server responses

- **Severity:** Low
- **File:line:** `server/tests/crd-3b-resolution-screen.test.js:455-604`
- **Triggering input or sequence:** Compare each new `apiRaw` success mock with a real `/resolve` response, which is the complete Mongo request document plus an ephemeral `status_choice` when eligible.
- **Observable consequence:** Most mocks contain only `defender_pool` and `status_choice` and omit the document's IDs, status, existing defender fields, and usually `defender_status_term`. This is sufficient for the client's current reads, but it cannot detect accidental coupling to an unrealistic response shape or prove field-for-field client/server integration.
- **Confidence:** High.

### [Pass 2] The traced status-term race is correctly rejected as stale

- **Severity:** Low
- **File:line:** `public/js/game/contested-resolve.js:188-228`; `server/tests/crd-3b-resolution-screen.test.js:342-364`
- **Triggering input or sequence:** With a previously rendered status picker, an aspect click starts call A (`gen = n`), a status-term click starts call B (`gen = n+1`), B returns and updates the pool/choice, then A returns.
- **Observable consequence:** A fails `gen !== _resolveGen` at line 208 before touching any state, so it cannot overwrite B. The crd-4a-specific added test is sequential as Pass 1 noted, but the pre-existing crd-3b test does exercise the same whole-response generation guard with out-of-order promises. Therefore the production race is not a defect on the inspected path.
- **Confidence:** High from the hand trace and existing race test. This intentionally leaves the narrower Pass 1 test-quality finding standing.

### [Pass 1] Power-based resolves add several uncached database reads

- **Severity**: Low
- **File:line**: `server/routes/contested-rolls.js:131`, `server/routes/contested-rolls.js:138`, `server/routes/contested-rolls.js:153`, `server/routes/contested-rolls.js:162`
- **Triggering input or sequence**: Any resolve whose `power_name` is a non-empty string reads all chapters. If game mode is active it additionally reads the latest session; if a session exists it fetches the challenger; and only after both attendance checks does it read territories.
- **Observable consequence**: Power-based contested-roll UI interactions can repeat up to four database reads on every aspect, Willpower, merit, or status-term click, increasing latency and load even when a later eligibility condition closes the gate. Contrary to the review prompt's deliberately adversarial formulation, all four queries do not run on every truthy `power_name`: the implementation does short-circuit between stages. The comments make the tradeoff partly deliberate, but do not quantify or mitigate repeated calls.
- **Confidence**: High.

### [Pass 1] The new server test introduces unused state and an unused hook import

- **Severity**: Low
- **File:line**: `server/tests/crd-4a-defensive-status-choice.test.js:24`, `server/tests/crd-4a-defensive-status-choice.test.js:35`, `server/tests/crd-4a-defensive-status-choice.test.js:48`
- **Triggering input or sequence**: Load the new test module.
- **Observable consequence**: `beforeEach` is imported but never called, while `seededCharIds` is populated on every seeded character and never read. This is dead test code introduced by the change and can mislead a future maintainer into believing per-test cleanup exists.
- **Confidence**: High.

### [Pass 1] No trivially satisfiable new assertion or unescaped new HTML interpolation was found

- **Severity**: Low
- **File:line**: `server/tests/crd-3b-resolution-screen.test.js:452`, `server/tests/crd-4a-defensive-status-choice.test.js:1`, `public/js/game/contested-resolve.js:338`
- **Triggering input or sequence**: Static inspection of every assertion and new dynamic interpolation visible in the diff.
- **Observable consequence**: None; this records a negative result required by the review brief. New character-name and numeric interpolations are passed through the existing escaping helpers, strict equality admits only `"bp"`/`"city"`, missing/invalid eligible terms yield a 200 response with a null pool, and `status_choice` is attached only after the database round-trip rather than persisted by any write shown in the diff.
- **Confidence**: High within the deliberately diff-only scope of Pass 1.

### Pass 2 frozen branch audit

- Non-game current chapter: `_statusChoiceEligibility` reads `chapters` and returns before touching `game_sessions`, `characters` for the challenger, or `territories`. Empty `game_sessions`: `toArray()` yields `[]`, `sessions[0] || null` yields `null`, and the gate closes cleanly.
- Validation order remains aspect first, then Willpower type, then defender ID/character lookup, base pool/WP/merits, and only then the new gate. Invalid aspect or non-boolean Willpower cannot reach the new queries.
- A previously selected client term is reset on remount. A successful gate-closed resolve clears both `state.statusChoice` and `state.statusTerm`; the server ignores the submitted value outside the `statusChoice` branch and overwrites the stored field with `null`.
- `findRegentTerritory` receives the expected `(territoriesArray, fullCharacterDocument)` shape for both parties, and `calcEffectiveCityStatus` receives each full character plus ambience/null. Normal character writes constrain Blood Potency and City Status to integers, narrowing—but not eliminating for legacy/direct database corruption—the Pass 1 `NaN` case.
- The client generation check protects rendered state, but it does not order the two server-side document writes; the resulting high-severity race is recorded below.

# Pass 2 — Edge Case Hunter (frozen)

## High

### [Pass 2] The UI race guard cannot stop an older `/resolve` from overwriting the newer choice in Mongo

- **Severity**: High
- **File:line**: `public/js/game/contested-resolve.js:157-160`, `public/js/game/contested-resolve.js:188-228`, `server/routes/contested-rolls.js:262-304`
- **Triggering input or sequence**: The status-choice section is already visible with no term selected. The player changes aspect, starting request A with `defender_status_term: null`; before A returns, they click `city`, starting request B with `defender_status_term: "city"`. B overtakes A and returns first, so its `updateOne` stores the final City pool and the client accepts B because its generation is newer. A then reaches its own unconditional `updateOne` and stores `defender_pool: null` and `defender_status_term: null`; only A's response is discarded by `gen !== _resolveGen`.
- **Observable consequence**: The screen can show B's valid pool and selected City term while the database contains A's older unresolved state, so Roll produces the server's 409. Worse, B sets `state.resolving = false` while A is still in flight, so the player can call `/accept` before A writes; A can then overwrite pool/choice fields on the already-resolved document after the dice outcome was computed. The generation counter protects client state only and provides no ordering or pending-status condition on the server writes.
- **Confidence**: High that the interleaving is possible from the actual client and that the server writes are unconditional; the frequency depends on request timing.

## Medium

### [Pass 2] The attacker can populate the new defender-only choice during challenge creation

- **Severity**: Medium
- **File:line**: `server/schemas/contested_roll_request.schema.js:62-68`, `server/routes/contested-rolls.js:31-51`
- **Triggering input or sequence**: The challenger sends a valid `POST /api/contested_roll_requests` body containing `defender_status_term: "city"` or `"bp"`. The newly widened schema accepts it, the route spreads all of `req.body` into `doc`, and the defender-field scrub list removes only `defender_aspect`, `defender_wp_spent`, and `defender_merit_ids`.
- **Observable consequence**: A pending document and the POST response can claim that the defender chose a status term before the defender has acted. A later `/resolve` overwrites it, so this does not by itself change the computed roll, but it violates the field's provenance at the trust boundary and exposes forged defender-authored state to every reader before resolution. A direct Ajv run confirmed the creation schema accepts the concrete body.
- **Confidence**: High.

### [Pass 2] “Current session” can actually mean a scheduled future session or an unrelated cycle

- **Severity**: Medium
- **File:line**: `server/routes/contested-rolls.js:136-167`, `server/routes/game-sessions.js:75-83`, `server/tests/crd-4a-defensive-status-choice.test.js:91-109`
- **Triggering input or sequence**: The current chapter is in `game`, today's session records both parties attended, and a later-dated game-session document already exists for a future event. The gate sorts the entire collection by `session_date: -1` with no `session_date <= today` filter and no `game_number` correlation to the current cycle, so it evaluates the future document instead. Same-date ties also have no `_id` tiebreaker.
- **Observable consequence**: A valid at-Court defender can lose the choice because the future session has empty/false attendance, or the gate can open from future attendance rather than the active session. The test helpers do not isolate this case: `seedSession` and `seedNoSession` delete only rows at or before today, leaving precisely the future rows that outrank their fixture and making “no game session exists at all” untrue in a populated test database. The repository's own `getNextSession` demonstrates that future session documents are a supported shape, while `office-actions.js`'s current-session lookup filters at or before today.
- **Confidence**: High for the query behavior and fixture gap; high that future sessions are legitimate repository data; medium on how often production pre-creates them.

### [Pass 2] The non-gated path is not byte-for-byte unchanged from the base route

- **Severity**: Medium
- **File:line**: `server/routes/contested-rolls.js:262-303` (base `30468501...`: lines 194-214)
- **Triggering input or sequence**: Resolve any ordinary challenge with no `power_name`, including a request body that omits `defender_status_term` entirely.
- **Observable consequence**: Pool calculation remains numerically identical and the new helper short-circuits before querying chapters, but the route now unconditionally writes `defender_status_term: null` and returns that additional property. The base route wrote no such field. Existing/legacy documents are therefore mutated into a new shape on every ordinary resolve, and strict response consumers or audits can distinguish the new path. This confirms and strengthens the related Pass 1 observation after an exact base-commit comparison.
- **Confidence**: High.

## Low

### [Pass 2] Client response mocks include an impossible closed-gate shape and omit the real stored fields

- **Severity**: Low
- **File:line**: `server/tests/crd-3b-resolution-screen.test.js:455-600`, `server/routes/contested-rolls.js:302-304`
- **Triggering input or sequence**: Compare each added `apiRaw` mock with a real resolve response. One test supplies `status_choice: { eligible: false }`, but the server only attaches `status_choice` when `_statusChoiceEligibility` returns its always-`eligible: true` object; a closed gate omits the field. The gate-closed mocks also omit the newly real `defender_status_term: null`, while gate-open mocks omit most fields returned from the fetched document.
- **Observable consequence**: These unit tests exercise the client's defensive handling but are not field-for-field fixtures for the real API contract. In particular, they cannot expose the non-power response-shape regression above and could continue passing if server/client shape assumptions drift.
- **Confidence**: High.

### [Pass 2] The Pass 1 missing-ID attendance bypass is not reachable through this handler as currently ordered

- **Severity**: Low
- **File:line**: `server/routes/contested-rolls.js:189-214`, `server/routes/contested-rolls.js:147-162`, `server/schemas/contested_roll_request.schema.js:19-32`
- **Triggering input or sequence**: Try to reach `attendedIn` with a missing/empty defender or challenger ID. A missing/empty defender ID fails ownership or `ObjectId` validation before the gate. A missing challenger ID constructs a fresh ObjectId for `undefined`/`null` (or throws for `""`) and then fails the required challenger lookup, so the function returns null before attendance matching. Normal POST creation also requires both IDs as non-empty strings.
- **Observable consequence**: Although `String(undefined) === String(undefined)` is unsafe inside the closure in isolation, the current end-to-end route does not let that coincidence open the gate. This is a corrective Pass 2 finding; the frozen Pass 1 finding remains unchanged as required.
- **Confidence**: High, including a direct Node check of the installed MongoDB driver's `ObjectId` behavior.

### [Pass 2] A `NaN` City Status closes the gate; only the BP branch of the Pass 1 clamp finding survives

- **Severity**: Low
- **File:line**: `server/routes/contested-rolls.js:170-178`, `server/routes/contested-rolls.js:267-288`, `public/js/data/city-status-calc.js:34-36`
- **Triggering input or sequence**: A malformed character or ambience calculation produces `NaN` for either effective City Status.
- **Observable consequence**: `defenderStatus > challengerStatus` is false when either side is `NaN`, and the negated condition returns null before `city_value` is constructed, so this particular malformed value cannot reach the final clamp. A truthy non-numeric `blood_potency` still can reach it and produce the Pass 1 `NaN` write. This narrows, but does not remove, the frozen Pass 1 High finding.
- **Confidence**: High.

### Pass 3a frozen acceptance audit

- The supplied diff and the actual changed-file list do not touch `challenge-initiation.js`, the old `contested-roll.js`, `city-status-calc.js`, or `cycle-phase.js`; no attack penalty or new HTTP GET was added.
- The implementation follows the intended corrected enabled-button behavior, but AC12 and the locked mockup still retain the rejected disabled state; the Dev Agent Record had not been read when this was frozen.
- No additional Pass 3a high-severity finding was found.
