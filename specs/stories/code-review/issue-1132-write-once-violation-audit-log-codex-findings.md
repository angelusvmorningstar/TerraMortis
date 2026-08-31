# Adversarial review — issue 1132 write-once violation audit log

## High

### Pass 1 (frozen before repository inspection)

- None found.

### Pass 2 (frozen before story inspection)

- None found.

### Pass 3a (frozen before reading the Dev Agent Record)

- None found.

### Pass 3b

- None found.

## Medium

### Pass 1 (frozen before repository inspection)

#### [Pass 1] The best-effort insert is awaited and can delay the refusal indefinitely

- **Severity**: Medium
- **File:line**: `server/lib/write-once-violation-log.js:96`; `server/routes/characters.js:588`; `server/routes/characters.js:706`
- **Triggering input or sequence**: A forbidden `clan` or `bloodline` change reaches either existing 409 branch while `insertMany()` remains pending because MongoDB or the network is stalled rather than promptly rejecting.
- **Observable consequence**: The caller does not receive the promised 409 until the audit insert settles. The `try/catch` prevents a rejection from becoming a 500, but it does not make the audit operation “never block”; without a local timeout or detached write, audit infrastructure latency is directly added to this high-traffic save request.
- **Confidence**: High. This follows directly from both call sites awaiting a promise that has no local time bound; the environment/driver may impose a separate timeout, which is worth quantifying in Pass 2.

### Pass 2 (frozen before story inspection)

- None found.

### Pass 3a (frozen before reading the Dev Agent Record)

- None found.

### Pass 3b

#### [Pass 3b] The DB-backed green claims are not reproducible in the current review environment

- **Severity**: Medium
- **File:line**: `specs/stories/issue-1132-write-once-violation-audit-log.md:383-403`
- **Triggering input or sequence**: Run the exact new-suite gate and the record's named regression groupings in this environment. The configured MongoDB connection is denied with `connect EACCES 159.143.141.178:27017`; no local listener was reported on port 27017.
- **Observable consequence**: The new suite reports `14 passed | 19 skipped (33)` twice, not 33 passed. The skipped block contains the real HTTP direct/race writes, failed-insert 409 guarantee, ST read route, filtering, and limits, so the core feature is not dynamically verified here. The four-suite regression reports `1 failed | 2 passed | 1 skipped` and `77 passed | 102 skipped (179)` twice; the five character-route suites report `5 failed` and `91 skipped (91)` twice; the final new+BL-5 grouping reports `1 failed | 1 passed` and `14 passed | 112 skipped (126)` twice. These results do not prove the historical record false, but make its current green claims unverifiable-as-stated and leave the acceptance gate open in this review.
- **Confidence**: High for the current results and coverage gap; no claim is made about whether the author's earlier environment genuinely produced the recorded historical passes.

## Low

### Pass 1 (frozen before repository inspection)

#### [Pass 1] The broad catch also hides document-construction programming errors

- **Severity**: Low
- **File:line**: `server/lib/write-once-violation-log.js:93-99`
- **Triggering input or sequence**: A caller supplies an array containing a malformed row such as `null`, or a future bug inside `buildViolationDocs()` throws before `insertMany()` is invoked.
- **Observable consequence**: The programmer error is swallowed under the same “insert failed” message as a transient database failure, the 409 still returns, and the audit record silently does not exist. This preserves the refusal response but makes a deterministic code defect look operational and harder to detect.
- **Confidence**: High for the catch behaviour; Medium for production reachability because the two visible callers construct well-formed object literals.

#### [Pass 1] Logging a non-Error rejection can itself throw

- **Severity**: Low
- **File:line**: `server/lib/write-once-violation-log.js:98`
- **Triggering input or sequence**: `getCollection()`, `insertMany()`, or a future implementation rejects/throws `null` or `undefined` instead of an `Error` object.
- **Observable consequence**: Evaluating `err.message` throws a new `TypeError` inside the catch block, escaping `recordWriteOnceViolations()` and turning the intended 409 into a 500. A string rejection does not throw here (its `.message` is merely `undefined`), but `null`/`undefined` does.
- **Confidence**: High as JavaScript behaviour; Low-to-Medium likelihood with the MongoDB driver, whose normal failures are `Error` instances.

#### [Pass 1] An explicitly blank global name is treated as absent

- **Severity**: Low
- **File:line**: `server/lib/write-once-violation-log.js:61`
- **Triggering input or sequence**: `actorFromUser({ id: '42', global_name: '', username: 'fallback' })`.
- **Observable consequence**: The stored `discord_name` becomes `fallback`, exactly as when `global_name` is `undefined`; the `||` fallback cannot distinguish an intentionally present empty string from absence. The same falsy issue makes a numeric `id` of `0` become `''` at line 60.
- **Confidence**: High for the helper output; Low for whether an empty Discord global name or numeric zero ID can occur in the real middleware shape, which is worth checking in Pass 2.

#### [Pass 1] The builder can produce documents outside its own declared schema

- **Severity**: Low
- **File:line**: `server/lib/write-once-violation-log.js:83-84`; `server/schemas/write_once_violations.schema.js:62-63`
- **Triggering input or sequence**: `buildViolationDocs()` receives `stored_value` or `attempted_value` as `0` or `false`.
- **Observable consequence**: The values are correctly preserved (as are `''` and `null`; only `undefined` becomes `null`), but the resulting document violates the documentation schema, which permits only strings and null. The schema therefore cannot describe every value the builder explicitly promises not to normalise.
- **Confidence**: High for the internal contradiction; production reachability depends on surrounding request validation and is deferred to Pass 2.

#### [Pass 1] The maximum-limit test can pass without exercising the 500-row cap

- **Severity**: Low
- **File:line**: `server/tests/issue-1132-write-once-violation-log.test.js:408-414`
- **Triggering input or sequence**: The test database contains fewer than 500 violation rows (the suite itself visibly creates only a small number), and the route ignores, removes, or misimplements `.limit(500)`.
- **Observable consequence**: `expect(res.body.length).toBeLessThanOrEqual(500)` still passes because the available result set is already below 500, so the named assertion does not prove that an absurd requested limit is capped.
- **Confidence**: High.

#### [Pass 1] The schema-shape test checks keys but not schema conformance

- **Severity**: Low
- **File:line**: `server/tests/issue-1132-write-once-violation-log.test.js:416-425`
- **Triggering input or sequence**: Returned rows contain all seven expected keys but have an invalid `field`, empty `actor.discord_name`, malformed `at`, or wrong value types.
- **Observable consequence**: The test titled “matching the declared schema shape” passes even though the rows do not actually conform to the declared schema; only top-level key equality and `character_id` hex format are asserted.
- **Confidence**: High.

### Pass 1 verified observations (not findings)

- `stored_value` and `attempted_value` preserve `''`, `0`, `false`, and `null` exactly; only `undefined` becomes `null`.
- `Number('abc')` produces `NaN`, and `Number.isInteger(NaN)` is false, so the GET route retains the default limit.
- A synchronous throw from `getCollection()` or `insertMany()` occurs inside the `try` and is caught, subject to the non-Error catch-variable caveat above.
- The direct-check comment and the builder docstring describe different callers: the direct loop records only its first refused field, while the race branch can pass two rows to the builder. They are not inherently contradictory.
- No dead imports, obvious unreachable branches, or incorrect ordering around either visible `return res.status(409)` were found from the diff alone.

### Pass 2 (frozen before story inspection)

#### [Pass 2] A dual-field direct refusal leaves the second attempted violation unaudited

- **Severity**: Low
- **File:line**: `server/routes/characters.js:565-597`; `server/lib/character-write-once.js:54`
- **Triggering input or sequence**: A character already has both `clan` and `bloodline`, and one PUT body attempts to change both. `WRITE_ONCE_FIELDS` is `['clan', 'bloodline']`, so the loop adjudicates and logs `clan`, then immediately returns 409 without checking `bloodline`.
- **Observable consequence**: The audit contains one clan row and no evidence of the bloodline value attempted in the same request. This preserves BL-5's existing first-refusal response behaviour and is openly documented in the change, so whether it violates the story is deferred to Pass 3; it is nevertheless incomplete as a record of the concrete request.
- **Confidence**: High for the runtime behaviour; acceptance significance was not knowable before reading the story.

#### [Pass 2] The HTTP actor fixture omits a production field that changes the recorded name

- **Severity**: Low
- **File:line**: `server/tests/helpers/test-app.js:176-186`; `server/middleware/auth.js:50-60`; `server/tests/issue-1132-write-once-violation-log.test.js:191-195`
- **Triggering input or sequence**: Production `requireAuth` attaches `id`, `username`, and `global_name`, and `actorFromUser` prefers `global_name`; the HTTP tests use `stUser()`, which omits `global_name` and therefore always exercises the username fallback.
- **Observable consequence**: The route-level assertions prove that fallback attribution is written, but do not prove the normal production-preference path is carried from middleware-shaped `req.user` through the real PUT wiring. The helper unit test covers preference in isolation, so this is a fixture fidelity/HTTP integration gap rather than evidence the implementation is wrong.
- **Confidence**: High.

### Pass 2 verified observations (not findings)

- Direct path: `guardedInBody` preserves `WRITE_ONCE_FIELDS` order (`clan`, then `bloodline`); the early return means at most one direct-refusal row per request.
- Race path: `stillThere` is fetched only after `findOneAndUpdate()` returns no result. `stored_value` comes from that fresh document, not the pre-request snapshot; `named` can hold both fields when both actually moved.
- Mount order: neither production nor the test app has an earlier `/api/write_once*` prefix or generic catch-all capable of shadowing `/api/write_once_violations`.
- Authorization: `requireRole('st')` expands its accepted roles to include `dev`; a `player` reaches the route gate and receives 403.
- GET validation on the installed MongoDB driver: empty `character_id`, 24 wrong-alphabet characters, and a 12-character string each fail `ObjectId.isValid` and produce 400. Uppercase 24-hex passes `isValid` but fails lowercase round-trip equality and produces 400. (The route comment's claim that this driver accepts arbitrary 12-character strings is stale, but the endpoint result remains correct.)
- Limits `0`, negative integers, floats, and `"abc"` all retain the default 200 and, assuming a reachable DB, produce 200 rather than validation errors; a positive integer is capped at 500.
- `getCollection()` is only a handle lookup. MongoDB creates the collection on the first insert; finding an as-yet nonexistent collection yields an empty result set, so no explicit setup is required.
- Two simultaneous forbidden requests can each append a row. Those are two real HTTP attempts, so duplicate-looking entries are append-only audit semantics, not a correctness violation.
- The current Vitest configuration disables file parallelism and uses one worker, so this suite's backup/delete/restore manipulation of `bloodlines` does not race another test file in the configured runner.

### Pass 3a (frozen before reading the Dev Agent Record)

#### [Pass 3a] The documentation schema excludes malformed values the design explicitly says to preserve

- **Severity**: Low
- **File:line**: `server/schemas/write_once_violations.schema.js:62-63`; `server/lib/write-once-violation-log.js:83-84`
- **Triggering input or sequence**: A legacy/directly-edited character contains a malformed non-string stored value such as `bloodline: 7`, then an ST attempts a valid replacement; or the builder is passed a non-string attempted value. The write-once guard deliberately treats malformed stored data as a value and refuses the change, and the logger preserves it.
- **Observable consequence**: The persisted audit row correctly contains the raw number/boolean, but it does not conform to the story's documentation-of-intended-shape schema, whose two value properties allow only string/null. This directly conflicts with Dev Notes saying malformed stored values are especially important to keep and `attempted_value` may be “anything.” Runtime logging still works because the schema is not wired to validation.
- **Confidence**: High.

#### [Pass 3a] The suite bypasses the story's mandated character-creation fixture path

- **Severity**: Low
- **File:line**: `server/tests/issue-1132-write-once-violation-log.test.js:152-163`
- **Triggering input or sequence**: Every HTTP write-path test calls `seedChar()`, which inserts a minimal document directly with `getCollection('characters').insertOne()` rather than creating it through `POST /api/characters` with `stUser()` as the Testing dev note explicitly requires.
- **Observable consequence**: The tests exercise the real PUT refusal code, but their starting documents bypass creation-route validation/defaulting and do not prove the scenario from a normally created character fixture. This is a task/dev-note deviation, not a demonstrated PUT bug.
- **Confidence**: High.

#### [Pass 3a] Added prose violates the story's explicit no-em-dash constraint

- **Severity**: Low
- **File:line**: `server/lib/write-once-violation-log.js:10` (representative; repeated across changed files and tests)
- **Triggering input or sequence**: Review any of the numerous added comments/test titles containing `—`.
- **Observable consequence**: The implementation violates the Project Structure Notes requirement “British English, no em-dashes, in every comment and message this story adds.” There is no runtime effect.
- **Confidence**: High; grep found many added em dashes in the supplied diff.

### Pass 3a verified observations (not findings)

- AC4 explicitly settles the Pass 2 dual-field direct behaviour as intended: the handler adjudicates only `clan` before returning, so one row is compliant. The earlier Pass 2 finding remains frozen as an audit-completeness observation.
- The story explicitly mandates the `||` actor fallback expression identified in Pass 1, so the blank-global-name behaviour is specification-conformant even though it conflates blank with absent.
- `git diff --exit-code dab928ed -- server/lib/character-write-once.js` exited 0: BL-5's refusal helper is unchanged.
- The supplied source/tooling diff contains no `public/` file diff header and does not add a UI, Ajv wiring, pagination/faceting, an index, or allowed-transition logging.
- The HTTP race test genuinely moves the stored clan inside the route's read-to-write window by intercepting `Collection.prototype.findOneAndUpdate`; it reaches the post-CAS reread and asserts the landed value from the persisted audit row.

### Pass 3b

#### [Pass 3b] The required two-suite gate names a test file that does not exist

- **Severity**: Low
- **File:line**: `server/tests/xpl-1-ledger-write.test.js:N/A` (absent)
- **Triggering input or sequence**: Run `npx vitest run tests/bl5-write-once.test.js tests/xpl-1-ledger-write.test.js` exactly as required in the review instructions, then enumerate matching test files.
- **Observable consequence**: Vitest silently selects only `bl5-write-once.test.js`; the requested XP-ledger regression is not exercised. Both runs report one failed file and 93 skipped tests because MongoDB is unreachable. The actual nearby files are `xpl-1-xp-ledger-api.test.js` and `xpl-1-xp-ledger-diff.test.js`.
- **Confidence**: High.

#### [Pass 3b] “Implemented exactly as specified; no deviations” is overstated

- **Severity**: Low
- **File:line**: `specs/stories/issue-1132-write-once-violation-audit-log.md:407`; `server/tests/issue-1132-write-once-violation-log.test.js:152`; `server/schemas/write_once_violations.schema.js:62`
- **Triggering input or sequence**: Compare the completion statement to the Testing dev note requiring POST-created fixtures, the malformed-value document-shape note, and the explicit no-em-dash prose constraint.
- **Observable consequence**: The record presents zero deviations even though the suite seeds directly with `insertOne`, the schema cannot represent all raw values the design says to retain, and many added comments use em dashes. These are low-severity deviations, but the completion claim is false in its absolute wording.
- **Confidence**: High.

### Pass 3b verified observations (not findings)

- The historical RED claim was not recreated because doing so would require temporarily removing/renaming the now-present schema module. It is plausible from module resolution but remains historical and unverified in this review.
- The Dev Agent Record contains no `126 passed` claim (a full-file grep found none), despite the review brief attributing one to it. The requested combined command was nevertheless run twice and currently reports 14 passed, 112 skipped, with one failed suite.
- The AC3 HTTP test is not faked: its spy calls through to the real MongoDB driver after changing the character inside the route window. Runtime completion could not be observed because this test was one of the 19 skipped.
- The CSS guardrail run reproduces exactly the named `suite.css` assertion (`10` fallbacks, expected at least `11`). `server/tests/gdx-4-css-standards-grep.test.js:425-433` reads only `public/css/suite.css` for that assertion; the supplied story diff has no `public/` file, and `git diff --exit-code dab928ed -- public/css/suite.css` exits 0. The record's attribution of that failure as unrelated to this story is supported.
- The record openly acknowledges the weak 500-cap test identified independently in Pass 1; that claim is honest, not overstated.

## Ship assessment

**Needs patches and a DB-backed rerun; no High-severity blocking defect was found.** Before shipping, bound or detach the awaited best-effort logging write so audit latency cannot indefinitely delay a 409, make catch-block error rendering safe for non-`Error` thrown values, and align the documentation schema with the deliberately preserved malformed values. Then rerun the 33-test gate and the real BL-5/XP-ledger regressions against a reachable test MongoDB. The code's intended direct and race wiring is otherwise coherent on static inspection.

## Validation notes

### Pass isolation and files opened

- **Pass 1**: Opened only `specs/stories/code-review/issue-1132-write-once-violation-audit-log-diff.txt`. That diff exposed the complete added contents of `server/index.js` hunks, `server/routes/characters.js` hunks, `server/tests/helpers/test-app.js` hunks, `server/lib/write-once-violation-log.js`, `server/routes/write-once-violations.js`, `server/schemas/write_once_violations.schema.js`, and `server/tests/issue-1132-write-once-violation-log.test.js`. I did not explore the repository or story before freezing Pass 1.
- **Pass 2**: Opened `server/routes/characters.js` lines 501-791 (the complete PUT handler and its immediate continuation), `server/lib/character-write-once.js`, `server/middleware/auth.js`, `server/db.js`, `server/index.js`, `server/tests/helpers/test-app.js`, `server/routes/write-once-violations.js`, `server/lib/write-once-violation-log.js`, `server/tests/helpers/db-setup.js`, and `server/vitest.config.js`; queried relevant lines/file names in `server/schemas/character.schema.js` and `server/`. The full `server/index.js` command output was tool-truncated, so I separately enumerated its complete Express mount list with `rg`. I did not separately `Get-Content` the new test file in Pass 2; its complete content had already been read inside the Pass 1 diff, and I opened its real fixture provider in Pass 2. I did not read the story before freezing Pass 2.
- **Pass 3a**: Opened `specs/stories/issue-1132-write-once-violation-audit-log.md` only from the beginning through Dev Notes/References, stopping before the `Dev Agent Record` heading. Checked the supplied diff for `public/` paths/em dashes and checked the base diff for `server/lib/character-write-once.js`. Pass 3a was frozen before the author record was exposed.
- **Pass 3b**: Opened the story's `Dev Agent Record` through its Change Log, stopping before any Senior Developer Review; queried claim line numbers in the story and the relevant assertion excerpt in `server/tests/gdx-4-css-standards-grep.test.js`. I did not read or open anything outside `D:\Terra Mortis\TM Game`.

### Commands run and real results

- `Get-Content -Raw 'specs/stories/code-review/issue-1132-write-once-violation-audit-log-diff.txt'` — succeeded; Pass 1 input only.
- Applied an `apply_patch` creating this findings file — succeeded; this was the required Pass 1 freeze.
- `$lines = Get-Content 'server/routes/characters.js'; $lines[500..735]` — succeeded.
- `Get-Content -Raw 'server/lib/character-write-once.js'` — succeeded.
- `Get-Content -Raw 'server/middleware/auth.js'` — succeeded.
- `Get-Content -Raw 'server/db.js'` — succeeded.
- `Get-Content -Raw 'server/index.js'` — succeeded, but aggregate tool output was truncated; relevant mounts were subsequently enumerated.
- `Get-Content -Raw 'server/tests/helpers/test-app.js'` — succeeded.
- `Get-Content -Raw 'server/routes/write-once-violations.js'` — succeeded.
- `Get-Content -Raw 'server/lib/write-once-violation-log.js'` — succeeded.
- `rg -n "app\.(use|all|get|post|put|patch|delete)\(" server/index.js` — succeeded; no shadowing prefix/catch-all found.
- `rg -n "app\.(use|all|get|post|put|patch|delete)\(" server/tests/helpers/test-app.js` — succeeded; no shadowing prefix/catch-all found.
- `$lines = Get-Content 'server/routes/characters.js'; $lines[735..790]` — succeeded.
- `node --input-type=module -e "import { ObjectId } from 'mongodb'; ..."` from `server/` — succeeded; `''`, 24 non-hex, and 12 characters were invalid; uppercase hex was valid but canonicalised lowercase.
- `rg -n "clan|bloodline" server/schemas/character.schema.js` — succeeded.
- `rg --files server | rg "vitest|db-setup|setup-env|package.json$"` — succeeded.
- `Get-Content -Raw 'server/tests/helpers/db-setup.js'` — succeeded.
- `Get-Content -Raw 'server/vitest.config.js'` — succeeded; one worker and no file parallelism.
- Applied an `apply_patch` adding/fixing Pass 2 in this findings file — succeeded; Pass 1 text was left standing.
- Stream-read the story from its start until `## Dev Agent Record` — succeeded; no author-record content was emitted.
- `git diff --exit-code dab928ed -- 'server/lib/character-write-once.js'` — exit 0 (unchanged), with a host-global ignore permission warning.
- `rg -n "^diff --git a/public/|—" 'specs/stories/code-review/issue-1132-write-once-violation-audit-log-diff.txt'` — succeeded; many em dashes, no `public/` diff header.
- `git diff --name-only dab928ed -- <seven story source/test paths>` — succeeded for tracked modifications; new untracked files do not appear in ordinary `git diff --name-only`.
- Applied an `apply_patch` adding/fixing Pass 3a in this findings file — succeeded.
- Stream-read only `## Dev Agent Record` through the next Senior Review heading/EOF — succeeded.
- `npx vitest run tests/issue-1132-write-once-violation-log.test.js` — run twice; both exit 0 with `1 passed` file and `14 passed | 19 skipped (33)` tests.
- `npx vitest run tests/bl5-write-once.test.js tests/xpl-1-ledger-write.test.js` — run twice; both exit 1 with only `bl5-write-once.test.js` selected, `1 failed` file and `93 skipped (93)` tests; MongoDB `EACCES`. The XP file is absent.
- `rg --files tests | rg "xpl-1.*ledger|bl5-write-once"` — succeeded; found BL-5 plus `xpl-1-xp-ledger-api.test.js` and `xpl-1-xp-ledger-diff.test.js`, not the requested file.
- `npx vitest run tests/bl5-write-once.test.js tests/bl5-lineage-lock-client.test.js tests/xpl-1-xp-ledger-api.test.js tests/xpl-1-xp-ledger-diff.test.js` — run twice; both exit 1 with `1 failed | 2 passed | 1 skipped` files and `77 passed | 102 skipped (179)` tests.
- `npx vitest run tests/api-characters.test.js tests/api-characters-crud.test.js tests/api-characters-public-fields.test.js tests/api-characters-carthian-pull.test.js tests/api-characters-safe-place-locations.test.js` — run twice; both exit 1 with `5 failed` files and `91 skipped (91)` tests.
- `npx vitest run tests/devlog-removed.test.js tests/tickets-removed.test.js tests/bl3b-constants-deleted.test.js tests/issue-1143-office-actions-auth-safety.test.js tests/gdx-4-css-standards-grep.test.js` — run twice; both exit 1 with `1 failed | 3 passed | 1 skipped` files and `1 failed | 63 passed | 13 skipped (77)` tests; the failure is the named `suite.css` fallback assertion.
- `npx vitest run tests/issue-1132-write-once-violation-log.test.js tests/bl5-write-once.test.js` — run twice; both exit 1 with `1 failed | 1 passed` files and `14 passed | 112 skipped (126)` tests.
- `npx vitest run tests/xpl-1-xp-ledger-api.test.js` — exit 0 with `1 skipped` file and `9 skipped (9)` tests.
- A first parallel diagnostic batch (`Get-NetTCPConnection`, `Get-Item markdown`, `rg` the CSS test, and `git status` for public CSS) returned only a combined exit-1 wrapper result because one command had no match; the same four commands were immediately rerun with per-command result capture.
- `Get-NetTCPConnection -State Listen -LocalPort 27017 -ErrorAction SilentlyContinue | Select-Object ...` — exit 1/no listener output.
- `Get-Item 'markdown','markdown/placeholder.md' | Select-Object ...` — succeeded; directory and 75-byte placeholder exist and were untouched.
- `rg -n -C 4 "leaves the compliant var\(\) fallbacks|const fallbacks|suite\.css" server/tests/gdx-4-css-standards-grep.test.js` — succeeded; confirmed the failing assertion reads `suite.css` and expects at least 11 matches.
- `git status --short -- 'public/css/suite.css' 'public'` — succeeded with no path changes (apart from host-global ignore warnings).
- `rg -n "126 passed|179 passed|91 passed|33 passed|structurally impossible|Local .*mongod|..." <story>` — succeeded; found the recorded 33/179/91 claims and no 126 claim.
- `git diff --exit-code dab928ed -- 'public/css/suite.css'` — exit 0 (unchanged), with a host-global ignore permission warning.
- `git status --short` — succeeded; listed pre-existing story/source/untracked work plus this findings file; no unexpected public source change.
- `git diff --check dab928ed -- 'server/index.js' 'server/routes/characters.js' 'server/tests/helpers/test-app.js'` — exit 0, with a host-global ignore permission warning.
- The first `rg` for completion-note line numbers failed with an unclosed regex caused by quoting; corrected `rg -n 'Implemented exactly as specified|caps an absurd limit|No Mongo index|No UI' <story>` succeeded.
- Applied an `apply_patch` adding Pass 3b, ship assessment, and validation notes to this findings file — succeeded.
- Final `git status --short` — succeeded and showed the same story/source/untracked paths as the prior status, with this findings file present; no unexpected implementation or `public/` change appeared.
- Final `rg -n "^## |^### Pass|^#### \[Pass" <findings>` — succeeded and confirmed all four pass labels are present under the required High/Medium/Low headings.
- Final `Get-Item <findings> | Select-Object FullName,Length,LastWriteTime` — succeeded; the requested report exists at 29,214 bytes before this small attestation addendum.

### Could not run / verification gaps

- Could not obtain the required **33 passed** DB-backed new-suite result: the actual repeated result is **14 passed, 19 skipped** because MongoDB connectivity is denied.
- Could not execute `tests/xpl-1-ledger-write.test.js` because that file does not exist. The exact prescribed command was still run twice and silently selected only BL-5.
- Could not dynamically verify AC2/AC3/AC6/AC7/AC8 or the DB-backed BL-5/character regressions; all relevant tests skipped or their suites failed in setup for the same MongoDB `EACCES` reason.
- Did not reproduce the historical RED run by temporarily removing the schema; no source file was temporarily edited, renamed, or restored.
- Did not run the full untargeted 4,711-test suite because it takes over ten minutes and the known MongoDB denial would make the DB-backed result non-actionable.
- No Senior Developer Review section was read; Pass 3b required the Dev Agent Record, which was read in full.

### Workspace integrity

- I modified only this requested findings file. No implementation, test, story, tracking, markdown placeholder, CSS, or sibling-workspace file was edited, renamed, deleted, committed, or pushed.
- No temporary implementation edit was made, so no restore was necessary. Final `git status --short` is expected to differ from the initial working tree only by the untracked findings file created for this review; all other listed changes/untracked paths pre-existed this review and were left untouched.
