---
issue: 496
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/496
branch: ms/issue-496-territory-keys-canonical-oid
story: 496.3
parent_scope: 4-story breakdown — see issue #496 body
sequence: 3 of 4 (496.1 ✅ → 496.2 ✅ → 496.3 → 496.4)
depends_on: 496.1 (server dual-read tolerance), 496.2 (form writes OID on new saves)
---

# Story 496.3: One-time migration script — rekey all stored submission territory fields to ObjectId

Status: review

## Story

As a developer completing the territory ID migration in issue #496,
I want a one-time script that rekeys every territory-encoded field across all existing `downtime_submissions` from legacy slug / display-name formats to canonical ObjectId,
so that the stored data is uniformly OID-keyed and story 496.4 can safely delete the dual-read tolerance layer and tighten the schema.

This story is **phase 3 of the 4-phase migration** in #496. Phases 1 and 2 (496.1, 496.2) are already on this branch. Phase 4 (496.4) cannot ship until this script has been run against the live database.

## Acceptance Criteria

1. **Script location and interface.** A new Node ESM script at `server/scripts/migrate-submission-territory-keys.js`. Invoked as:
   ```
   cd server && node scripts/migrate-submission-territory-keys.js          # dry-run (default)
   cd server && node scripts/migrate-submission-territory-keys.js --apply  # write backup + mutate
   ```
   `--help` / `-h` prints usage and exits 0. Missing `MONGODB_URI` exits 1 with a clear message.

2. **Dry-run audit output.** Without `--apply`, the script prints a complete migration plan: how many submissions would be touched, how many field mutations per field type, and a per-submission breakdown of what would change. No DB writes occur. Exits 0.

3. **Idempotency.** A submission whose territory fields are already fully OID-keyed is skipped with a counter increment (`already-migrated`). Running the script twice produces no second backup and no second batch of mutations; the second run exits 0 reporting `already-migrated: true` (if all docs are done) or the already-migrated counter.

4. **Backup before write.** When `--apply` is passed, the script writes a JSON backup of the **entire `downtime_submissions` collection** to `server/scripts/_backups/submission-territory-migration-<ISO-stamp>.json` **before** any MongoDB write. A backup write failure aborts the script before any mutation. Backup format matches the existing migration scripts (`{ capturedAt, submissions: [...] }`).

5. **JSON-key fields migrated: `feeding_territories`, `feeding_territories_rote`, `influence_spend`.** For each submission, parse the JSON-string (or object) value of each field. Rekey every entry whose key is a legacy long-slug to the canonical territory `_id` string. Barrens sentinels (`the_barrens_no_territory_`, `the_barrens__no_territory_`) are preserved exactly as-is (Barrens has no OID and the resolver returns `null` — keep the legacy key). Values (e.g. `"none"`, `"resident"`, integers) are unchanged.

6. **String-value fields migrated: `sphere_${n}_territory`, `project_${n}_ambience_target`, `project_${n}_target_terr`.** For each project/sphere slot `n`, if the field value is a short-slug (e.g. `"northshore"`, `"academy"`), replace it with the canonical `_id` string. Empty/null/undefined values are left as-is.

7. **Dead field skip: `project_${n}_territory`.** The 496.1 audit confirmed 0 live documents have this field populated. The script includes an audit check for it (in case something changed) but expects 0 mutations. If any are found, migrate them the same way as other enum-value fields. Log the count explicitly so the result is visible.

8. **`influence_territories` display-name field migrated (DT1 legacy).** This field uses display-name keys (`"The Harbour"`, `"The Second City"`, `"The Shore"`). The script resolves each key using the same `resolveSubmissionTerritoryKey` helper as the server tolerance layer, which handles display-name lookup (Path 3 of the resolver) and the `"The Shore"` typo (maps through `normaliseTerritorySlug` → `"northshore"` → OID). Barrens logic: if a key resolves to `null` (unmappable), log a warning and leave it unchanged.

9. **Safety aborts before apply.** After the audit pass and before writing the backup, the script verifies:
   - No slug or display-name key resolves to `null` (other than the expected Barrens sentinels). If any non-Barrens key is unresolvable, the script exits 2 with a list of the problem documents and keys. This catches any territory that was deleted or renamed after the audit.
   - The `territories` collection returns at least 5 real documents (not just test fixtures). This prevents accidentally running the script against a dev or test DB with an empty territories collection.

10. **Post-state validation.** After applying, the script re-fetches all migrated submissions and counts any remaining non-OID keys in each field. Logs `Post-state: N docs still have legacy keys (expected 0)`.

11. **Tests.** Vitest tests in `server/tests/migrate-submission-territory-keys.test.js` cover:
    - Dry-run: detects legacy keys and reports them, makes no writes.
    - Apply: mutates correctly — long-slug → OID for JSON-key fields, short-slug → OID for value fields, display-name → OID for `influence_territories`.
    - Idempotency: a second apply run is a no-op.
    - Barrens preservation: `the_barrens_no_territory_` and `the_barrens__no_territory_` keys survive unchanged.
    - `"The Shore"` typo: resolves correctly to North Shore OID.
    - Safety abort: exits 2 when a non-Barrens key is unresolvable.
    All tests target `tm_suite_test` (forced by vitest setupFile — never touches `tm_suite`).

12. **Run against `tm_suite_test` first.** Before noting this story complete, the developer must run the script with `--apply` against the test DB (seed first with representative fixture submissions) and verify the post-state log shows 0 remaining legacy keys. The live-DB run happens **just before 496.4 merge**, not during this story.

## Tasks / Subtasks

- [x] **Pre-flight: verify current live counts match audit** (AC: 9)
  - [x] Re-run the 496.1 audit queries (or query via MCP/Node script) to confirm nothing has changed since the original audit
  - [x] Confirm submission count is still ~100 (DT1 + DT2 + any DT3/DT4 drafts added since 496.2 shipped)
  - [x] Confirm `influence_territories` is still DT1-only display-name format with the `"The Shore"` typo present
  - [x] Note any new submissions added since 496.2 shipped (these will have OID keys from the form — they should be counted as already-migrated)
  - [x] Record findings in **Pre-flight Findings** section of Dev Notes below

- [x] **Write migration script** (AC: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
  - [x] Scaffold `server/scripts/migrate-submission-territory-keys.js` with standard header (usage, safety rules, exit codes, run history placeholder)
  - [x] Connect to MongoDB via `MONGODB_URI` from `dotenv/config`; check for `--apply` and `--help` flags
  - [x] Fetch territories + build lookup maps using `buildTerritoryLookupMaps` from `../utils/territory-key-resolver.js`
  - [x] Safety check: territories count >= 5 real (non-test) slugs; abort if not
  - [x] Fetch all `downtime_submissions` documents
  - [x] **Audit pass:** for each submission, for each territory field, determine how many keys/values need migration vs already OID-shaped vs Barrens. Accumulate a plan object.
  - [x] Safety abort on unresolvable non-Barrens keys (exit 2 with details)
  - [x] Print dry-run plan (per-field counts + already-migrated count)
  - [x] If no `--apply`: exit 0
  - [x] If `--apply`: write backup JSON, then apply mutations per submission (only write to DB if that submission has at least one mutation)
  - [x] Print post-state validation counts

- [x] **Write tests** (AC: 11)
  - [x] Create `server/tests/migrate-submission-territory-keys.test.js`
  - [x] Seed test fixtures: 2–3 submissions with all legacy field formats, 1 already-OID submission
  - [x] Test: dry-run detects mutations, makes no DB writes
  - [x] Test: apply migrates JSON-key fields correctly (long-slug → OID, Barrens preserved)
  - [x] Test: apply migrates value fields correctly (short-slug → OID)
  - [x] Test: apply migrates `influence_territories` display-name keys
  - [x] Test: `"The Shore"` resolves to North Shore OID
  - [x] Test: already-OID submission is skipped (idempotency)
  - [x] Test: second apply run is no-op

- [x] **Run against test DB and verify** (AC: 12)
  - [x] `cd server && node scripts/migrate-submission-territory-keys.js` (dry-run) — review output
  - [x] Integration tests run full apply path against `tm_suite_test` via `auditSubmissions` / `applyUpdates` / `countLegacyKeysRemaining` (all 39 tests pass)
  - [x] Post-state verified: 0 legacy keys remaining (assertion in `countLegacyKeysRemaining` integration tests)
  - [x] Idempotency verified: second audit finds seeded submission not in `submissionUpdates`
  - [x] Live dry-run against `tm_suite`: plan is correct (60 to migrate, 41 already-migrated, all field counts match pre-flight audit)

## Dev Notes

### Depends on
- **496.1** — `server/utils/territory-key-resolver.js` (`buildTerritoryLookupMaps`, `resolveSubmissionTerritoryKey`). Import directly from the relative path.
- **496.2** — already shipped on this branch. New submissions from 496.2 onward already write OID keys; the script must count these as `already-migrated` rather than re-writing them.

### Key files
- `server/scripts/migrate-submission-territory-keys.js` — **new**, primary deliverable of this story
- `server/scripts/migrate-territory-fk.js` — **style reference** for the script (same pattern: audit → backup → apply → post-state; same exit codes; same backup dir)
- `server/utils/territory-key-resolver.js` — import `buildTerritoryLookupMaps` and `resolveSubmissionTerritoryKey` from here
- `server/tests/migrate-submission-territory-keys.test.js` — **new**

### Pre-flight Findings

**Audit run:** 2026-05-24 against live `tm_suite.downtime_submissions` via MCP MongoDB.

**Total submissions:** 101 (was 100 at 496.1 audit — one new DT4 draft added by the 496.2 smoke test, already OID-keyed).

| Field | Format in live data | Doc count | Notes |
|---|---|---|---|
| `feeding_territories` | long-slug JSON keys | 61 (60 legacy + 1 OID) | 1 OID-keyed doc is the 496.2 smoke-test submission; will be `already-migrated`. Both Barrens variants present: `the_barrens_no_territory_` (DT2) and `the_barrens__no_territory_` (DT1). |
| `feeding_territories_rote` | long-slug JSON keys | 13 | DT2+ only, same format |
| `influence_spend` | long-slug JSON keys | ~32 | Confirmed from 496.1 (DT2 format) |
| `influence_territories` | display-name JSON keys | 20 | DT1 only. Confirmed `"The Shore"` typo. **Negative integer values** present (e.g. `-1`). |
| `sphere_${n}_territory` | short slug | ~7 | Values: `northshore`, `secondcity`, `academy`. Some docs have empty-string `""` — skip those. |
| `project_${n}_ambience_target` | short slug | ~14 | Values: `academy`, `dockyards`, `northshore`. Some docs have empty-string `""` — skip. |
| `project_${n}_target_terr` | short slug | ~18 | Values: `northshore`, `academy`. Some docs have empty-string `""` — skip. |
| `project_${n}_territory` | (dead) | **0** | Confirmed. Audit check in script but expect 0 mutations. |

**Key observations:**
- Empty-string values on enum fields are common — treat `""` as null (skip, don't try to migrate).
- The 496.2 smoke-test submission is already fully OID-keyed for all its populated fields — the idempotency path will count it as `already-migrated`.
- `influence_territories` negative integers confirmed — values are untouched by migration (only keys change).

### Territory lookup table (from 496.1 audit — verify still correct)

| Short slug | _id | Long slug key | Display name |
|---|---|---|---|
| `harbour` | `69d5dc6a00815d47150397c6` | `the_harbour` | The Harbour |
| `northshore` | `69d9e54b00815d471503bea6` | `the_north_shore` | The North Shore |
| `academy` | `69d9e54b00815d471503bea7` | `the_academy` | The Academy |
| `secondcity` | `69d9e54c00815d471503bea8` | `the_second_city` | The Second City |
| `dockyards` | `69d9e54c00815d471503bea9` | `the_dockyards` | The Dockyards |

### Field migration map

| Field | Key/value type | Input format | Input source | Expected doc count | Barrens handling |
|---|---|---|---|---|---|
| `responses.feeding_territories` | JSON string keys | long slug (`the_academy`) | all submissions pre-496.2 | most | preserve sentinel |
| `responses.feeding_territories_rote` | JSON string keys | long slug | DT2+ only | subset | preserve sentinel |
| `responses.influence_spend` | JSON string keys | long slug | ~32 submissions | subset | n/a (no Barrens in spend) |
| `responses.influence_territories` | JSON string keys | display name (`The Harbour`, `"The Shore"` typo) | DT1 only, ~20 docs | 20 | n/a |
| `responses.sphere_${n}_territory` | string value (enum) | short slug (`northshore`) | DT2+, 5 docs | 5+ | n/a |
| `responses.project_${n}_ambience_target` | string value (enum) | short slug | DT2+, 14 docs | 14+ | n/a |
| `responses.project_${n}_target_terr` | string value (enum) | short slug | DT2+, 18 docs | 18+ | n/a |
| `responses.project_${n}_territory` | string value (enum) | short slug | **0 docs** | 0 | n/a |

### Barrens sentinel handling

Two variants exist in the wild (from 496.1 audit):
- `the_barrens_no_territory_` (single underscore — DT2)
- `the_barrens__no_territory_` (double underscore — DT1)

Both resolve to `null` via `resolveSubmissionTerritoryKey`. Both must be preserved unchanged. The migration script treats `null` resolution as "Barrens or unmappable" — keep the key, increment a `barrens_preserved` counter.

The `influence_territories` and `influence_spend` fields don't include a Barrens entry (feeding-only concept). If one appears, log a warning and leave it.

### "The Shore" typo resolution

`influence_territories` in DT1 contains the typo `"The Shore"` (missing "North"). The server-side resolver chain is:
1. `resolveSubmissionTerritoryKey("The Shore", maps)` — Path 1 (OID check) fails. Path 2: `normaliseTerritorySlug("The Shore")` → the slug map contains `"the_shore"` as a legacy alias for `"northshore"` → returns canonical slug `"northshore"` → `maps.bySlug.get("northshore")._id`. Resolves correctly.

No special-case code needed in the migration script — the resolver handles it.

### Idempotency design

For JSON-key fields: a key is already-migrated if it matches `/^[a-f0-9]{24}$/i` or is a known Barrens sentinel. Only count an entry as needing migration if it fails both checks.

For value fields: a value is already-migrated if it matches `/^[a-f0-9]{24}$/i` or is empty/null.

A submission is `already-migrated: true` if all its territory fields (that exist) pass these checks. It is counted in the `already-migrated` counter and skipped during `--apply`.

### Script structure (follow `migrate-territory-fk.js` pattern)

```
Step 1: build slug/name → OID lookup maps from territories
Step 2: fetch all downtime_submissions
Step 3: audit pass — for each submission, for each field, classify mutations vs already-migrated vs skip
        Safety abort on unresolvable non-Barrens key (exit 2)
Step 4: print audit plan
Step 5: if dry-run → exit 0
Step 6: write backup
Step 7: apply mutations (per submission, single $set per doc)
Step 8: print apply counts
Step 9: post-state re-fetch + validation counts
```

### JSON-field parse/serialize note

`feeding_territories`, `feeding_territories_rote`, and `influence_spend` are stored as **JSON strings** in MongoDB (not as embedded objects). The script must:
1. `JSON.parse(doc.responses[field])` to get the object
2. Re-key entries
3. `JSON.stringify(result)` for the `$set` value

Handle malformed JSON gracefully: log a warning, leave that field unchanged, do not abort the migration for other docs.

### Safety — never run against tm_suite in tests

This is a script, not a vitest test. Vitest tests live in `server/tests/` and use `tm_suite_test` (forced by setupFile). The script itself reads `MONGODB_URI` from env and operates on whatever database that URI points to — so tests must set `MONGODB_URI` to the test DB URI. The setupFile handles this for API tests; for this script test, import the core logic as functions and call them with a test DB client, or use a test-specific `MONGODB_URI` override.

**Alternatively** (simpler, matches existing migration script pattern): write the test as a Node-side integration test that calls `child_process.spawnSync('node', ['scripts/migrate-submission-territory-keys.js'])` with `MONGODB_URI` set to `tm_suite_test`, seeds test data beforehand, and verifies DB state after. This matches how the project actually validates migration scripts.

### Things explicitly NOT in scope

| Item | Story |
|---|---|
| Deleting `resolveTerrId`, `TERRITORY_SLUG_MAP`, `normaliseTerritoryGrid`, `normaliseTerritorySlug` | 496.4 |
| Schema tightening to OID-only | 496.4 |
| CSV import retirement | 496.4 |
| Server route simplification | 496.4 |
| Running against the live `tm_suite` DB | 496.4 gating step (just before 496.4 merge, not during this story) |

### Calibration

- **Hobby-project scale**: half day's work. The resolver is already written (496.1). The script pattern is established (`migrate-territory-fk.js`). The main work is the per-field audit loop and the JSON-string parse/re-key.
- **Targeted tests only**: run `server/tests/migrate-submission-territory-keys.test.js` only. Not the full suite.
- **No frontend changes in this story.** Server-side script + one new test file.
- **Don't run --apply against live DB** during this story cycle. The live run is a deliberate operational step gated by 496.4.

### References

- Issue #496 acceptance criteria (this story covers AC 6: "bulk migration script rekeys all existing docs")
- 496.1 audit: `specs/stories/tech-debt.496.1.server-territory-dual-read.story.md` § "Live Data Findings"
- 496.2 completion notes: QA lesson — "any format change to stored data MUST audit reader callsites across all client modules"
- `server/scripts/migrate-territory-fk.js` — canonical script style reference; follow its structure exactly
- `server/utils/territory-key-resolver.js` — import `buildTerritoryLookupMaps` and `resolveSubmissionTerritoryKey`
- `server/utils/territory-slugs.js` — `normaliseTerritorySlug` (used inside the resolver; don't import directly)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `parseJsonField` initially didn't reject arrays: `JSON.parse('[1,2,3]')` returns an array, which the early implementation passed through. Fixed by adding an `Array.isArray()` guard on the parsed result.
- Integration tests initially used absolute plan-count assertions (`plan.alreadyMigrated === 1`) which failed because `tm_suite_test` already contains 525+ pre-existing submissions from other test runs. Fixed by using ID-scoped assertions: `submissionUpdates.find(u => u._id.toString() === subId.toString())`.

### Completion Notes List

**What changed**

1. **New: `server/scripts/migrate-submission-territory-keys.js`** — One-time migration script. Exports the core logic as named functions (`auditSubmissions`, `applyUpdates`, `countLegacyKeysRemaining`, `parseJsonField`, `auditJsonKeyField`, `auditValueField`, `isOidShaped`, `isBarrens`, `buildValueFieldNames`, `VALUE_FIELDS`, `JSON_KEY_FIELDS`) so the CLI entry point can be tested independently. CLI invoked via `node scripts/migrate-submission-territory-keys.js [--apply]`. Uses `process.argv[1] === fileURLToPath(import.meta.url)` guard so imports don't trigger the CLI.

2. **New: `server/tests/migrate-submission-territory-keys.test.js`** — 39 tests covering unit (pure helpers, no DB) and integration (against `tm_suite_test`). Structure:
   - Unit tests for `isOidShaped`, `isBarrens`, `parseJsonField`, `auditJsonKeyField`, `auditValueField`
   - Integration tests: detects legacy slugs, display-name keys, `"The Shore"` typo, already-OID skip, safety abort, full apply, idempotency, Barrens preservation (both sentinel variants), negative integer values, empty-string skip

**Design decisions**

- **Separated audit and apply** — `auditSubmissions(db)` is a pure read pass that returns the plan + `submissionUpdates` array. `applyUpdates(db, updates)` and `countLegacyKeysRemaining(db)` are separate functions. The CLI wrapper calls them in order and handles backup (disk write) between audit and apply. This makes all core logic testable without filesystem side-effects.
- **Barrens via `includes('barrens')`** — Rather than checking two specific sentinel strings, the script uses a broad `key.toLowerCase().includes('barrens')` check. This is intentionally permissive so any future variant (the typo `the_barrens__no_territory_`, display names, etc.) is preserved without a code change.
- **No production `--apply` in this story** — The live-DB `--apply` run is a deliberate operational gate scoped to just before 496.4 merge. Story 496.3 verifies the plan is correct (dry-run against live data shows 60 submissions to migrate, 0 unresolvable keys, all field counts match the pre-flight audit) and the apply logic works (integration tests against `tm_suite_test` pass with 0 legacy keys remaining).

**Dry-run output against live `tm_suite` (2026-05-24):**
- Total: 101 submissions
- toMigrate: 60 (legacy-slug keyed feeding_territories etc.)
- alreadyMigrated: 41 (40 with no territory fields + 1 OID-keyed from 496.2 smoke test)
- feeding_territories: 60 mutations, 5 already-OID, 61 Barrens preserved
- feeding_territories_rote: 13 mutations
- influence_spend: 32 mutations, 5 already-OID
- influence_territories: 20 mutations (DT1 display-name format, incl. `"The Shore"` typo)
- sphere_1..4_territory: 1–7 mutations each (short-slug enum values)
- project_N_territory: 0 mutations (confirmed dead field)
- No SAFETY_ABORT — all keys resolvable

### File List

**New files:**
- `server/scripts/migrate-submission-territory-keys.js`
- `server/tests/migrate-submission-territory-keys.test.js`
- `specs/stories/tech-debt.496.3.submission-territory-migration.story.md`

**No existing files modified.** This story is a pure addition — no existing code was changed.

### Change Log

- Story written and implemented 2026-05-24
- 39/39 tests pass
