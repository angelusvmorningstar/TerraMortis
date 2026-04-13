# Story DS-07: Players Tab — admin-layout.css Players Section

## Status
Ready for Dev

## Story
As an ST,
I want the Players tab (player list, player profile detail) to use the three-font system and semantic colour tokens,
So that the Players tab is visually consistent with the validated design system.

## Background

The Players tab covers panels 27-28 of the design system reference. It shows the player roster, individual player profiles, and linked character information.

Prerequisite: DS-01 must be complete.

## Design Decisions

- **Player names in list context**: Player names displayed as row labels in the player list → `--fl` (Lato) — list label context, not primary display.
- **Player profile header**: If a player name is rendered as a large header in the profile view (primary display context), `--fh` (Cinzel) is acceptable. If it's a section header label, `--fl`.
- **Character links in player profile**: Character names linked from a player profile are cross-references, not primary display → `--fl` unless styled as character name chips with full card context.

## Files to Change

- `public/css/admin-layout.css` (Players section selectors only)

## Acceptance Criteria

- [ ] No Players-tab selector uses `var(--fhd)` or `var(--fb)`
- [ ] Labels, column headers, row text use `--fl`
- [ ] Profile descriptive text uses `--ft`
- [ ] `var(--gold2)` → `var(--accent)` in Players selectors
- [ ] Parchment override rules for Players selectors deleted where redundant
- [ ] No visual regressions in Players tab (both themes)

## Tasks / Subtasks

- [ ] **Font sweep** — replace `--fhd`/`--fb` in Players selectors
- [ ] **Cinzel → Lato** on all labels, row text, column headers
- [ ] **Colour sweep**: `var(--gold2)` → `var(--accent)`; hardcoded status colours → semantic tokens
- [ ] **Parchment override block**: Delete Players rules made redundant

## Dev Notes

- Panels 27-28 in `public/test layout/font-test.html` are the visual spec.
- This panel was not fully prototyped at time of test file build — verify the real tab in both themes after changes.
