# Story DS-03: City Tab — admin-layout.css City Section

## Status
Ready for Dev

## Story
As an ST,
I want the City tab (territories, court, spheres of influence) to use the three-font system and semantic colour tokens,
So that the City tab is visually consistent with the validated design system.

## Background

The City tab covers panels 13-15 of the design system reference:

13. Territory Cards
14. Court, Influence & Eminence
15. Spheres of Influence

All CSS is in `admin-layout.css`. This story targets only the City section selectors — it does not touch selectors used by other tabs, the sidebar, or the global parchment override block (which is handled incrementally across all tab stories).

Prerequisite: DS-01 must be complete (semantic tokens in theme.css).

## Design Decisions

- **Cinzel on entity names**: Territory names (`.terr-name`), court position names (`.court-name`), ascendancy names (`.asc-name`) stay on `--fh` — these are proper nouns displayed as primary labels in their card context.
- **Cinzel → Lato on section headers and labels**: `.terr-section-lbl`, `.sphere-name`, court position titles that function as category headers, eminence labels, all influence/domain labels move to `--fl`.
- **Sphere name is a section label, not an entity name**: `.sphere-name` labels (Clan, Covenant, Secular, etc.) are category headings, not proper nouns → `--fl`.
- **Status/standing colours**: Eminence pips, standing indicators use `var(--accent)` for active state.

## Files to Change

- `public/css/admin-layout.css` (City section selectors only)

## Acceptance Criteria

- [ ] No City-tab selector uses `var(--fhd)` or `var(--fb)`
- [ ] Territory names, court names, ascendancy names remain on `--fh` (Cinzel)
- [ ] Section labels, sphere names, influence labels use `--fl` (Lato)
- [ ] Body text, description prose uses `--ft` (Libre Baskerville)
- [ ] Active/accent colours replaced with `var(--accent)` — no hardcoded `var(--gold2)` in City selectors
- [ ] Status indicators use `--result-succ`, `--result-pend`, `--green-dk` where applicable
- [ ] No visual regressions in City tab (both themes)

## Tasks / Subtasks

- [ ] **Font sweep** — search `admin-layout.css` for City-section selectors using `--fhd` or `--fb`; replace with `--fh` / `--ft`
- [ ] **Cinzel → Lato** on category labels: `.terr-section-lbl`, `.sphere-name`, influence/eminence label selectors, court category headings
- [ ] **Colour sweep** — replace `var(--gold2)` in City selectors with `var(--accent)`
- [ ] **Colour sweep** — replace hardcoded green/red/amber hex values with semantic tokens
- [ ] **Parchment override block** — identify City-related rules in the `html:not([data-theme="dark"])` block; delete those made redundant by the sweep

## Dev Notes

- Use panels 13-15 in `public/mockups/font-test.html` as the visual spec.
- Selectors that are shared between City and other tabs should be handled in the story that owns the majority use — flag if ambiguous rather than duplicating work.
- The `html:not([data-theme="dark"])` block in `admin-layout.css` is large; only delete rules definitively owned by City-tab selectors in this story. Shared rules wait until they are handled by their owning story.
