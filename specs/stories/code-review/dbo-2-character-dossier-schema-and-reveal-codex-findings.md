# Adversarial review: DBO-2 character dossier schema and reveal

## High

### Pass 1

- None found.

### Pass 2

- None found.

### Pass 3a

- None found.

### Pass 3b

- None found.

## Medium

### [Pass 1] A reordered array can make one apply run stamp a shifted fact and miss a planned fact

- **Severity**: Medium
- **File:line**: `server/scripts/dbo-2-dossier-fact-key-backfill.mjs:190`
- **Triggering input or sequence**: `planBackfill` records unkeyed positions, then another actor inserts, removes, or moves an unkeyed fact before `applyBackfill` performs its fresh read. For example, a plan for original indices `[0, 1]` is followed by insertion of another unkeyed fact at index 0; the fresh array's indices 0 and 1 are stamped while the originally planned fact shifted to index 2 is not visited.
- **Observable consequence**: The script can report a successful apply while leaving a fact unkeyed. The per-index `$exists: false` predicate prevents overwriting an already-keyed slot and prevents two concurrent invocations from both modifying the same current slot, but it does not tie a planned index to a stable logical fact. Because UUIDs are fresh and no reveal reference exists yet, stamping the newly inserted unkeyed fact is not itself a wrong-key corruption; a subsequent plan/apply run finds and heals the missed fact. This nevertheless contradicts the comment that write decisions are “re-derived” from the fresh read and the stronger claim that the migration is not vulnerable to positional changes.
- **Confidence**: High; the stale indices are visibly reused against the fresh array, with no identity-stable correlation.

### [Pass 1] Present-but-invalid `fact_key` values are treated as permanently complete

- **Severity**: Medium
- **File:line**: `server/scripts/dbo-2-dossier-fact-key-backfill.mjs:129`
- **Triggering input or sequence**: A fact contains its own `fact_key` property with value `null` or `''` (or any other schema-invalid value). Both planning and applying use property existence as the sole in-memory completeness test, and the database predicate also requires the field not to exist.
- **Observable consequence**: The migration omits the fact and can report “every fact already carries a fact_key,” while the schema shipped in the same diff rejects it (`type: string`, `minLength: 1`). Re-running cannot repair the document. The diff has a schema test proving `''` invalid, but no migration test covering present-invalid values and no normalization/rejection path.
- **Confidence**: High for the code/schema inconsistency; whether such a value exists in current live data remains unverified in the blind pass.

### [Pass 1] The purported BSON-tolerant ID schema accepts arbitrary objects

- **Severity**: Medium
- **File:line**: `server/schemas/character_dossier.schema.js:156`
- **Triggering input or sequence**: Validate a document whose `_id` or `character_id` is `{}` or an unrelated object such as `{ anything: 'at all' }`.
- **Observable consequence**: Ajv accepts the document because the `object` arm has no identifying constraints. An isolated Ajv run confirmed both `{ character_id: {} }` and `{ character_id: { anything: 'at all' }, _id: { bogus: true } }` validate. The schema therefore documents and accepts a materially broader shape than “string or BSON ObjectId,” despite the header describing the object arm as an honest declaration of that live shape.
- **Confidence**: High; reproduced directly with Ajv.

### [Pass 2] The existing haven writer destroys stable identity and recreates an unsafe fact

- **Severity**: Medium
- **File:line**: `server/scripts/_havens-and-locations.js:45`
- **Triggering input or sequence**: A human reruns this still-executable one-off after the backfill. For each matched character, it `$pull`s every existing `haven` fact (including its durable key) and `$push`es a replacement containing only `tag`, `value`, `source`, and `since`.
- **Observable consequence**: The replacement has neither `fact_key` nor required `st_hidden`. It breaks the schema, discards any identity referenced by future reveal preferences, and TM Wiki's documented fail-open reader would expose the replacement because `st_hidden !== true`. The new schema's “every future writer” invariant is therefore not true for the repository as shipped. The script is manual/historical rather than a live route, which limits current reach but does not make rerunning it safe.
- **Confidence**: High; the `$pull` then `$push` write sequence is explicit and the file connects directly to `tm_suite` when invoked.

### [Pass 3a] AC5's fresh-read write-decision requirement is not implemented

- **Severity**: Medium
- **File:line**: `server/scripts/dbo-2-dossier-fact-key-backfill.mjs:190`
- **Triggering input or sequence**: Plan indices from one array layout, then reorder, insert, or remove facts before `applyBackfill` takes the backup/fresh read. The function looks up `facts[i]` only for each stale `row.indices` value rather than deriving all currently unkeyed indices from the freshly read document.
- **Observable consequence**: The implementation fails AC5's literal “the same read that produces the backup is the one the write decisions come from” requirement. Its comments say it re-derives decisions from `originals`, but only the object at each old position is reread; the choice of positions still comes from the stale plan. The concrete runtime consequence is the incomplete first apply described in the Pass 1 positional-race finding.
- **Confidence**: High; this follows directly from comparing AC5's wording with the loop over `row.indices`.

### [Pass 3b] The record's DB-backed green gate is not reproducible and its skip heuristic is false

- **Severity**: Medium
- **File:line**: `specs/stories/dbo-2-character-dossier-schema-and-reveal.md:510`
- **Triggering input or sequence**: Run the mandated `npx vitest run tests/dbo-2-dossier-fact-key.test.js` in the current review environment. Atlas connection attempts fail with `connect EACCES 159.143.141.178:27017`, so `describe.skipIf(!dbAvailable)` skips the eight migration tests. The run was repeated and then run once more after all temporary mutations were restored.
- **Observable consequence**: Every clean run reports **17 passed, 8 skipped (25 total)**, not the record's **25 passed, 0 skipped**. In particular, the record's statement that “a skip would have shown as a lower total” is false under the installed Vitest 4.1.2: skipped tests remain in the displayed total of 25. The current review therefore verifies the 14 Ajv and 3 export/import-contract tests only; it does not verify any DB write, backup, idempotency, concurrent-key guard, or `revealed_to` preservation assertion. The live dry-run and live inventory were also unrepeatable for the same network denial. This does not prove the author's historical Atlas run never occurred, but those claims are unverifiable as stated in this session and must not be inherited as current evidence.
- **Confidence**: High; three clean suite runs produced the same counts, and the read-only live script failed before selecting the database.

## Low

### Pass 1

- None found.

### [Pass 2] A misspelled database override can produce a false-clean migration result

- **Severity**: Low
- **File:line**: `server/db.js:27`
- **Triggering input or sequence**: Invoke the script with a syntactically valid but wrong `MONGODB_DB` value, such as `tm_sutie`, against the real Atlas URI. MongoDB selects that database name without requiring it to pre-exist; reading its absent `character_dossier` collection yields an empty result.
- **Observable consequence**: The script reports `0 document(s) / 0 fact(s) need a fact_key`, the same clean-state count as a completed migration. It does print `Target DB: tm_sutie`, so an attentive operator can catch the typo, but there is no expected-count, collection-existence, or explicit production-name confirmation guard before a later handoff claims completion.
- **Confidence**: High for MongoDB/db.js behavior and output shape; Low-to-medium likelihood because the target name is printed before connection.

### [Pass 2] The DB-backed non-mutation test does not cover an existing `revealed_to`

- **Severity**: Low
- **File:line**: `server/tests/dbo-2-dossier-fact-key.test.js:211`
- **Triggering input or sequence**: Backfill a keyless fact that already carries `revealed_to`, a plausible state once reveal data exists. No DB fixture combines those two conditions; the mutation test instead asserts that fixtures with no `revealed_to` did not acquire one.
- **Observable consequence**: The exact future-sensitive preservation case is not regression-protected. The current single-field `$set` implementation would preserve `revealed_to`, so this is a test gap rather than a demonstrated write defect.
- **Confidence**: High; all migration fixtures were enumerated and none contains `revealed_to`.

### Pass 3a

- None found.

### [Pass 3b] The schema and story name a TM Wiki reader that does not exist

- **Severity**: Low
- **File:line**: `server/schemas/character_dossier.schema.js:52`
- **Triggering input or sequence**: Follow the comments' citation to `../TM Wiki/server/routes/characters.js:210-214` and search that file for both function names.
- **Observable consequence**: The fail-open behavior is real, but the exported live reader is `filterFactsForViewer`, not `filterVisibleFacts`. The latter name has no occurrence in the route. Developers following the new schema/story provenance cannot find the claimed symbol, repeating a smaller form of the dead-citation problem this story is meant to close.
- **Confidence**: High; the allowed sibling file was read at the cited lines and searched directly.

## Readiness

**Needs patches before live `--apply`; no blocking/high-severity defect was found.** The schema can remain documentation-only, but the migration should satisfy AC5 by deriving the current unkeyed indices from the fresh backup read, should explicitly reject present-but-invalid keys instead of silently calling them complete, and should add the missing `revealed_to` preservation fixture. The current environment's skipped DB block also needs a genuinely connected rerun before authorising production use. The legacy haven writer is already acknowledged by the story as deferred, but remains unsafe to rerun after this migration.

## Validation notes

### Pass isolation and files opened

- **Pass 1**: I manually opened only `specs/stories/code-review/dbo-2-character-dossier-schema-and-reveal-diff.txt`. An isolated Node probe loaded `server/schemas/character_dossier.schema.js` plus the installed `ajv` package to execute the requested object-shape check. I did not open the story or repository context before freezing Pass 1.
- **Pass 2**: I opened `server/db.js`, `server/config.js`, `server/vitest.config.js`, `server/tests/helpers/db-setup.js`, `server/tests/helpers/setup-env.js`, `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs`, `server/scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs`, `server/scripts/_dossier-audit.js`, `server/scripts/_einar-secret-fix.js`, and `server/scripts/_havens-and-locations.js`; I also searched `server/routes/`, `server/scripts/`, and the new test file. I did not deliberately open the story. **Protocol gap:** the repository-wide `_havens-and-locations` reference search unexpectedly printed matching lines from `specs/deferred-work.md`, `specs/epic-dbo-database-ownership.md`, and `specs/stories/sprint-status.yaml`; the sprint-status match embeds much of the author's later account. That contaminated the intended pre-record isolation even though the story itself remained unopened until Pass 3a. I did not revise the already frozen Pass 1 findings, and Pass 2 findings were based on the code inspected before/alongside that accidental output.
- **Pass 3a**: I found the story section boundaries, then opened only lines 1-446 of `specs/stories/dbo-2-character-dossier-schema-and-reveal.md` (through Dev Notes/References and stopping before `## Dev Agent Record`). I also inspected commit name/diff boundaries for `server/routes/`, `public/`, `server/scripts/_*.js`, and `server/package.json`. Pass 3a was frozen before intentionally opening the record.
- **Pass 3b**: I opened the Dev Agent Record from line 447 onward, the final report, and the two specifically permitted sibling files: `../TM Wiki/server/routes/characters.js` (cited lines and symbol search) and `../TM Wiki/specs/tm-wiki-schema.md` (the `fact_key` dependency matches). Vitest loaded the 21-file targeted gate listed below. No other sibling-repo file was opened.

### Commands run and real results

Pass 1:

- `Get-Content -Raw -LiteralPath 'specs/stories/code-review/dbo-2-character-dossier-schema-and-reveal-diff.txt'` - exit 0; 839 diff lines (initial display truncated, so the next range reads completed it).
- `Select-String ... -Pattern '^diff --git'` on that diff - exit 0; file starts at diff lines 1, 180, and 429.
- Three bounded diff reads, `$lines[179..428]`, `$lines[428..649]`, and `$lines[650..838]` - all exit 0; recovered the complete script and test content.
- `Select-String ... -Pattern "hasOwnProperty\\.call|const fact = facts\\[i\\]|type: \\['string', 'object'\\]"` - exit 0; located the relevant new-source lines.
- `node --input-type=module -e "...Ajv..."` from `server/` - exit 0; both arbitrary-object documents validated `true` with no errors.

Pass 2:

- `Get-Content -Raw server/db.js`; `Get-Content -Raw` for both DBO-1/DBO-8 scripts; `Get-Content -Raw server/tests/helpers/db-setup.js`; and `rg -n ... "character_dossier|applyBackfill\\(" ...` - all exit 0. The apply search found six apply-mode calls, each fed by `ownRows` directly or through `firstPlan`.
- An initial parallel context command containing `rg ... server/vitest.config.*` failed because Windows `rg` rejected that wildcard path (`os error 123`). The other requested reads were rerun explicitly; no result from the failed orchestration was relied upon.
- `Get-Content -Raw server/tests/helpers/setup-env.js`, `Get-Content -Raw server/config.js`, and `Get-Content -Raw server/vitest.config.js; rg -n "setupFiles|setup-env" ...` - exit 0. They confirmed a hard `tm_suite_test` override, a Vitest-context suffix guard, and the post-connect suffix recheck.
- Broad `rg -n ... "fact_key|facts\\.|revealed_to|st_hidden" server | Select-Object -First 300` - timed out (exit 124) after partial output; the relevant searches were rerun with narrower scopes.
- Route-only `rg -n "character_dossier" server/routes` with explicit no-match handling - exit 0, `NO_MATCHES`.
- Narrow `rg` searches for `character_dossier`, `fact_key`, positional fact writes, and all `applyBackfill` sites - exit 0; only the new backfill mints `fact_key`.
- `Get-Content -Raw server/scripts/_dossier-audit.js; Get-Content -Raw server/scripts/_einar-secret-fix.js` - exit 0.
- `Get-Content -Raw server/scripts/_havens-and-locations.js` - exit 0.
- `Get-Item ... _havens-and-locations.js; rg -n "_havens-and-locations|havens-and-locations" . ...` - exit 0; this is the command that accidentally emitted tracking/account text. It also located the already-recorded residual hazard.

Pass 3a:

- Story-heading `Select-String` - exit 0; Story line 7, AC line 163, Tasks line 319, Dev Notes line 366, Dev Agent Record line 447.
- `Get-Content ... -TotalCount 446` - exit 0; bounded pre-record story read.
- `git diff --name-status a926f7bc 2b187a7d` - exit 0; exactly three code/tooling additions plus four documentation/tracking paths.
- `git diff --unified=0 ... -- server/routes public server/scripts/_*.js server/package.json` - exit 0 with no output.
- `git diff --unified=0 ... -- server | rg -n "\\$jsonSchema|st_hidden|revealed_to|..."` - exit 0; occurrences were comments/schema/tests only, with no route, validator, or package write.

Pass 3b:

- `Get-Content ... | Select-Object -Skip 446` - exit 0; full Dev Agent Record.
- Clean mandated suite command `npx vitest run tests/dbo-2-dossier-fact-key.test.js` was run **three times** (first, required repeat, and final post-restore): every run exit 0 with **1 file passed; 17 tests passed, 8 skipped, 25 total**. The DB-backed eight did not run. Vitest 4.1.2 also warned that `test.poolOptions` is deprecated/removed.
- `node scripts/dbo-2-dossier-fact-key-backfill.mjs` from `server/` (no `--apply`) - exit 1 after printing DRY RUN / `Target DB: tm_suite`; connection failed `EACCES 159.143.141.178:27017`. No live count was obtained and no write occurred.
- `git diff --exit-code a926f7bc 2b187a7d -- server/scripts/_dossier-audit.js` - exit 0, byte diff none.
- Node inventory arithmetic check - exit 0: 26 tags sum to 442, four fact sources sum to 442, three severities sum to 13, `npc_id` counts sum to 24, and document-source counts sum to 30. This checks arithmetic only, not live Atlas data.
- `git diff --exit-code ... -- server/package.json` - exit 0, unchanged.
- Temporary schema inversion (removed `fact_key` from `required`) plus the mandated suite - exit 1 with exactly the AC2 test failing; **1 failed, 16 passed, 8 skipped (25)**. Restored with `apply_patch`; `git diff --exit-code -- server/schemas/character_dossier.schema.js` then reported no content diff.
- Temporary removal of **both** write guards plus the suite - exit 0 with **17 passed, 8 skipped (25)** because the two expected discriminating tests were skipped. Restored and content-diff checked.
- Temporary removal of only the in-memory guard plus the suite - exit 0, **17 passed, 8 skipped (25)**; restored.
- Temporary removal of only the database `$exists:false` guard plus the suite - exit 0, **17 passed, 8 skipped (25)**; restored.
- `git diff --exit-code --` for both temporarily edited source files - exit 0 after content restoration. A later status check exposed mixed line endings introduced by patching; see restoration notes below.
- Importer discovery with a regex-quoted `rg` first returned exit 1/no matches due PowerShell quoting; the corrected fixed-string `rg -l -F ... server/tests --glob '*.test.js'` exited 0 with 19 importers including this suite. `rg --files ... | rg "dbo-(3|9)|..."` located the two adjacency suites.
- Reconstructed 21-file targeted `npx vitest run $files` - exit 1: **21 files total; 12 failed, 7 passed, 2 skipped; 139 tests passed, 116 skipped (255 total)**. Seven unchanged suites failed to load with their recorded syntax error; additional failures/skips were Atlas-connectivity errors. `git diff --exit-code` confirmed all seven load-failing test files are unchanged from base to reviewed commit.
- Allowed sibling reads: bounded `Get-Content` of TM Wiki `characters.js:200-240`, bounded `Select-String` of `tm-wiki-schema.md`, and `rg -n "filterVisibleFacts|filterFactsForViewer" characters.js` - all exit 0. They verify the fail-open behavior and durable-key dependency, and prove the symbol-name mismatch.
- Unicode punctuation/NUL sweep over all three new files - exit 0, clean for U+2014/U+2013/U+2018/U+2019/U+201C/U+201D/U+0000.
- `git status --short`, scoped `git diff`, backup-directory listing, and `git rev-parse` - exit 0. Branch is `ms/dbo-2-character-dossier-schema-and-reveal`; HEAD exactly matches `2b187a7d31e85395e4571b7f1c519fc0c05169a3`. Existing DBO-2 backup files predate this review's test runs; none was created by the skipped DB tests.
- `git config --get core.autocrlf` returned `true`; byte/EOL counts showed the two temporarily patched files had mixed LF/CRLF while the untouched test file was all CRLF. A mechanical PowerShell CRLF normalization restored those two files. Final scoped `git status --short` shows only this intended report as untracked, and final scoped `git diff --exit-code` reports no source/test worktree diff.
- Final line-location `Select-String` - exit 0; record gate claim at lines 510-512 and Mongo claim at line 460.

### Could not run or verify

- The DB-backed eight tests, any backup/write/idempotency/reordering assertion against MongoDB, the author's two-failure write-guard discrimination result, the live `tm_suite` dry-run counts, and all claimed live BSON/type/count inventories could not be verified because outbound Atlas access failed with `EACCES`. A skip is not counted as a pass here.
- No local `mongod` was used; `server/.env` resolved an Atlas address, and the environment denied that connection.
- The author's historical assertion that Atlas was reachable in their development session may have been true, but it is not independently verifiable in this review environment.

### Modification and restore attestation

- The only intentional lasting write is this findings file. I temporarily edited one schema line and two backfill guard lines solely for discrimination. All source changes were restored, including line endings, and final scoped Git checks show no diff in the three reviewed source/test files.
- I did not run `--apply` against live or test MongoDB, did not modify either sibling repo, and did not commit or push.
- The repository has a very large pre-existing/unrelated untracked set, so global `git status --short` is not clean. I did not capture a pre-review global status because Pass 1 prohibited repository exploration; therefore I cannot independently prove the provenance of every unrelated untracked path. The final scoped status is clean of unintended review changes and lists only `?? specs/stories/code-review/dbo-2-character-dossier-schema-and-reveal-codex-findings.md`.
