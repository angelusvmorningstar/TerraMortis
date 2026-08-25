# Adversarial review findings — issue #1152 / EQC-1

Earlier-pass text is frozen in place. Later-pass evidence is recorded as a new tagged finding and does not rewrite an earlier conclusion.

## High

### Pass 1

- None found.

### Pass 2

- None found.

### Pass 3a

- None found.

### Pass 3b

#### [Pass 3b] Migration silently breaks legacy rows that lack the new discriminator field

- **Severity**: High
- **File:line**: `server/scripts/migrate-eqc1-bucket-taxonomy.mjs:82`, `public/js/data/equipment-derivation.js:68`, `public/js/suite/roll.js:237`, and `public/js/suite/roll-v2.js:313`
- **Triggering input or sequence**: A schema-valid legacy armour document has `bucket: 'armour'`, `armour_value: null`, and `defence_penalty: 2`, or a schema-valid legacy weapon has `bucket: 'weapon'`, `weapon_type: null`, and another weapon stat such as `damage_mod: 2`. Bucket-specific stats were optional/nullable under the old schema and admin form. The migration changes only the bucket, does not backfill or audit the required discriminator, and reports both documents as successfully touched.
- **Observable consequence**: The armour item contributed a defence penalty under the old bucket-only predicate but contributes zero after migration because `armour_value == null`; the weapon appeared in the old weapon-reference panel but disappears after migration because `weapon_type == null`. The sheet can still classify these via `defence_penalty`/`damage_mod`, so UI and combat mechanics disagree silently. Any character holding such a live row gets changed combat behavior even though the migration reports success, directly violating AC #5.
- **Confidence**: High for the behavior: direct execution produced `{ oldPenalty: 2, newPenalty: 0 }` and `{ oldWeaponRef: true, newWeaponRef: false }`. Production prevalence is unknown because the local `tm_suite` catalogue is empty and production was intentionally not queried.

## Medium

### Pass 1

#### [Pass 1] The advertised single-level/reference containment contract is not enforced

- **Severity**: Medium
- **File:line**: `server/schemas/character.schema.js:318` (new commentary) and `server/schemas/character.schema.js:346` (new field)
- **Triggering input or sequence**: A character equipment entry is submitted with a syntactically valid 24-lowercase-hex `container_id` that equals its own `catalogue_id`, points to a missing entry, points to a non-container catalogue item, or forms a container chain. The schema checks only the string shape. The diff adds no corresponding cross-item validation while its comment says the write route is responsible and says containment is single-level.
- **Observable consequence**: Invalid or recursive containment topology is accepted into character data despite the code comment's contract. This is currently described as display-inert, but the diff does not implement the promised reference validation or the claimed single-level restriction, leaving later containment consumers to interpret corrupt/ambiguous data.
- **Confidence**: High. This pass is limited to the diff; Pass 2 must determine whether an unchanged pre-existing write path happens to supply the missing validation.

#### [Pass 1] Apply mode can leave a partially migrated live catalogue without reporting completed/missed IDs

- **Severity**: Medium
- **File:line**: `server/scripts/migrate-eqc1-bucket-taxonomy.mjs:102`
- **Triggering input or sequence**: Run the script with `--apply`; updates for documents 1 through N-1 succeed, then `updateOne` for document N rejects (for example, a transient Mongo connection failure). `totals` is incremented before each write, but summary logging occurs only after the entire loop.
- **Observable consequence**: Documents already written remain on the new taxonomy while document N and all later documents remain on the old taxonomy. The top-level handler prints the thrown error and exits non-zero, but the accumulated mapping summary and the identities/count of missed documents are never emitted. Until an operator safely reruns the idempotent script, new-only consumers can silently omit or misclassify the remaining old-bucket records.
- **Confidence**: High for the partial-write and missing-progress behavior; Medium for operational impact because a prompt rerun should recover.

### Pass 2

#### [Pass 2] The full-character PUT route persists invalid containment references and nesting

- **Severity**: Medium
- **File:line**: `server/routes/characters.js:455` and `server/routes/characters.js:462`; schema contract at `server/schemas/character.schema.js:319`
- **Triggering input or sequence**: An ST sends `PUT /api/characters/:id` with a schema-valid `equipment[]` containing a 24-hex `container_id` that is dangling, equals the item's own `catalogue_id`, names a non-container catalogue item, or assigns a `container_id` to an entry that is itself a container. `validateCharacterPartial` checks shape only; the hydration loop converts only `catalogue_id`, performs no catalogue/container/topology lookup, and then `$set`s the array.
- **Observable consequence**: The route the schema comment explicitly makes responsible for reference checking accepts and stores all of the forbidden cases, including multi-level containment. No current production file reads `container_id`, so this does not crash today's sheet; instead it allows invalid topology to accumulate before the first containment reader/UI exists.
- **Confidence**: High. A repository-wide search found `container_id` only in the two schema comments/definitions, and the PUT implementation was inspected in full around its equipment hydration path.

### Pass 3a

#### [Pass 3a] `container_id` cannot identify a container instance when catalogue items repeat

- **Severity**: Medium
- **File:line**: `server/schemas/character.schema.js:339` and `server/schemas/character.schema.js:346`; duplicate-permitting append at `server/routes/characters.js:883`
- **Triggering input or sequence**: A character owns two instances of the same container catalogue entry (for example, two identical backpacks). Both equipment rows have the same `catalogue_id`; equipment rows have no independent instance `_id`. Setting another item's `container_id` to that 24-hex catalogue ID therefore matches both rows.
- **Observable consequence**: The data model cannot express which actual container instance holds the item, so AC #2's literal “referencing another item” contract becomes ambiguous as soon as duplicate containers exist. The distinction matters if the two instances have different state/notes or one is removed. No assignment/display UI exists in this story, but this schema is meant to be the foundation for that later work.
- **Confidence**: High that the ambiguity exists and duplicates are not rejected; Medium that product semantics require per-instance distinction rather than treating identical catalogue holdings as one logical container.

### Pass 3b

#### [Pass 3b] AC #6 says the full suite passes, while the same story records ten failed files

- **Severity**: Medium
- **File:line**: `specs/stories/feature.1152.eqc1-bucket-container-schema.story.md:49` and `specs/stories/feature.1152.eqc1-bucket-container-schema.story.md:117`
- **Triggering input or sequence**: Evaluate the literal acceptance criterion “`npm test` (vitest) passes in full” against the Dev Agent Record and the independently repeated ten-file run. Both current HEAD and an isolated `ddf059f8` export produce 10 failed files and 5 failed tests (63 passed, 68 tests in that subset), even though the failures are genuinely pre-existing and unrelated to EQC-1.
- **Observable consequence**: AC #6 is marked complete despite its literal pass condition being false. The pre-existing provenance is well supported, so this is not evidence that EQC-1 caused those failures; it is an acceptance-record overstatement that can mislead a ship decision into treating a qualified regression result as a full green gate.
- **Confidence**: High.

## Low

### Pass 1

#### [Pass 1] The dry-run integration assertion is satisfied by unrelated catalogue rows

- **Severity**: Low
- **File:line**: `server/tests/issue-1152-eqc1-bucket-migration.test.js:91`
- **Triggering input or sequence**: The test inserts `Dry Run Knife`, then asserts only `totals.touched >= 1` over an unfiltered scan of the entire shared test collection. If that inserted document were not planned for migration but any unrelated old-taxonomy row existed, the assertion would still pass; the following assertion merely confirms that dry-run did not write the inserted row.
- **Observable consequence**: This integration test can report the seeded dry-run case as covered without proving that the seeded row contributed to the plan. The pure mapping test separately reduces immediate regression risk, but the integration assertion itself is not isolated or pinned to its fixture.
- **Confidence**: High.

### Pass 2

#### [Pass 2] Array-valued legacy buckets are silently coerced into mapping-table keys

- **Severity**: Low
- **File:line**: `server/scripts/migrate-eqc1-bucket-taxonomy.mjs:72` and `server/scripts/migrate-eqc1-bucket-taxonomy.mjs:76`
- **Triggering input or sequence**: `planBucketMigration({ bucket: ['weapon'] })` (or another one-element array containing an old value) reaches `BUCKET_MAP[from]`. JavaScript coerces the array property key to `'weapon'`, so the planner returns `touched: true` and `toBucket: 'combat_gear'` instead of flagging the non-string bucket as malformed/unrecognised.
- **Observable consequence**: A malformed live document is silently normalised and disappears from the human-review list, contrary to the planner's “flag rather than guess” error-path policy. The resulting bucket happens to be the plausible mapping for this exact one-element array, which limits immediate mechanical harm but loses the audit signal.
- **Confidence**: High; executed directly against the committed planner. `null`, `undefined`, `{}`, null/empty/number buckets, and an empty array all returned non-throwing untouched plans, while `['weapon']` reproduced the coercion.

#### [Pass 2] Several equipment gate fixtures still encode the retired taxonomy

- **Severity**: Low
- **File:line**: `server/tests/equipment.test.js:51`, `server/tests/issue-868-ecm-1-equipment-catalogue-api.test.js:54`, and `server/tests/issue-896-availability-filter.test.js:43`
- **Triggering input or sequence**: Run or maintain the equipment suites after the taxonomy migration. These tests still seed or synthesize `weapon`, `armour`, `equipment`, and `asset` values in cases not updated by the diff; many direct-insert fixtures bypass the new catalogue schema and can therefore continue passing.
- **Observable consequence**: Green results in those cases do not consistently represent correctly migrated catalogue data, and future assertions can preserve old assumptions without exercising the five-value taxonomy. This is primarily a coverage/maintenance defect; the production-source grep did not find a missed old-value comparison.
- **Confidence**: High that the stale fixtures exist; Medium on their gate impact pending the Pass 3b individual suite runs.

### Pass 3a

#### [Pass 3a] AC #5's roll-chip parity is asserted structurally, not demonstrated behaviorally

- **Severity**: Low
- **File:line**: `server/tests/equipment-client-fixes.test.js:64` and `server/tests/equipment-client-fixes.test.js:74`
- **Triggering input or sequence**: Regress either roller while leaving text matching `bucket === 'skill_gear'` / `bucket === 'combat_gear' && entry.weapon_type != null` and an `active` state check within the regex window—for example, break the catalogue lookup result consumed later, render the wrong item, or alter chip toggle behavior. The changed tests read source text and match proximity; they do not feed equivalent old/new catalogue-and-character fixtures through both roll consumers and compare observable output.
- **Observable consequence**: AC #5's “same for weapon/skill-gear chips” no-regression claim lacks an executable behavioral parity proof. Armour math has literal expected-output behavior tests on the new shape, but no test pins old-shape-derived output against equivalent new-shape output, and the roller coverage can stay green through some behavioral regressions.
- **Confidence**: High about the test shape and absence of a new-taxonomy behavioral roller test in the repository-wide test search; Medium that AC #5 strictly requires a parity test rather than correct implementation alone.

### Pass 3b

#### [Pass 3b] The claimed 2463/2458 full-suite total could not be reproduced in this environment

- **Severity**: Low
- **File:line**: `specs/stories/feature.1152.eqc1-bucket-container-schema.story.md:117`
- **Triggering input or sequence**: Run `npm test` against the available local Mongo daemon. The repository normally points at a network Mongo URI (blocked here), and its client hard-codes TLS while the local daemon is non-TLS. After a temporary TLS-only workaround, the full parallel run repeatedly lost local DB connections (`ECONNRESET`), skipped many integration suites, and timed out at five minutes without a final count.
- **Observable consequence**: The exact “2463 total, 2458 pass” statement remains unverified-as-stated by this review and should not be presented as a fresh current-environment gate result. This does not contradict the record: all nine equipment suites independently passed 170/170, and the claimed ten-file failure signature reproduced exactly on both current HEAD and base commit.
- **Confidence**: High about the verification gap and targeted results; no conclusion either way about whether the historical 2463/2458 numbers were accurate in the author's environment.

## Validation notes

### Ship assessment

**Needs patches; do not ship or run the production migration as-is.** The direct readers and ordinary migrated fixtures behave correctly, and the nine equipment gates are green, but the migration does not preflight legacy weapon/armour rows for the discriminator fields on which the new mechanics depend. I would not trust it against real character data today until a production dry-run reports/audits every old weapon lacking `weapon_type` and every old armour lacking `armour_value` (with an explicit remediation policy), and containment's stated reference/single-level contract is either enforced or narrowed in the AC/comments. The live production migration was not run.

### Information-barrier attestation and files opened

- **Pass 1**: Opened only `specs/stories/code-review/issue-1152-eqc1-diff.txt`, in chunks after the first full read was output-truncated. I did not list or open repository source, the story, or the Dev Agent Record before writing the complete Pass 1 text to this file.
- **Pass 2**: After Pass 1 was frozen, opened/searched production and test context including `public/js/data/equipment-derivation.js`, `public/js/suite/roll.js`, `public/js/suite/roll-v2.js`, `public/js/editor/sheet.js`, `public/js/admin/equipment-catalogue-admin.js`, `public/css/admin-layout.css`, `server/schemas/character.schema.js`, `server/schemas/equipment_catalogue.schema.js`, `server/routes/characters.js`, `server/routes/equipment-catalogue.js`, `server/db.js`, `server/config.js`, `server/tests/helpers/db-setup.js`, `server/tests/helpers/setup-env.js`, and repository-wide grep results under `public/`, `server/`, `tests/`, and `specs/` excluding the issue-1152 story. An attempted open of the nonexistent `server/data/equipment-catalogue.js` failed. I did not open the issue-1152 story until Pass 2 was frozen.
- **Pass 3a**: Opened only story lines 1-53 (Story, Background, taxonomy, and AC 1-7) before freezing Pass 3a. I did not read Tasks, Dev Notes, or the Dev Agent Record during 3a.
- **Pass 3b**: After 3a was frozen, opened the Dev Agent Record (lines 105-end), then the intervening Tasks/Dev Notes/Project Structure/References (lines 54-104) to read the author's account in full. Also opened the named tests and source lines surfaced by test failures, plus Git metadata/diffs for the specified commits. I did not read or modify any sibling repository.

### Commands run and real results

- Read the supplied diff with `Get-Content` and located/chunked its file sections with `Select-String`/array slicing. The first full output was truncated; the subsequent three chunks covered all 938 lines.
- Ran repository searches with `rg` for old bucket comparisons, all `.bucket` readers, `container_id`, CSS bucket classes, discriminator fields, and new-taxonomy test coverage. One first regex command failed with a PowerShell parser error; one broad grep timed out after 22 seconds but returned useful partial results; narrower production-source searches completed. No production old-bucket comparison was found. All five new CSS classes exist and no old class remains. `container_id` has no production read site.
- Directly executed `planBucketMigration` on `null`, `undefined`, `{}`, null/empty/number/array buckets. It did not throw; `['weapon']` was coerced to the mapping-table key and migrated.
- Directly executed the three-item armour trace. Result: `{ penalty: 3, count: 1 }`; only the armour-shaped item contributed, while weapon-shaped and neither-shaped items contributed nothing. Static tracing of both roller predicates showed only the weapon-shaped item enters weapon reference and none of the three enters skill chips. Sheet predicates make the neither-shaped item reach `Other Combat Gear`.
- Checked `git status`, HEAD, and `git diff --name-status ddf059f8 c7e6771b`. HEAD is `c7e6771b19367f0a6face5e675c7a3e2ac3737b4`. The EQC-1 source/tooling diff has 2 new files and 14 modified files; including the deliberately excluded story, the commit has 17 paths. The workspace already contained numerous unrelated tracked/untracked user changes, which were not touched.
- Checked Mongo availability. A `mongod` process existed. The first `equipment.test.js` run used the repository's remote URI and failed with `EACCES 159.143.141.178:27017` (1 failed file, 14 skipped tests). Retrying with `MONGODB_URI=mongodb://127.0.0.1:27017` failed TLS negotiation with `ECONNRESET` because `server/db.js` hard-codes `tls: true` (1 failed file, 14 skipped tests).
- Temporarily changed only `server/db.js` from `tls: true` to `tls: false` to use the local non-TLS daemon. With `MONGODB_URI=mongodb://127.0.0.1:27017`, the nine requested suites were run individually and produced the exact current gate totals below (all integration slices ran; no skips):

  - `tests/equipment.test.js`: 1 file passed; **14/14 tests passed**.
  - `tests/equipment-client-fixes.test.js`: 1 file passed; **6/6 tests passed**.
  - `tests/issue-868-ecm-1-equipment-catalogue-api.test.js`: 1 file passed; **28/28 tests passed**.
  - `tests/issue-871-876-ecm-4-9-bundle.test.js`: 1 file passed; **19/19 tests passed**.
  - `tests/issue-872-ecm-5-editor-cache.test.js`: 1 file passed; **14/14 tests passed**.
  - `tests/issue-896-availability-filter.test.js`: 1 file passed; **28/28 tests passed**.
  - `tests/issue-879-defence-penalty-wirein.test.js`: 1 file passed; **36/36 tests passed**.
  - `tests/issue-1152-eqc1-bucket-migration.test.js`: 1 file passed; **11/11 tests passed**.
  - `tests/issue-873-ecm-6-admin-sidebar.test.js`: 1 file passed; **14/14 tests passed**.
  - Aggregate: **9/9 files passed; 170/170 tests passed; 0 skipped**.

- Ran the ten named historical-failure files together on current HEAD. Result: **10 failed files; 5 failed tests; 63 passed (68 tests)**. The failing tests were exactly: `epic.708.3-cycle-phase-controls` — “exports setGamePhase function”, “uses data-phase attribute on phase buttons”, “highlights active phase with gold2 colour”; `n7-n9-allocator-readers` — “all three dropdown builders consume meritPrereqOK (not _meetsPrereq directly)”; `oath-a-pledge-helpers` — “meritRating and meritEffectiveRating are byte-identical to their pre-OATH-A form”. Seven other named files failed during suite loading. Searching the three files containing the five failed tests found none of `equipment|bucket|armour|weapon|container`.
- Attempted full `npm test` with the local TLS workaround. It **did not complete**: the command timed out after 302.6 seconds, many integration suites reported `ECONNRESET` and skipped, and Vitest emitted no final aggregate. Therefore this review could not reproduce the claimed **2463 total / 2458 pass / 5 fail** full-suite numbers.
- Independently reproduced the pre-existing-failure claim without stashing the dirty workspace: `git archive ddf059f8` into an isolated workspace temp directory, junctioned its `server/node_modules`, applied the same temporary local-TLS change inside that disposable export, and ran the same ten files. Result was identical: **10 failed files; 5 failed tests; 63 passed (68 tests), same five test names and same seven suite-load failures**. A first attempt to archive under `D:\tmp` failed with permission denied; the workspace-local isolated export succeeded.
- Queried the local `tm_suite.equipment_catalogue` read-only. It contained zero documents, so production prevalence of missing discriminator fields could not be assessed. No live migration was run.
- Directly compared legacy/new discriminator behavior: old armour `{ armour_value: null, defence_penalty: 2 }` yielded old penalty 2 versus new penalty 0; old weapon `{ weapon_type: null, damage_mod: 2 }` yielded old weapon-reference eligibility `true` versus new `false`.

### Could not run or verify

- Could not query the real production `tm_suite` catalogue; the configured remote Mongo endpoint is blocked by this environment's network policy. The local database was empty.
- Could not obtain a valid full-suite aggregate because the five-minute run timed out after local Mongo connection resets under parallel load. Consequently the historical 2463/2458 total remains unverified here.
- Did not run the live migration against production, per the story's explicit deploy-time scope and this review's no-write constraint.
- Could not use `git checkout -- server/db.js` to restore the temporary edit because `.git` is read-only in this sandbox (`index.lock: Permission denied`). I restored the exact committed line with `apply_patch` instead; `git diff -- server/db.js` and path-scoped `git status --short` are empty afterward.

### Workspace integrity

- The temporary base archive/export and its `node_modules` junction were deleted after exact-path checks; existence checks returned false for both archive and directory.
- No source change remains from this review. The requested findings file is the only created review artifact. Final path-scoped status showed only `?? specs/stories/code-review/issue-1152-eqc1-codex-findings.md`; `server/db.js` had no diff. The pre-existing unrelated dirty-worktree entries were preserved.
