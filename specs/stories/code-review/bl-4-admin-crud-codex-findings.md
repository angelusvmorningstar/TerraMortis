# Adversarial review findings — bl-4-admin-crud

## High

### [Pass 1] Case-different concurrent creates bypass the normalized-name uniqueness rule

- **Severity:** High
- **File:line:** `server/routes/bloodlines.js:266`
- **Triggering input or sequence:** Two ST requests concurrently POST otherwise-valid documents named `"Khaibit"` and `"khaibit"`. Each request completes the full-collection read before either insert commits, so neither sees a clash. The raw-name unique index accepts both spellings and therefore cannot produce the `E11000` the handler catches.
- **Observable consequence:** Both documents are stored but collapse onto the same normalized client-cache key. One becomes unreachable for costing, and which document supplies clan/discipline costs depends on result order.
- **Confidence:** High.

### [Pass 1] DELETE's reference check is not atomic with the delete

- **Severity:** High
- **File:line:** `server/routes/bloodlines.js:351`, `server/routes/bloodlines.js:363`
- **Triggering input or sequence:** An ST deletes an apparently unreferenced bloodline while another request assigns its name to a character or creates a matching `rule_grant` after `referencesFor()` has read the collections but before `deleteOne()` executes.
- **Observable consequence:** DELETE returns 204 and removes a now-referenced bloodline, leaving a character whose bloodline no longer resolves (and is therefore mis-costed) or a dangling grant rule. The advertised hard guard is bypassed under an ordinary write race.
- **Confidence:** High that the check/delete window exists; medium on how often the competing writes occur in production.

### [Pass 2] Out-of-order impact responses can save bloodline A's values into bloodline B

- **Severity:** High
- **File:line:** `public/js/admin/bloodlines-admin.js:222-234`
- **Triggering input or sequence:** Click Edit on bloodline A, then Edit on bloodline B before A's `/impact` request resolves. `_editingId` is set to B immediately. If B's response renders first and A's response arrives last, the final form displays A's values while the module-level `_editingId` remains B.
- **Observable consequence:** Pressing Save PATCHes B with A's clan, disciplines, and notes. The ST sees one record in the form but silently changes another, potentially changing discipline costs for every holder of B.
- **Confidence:** High; this follows directly from shared mutable `_editingId` plus unguarded async completion order.

### [Pass 3b] The record falsely says E11000 closes the normalized-name race

- **Severity:** High
- **File:line:** `specs/stories/bl-4-admin-crud.story.md:592`; implementation at `server/routes/bloodlines.js:266-287`
- **Triggering input or sequence:** Concurrent POSTs for `"Khaibit"` and `"khaibit"` both complete the pre-insert scan before either insert. The record says “the E11000 catch only closes the race,” but the unique index is explicitly raw and case-sensitive, so both inserts satisfy it and neither raises E11000.
- **Observable consequence:** The author record overstates the central AC 4 safeguard while the code can persist two documents that collapse to one costing-cache key. This is the same defect independently found blind in Pass 1, now confirmed as a false implementation claim rather than merely an omitted caveat.
- **Confidence:** High.

## Medium

### [Pass 1] A single throwing WebSocket send can turn a committed write into an HTTP failure

- **Severity:** Medium
- **File:line:** `server/ws.js:156`, `server/ws.js:165`; callers at `server/routes/bloodlines.js:293`, `:333`, `:367`
- **Triggering input or sequence:** A socket passes the `readyState === OPEN` check but `ws.send(msg)` throws (for example, it closes between the check and send). The broadcaster has no per-client catch, and every route calls it after the Mongo mutation but before sending the HTTP response.
- **Observable consequence:** The loop skips later clients and the route rejects after the mutation already committed. Depending on the repository's Express version/error middleware (not visible in the blind diff), the ST receives a 500 or broken request and may retry an operation that actually succeeded.
- **Confidence:** High in the control flow; medium in the practical frequency of a synchronous `ws.send` throw. The blind diff did not expose enough of `broadcastCatalogueUpdate` to verify whether the older broadcaster has the same implementation.

### [Pass 2] Admin boot does not await cache priming before opening the WebSocket

- **Severity:** Medium
- **File:line:** `public/js/admin.js:220`, `public/js/admin.js:226`; `public/js/data/bloodlines-cache.js:90-112`, `:148-157`
- **Triggering input or sequence:** On a valid admin login, `boot()` calls async `init()` without `await` and immediately calls `initWS()`. While `init()` is still awaiting rules/equipment work before it reaches `loadBloodlines()`, a bloodline frame can start `refetchBloodlines()`. A successful refetch can therefore overlap a later boot load; if that boot fetch subsequently fails, its failure branch clears `_items` and marks the cache failed.
- **Observable consequence:** The last-good collection obtained by the WS refetch is wiped and all bloodline characters become locked/costed out-of-clan. This is the exact failure the cache docstring says cannot happen because both boot paths await priming; that statement is true in `app.js` but false in `admin.js`.
- **Confidence:** High.

### [Pass 2] Concurrent refetches are last-response-wins and can roll the cache backward

- **Severity:** Medium
- **File:line:** `public/js/data/bloodlines-cache.js:148-153`; call sites `public/js/admin/bloodlines-admin.js:399`, `:418` and `public/js/admin.js:255`
- **Triggering input or sequence:** A local admin write triggers a direct refetch after the HTTP response while the write's WebSocket echo can independently trigger another. With two nearby mutations, request A can read the older collection state, request B can read the newer state, B can complete first, and A can complete last. There is no shared promise, generation number, or stale-response guard between refetches.
- **Observable consequence:** The cache silently rolls back to an older clan/discipline list until another frame or page reload, so subsequent costing can use stale rules even though Mongo and the CRUD list show the newer data.
- **Confidence:** High in reachability and state ordering; medium in production frequency.

### [Pass 3a] AC 12's hard-disabled Delete requirement is not met for grant-only impact

- **Severity:** Medium
- **File:line:** `public/js/admin/bloodlines-admin.js:178-186`
- **Triggering input or sequence:** A bloodline has no character holders but is named by a `rule_grant`. AC 12 requires Delete to be hard-disabled whenever the impact join is non-empty, while the implemented list decision receives only the client-side character count.
- **Observable consequence:** The only Delete control is enabled in a state the acceptance criterion explicitly requires it to disable. The API still prevents deletion, so this is not data loss, but the story is not literally accepted as implemented.
- **Confidence:** High.

### [Pass 3b] The record's “both apps await priming” justification is false

- **Severity:** Medium
- **File:line:** `specs/stories/bl-4-admin-crud.story.md:602-605`; `public/js/admin.js:220`, `:226`
- **Triggering input or sequence:** Load the admin app with a valid login. `boot()` starts async `init()` without awaiting its returned promise, then immediately calls `initWS()`; `init()` does not reach `loadBloodlines()` until after earlier awaits.
- **Observable consequence:** The record uses a false reachability assertion to justify deliberately unsynchronised load/refetch state. A WS refetch can overlap admin boot and a later failed boot load can wipe the successful refetch, as detailed in Pass 2.
- **Confidence:** High.

### [Pass 3b] AC 15's literal character assignment and DT-form check were narrowed to accessor checks

- **Severity:** Medium
- **File:line:** `specs/stories/bl-4-admin-crud.story.md:288-292`, Dev Agent Record `:516-570`
- **Triggering input or sequence:** Compare AC 15's required browser sequence (“assign it to a test character” and confirm 3 XP/dot on both the sheet and DT form) with the record. The record created a throwaway bloodline and exercised `bloodlineDiscs`, `bloodlinesByClan`, and `isInClanDisc`; it explicitly categorises the DT-form quote as test-only and never records assigning the new bloodline to either of the throwaway test-database characters.
- **Observable consequence:** The shared accessor evidence is useful but is not the mandated end-to-end browser verification. The story marks Task 11 complete despite leaving the exact integration path AC 15 required unexercised; this was avoidable because the environment already contained throwaway characters in `tm_suite_test`.
- **Confidence:** High that the literal steps are absent; medium on whether an unrecorded assignment happened.

### [Pass 3b] The 24-file/442-test historical gate is unverifiable as stated

- **Severity:** Medium
- **File:line:** `specs/stories/bl-4-admin-crud.story.md:455-459`
- **Triggering input or sequence:** Attempt to reproduce the claimed batch from the record. No exact command or complete file list is supplied, and the categories it names total 17 files (3 new + 2 converted + 6 other BL suites + 1 parallel-write + 4 ECM/STM + 1 NUL guard), not 24. The mandated current gate actually runs 6 files and passes 114/114; static per-file counts are 33, 15, 26, 11, 28, and 1.
- **Observable consequence:** “24 files / 442 tests, run twice” cannot be audited or repeated from the evidence left in the story. The narrower current gate is green and the three new files genuinely contain 74 tests, so this is an evidence/overstatement finding rather than proof that tests failed historically.
- **Confidence:** High that the claim is unreproducible as written; no conclusion about the unpreserved historical runs.

## Low

### [Pass 1] Discipline membership rejects harmless casing or surrounding whitespace instead of normalizing it

- **Severity:** Low
- **File:line:** `server/routes/bloodlines.js:114-116`
- **Triggering input or sequence:** POST or PATCH supplies a schema-legal discipline such as `"Auspex "` or `"auspex"`. The function uses `d.trim()` only to decide whether the value is nonblank, then performs `KNOWN_DISCIPLINES.includes(d)` against the original string.
- **Observable consequence:** A recognizable discipline is rejected as “Unknown discipline” even though names are normalized elsewhere at this boundary. This does prevent the worse outcome of persisting an unresolvable value, but produces an avoidable and confusing validation failure.
- **Confidence:** Medium in Pass 1 because the unchanged body of the schema was not present in the supplied diff; the exact schema legality will be checked in Pass 2 without revising this frozen finding.

### [Pass 1] The static broadcast test can pass without one broadcast in each write handler

- **Severity:** Low
- **File:line:** `server/tests/bl4-bloodlines-admin-view.test.js:154-162`
- **Triggering input or sequence:** Move all three `broadcastBloodlineUpdate(...)` calls into one handler, or leave three calls anywhere in the route file while omitting one write path. The loop repeats the same file-wide `toContain('broadcastBloodlineUpdate(')` assertion and checks each op string anywhere in the file; only the total call count is constrained.
- **Observable consequence:** The test remains green although create, update, or delete no longer notifies open clients, leaving their bloodline costing cache stale.
- **Confidence:** High.

### [Pass 2] A grant-only reference renders an enabled Delete button in list view

- **Severity:** Low
- **File:line:** `public/js/admin/bloodlines-admin.js:178-186`
- **Triggering input or sequence:** A bloodline has zero character holders but one or more `rule_grant` documents with `condition: 'bloodline'` and a matching `bloodline_name`. The list computes only character holders and enables Delete because the count is zero.
- **Observable consequence:** The ST is invited through a destructive confirmation for an operation the server then correctly refuses with 409. Data remains safe, and the edit view fetches both reference types, but the list's affordance does not mirror the actual guard.
- **Confidence:** High.

### [Pass 2] A failed admin-list request is rendered as a genuinely empty collection

- **Severity:** Low
- **File:line:** `public/js/admin/bloodlines-admin.js:105-113`, `:143-144`
- **Triggering input or sequence:** `GET /api/bloodlines/admin` fails because of an expired token, transient API outage, or server error. `loadItems()` logs to the console and assigns `_items = []`; `render()` then shows “No bloodlines in the collection” and recommends creating one or running the seed.
- **Observable consequence:** The ST is given an operationally false empty-state message and may attempt corrective actions against a collection that is merely unreadable. Server-side collision checks limit damage, but the screen conceals the real failure.
- **Confidence:** High.

### [Pass 3a] The discipline placeholder prints em dashes despite the story's UI-string rule

- **Severity:** Low
- **File:line:** `public/js/admin/bloodlines-admin.js:238`
- **Triggering input or sequence:** Open either create or edit form and inspect an unselected discipline picker; its option text is `— choose —`.
- **Observable consequence:** The application prints em dashes in a new user-facing string, contrary to the Dev Notes' explicit “No em-dashes in any string the app prints” constraint.
- **Confidence:** High.

### [Pass 3b] The NUL-scan claim understates the story's touched-file count

- **Severity:** Low
- **File:line:** `specs/stories/bl-4-admin-crud.story.md:461-465`
- **Triggering input or sequence:** Compare “all eighteen files this story touches” with `git diff --name-only 8abd6704 f4c6d890`, which names 20 files (17 in the supplied source/tooling diff plus the story, deferred-work, and sprint-status files).
- **Observable consequence:** The historical scan's scope is ambiguous and its one transient first-run failure is not independently reproducible. Current evidence is clean: the NUL test passes, all 17 supplied-diff files and all 20 commit files independently contain zero literal NUL bytes.
- **Confidence:** High on the count mismatch and current clean state; the historical mid-write explanation is unverifiable.

## Ship decision

**Not ready to ship as-is; patches are required.** The normalized-name create race, non-atomic delete guard, and out-of-order edit-form corruption are blocking data-integrity problems. The boot/refetch ordering defects should be fixed in the same patch set because their failure mode is silent stale or wiped costing data.

## Validation notes

### Pass isolation and files opened

- **Pass 1:** Opened the review brief and `specs/stories/code-review/bl-4-admin-crud-diff.txt` only. The supplied diff was read in chunks after the first raw output truncated. I did not open the story, current repository source, sibling repositories, or imported modules. The unchanged schema body was therefore deliberately unresolved in this pass, as recorded in the frozen Low finding.
- **Pass 2:** After Pass 1 was written, opened current `public/js/data/bloodlines-cache.js`, `public/js/data/ws.js`, `public/js/admin.js` (boot/init ranges), `public/js/app.js` (load/boot ranges), `public/js/admin/bloodlines-admin.js`, `public/js/data/accessors.js` (matching snippets), `public/js/components/bloodline-warn-banner.js` (matching snippets), `public/js/editor/rule_engine/bloodline-evaluator.js`, `server/routes/bloodlines.js`, `server/routes/equipment-catalogue.js`, `server/middleware/auth.js`, `server/schemas/bloodline.schema.js`, `server/schemas/rules/rule-grant.schema.js`, `server/scripts/seed-bloodlines.js`, `server/lib/bloodline-slug.js`, `server/ws.js`, `server/tests/bl1-bloodlines-api.test.js`, and `server/tests/bl2-bloodlines-cache.test.js`. Also inspected the base-commit `deriveSlug` via `git show 8abd6704:server/scripts/seed-bloodlines.js`, route/package search results, and schema/test file lists. I did not open the story before freezing Pass 2.
- **Pass 3a:** Opened `specs/stories/bl-4-admin-crud.story.md` lines 1-446 only (through Open Questions, stopping before the Dev Agent Record), matching snippets from `specs/stories/deferred-work.md`, the commit file-name diff, and searches/diffs used to verify excluded scope and UI strings. I did not read line 447 or later before the Pass 3a findings were written.
- **Pass 3b:** Opened the Dev Agent Record at story lines 447-665, `server/tests/helpers/db-setup.js`, `server/tests/helpers/setup-env.js`, `server/vitest.config.js`, `server/tests/issue-836-legacy-tracker-cache-removed.test.js`, `server/tests/bloodline-parallel-write.test.js`, relevant installed `ws` send implementation snippets, and the code/test snippets needed to check each record claim. Parsed `specs/stories/sprint-status.yaml`, inspected commit metadata and changed-file lists, and byte-scanned every supplied-diff and commit file. No sibling repository was opened in any pass.

### Commands and observed results

**Pass 1 read/freeze commands**

- `Get-Content ...bl-4-admin-crud-codex-review.md -Raw` — review instructions loaded.
- `Get-Content ...bl-4-admin-crud-diff.txt -Raw` — succeeded but the tool display truncated, so no inference relied on the missing portion.
- `Select-String ... -Pattern '^diff --git'` — 17 diff files, with section starts at diff lines 1, 25, 70, 114, 561, 589, 690, 744, 784, 1165, 1205, 1244, 1349, 1375, 1666, 1893, and 2355.
- Chunk reads over diff indices `113..350`, `351..588`, `588..783`, `783..1010`, `1011..1243`, `1243..1480`, `1481..1720`, `1721..1892`, `1892..2125`, and `2126..2398` — all succeeded.
- Two PowerShell unified-diff line mappers (matching the collision, merged validation, discipline check, broadcaster, delete guard, and static-test patterns) — succeeded and supplied current-file line numbers without opening repository source.
- `apply_patch` created this findings file with the complete Pass 1 sections before Pass 2 began.

**Pass 2 inspection commands**

- Full `Get-Content -Raw` reads for the Pass 2 files named above; numbered full read of `public/js/data/ws.js`; targeted range reads of `public/js/admin.js` and `public/js/app.js` — succeeded. One combined display truncated, so the affected files were re-read separately/ranged before conclusions were drawn.
- `rg -n -C 8 "loadBloodlines\(|initWS\(|refetchBloodlines\(" ...` and `rg -n "\binit\(\)|\bboot\(\)|loadAllData\(|Promise\.allSettled" ...` — showed `admin.js:220` calls `init()` without await and `admin.js:226` immediately calls `initWS`; the app path awaits `loadAllData()`.
- `rg -n -C 12 "MISS_EMPTY_COLLECTION|recordBloodlineMiss\(" ...` — confirmed the real caller records the empty-collection miss only while `isEmpty()` is true; no finding there.
- `rg --files server/schemas` plus narrowed `rg` searches for `bloodline_name`, `condition`, rule routes, accessors, and WS uses — confirmed `ruleGrantSchema` permits missing/empty `bloodline_name`, but such a malformed row normalizes to `''` and cannot match a valid non-empty bloodline name.
- `git show 8abd6704:server/scripts/seed-bloodlines.js | Select-String ...deriveSlug...` plus current seed/shared-module reads — implementation is byte-for-byte equivalent in behavior.
- `rg` over Express/package/error handling — `server/package.json` uses Express `^5.2.1`; async handler rejections are forwarded by Express 5. No custom error handler relevant to the routes was found.
- One parallel inspection batch failed because Windows rejected wildcard paths such as `server/routes/rules*`; it was rerun with directory paths and `-g '*.js'`. A second batch failed because an `rg` alternation was malformed; it was rerun with separate `-e` expressions. No conclusion relied on either failed batch.
- `apply_patch` added the frozen Pass 2 findings before the story was opened.

**Pass 3a commands**

- `Select-String ...bl-4-admin-crud.story.md -Pattern '^## '` — located Dev Agent Record at line 447 without displaying its contents.
- `$l=Get-Content ...story.md; $l[0..445]` — read only the permitted pre-record sections.
- `git diff --name-status 8abd6704 f4c6d890` — 20 commit files: 17 source/tooling files plus story, deferred-work, and sprint-status.
- `Select-String ...deferred-work.md -Pattern 'bloodline.*rename|rename.*bloodline|BL-4' -Context 3,3` — confirmed the rename migration deferral exists at lines 112-128.
- `Select-String ...bloodlines-admin.js -Pattern '—|#[0-9a-fA-F]{3,8}\b|rgba?\(|style="'` — only issue-number/comment matches and the printed `— choose —` string; no inline style/rgba/bare-hex implementation match.
- `git diff 8abd6704 f4c6d890 -- public/js/data/constants.js public/js/dev-fixtures.js server/schemas/character.schema.js server/routes/characters.js server/index.js server/tests/helpers/test-app.js` — empty, confirming the named excluded files/mounts were untouched.
- One parallel batch returned exit 1 because a no-match `rg` was treated as failure; each intended check was rerun individually. `apply_patch` then froze Pass 3a findings.

**Pass 3b executable verification**

- Mandated scoped gate, first sandboxed attempt: `npx vitest run tests/bl4-bloodlines-write-api.test.js tests/bl4-bloodlines-refetch.test.js tests/bl4-bloodlines-admin-view.test.js tests/bl1-bloodlines-api.test.js tests/bl2-bloodlines-cache.test.js tests/repo-no-nul-bytes.test.js` — exit 1 because sandbox networking denied the Mongo host (`connect EACCES 159.143.141.178:27017`); 4 files passed, 2 integration suites failed in setup, 70 tests passed and 44 were skipped.
- After reading `db-setup.js`, `setup-env.js`, and `vitest.config.js` and confirming the hard override to `tm_suite_test` plus the `_test` suffix guard, the exact gate was rerun with approved network access — **6/6 files passed, 114/114 tests passed** in 8.09 s. Per source/test-file counts: write API 33, refetch 15, admin view 26, BL-1 API 11, BL-2 cache 28, NUL guard 1. The three new files therefore contain the claimed **74** tests.
- `npx vitest run tests/repo-no-nul-bytes.test.js` in isolation — **1 file, 1 test passed**.
- Independent byte scan driven by supplied diff headers — **17 files scanned, 0 with NUL**. Independent `git diff --name-only 8abd6704 f4c6d890` byte scan — **20 files scanned, 0 with NUL**.
- PowerShell loop running `node --check` over every `*.js` file named by the supplied diff — **15/15 passed, 0 failed**.
- `python -c "import yaml; ...yaml.safe_load(...)"` using installed PyYAML 6.0.3 — `sprint-status.yaml` parsed as a dictionary with 7 top-level keys. No Node YAML package or `ConvertFrom-Yaml` command was available, which is why PyYAML was used.
- `npx vitest run tests/issue-836-legacy-tracker-cache-removed.test.js` — **1 file failed at import, 0 tests**, exact ENOENT for `public/js/suite/tracker.js` at test line 30. `Test-Path` confirmed the test exists and tracker file does not; `git log --diff-filter=D` and `git show --stat 58c88b5b` confirmed that commit deleted the 30-line tracker file; the BL-4 diff touches neither path.
- Static counts with `Select-String '^\s*it\('` confirmed the three new suites' 33/15/26 counts. The same command reports 11/28/1 for the other scoped files; all six participated in the passing 114-test gate.
- `rg --files tests` and filtered test listings, plus `rg -l` for bloodline/WS/admin consumers — used to try to reconstruct the historical 24-file batch. The record supplies no exact list/command and its named categories total 17, so 442/twice could not be independently rerun.
- `Get-Content`/`rg` on the real `bloodline-evaluator`, sheet/identity/DT accessor call sites, and `bloodline-parallel-write.test.js` — confirmed the browser holder normalization and failed-refetch claims are code-plausible and the DT form uses the same `isInClanDisc`; they do not substitute for AC 15's omitted literal assignment/browser quote.
- `rg`/range reads of `server/node_modules/ws/lib/websocket.js` — the installed broadcaster precedent has the same no-catch shape. The Pass 1 hypothetical remains frozen; the close-between-check example is low-frequency because the two calls are synchronous.
- `git diff --check 8abd6704 f4c6d890` — passed. `git diff --exit-code` for the working tree — passed (no tracked working-tree edits). Targeted `git status --short` shows only the intended findings file plus the supplied review/diff inputs as untracked in this review directory. The wider workspace contains many unrelated pre-existing untracked files; none was touched.

### Could not run or independently verify

- I did **not** run the full suite, per the brief. I could not reproduce the historical 24-file/442-test batch because its exact 24 paths and command were not recorded.
- I could not verify the historical statements that the 442-test batch ran twice or that the NUL guard's first red occurred while a file was mid-write; current tests/scans are green, but no preserved logs prove those events.
- I did not rerun browser/live-frontend claims, because doing so would require starting the API server, expressly prohibited by the review brief. They were checked only for code-level plausibility.
- I did not test the concurrency findings dynamically; doing so safely would require new temporary tests or controlled database scheduling beyond the mandated gate. Their control-flow basis is stated in each finding.
- I did not query production state; the brief says to treat the independent production re-check as verified.

### Mutation and database attestation

- I modified no application, server, schema, test, story, or tracking file. The only created/updated file is this required review output: `specs/stories/code-review/bl-4-admin-crud-codex-findings.md`. No temporary source edit was made, so no restore was necessary. `git diff --exit-code` confirms no tracked working-tree change; the intended output remains untracked.
- I did **not** start the API server or run `npm run dev`. I made no manual MongoDB connection and did not connect to or query the production `tm_suite` database.
- Honesty clarification: the successful mandated Vitest gate itself connected through the project's configured Mongo host to the forcibly selected **`tm_suite_test`** database, as the brief explicitly permits. Therefore I cannot truthfully attest that no MongoDB instance was contacted at all; I can attest that only the scoped test runner did so, under both the hard `MONGODB_DB='tm_suite_test'` override and the runtime `_test` suffix guard.
