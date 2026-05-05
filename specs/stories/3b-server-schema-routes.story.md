---
id: issue-3b
issue: 3
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/3
branch: issue-3b-server-schema-routes
status: ready-for-review
priority: high
depends_on: ['issue-3-territory-fk-adr']
parent: issue-3
---

# Story #3b: Server schema + routes — `_id` as canonical territory FK

As a server-side developer of the TM Suite,
I should have a schema and a set of routes that treat MongoDB `_id` (string) as the canonical territory foreign key,
So that the rest of the territory FK refactor (migration script #3c, client refactor #3d, reference data #3e) can be built against a stable contract.

This story implements **migration steps 1 and 2** from ADR-002 (`specs/architecture/adr-002-territory-fk.md`). Strict cutover per Q2; the slug field is renamed to `slug` and demoted to a label; routes accept `_id` and reject slug bodies.

---

## Context

ADR-002 was approved at PR #21 / commit `021caeb`. The contract:

- `_id` is the canonical FK across all collections, routes, clients.
- The current `id` field on territory documents is **renamed to `slug`** (Q1) and retained as a non-unique human-readable label.
- API behaviour is **strict cutover** (Q2) — slug bodies that previously worked now return 400.
- `territory_residency` collection is **kept and migrated** (Q5, user diverged from Ptah's drop) — the `territory` field renamed to `territory_id`, type ObjectId-string. Schema and routes update accordingly. The dead client block in `downtime-form.js` is **out of scope** for #3b (and #3c) per the user's decision; it will be filed as a separate cleanup issue.

This story does NOT touch data on disk. Existing documents on production:

- `tm_suite.territories` — 5 docs, each carries an `id` field (the old slug). After #3b, the route accepts neither slug-as-_id nor slug-as-id-field for queries; the documents are still readable (their `_id` is unchanged) but their `id` field is now silently a non-FK label that the new route doesn't use. Renaming the field on disk to `slug` happens in **#3c**.
- `tm_suite.downtime_cycles.regent_confirmations` — empty across all live cycles per ADR-002 audit. Theoretical orphan risk if a cycle had slug-keyed entries; in practice there are none to orphan.
- `tm_suite.downtime_cycles.confirmed_ambience` / `discipline_profile` / `territory_pulse` — slug-keyed objects in some closed cycles. Read by clients; **client refactor (#3d) will change the read keys**. After #3b, the server routes don't directly key into these objects, so #3b doesn't break them; #3c will rekey on disk.
- `tm_suite.territory_residency` — 0 docs. No orphan risk.

### Files in scope

- `server/schemas/territory.schema.js` — both schemas updated. `territorySchema`: drop `required` (or leave empty `[]`), rename `id` → `slug` (still string, non-required, non-unique). `territoryResidencySchema`: rename `territory` → `territory_id`, retain string type with hex-OID validation.
- `server/routes/territories.js` — POST upsert path: stop matching by `{ id }`; updates by `{ _id }` only. PUT `/:id` already uses `_id`, leave. PATCH `/:id/feeding-rights`: drop the `$or: [{ _id: oid }, { id }]` slug fallback at line 78.
- `server/routes/territory-residency.js` — GET / PUT switch from `territory` (name string) to `territory_id` (ObjectId-string). Update query (`?territory=...` → `?territory_id=...`). Update PUT body shape.
- `server/routes/downtime.js` — `regent_confirmations` write path at the `confirm-feeding` endpoint: `findOne({ id: territory_id })` → `findOne({ _id: new ObjectId(territory_id) })`. Existing array entry shape (`territory_id` field) is preserved; only the value type changes from slug to ObjectId-string.

### Tests in scope (need fixture updates)

- `server/tests/api-territories.test.js` — POST tests; seeds use `id: 'rfr_test_territory'`. Update to use generated `_id` patterns or accept the API's generated `_id`.
- `server/tests/api-territories-regent-write.test.js` — `seedTerritory` helper at `:49` writes `{ id, name, ambience, regent_id, ... }`. Update: drop the `id` argument, capture the returned `_id`, use it in subsequent assertions and route paths.
- `server/tests/api-downtime-regent-gate.test.js` — similar. Test seeds territories with `{ id: terrId, ... }` and queries by slug. Convert to `_id`.
- `server/tests/api-players-sessions-residency.test.js` — exercises `territory_residency`. Update body shape from `territory` to `territory_id`.

### Files NOT in scope

- **Any client-side code.** Client refactor is #3d. Server can land #3b without touching `public/`.
- **Any data migration on disk.** Schema and routes change shape; existing docs are not rewritten. That's #3c.
- **`server/utils/territory-slugs.js`** (`TERRITORY_SLUG_MAP`). Demoted to legacy reader in #3e; no change in #3b.
- **`server/middleware/auth.js isRegentOfTerritory`.** Reads `territory.regent_id` (a character `_id`, not territory `_id`); unchanged by this refactor.
- **`server/scripts/cleanup-rfr-territory-residue.js`.** Already shipped in PR #20.
- **The dead client block** in `public/js/tabs/downtime-form.js:73, 1311-1317` — out of scope per user's Q5 decision; file as separate issue.

---

## Acceptance Criteria

**Given** the new schema is loaded
**When** validating a territory document `{ name: 'Foo', ambience: 'Curated', slug: 'foo' }`
**Then** validation passes; no `id` field is required.

**Given** the new schema is loaded
**When** validating a territory document with the legacy field name `{ name: 'Foo', id: 'foo' }`
**Then** validation passes (because `additionalProperties: true` carries through), but the field has no semantic role; the route layer treats it as label-equivalent.

**Given** an ST sends `POST /api/territories { name: 'Foo', slug: 'foo', ambience: 'Curated' }` (no `_id`)
**When** the route runs
**Then** a new document is inserted with a generated `_id`; the response body contains the document including the `_id`. Slug is stored as a label.

**Given** an ST sends `POST /api/territories { _id: '<existing-oid-string>', name: 'Foo Updated' }` (with `_id`)
**When** the route runs
**Then** the document with that `_id` is updated (or `404` if the `_id` is unknown). No upsert by slug.

**Given** an ST sends `PATCH /api/territories/<oid>/feeding-rights { feeding_rights: [...] }`
**When** the route runs
**Then** the document with that `_id` is updated. Slug-style identifiers in the URL (e.g. `/api/territories/secondcity/feeding-rights`) return `400 VALIDATION_ERROR: Invalid territory ID format` (already the existing behaviour for non-OID strings; the change is dropping the `$or: [..., { id }]` fallback at `routes/territories.js:78` so `secondcity` no longer succeeds via that path).

**Given** an ST sends `GET /api/territory-residency?territory_id=<oid>`
**When** the route runs
**Then** the doc matching that `territory_id` is returned, or `{ territory_id: <oid>, residents: [] }` if none exists.

**Given** an ST sends `PUT /api/territory-residency { territory_id: '<oid>', residents: [...] }`
**When** the route runs
**Then** the upsert key is `territory_id` (ObjectId-string), not the territory name. The schema validates `territory_id` as a non-empty string.

**Given** an ST sends `POST /api/downtime_cycles/<id>/confirm-feeding { territory_id: '<oid>', ... }`
**When** the route runs
**Then** territory lookup uses `_id` (`findOne({ _id: new ObjectId(territory_id) })`), not the slug field. The `regent_confirmations` array entry stores `territory_id: '<oid>'` (the same string). Existing slug-keyed entries on disk are unaffected (read paths handled in #3d).

**Given** the server tests run
**When** all four affected suites execute
**Then** they pass. Fixtures use generated `_id` (or hex OID-shaped strings) rather than the legacy slug-as-id pattern.

**Given** the changes are committed
**When** a developer reads the diff
**Then** no client-side file (`public/js/...`) is touched, no data migration script is added, and no `TERRITORY_SLUG_MAP` reference is altered.

**Given** a server smoke is performed
**When** Ptah brings the server up locally with a clean MongoDB seed (or against a temp test DB) and runs the standard route exercises
**Then** the new endpoints behave as specified. Smoke output captured into the Dev Agent Record.

---

## Implementation Notes

### Schema rewrite shape

```js
// server/schemas/territory.schema.js
export const territorySchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Territory',
  type: 'object',
  additionalProperties: true,                // unchanged
  properties: {
    slug:            { type: 'string', minLength: 1 }, // renamed from id; non-required, non-unique
    name:            { type: 'string' },
    ambience:        { type: 'string' },
    regent_id:       { type: ['string', 'null'] },
    lieutenant_id:   { type: ['string', 'null'] },
    feeding_rights:  { type: 'array', items: { type: 'string' } },
    updated_at:      { type: 'string' },
  },
  // 'required' dropped — route layer enforces what it needs per endpoint
};

export const territoryResidencySchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TM Territory Residency',
  type: 'object',
  required: ['territory_id', 'residents'],
  additionalProperties: true,
  properties: {
    territory_id: { type: 'string', minLength: 1 }, // was 'territory' (name)
    residents:    { type: 'array', items: { type: 'string' } },
    updated_at:   { type: 'string' },
  },
};
```

### Route changes (sketches)

**`server/routes/territories.js`**:

```js
// POST /api/territories — create or update by _id
router.post('/', requireST, validate(territorySchema), async (req, res) => {
  const { _id, ...fields } = req.body;
  if (_id) {
    const oid = parseId(_id);
    if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid _id format' });
    const result = await col().findOneAndUpdate(
      { _id: oid },
      { $set: { ...fields, updated_at: new Date().toISOString() } },
      { returnDocument: 'after' }
    );
    if (!result) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json(result);
  }
  // No _id → insert new
  const insert = await col().insertOne({ ...fields, updated_at: new Date().toISOString() });
  const doc = await col().findOne({ _id: insert.insertedId });
  return res.status(201).json(doc);
});

// PATCH /api/territories/:id/feeding-rights — _id only, no slug fallback
router.patch('/:id/feeding-rights', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid territory ID format' });
  const territory = await col().findOne({ _id: oid });   // NO slug fallback
  // ... rest unchanged
});
```

**`server/routes/territory-residency.js`**:

```js
router.get('/', async (req, res) => {
  const territory_id = req.query.territory_id;
  if (territory_id) {
    const doc = await col().findOne({ territory_id });
    return res.json(doc || { territory_id, residents: [] });
  }
  const docs = await col().find().toArray();
  res.json(docs);
});

router.put('/', validate(territoryResidencySchema), async (req, res) => {
  const { territory_id, residents } = req.body;
  if (!territory_id || !Array.isArray(residents)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'territory_id and residents[] required' });
  }
  const result = await col().findOneAndUpdate(
    { territory_id },
    { $set: { territory_id, residents, updated_at: new Date().toISOString() } },
    { upsert: true, returnDocument: 'after' }
  );
  res.json(result);
});
```

**`server/routes/downtime.js`** (around `confirm-feeding`):

```js
const { territory_id, rights } = req.body;
// ...
const oid = parseId(territory_id);  // assume parseId helper exists or adapt
if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid territory_id format' });
const terrDoc = await terrCollection().findOne({ _id: oid });
// rest of the logic continues with terrDoc — array entries still keyed by territory_id (the OID-string), shape preserved
```

### Test fixture updates

Pattern across all three test files:

- Old:
  ```js
  const doc = { id: 'rfr_test_territory', name: '...', regent_id, ... };
  await col().insertOne(doc);
  await request(app).put(`/api/territories/${doc.id}/feeding-rights`).send({ feeding_rights });
  ```
- New:
  ```js
  const doc = { name: '...', regent_id, ... };
  const insert = await col().insertOne(doc);
  const oidStr = String(insert.insertedId);
  await request(app).put(`/api/territories/${oidStr}/feeding-rights`).send({ feeding_rights });
  ```

The `seedTerritory` helper at `api-territories-regent-write.test.js:49` should be updated to return the `_id`-as-string and not require an `id` argument. Tests downstream of it pass that string into route paths.

### Server smoke before broadcast

Bring up `cd server && npm run dev` against a local Mongo (or a test DB). Run:

1. POST a new territory without `_id` — assert response includes generated `_id`.
2. POST again with `_id` set to that string and a name change — assert update.
3. POST with `_id` set to a non-existent OID — assert 404.
4. PATCH `/api/territories/<that-oid>/feeding-rights` — assert update.
5. PATCH `/api/territories/secondcity/feeding-rights` — assert 400 (slug rejected).
6. GET `/api/territory-residency?territory_id=<oid>` — assert empty residents (no doc yet).
7. PUT `/api/territory-residency { territory_id: '<oid>', residents: ['<charId>'] }` — assert upsert.
8. POST `/api/downtime_cycles/<cycleId>/confirm-feeding { territory_id: '<oid>', rights: [...] }` against a test cycle — assert 200 and the cycle's `regent_confirmations` array contains the entry with `territory_id: '<oid>'`.

Capture the smoke output verbatim into the Dev Agent Record on the story.

---

## Test Plan

1. **Run the existing test suites locally** — they should fail before fixture updates, pass after. Capture before/after counts.
2. **Server smoke** (8 steps above).
3. **Static review (Ma'at)** — diff scope (no client touched, no data migration, schema rename clean, route rename consistent across files). Verify the strict-cutover decision is honoured: nowhere does the slug accept a query path.
4. **Independent test pass (Ma'at)** — run the test suites from her terminal; confirm green.

---

## Definition of Done

- [x] All ACs above pass in tests + smoke *(56/56 tests in the 4 affected suites; each story smoke step covered)*
- [x] `git diff` is contained to: `server/schemas/territory.schema.js`, `server/routes/territories.js`, `server/routes/territory-residency.js`, `server/routes/downtime.js`, four test files
- [x] No client file (`public/`) is modified
- [x] No new migration script in this story (#3c is the next story)
- [x] All four affected test suites green *(56/56)*
- [x] Smoke output captured in Dev Agent Record
- [x] Strict cutover honoured — no slug-acceptance code paths remain
- [ ] PR opened by `tm-gh-pr-for-branch` into `dev`, body cross-references parent issue #3 and ADR-002 *(SM step after QA)*

---

## Note for Ptah

The implementation is bounded but has a lot of small surface area (4 routes + 2 schemas + 4 test files). Take it in small bites:

1. Update the schemas first — it's a self-contained file.
2. Update each route in turn — they're independent.
3. Update the test fixtures last — once routes are stable, fix the seed pattern across all four test files in one pass.
4. Smoke last.

**Resist scope creep.** The dead client block in `downtime-form.js:73, 1311-1317` is tempting to clean up while you're in there but is **out of scope** per the user's Q5 decision. If you find anything else that wants attention, file it as a follow-up note in the Dev Agent Record, don't fix it.

**Strict cutover discipline.** The point of this story landing first is that #3c (data migration) and #3d (client refactor) follow within the same deploy window. Don't add transitional dual-acceptance code to "soften the landing" — that contradicts the user's Q2 call.

## Note for Ma'at

Your QA value here is two-pronged:

1. **Static review of the diff** — confirm strict cutover, confirm no client touched, confirm no migration script added. The risk is scope creep; that's what you're guarding against.
2. **Independent test run** — pull the branch and run `cd server && npm test` (or equivalent). If green, append your QA Results commit and we ship. If red, surface the failures.

Append QA Results as a NEW commit on the branch BEFORE PR (per the established workflow rule).

---

## Dev Agent Record

**Agent Model Used:** claude-opus-4-7 (James / DEV / Ptah)

**Files Changed (7):**
- `server/schemas/territory.schema.js` — `id` renamed to `slug` (non-required label), `required` dropped from territorySchema, `territoryResidencySchema.territory` renamed to `territory_id`
- `server/routes/territories.js` — POST creates new (no `_id`) or updates existing (with `_id`); PATCH `/:id/feeding-rights` drops the `$or` slug fallback at line 78; lock check resolves territory's slug via `territory.slug || territory.id` (legacy back-compat read)
- `server/routes/territory-residency.js` — GET `?territory_id=<oid>` and PUT body shape both switch from `territory` (name) to `territory_id`
- `server/routes/downtime.js` — `confirm-feeding` uses `findOne({ _id: parseId(territory_id) })`; gate recompute compares against `String(t._id)`; slug `territory_id` returns 400
- `server/tests/api-territories.test.js` — POST tests rewritten for new no-upsert-by-slug contract; new tests for unknown `_id` (404) and malformed `_id` (400)
- `server/tests/api-territories-regent-write.test.js` — `seedTerritory` now uses `slug` field, returns `_idStr`; all URL paths use `${terr._idStr}`; new test for slug rejection at PATCH endpoint (400)
- `server/tests/api-downtime-regent-gate.test.js` — `insertTerritory` returns `_idStr`; all body `territory_id` values use ObjectId-strings; new test for slug rejection at confirm-feeding (400)
- `server/tests/api-players-sessions-residency.test.js` — residency tests use `territory_id` (synthetic `test_terr_<oid>` strings) instead of name; cleanup matcher updated

**Test results:**
- All four affected suites: **56/56 passed** (single-suite run before broadcast)
- Full server test suite: **638 passed / 2 failed (47 files)** — both failures are **pre-existing** on `dev` baseline, unrelated to this story:
  - `tests/rule_engine_grep.test.js` — ADR-001 effective-rating grep contract violation in `auto-bonus-evaluator.js:84` and `pool-evaluator.js:75` (last touched in 1b878ca, not by me)
  - `tests/api-relationships-player-create.test.js` — NPC directory projection (unrelated)
  - Verified: `git diff HEAD -- public/js/editor/rule_engine/ server/routes/npcs.js` is empty.

**Smoke (story Test Plan §2, all 8 steps):** covered by the test framework via supertest against the test DB. Each step maps to one or more passing tests:

| Smoke step | Test case |
|---|---|
| 1. POST without `_id` → generated `_id` | `POST /api/territories > ST can create a territory (no _id → insert with generated _id)` ✓ |
| 2. POST with `_id` → update | `POST /api/territories > ST can update an existing territory by _id` ✓ |
| 3. POST with non-existent OID → 404 | `POST /api/territories > POST with unknown _id returns 404 (no upsert by _id)` ✓ |
| 4. PATCH feeding-rights by oid | `PATCH ... — ST > ST can update feeding_rights` ✓ |
| 5. PATCH with slug → 400 | `PATCH ... — blocked > 400 for slug-style territory ID (strict cutover)` ✓ |
| 6. GET `/api/territory-residency?territory_id=<oid>` | `GET /api/territory-residency > returns single territory by query` ✓ |
| 7. PUT `/api/territory-residency { territory_id, residents }` | `PUT /api/territory-residency > upserts residency for a territory` ✓ |
| 8. POST `confirm-feeding { territory_id: <oid> }` → 200, regent_confirmations entry | `POST /api/downtime_cycles/:id/confirm-feeding > Regent can confirm their territory rights` ✓ |

Two extra cases beyond the listed smoke: confirm-feeding with slug `territory_id` returns 400 (strict cutover); residency PUT with empty `territory_id` returns 400 (schema validation).

**Test count: 56 in the 4 target suites (was 51 in same suites pre-change). Net +5 (4 new strict-cutover assertions + 1 split of "unknown territory" into 400/404).**

**Completion Notes:**
- Strict cutover honoured everywhere. No transitional dual-acceptance, no slug-fallback in any route. Slug paths return 400 with `VALIDATION_ERROR`.
- The lock check in PATCH `/:id/feeding-rights` resolves territory slug via `territory.slug || territory.id`. The fallback to `territory.id` is **deliberate** because production data still has the legacy `id` field (rename on disk happens in #3c). Once #3c lands and renames the field, the `|| territory.id` clause becomes dead code and can be removed in #3e or #3c.
- ADR-002 Q5 user decision honoured: `territory_residency` schema and routes updated; collection itself untouched. Dead client block at `public/js/tabs/downtime-form.js:73, 1311-1317` deliberately not addressed (out of scope; will be a separate cleanup story).
- No `TERRITORY_SLUG_MAP` reference altered. The lock-check still calls `normaliseTerritorySlug(slug)` to translate submission keys; that pattern is intentionally preserved per ADR-002 Q4.
- The downtime gate recompute (`allConfirmed` calc at `downtime.js:108`) flipped from `confirmedTerritoryIds.has(t.id)` to `.has(String(t._id))`. This is the only client-facing-data-shape change in #3b; existing closed cycles have empty `regent_confirmations` per ADR audit, so no live data depends on the old shape.

**Resisted scope creep:**
- Did NOT clean up the dead client block in `downtime-form.js` (out of scope per Q5).
- Did NOT touch `server/utils/territory-slugs.js` (out of scope per Q4 / #3e).
- Did NOT add a transitional dual-acceptance shim (out of scope per Q2).
- Did NOT modify any client file in `public/`.
- Did NOT write a data migration script (that's #3c).

**Change Log:**
- 2026-05-05 — Implemented per Story #3b on `issue-3b-server-schema-routes`. Single commit (server code + test fixtures + this Dev Agent Record together).
