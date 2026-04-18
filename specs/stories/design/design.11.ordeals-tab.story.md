# Story DS-11: Ordeals Tab — admin-layout.css Ordeals Section

## Status
Ready for Dev

## Story
As an ST,
I want the Ordeals tab (ordeal list, marking UI, rubric questionnaire) to use the three-font system and semantic colour tokens,
So that the Ordeals tab is visually consistent with the validated design system.

## Background

The Ordeals tab covers panels 21-22 of the design system reference:

21. Ordeal List and Marking Interface
22. Ordeal Marking Modal (rubric questions, YES/NO/CONDITIONAL marking, feedback inputs)

Panels 21-22 were reviewed and audited during the font-test.html build session. Known fixes already applied in the test file include:

- Dead `.om-name` Cinzel rule removed (the `--fl` version at line 1286 was already correct)
- `.or-tab-btn` and `.or-ync-btn` changed from `font-variant:small-caps` at 11px → `text-transform:uppercase` (small-caps floor)
- `.or-qa-saved-fb` and `.or-overall-saved`: italic removed, sizes normalised
- `.or-feedback-input`, `.or-overall-input`, `.or-rubric-textarea`: `--ft` 13px confirmed
- `.or-rubric-q`: `--ft` 13px, `font-weight:400` (down from 500)
- Ordeal modal header line changed from `--fh` to `--fl`

These fixes need to be applied from the test file back to `admin-layout.css`.

Prerequisite: DS-01 must be complete.

## Design Decisions

- **Ordeal names** (`.om-name`, `.or-title`): The ordeal/scenario name displayed as the primary heading in the marking modal is an entity name (a named piece of game content) → `--fh` (Cinzel) is appropriate here, matching the decision confirmed during the audit.
- **Wait — the modal header was changed to `--fl` during audit**: The audit confirmed that the modal title line should be `--fl` because it functions as a modal header label, not a primary entity display in the sheet context. Use `--fl` for the modal header.
- **Tab buttons** (`.or-tab-btn`): Lato 11px 600 `text-transform:uppercase` (not small-caps — floor rule applies).
- **YES/NO/CONDITIONAL buttons** (`.or-ync-btn`): Lato 11px 600 `text-transform:uppercase`.
- **Status pill** (`.or-status-badge`): Distinct from dense badge — this is a status pill: Lato 11px 600 `border-radius:10px` `padding:2px 7px`. Use `--result-succ`/`--result-pend`/`--warn-dk` for colours.
- **Rubric questions** (`.or-rubric-q`): Prose questions → `--ft` 13px 400.
- **Feedback text** (`.or-qa-saved-fb`, `.or-overall-saved`): Short saved feedback labels — `--ft` 12-13px, no italic.
- **Feedback inputs and textareas**: `--ft` 13px for all input values.

## Files to Change

- `public/css/admin-layout.css` (Ordeals section selectors only)

## Acceptance Criteria

- [ ] No Ordeals-tab selector uses `var(--fhd)` or `var(--fb)`
- [ ] Dead `.om-name` Cinzel rule (if present in `admin-layout.css`) is removed
- [ ] `.or-tab-btn`, `.or-ync-btn` use `text-transform:uppercase` — not `font-variant:small-caps`
- [ ] `.or-status-badge` uses the status pill spec: Lato 11px 600 radius:10px padding:2px 7px; colour via semantic tokens
- [ ] All rubric question text (`.or-rubric-q`) uses `--ft` 13px 400
- [ ] All feedback inputs and saved-feedback display: `--ft` 13px, no italic
- [ ] `var(--gold2)` → `var(--accent)` in Ordeals selectors
- [ ] Status/result colours use `--result-succ`/`--result-pend`/`--warn-dk` tokens
- [ ] Parchment override rules for Ordeals selectors deleted where redundant
- [ ] No visual regressions in Ordeals tab (both themes)

## Tasks / Subtasks

- [ ] **Font sweep** — replace `--fhd`/`--fb` in Ordeals selectors
- [ ] **Dead rule removal**: Find and delete duplicate `.om-name` Cinzel block if it exists in `admin-layout.css`
- [ ] **Small-caps → uppercase**: `.or-tab-btn`, `.or-ync-btn` — change `font-variant:small-caps` to `text-transform:uppercase`
- [ ] **Italic removal**: `.or-qa-saved-fb`, `.or-overall-saved` — remove `font-style:italic`
- [ ] **Size normalisation**: Input/textarea/question text to 13px where currently smaller
- [ ] **Badge distinction**: Confirm `.or-status-badge` is spec'd as status pill (radius:10px), not dense badge (radius:3px)
- [ ] **Colour sweep**: `var(--gold2)` → `var(--accent)`; status colours → semantic tokens
- [ ] **Parchment override block**: Delete Ordeals rules made redundant

## Dev Notes

- Panels 21-22 in `public/mockups/font-test.html` are the visual spec — refer to the audited CSS there when making changes to `admin-layout.css`.
- The status pill (`.or-status-badge`) is intentionally different from the dense list badge. In the Ordeals tab it is used as a prominent per-ordeal status indicator, not a compact row annotation. Keep the `border-radius:10px` capsule shape.
- Compare the test file's `.or-*` CSS carefully against `admin-layout.css` — the test file represents the target state and may have already incorporated fixes not yet in the main CSS.
