---
issue: 496
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/496
branch: ms/issue-496-territory-keys-canonical-oid
story: 496.1
parent_scope: 4-story breakdown — see issue #496 body
sequence: 1 of 4 (496.1 → 496.2 → 496.3 → 496.4)
---

# Story 496.1: Server dual-read tolerance for territory keys

Status: review

## Story

As a developer migrating submission territory keys from legacy slug/name formats to canonical ObjectId,
I want the server to accept **both** ObjectId and legacy keys for every territory-encoded field in submissions,
so that subsequent stories (496.2 form-side write, 496.3 bulk migration) can roll out independently without an atomic deploy and without breaking active downtime cycles.

This is the **safety net** story for the four-part migration. Nothing else can ship safely until the server tolerates both formats.

## Acceptance Criteria

1. **Pre-flight live data audit** — Before any code change, query live `tm_suite.downtime_submissions` to enumerate the actual key shapes present in each of the six territory-encoded response fields. Findings are recorded in the **Live Data Findings** section of this story file. If any field contains a format not anticipated by issue #496 (something other than long slug / short slug / display name / ObjectId), surface it and pause for direction before coding.
2. **JSON-string fields tolerate both formats on read.** `feeding_territories`, `feeding_territories_rote`, `influence_spend` are JSON strings — the schema treats them as opaque strings, so no schema change is required, but every **server-side reader** of these fields must use a shared resolver that accepts both ObjectId and legacy keys.
3. **Enum fields accept ObjectId strings.** `project_${n}_territory`, `sphere_${n}_territory`, `project_${n}_ambience_target` are AJV-validated enums in `server/schemas/downtime_submission.schema.js:62-94` (line refs from issue audit). Schema is widened so each accepts either the existing short-slug enum value OR a 24-char hex ObjectId string. Garbage values still rejected with `VALIDATION_ERROR`.
4. **Feeding-rights lock check tolerates both formats.** `server/routes/territories.js:125` currently calls `normaliseTerritorySlug()` on submission keys to compare against `territory.slug`. Replace with a shared helper that resolves a submission key (OID or legacy) to a territory `_id`, then compares `territory._id` to `_id`. Behaviour: a character with `feeding_territories[<this-terr-oid>] = "resident"` and a character with `feeding_territories["the_north_shore"] = "resident"` both block removal of feeding rights for The North Shore.
5. **Shared resolver lives server-side.** A new helper `resolveSubmissionTerritoryKey(key, territoriesById, territoriesBySlug, territoriesByName)` returns the canonical territory `_id` for any of: 24-char hex OID, long slug, short slug, display name. Returns `null` for Barrens / unmapped values. All server-side readers of submission territory fields use this helper.
6. **Server tests cover both formats.** New tests in `server/tests/` exercise: (a) POST submission with OID-keyed `feeding_territories` → persists & reads back; (b) POST submission with legacy-slug-keyed `feeding_territories` (current format) → persists & reads back unchanged; (c) POST submission with mixed OID + slug keys in the same payload → both work; (d) feeding-rights lock check rejects character removal when submission has OID-keyed territory matching their feed; (e) feeding-rights lock check rejects character removal when submission has legacy-slug-keyed territory matching their feed. Tests run against `tm_suite_test` per the existing isolation setup.
7. **No client-side changes.** Form (`public/js/player/downtime-form.js`) continues to write legacy keys. Admin readers (`public/js/admin/downtime-views.js`) continue to use `resolveTerrId` for normalisation. Frontend stays untouched; this story is server-only.
8. **Smoke test on localhost.** POST a test submission with mixed-format keys (legacy for feeding, OID for project_1_ambience_target) via the admin tools or a curl/fetch script; confirm it persists in `tm_suite_test`; confirm the existing admin processing view reads it correctly (no JS errors, territory pills render).

## Tasks / Subtasks

- [x] **Pre-flight: Live data audit** (AC: 1)
  - [x] Use MCP MongoDB (`mcp__plugin_mongodb_mongodb__find`) to sample 5-10 submissions from live `tm_suite.downtime_submissions`. If MCP confirmation prompt misfires, fall back to a read-only Node script under `server/scripts/audit-submission-territory-keys.js` per the documented MongoDB MCP quirk.
  - [x] For each of these six fields, list every distinct key format seen across the sample. Record under **Live Data Findings**:
    - `responses.feeding_territories` (JSON-string keys)
    - `responses.feeding_territories_rote` (JSON-string keys)
    - `responses.influence_spend` (JSON-string keys)
    - `responses.project_${n}_territory` for n=1..4 (enum)
    - `responses.sphere_${n}_territory` for n=1..4 (enum)
    - `responses.project_${n}_ambience_target` for n=1..4 (enum)
  - [x] Note the **count** of submissions touched (e.g. "12 of 30 submissions have non-empty `project_*_ambience_target`")
  - [x] If an unexpected format appears, **stop and surface to user** before continuing. → **Surfaced 2 unexpected findings: `influence_spend` is long-slug (not display-name as #496 claimed); legacy `influence_territories` field exists in 20 DT1 submissions with display-name keys. User confirmed direction; #496 updated via comment.**

- [x] **Add shared resolver helper** (AC: 5)
  - [x] Create `server/utils/territory-key-resolver.js` exporting `resolveSubmissionTerritoryKey(key, lookupMaps)`.
  - [x] `lookupMaps` is `{ byId: Map<oid, territoryDoc>, bySlug: Map<slug, territoryDoc>, byName: Map<name, territoryDoc>, byLongSlug: Map<longSlug, territoryDoc> }`. → **Implementation deviation:** `byLongSlug` map omitted; long slugs are routed through the existing `normaliseTerritorySlug()` helper (which already maps `the_harbour` → `harbour` etc.). Avoids duplicating TERRITORY_SLUG_MAP knowledge across two locations.
  - [x] Resolution order: byId → bySlug → byName → byLongSlug (via existing TERRITORY_SLUG_MAP server-side at `server/utils/territory-slugs.js`).
  - [x] Returns the territory document's `_id` string, or `null`.
  - [x] Unit-test the resolver against all four input formats (`server/tests/territory-key-resolver.test.js`) — placed in `tests/` flat (no `utils/` subdir exists in tests/), 17 tests cover all formats + edge cases.
  - [x] Add a `buildTerritoryLookupMaps(territories)` factory in the same file so callers don't reconstruct the maps each time.

- [x] **Server schema: widen enum fields** (AC: 3)
  - [x] In `server/schemas/downtime_submission.schema.js`, find the enum definitions for `project_${n}_territory`, `sphere_${n}_territory`, `project_${n}_ambience_target` (per issue #496 references, around line 62-94).
  - [x] For each enum: replace with an `anyOf` that accepts (a) the existing short-slug enum OR (b) a `pattern: "^[a-f0-9]{24}$"` for ObjectId strings OR (c) empty string for "not set". → **Note:** `project_*_ambience_target` was already an unconstrained `{ type: 'string' }` (no enum) — no widening needed. Only `project_*_territory` and `sphere_*_territory` actually had enum constraints. New shared `territoryKeyOrOid` schema fragment defined and applied to both.
  - [x] Confirm `additionalProperties` settings remain strict on the parent objects.
  - [x] Document in the schema file comment that this is transitional dual-format tolerance per issue #496, with the cutover and tightening happening in story 496.4.

- [x] **Update feeding-rights lock check** (AC: 4)
  - [x] Read `server/routes/territories.js:125-134` in full.
  - [x] Replace the `normaliseTerritorySlug()` call with `resolveSubmissionTerritoryKey()` from the new helper. → **`normaliseTerritorySlug` import removed entirely from `routes/territories.js`** — no other usage in this file, so the import was dead after the lock-check refactor (per memory rule: delete unused, don't leave shims).
  - [x] Pre-fetch the lookup maps once at the top of the handler, not inside the inner loop. → Used **single-territory lookup map** (`buildTerritoryLookupMaps([territory])`) — avoids a second DB fetch since we already have the relevant territory in scope; any submission key that doesn't resolve to THIS territory's `_id` correctly returns null and is skipped.
  - [x] Confirm the comparison is `territory._id.toString() === resolvedId.toString()` (string-compare, since `_id` may be ObjectId or string depending on driver). → Done via `String(territory._id)` and string-equality.

- [x] **Update other server-side readers of submission territory fields** (AC: 2)
  - [x] Grep `server/` for reads of `responses.feeding_territories`, `responses.influence_spend`, `responses.project_*_territory`, `responses.project_*_ambience_target`. Cover each callsite.
  - [x] Each callsite uses `resolveSubmissionTerritoryKey()` to normalise keys before comparison or aggregation.
  - [x] **Finding:** No other server-side readers exist. The feeding-rights lock check in `server/routes/territories.js` is the only production server-side reader of these submission fields. Other matches in the grep are: schema definitions (not readers), one-shot ops scripts under `server/scripts/` (out of scope), test fixtures (validate inline parsers, not server code paths), and one test that mirrors client-side parser logic (`overfeeding-poaching-feeder-counts.test.js` — exercises `computeMatrixFeederCounts` in `public/js/admin/downtime-views.js`, which uses the frontend `resolveTerrId`; 496.4 scope, not 496.1). AC 2 is therefore satisfied implicitly by the AC 4 lock-check update.

- [x] **Server tests** (AC: 6)
  - [x] Locate existing submission test file (e.g. `server/tests/api-downtime-submissions.test.js` or similar). Read the existing pattern. → Modelled on `api-downtime-personal-story-freetext.test.js` (supertest + ObjectId helpers + setupDb/teardownDb).
  - [x] Add 5 new tests per AC 6 (a) through (e). Use existing fixture builders if present. → 5 tests added in new file `server/tests/api-territory-dual-read.test.js`. Test (e) (slug-keyed lock check) is already covered by the pre-existing test at `api-territories-regent-write.test.js:183` and verified non-regressed in the regression sweep, so the new file covers (a)/(b)/(c)/(d) explicitly + one validation-rejection test for garbage input.
  - [x] Confirm tests run against `tm_suite_test` (per memory: `Test DB isolation — tm_suite_test forced via vitest setupFile`). Do not point at live `tm_suite`. → Uses standard `setupDb()` helper which enforces tm_suite_test.
  - [x] Run only the touched spec file(s), not the full 428-test suite (per memory: `Targeted tests not full suite`). → Regression sweep run: 145 tests across 10 files (new 3 + adjacent territories/schema/feeding tests). All pass.

- [x] **Smoke test on localhost** (AC: 8)
  - [x] Start local API (`cd server && node index.js`). → Started by dev agent in background; health check returned `{"status":"ok","db":"connected"}`.
  - [x] Start local frontend (`npx http-server public -p 8080`). → User had this already running.
  - [x] POST a test submission via curl/admin tools with mixed-format keys. → Covered by AC 6 test (c) end-to-end via supertest.
  - [x] Verify it persists in `tm_suite_test`. → Covered by AC 6 test (c) round-trip assertions.
  - [x] Load the admin processing view, confirm no JS errors, confirm territory pills render correctly. → **User-verified 2026-05-24** against live DT3 cycle: no console errors, all 29 character chips rendered with published state, all phase sections loaded with correct action counts, Step 3 Feeding expanded to show real action rows ("Brandy LaRoux - Rote Feed - Valid" etc.). Existing reader code reads slug-keyed submissions through the unchanged path without issue.

## Dev Notes

### Depends on
Nothing — this is the foundation story for issue #496. Branch is already created (`ms/issue-496-territory-keys-canonical-oid`, off `dev`).

### Key files
- `server/schemas/downtime_submission.schema.js` — enum widening
- `server/routes/territories.js` — feeding-rights lock check (line 125)
- `server/utils/territory-slugs.js` — existing legacy slug map; this story builds on top of it
- `server/utils/territory-key-resolver.js` — **new** in this story
- `server/tests/utils/territory-key-resolver.test.js` — **new** in this story
- `server/tests/api-downtime-submissions.test.js` (or equivalent) — new tests appended

### Live Data Findings

**Audit run:** 2026-05-24 against live `tm_suite.downtime_submissions` via MCP MongoDB (read-only).

**Sample scope:** 100 submissions total across two cycles:
- DT1 cycle `69d0a3c5052b57f6be774e69` (April 2026)
- DT2 cycle `69e955c784bbfc821bed2810` (May 2026)

**Territories collection state:** 5 real territories + 8 test fixtures (`regent_save_*` slugs). Real ones:

| Slug | _id | Name |
|---|---|---|
| `harbour` | `69d5dc6a00815d47150397c6` | The Harbour |
| `northshore` | `69d9e54b00815d471503bea6` | The North Shore |
| `academy` | `69d9e54b00815d471503bea7` | The Academy |
| `secondcity` | `69d9e54c00815d471503bea8` | The Second City |
| `dockyards` | `69d9e54c00815d471503bea9` | The Dockyards |

**Submission response field findings:**

| Field | Format | Count w/ data | Notes |
|---|---|---|---|
| `feeding_territories` | long slug (JSON string keys) | most submissions | Keys: `the_academy`, `the_harbour`, `the_dockyards`, `the_second_city`, `the_north_shore`, plus barrens. Values: `none`, `resident`, `feeding_rights`, `poach`, `barrens`. **Barrens slug inconsistency:** DT1 uses `the_barrens__no_territory_` (double underscore); DT2 uses `the_barrens_no_territory_` (single underscore). |
| `feeding_territories_rote` | long slug (JSON string keys) | DT2 only | Same format as `feeding_territories`. |
| `influence_spend` | long slug (JSON string keys) | 32 submissions | Format: `{"the_academy":5,"the_harbour":0,...}`. **DISCREPANCY with issue body:** issue #496 claimed display-name keys; live data shows long-slug keys. Migration script does NOT need to handle display-name keys for this field. |
| `influence_territories` | **display name** (JSON string keys) | 20 submissions, **DT1 only** | Format: `{"The Dockyards":5}`, `{"The Harbour":2,"The Second City":1,"The Shore":2}`. **Not mentioned in issue #496.** This is a legacy DT1-only field, separate from `influence_spend`. Includes the typo `"The Shore"` (missing "North"). Decision required from user: in scope for migration, or accept as archival? |
| `project_${n}_territory` | enum (schema-defined) | **0 submissions** | Dead field. Schema enum exists but never populated. |
| `sphere_${n}_territory` | short slug (enum) | 5 submissions, DT2 only | Values: `northshore`, `secondcity`, `academy`, `harbour`, `dockyards`. ✅ Matches schema enum. |
| `project_${n}_ambience_target` | short slug (enum) | 14 submissions, DT2 only | Values: `northshore`, `academy`, `dockyards`, `harbour`, `secondcity`. ✅ Matches schema enum. |

**Implications for downstream stories:**

1. **No mixed-format submissions exist in the wild.** Every JSON-string field is uniformly long-slug; every enum field is uniformly short-slug. The migration script (story 496.3) doesn't need per-key disambiguation logic.
2. **Issue #496's influence_spend claim was incorrect.** Migration logic simplified — single source format (long slug) → ObjectId.
3. **`influence_territories` is an additional legacy field** the issue didn't anticipate. 20 DT1 documents. Needs user direction on scope.
4. **`project_${n}_territory` is dead** — never populated in live data. Story 496.1 still widens the enum (cheap, defensive), but story 496.3 migration can skip it.
5. **Barrens slug variants** (`the_barrens__no_territory_` vs `the_barrens_no_territory_`) — resolver must tolerate both, but since Barrens has no OID, both correctly resolve to `null`. No data integrity risk.

**Surfaced to user — paused before coding per AC 1.**

**User direction (2026-05-24):**
- `influence_territories` (the legacy DT1-only field) → **migration-only scope, deferred to 496.3**. No server tolerance added in 496.1. Reason: nothing currently reads it; normalise during the bulk migration to prevent future fragmentation, but don't bloat the runtime tolerance layer for an inactive read path.
- Issue #496 will be updated with a comment summarising audit findings for downstream story authors.
- 496.1 scope stays as originally written: tolerance + lock check + tests for the active fields (`feeding_territories`, `feeding_territories_rote`, `influence_spend`, `project_*_territory` enum, `sphere_*_territory` enum, `project_*_ambience_target` enum).

### Things explicitly NOT in scope (handled by later stories)
| Item | Story |
|---|---|
| Form-side write change | 496.2 |
| Bulk migration of existing submissions | 496.3 |
| Deletion of `resolveTerrId`, `TERRITORY_SLUG_MAP`, `normaliseTerritoryGrid`, `normaliseTerritorySlug` | 496.4 |
| Reader simplification in `public/js/admin/downtime-views.js` (`_entryTerritories`, `_gatherInfluence`) | 496.4 |
| Schema tightening to reject non-OID after grace window | 496.4 |
| CSV import retirement | 496.4 |

### Calibration and safety rules
- **Hobby-project scale** (per memory): half-day's work. Don't over-engineer the resolver.
- **Don't add backward-compat shims beyond what's needed.** This story adds tolerance because we need it; it doesn't add abstraction for hypothetical future formats.
- **Targeted tests only** (per memory): run the new test file and the changed-area test file. Do NOT run the full server test suite for this change.
- **Live credentials warning** (per memory): never reset Discord/OAuth secrets; use existing `.env` configurations.
- **MongoDB MCP quirk** (per memory): MCP confirmation may misfire. For the audit step, if the prompt fails, fall back to a read-only Node script under `server/scripts/`.
- **Test DB isolation** (per memory): all tests run against `tm_suite_test`. Never point at live `tm_suite`.

### Why a shared resolver
The existing server-side normaliser `normaliseTerritorySlug()` only handles slug-format inputs. We need a resolver that accepts **any** format (OID, long slug, short slug, display name) and returns the canonical `_id`. Building it once as a shared helper avoids the four-format conditional being duplicated at every read site, and gives 496.4 a single deletion target when the tolerance window closes.

### Dual-read strategy rationale
This story implements **phase 1** of the dual-read migration:
1. **Phase 1 (this story):** Server accepts both formats. No client changes. Safe to deploy independently.
2. **Phase 2 (496.2):** Form starts writing OIDs. Server already tolerant, so no breakage.
3. **Phase 3 (496.3):** Migration script rekeys stored submissions. No deploys.
4. **Phase 4 (496.4):** Tighten server to OID-only, delete tolerance code and normalisers.

Each phase is independently rollback-safe. Deploying this story alone is harmless: clients still send legacy keys, server still accepts them, no behaviour change for users.

### References
- Issue audit transcript: `Territory ID Fragmentation Audit` (chat session 2026-05-24)
- Issue #496 acceptance criteria (this story covers 1, 2, 3, 4, 9 partially — lock check)
- Issue #33 — prior territory schema tightening (closed, sets precedent for `additionalProperties: false` pattern)
- ADR-002 — Territory document canonicalisation (already done; this story extends the same canonical-OID principle to submission responses)
- `public/js/admin/downtime-views.js:3762` — `resolveTerrId` (frontend equivalent; **not** modified in this story)
- `public/js/admin/downtime-constants.js:120` — `TERRITORY_SLUG_MAP` frontend (**not** modified in this story)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Test fixture bug discovered during AC 6: initial `api-territory-dual-read.test.js` seeded a global active cycle for payload context AND a separate active cycle in the lock-test describe block. The lock handler's `findOne({ status: 'active' })` picked the wrong one, causing the OID lock test to return 200 instead of 409. Fix: changed the global cycle's status to `'closed'` (payload-only context, no lock interaction).

### Completion Notes List

**What changed**
1. **New: `server/utils/territory-key-resolver.js`** — exports `buildTerritoryLookupMaps(territories)` and `resolveSubmissionTerritoryKey(key, maps)`. Resolves any submission territory key (OID / short slug / long slug / display name / legacy variant) to the canonical territory `_id` string. Returns `null` for Barrens or unmappable input.
2. **Modified: `server/schemas/downtime_submission.schema.js`** — defined new `territoryKeyOrOid` schema fragment (anyOf: existing short-slug enum OR 24-char hex pattern). Applied to `project_${n}_territory` and `sphere_${n}_territory`. `project_${n}_ambience_target` was already unconstrained; no change needed.
3. **Modified: `server/routes/territories.js`** — feeding-rights lock check at PATCH `/api/territories/:id/feeding-rights` now uses the shared resolver. Comparison is OID-to-OID. `normaliseTerritorySlug` import removed (no other usage in file).
4. **New: `server/tests/territory-key-resolver.test.js`** — 17 unit tests covering all input formats + edge cases.
5. **New: `server/tests/schema-territory-dual-read.test.js`** — 28 AJV schema tests confirming the widened enums accept both formats and still reject garbage.
6. **New: `server/tests/api-territory-dual-read.test.js`** — 5 integration tests covering AC 6 (a)/(b)/(c)/(d) + one validation-rejection test.

**Test results**
- All new tests pass (50 tests across 3 new files)
- Adjacent regression sweep: 145 tests across 10 files — all pass, zero regression
- Adjacent files covered: `api-territories.test.js`, `api-territories-regent-write.test.js`, `api-territories-regent-save.test.js`, `api-territories-regent-lieutenant.test.js`, `schema-project-action-enum.test.js`, `overfeeding-poaching-feeder-counts.test.js`, `feeding-grounds-double-free.test.js`

**Design decisions surfaced**
- Used **single-territory lookup map** in the lock check (`buildTerritoryLookupMaps([territory])`) rather than fetching all territories per request — avoids a second DB query since the territory doc is already in scope. Any non-matching key correctly resolves to `null` and is skipped.
- `normaliseTerritorySlug` import deleted from `routes/territories.js` even though it's transitional — per project rule "delete unused, don't leave shims". The function still exists in `server/utils/territory-slugs.js` (used internally by the new resolver) until 496.4 retires it.
- Schema fragment `territoryKeyOrOid` defined once and applied to two fields via `projectSlotProps()` / `sphereSlotProps()` — single deletion target when 496.4 tightens back to OID-only.

**Pre-flight audit findings that affected downstream stories (handed off to 496.3)**
- `influence_spend` uses long-slug keys (NOT display-name as #496 originally claimed). Migration in 496.3 doesn't need display-name handling for this field.
- A **legacy `influence_territories` field** exists in 20 DT1-only submissions with display-name keys (including the typo `"The Shore"`). Not in scope for 496.1; user direction was migration-only, deferred to 496.3.
- `project_*_territory` is dead — 0 documents have it populated. 496.3 migration can skip it.
- Barrens slug has two variants (`the_barrens__no_territory_` and `the_barrens_no_territory_`); both safely resolve to `null` via the existing TERRITORY_SLUG_MAP. No data risk.

**What still needs the user**
- AC 8 browser-side smoke test → **Completed 2026-05-24:** user verified against live DT3 in admin processing view; no console errors, all 29 character chips and phase sections render correctly.

**QA polish pass (2026-05-24, post-review)**
Same-model self-review surfaced two LOW/MED-priority improvements; both addressed:
1. **Uppercase OID handling.** Resolver's OID branch now lowercases input before lookup, so uppercase-hex submission keys resolve correctly instead of returning `null`. Live data doesn't contain uppercase OIDs (MongoDB emits lowercase), but the defensive change tightens the code and corrects the test expectation.
2. **Cross-territory negative lock-check test.** Added test confirming that an OID-keyed submission for a *different* territory correctly does NOT lock removals from this territory. Guards against a future refactor that might remove the single-territory map filter.

QA also surfaced a pre-existing bug NOT in 496.1 scope: `downtime_submissions.cycle_id` is stored as both string and ObjectId in live data, causing the lock check's `find({ cycle_id: activeCycle._id })` query to miss string-typed submissions. Filed as issue #497.

### File List

**New files:**
- `server/utils/territory-key-resolver.js`
- `server/tests/territory-key-resolver.test.js`
- `server/tests/schema-territory-dual-read.test.js`
- `server/tests/api-territory-dual-read.test.js`

**Modified files:**
- `server/schemas/downtime_submission.schema.js` (added `territoryKeyOrOid` fragment; applied to 2 enum-bearing fields)
- `server/routes/territories.js` (replaced `normaliseTerritorySlug` import + lock check usage with the new resolver)
- `specs/stories/tech-debt.496.1.server-territory-dual-read.story.md` (this file; Live Data Findings + Tasks/Subtasks checkboxes + Dev Agent Record)
