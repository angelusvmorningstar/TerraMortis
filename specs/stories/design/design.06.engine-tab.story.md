# Story DS-06: Engine Tab — admin-layout.css Engine Section

## Status
Ready for Dev

## Story
As an ST,
I want the Engine tab (session log, attendance recording, live roll engine) to use the three-font system and semantic colour tokens,
So that the Engine tab is visually consistent with the validated design system.

## Background

The Engine tab covers panels 24-26 of the design system reference. It includes the live game session log, attendance recording UI, and the in-session dice roll engine.

The dice engine has its own dense set of selectors: `.slabel`, `.effline`, `.abtn`, `.mchip`, `.rlbl`, `.rverd`, `.rote-lbl`, `.empty-d`. These currently have a parchment weight floor block because they use Cinzel.

Prerequisite: DS-01 must be complete.

## Design Decisions

- **Dice engine labels**: `.slabel` (skill label), `.effline` (effect line), `.rlbl` (roll label), `.rverd` (result verdict) — all functional labels → `--fl`. No Cinzel in the dice engine.
- **`.mchip`** (modifier chip in dice engine): Follows chip rule — `--fl` 600 small-caps/uppercase, accent border+bg. If ≤10px effective cap height, use `text-transform:uppercase` instead of `font-variant:small-caps`.
- **`.abtn`** (add button): `--fl`, button label convention.
- **Roll engine result display** (`.rverd`): This is a result verdict label (e.g. "SUCCESS", "FAILURE"), not a proper noun. `--fl` 700-900 uppercase.
- **Session log entries**: Prose/narrative entries → `--ft`. Timestamps, session IDs, category labels → `--fl`.

## Files to Change

- `public/css/admin-layout.css` (Engine section selectors only)

## Acceptance Criteria

- [ ] No Engine-tab selector uses `var(--fhd)` or `var(--fb)`
- [ ] All dice engine labels (`.slabel`, `.effline`, `.rlbl`, `.rverd`, `.abtn`, `.mchip`, `.rote-lbl`, `.empty-d`) use `--fl`
- [ ] Session log narrative prose uses `--ft`; structural labels use `--fl`
- [ ] `var(--gold2)` → `var(--accent)` in Engine selectors
- [ ] Parchment weight floor rules for dice engine selectors deleted (Lato doesn't need a weight floor)
- [ ] No visual regressions in Engine tab (both themes)

## Tasks / Subtasks

- [ ] **Font sweep** — replace `--fhd`/`--fb` in Engine selectors
- [ ] **Cinzel → Lato**: All dice engine selectors listed above; session log category labels
- [ ] **Colour sweep**: `var(--gold2)` → `var(--accent)` in Engine selectors
- [ ] **Colour sweep**: Status/result colours → semantic tokens
- [ ] **Parchment override block**: Delete Engine rules (dice engine weight floor block) made redundant

## Dev Notes

- Panels 24-26 in `public/mockups/font-test.html` are the visual spec.
- The dice engine weight floor in the parchment override block (`admin-layout.css` lines ~4754+) covers `.slabel`, `.effline`, `.abtn`, `.mchip`, `.rlbl`, `.rverd`, `.rote-lbl`, `.empty-d` — once these move to `--fl` (Lato), that weight floor block is entirely removable.
