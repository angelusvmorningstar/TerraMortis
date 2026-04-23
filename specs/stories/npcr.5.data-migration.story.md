---
id: npcr.5
epic: npcr
status: ready-for-dev
priority: high
depends_on: [npcr.2, npcr.3, npcr.4]
---

# Story NPCR-5: Data migration — four legacy shapes to relationships

As the ST team,
I want a one-time migration script that converts all legacy NPC-shaped data into the new relationships model without data loss,
So that we can deprecate `character.npcs[]` and `character.touchstones[]` cleanly and start the era with the new graph fully seeded.

---

## Context

Four legacy shapes must migrate:
1. `npcs.linked_character_ids` → relationship edges with kind='linked' (fallback)
2. `npcs.is_correspondent: true` → relationship edges with kind='correspondent'
3. `character.npcs[]` stubs → npcs records + relationship edges (kind from stub's relationship_type via map)
4. `character.touchstones[]` → relationship edges with kind='touchstone' + touchstone_meta.humanity

Fuzzy name matching prevents duplicates when the same NPC appears in multiple legacy shapes.

Legacy fields are KEPT in the document after migration for verification; schema deprecation is a separate follow-up story.

---

## Acceptance Criteria

**Given** `server/scripts/migrate-to-relationships.js` exists **Then** it is runnable against any environment and honours the `MONGODB_DB` env var.

**Given** the script is run twice against the same data **Then** the second run skips characters already flagged `_migrated_to_relationships: true`. Result is identical to a single run.

**Given** `--dry-run` flag **Then** the script produces a report with no writes.

**Given** an NPC has `linked_character_ids` with no `is_correspondent: true` **Then** each PC produces a relationship row with kind='linked' (fallback), created_by={type:'st', id:'migration'}, status='active'.

**Given** an NPC has `is_correspondent: true` AND `linked_character_ids` **Then** each PC produces a relationship row with kind='correspondent' (overrides fallback).

**Given** a character has `character.npcs[]` entries **Then** each entry is matched by name (case-insensitive) against `npcs`; unmatched entries create new npcs rows. **And** a relationship edge is created with kind mapped via `relationship-type-to-kind-map.js`; unmapped values become kind='other' with custom_label=original relationship_type. **And** the stub's `interaction_history[]` becomes the edge's `history[]`. **And** if `touchstone_eligible: true`, kind is forced to 'touchstone' (overrides mapping).

**Given** a character has `character.touchstones[]` entries **Then** each is fuzzy-matched (Levenshtein < 3) by name against just-migrated NPCs to avoid duplicates. **And** matched entries augment the existing edge with `touchstone_meta.humanity` and `state = touchstone.desc`. **And** unmatched entries create a new NPC + kind='touchstone' edge. **And** `character.touchstone_edge_ids[]` is populated with the resulting edge _ids.

**Given** migration completes for a character **Then** `_migrated_to_relationships: true` is set. **And** the legacy fields (`npcs[]`, `touchstones[]`) remain in the document.

**Given** the script runs to completion **Then** `specs/migration-reports/npcr-migration-{timestamp}.md` is produced with counts: characters_processed, npcs_created, edges_created, touchstones_migrated, unmatched_kinds, warnings[], errors[].

**Given** fixtures in `tm_suite_test` cover all four legacy shapes **Then** the integration test passes with zero data loss.

**Given** a follow-up story (NOT this one) will remove the legacy fields from the schema **Then** this story does not modify or remove any schema fields. It only populates new collections and sets the migration flag.

---

## Implementation Notes

- User runs the script manually per project convention (imports are Angelus's responsibility)
- Script MUST be tested in `tm_suite_test` before running against `tm_suite`
- Fuzzy name matching: strip case + whitespace + common honorifics (Lord/Lady/Doctor/Sister); Levenshtein distance < 3 counts as match
- `relationship_type` → `kind` mapping table defined in `relationship-type-to-kind-map.js`. Unmapped values become kind='other' with custom_label=original string.
- Migration creates npcs with `created_by={type:'st', id:'migration'}` so they're distinguishable from player-created pending NPCs
- Report file is committed via `specs/migration-reports/` (new directory with `.gitkeep`)

---

## Files Expected to Change

- `server/scripts/migrate-to-relationships.js` (new)
- `server/scripts/relationship-type-to-kind-map.js` (new, data only)
- `specs/migration-reports/.gitkeep` (new directory)
- `server/tests/migration-to-relationships.test.js` (new, runs against tm_suite_test with fixture data)

---

## Definition of Done

- Script is idempotent (run twice → no duplicates)
- Dry-run mode produces report without writes
- All four legacy shapes covered by AC and tested with fixtures
- Verification report generated at completion
- Integration test with tm_suite_test fixtures passes
- Quinn runs the script against `tm_suite_test` and spot-checks 5 characters' migrations
- `bmad-code-review` MANDATORY (destructive-adjacent operation even if additive-only)
