# Story DS-05: Attendance and Finance Tab — admin-layout.css Attendance Section

## Status
Ready for Dev

## Story
As an ST,
I want the Attendance and Finance tab to use the three-font system and semantic colour tokens,
So that the tab is visually consistent with the validated design system.

## Background

The Attendance and Finance tab corresponds to panel 23 of the design system reference. It covers session attendance grids, XP allocation summaries, and finance tracking rows.

All CSS is in `admin-layout.css`. This is a lower-complexity story — the tab is primarily tabular/list layout with labels, values, and status indicators.

Prerequisite: DS-01 must be complete.

## Design Decisions

- **Character names in attendance grid**: Where a character's name appears as a row label in the attendance table, use `--fl` (Lato) — these are list-context labels, not primary character display. Cinzel is reserved for the character sheet.
- **XP value numbers**: Numeric XP totals and per-session awards are label-adjacent values → `--fl`.
- **Finance rows**: All currency/amount labels and values → `--fl`. Any descriptive prose (session notes, finance descriptions) → `--ft`.
- **Status indicators**: Attendance confirmed/absent/excused indicators use `--result-succ`/`--result-pend` tokens.

## Files to Change

- `public/css/admin-layout.css` (Attendance section selectors only)

## Acceptance Criteria

- [ ] No Attendance-tab selector uses `var(--fhd)` or `var(--fb)`
- [ ] All labels, headers, values use `--fl`; prose descriptions use `--ft`
- [ ] Attendance status colours use `--result-succ`/`--result-pend`/`--warn-dk` tokens
- [ ] `var(--gold2)` replaced with `var(--accent)` in Attendance selectors
- [ ] Parchment override rules for Attendance selectors deleted where made redundant
- [ ] No visual regressions in Attendance and Finance tab (both themes)

## Tasks / Subtasks

- [ ] **Font sweep** — replace `--fhd`/`--fb` in Attendance selectors
- [ ] **Cinzel → Lato** on all labels, column headers, row labels, value fields
- [ ] **Colour sweep**: `var(--gold2)` → `var(--accent)` in Attendance selectors
- [ ] **Colour sweep**: Status colour hardcodes → semantic tokens
- [ ] **Parchment override block**: Delete Attendance rules made redundant by the sweep

## Dev Notes

- Panel 23 in `public/test layout/font-test.html` is the visual spec.
- This panel was not prototyped in `font-test.html` at the time the test file was built — dev should verify the real tab visually in both themes after making changes.
- If the Attendance tab does not have a panel in `font-test.html`, treat the general typography and colour rules established by the system as authoritative: section headers = Lato 11-12px 700 uppercase, table headers = Lato 11px 600 uppercase, body cells = Lato 12-13px 400.
