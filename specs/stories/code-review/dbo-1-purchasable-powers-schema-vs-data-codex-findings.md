# Adversarial review: dbo-1-purchasable-powers-schema-vs-data

## High

- None found.

## Medium

### [Pass 1] A stale plan can remove a concurrently-added protected `special: 'standing'` value

- **Severity**: Medium
- **File:line**: `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs:135`, `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs:145`
- **Triggering input or sequence**: `planCleanup` sees a document with `special: null` and records `unsetSpecial: true`; before `applyCleanup` writes, another actor changes that same document to `special: 'standing'`. The second read backs up the new state, but `updateOne` still executes the stale, unconditional `$unset` selected by the first read.
- **Observable consequence**: A now-valid, live-code-significant standing marker is removed. The JSON backup contains the pre-write value and permits manual recovery, but it does not prevent the incorrect write, and the script neither rechecks the predicate nor acknowledges the two-fetch/stale-plan window. For a manually invoked one-off script the likelihood is narrow, but the affected value is precisely the value the script promises never to touch.
- **Confidence**: High; the two reads and the later `_id`-only update predicate are explicit in the diff.

### [Pass 1] The DB-backed tests appear to mutate unrelated `tm_suite_test` documents

- **Severity**: Medium
- **File:line**: `server/tests/dbo-1-purchasable-powers-schema-cleanup.test.js:134`, `server/tests/dbo-1-purchasable-powers-schema-cleanup.test.js:171`
- **Triggering input or sequence**: Each apply test calls `planCleanup(getCollection('purchasable_powers'))`, which scans the entire collection, and passes the full plan to `applyCleanup(..., { apply: true })`. The visible cleanup hook deletes only keys matching `^dbo-1-test-`.
- **Observable consequence**: Unless the unseen test helper gives this suite a freshly isolated collection, running these tests strips `selected`/invalid `special` from pre-existing test rows outside the suite's fixture prefix and does not restore them. That can make later tests order-dependent and means the suite is not isolated merely because it targets `tm_suite_test`.
- **Confidence**: Medium at this blind stage; the collection-wide calls and prefix-only teardown are certain from the diff, but repository context may show that `setupDb()` resets the database or otherwise isolates the collection.

### [Pass 2] The active Necropolis seeder reintroduces both fields after cleanup

- **Severity**: Medium
- **File:line**: `server/scripts/seed-rules-necropolis.js:79`, `server/scripts/seed-rules-necropolis.js:82`, `server/scripts/seed-rules-necropolis.js:294`
- **Triggering input or sequence**: After the DBO-1 cleanup has removed `special: null` and `selected`, an operator runs the still-active `server/scripts/seed-rules-necropolis.js --apply`. `_baseDoc()` supplies `special: null` and `selected: true` to all nine Necropolis merits. `_docDiffers()` treats the now-absent fields as a difference, and `replaceOne(..., { upsert: true })` writes the legacy shape back.
- **Observable consequence**: Those nine rule documents once again fail the schema because `selected` remains undeclared, undoing the cleanup and falsifying the schema comment's assertion that neither field is being re-seeded by anything live. This is not a boot-time loop and requires a manual apply, so it does not make the one-off cleanup immediately unsafe, but the supposedly idempotent end state is not durable across an existing supported seeder workflow.
- **Confidence**: High; the producer, comparison, and replacement paths are explicit in the current repository source.

### [Pass 3a] The shipped schema is a literal deviation from AC1's required code block

- **Severity**: Medium
- **File:line**: `specs/stories/dbo-1-purchasable-powers-schema-vs-data.md:82`, `server/schemas/purchasable_power.schema.js:238`
- **Triggering input or sequence**: Compare AC1's exact multi-line `oneOf` declaration with the shipped `special: { type: ['string', 'null'], enum: ['standing', null] }` declaration.
- **Observable consequence**: The implementation does not satisfy AC1's literal wording or the repository-pattern rationale stated in Dev Notes. There is no observable validation difference for the four required cases: both declarations accept `'standing'`, `null`, and absence, and both reject `'anything-else'`. This is therefore an acceptance/traceability defect rather than a runtime schema bug.
- **Confidence**: High; the source differs verbatim, and a direct Ajv comparison returned identical results for all four AC cases.

### [Pass 3a] AC3's byte-for-byte assertion is weakened by deleting `selected` from both sides

- **Severity**: Medium
- **File:line**: `specs/stories/dbo-1-purchasable-powers-schema-vs-data.md:117`, `server/tests/dbo-1-purchasable-powers-schema-cleanup.test.js:151`
- **Triggering input or sequence**: The standing fixture itself carries `selected: true`. After apply, the test destructures `selected` out of the before and after documents and compares only the remainders.
- **Observable consequence**: The test proves that `special: 'standing'` and every field other than the deliberately removed `selected` are unchanged, but it does not literally prove AC3's statement that the standing document is “byte-for-byte unchanged afterward.” AC2 requires `selected` to be removed everywhere, so the clean way to satisfy both literal requirements is a standing-only fixture for the byte-for-byte assertion plus a separate standing-with-selected fixture for the mixed-field behavior.
- **Confidence**: High.

### [Pass 3b] The DB-backed half and prove-discrimination claim could not be verified here

- **Severity**: Medium
- **File:line**: `specs/stories/dbo-1-purchasable-powers-schema-vs-data.md:291`, `server/tests/dbo-1-purchasable-powers-schema-cleanup.test.js:66`
- **Triggering input or sequence**: Run the new test file in this review environment, then temporarily remove the `doc.special !== 'standing'` guard and run it again. Atlas access fails with `connect EACCES 159.143.141.178:27017`, so `describe.skipIf(!dbAvailable)` skips all five script tests in both runs.
- **Observable consequence**: Both the normal and intentionally broken implementations report the same `5 passed | 5 skipped (10)` result. I could verify the five pure schema tests, but not the real Mongo `$unset`, backup, idempotency, byte-preservation, or the record's “exactly two failures” discrimination claim. This does not prove the author's historical real-Atlas run was false; it makes that claim unverifiable in my environment and prevents this review from supplying an independent DB-backed pass.
- **Confidence**: High about this review's result and limitation.

### [Pass 3b] The mandatory eight-file gate currently has more than the documented #1115 failure

- **Severity**: Medium
- **File:line**: `server/tests/n7-n9-allocator-readers.test.js:246`, `server/tests/oath-a-pledge-helpers.test.js:388`
- **Triggering input or sequence**: Run the exact eight-file gate mandated by the review instructions.
- **Observable consequence**: The real total is 193 tests: 161 passed, 2 failed, and 30 skipped; Vitest reports 4 failed and 4 passed files. One assertion failure is the documented #1115 600-character source-window check. The other is the added OATH-A pledge-helper source-contract check, which expects LF text but reads CRLF in this workspace. In addition, `oath-a-d8-api-roundtrip` and `oath-b-d6-api-roundtrip` fail suite setup/cleanup when Atlas access is denied, with all 25 of their tests skipped; the DBO-1 suite supplies the other five skips. Therefore the current required gate cannot be represented as “127/128, only #1115.”
- **Confidence**: High; these are Vitest's emitted counts and errors.

### [Pass 3b] The record's “DB tests scoped to a key prefix” assurance is false

- **Severity**: Medium
- **File:line**: `specs/stories/dbo-1-purchasable-powers-schema-vs-data.md:298`, `server/tests/dbo-1-purchasable-powers-schema-cleanup.test.js:134`
- **Triggering input or sequence**: Run an apply-mode test while `tm_suite_test.purchasable_powers` contains any non-`dbo-1-test-` document carrying `selected` or a cleanup-eligible `special` value.
- **Observable consequence**: Fixture insertion/deletion is prefix-scoped, but the operation under test is not: `planCleanup` scans the entire collection and `applyCleanup` updates every returned row. Unrelated test-database documents are modified and not restored. The completion note's safety assurance overstates the isolation and matches the Pass 1 mutation concern rather than resolving it.
- **Confidence**: High after reading `setupDb()`; it connects and checks the `_test` suffix but does not reset or isolate the collection.

## Low

### [Pass 1] Unknown CLI arguments and misspelled apply flags are silently accepted

- **Severity**: Low
- **File:line**: `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs:154`
- **Triggering input or sequence**: An operator invokes the script with an unexpected argument such as `--aply`, `--dry-run`, or a positional value; `main()` checks only `argv.includes('--apply')` and validates nothing else.
- **Observable consequence**: The process connects to the configured database and performs a dry run, then exits successfully. This is fail-closed with respect to writes, but an operator can mistake a typo for a completed apply or unintentionally read the production database without receiving an argument error.
- **Confidence**: High.

### [Pass 1] Apply-mode tests leave timestamped backup artifacts behind

- **Severity**: Low
- **File:line**: `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs:132`, `server/tests/dbo-1-purchasable-powers-schema-cleanup.test.js:136`
- **Triggering input or sequence**: Any DB-backed test calling `applyCleanup(..., { apply: true })` writes a JSON file to the script's fixed `_backups` directory; the test has no hook that removes files written there.
- **Observable consequence**: Repeated test runs accumulate workspace artifacts containing snapshots of all planned test-database rows. Git ignore rules may keep them out of version control, but the filesystem pollution and retention are still real.
- **Confidence**: High from the diff; whether the directory is ignored is not yet known in this pass.

### [Pass 1] Backup and cleaned totals can legitimately diverge without explanation

- **Severity**: Low
- **File:line**: `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs:135`, `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs:146`, `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs:152`
- **Triggering input or sequence**: A planned row exists during the backup read but its update later reports `modifiedCount: 0` because it was concurrently cleaned or changed; alternatively, a planned row is deleted before the backup read and is absent from `originals`.
- **Observable consequence**: The returned totals can report more documents backed up than cleaned, or fewer documents backed up than were planned. Each individual field remains numerically honest (`backedUp` is the number fetched; `cleaned` is the number reporting a modification), but the script emits no warning that some planned work was not both backed up and modified, so an operator can miss concurrency or drift.
- **Confidence**: High about the accounting behavior; Low-to-medium about operational impact for a one-off invocation.

### [Pass 2] The normal Rule Data UI cannot create or repair a standing marker

- **Severity**: Low
- **File:line**: `public/js/admin/rules-view.js:325`, `public/js/admin/rules-view.js:365`, `server/routes/rules.js:69`
- **Triggering input or sequence**: An ST opens either the add or edit Rule Data modal for a merit. Neither modal renders a `special` control, and `PUT` omits it from `UPDATABLE_FIELDS`. A JSON data-portability import can carry `special` when it falls back to POST for a new record, but the ordinary add form and CSV import cannot, and an existing row cannot be repaired via PUT.
- **Observable consequence**: A future third event-granted merit cannot be marked through the normal Rule Data authoring flow; it requires a hand-crafted POST, a full JSON import that creates a new record, or direct/code-managed database work. This is an operational asymmetry, not a current runtime regression, and later scope decisions may deliberately accept it.
- **Confidence**: High.

### [Pass 2] Ajv treats an explicitly `undefined` property as absent

- **Severity**: Low
- **File:line**: `server/schemas/purchasable_power.schema.js:238`
- **Triggering input or sequence**: Non-JSON JavaScript code directly validates `{ key, name, category, special: undefined }` with the repository's Ajv configuration.
- **Observable consequence**: Validation succeeds even though `undefined` is neither one of the declared types nor an enum member. A real JSON POST cannot represent this value (serialization omits it), so the production route is not exposed; the discrepancy matters only to direct in-process schema consumers and is a precise edge-case caveat to the apparent type contract.
- **Confidence**: High; the direct Ajv probe returned `true` for own-property `undefined`, while rejecting `0`, `false`, `''`, `'Standing'`, and `'standing '`.

### [Pass 3a] The replacement comment re-narrates the investigation instead of being a short pointer

- **Severity**: Low
- **File:line**: `specs/stories/dbo-1-purchasable-powers-schema-vs-data.md:92`, `server/schemas/purchasable_power.schema.js:219`
- **Triggering input or sequence**: Read the replacement block against AC1's instruction to replace the old investigation with “a short pointer to the epic's own DBO-1 section.”
- **Observable consequence**: The shipped block spends roughly twenty lines restating issue history, the seeding conclusion, the archived script, cleanup behavior, DBO-3 behavior, live row counts, and named merits before finally pointing to the epic. It fails the literal brevity requirement and duplicates facts that can drift; the active Necropolis seeder has already made its “neither ... is being re-seeded” statement inaccurate.
- **Confidence**: High.

## Validation notes

### Ship assessment

This change **needs patches before shipping as-is**. There is no High-severity blocker, and the core schema predicate is behaviorally correct, but the active Necropolis seeder can undo the cleanup, the apply tests are not collection-isolated, the stale-plan window can remove a newly-added standing marker, and the implementation has literal AC deviations. In this environment, the DB-backed behavior also remains unverified because Atlas was unreachable.

### Pass order and files opened

- **Pass 1**: Opened only `specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-diff.txt`. I did not open imports, repository context, the story, the epic, tracking files, or any sibling repository. I wrote the complete Pass 1 findings to this report before advancing.
- **Pass 2**: Opened `server/schemas/purchasable_power.schema.js`, `server/routes/rules.js`, `public/js/editor/merits.js`, `server/tests/helpers/db-setup.js`, `server/db.js`, `server/config.js`, `.gitignore`, `public/js/admin/rules-view.js`, `server/scripts/archive/ingest-excel.js`, `server/vitest.config.js`, `server/tests/helpers/setup-env.js`, `server/package.json`, `public/js/admin/data-portability.js`, relevant slices of `server/scripts/archive/seed-purchasable-powers.js`, and `server/scripts/seed-rules-necropolis.js`. Source searches were limited to this repository and excluded `specs/**` while the story was still blinded. I froze Pass 2 findings before opening the story.
- **Pass 3a**: Lazily read `specs/stories/dbo-1-purchasable-powers-schema-vs-data.md` only from the start up to, but not including, the `## Dev Agent Record` heading. Opened `server/scripts/migrate-office-purchases-to-seats.mjs`. I froze Pass 3a findings before reading the record.
- **Pass 3b**: Read the story from `## Dev Agent Record` through EOF, then opened `CLAUDE.md` only to confirm the #1115 note. Test runs loaded the eight named test files and their normal in-repo dependencies. `server/tests/dbo-3-standing-merit-filter.test.js` was also checked directly against base commit `2534c559` and has no diff.
- No sibling repository was opened, read, searched, or otherwise used. I did not open the epic or sprint tracking file. I did not read ahead between passes.

### Commands run, in order

Pass 1:

1. `Get-Content -Raw -LiteralPath 'specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-diff.txt'` — succeeded and supplied the only Pass 1 input.

Pass 2:

1. One parallel diagnostic batch ran these four PowerShell commands:
   - `Get-Content -Raw -LiteralPath 'server/schemas/purchasable_power.schema.js'; Get-Content -Raw -LiteralPath 'server/routes/rules.js'`
   - `Get-Content -Raw -LiteralPath 'public/js/editor/merits.js'; Get-Content -Raw -LiteralPath 'server/tests/helpers/db-setup.js'`
   - `Get-Content -Raw -LiteralPath 'server/db.js'; Get-ChildItem -File -LiteralPath 'server' -Filter '*vitest*'; Get-Content -Raw -LiteralPath 'server/vitest.config.js'`
   - `rg -n --glob '!specs/**' --glob '!node_modules/**' "special|selected|POST /api/rules|/api/rules" server public; Get-Content -Raw -LiteralPath '.gitignore'; Get-Content -Raw -LiteralPath 'server/.gitignore' -ErrorAction SilentlyContinue`
   The batch returned nonzero/truncated because `server/.gitignore` is absent and the first search was excessively broad. It made no writes and did not invoke MongoDB. I reran narrower reads below.
2. `Get-Content -Raw -LiteralPath 'server/schemas/purchasable_power.schema.js'; Get-Content -Raw -LiteralPath 'server/routes/rules.js'` — succeeded.
3. `Get-Content -Raw -LiteralPath 'public/js/editor/merits.js'; Get-Content -Raw -LiteralPath 'server/tests/helpers/db-setup.js'; Get-Content -Raw -LiteralPath 'server/db.js'; Get-Content -Raw -LiteralPath 'server/config.js'` — succeeded.
4. `rg --files public server | rg "(rules-view|ingest-excel|setup-env|vitest|package\\.json)$|rules-view|ingest-excel|setup-env|vitest"` — succeeded and located the relevant files.
5. `Get-Content -Raw -LiteralPath 'public/js/admin/rules-view.js'; Get-Content -Raw -LiteralPath 'server/scripts/archive/ingest-excel.js'; Get-Content -Raw -LiteralPath 'server/vitest.config.js'; Get-Content -Raw -LiteralPath 'server/tests/helpers/setup-env.js'; Get-Content -Raw -LiteralPath 'server/package.json'` — succeeded; output was truncated, so relevant slices were reread later.
6. `rg -n "rule\\.special|special\\s*:|selected\\s*:|/api/rules|purchasable_powers" public/js server --glob '*.js' --glob '*.mjs' --glob '!server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs' --glob '!server/tests/dbo-1-purchasable-powers-schema-cleanup.test.js'; rg -n "handleModalSave|apiPost|apiPut|data-field=\\"special\\"|data-field=\\"selected\\"" 'public/js/admin/rules-view.js'` — the first search succeeded; the second regex was malformed and made the compound command exit 1. No writes occurred.
7. `$rv = Get-Content -LiteralPath 'public/js/admin/rules-view.js'; $rv[430..520]; $dp = Get-Content -LiteralPath 'public/js/admin/data-portability.js'; $dp[250..460]; $dp[530..585]` — succeeded.
8. `rg -n "function rulesHeaders|special|selected" 'public/js/admin/data-portability.js'; $seed = Get-Content -LiteralPath 'server/scripts/archive/seed-purchasable-powers.js'; $seed[120..145]; $seed[180..205]; $seed[240..292]; $nec = Get-Content -LiteralPath 'server/scripts/seed-rules-necropolis.js'; $nec[65..88]` — succeeded.
9. `Get-Content -Raw -LiteralPath 'server/scripts/seed-rules-necropolis.js'; rg -n "seed-rules-necropolis|selected\\s*:|special\\s*:" server public/js --glob '*.js' --glob '*.mjs' --glob '!server/scripts/archive/**' --glob '!server/tests/**' --glob '!server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs'` — succeeded and exposed the active re-seeder.
10. `node --input-type=module -e 'import Ajv from "ajv"; import { purchasablePowerSchema as schema } from "./schemas/purchasable_power.schema.js"; const validate = new Ajv({allErrors:true,strict:false}).compile(schema); const base={key:"edge-case",name:"Edge Case",category:"merit"}; const vals=[["standing","standing"],["null",null],["Standing","Standing"],["standing-space","standing "],["empty",""],["undefined",undefined],["zero",0],["false",false]]; for (const [label,value] of vals) console.log(`${label}: ${validate({...base,special:value})}`); console.log(`absent: ${validate({...base})}`);'` — succeeded. Results: `standing`, `null`, explicit `undefined`, and absent passed; `Standing`, `standing `, empty string, zero, and false failed.

Pass 3a:

1. `foreach ($line in [System.IO.File]::ReadLines((Resolve-Path -LiteralPath 'specs/stories/dbo-1-purchasable-powers-schema-vs-data.md'))) { if ($line -eq '## Dev Agent Record') { break }; $line }` — succeeded and stopped before the record.
2. `Get-Content -Raw -LiteralPath 'server/scripts/migrate-office-purchases-to-seats.mjs'` — succeeded. The new script follows its plan/apply/main skeleton, but lacks the reference script's optimistic-concurrency guards, matching the Pass 1 race finding.
3. `node --input-type=module -e 'import Ajv from "ajv"; const a=new Ajv({strict:false}); const shipped={type:["string","null"],enum:["standing",null]}; const required={oneOf:[{type:"string",enum:["standing"]},{type:"null"}]}; const va=a.compile({type:"object",properties:{special:shipped}}); const vb=a.compile({type:"object",properties:{special:required}}); const cases=[["standing",{special:"standing"}],["null",{special:null}],["absent",{}],["anything-else",{special:"anything-else"}]]; for(const [label,value] of cases) console.log(`${label}: shipped=${va(value)}, AC1=${vb(value)}`);'` — succeeded; both forms returned `true, true, true, false` for the four cases.
4. `$n=0; foreach ($line in [System.IO.File]::ReadLines((Resolve-Path -LiteralPath 'specs/stories/dbo-1-purchasable-powers-schema-vs-data.md'))) { $n++; if ($line -eq '## Dev Agent Record') { break }; if ($line -match 'special: \\{|short pointer|byte-for-byte|following|Neither field is re-seeded|nothing active can write either back') { "${n}:$line" } }` — succeeded without crossing the record heading.

Pass 3b:

1. `$emit=$false; foreach ($line in [System.IO.File]::ReadLines((Resolve-Path -LiteralPath 'specs/stories/dbo-1-purchasable-powers-schema-vs-data.md'))) { if ($line -eq '## Dev Agent Record') { $emit=$true }; if ($emit) { $line } }` — succeeded and read the record only after Pass 3a was frozen.
2. `git status --short; git diff -- 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs'` — succeeded but status output was extremely large because the user workspace already contains many unrelated untracked files. The cleanup script itself had no working-tree diff.
3. `npx vitest run tests/dbo-1-purchasable-powers-schema-cleanup.test.js` — exit 0; 1 file passed, **5 tests passed and 5 skipped**. The DB-backed half did not run.
4. `npx vitest run tests/dbo-3-standing-merit-filter.test.js` — exit 0; **17/17 passed**.
5. `npx vitest run tests/dbo-1-purchasable-powers-schema-cleanup.test.js tests/dbo-3-standing-merit-filter.test.js tests/n7-n9-allocator-readers.test.js tests/oath-a-d8-api-roundtrip.test.js tests/oath-a-pledge-helpers.test.js tests/oath-a-render-and-gate.test.js tests/oath-b-d6-api-roundtrip.test.js tests/oath-b-suspension.test.js` — exit 1; **193 total: 161 passed, 2 failed, 30 skipped; 4 files failed, 4 passed**. The exact failures and DB errors are recorded above.
6. `Get-FileHash -Algorithm SHA256 -LiteralPath 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs'; git status --short -- 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs' 'specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-codex-findings.md'; git diff -- 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs'` — baseline hash `B2770C88A96D98AACFDBC82E58803FED025D9DB15C20DFB78AD148A67C9C1025`; only this report was untracked in the scoped status.
7. Temporarily changed the guard from `hasOwnProperty(...) && doc.special !== 'standing'` to `hasOwnProperty(...)` with `apply_patch`, then ran `npx vitest run tests/dbo-1-purchasable-powers-schema-cleanup.test.js` — exit 0; still **5 passed, 5 skipped**, so the environment could not reproduce the claimed two failures.
8. Restored the guard with `apply_patch`, then ran `Get-FileHash -Algorithm SHA256 -LiteralPath 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs'; git diff --exit-code -- 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs'; git status --short -- 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs' 'specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-codex-findings.md'` — exit 0; the SHA-256 returned exactly to `B2770C88A96D98AACFDBC82E58803FED025D9DB15C20DFB78AD148A67C9C1025`, the script diff was empty, and only this report appeared in scoped status.
9. `npx vitest run tests/dbo-1-purchasable-powers-schema-cleanup.test.js tests/dbo-3-standing-merit-filter.test.js tests/n7-n9-allocator-readers.test.js tests/oath-a-d8-api-roundtrip.test.js tests/oath-b-d6-api-roundtrip.test.js tests/oath-b-suspension.test.js` — the author's identifiable six-file subset; exit 1; **128 total: 97 passed, 1 failed, 30 skipped; 3 files failed, 3 passed**. The 128 denominator is internally explainable from the six files named in Task 4, but this environment did not reproduce 127/128 because Mongo-backed suites skipped/errored.
10. `git diff --exit-code 2534c559 -- 'server/tests/dbo-3-standing-merit-filter.test.js'; git diff --name-only 2534c559 -- 'server/schemas/purchasable_power.schema.js' 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs' 'server/tests/dbo-1-purchasable-powers-schema-cleanup.test.js' 'server/tests/dbo-3-standing-merit-filter.test.js'` — exit 0; DBO-3's test is untouched, and only the schema, cleanup script, and new test differ from base among those paths.
11. ``rg -n "10 new tests|scoped to a `dbo-1-test-|Full targeted gate|byte-for-byte test|condensed pointer|Live dry-run sanity|Implementation deviates" 'specs/stories/dbo-1-purchasable-powers-schema-vs-data.md'`` — succeeded; PowerShell backtick parsing prevented one intended scoped-text hit, so the exact lines were reread next.
12. `$s=Get-Content -LiteralPath 'specs/stories/dbo-1-purchasable-powers-schema-vs-data.md'; for($i=284;$i -le 305;$i++){ '{0}:{1}' -f ($i+1),$s[$i] }` — succeeded and captured record lines 285-306.
13. `rg -n "1115|n7-n9|allocator-readers|pledge-helpers" 'CLAUDE.md'` — succeeded; line 41 documents the #1115 source-window failure.
14. `rg -n "^## |^### \\[|^### Ship|^### Pass|^### Commands|^### Checks|^### Could|^### Modification|^- None found\\." 'specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-codex-findings.md'; Get-Content -Tail 45 -LiteralPath 'specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-codex-findings.md'; Get-FileHash -Algorithm SHA256 -LiteralPath 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs'; git diff --exit-code -- 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs'; git status --short -- 'server/schemas/purchasable_power.schema.js' 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs' 'server/tests/dbo-1-purchasable-powers-schema-cleanup.test.js' 'server/tests/dbo-3-standing-merit-filter.test.js' 'specs/stories/dbo-1-purchasable-powers-schema-vs-data.md' 'specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-codex-findings.md'` — exit 0; headings were present, the script hash still matched, its diff remained empty, and the scoped status showed only this report as untracked.
15. `Get-FileHash -Algorithm SHA256 -LiteralPath 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs'; git diff --exit-code -- 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs'; git status --short -- 'server/schemas/purchasable_power.schema.js' 'server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs' 'server/tests/dbo-1-purchasable-powers-schema-cleanup.test.js' 'server/tests/dbo-3-standing-merit-filter.test.js' 'specs/stories/dbo-1-purchasable-powers-schema-vs-data.md' 'specs/stories/code-review/dbo-1-purchasable-powers-schema-vs-data-codex-findings.md'` — final verification: exit 0, restored hash unchanged, cleanup-script diff empty, and only this report present in the scoped status.

I also consulted the [official MongoDB `$unset` update-operator documentation](https://www.mongodb.com/docs/manual/reference/operator/update/unset/) (read-only web lookup). It explicitly states that the specified value in the `$unset` expression does not affect the operation, confirming that assigning `''` is inert and not a defect.

### Checks that did not produce findings

- The actual cleanup comparison is strict `doc.special !== 'standing'`; there is no coercion, trimming, or case normalization on the path from the Mongo document to that comparison.
- MongoDB ignores the value assigned to a `$unset` field, so `unset.selected = ''` and `unset.special = ''` are conventional and safe.
- Hand-tracing successful writes confirms idempotency: after all planned fields are absent, both `hasOwnProperty` checks are false and `planCleanup` omits the documents.
- A missing `key` does not throw; planning preserves `key: undefined`, and logging falls back to `_id`.
- The top-level schema has no conditional `oneOf`/`anyOf` branch involving `special`; declaring it does not change resolution of the existing prerequisite/rating/forfeiture branches.
- Collection-wide cleanup is consistent with the archived original seeder, which placed `special: null` on several non-merit categories. The only production reader is still the exact `rule.special === 'standing'` merit predicate. The wider collection scope itself is therefore not a current category bug.
- Two concurrent apply runs are mostly idempotent: absent other writes, one cleans and the other reports `modifiedCount: 0`. The material concurrency issue is the stale-plan standing-marker sequence already reported in Pass 1.
- The author record's AC1 deviation disclosure is accurate, and its behavioral-equivalence claim is correct for the AC cases.
- DBO-3's test file is absent from the supplied diff, unchanged from base, and passed 17/17 here.

### Could not run or deliberately did not run

- **DB-backed DBO-1 tests**: could not run for real because Atlas connection attempts failed with `connect EACCES 159.143.141.178:27017`. They skipped rather than passed.
- **Mongo-backed oath API suites**: could not run because the same Atlas connection failed; unlike the DBO-1 suite, their setup/cleanup errors also failed the files.
- **Prove-discrimination's two expected failures**: could not reproduce because both protecting tests were in the skipped DB block.
- **Live `tm_suite` dry run and the “656 documents / MCI/PT only unset selected” claim**: deliberately not attempted. The review instructions expressly prohibit invoking this script's `main()` or CLI under any circumstances. I therefore treat the author-record live dry-run claim as unverifiable by me, not as confirmed or disproved.
- **Any `--apply` invocation**: deliberately never attempted against any database.

### Modification and restore attestation

I created and progressively froze only this requested findings file. I temporarily changed exactly one cleanup-guard line for the discrimination attempt, restored it immediately with `apply_patch`, verified the before/after SHA-256 was identical, and verified `git diff --exit-code -- server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs` returned clean. The workspace already had a very large number of unrelated untracked user files before that experiment; I did not touch them. The final scoped status check showed only this report as the review's intentional new file.
