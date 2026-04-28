---
id: npcr.5
epic: npcr
status: deferred
priority: low
depends_on: [npcr.2, npcr.3, npcr.4]
---

> **Deferred 2026-04-24 after pre-migration audit** (see Revision History r3). Re-open once the NPC register is populated enough that a bulk migration beats the NPCR.4 interactive picker. Trigger for revisit: more than ~10 NPCs in the register or player-created stubs appearing via NPCR.8.

# Story NPCR-5: Data migration — three legacy shapes to relationships

As the ST team,
I want a one-time migration script that back-fills the relationships graph from legacy NPC data and links each character's existing touchstone entries to real NPC records,
So that NPC lineage is captured in edges and character touchstones become first-class records without players losing their accumulated touchstone history.

---

## Context

Three legacy shapes still need migrating (one fewer than the original draft — NPCR.4 reshaped touchstones so that `character.touchstones[]` is no longer a "legacy shape" to be replaced, it is the authoritative store; the migration now augments it in place):

1. **`npcs.linked_character_ids`** (no `is_correspondent`) → new relationship edge per linked PC, kind='linked' fallback.
2. **`npcs.is_correspondent: true`** (+ `linked_character_ids`) → new relationship edge per PC, kind='correspondent' (overrides the fallback).
3. **`character.npcs[]`** stubs (per-character NPC register) → an `npcs` document when no match exists, plus a relationship edge whose kind is mapped from the stub's `relationship_type`.

The touchstone-specific migration concern changes shape: `character.touchstones[]` is unchanged by NPCR.4 except that each item may now carry an optional `edge_id`. This migration's touchstone step therefore **augments existing touchstones entries** — it adds `edge_id` to entries that match an NPC, creating the NPC and edge if needed — rather than moving data into a separate parallel array.

Fuzzy name matching (case- and whitespace-insensitive; strip common honorifics; Levenshtein distance < 3) prevents duplicates across shapes 2, 3, and the touchstone augmentation step.

Legacy `npcs.linked_character_ids` and `npcs.is_correspondent` fields remain on the documents after migration; schema deprecation is a separate follow-up story.

---

## Acceptance Criteria

### Script shape

**Given** `server/scripts/migrate-to-relationships.js` exists **Then** it is runnable from `server/` with a `--dry-run` flag and honours the `MONGODB_DB` env var (defaults to `tm_suite`).

**Given** `--dry-run` **Then** the script performs all read/match/plan steps and produces a report with zero writes to `characters`, `npcs`, or `relationships`.

**Given** the script is run twice against the same data **Then** the second run skips characters already flagged `_migrated_to_relationships: true`. Results are byte-identical except for the report timestamp.

**Given** the script runs to completion **Then** `specs/migration-reports/npcr-migration-{timestamp}.md` is produced with counts: `characters_processed`, `npcs_created`, `edges_created`, `touchstones_linked`, `touchstones_out_of_range`, `unmatched_kinds`, `warnings[]`, `errors[]`.

### Shape 1 — NPC → PC links (fallback)

**Given** an `npcs` doc has `linked_character_ids` and does **not** have `is_correspondent: true` **Then** for each PC id in the array, create one `relationships` doc with `a={type:'pc', id:pc}`, `b={type:'npc', id:npc}`, `kind='linked'`, `direction='a_to_b'`, `status='active'`, `created_by={type:'st', id:'migration'}`, and an initial history row `{change: 'created_by_migration'}`.

### Shape 2 — Correspondents

**Given** an `npcs` doc has `is_correspondent: true` AND `linked_character_ids` **Then** each PC produces a `kind='correspondent'` edge (same endpoint shape as Shape 1). The correspondent kind takes precedence over the fallback — if both would apply, only the correspondent edge is created.

### Shape 3 — character.npcs[] stubs

**Given** a character has `character.npcs[]` entries **Then** for each stub:
- Fuzzy-match the stub name against `npcs.name` (post-Shape-1-2, so any NPC whose record already exists is reused). Unmatched entries create a new `npcs` doc with `status='active'`, `created_by={type:'st', id:'migration'}`, `description=''`, `linked_character_ids=[thisChar]`.
- Create one `relationships` edge with `a={type:'pc', id:thisChar}`, `b={type:'npc', id:matchedOrNewNpc}`.
- Kind is resolved via `server/scripts/relationship-type-to-kind-map.js` (a static map from stub `relationship_type` strings to KIND_ENUM codes). Unmapped values become `kind='other'` with `custom_label` = the original `relationship_type`.
- `touchstone_eligible: true` on the stub is IGNORED by Shape 3 — touchstone linkage lives in Shape 4 (below), which reads `character.touchstones[]` not `character.npcs[]`.
- The stub's `interaction_history[]` becomes the edge's `history[]` prepended with the `created_by_migration` row.

### Shape 4 — touchstone augmentation (updated for post-NPCR.4 model)

**Given** a character has `character.touchstones[]` entries **Then** for each entry **without** an existing `edge_id`:
- Fuzzy-match `entry.name` against `npcs.name` (including NPCs just created in Shapes 1/2/3).
- If matched: create a `kind='touchstone'` edge with `a={type:'pc', id:thisChar}`, `b={type:'npc', id:matchedNpc}`, `touchstone_meta.humanity=entry.humanity`, `state=entry.desc`. Set `entry.edge_id` to the new edge's `_id`. The inline `name` and `desc` stay on the entry.
- If no match: **do nothing**. The entry remains an object touchstone (no `edge_id`). Flag it in the report so the ST can review whether it should have been an NPC.

**Given** a character has more than 6 entries in `character.touchstones[]` **Then** the script emits an error (not warning) and skips that character entirely. Touchstones cap is 6 per NPCR.4; exceeding it means data is malformed and needs hand-cleanup before migration can proceed.

**Given** a `character.touchstones[]` entry has a `humanity` value outside the character's valid anchor range (`anchorFor(c) - 5` to `anchorFor(c)` — where anchor is 7 for Ventrue else 6) **Then** the entry is left as-is, counted under `touchstones_out_of_range` in the report, and flagged with the character name + touchstone name + rating. Migration proceeds for other entries on the same character. The ST cleans up out-of-range ratings manually post-migration.

**Given** a `character.touchstones[]` entry already has `edge_id` set (post-NPCR.4 touchstones authored via the picker) **Then** it is left untouched.

### Completion & idempotency

**Given** migration completes for a character **Then** `_migrated_to_relationships: true` is set on the character document. Legacy `npcs.linked_character_ids` and `npcs.is_correspondent` fields remain on `npcs` documents — they are deprecated in a follow-up story, not here.

**Given** a follow-up story (NOT this one) will remove the legacy NPC fields and `character.npcs[]` from the schema **Then** this story does not modify or remove any schema fields.

**Given** fixtures in `tm_suite_test` cover all three legacy shapes (linked-only, correspondent, character-npcs-stub) **and** two touchstone variants (match, no-match) **Then** the integration test passes with zero data loss and exactly the expected counts.

---

## Implementation Notes

- The script is run manually per project convention — imports/migrations are Angelus's responsibility.
- Test in `tm_suite_test` before touching `tm_suite`.
- Fuzzy match pipeline: `.trim().toLowerCase()` → strip honorifics (`Lord|Lady|Doctor|Sister|Father|Mother` prefix) → Levenshtein `< 3` counts as a match. Ties (multiple candidate NPCs within distance 3) are resolved by the shortest distance; further ties flag a warning and skip the link (user resolves manually).
- `relationship_type` → `kind` map lives in `server/scripts/relationship-type-to-kind-map.js`. Keep it small — map only the shapes actually present in live data. Unmapped strings fall through to `kind='other'` + `custom_label`.
- All edges written by this script use `created_by={type:'st', id:'migration'}` so admin queries can filter migrated-vs-authored when needed.
- The report goes to `specs/migration-reports/` (create directory with `.gitkeep`). Do not commit the actual report; tree ignores `*.md` beneath that path except `.gitkeep` and a `README.md`.
- The per-touchstone anchor-range check uses `anchorFor(c) = c.clan === 'Ventrue' ? 7 : 6` — same helper as the route and sheet.

---

## Files Expected to Change

- `server/scripts/migrate-to-relationships.js` (new)
- `server/scripts/relationship-type-to-kind-map.js` (new)
- `specs/migration-reports/.gitkeep` (new directory; add `specs/migration-reports/README.md` describing the format)
- `server/tests/migration-to-relationships.test.js` (new; uses `tm_suite_test` fixtures)
- `.gitignore` — ignore `specs/migration-reports/npcr-migration-*.md` so reports stay local

---

## Definition of Done

- Script is idempotent (run twice → no duplicates on any collection, no duplicate history rows)
- Dry-run mode produces the report without any writes
- All three legacy shapes covered by integration tests with `tm_suite_test` fixtures
- Touchstone augmentation: two test cases (name matches existing NPC → `edge_id` populated; no match → entry left as object, flagged in report)
- Out-of-range humanity reported, not rejected
- Over-cap (7+) touchstones error, character skipped
- Quinn runs the script against `tm_suite_test` and spot-checks five characters' migrations
- `bmad-code-review` MANDATORY — migration touches production data shape even though it is additive

---

## Revision History

- **2026-04-24 r1**: initial draft from the epic — four legacy shapes including `character.touchstones[]` → move-to-new-array.
- **2026-04-24 r2**: rewritten after NPCR.4 r2 landed. Touchstones stay authoritative on `character.touchstones[]`; this migration now *augments* touchstone entries with `edge_id` where an NPC match exists, rather than relocating them. Added cap-guard (6) and out-of-range humanity reporting to match the NPCR.4 validator. Shape count dropped from four to three.
- **2026-04-24 r3 (deferred)**: pre-migration audit run via `server/scripts/audit-npcr5-preconditions.js`. Findings:
  - `character.npcs[]` stubs: **0 characters** use the field. Shape 3 has nothing to migrate.
  - `npcs.is_correspondent = true`: **0 NPCs**. Shape 2 has nothing to migrate.
  - `npcs.linked_character_ids`: **1 NPC** with any links. Shape 1 would create 1 edge.
  - `character.touchstones[]`: 27 characters, 36 entries, all **object-mode** (zero `edge_id`), all within anchor range, none over cap. But the npcs collection only holds **1 NPC** — the fuzzy-match step would flag ~35 touchstones as "no NPC match, stays as object, review manually".
  - 0 orphan touchstone edges from the smoke test.
  The infrastructure would ship clean but produce a near-empty report. Meanwhile the NPCR.4 picker already lets STs link touchstones to NPCs one at a time as narrative demands. Conclusion: bulk migration is low-leverage at current data volumes. Deferred until the NPC register grows (trigger ~10+ NPCs or player-created stubs from NPCR.8). The audit script stays committed so re-running it is the first step when we revisit.
