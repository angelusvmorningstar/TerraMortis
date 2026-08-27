# Adversarial review findings — oxp-10 office data MongoDB migration

## High

- [Pass 1] None found.
- [Pass 2] None found.

### [Pass 3a] The checked-off client-cache task omits three explicit AC7 requirements

- **Severity:** High
- **File:line:** `public/js/data/office-content-cache.js:31` (against `specs/stories/oxp-10-office-data-mongo-migration.md:145` and Task 5 at line 226)
- **Triggering input or sequence:** The API returns an empty collection, a caller asks for an unknown category before/after a load, or any present/future consumer mutates the object returned by `officeEntry()`. The module has no miss registry at all, returns the live cached document, and exports no refetch operation with last-good-cache failure semantics, even though AC7 and the checked Task 5 require all three.
- **Observable consequence:** “Not loaded,” “empty collection,” and “unknown category” collapse to the same pending UI with no required diagnostic registry; mutating a returned document permanently corrupts every subsequent read in that page; and the required safe mid-session refresh contract does not exist. Current consumers do not mutate the object and the current repo deliberately has no write path, which reduces immediate production reachability, but the delivered implementation does not satisfy the literal acceptance contract that is marked complete.
- **Confidence:** High. The omissions are explicit in the module header/API and directly contradict AC7’s unqualified wording.

- [Pass 3b] None found.

## Medium

### [Pass 1] Test bootstrap suppresses every office-content seeding failure, permitting false-positive and misleading DB tests

- **Severity:** Medium
- **File:line:** `server/tests/helpers/db-setup.js:29`
- **Triggering input or sequence:** `connectDb()` succeeds, but `ensureOfficeContentIndexes()` or one of the seed `updateOne(..., { upsert: true })` calls fails for a real database reason (for example, an incompatible existing index/duplicate live documents, insufficient write permission, or a transient write error). The blanket `try/catch` logs the error and lets `setupDb()` resolve normally with `office_content` empty or incomplete.
- **Observable consequence:** The rest of a DB-backed suite runs against missing reference data. Positive office operations fail early with the generic “office has no rules” validation path rather than a setup failure, while negative tests that only expect a 400/validation rejection can pass for the wrong reason. Because the catch also absorbs real MongoDB failures—not just the minimal mocked-DB case named in the comment—the test gate can no longer reliably distinguish broken shared setup from application behavior.
- **Confidence:** High. The blanket catch and continuation are explicit in the diff; whether a particular suite becomes a false positive depends on how narrowly that test asserts the rejection body.

### [Pass 2] An unknown-kind orphan aliases the merit-cap singleton and can make `--apply` finish without seeding caps

- **Severity:** Medium
- **File:line:** `server/scripts/seed-office-content.js:310`
- **Triggering input or sequence:** The existing collection contains an orphan such as `{ kind: 'legacy', category: 'Old Office' }` and does not yet contain a real `kind: 'merit_caps'` document. `keyOf()` maps every document whose kind is not exactly `office` to the sentinel key `merit_caps`. Reconciliation therefore treats the orphan as the existing singleton, marks it as DIFFERS, omits the real caps document from `toInsert`, creates the partial indexes (which ignore `kind: 'legacy'`), and inserts the missing office documents.
- **Observable consequence:** `--apply` can return successfully while the required merit-cap singleton is still absent; the orphan is neither reported as an orphan nor removed. All server and client cap reads then silently default every merit to 5, so Cacophony Savvy and Trained Observer incorrectly gain a 5-dot cap instead of 3. If a real singleton is also present, the same alias instead reports a misleading duplicate `merit_caps` and aborts an otherwise indexable run.
- **Confidence:** High. This follows directly from the total fallback in `keyOf`; unlike the bloodlines precedent’s real natural key, it collapses all unexpected discriminator values onto a valid source key.

### [Pass 3a] Administrator remains a code-dependent schema change despite AC1’s exact-enum/content-only contract

- **Severity:** Medium
- **File:line:** `server/schemas/office_content.schema.js:54`
- **Triggering input or sequence:** The separately scoped oxp-8 content work attempts to create a real `{ kind: 'office', category: 'Administrator', ... }` document without changing TM Game code. `OFFICE_CONTENT_CATEGORY_ENUM` filters Administrator out of the canonical five-value `OFFICE_CATEGORY_ENUM`, so Ajv rejects the otherwise valid document.
- **Observable consequence:** Authoring Administrator content cannot be a content-only operation: it requires a code deploy to widen this schema, contrary to AC1’s literal requirement that `category` match the existing enum value set exactly and the story boundary describing oxp-8 as content-only/no code dependency. Merely allowing the enum value would not create the forbidden placeholder document, so the no-document exception does not require narrowing the schema.
- **Confidence:** High on the literal contradiction and validation result; Medium on which repository will enforce this schema when oxp-8 is eventually authored.

### [Pass 3a] Task 7/AC10 claims direct seed, schema, and cache tests that do not exist

- **Severity:** Medium
- **File:line:** `specs/stories/oxp-10-office-data-mongo-migration.md:165` and `:240` (missing coverage for `server/scripts/seed-office-content.js`, `server/schemas/office_content.schema.js`, and `public/js/data/office-content-cache.js`)
- **Triggering input or sequence:** A regression is introduced in reconciliation (including the unknown-kind alias found in Pass 2), schema discrimination, cache generation ordering, failure state, or reference-copy behavior. Repository-wide test search finds only incidental calls that prime the cache for render tests and build seed docs as fixtures; there is no oxp-10 seed/schema/cache unit suite.
- **Observable consequence:** The acceptance gate cannot detect the specifically enumerated defect classes, despite Task 7 marking “integrity gate + reconciliation,” schema validation, generation counter, and miss-registry tests complete. The real reconciliation defect in this review is concrete evidence of the coverage gap rather than a hypothetical concern.
- **Confidence:** High. A full `server/tests/**/*.test.js` symbol search found no office-content tests for these contracts; the only matches use `buildSeedDocs()`/`loadOfficeContent()` as setup for unrelated render assertions.

### [Pass 3b] The record’s “clean in isolation” dismissal is false; the targeted gate is not green

- **Severity:** Medium
- **File:line:** `specs/stories/oxp-10-office-data-mongo-migration.md:386` (failure at `server/tests/oxp-1-office-seats.test.js:628`)
- **Triggering input or sequence:** Run the mandated 11-file gate against a clean, transaction-capable single-node replica set, then rerun `tests/oxp-1-office-seats.test.js` alone. The four overlapping `seedOfficeSeats(..., { apply: true })` calls race unindexed upserts on `{ office_category, holder_id }`.
- **Observable consequence:** The gate produced 381 passed / 1 failed, with 10 seats instead of 7; the isolated rerun produced 49 passed / 1 failed, with 11 seats instead of 7. The Dev Agent Record says this exact test “reproduced clean in isolation immediately after” and uses that assertion to report the targeted regression green. The failure is in pre-existing seat-seed code rather than oxp-10, but the verification claim and green-gate conclusion are not accurate as stated.
- **Confidence:** High for the two observed runs and the absence of a unique natural-key index; Medium for cross-environment reproducibility because timing and MongoDB version can affect how often concurrent unindexed upserts duplicate.

## Low

### [Pass 1] The schema documentation claims a 12-entry merit-cap singleton, but the frozen source contains 10 entries

- **Severity:** Low
- **File:line:** `server/schemas/office_content.schema.js:33` (contradicted by `server/scripts/seed-office-content.js:73`)
- **Triggering input or sequence:** A maintainer or operator uses the schema header as the collection contract or checks a seed result against its stated expected cardinality.
- **Observable consequence:** The documented expected shape disagrees with the data that the integrity gate actually accepts and seeds (10 cap keys). Runtime behavior is unaffected, but the mismatch weakens the migration/audit record and can cause someone to treat a correct 10-key document as incomplete—or overlook a genuinely missing key if 12 was intended.
- **Confidence:** High. Counting the literal keys in the supplied diff yields 10, while the schema comment explicitly says 12.

### [Pass 2] The integrity gate promises to surface unmapped merits but emits no warning

- **Severity:** Low
- **File:line:** `server/scripts/seed-office-content.js:226`
- **Triggering input or sequence:** A frozen office merit is not present in `MERIT_DOT_CAPS` (for example, a typo such as `Contact` instead of `Contacts`). `checkIntegrity()` intentionally does not add an error, but its comment says the caller will emit a console note; `seedOfficeContent()` has no such note and prints `Integrity: OK`.
- **Observable consequence:** The intended default-to-5 behavior works end to end, but an accidental typo is indistinguishable from an intentional unlisted merit during both dry-run and apply. The seed’s claimed warning layer therefore provides no audit signal for the exact drift its comment says it will surface.
- **Confidence:** High. A direct driver returned zero integrity errors for an unlisted merit, and the complete `seedOfficeContent()` summary path contains no warning computation or output.

### [Pass 2] Shared test seeding preserves stale office-content fixtures across runs

- **Severity:** Low
- **File:line:** `server/tests/helpers/db-setup.js:59`
- **Triggering input or sequence:** `tm_game_test.office_content` already contains a natural-key match whose content/order differs from the current frozen seed—left by a prior checkout, manual test, or interrupted experiment. Every `setupDb()` call uses `$setOnInsert`, so the existing document is never repaired, and `teardownDb()` is intentionally a no-op.
- **Observable consequence:** DB-backed office tests execute against persistent stale reference data rather than the literals in the checked-out code. Results can vary by developer/test-database history, and a manoeuvre-order or cap regression can be hidden or spuriously reported until someone manually drops the collection.
- **Confidence:** High in the behavior; Medium in frequency. The persistent test DB has no global drop/cleanup for `office_content`, and `$setOnInsert` categorically preserves a matching document.

- [Pass 3a] None found.

### [Pass 3b] The Dev Agent Record claims an accept-route resolver call that does not exist

- **Severity:** Low
- **File:line:** `specs/stories/oxp-10-office-data-mongo-migration.md:370` (actual route at `server/routes/office-purchase.js:370`)
- **Triggering input or sequence:** Audit the completion-note statement that the accept route passes `{ session: dbSession }` through “both `resolveOfficeSeat()` and the direct `getOfficeEntry`/`getMeritCaps` calls.” The accept handler directly reads `office_seats`, `getOfficeEntry`, and `getMeritCaps`; it never invokes `resolveOfficeSeat()`.
- **Observable consequence:** No runtime transaction bug results—the actual direct reads all correctly use the session—but the record overstates what was exercised/wired and can send a future reviewer looking for a nonexistent transactional resolver call.
- **Confidence:** High.

### [Pass 3b] The claimed re-grep left stale assertions that the deleted static module still exists

- **Severity:** Low
- **File:line:** `server/schemas/office_seat.schema.js:45` (also stale prose in `server/routes/office-seats.js:177`, `server/lib/office-seat-resolve.js:37`, and several office tests)
- **Triggering input or sequence:** Grep the current `public/` and `server/` trees for `office-data.js`, `OFFICE_DATA`, and `MERIT_DOT_CAPS` after deletion. There is no remaining production import of the deleted module, but existing comments still say, for example, “`OFFICE_DATA` (`public/js/tabs/office-data.js`) still defines only” four offices.
- **Observable consequence:** Runtime behavior is unaffected, and test imports of the frozen seed exports are intentional, but the repository contains factually stale source guidance immediately after a migration whose record says the dependency grep was re-run and cleared.
- **Confidence:** High.

## Ship decision

Needs patches; I do not consider the change ready to ship as-is. The operationally significant blocker is the Pass 2 reconciliation defect, which I reproduced against an isolated real replica set: `--apply` completed with four office documents, a legacy orphan, and **zero** `merit_caps` documents. The explicit AC7/AC10 completion mismatch also needs either implementation or a deliberate spec/task correction before acceptance. The one failing current gate test is pre-existing seat-seed code, not an oxp-10 regression, but the Dev Agent Record must not call it clean in isolation.

## Validation notes

### Pass boundaries and files opened

- **Pass 1:** Opened only `specs/stories/code-review/oxp-10-office-data-mongo-migration-diff.txt` (all 1,727 lines, in three chunks). I used `Test-Path` on the requested output path but did not open any repository source or story/spec file outside the supplied diff. I wrote and froze Pass 1 before advancing.
- **Pass 2:** Opened/read implementation context only: `server/scripts/seed-office-content.js`, `server/scripts/archive/seed-bloodlines.js`, `public/js/data/office-content-cache.js`, `public/js/data/bloodlines-cache.js`, `public/js/data/api.js`, `public/js/app.js`, `public/js/admin.js`, `public/js/tabs/office-tab.js`, `public/js/editor/sheet.js`, `server/tests/helpers/db-setup.js`, `server/tests/helpers/test-app.js`, `server/routes/office-content.js`, `server/routes/bloodlines.js`, `server/routes/office-purchase.js`, `server/routes/office-merit-dots.js`, `server/routes/office-manoeuvre-rank.js`, `server/schemas/office_content.schema.js`, `server/lib/office-content-index.js`, `server/lib/office-content-read.js`, `server/lib/office-seat-resolve.js`, `server/vitest.config.js`, `server/tests/helpers/setup-env.js`, and `server/db.js`. Repository-wide `rg` searches also inspected matching lines under `public/js/`, `server/`, and `server/tests/`. I did **not** open the oxp-10 story, its Dev Agent Record, `reference-data-ssot.md`, the epic, sprint status, or the pre-existing Codex review/log files. Pass 2 was written and frozen before advancing.
- **Pass 3a:** Opened the story headings, then only lines 1-308 of `specs/stories/oxp-10-office-data-mongo-migration.md` (through References at the end of Dev Notes). I did not read Open Questions (lines 309-345) or any Dev Agent Record content. I then opened the AC9-relevant ranges/diff of `specs/reference-data-ssot.md` and `specs/epic-oxp-office-xp-economy.md`, and searched test/source symbols needed to audit the ACs. Pass 3a was written and frozen before advancing.
- **Pass 3b:** Opened the Dev Agent Record from line 346 to EOF for the first time. Also opened `server/config.js`, the DB-backed portion of `server/tests/oxp-1-office-seats.test.js`, and matching lines in `server/scripts/seed-office-seats.mjs`; test files named below were executed and their failure output read. I never opened the story’s Open Questions section.

### Commands and observed results

Pass 1 commands:

- `(Get-Content -LiteralPath 'specs/stories/code-review/oxp-10-office-data-mongo-migration-diff.txt').Count` → `1727`.
- `Get-Content ... | Select-Object -First 600`, then `-Skip 600 -First 600`, then `-Skip 1200` → read the complete supplied diff.
- `Select-String ... -Pattern 'checkPurchaseValidity\(|resolveOfficeSeat\(|officeEntry\(|getMeritCaps\(|getOfficeEntry\(' -Context 2,3` → confirmed both positional validity calls, session-bearing reads, helper threading, and diff-visible call sites.
- `Test-Path ...oxp-10-office-data-mongo-migration-codex-findings.md` → `False` before creating this file.

Pass 2 commands:

- `Get-Content`/line-numbered `Get-Content` for each Pass 2 file listed above; `Select-String` on the bloodline seed’s `existingBy|duplicate|orphan|DIFFERS|toInsert|insertMany|createIndex` block → office reconciliation matched the precedent for valid kinds but diverged at `keyOf()` for unknown kinds.
- `rg -n "setupDb\(|teardownDb\(|office_content" server/tests --glob '*.js'` and `rg -n "dropDatabase|drop\(|deleteMany\(\{\}\)|office_content" ...` → confirmed the broad setup blast radius, no `office_content` cleanup, and no global test-DB reset.
- `rg -n "getMeritCaps|meritCap\(" ...` → all server call sites apply `|| 5`; all client call sites use `meritCap()`, which applies the same fallback.
- `rg -n "loadOfficeContent|officeEntry\(" ...`, boot-path reads of `app.js`/`admin.js`, and render-path reads of `office-tab.js`/`sheet.js` → app boot awaits the load before interaction/render; admin renders characters after its awaited load. No production refetch caller exists.
- Inline Node/Ajv integrity/schema driver → unknown category rejected; empty manoeuvre effect rejected; an unlisted merit intentionally produced no error; caps `0`, `-1`, `1.5`, and `'3'` rejected; all five real seed docs validated; a document combining both shapes validated against neither, not both.
- Inline Node cache driver → two overlapping loads made exactly one fetch; a later sequential call made a second fetch and replaced the cache; missing merit defaulted to 5.
- `rg` mutation search over the two client consumers → neither consumer mutates the returned office document/arrays.
- `$env:MONGODB_DB='tm_game_test'; node scripts/seed-office-content.js` against the configured URI → failed before handshake with `MongoServerSelectionError: connect EACCES ...:27017`; this was not reported as a seed/test pass.

Pass 3a commands:

- Story heading search showed Dev Agent Record begins at line 346; `Get-Content ... | Select-Object -First 308` read only the authorized pre-record sections.
- `rg -n "checkIntegrity|buildSeedDocs|seedOfficeContent|officeContentSchema|..." server/tests --glob '*.test.js'` → no direct office-content integrity, reconciliation, schema, generation, failure-state, copy, or miss-registry suite; matches were bloodline tests or incidental office render setup.
- `rg` for Administrator/no-rules assertions in the dependent suites → existing route/render tests cover several no-document paths.
- `rg -n "office_content" server/routes public/js server/index.js --glob '*.js'` → only the GET route and reads; no `POST`/`PATCH`/`DELETE` office-content handler.
- `Get-Content` ranges and `git diff fcf5bd2b..5c3d168e -- specs/reference-data-ssot.md specs/epic-oxp-office-xp-economy.md` → AC9 documentation edits exist, including the read-only/Administrator caveat and merits/devotions correction.
- `git diff --name-only fcf5bd2b..5c3d168e -- public server` → enumerated the reviewed production/test file set and confirmed no hidden oxp-10 test file.

Pass 3b commands:

- `Get-Content ...story... | Select-Object -Skip 345` → read the complete Dev Agent Record.
- `rg -n "office-data\.js|\bOFFICE_DATA\b|\bMERIT_DOT_CAPS\b" public server` → no live import of the deleted module; intentional frozen-seed identifiers remain in tests, and multiple stale prose references remain in older source/tests.
- Mongo availability checks: `Get-Command mongod` found no PATH entry; `Get-Process -Name mongod` found PID 7096; `netstat -ano | Select-String '\s7096$'` showed `127.0.0.1:27017 LISTENING`; direct MongoClient `ping` to that URI returned 1. `Get-CimInstance` was denied, `Get-NetTCPConnection` did not return usable results, and `Get-Command mongosh` found no shell. `server/db.js` against the plain local daemon failed `ECONNRESET` because the repository forces TLS.
- **Exact mandated 11-file gate, current configured connection:** `npx vitest run tests/office-merit-dots.test.js tests/oxp-1-office-seats.test.js tests/oxp-3-office-manoeuvre-rank.test.js tests/oxp-4-merit-persistence-handover.test.js tests/oxp-5-handover-logic.test.js tests/oxp-7-office-merits-empty-list-guard.test.js tests/oxp-7-sheet-office-merits-section.test.js tests/oxp-9-spend-routes-through-oaq.test.js tests/issue-1141-office-data-sync.test.js tests/issue-1141-office-tab-render.test.js tests/issue-1143-db-setup-skip.test.js` → 11 files passed at file level, **208 passed / 174 skipped / 382 total**. The 174 DB-backed skips are not counted as passes.
- A one-line temporary `server/db.js` edit disabled TLS only for `mongodb://127.0.0.1`; `git diff -- server/db.js` was empty before the edit. Running the same gate against the existing standalone local daemon reached all tests but yielded **332 passed / 50 failed**, with transaction-dependent routes returning 500 because standalone MongoDB does not support those transactions; this run is environmental and not treated as a regression result.
- `C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe` was located. An initial `D:\tmp` dbpath creation was denied; an initial unquoted workspace path launch exited; a foreground diagnostic launch timed out after proving startup; the corrected hidden `Start-Process` launch on port 27018 plus an inline `replSetInitiate` driver produced `replica set primary reachable: 1`.
- **Exact mandated 11-file gate, isolated transaction-capable replica set:** same command with `MONGODB_URI=mongodb://127.0.0.1:27018/?replicaSet=oxp10rs` → **381 passed / 1 failed / 0 skipped / 382 total; 10 files passed, 1 failed**. Failure: `oxp-1-office-seats.test.js:628`, expected 7 seats, received 10.
- `npx vitest run tests/oxp-1-office-seats.test.js` immediately in isolation → **49 passed / 1 failed**, same assertion, received 11 seats. This contradicts the record’s “reproduced clean in isolation” claim; I did not rerun the full gate a second time because the required inconsistent case itself reproduced in the isolated rerun.
- `npx vitest run tests/issue-1143-db-setup-skip.test.js` on the current file → **3/3 passed**. Temporarily removing only the catch around `ensureOfficeContentSeeded()` and rerunning → **2 passed / 1 failed**, positive control expected true but received false. Restoring the catch and rerunning → **3/3 passed**.
- `$env:MONGODB_URI=...27018...; npx vitest run tests/api-rules-offering.test.js tests/rule-engine-integration.test.js tests/ws-fanout.test.js` → aggregate **11 passed / 1 failed / 7 skipped** plus one failed suite. `api-rules-offering` passed; `rule-engine-integration` failed because the isolated DB had no `rule_grant` fixtures (its 7 tests skipped after the suite setup error); `ws-fanout` failed because it found two textual `ws.send(` occurrences instead of one. No failure or message involved office content or any oxp-10 file.
- The AC6 ordering assertion was read at `issue-1141-office-tab-render.test.js:286`: it maps all five real Primogen names to `html.indexOf`, asserts every name is present, and compares each successive position. Its `beforeAll` builds the payload with the real `buildSeedDocs({ officeData: OFFICE_DATA, ... })`, stubs `/api/office_content`, awaits the real cache loader, and then imports/renders `office-tab.js`. The complete file passed in both exact gate executions.
- `$env:MONGODB_URI=...27018...; $env:MONGODB_DB='tm_game_test'; node scripts/seed-office-content.js` → real dry-run succeeded: 4 offices, **10** merit caps, all five documents present, would insert 0.
- Isolated `oxp10_review_test` driver inserted `{kind:'legacy', category:'Old Office'}` and ran real `seedOfficeContent({dryRun:false})` → script returned success with `inserted: 4`, `differing: merit_caps`, `orphans: []`, and `hasMeritCaps: 0`; the driver verified the exact database name, dropped only that isolated database, and closed.
- `rg -n "updateOne|upsert|createIndex|..." server/scripts/seed-office-seats.mjs` → concurrent natural-key upserts have no matching unique index, explaining why “atomic upsert” alone does not guarantee seven documents.
- Temporary cleanup: restored `server/db.js`; stopped only the launched replica-set PID; recursive `Remove-Item` was blocked by policy, so I verified the exact temp root, emptied only its files, deleted the emptied files with `apply_patch`, removed the now-empty literal directories non-recursively, and confirmed `Test-Path '.tmp-oxp10-mongo-review'` → `False`.
- Final restoration checks: `git diff -- server/db.js server/tests/helpers/db-setup.js` → empty. Both files were mechanically returned to CRLF after patching so `git status` no longer marked them modified.

### What could not be run / final workspace state

- I did **not** rerun the full 4,430-test suite (explicitly optional and approximately 18 minutes). I ran the requested three-file representative spot-check instead.
- I could not run DB-backed tests against the configured Atlas URI because network access was denied (`EACCES`). The isolated local replica set supplied real transaction-capable MongoDB coverage, but required the disclosed temporary localhost-TLS compatibility line; that line was restored exactly.
- The configured plain local daemon could not validate transaction paths because it is standalone. Those 50 standalone failures were superseded by the isolated replica-set run and are not attributed to the change.
- Final `git status --short` contains only this requested findings file plus untouched untracked review inputs/artifacts that I did not create or modify: `oxp-10-office-data-mongo-migration-diff.txt`, `oxp-10-office-data-mongo-migration-codex-review.md`, and `oxp-10-office-data-mongo-migration-codex-run.log`. No reviewed source file has a content diff; all temporary edits and the temporary MongoDB data tree were restored/removed.
