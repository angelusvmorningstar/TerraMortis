# Story DS-10: Data Portability and Cycle Reset Wizard — admin-layout.css

## Status
Ready for Dev

## Story
As an ST,
I want the Data Portability panel and Cycle Reset Wizard to use the three-font system and semantic colour tokens,
So that these utility panels are visually consistent with the validated design system.

## Background

Panel 32 of the design system reference covers two related utility surfaces:

**Data Portability**: Action cards for import/export, Excel diff preview table, diff panel showing field-level changes.

**Cycle Reset Wizard**: Multi-step checklist for end-of-cycle ST operations — checklist rows, phase progress indicator, cycle name input, confirmation actions.

These share admin-layout.css selectors prefixed `.dp-*` and `.gc-*`.

Prerequisite: DS-01 must be complete.

## Design Decisions

- **Diff table field names** (`.dp-diff-title`): These were previously using `--fm` (Courier New) to indicate schema field names. After the font-test.html audit, these are changed to `--fl` 11px — they are label-style identifiers, not code. No monospace in the system.
- **Diff table value cells** (`.dp-diff-val`): Changed from `--ft` to `--fl` during audit — these display dot strings (●●○) which use Lato throughout the system.
- **Excel preview table** (`.dp-excel-tbl td`): `--fl` 13px — tabular data cells are label-adjacent.
- **Cycle wizard checklist notes** (`.gc-chk-note`): Short explanatory notes beneath checklist items — these are text (explanatory prose), not labels. Use `--ft` 12px.
- **Wizard phase detail** (`.gc-phase-detail`): Prose description of each phase → `--ft` 12px.
- **`gc-wizard-sub strong`**: Bold emphasis within a Libre Baskerville sentence — no font-family change, stays in `--ft` bold.
- **Action card descriptions** (`.dp-card-desc`): Short prose descriptions → `--ft` 13px.
- **Action card titles and buttons**: `--fl`.

## Files to Change

- `public/css/admin-layout.css` (Data Portability and Cycle Reset Wizard selectors only)

## Acceptance Criteria

- [ ] No `.dp-*` or `.gc-*` selector uses `var(--fhd)`, `var(--fb)`, or Courier New / `--fm`
- [ ] Diff table field labels (`.dp-diff-title`) use `--fl` 11px — not monospace
- [ ] Diff value cells (`.dp-diff-val`) use `--fl` (dot strings display correctly in Lato)
- [ ] Wizard checklist notes (`.gc-chk-note`) and phase details (`.gc-phase-detail`) use `--ft`
- [ ] Action card prose (`.dp-card-desc`) uses `--ft`
- [ ] Action titles, wizard headers, checklist labels use `--fl`
- [ ] `var(--gold2)` → `var(--accent)` in these selectors
- [ ] Status indicators use semantic tokens
- [ ] No visual regressions on Data Portability or Cycle Reset Wizard (both themes)

## Tasks / Subtasks

- [ ] **Font sweep** — replace `--fhd`/`--fb`/Courier New in `.dp-*` and `.gc-*` selectors
- [ ] **Cinzel → Lato**: Card titles, wizard step labels, checklist item labels, action button text
- [ ] **Monospace elimination**: Any remaining Courier New in diff table or other `.dp-*` elements → `--fl`
- [ ] **Colour sweep**: `var(--gold2)` → `var(--accent)`; status colours → semantic tokens
- [ ] **Parchment override block**: Delete redundant rules for these selectors

## Dev Notes

- Panel 32 in `public/mockups/font-test.html` is the visual spec.
- The inline `style` attributes in the diff table HTML (`font-family:var(--fm)`) were fixed during the font-test.html audit — but these are in the test file, not in the real JS-rendered HTML. Check the actual JS that renders the diff table and fix any `--fm` references there too (likely in `admin.js` or a downtime view script).
- The wizard's "strong" emphasis pattern (`gc-wizard-sub strong`) must not introduce a font-family switch mid-sentence. The `strong` tag should only control `font-weight` within `--ft`.
