# Story feature.654: EQ-1 — Equipment Schema, Catalogue Module, and CRUD API

## Status: review

---
issue: 654
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/654
branch: ms/issue-654-equipment-schema-crud-api
---

## Story

**As a** Storyteller,
**I want** character equipment and assets stored in a validated schema with a full CRUD API backed by a static catalogue module,
**so that** downstream stories (EQ-2 sheet display, EQ-3 roll calculator, EQ-4 DT form wiring) have a stable, correct data foundation to build on.

## Background

Design roundtable (2026-06-09) established a four-bucket taxonomy for all character possessions:

| Bucket | Contents | Mechanical model |
|---|---|---|
| `weapon` | Knives, firearms, improvised | Damage rating — separate roll calc story |
| `armour` | Vests, coats, protective gear | Damage reduction — display-only this story |
| `equipment` | Tools, tech, social gear (38 core book items) | Dice bonus activatable per roll (EQ-3) |
| `asset` | Havens, vehicles, significant property | Annotation-first, mechanical_effect hook for future |

Equipment availability links directly to the downtime acquisition form (EQ-4). The catalogue must be accessible to the DT form without a network call — it is a static JS module, same pattern as `MERITS_DB`.

## Acceptance Criteria

1. `public/js/data/equipment-data.js` exists and exports a named constant `EQUIPMENT_CATALOGUE` — an array of catalogue entry objects with at least one representative entry per bucket (`weapon`, `armour`, `equipment`, `asset`). All item `id` values are stable lower-kebab-case slugs, treated as immutable from this commit onward.

2. Every catalogue entry has: `id` (string), `bucket` (enum), `name` (string), `description` (string), `availability` (integer 0–5), `tags` (string array, may be empty). Bucket-specific fields are present on relevant entries and `null` on others (not absent — explicit `null`).

3. Armour catalogue entries include `armour_value` (integer) and `defence_penalty` (integer). These are stored for display only — `defence_penalty` is never read by `calcDefence()`.

4. Equipment catalogue entries include `skill_domain` (string — canonical skill key e.g. `"Larceny"`) and `bonus_dice` (integer 0–5).

5. Weapon catalogue entries include `damage_mod` (integer), `damage_type` (enum: `"bashing"|"lethal"|"aggravated"`), and `weapon_type` (enum: `"melee"|"ranged"|"thrown"`).

6. `character.schema.js` is extended with an `equipment` array field. Each element validates: `catalogue_id` (string, required), `state` (enum: `"carried"|"worn"|"stashed"|"lost"|"active"`, required), `acquired_cycle` (integer ≥ 0, required — use `0` for chargen/pre-campaign items), `notes` (string or null). Schema rejects documents that fail these constraints.

7. `character.schema.js` is extended with an `assets` array field. Each element validates: `name` (string, required), `description` (string, required), `location` (string or null), `mechanical_effect` (string or null — free text, reserved for future rule integration), `acquired_cycle` (integer ≥ 0, required), `notes` (string or null).

8. `GET /api/equipment/catalogue` returns the full `EQUIPMENT_CATALOGUE` array as JSON with HTTP 200. **No auth required** — the DT form and player app both need access.

9. `GET /api/characters/:id/equipment` returns `{ equipment: [...], assets: [...] }` for the given character. Returns 404 if the character does not exist. Requires ST auth.

10. `POST /api/characters/:id/equipment` accepts a single equipment item object, validates it against the equipment item schema, appends it to the character's `equipment` array, and returns the updated `{ equipment, assets }`. Returns 400 with a descriptive error on validation failure. Requires ST auth.

11. `DELETE /api/characters/:id/equipment/:itemIndex` removes the equipment item at the given zero-based array index. Returns the updated `{ equipment, assets }`. Returns 404 if the index is out of range. Requires ST auth.

12. `POST /api/characters/:id/assets` accepts a single asset object, validates it, appends it to `assets`, and returns the updated `{ equipment, assets }`. Returns 400 on validation failure. Requires ST auth.

13. `DELETE /api/characters/:id/assets/:itemIndex` removes the asset at the given zero-based index. Returns the updated `{ equipment, assets }`. Returns 404 if out of range. Requires ST auth.

14. A `GET /api/characters/:id` response for a character that has equipment returns the `equipment` and `assets` arrays (they must not be stripped by any field projection in the existing character route).

15. Characters with no `equipment` or `assets` field in MongoDB return `{ equipment: [], assets: [] }` from all read endpoints. No migration script required — the routes handle the absent-field case.

16. Vitest tests in `server/tests/equipment.test.js` cover: GET catalogue (200, array), GET character equipment (200, empty default), POST equipment item valid (item present in response), POST equipment item invalid state enum (400), POST equipment item missing `catalogue_id` (400), DELETE equipment item (item removed), POST asset valid (present), DELETE asset (removed), GET on missing character (404).

## Tasks / Subtasks

- [x] Task 1: Create `public/js/data/equipment-data.js`
  - [x] Export `EQUIPMENT_CATALOGUE` as a named const (ES module)
  - [x] Include the 38 core book items (Mental/Physical/Social from `Equipment from Core Book.docx`) as `bucket: "equipment"` entries — each with `id`, `name`, `skill_domain`, `bonus_dice`, `availability`, `description`
  - [x] Add representative weapon entries (at minimum: knife, firearm) with `damage_mod`, `damage_type`, `weapon_type`
  - [x] Add representative armour entries (at minimum: light armour, heavy armour) with `armour_value`, `defence_penalty`
  - [x] Add representative asset entries (at minimum: haven, vehicle) — annotation shape, no mechanical fields required yet
  - [x] Bucket-specific absent fields are set to `null` explicitly (not omitted)
  - [x] All `id` values are lower-kebab-case and unique across the full catalogue

- [x] Task 2: Extend `server/schemas/character.schema.js`
  - [x] Add `equipment` array property with inline item sub-schema (or `$defs` ref — match whichever pattern existing sub-schemas use in this file)
  - [x] Add `assets` array property with inline item sub-schema
  - [x] Both default to `[]`
  - [x] Confirm `additionalProperties: false` on sub-schemas does not conflict with MongoDB auto-generated `_id` — check against existing sub-document patterns in this file

- [x] Task 3: Create `server/routes/equipment.js`
  - [x] `GET /api/equipment/catalogue` — imports `EQUIPMENT_CATALOGUE` from the public module and returns it. No auth middleware.
  - [x] Register in `server/index.js` as `app.use('/api/equipment', equipmentRouter)` — before any auth middleware that would intercept unauthenticated requests

- [x] Task 4: Add character-scoped equipment routes
  - [x] Add to `server/routes/characters.js` (or a sub-router) — check existing route patterns before creating a new file
  - [x] `GET /:id/equipment`
  - [x] `POST /:id/equipment`
  - [x] `DELETE /:id/equipment/:itemIndex`
  - [x] `POST /:id/assets`
  - [x] `DELETE /:id/assets/:itemIndex`
  - [x] All five routes require ST auth via the existing `requireRole` middleware
  - [x] Comment on DELETE routes: "Client must refresh after delete to avoid stale indices"

- [x] Task 5: Register routes in `server/index.js`
  - [x] Confirm mount order does not break existing character route handling

- [x] Task 6: Write Vitest tests in `server/tests/equipment.test.js`
  - [x] Cover all conditions listed in AC-16
  - [x] Use `tm_suite_test` DB (enforced by vitest setupFile — do not override)
  - [x] Follow test patterns from `server/tests/api-ranking-ballots.test.js` (most recent test file)

- [x] Task 7: Update `schemas/schema_v2_proposal.md`
  - [x] Document `equipment[]` and `assets[]` field shapes under the character schema section

## Dev Notes

### Catalogue module — shared client/server

`public/js/data/equipment-data.js` lives in the browser-served public tree so EQ-2 and EQ-3 can import it directly in the browser. The server-side `equipment.js` route also imports it. Verify the relative path `../../public/js/data/equipment-data.js` resolves correctly from `server/routes/equipment.js`. If the path is awkward, a thin re-export at `server/data/equipment-catalogue.js` is acceptable provided both point to the same source array — no duplication.

### Schema extension pattern

Follow `ranking_ballot.schema.js` and how it integrates with the character schema. The `equipment` and `assets` sub-schemas use `additionalProperties: false` — any field not listed in `properties` causes a save failure with "additional properties" error. Check existing embedded sub-documents in `character.schema.js` to confirm `_id` auto-generation behaviour with this flag active.

### `defence_penalty` — display only

Armour catalogue entries carry `defence_penalty` (e.g. `-1`). This value is stored so EQ-2 can render it as `3(2)` format alongside the character's base Defence. It is **never** read by `calcDefence()` in this story or any subsequent story without a separate architectural decision (ADR required). Do not add any call path from `calcDefence()` to the equipment array.

### State enum semantics per bucket

The `state` field uses a shared enum across all buckets. Per-bucket semantics:
- `weapon` → `"carried"` or `"stashed"` or `"lost"`
- `armour` → `"worn"` or `"stashed"` or `"lost"`
- `equipment` → `"carried"` or `"stashed"` or `"lost"`
- `asset` → `"active"` or `"lost"`

AJV validates against the full union enum. Bucket-appropriate state enforcement is a UI concern (EQ-2), not a schema concern.

### `acquired_cycle` encoding

Use the game cycle number as an integer (1, 2, 3, 4…), not an ObjectId. Use `0` for items acquired at character creation or before campaign start. The game cycle numbers are stored in `downtime_cycles.game_number` and are the canonical reference.

### Route registration order

`GET /api/equipment/catalogue` must be reachable without auth. Mount the equipment router before any middleware that would reject unauthenticated requests. Verify against the existing middleware order in `server/index.js`.

### British English in user-visible strings

All error messages, labels, and comments: Defence, Armour, Carried, Stored. Consistent with the rest of the codebase.

## File List

- `public/js/data/equipment-data.js` — NEW
- `server/routes/equipment.js` — NEW
- `server/tests/equipment.test.js` — NEW
- `server/schemas/character.schema.js` — MODIFY
- `server/index.js` — MODIFY (route registration)
- `schemas/schema_v2_proposal.md` — MODIFY

## Dev Agent Record

### Completion Notes

- EQUIPMENT_CATALOGUE: 70 entries (22 Mental + 13 Physical + 3 Social named items, tiered items as separate entries; 6 representative weapons, 4 armour, 6 assets). Null-template spread pattern used for bucket-specific absent fields.
- Existing `equipment` field in `character.schema.js` (old flat shape: `type`, `damage_rating`, `general_ar`, etc.) replaced with new catalogue-ref schema. `assets` array added. `public/js/data/equipment.js` helper functions (weaponPool, effectiveDefence) are now dead code pending EQ-2/EQ-3; no external consumers existed.
- Server route at `server/routes/equipment.js` imports `EQUIPMENT_CATALOGUE` via relative path `../../public/js/data/equipment-data.js` (path resolves correctly under Node ESM).
- Equipment router mounted before `requireAuth` in both `server/index.js` and `server/tests/helpers/test-app.js`.
- 21 Vitest tests: catalogue shape/content, GET/POST/DELETE equipment and assets, 404 on bad character, 400 on invalid fields.

### Change Log

- 2026-06-09: EQ-1 implemented. New files: `public/js/data/equipment-data.js`, `server/routes/equipment.js`, `server/tests/equipment.test.js`. Modified: `server/schemas/character.schema.js`, `server/routes/characters.js`, `server/index.js`, `server/tests/helpers/test-app.js`, `schemas/schema_v2_proposal.md`. 21/21 tests passing.
