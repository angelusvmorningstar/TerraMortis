# Adversarial review — crd.3a server-side resolve endpoint

## High

- None found in Pass 1.

## Medium

### [Pass 3b] The record’s blanket off-enum-aspect claim is false

- **Severity:** Medium
- **File:line:** `specs/stories/crd-3a-server-resolve-endpoint.md` (Dev Agent Record, Completion Notes); `server/routes/contested-rolls.js:122-126`
- **Triggering input or sequence:** Resolve as the correct owner with `defender_aspect: "toString"`, `"constructor"`, or `"__proto__"` rather than the record/test’s `"spiritual"` example.
- **Observable consequence:** Contrary to the record’s claim that “an off-enum `defender_aspect` gets a 400,” these values pass the truthiness guard and return success with an invalid stored aspect and zero pool. A direct Node probe of the exact mapping shape confirmed all three inherited keys resolve truthily.
- **Confidence:** High.

### [Pass 3b] The claimed real-Mongo green gates and mutation failure counts are unverifiable in this review environment

- **Severity:** Medium
- **File:line:** `specs/stories/crd-3a-server-resolve-endpoint.md` (Dev Agent Record, Prove-discrimination and Test results); `server/tests/crd-3a-resolve-endpoint.test.js:30`, `server/tests/api-tracker-state.test.js:23-30`
- **Triggering input or sequence:** Run the two required gate commands, then independently change `pool += 2` to `pool += 3` and change `if (currentWp <= 0)` to `if (false)`, running the story suite after each isolated mutation.
- **Observable consequence:** The story suite exited 0 but reported 1 file/24 tests skipped and `tests 0ms`, both normally and under each mutation; therefore neither 24/24 green nor the claimed exact 3-failure/1-failure discrimination can be reproduced. The six-file gate twice reported 72 passed, 100 skipped, and one failed suite because `api-tracker-state.test.js` does not use `skipIf` and its `beforeAll`/`afterAll` failed after MongoDB connection was denied with `EACCES` to `159.143.141.178:27017`. This does not prove the historical record false, but its “confirmed” results are unverifiable-as-stated here and cannot serve as current release evidence.
- **Confidence:** High about the observed runs and verification gap; no claim that the author’s earlier environment could not have produced the recorded totals.

### [Pass 3a] AC9 is literally unmet: non-boolean Willpower values are accepted

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:121`, `server/routes/contested-rolls.js:131`, `server/routes/contested-rolls.js:171`; `server/tests/crd-3a-resolve-endpoint.test.js:232-243`
- **Triggering input or sequence:** The owning defender submits `defender_wp_spent: "true"` (or any number/object) on a valid pending challenge.
- **Observable consequence:** AC9 says “do not accept `defender_wp_spent` as anything other than a boolean,” but the route returns 200 and stores `false`. The new test explicitly locks in that contradictory behavior. Strict equality safely prevents an unauthorized bonus, but coercing invalid input into a valid stored choice is acceptance, not schema enforcement; the resolve route has no `validate(...)` middleware despite the AC’s mistaken assertion that “the schema already enforces this.” AC6 also says the submitted value is written, whereas the route writes its normalized substitute.
- **Confidence:** High; this is a direct mismatch between literal AC wording, implementation, and test expectation.

### [Pass 3a] AC2’s stated aspect mapping is not closed to the three named values

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:85`, `server/routes/contested-rolls.js:122-126`; `server/tests/crd-3a-resolve-endpoint.test.js:156-162`
- **Triggering input or sequence:** Submit an inherited object-property name such as `"constructor"` as `defender_aspect`.
- **Observable consequence:** AC2 defines only mental/physical/social mappings, yet the ordinary-object lookup accepts the inherited value and persists it with a zero pool. The off-enum test proves only an arbitrary absent key (`"spiritual"`), not that the enum is actually exclusive.
- **Confidence:** High.

### [Pass 3a] AC3’s live-Willpower precondition is present only in appearance for partial tracker records

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:142-151`; `server/routes/tracker.js:29-46`
- **Triggering input or sequence:** A valid existing tracker record for the defender contains another live field but omits `willpower`, followed by a resolve request with the boolean `true`.
- **Observable consequence:** The server has not established that CURRENT Willpower is positive, but awards +2 anyway because `undefined <= 0` is false. This violates the trust-boundary intent and AC3’s required re-check; the fallback is applied only when the entire document is absent, not when its Willpower field is absent.
- **Confidence:** High.

### [Pass 2] Prototype-inherited aspect names bypass the three-value enum

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:122-126`
- **Triggering input or sequence:** The owning defender resolves a pending challenge with `defender_aspect: "toString"`, `"constructor"`, or `"__proto__"`. `ASPECT_ATTR` is an ordinary object and the route checks only whether `ASPECT_ATTR[defender_aspect]` is truthy, so inherited `Object.prototype` members pass the check.
- **Observable consequence:** The route returns 200 instead of the promised 400, computes the absent/weirdly-coerced attribute as zero, and persists an off-enum `defender_aspect`. The challenge can then be accepted with a zero-die defender pool. The existing off-enum test uses only `"spiritual"`, which is not an inherited property and therefore misses the bypass.
- **Confidence:** High; this follows directly from JavaScript ordinary-object property lookup and the route has no own-property/allowlist check.

### [Pass 2] A partial tracker document with no `willpower` defeats the live-positive-Willpower check

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:142-151`; `server/routes/tracker.js:29-46`
- **Triggering input or sequence:** A tracker document exists for the defender but lacks a `willpower` property—reachable because `PUT /api/tracker_state/:character_id` is an unvalidated partial upsert, including an initial request such as `{ "vitae": 7 }`. The defender then resolves with `defender_wp_spent: true`.
- **Observable consequence:** `currentWp` becomes `undefined`; `undefined <= 0` is false, so the route awards +2 without establishing any positive live Willpower. This differs from the client’s per-field fallback (`remote.willpower ?? defaults(c).willpower`) and turns “document exists” into an unsafe proxy for “the field is present.”
- **Confidence:** High. The storage route and its tests explicitly support partial updates, and there is no tracker-state schema requiring `willpower`.

### [Pass 2] The pending-state guard is not atomic with the resolve write

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:114-116`, `server/routes/contested-rolls.js:166-178`, `server/routes/contested-rolls.js:211-237`, `server/routes/contested-rolls.js:257-268`
- **Triggering input or sequence:** On a pending challenge that already has a pool, send a re-resolve concurrently with `/accept`; both requests can complete `_findChallenge` before either write. `/accept` can roll and set `status: 'resolved'`, after which `/resolve` still updates by `{ _id }` alone. A first resolve racing `/decline` has the same check/write gap.
- **Observable consequence:** Resolve can return 200 for a challenge that became terminal during the request. In the accept race, the stored `defender_pool` and choices can describe the later resolve while `outcome.defender.pool` and dice were generated from the earlier pool, leaving internally contradictory audit data. In the decline race, a declined record acquires resolution fields despite the not-pending guard.
- **Confidence:** High in the race structure; exact winner/order is scheduling-dependent but both interleavings are permitted by the independent reads and `_id`-only updates.

### [Pass 2] Repository validation confirms the resolve path can exceed 30

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:129-176`; `server/schemas/character.schema.js:402-413`, `server/schemas/character.schema.js:445-452`; `server/schemas/contested_roll_request.schema.js:43-49`
- **Triggering input or sequence:** Save a schema-valid character with, for example, Resolve `{ dots: 10, bonus: 20 }` (attribute bonus has no maximum), then resolve with available Willpower and owned Indomitable. Alternatively, a schema-valid Closed Book `rating` has no maximum. The resulting pool exceeds 30.
- **Observable consequence:** The direct `$set` persists an out-of-contract pool because the 0–30 JSON Schema is only applied as request middleware on contested-roll creation; `db.js` exposes ordinary Mongo collections and establishes no collection validator. This upgrades the Pass 1 concern from hypothetical malformed storage to an API-reachable mismatch.
- **Confidence:** High.

### [Pass 2] Repository validation confirms duplicate character merit keys are accepted and double-counted

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:157-163`; `server/schemas/character.schema.js:225-229`; `server/lib/normalize-character.js:128-155`
- **Triggering input or sequence:** Save a character with two structurally valid merits carrying the same `rule_key`, then submit that key once. The character schema has no `uniqueItems`/cross-row rule-key constraint, and the normalizer adjusts individual ratings but does not deduplicate rows or keys.
- **Observable consequence:** Resolve applies `_meritBonus` once per character row. This confirms the Pass 1 double-count is reachable through normal character APIs rather than only direct database corruption.
- **Confidence:** High.

### [Pass 1] The direct resolve write can persist a pool outside the declared 0–30 domain

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:91`, `server/routes/contested-rolls.js:121`, `server/routes/contested-rolls.js:139`, `server/routes/contested-rolls.js:146`
- **Triggering input or sequence:** A live character record contains an effective Resistance Attribute above the expected range and/or an unusually large `closed-book.rating`; the defender submits that aspect, requests a valid Willpower spend, and selects owned `closed-book` and `indomitable` merits. The code adds every source and sends the result directly through `updateOne`, with no local clamp or numeric/domain validation. On the diff alone, a concrete reachable fixture such as Resolve `{ dots: 29, bonus: 1 }`, Closed Book rating `3`, Indomitable, and live Willpower produces `37`. Non-numeric truthy character fields are worse: JavaScript `+` can concatenate strings instead of calculating a number.
- **Observable consequence:** The route can attempt to store an invalid `defender_pool` above 30 (or a non-number), diverging from the stated collection domain. Whether a database-level validator rejects the write or permits bad data cannot be established from the permitted Pass 1 material; either outcome is undesirable because this route does not translate a rejection and has no local error handling.
- **Confidence:** Medium in Pass 1: the missing clamp/type check is certain; repository schema limits and realistic character-field constraints must be checked in Pass 2.

### [Pass 1] Duplicate owned character merit rows with one `rule_key` are double-counted

- **Severity:** Medium
- **File:line:** `server/routes/contested-rolls.js:134-140`
- **Triggering input or sequence:** The character document has two merit entries with the same `rule_key` (for example, two `indomitable` entries), while the request submits that key once or more. The submitted list is deduplicated, but the subsequent bonus loop walks every character merit row and tests membership in the deduplicated key list.
- **Observable consequence:** Each duplicate character row contributes again, so two Indomitable rows add +4 rather than +2. The nearby comment is true only for duplicate submitted IDs; it does not protect against duplicate keys in the authoritative character document, which the comment says the algorithm walks for safety.
- **Confidence:** High that the algorithm double-counts this shape; Medium that duplicate rule keys are reachable in production until repository schema/write paths are checked in Pass 2.

## Low

### [Pass 3b] The record’s per-file tracker test count is stale/incorrect

- **Severity:** Low
- **File:line:** `specs/stories/crd-3a-server-resolve-endpoint.md` (Dev Agent Record, Test results); `server/tests/api-tracker-state.test.js`
- **Triggering input or sequence:** Count or run the current `api-tracker-state.test.js` as part of the six-file gate.
- **Observable consequence:** Vitest reports 8 tests in that file, not the record’s claimed 9. The overall collected total is still 172, so this is provenance/bookkeeping inaccuracy rather than a product failure.
- **Confidence:** High.

### [Pass 2] An empty request body becomes a 500 instead of aspect validation error

- **Severity:** Low
- **File:line:** `server/routes/contested-rolls.js:121`
- **Triggering input or sequence:** The owning defender calls resolve with no JSON body after the shared and ownership guards succeed. Express leaves `req.body` undefined for an empty body, and the route immediately destructures it.
- **Observable consequence:** A `TypeError` rejects the async handler and Express 5 turns it into a generic server error rather than the route’s structured 400 for a missing/invalid `defender_aspect`.
- **Confidence:** High on the code path and Express body behavior; not dynamically exercised during Pass 2.

### [Pass 2] The new verb has no direct regression test proving `status_action` exclusion

- **Severity:** Low
- **File:line:** `server/tests/crd-3a-resolve-endpoint.test.js` (AC1 block, no status-action case); `server/routes/contested-rolls.js:301-315`
- **Triggering input or sequence:** A future change accidentally routes `/:id/resolve` around `_findChallenge`, loosens the helper query, or changes the shared discriminator behavior while existing tests continue checking only `/accept`, `/decline`, and `/void` against `status_action` fixtures.
- **Observable consequence:** The current implementation is safe—`_findChallenge` uses `{ request_type: { $ne: 'status_action' } }`, so a status action receives 404 before ownership or resolution logic—but the new trust-boundary verb lacks direct blast-radius regression proof of that invariant.
- **Confidence:** High that current behavior is safe and the coverage omission exists; Low severity because the unchanged helper is already exercised for sibling verbs.

### [Pass 1] Several error-path tests assert less than their descriptions imply

- **Severity:** Low
- **File:line:** `server/tests/crd-3a-resolve-endpoint.test.js:124`, `server/tests/crd-3a-resolve-endpoint.test.js:141`
- **Triggering input or sequence:** Run the missing-challenge test or the “ownership check runs before aspect validation” test against an implementation that returns the expected numeric status with the wrong structured error body.
- **Observable consequence:** Those tests still pass because they assert only `404` or `403`, respectively, unlike adjacent tests that also verify `body.error`. This weakens proof that the shared guard and validation-order contract return the intended API error, though it does not itself change runtime behavior.
- **Confidence:** High.

### [Pass 1] The invalid-ID test title contradicts its assertion

- **Severity:** Low
- **File:line:** `server/tests/crd-3a-resolve-endpoint.test.js:117-121`
- **Triggering input or sequence:** Read or diagnose the test named “404s on an invalid id format”; its assertions require HTTP 400 and `VALIDATION_ERROR`.
- **Observable consequence:** Test output communicates the wrong expected behavior and can mislead later debugging/review, even though the assertion itself is specific.
- **Confidence:** High.

### [Pass 1] Awaited database failures have no local error translation and require surrounding-file verification

- **Severity:** Low
- **File:line:** `server/routes/contested-rolls.js:110`, `server/routes/contested-rolls.js:121`, `server/routes/contested-rolls.js:142-154`
- **Triggering input or sequence:** The character lookup, tracker lookup, update, or post-update lookup rejects (for example, transient MongoDB failure or schema validation rejection).
- **Observable consequence:** No route-local `try/catch` produces a stable API response. The actual consequence depends on the Express version/wrapper and established router conventions, which the Pass 1 restrictions do not permit checking; this is explicitly carried into Pass 2 rather than asserted as a confirmed defect.
- **Confidence:** High that there is no local catch; intentionally unresolved on whether that is inconsistent or unsafe.

## Ship assessment

**Needs patches before shipping as-is.** The route’s prototype-key aspect bypass and non-boolean acceptance violate literal ACs, the partial-tracker Willpower path defeats the core live-positive check, duplicate authoritative merit rows can inflate the pool, out-of-range pools can be persisted through schema-valid character data, and terminal-route races can leave contradictory records. The current environment also cannot supply a real-Mongo green gate, so the patched change should be rerun where all 172 tests actually execute.

## Validation notes

### Pass 1 (frozen before Pass 2)

- Opened only `specs/stories/code-review/crd-3a-diff.txt`, as required. I did not open source files, repository context, the story spec, the Dev Agent Record, or any Senior Developer Review material.
- Command run: `Get-Content -Raw 'specs/stories/code-review/crd-3a-diff.txt'` from the repository root; it completed successfully and displayed the scoped diff.
- Cold-read confirmations: strict `defender_wp_spent === true` is assigned once to `spendWp`, and only `spendWp` controls both the live lookup and +2 bonus; no raw-body value reaches either later. Submitted merit IDs are ownership-filtered first and deduplicated second; for normal string keys the order does not alter the result, and malformed values do not throw at these operations. The update constructs one complete `$set` before one write, and all four submitted/computed fields are overwritten. No unused import, dead branch, or happy-path resource handle was apparent in the diff.
- Test-count warning: no tests had been run at the Pass 1 freeze point, so no DB-backed suite was represented as passing.

### Pass 2 (frozen before Pass 3)

- Opened repository context only after Pass 1 was written: `server/routes/contested-rolls.js`, `server/routes/tracker.js`, `server/tests/api-tracker-state.test.js`, `server/routes/office-actions.js`, `server/db.js`, `server/middleware/validate.js`, `server/schemas/contested_roll_request.schema.js`, relevant line ranges of `server/schemas/character.schema.js`, relevant line ranges of `server/tests/crd-1-contested-roll-request-shape.test.js`, relevant line ranges of `server/routes/characters.js`, `server/tests/helpers/test-app.js`, `server/package.json`, `public/js/game/tracker.js`, `server/lib/normalize-character.js`, and relevant mount/index context in `server/index.js`. I did not open the crd.3a story file or any author record/review section.
- Commands run successfully: full `Get-Content` reads for the router/tracker/API-test/office-actions/db/validation/test-helper/package/client-tracker/normalizer files; numbered line-range reads for both schemas, the character route, and the crd.1 tests; `rg` searches under `server` for `defender_pool`, `tracker_state`, `status_action`, attribute requirements, and `rule_key`; `rg -l "tracker_state" public/js`; and targeted `Select-String`/`rg` context searches for mounts, validators, attributes, merits, and Willpower defaults.
- Two attempted parallel read/search batches exited with code 1 and yielded no usable output because at least one `rg` expression in each batch had no match; every necessary target was rerun successfully in smaller commands afterward. No test or runtime command was attempted in those failed batches.
- Edge-path conclusions with no finding: `_findChallenge` excludes `status_action` end to end today; missing/partial attributes silently compute zero (reachable because root `attributes` is optional and partial validation strips nested requirements), but zero is within the existing pool domain and the code consistently uses missing-as-zero accessors, so this is noted as a data-quality policy question rather than asserted as a defect before the spec. The tracker query uses the same ObjectId-or-string shape as `tracker.js` and cannot match a different character ID, though duplicate legacy/string rows for the same character could make `findOne` choose either. Route registration shapes do not shadow one another. Resolved-but-still-pending documents can be declined or voided normally. Non-string merit IDs do not throw; they are normally dropped by `Set.has`. Two concurrent resolves each issue one complete `$set`, so last-write-wins with no partial merge, although the first response’s post-write `findOne` can observe the second writer.
- The Pass 1 unhandled-rejection concern is not an implementation inconsistency: this project uses Express 5.2.1, whose async handler rejection path catches rejected promises, and surrounding routes use the same uncaught-await convention. Database failures may still get a generic 500 rather than a route-specific JSON error, but that is established application-wide behavior rather than a crd.3a-specific defect.
- No tests had yet been run at the Pass 2 freeze point. No source or fixture was modified.

### Pass 3a (frozen before Pass 3b)

- Opened `specs/stories/crd-3a-server-resolve-endpoint.md` with a streaming command that stopped before the first `## Dev Agent Record` or `## Senior Developer Review` heading. I read only front matter plus Story, rationale/decisions, Acceptance Criteria, “What this story is NOT,” Tasks/Subtasks, and Dev Notes/References. I did not read the Dev Agent Record or any Senior Developer Review content before freezing these findings.
- Command run: a PowerShell `StreamReader` loop over the story file, breaking before author/reviewer headings; it completed successfully.
- Acceptance audit: AC1 and the normal pending/ownership behavior are implemented; AC4/AC5’s narrow merit behavior is implemented; AC6/AC7’s ordinary sequential overwrite/status behavior is implemented; AC8 is covered without modifying `/accept`; AC10 uses the requested Supertest/real-DB test shape. The change stayed within all “What this story is NOT” boundaries: no client/`roll-v2.js`, `/accept`, `/decline`, `/void`, generic rule-engine, or crd.4 formula implementation change appears in the scoped source diff.
- No tests had yet been run at the Pass 3a freeze point. No source or fixture was modified.

### Pass 3b

- Opened the Dev Agent Record and Change Log in `specs/stories/crd-3a-server-resolve-endpoint.md` only after Pass 3a was frozen, using a stream that began at `## Dev Agent Record` and stopped before any `## Senior Developer Review`. No Senior Developer Review content was read. Also opened `server/tests/helpers/db-setup.js` to explain the observed skip/failure split.
- Required story-suite gate: `cd server && npx vitest run tests/crd-3a-resolve-endpoint.test.js` exited 0 with **1 test file skipped and 24 tests skipped (24), 0 passed, tests 0ms**. It was a silent skip, not green; duration was 15.16s after import/connection probing.
- Required six-file gate: `cd server && npx vitest run tests/crd-1-contested-roll-request-shape.test.js tests/crd-2-pending-queue.test.js tests/crd-3a-resolve-endpoint.test.js tests/api-tracker-state.test.js tests/oaq-2-pending-status-actions.test.js tests/oaq-3-approval-queue.test.js` exited 1 with **72 passed, 100 skipped, 172 total; 1 file failed, 2 passed, 3 skipped**. `api-tracker-state.test.js` reported 8 skipped tests and failed suite setup and cleanup because MongoDB connection was denied (`EACCES 159.143.141.178:27017`).
- The same six-file command was run again immediately after the isolation check and reproduced exactly **72 passed, 100 skipped, 172 total; 1 file failed, 2 passed, 3 skipped**, with the same MongoDB error. It did not reproduce the author’s 172/172 re-run.
- Isolation command: `cd server && npx vitest run tests/crd-2-pending-queue.test.js` exited 0 with **57 passed and 2 skipped (59 total)**. Its runnable filesystem-walk test passed in 207ms; this supports the narrow pass-in-isolation claim, while the two DB-backed tests remained unexecuted.
- Mutation check 1: temporarily changed `pool += 2` to `pool += 3`, then ran `cd server && npx vitest run tests/crd-3a-resolve-endpoint.test.js`; result was **24 skipped, 0 failed**, not a meaningful confirmation of the claimed 3 failures. Restored immediately.
- Mutation check 2: temporarily changed `if (currentWp <= 0)` to `if (false)`, then ran the same story-suite command; result was **24 skipped, 0 failed**, not a meaningful confirmation of the claimed 1 failure. Restored immediately.
- Restoration checks: captured pre-edit SHA-256 `F9BAA866527DA764366EA1351299CC5B0B35852F3D538946C1B0B8DFB1F17B0E`. `apply_patch` normalized the CRLF file to LF during the first temporary edit; I detected the hash mismatch, used the installed `unix2dos` formatter on this one explicitly named file, and verified the original SHA-256 exactly. The second edit received the same restoration treatment. No temporary semantic or line-ending change remains.
- Runtime aspect probe: `node -e "const m={mental:'Resolve',social:'Composure',physical:'Stamina'}; for (const k of ['spiritual','toString','constructor','__proto__']) console.log(k, Boolean(m[k]), String(m[k]));"` showed `spiritual` false but `toString`, `constructor`, and `__proto__` all truthy.
- Read-only state/verification commands used during Pass 3b: `Get-FileHash -Algorithm SHA256 'server/routes/contested-rolls.js'`; `git status --short`; `git diff --check`; `Get-Command unix2dos`; and the final repeated hash/status/diff checks. Git emitted a permission warning for the user-global ignore file, but the repository status output itself completed.

### Complete command/read attestation

- **Pass 1:** `Get-Content -Raw 'specs/stories/code-review/crd-3a-diff.txt'`. The first report section was then written with `apply_patch`. No other file was read.
- **Pass 2 successful reads/searches:** `Get-Content -Raw` on `server/routes/contested-rolls.js`, `server/routes/tracker.js`, `server/tests/api-tracker-state.test.js`, `server/routes/office-actions.js`, `server/db.js`, `server/middleware/validate.js`, `server/tests/helpers/test-app.js`, `server/package.json`, `public/js/game/tracker.js`, and `server/lib/normalize-character.js`; numbered `Get-Content` line dumps for `server/schemas/contested_roll_request.schema.js`, relevant portions of `server/schemas/character.schema.js`, `server/tests/crd-1-contested-roll-request-shape.test.js`, and `server/routes/characters.js`; `rg -n --glob '!specs/stories/crd-3a-server-resolve-endpoint.md' "defender_pool|tracker_state|request_type.*status_action|attributes.*required|rule_key" server`; `rg -l "tracker_state" public/js | Sort-Object`; targeted `rg -n -C` searches for attributes/merits, character validators, Willpower/defaults, and `normalizeMeritsMiddleware`; and `Select-String` context over `server/index.js` for mounts/index/error handling. Two parallel batches containing some of these reads exited 1 with no usable output when one `rg` member found no match; each needed target was rerun successfully afterward. Pass 2 findings were written with `apply_patch` before the spec was opened.
- **Pass 3a:** one PowerShell `StreamReader` command on `specs/stories/crd-3a-server-resolve-endpoint.md`, stopping before `Dev Agent Record`/`Senior Developer Review`. Findings were written with `apply_patch` before Pass 3b.
- **Pass 3b:** one PowerShell `StreamReader` command beginning at `Dev Agent Record` and stopping before `Senior Developer Review`; the gate, isolation, mutation, probe, hash, formatter-discovery, restoration, diff-check, and status commands itemized above; and `Get-Content -Raw 'server/tests/helpers/db-setup.js'`.
- Could not execute any DB-backed story test or complete the six-file regression gate because network policy denied MongoDB at `159.143.141.178:27017`. Specifically unverified: all 24 crd.3a behaviors, the exact mutation failure counts, DB-backed portions of the other skip-aware suites, tracker API integration behavior, the claimed original transient timeout, and a clean 172/172 combined run.
- Final integrity: the only lasting write made by this review is this requested findings file. Both temporary source mutations were restored exactly; `server/routes/contested-rolls.js` finishes with its pre-mutation SHA-256 `F9BAA866527DA764366EA1351299CC5B0B35852F3D538946C1B0B8DFB1F17B0E`. `git diff --check` exits 0. `git status --short` still shows the author/user’s pre-existing story changes and untracked review artifacts plus this findings file; it shows no additional unintended path from this review. Git’s user-global ignore file produced a permission warning but did not prevent repository status inspection.
