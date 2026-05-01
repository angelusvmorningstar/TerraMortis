---
title: 'Rule-engine schemas and CRUD API for eight typed collections'
type: 'feature'
created: '2026-04-28'
status: 'ready-for-dev'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/design/rules-engine-adversarial-revision.md
---

## Intent

**Problem:** ADR-001 commits to typed-per-family Mongo collections for the rules engine. Before any family migrates (RDE-3 onward), the collections need Ajv schemas at the API boundary and minimal CRUD routes so the editor UI (RDE-4+) has something to call. Without this layer, every migration story would have to rebuild the same scaffolding.

**Approach:** Add JSON Schema files under `server/schemas/rules/` (one per collection), wire them through the existing `validate()` middleware, and create eight Express routers under `/api/rules/<family>` with standard list / get / create / update / delete handlers. ST-only auth at the router level. Schema-level cyclic-reference rejection: a rule whose source merit is also its target is invalid. No business logic beyond shape validation and structural checks; rule evaluation lives in the runtime evaluator added by per-family migration stories.

## Boundaries & Constraints

**Always:**
- Eight collections per ADR catalogue: `rule_grant`, `rule_speciality_grant`, `rule_skill_bonus`, `rule_nine_again`, `rule_disc_attr`, `rule_derived_stat_modifier`, `rule_tier_budget`, `rule_status_floor`.
- Schemas use the same Ajv pattern as `server/schemas/character.schema.js` and `server/schemas/game_session.schema.js`. `additionalProperties: false` at the top level to catch typos.
- All routes mount with `requireAuth` + `requireRole('st')` at `server/index.js` and equivalent in `tests/helpers/test-app.js`.
- Each rule doc carries a `notes` field (string, optional) for the *why* (house-rule context, errata reference). Surfaced in the editor.
- Schema vocabulary: rule docs use `rating`, `effective_rating`, `dots_total`. Never bare `dots` for trait references. Inherent-only is forbidden vocabulary in this layer.
- Trait references use the `{kind, name}` primitive defined in ADR-001 §Trait-reference primitive. `kind` enum: `attribute | skill | merit | discipline | derived_stat`. `name` is the canonical string from `MERITS_DB` / `accessors.js`.
- **Cyclic-reference rejection.** Every schema with both a `source` (merit name) and a `target` (merit name) field includes an Ajv `not` clause forbidding `source === target`. Plus a custom Ajv keyword check for self-grants in `rule_grant`: a rule whose source merit also appears in any of its read-side `trait_ref` predicates AND whose target is the same merit is rejected. Tested per collection.
- Each rule doc carries `created_at` / `updated_at` ISO strings, set by the API on insert/update.

**Ask First:**
- Whether to support batch insert of pre-seeded rules from a fixture file (useful for environment bootstrap). Defer unless RDE-3 explicitly needs it.
- Whether to include a soft-delete `archived: true` flag instead of hard delete. Hard delete chosen for v1; revisit if rule history becomes a feature request.

**Never:**
- No business logic in this story. No rule evaluation, no character-side reads. Just shape validation and CRUD.
- No player-side endpoints. Rules are ST-only.
- No cross-family validation (e.g. "this `rule_grant.source` references a merit that exists"). Validation against external data deferred to per-family migration stories that have the context.
- No versioning or audit trail. Out of scope per ADR.

## I/O & Edge-Case Matrix

| Scenario | Endpoint | Body | Expected |
|---|---|---|---|
| ST creates valid rule_grant | POST /api/rules/grant | `{source: 'PT', tier: 1, grant_type: 'merit', target: 'Contacts', amount: 2}` | 201 with inserted doc |
| ST sends extra field | POST /api/rules/grant | body with `extra: 'oops'` | 400 VALIDATION_ERROR (additionalProperties false) |
| Player calls list | GET /api/rules/grant | (player auth) | 403 |
| Unauthenticated | any | no auth header | 401 |
| ST lists empty collection | GET /api/rules/skill_bonus | — | 200 `[]` |
| ST updates non-existent | PUT /api/rules/grant/:bogusId | valid body | 404 NOT_FOUND |
| ST deletes existing | DELETE /api/rules/grant/:id | — | 204 |

## Code Map

- `server/schemas/character.schema.js` — pattern to copy for the six new schemas.
- `server/schemas/game_session.schema.js` — another reference; smaller and closer in shape.
- `server/middleware/validate.js` — existing Ajv glue. Reused, no changes.
- `server/middleware/auth.js` — `requireAuth`, `requireRole`. Reused.
- `server/routes/game-sessions.js` — closest existing router pattern (CRUD + ST gating). Copy structure.
- `server/index.js` — app-level mount point. Add six lines.
- `server/tests/helpers/test-app.js` — mirrors prod mounts. Add six matching lines.
- `server/db.js` — `getCollection(name)` already supports any string; no changes.

## Tasks & Acceptance

**Execution:**
- [ ] `server/schemas/rules/rule-grant.schema.js` (new) — Ajv JSON Schema for `rule_grant`. Fields: `source` (string, merit/oath name), `tier` (integer 1-5, optional for unconditional grants), `condition` (enum: `'always'`, `'tier'`, `'choice'`, `'pact_present'`, optional structured choice ref), `grant_type` (enum: `'merit'`, `'pool'`), `target` (string, target merit name), `target_qualifier` (string, optional), `amount` (integer ≥ 0), `amount_basis` (enum: `'flat'`, `'rating_of_source'`, `'rating_of_partner_merit'`), `read_refs` (array of `{kind, name, predicate, value}`, optional, declares which traits the rule reads — used for cyclic-reference detection), `notes` (string, optional), `created_at` / `updated_at`. Cyclic-reference Ajv keyword: reject if `target === source` OR if any `read_refs[].name === source AND target === source`.
- [ ] `server/schemas/rules/rule-speciality-grant.schema.js` (new) — Ajv schema for free skill speciality grants (split from rule_grant per ADR revision). Fields: `source` (string), `tier` (integer 1-5, optional), `condition` enum, `target_skill` (string), `spec` (string, the speciality name), `notes`, timestamps. No `target` merit field (specialities are not merits).
- [ ] `server/schemas/rules/rule-skill-bonus.schema.js` (new) — Ajv schema. Fields: `source` (string), `tier` (integer), `target_skill` (string, dynamic via choice), `amount` (integer 1-2), `cap_at` (integer, default 5), `notes`, timestamps.
- [ ] `server/schemas/rules/rule-nine-again.schema.js` (new) — Ajv schema. Fields: `source`, `tier` (optional), `target_skills` (array of strings OR `'asset_skills'` sentinel referencing the source merit's `asset_skills` field), `notes`, timestamps.
- [ ] `server/schemas/rules/rule-disc-attr.schema.js` (new) — Ajv schema. Fields: `discipline` (string), `target_kind` (enum: `'attribute'`, `'derived_stat'`), `target_name` (string, e.g. `'Strength'`, `'Speed'`, `'Defence'`), `amount_basis` (enum: `'rating'`, `'flat'`), `flat_amount` (integer, optional), `notes`, timestamps.
- [ ] `server/schemas/rules/rule-derived-stat-modifier.schema.js` (new) — Ajv schema. Fields: `source` (string, merit name), `target_stat` (enum: `'size'`, `'speed'`, `'defence'`, `'health'`, `'willpower_max'`), `mode` (enum: `'flat'`, `'rating'`, `'skill_swap'`), `flat_amount` (integer, optional), `swap_from` / `swap_to` (string, optional, for skill_swap), `notes`, timestamps.
- [ ] `server/schemas/rules/rule-tier-budget.schema.js` (new) — Ajv schema. Fields: `source` (string, e.g. `'MCI'`), `budgets` (array of integers, indexed by tier where index 0 = unused, `length >= max-rating-of-source` per ADR §Tier budget bounds), `notes`, timestamps. API rejects budgets shorter than the source's max rating in `MERITS_DB`.
- [ ] `server/schemas/rules/rule-status-floor.schema.js` (new) — Ajv schema for pact-imposed status minimums (split from rule_derived_stat_modifier per ADR revision). Fields: `source` (string), `target_status_kind` (enum: `'covenant'`, `'city'`, `'clan'`), `target_status_name` (string, e.g. `'Carthian Movement'`), `floor_value` (integer ≥ 0), `notes`, timestamps.
- [ ] `server/routes/rules-engine.js` (new) — exports eight routers, one per collection. Each: list / get / create / update / delete. Uses `validate()` middleware on POST/PUT.
- [ ] `server/index.js` — mount the eight routers under `/api/rules/grant`, `/api/rules/speciality_grant`, `/api/rules/skill_bonus`, `/api/rules/nine_again`, `/api/rules/disc_attr`, `/api/rules/derived_stat_modifier`, `/api/rules/tier_budget`, `/api/rules/status_floor`. All gated `requireAuth` + `requireRole('st')`.
- [ ] `server/tests/helpers/test-app.js` — mirror the eight mounts.
- [ ] `server/tests/api-rules-engine.test.js` (new) — eight describe blocks, one per collection. Cover: ST creates valid doc, ST sends extra field 400s, player blocked, list empty, update missing 404, delete works. Plus dedicated cases: `rule_grant` with self-target rejected, `rule_grant` with cyclic `read_refs` + self-target rejected, `rule_tier_budget` with budgets-too-short rejected. Lean on the I/O Matrix.

**Acceptance Criteria:**
- Given a fresh `tm_suite_test` DB, when an ST POSTs a valid `rule_grant` doc, then the API returns 201 with the inserted doc and `_id`.
- Given a doc with an unknown top-level field, when POSTed, then the API returns 400 VALIDATION_ERROR.
- Given a player auth header, when any rules-engine route is called, then the API returns 403.
- Given the test suite, when `cd server && npx vitest run api-rules-engine`, then all assertions pass.

## Verification

**Commands:**
- `cd server && npx vitest run api-rules-engine` — expected: all assertions pass.
- `cd server && npx vitest run` — expected: full suite remains green (the one pre-existing NPC directory failure is unrelated).

**Manual checks:**
- `curl -X POST http://localhost:3000/api/rules/grant -H 'X-Test-User: ...' -d '{...}'` after `node server/index.js` — verify a doc inserts and a malformed one rejects.
