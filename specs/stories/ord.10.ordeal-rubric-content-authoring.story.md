---
id: ord.10
epic: ord
status: draft
priority: medium
depends_on: [ord.9]
---

# Story ORD-10: Fill ordeal_rubric expected_answers with real content

As an ST,
I want every ordeal rubric question to have a real expected_answer and marking_notes,
So that marking is a fair and repeatable process rather than freehand guessing.

---

## Context

After ORD.9, `tm_suite.ordeal_rubrics` holds every question with placeholder expected_answer strings like `"[PLACEHOLDER — fill in before import]"` and marking_notes like `"[What counts as close vs no]"`. The review UI cannot help STs mark if it has no reference answer to display.

This is primarily a **content authoring** task, not engineering. The story exists so the content work has a definition of done and the supporting tooling (small update script, "rubric unfilled" indicator in the review UI) is actioned.

### Content scope

- **Lore Mastery**: 45 questions.
- **Rules Mastery**: 56 questions.
- **Covenant Questionnaire**: 23 questions × 4 covenants = 92 items.

The first question of each covenant quiz ("Which covenant is your character joining?") is a player-echo and can either be dropped or trivially marked. Decide during authoring.

---

## Acceptance Criteria

**Given** a tooling decision **Then** one of two routes is implemented:
- **Option A (preferred for reviewability)**: a small update script `server/scripts/update-ordeal-rubric.js` that accepts a JSON patch file (e.g. `data/ordeal_rubric_content.json`) and applies it to `tm_suite.ordeal_rubrics` via `$set`. The patch file is committed to the repo so content is reviewable in diffs.
- **Option B**: a direct admin UI for editing rubric content. More ergonomic but requires building a rubric editor; decision based on appetite.

**Given** the chosen route **Then** every question in `tm_suite.ordeal_rubrics` has `expected_answer` that is not a `"[PLACEHOLDER ...]"` string. **And** `marking_notes` that is not a `"[What counts as close vs no]"` string.

**Given** covenant questions that are genuinely interpretive (no single canonical answer) **Then** `expected_answer` may be a short summary of the correct frame (e.g. "Covenant opposes traditional elder rule; seeks to create new structures through mortal political systems") and `marking_notes` describes what demonstrates solid understanding.

**Given** the admin review UI (`public/js/admin/ordeals-admin.js`) **Then** it renders `expected_answer` alongside the player's answer in the review pane.

**Given** a rubric question still has a placeholder answer at mark time (edge case if content drops) **Then** the review UI shows a visible "rubric unfilled" chip so the ST knows they are marking without a reference.

**Given** content is authored **Then** the story is only "done" when every question's expected_answer and marking_notes are populated, verified by a count check: `db.ordeal_rubrics.aggregate([...])` returning zero placeholders.

**Given** the covenant_questionnaire first question (covenant echo) is chosen to be dropped **Then** it is removed from the rubric questions array, and any submissions referencing it by index are handled gracefully (question_index offset correction).

---

## Implementation Notes

- **Content authoring happens outside this engineering story.** The ST team fills a JSON content file (Option A) or uses the rubric editor (Option B). The code work is the tooling, not the content.
- **Split the code and content work**: a separate sprint beat can track "author lore rubric content", "author rules rubric content", "author covenant rubric content × 4" — each a time-boxed authoring session, not a story per se.
- **Option A example shape** for `data/ordeal_rubric_content.json`:
  ```json
  {
    "lore_mastery": [
      { "index": 0, "expected_answer": "Vitae", "marking_notes": "Accept 'blood' as close." },
      ...
    ],
    "rules_mastery": [ ... ],
    "covenant_questionnaire": [
      { "covenant": "carthian", "questions": [ { "index": 0, ... } ] }
    ]
  }
  ```
- **Option A script logic**: read the content file, match by (ordeal_type, covenant, question index), `$set` expected_answer and marking_notes. Idempotent.
- **"Rubric unfilled" chip**: add a small CSS class `.ord-rubric-unfilled` and a data-driven render check in the review component.
- **Testing**: a small integration test can assert that all rubric questions in `tm_suite_test.ordeal_rubrics` have non-placeholder answers after the content is applied.

## Files expected to change

- `server/scripts/update-ordeal-rubric.js` (new, Option A)
- `data/ordeal_rubric_content.json` (new, Option A)
- `public/js/admin/ordeals-admin.js` (unfilled chip; maybe layout)
- `public/css/components.css` (chip styles)
