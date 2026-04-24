---
id: ord.5
epic: ord
status: done
priority: high
depends_on: []
supersedes: [ord.6, ord.7, ord.8, ord.9]
---

# Story ORD-5: Direct migration of ordeal submissions + rubrics from tm_deprecated

Note: original scope (JSON extract intermediary) was replaced with a direct
tm_deprecated → tm_suite migration script. The JSON extract chain was obsoleted
by the discovery that `tm_deprecated.characters` is empty — name resolution
instead uses `tm_deprecated.archive_documents` dossier content_html.

ORD-6 (dry-run audit), ORD-7 (player_id linkage), ORD-8 (covenant slug
harmonisation), and ORD-9 (execute import) are absorbed into this single story.
See `server/scripts/migrate-ordeal-submissions-from-deprecated.js`.

Delivered: 50 submissions + 6 rubrics migrated on 2026-04-24 via that script.
All character_ids remapped via dossier-name extraction, covenant slugs
normalised, player_ids populated for player-level ordeals, marking state
preserved. Yusuf's moniker updated to "Mammon" to enable natural resolution
(fixes the earlier archive-import Mammon skip too).

---

# Original scope: Regenerate ordeal submission JSON extracts from tm_deprecated

As the ST team,
I want `data/lore_mastery.json`, `data/rules_mastery.json`, `data/covenant_questionnaire.json`, `data/character_histories.json`, and `data/ordeal_rubrics_seed.json` to match the current shape of `tm_deprecated.ordeal_submissions` and `tm_deprecated.ordeal_rubrics`,
So that `server/scripts/import-ordeal-submissions.js` has the source data it expects and ORD.9 can run.

---

## Context

The existing import script `server/scripts/import-ordeal-submissions.js` reads pre-processed JSON extracts from `data/`, resolves characters by name, and upserts into `tm_suite.ordeal_submissions`. None of the expected JSON files currently exist on disk (verified: `data/` contains `archive/`, `backup/`, `chars_v3.json`, `exports/`, `imports/`, `reference/`, and the .xlsx master, but no ordeal JSON).

The source data lives in `tm_deprecated.ordeal_submissions` (50 docs) and `tm_deprecated.ordeal_rubrics` (the rubric docs with placeholder expected_answers). A new export script reads these collections and produces the JSON shape the import script consumes.

---

## Acceptance Criteria

**Given** a new script `server/scripts/export-ordeal-submissions-for-import.js` **Then** it connects to `tm_deprecated` using the MONGODB_URI env var. **And** supports a `--dry-run` flag that prints the extracts to stdout without writing files.

**Given** the script is run without `--dry-run` **Then** five files are produced in `data/`:

- `data/lore_mastery.json` — 15 submissions, `question_reference` array, each submission has `character_name`, `answers` (keyed object), `submitted_at`.
- `data/rules_mastery.json` — 9 submissions, same shape.
- `data/covenant_questionnaire.json` — 12 submissions keyed per-covenant, `question_references` map keyed by covenant slug.
- `data/character_histories.json` — 14 submissions, each with `character_name`, `history_text`, `submitted_at`.
- `data/ordeal_rubrics_seed.json` — a map with `lore_mastery`, `rules_mastery`, `covenant_questionnaire` arrays matching the seed shape `import-ordeal-submissions.js` expects.

**Given** `tm_deprecated.ordeal_submissions` stores `character_id` as a reference into `tm_deprecated.characters` (stale ObjectId that does not resolve in `tm_suite`) **Then** the export script joins `tm_deprecated.ordeal_submissions` to `tm_deprecated.characters` to resolve the character's display name for each submission. **And** uses `moniker || name` as the `character_name` string written into the extract.

**Given** a submission's character does not resolve in `tm_deprecated.characters` **Then** the row is reported to stdout with the stale ObjectId and the submission is still included in the extract with `character_name: "UNRESOLVED:<objectid>"` so manual reconciliation is possible.

**Given** submissions carry marking state (`marking.status`, `marking.xp_awarded`, `marking.answers`, `marking.overall_feedback`) **Then** that state is preserved in the extract under a `marking` key on each submission. **And** the import script passes it through (confirm import script upsert preserves marking via `$setOnInsert` or extend to `$set` for marking when this flag is present).

**Given** rubric questions in `tm_deprecated.ordeal_rubrics` carry placeholder expected_answers **Then** the seed file preserves the placeholders verbatim; ORD.10 fills them later.

**Given** covenant submissions in `tm_deprecated` may carry display-name covenants (e.g. `"Carthian Movement"`) rather than slug form (`"carthian"`) **Then** the export script normalises to the canonical slug form determined in ORD.8. **And** the same normalisation is used in both `covenant_questionnaire.json` submissions and the rubric seed.

**Given** the script completes **Then** a summary prints: counts per ordeal type, count of unresolved characters, output file paths.

---

## Implementation Notes

- **Shape of the JSON extracts**: confirm by reading `import-ordeal-submissions.js` (already reviewed in the scoping session). The `buildResponses` helper expects `question_reference` with `{ key, text }` per question and `answers` keyed by those keys. So the export must reconstruct the keyed form from the submission's `responses[]` array.
- **Question reference source**: in `tm_deprecated`, each `ordeal_submissions.responses[]` item has `{ question, answer }`. To build the import-ready keyed shape, generate stable keys (e.g. `q1`, `q2`, ... matching the rubric index) and populate `question_reference` from the corresponding rubric document.
- **Covenant slug handling**: depends on ORD.8 being decided. Export script reads ORD.8's canonical slug module.
- **Dry-run output**: write to `data/*.dry.json` or stdout; do not overwrite real extracts.
- **Idempotency**: re-running the script produces identical JSON files for the same source data.
- **No writes to `tm_suite`** during this story. Only reads from `tm_deprecated`, writes to local `data/` files.
- **Test coverage**: a small integration test could seed `tm_deprecated`-shaped fixture data in the test DB and assert the extract shape. Lower priority since the script is one-off.

## Files expected to change

- `server/scripts/export-ordeal-submissions-for-import.js` (new)
- `data/lore_mastery.json` (new, generated)
- `data/rules_mastery.json` (new, generated)
- `data/covenant_questionnaire.json` (new, generated)
- `data/character_histories.json` (new, generated)
- `data/ordeal_rubrics_seed.json` (new, generated)
