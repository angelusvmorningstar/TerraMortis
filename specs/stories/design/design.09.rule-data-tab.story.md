# Story DS-09: Rule Data Tab — admin-layout.css Rule Data Section

## Status
Ready for Dev

## Story
As an ST,
I want the Rule Data tab (merit/power reference tables, inline edit modal) to use the three-font system and semantic colour tokens,
So that the Rule Data tab is visually consistent with the validated design system.

## Background

The Rule Data tab covers panel 31 of the design system reference. It shows the merit and power reference tables with category pills, search, pagination, and an inline edit modal.

Prerequisite: DS-01 must be complete.

## Design Decisions

- **Merit/power names in table rows**: Merit names displayed as table cells are row labels → `--fl` (Lato) — tabular label context. The Rule Data table is not a primary character sheet display.
- **Category pills**: Filter category pills are UI controls → `--fl` 600 small-caps or uppercase.
- **Edit modal labels**: All form labels in the edit modal → `--fl`. Input/textarea values → `--ft` 13px.
- **Edit modal read-only value display** (`.rules-modal-ro-value`): These show schema values like dot ratings — `--fl` 13px small-caps 600 (functional label/value, not prose).
- **Description textarea** (`.rules-modal-mono` was previously `--fm` Courier New): No monospace font — use `--ft` 13px for this field. It contains prose descriptions.
- **Table empty state** (`.rules-td-empty`): Informational prose → `--ft` 13px.
- **Pagination controls**: `--fl`.

## Files to Change

- `public/css/admin-layout.css` (Rule Data section selectors only)

## Acceptance Criteria

- [ ] No Rule Data selector uses `var(--fhd)`, `var(--fb)`, or Courier New / `--fm`
- [ ] Category pills use `--fl`
- [ ] Table cell text (merit names, ratings, categories) uses `--fl`
- [ ] Modal description textarea uses `--ft` 13px — not monospace
- [ ] Modal labels use `--fl`; input values use `--ft`
- [ ] Edit/delete action buttons use `--fl`
- [ ] `var(--gold2)` → `var(--accent)` in Rule Data selectors
- [ ] Parchment override rules for Rule Data selectors deleted where redundant
- [ ] No visual regressions in Rule Data tab (both themes)

## Tasks / Subtasks

- [ ] **Font sweep** — replace `--fhd`/`--fb`/Courier New in Rule Data selectors
- [ ] **Cinzel → Lato** on table labels, category pills, modal labels, pagination
- [ ] **Monospace elimination**: `.rules-modal-mono` → `--ft` (and confirm font-test.html matches)
- [ ] **Colour sweep**: `var(--gold2)` → `var(--accent)`; status colours → semantic tokens
- [ ] **Parchment override block**: Delete Rule Data rules made redundant

## Dev Notes

- Panel 31 in `public/mockups/font-test.html` is the visual spec.
- The description textarea previously used `--fm` (Courier New) as a fourth font. That decision was reversed during the font-test.html audit — use `--ft`. The textarea contains prose merit descriptions, not code or structured data.
- If the merit name in the table has a separate large-format display elsewhere (e.g. a detail pane heading), evaluate against the Cinzel rule: only entity names in primary display context. A merit name in a filter table is a label, not a primary display.
