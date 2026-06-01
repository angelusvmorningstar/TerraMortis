---
issue: 497
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/497
branch: morningstar-issue-497-cycle-id-objectid
story: 497
parent_scope: single-story fix (distinct from the 4-part #496 territory-key epic)
related: 496 (territory key canonicalisation in responses.* — separate concern)
---

# Story 497: Canonicalise `downtime_submissions.cycle_id` to ObjectId (FK type fragmentation)

Status: review

## Story

As a developer hardening the downtime data layer before launch,
I want `downtime_submissions.cycle_id` to be stored consistently as an `ObjectId` (and every reader to tolerate the mixed-type state until the migration runs),
so that type-strict BSON queries (`find({ cycle_id: activeCycle._id })`) stop silently dropping string-typed DT1 submissions — which today can let the feeding-rights lock check pass-through characters who have already fed.

This is the **top-level FK** counterpart to issue #496. #496 fixed *territory* keys fragmented inside `responses.*`; this story fixes the *cycle* foreign key fragmented at the document top level. DT1 submissions store `cycle_id` as a string (`"69d0a3c5..."`); DT2+ store it as an `ObjectId`. MongoDB BSON comparison is type-strict, so a query keyed on the cycle's `ObjectId` `_id` silently excludes every string-typed submission.

## Context from the pre-flight code sweep (already done during pickup)

The grep-sweep across `server/` found most read sites are **already** dual-type tolerant from prior incremental work (#496, #257). The genuine remaining gap is narrow:

| Callsite | State today | This story |
|---|---|---|
| `routes/downtime.js:666` hold-flags GET | ✅ dual-type `$or` already | no change |
| `routes/downtime.js:707` list GET | ✅ dual-type `$or` already | no change |
| `routes/downtime.js:619-628` POST create | ✅ coerces `cycle_id` **and** `character_id` → ObjectId | no change (reference pattern) |
| `routes/investigations.js:24` | ✅ dual-type `$or` already | no change |
| `routes/npcs.js:143` (`linked_cycle_id`) | ✅ dual-type `$or` already | no change |
| **`routes/territories.js:117-120` feeding-rights lock** | ❌ **the bug** — direct `find({ cycle_id: activeCycle._id })`, no tolerance; comment at 107-108 wrongly claims #496's 496.3 migration OID-normalised `cycle_id` (it only touched territory keys in `responses.*`) | **fix: dual-type tolerance + correct the comment** |
| `routes/downtime.js:787-792` PUT `/:id` update | ❌ no `cycle_id` coercion on the update path | **add coercion for completeness (low-risk — PUT bodies rarely carry `cycle_id`)** |
| `routes/downtime.js:260,327,1076` `project_invitations.cycle_id` | ⚠️ deliberately **String** throughout (own collection convention; schema `project_invitation.schema.js:30` = `type:'string'`) | **out of scope — internally consistent; note only** |

## Acceptance Criteria

1. **Live data audit confirms the mixed-type state and counts it.** Before any migration is run, a read-only audit reports, for live `tm_suite.downtime_submissions`: how many docs have `cycle_id` typed as `string` vs `ObjectId` vs `null`/missing, broken down by cycle where useful. The same audit also reports the `string`-vs-`ObjectId` breakdown for `character_id` (the sibling top-level FK). Findings recorded in the **Live Data Findings** section of this story file. If an unexpected type appears (anything other than string / ObjectId / null), surface it and pause before writing the migration.

2. **Read-side: feeding-rights lock check tolerates both types.** `server/routes/territories.js:117-120` is changed so the submission lookup matches **both** the cycle's `ObjectId` `_id` and its string form: `find({ cycle_id: { $in: [activeCycle._id, String(activeCycle._id)] }, status: 'submitted' })` (or an `$or` of the two). The misleading comment at lines 107-108 (claiming all submissions are OID-keyed post-496.3) is corrected to state the truth: `cycle_id` type is mixed until the #497 migration runs, so the query must tolerate both. Behaviour: a string-`cycle_id` DT1 submission whose `feeding_territories[<terr-oid>] = "resident"` correctly blocks removal of that character's feeding rights.

3. **Write-side: POST and PUT coerce incoming `cycle_id` string → ObjectId before write.** POST `/api/downtime_submissions` already coerces (`downtime.js:619-628`) — leave it, it is the reference pattern. PUT `/api/downtime_submissions/:id` is updated so that if the update body contains a `cycle_id` (or `character_id`) string, it is coerced to `ObjectId` via `parseId` before the `$set` write, mirroring the POST path. A malformed (non-24-hex) value is left untouched rather than throwing (matches POST's `if (oid) doc.cycle_id = oid` guard).

4. **Schema clarification.** `server/schemas/downtime_submission.schema.js:193` keeps `cycle_id: { type: ['string','null'] }` — inbound request bodies always carry the id as a JSON string, so the validator must accept a string. A comment is added above the field documenting the tolerance explicitly: *canonical storage is ObjectId; the request shape is string; the server coerces on write (POST/PUT); reads tolerate both during the grace window until the #497 migration runs.* The same one-line clarification is added to `character_id` (line 191), which has the identical inbound-string / stored-ObjectId pattern.

5. **Grep-sweep documented.** Every `find({ cycle_id: ... })` / `cycle_id` filter callsite in `server/` is enumerated in Dev Notes with its tolerance state (the table above is the starting point — the dev verifies it is still accurate and complete). Any site that compares `cycle_id` to an `ObjectId` without dual-type tolerance is either fixed or explicitly justified as safe.

6. **Sibling FK audit.** Dev Notes record a short audit of other top-level FK fields for the same string/ObjectId split: `character_id` on submissions (finding: already coerced on POST + dual-read on GET — note whether the migration should also normalise it), `project_invitations.cycle_id` (finding: String by its own collection convention — confirm internal consistency, out of scope), `linked_cycle_id` on NPCs, and `cycle_id` on investigations. No code change required for the already-tolerant siblings; the audit just has to be on record so a future reader does not re-discover the same landmine.

7. **Read-only audit script (USER runs).** A read-only Node ESM script `server/scripts/audit-submission-cycle-id-types.js` prints the type breakdown from AC 1 (string / ObjectId / null counts for `cycle_id` and `character_id`, per cycle). No writes, ever. Invoked as `cd server && node scripts/audit-submission-cycle-id-types.js`. Missing `MONGODB_URI` exits 1 with a clear message. **The user runs this against live** (per project rule: the user runs all migration/import scripts). The dev may run it against `tm_suite_test` to prove it works, and may run a read-only MCP count against live to fill the Live Data Findings section.

8. **One-time migration script (USER runs).** A Node ESM script `server/scripts/migrate-submission-cycle-id-to-oid.js`, modelled on the existing `server/scripts/migrate-submission-territory-keys.js` (#496 story 496.3):
   - **Dry-run by default**; `--apply` writes a backup then mutates. `--help`/`-h` prints usage, exits 0. Missing `MONGODB_URI` exits 1.
   - **Backup before write:** on `--apply`, writes a JSON backup of the entire `downtime_submissions` collection to `server/scripts/_backups/cycle-id-migration-<ISO-stamp>.json` **before** any mutation; a backup failure aborts before mutating. Backup format matches the existing scripts (`{ capturedAt, submissions: [...] }`).
   - **Mutation:** for every submission whose `cycle_id` is a string that parses to a valid 24-hex ObjectId, `$set` it to the `ObjectId`. `null`/missing/already-ObjectId values are skipped (counted `already-migrated`).
   - **Idempotency:** a second `--apply` run is a no-op (no second backup, no second batch of writes); exits 0.
   - **Safety abort (exit 2):** if any string `cycle_id` does **not** parse to a valid ObjectId (i.e. would be silently dropped), the script lists the offending documents and aborts before writing the backup. Also requires the `downtime_cycles` collection to return ≥1 real cycle (guard against running against an empty/wrong DB).
   - **Post-state validation:** after `--apply`, re-counts string-typed `cycle_id` and logs `Post-state: N docs still have string cycle_id (expected 0)`.
   - **Scope decision (settled by PO, 2026-06-01): `cycle_id` ONLY.** The migration does not touch `character_id` — it is already tolerated on both read (dual-`$in` GET) and write (POST coercion), so it carries no live bug. Normalise it later only if a problem surfaces. Keep the migration's blast radius minimal.

9. **Tests (run against `tm_suite_test`).** New/updated tests in `server/tests/`:
   - **Lock check, string-typed cycle_id** (regression for AC 2): seed a `downtime_submissions` doc with `cycle_id` stored as a **string** equal to the active cycle's `_id`, with `feeding_territories[<terr-oid>] = "resident"`; assert the PATCH feeding-rights endpoint returns 409 when removing that character (today it would wrongly return 200/allow).
   - **Lock check, ObjectId-typed cycle_id** still works (no regression).
   - **PUT coercion** (AC 3): PUT a submission with a string `cycle_id` in the body; assert the stored doc has `cycle_id instanceof ObjectId`.
   - **Migration script unit/integration** (AC 8): dry-run detects string docs and writes nothing; `--apply` converts string→ObjectId; idempotent second run is a no-op; safety abort fires on an unparseable string `cycle_id`.
   - Tests target `tm_suite_test` (vitest setupFile isolation). Run **only the touched spec files**, not the full suite.

10. **No client-side changes.** The front end never writes `cycle_id` directly (it is set server-side / from the cycle context). This story is server + scripts only.

## Tasks / Subtasks

- [x] **Pre-flight: live data audit** (AC: 1)
  - [x] Ran the read-only `audit-submission-cycle-id-types.js` against live (MCP connect needs an explicit string; the audit script reads MONGODB_URI from .env and is a deliverable anyway). Grouped `cycle_id` + `character_id` by `$type`.
  - [x] Recorded counts per field, per cycle, in **Live Data Findings**. → 29 string cycle_id (DT1), 60 objectId, 12 null/missing.
  - [x] No unexpected type appeared; all string values are valid 24-hex. Proceeded without pause.

- [x] **Read-side: fix feeding-rights lock check** (AC: 2, 5)
  - [x] Read `server/routes/territories.js:106-148` in full.
  - [x] Changed the `find` to `cycle_id: { $in: [activeCycle._id, String(activeCycle._id)] }`.
  - [x] Corrected the comment — now states the type is mixed until the #497 migration runs and explains why (496.3 only touched `responses.*` territory keys).

- [x] **Write-side: PUT coercion** (AC: 3)
  - [x] In `server/routes/downtime.js` PUT `/:id`, before the `$set`, coerces `updates.cycle_id` and `updates.character_id` string→ObjectId via `parseId`, mirroring POST. No throw on malformed input (`if (oid) ...` guard).

- [x] **Schema clarification** (AC: 4)
  - [x] Added the FK type-tolerance comment block above `character_id`/`cycle_id` in `downtime_submission.schema.js`. Kept `type: ['string','null']`.

- [x] **Sibling FK audit** (AC: 6)
  - [x] Re-grepped `cycle_id`/`linked_cycle_id` in `server/routes/`. Findings recorded in Dev Notes → Grep-sweep & FK audit.
  - [x] Found one additional ObjectId-only submission-by-cycle_id read (joint-invitation accept, `downtime.js:1175`) — made it dual-type too (safe completeness; joints are DT2+ only).

- [x] **Read-only audit script** (AC: 7)
  - [x] Created `server/scripts/audit-submission-cycle-id-types.js` (read-only; exits 1 on missing `MONGODB_URI`; `MONGODB_DB` override). Ran it against live for the AC-1 findings.

- [x] **Migration script** (AC: 8)
  - [x] Created `server/scripts/migrate-submission-cycle-id-to-oid.js` (dry-run default, `--apply` backup-before-write, idempotent, safety-abort exit 2, post-state validation). Dry-run against live confirms 29 to migrate / 72 already-migrated / 0 aborts.
  - [x] `cycle_id` ONLY — `character_id` untouched (PO decision 2026-06-01).

- [x] **Tests** (AC: 9)
  - [x] Added #497 lock-check tests (string + ObjectId cycle_id) to `api-territories-regent-write.test.js`, and **fixed a pre-existing failing lock test in that file** (see Debug Log).
  - [x] Added PUT-coercion test to `api-downtime.test.js`.
  - [x] Added `migrate-submission-cycle-id-to-oid.test.js` (unit classifier + integration audit/apply/idempotency/safety-abort).
  - [x] Ran only the touched + adjacent spec files against `tm_suite_test`. All green.

- [x] **Hand-off note for the user** → see Dev Agent Record → Completion Notes (exact commands + expected post-state).

## Dev Notes

### Depends on
Nothing blocking. Branch `morningstar-issue-497-cycle-id-objectid` already created off `dev` (in sync with origin at pickup). #496 (territory keys) is a separate concern and is mostly merged on `dev`.

### Key files
- `server/routes/territories.js` — feeding-rights lock check (the bug, lines 106-148; query at 117-120)
- `server/routes/downtime.js` — POST coercion reference (619-628); PUT update path (787-792); existing dual-type read filters (666, 707)
- `server/schemas/downtime_submission.schema.js` — `cycle_id` (193), `character_id` (191) comments
- `server/scripts/migrate-submission-territory-keys.js` — **the template** for the new migration script (dry-run/backup/idempotent/safety-abort skeleton)
- `server/scripts/audit-submission-cycle-id-types.js` — **new**
- `server/scripts/migrate-submission-cycle-id-to-oid.js` — **new**
- `server/tests/` — new lock-check + PUT-coercion + migration tests

### Live Data Findings

**Audit run:** 2026-06-01 against live `tm_suite.downtime_submissions` via the read-only `audit-submission-cycle-id-types.js` script (101 submissions total).

| Field | Type | Count | Notes |
|---|---|---|---|
| `cycle_id` | string | **29** | All share one value: `69d0a3c5052b57f6be774e69` (the DT1 cycle). Valid 24-hex → migrates cleanly. |
| `cycle_id` | objectId | 60 | DT2 (`69e955c7…`, 29) + DT3 (`69f2dc48…`, 25) + later cycles (5) |
| `cycle_id` | null | 6 | drafts |
| `cycle_id` | missing | 6 | drafts (field absent) |
| `character_id` | string | 29 | Same 29 DT1 docs |
| `character_id` | objectId | 72 | |

**Implications:**
1. **Confirms the issue exactly.** 29 string-typed `cycle_id` docs, all from the DT1 cycle — invisible to `find({ cycle_id: <objectId> })`.
2. **No unparseable strings.** Every string `cycle_id` is a valid 24-hex ObjectId, so the migration has **zero safety aborts** and converts cleanly to ObjectId.
3. **Single source cycle.** All 29 belong to one DT1 cycle — the migration touches exactly 29 docs.
4. **`character_id` mirrors the split** (same 29 docs) but is already tolerated both-sides (POST coercion + dual-`$in` GET). Per PO decision (2026-06-01) it is **out of the migration scope** — cycle_id only.
5. No unexpected types surfaced — proceeding without pause per AC 1.

### Things explicitly NOT in scope
| Item | Why |
|---|---|
| `project_invitations.cycle_id` type change | Stored as String by its own collection convention and queried as String (`downtime.js:1076`); internally consistent — changing it is a separate, unrelated migration |
| Front-end changes | Front end never writes `cycle_id` directly |
| Removing the read-side dual-type tolerance after migration | A cleanup follow-up (like 496.4) — keep tolerance until the live migration is confirmed run; do not tighten in this story |
| Tightening the schema to reject string `cycle_id` | Inbound is always a string; the coercion is server-side. Schema stays permissive |

### Calibration and safety rules (per project memory)
- **Hobby-project scale:** this is a few hours of work, most of it already done by prior incremental fixes. Don't over-engineer — the only live read bug is the territories lock check.
- **User runs all migration/import scripts.** Write the audit + migration scripts; the user executes them against live. The dev may run them against `tm_suite_test` to prove they work, and a read-only MCP count against live for the audit.
- **Test DB isolation:** all tests run against `tm_suite_test` (vitest setupFile). Never point at live `tm_suite`.
- **MongoDB MCP quirk:** the MCP Accept prompt can misfire on writes; for the audit use read-only ops or the audit script. For anything destructive, prefer a Node script under `server/scripts/`.
- **Targeted tests only:** run the touched spec files, never the full 428-test suite.
- **dev is team-only staging proxying to the PROD API** (from `main`): this server change is NOT verifiable on the dev site until it reaches `main`. This is launch prep — players are not on downtimes yet, so the real-world risk window is small, but the lock-check correctness still matters for the first live cycle.
- **Live credentials:** never reset Discord/OAuth secrets; use the existing `.env`.

### Why the bug exists / why it matters
`activeCycle._id` is always an `ObjectId` (it is the `downtime_cycles` PK). The lock check compares `cycle_id` against it directly. Any DT1-era submission whose `cycle_id` was written as a string is invisible to that query. Real-world impact (from the issue): if a DT1 cycle were ever re-marked `status: 'active'`, the lock check would find none of its (string-typed) submissions and would allow a regent to strip feeding rights from a character who had already fed. The fix is dual-type read tolerance now + a one-time migration to make the stored type uniform, after which a later cleanup can drop the tolerance.

### References
- Issue #497 (this story) — full ACs and the mixed-type sample
- Issue #496 / stories `tech-debt.496.1`–`496.4` — the territory-key analogue; 496.3 migration script is the direct template
- `server/scripts/migrate-submission-territory-keys.js` — migration skeleton to copy
- 496.1 Dev Agent Record line 225 — where #497 was first filed (lock check `find({cycle_id})` misses string-typed submissions)
- ADR-002 — territory document canonicalisation (same canonical-OID principle, applied here to the cycle FK)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Grep-sweep & FK audit (AC 5, AC 6)

Every `cycle_id` / `linked_cycle_id` filter in `server/routes/` after the fix:

| Callsite | Shape | Verdict |
|---|---|---|
| `territories.js:117` lock check | `$in: [oid, String(oid)]` | **FIXED this story** (was ObjectId-only) |
| `downtime.js:666` hold-flags GET | `$or:[{oid},{string}]` | already tolerant |
| `downtime.js:707` list GET | `$or:[{oid},{string}]` | already tolerant |
| `downtime.js:1175` joint-accept submission lookup | `$in: [oid, String(oid)]` | **FIXED this story** (defensive; joints are DT2+ so unreachable for string docs, but kept uniform) |
| `downtime.js:751,877,1162,1342` | coerce stored `cycle_id` → oid, then `findOne` on **cycles** by `_id` | safe — reading a stored value, not querying submissions |
| `downtime.js:619-628` POST | coerces `cycle_id`+`character_id` on write | reference pattern |
| `downtime.js:787` PUT | coerces `cycle_id`+`character_id` on write | **ADDED this story** |
| `investigations.js:24` (`cycle_id`) | `$or` dual-type | already tolerant (different collection) |
| `npcs.js:143` (`linked_cycle_id`) | `$or` dual-type | already tolerant (different collection) |

**Sibling FK findings:**
- `character_id` (submissions): same string/ObjectId split (29 string docs, the live audit confirmed) but already coerced on POST + dual-`$in` on GET. Per PO decision, **not** migrated. No code change.
- `project_invitations.cycle_id`: stored as **String** by its own collection convention (`schema:30` = `type:'string'`; inserted as `String(req.params.cycleId)` at `downtime.js:260,327`; queried as `String(cycleIdRaw)` at `1076`). Internally consistent — out of scope. The accept handler parses it to an ObjectId only to look up the cycle by `_id` (fine).

### Debug Log References

- **Pre-existing failing test fixed.** `api-territories-regent-write.test.js > locks > "regent cannot remove a character who fed this cycle"` was **already red on the branch before any #497 change**. Root cause: story 496.4 simplified the lock check to compare feeding-grid keys directly against `String(territory._id)`, but this test still seeded the grid with a *slug* key (`rfr_test_sc`), which no longer matches → endpoint returned 200 instead of 409. My `cycle_id` edit did not cause it (the test uses an ObjectId cycle_id, which the new `$in` includes). Fixed by seeding the grid with the territory OID (`territoryKey: terr._idStr`) — the post-496.4 canonical shape — via a new `territoryKey` option on the `seedSubmission` helper. The two other lock tests that pass a grid key were migrated to the same option for consistency (the ST-override and poach tests pass regardless of key, but kept uniform).

### Completion Notes List

**What changed (code):**
1. `server/routes/territories.js` — feeding-rights lock check now matches `cycle_id` of both types (`$in: [activeCycle._id, String(activeCycle._id)]`); misleading 496.4 comment corrected.
2. `server/routes/downtime.js` — PUT `/:id` coerces string `cycle_id`/`character_id` → ObjectId before `$set` (mirrors POST). Joint-accept submission lookup (`:1175`) made dual-type.
3. `server/schemas/downtime_submission.schema.js` — FK type-tolerance comment on `character_id`/`cycle_id` (storage = ObjectId; request = string; coerced server-side; reads dual-type during grace window). Types unchanged.

**What changed (scripts — USER runs against live):**
4. `server/scripts/audit-submission-cycle-id-types.js` — read-only type breakdown.
5. `server/scripts/migrate-submission-cycle-id-to-oid.js` — one-time string→ObjectId migration (dry-run default).

**Tests:** all green against `tm_suite_test`.
- `api-territories-regent-write.test.js`: 15 pass (1 pre-existing fail fixed + 2 new #497 lock tests).
- `api-downtime.test.js`: PUT-coercion test added; full file green.
- `migrate-submission-cycle-id-to-oid.test.js`: 7 (classifier unit + audit/apply/idempotency/safety-abort integration).
- Regression: `api-joint-projects.test.js` + `api-invitation-lifecycle.test.js` (55) green after the `:1175` change.

**Live audit (read-only):** 29 string `cycle_id` (all DT1 cycle `69d0a3c5…`), 60 ObjectId, 12 null/missing. All 29 strings are valid 24-hex → migration is clean (0 safety aborts). Dry-run confirms: `toMigrate: 29, alreadyMigrated: 72`.

**HAND-OFF — commands for the user to run against LIVE (this server change is not testable on the dev site since dev proxies to the prod API; these scripts hit Atlas directly via `server/.env`):**
```
cd server
node scripts/audit-submission-cycle-id-types.js              # read-only: confirm the 29/60/12 split
node scripts/migrate-submission-cycle-id-to-oid.js           # dry-run: expect toMigrate 29
node scripts/migrate-submission-cycle-id-to-oid.js --apply   # writes a backup to scripts/_backups/ then converts
```
Expected post-`--apply` log: `Post-state: 0 docs still have string cycle_id (expected 0).` A second `--apply` run is a no-op (`already-migrated: true`).
After the live migration is confirmed, the read-side dual-type tolerance can be removed in a later cleanup (out of scope here — keep it until the migration has run).

### File List

**New files:**
- `server/scripts/audit-submission-cycle-id-types.js`
- `server/scripts/migrate-submission-cycle-id-to-oid.js`
- `server/tests/migrate-submission-cycle-id-to-oid.test.js`

**Modified files:**
- `server/routes/territories.js` (lock-check dual-type + comment)
- `server/routes/downtime.js` (PUT FK coercion; joint-accept dual-type)
- `server/schemas/downtime_submission.schema.js` (FK tolerance comment)
- `server/tests/api-territories-regent-write.test.js` (fixed pre-existing lock test; +2 #497 tests; `territoryKey` helper option)
- `server/tests/api-downtime.test.js` (+PUT-coercion test)
- `specs/stories/tech-debt.497.cycle-id-objectid-fk.story.md` (this file)
- `specs/stories/sprint-status.yaml` (status tracking)

### Change Log

- 2026-06-01: Implemented #497 — cycle_id dual-type read tolerance (lock check + joint-accept), PUT FK coercion, schema tolerance comment, read-only audit + one-time migration scripts (user-run), tests. Fixed a pre-existing 496.4 lock-check test failure in the touched file. Status → review.
- 2026-06-01 (QA, Quinn): Verdict **PASS**. Re-ran all touched suites (45) + adjacent joint/invitation suites (55) — green. Coverage maps cleanly to ACs 2/3/8/9. Added one pragmatic edge test: PUT with a malformed `cycle_id` is left untouched and does not 500 (exercises the coercion guard's null branch). `api-downtime.test.js` now 22 green. No blocking gaps; audit/migration CLI backup paths are intentionally not unit-tested (consistent with the 496.3 precedent).
