---
id: ord.9
epic: ord
status: superseded
priority: high
depends_on: [ord.5, ord.6, ord.7, ord.8]
superseded_by: ord.5
---

**Superseded** by ORD-5's direct-migration approach. Execution happened on
2026-04-24: 50 submissions in `tm_suite.ordeal_submissions` (15 lore, 9 rules,
12 covenant, 14 history), 6 slug-form rubrics in `tm_suite.ordeal_rubrics`,
idempotent upsert by (character_id, ordeal_type[, covenant]) preserving
marking state.

# Story ORD-9: Execute ordeal submissions import to tm_suite

As the ST team,
I want the fifty submissions in `tm_deprecated.ordeal_submissions` and their rubrics to land in `tm_suite`,
So that the live Ordeals tab reads real historical data and STs can continue marking where Google-Form submissions left off.

---

## Context

The previous four stories produced the source extracts (ORD.5), cleaned the name resolution (ORD.6), added player_id linkage (ORD.7), and harmonised covenant slugs (ORD.8). This story runs the actual import and verifies the live database.

The import script already implements the write logic: `$setOnInsert` upsert by `(character_id, ordeal_type)` preserves marking across re-runs, indexes are created, rubric seeding is idempotent.

---

## Acceptance Criteria

**Given** ORD.5-8 are complete **Then** `node server/scripts/import-ordeal-submissions.js` is executed by the user against the live `tm_suite` DB (no `--dry-run`).

**Given** the import completes **Then** `tm_suite.ordeal_submissions` contains exactly 50 documents:
- 15 `lore_mastery`
- 9 `rules_mastery`
- 12 `covenant_questionnaire` (split 4 Carthian, 3 Circle, 3 Lancea, 2 Invictus)
- 14 `character_history`

**Given** marking state at source **Then** any submission with `marking.status='complete'` and `marking.xp_awarded` set in `tm_deprecated` retains that state in `tm_suite`. **And** any `marking.status='in_progress'` (ST was mid-review) is preserved.

**Given** the ORD.7 player_id logic **Then** every migrated player-level ordeal (lore/rules/covenant) has a valid `player_id` OR a logged warning explaining why it is null.

**Given** `tm_suite.ordeal_rubrics` **Then** it is seeded from `data/ordeal_rubrics_seed.json` on first run. **And** placeholder expected_answers remain placeholders; ORD.10 fills them.

**Given** `tm_suite.ordeal_submissions` has the required index **Then** `{ character_id: 1, ordeal_type: 1 }` exists (created by script on completion).

**Given** the import is re-run on the same extracts **Then** zero new documents are inserted. **And** marking state is untouched.

**Given** a player opens the Ordeals tab for their character **Then** their migrated submissions appear with correct status: Approved for marking-complete, Submitted or In Review for pending, Not Started otherwise.

**Given** the XP breakdown in the Ordeals tab **Then** it correctly shows `+3 XP` per marking-complete ordeal (per the existing XP calculator logic).

**Given** an ST opens the admin ordeal review surface **Then** pending and unmarked submissions from the migration appear in the review queue. **And** clicking into one surfaces the full question/answer content.

**Given** the Archive tab for a character with a character_history submission **Then** the raw history does NOT appear in the archive (ORD.11 handles refinement to archive documents; this story only lands the raw submissions).

---

## Implementation Notes

- **User runs the script.** Per `C:/Users/angel/.claude/projects/D--Terra-Mortis-TM-Suite/memory/feedback_imports.md`: user runs all MongoDB import scripts themselves.
- **MONGODB_URI**: the user's root `.env` is active per local dev convention; verify the correct DB (`tm_suite`) is targeted, NOT `tm_suite_dev` or `tm_suite_test`.
- **Verification queries** (user may run manually after import):
  ```
  db.ordeal_submissions.aggregate([{$group:{_id:'$ordeal_type',count:{$sum:1}}}])
  db.ordeal_submissions.countDocuments({'marking.status':'complete'})
  db.ordeal_submissions.countDocuments({player_id:null, ordeal_type:{$ne:'character_history'}})
  db.ordeal_rubrics.countDocuments({})
  ```
- **Rollback plan**: if something goes wrong, `db.ordeal_submissions.deleteMany({source:'google_form'})` removes only imported rows; the collection remains otherwise intact. This is the safety net that lets the user run the import without fear.
- **Story completion evidence**: capture the script stdout (counts per ordeal type, warnings) in the completion note.

## Files expected to change

None source-level in this story. All file changes landed in ORD.5-8. This story's deliverable is the committed migration state in `tm_suite` and the documented verification.
