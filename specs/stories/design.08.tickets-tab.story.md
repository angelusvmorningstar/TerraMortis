# Story DS-08: Tickets Tab — admin-layout.css Tickets Section

## Status
Ready for Dev

## Story
As an ST,
I want the Tickets tab (player-submitted tickets, admin responses) to use the three-font system and semantic colour tokens,
So that the Tickets tab is visually consistent with the validated design system.

## Background

The Tickets tab covers panel 30 of the design system reference. It shows the ticket submission list with filter controls, and expanded/resolved admin rows.

The ticket badge (`.tk-badge`) taxonomy was confirmed during the font-test.html build: dense list badge, Lato 9px 900 uppercase `border-radius:3px` `padding:2px 6px` — same family as `.proc-row-status` and other DT badges.

Prerequisite: DS-01 must be complete.

## Design Decisions

- **`.tk-badge`**: Dense list badge — Lato 9px 900 uppercase `border-radius:3px` `padding:2px 6px`. Seven badge types (`.tk-badge-open`, `.tk-badge-in-review`, `.tk-badge-resolved`, `.tk-badge-closed`, `.tk-badge-urgent`, `.tk-badge-info`, `.tk-badge-bug`) share the base rule; colour overrides per-class.
- **Ticket subject/title**: These are user-submitted text (a short prose subject line) → `--ft` or `--fl` depending on current implementation. If displayed as a list-row label (truncated single line), `--fl`. If rendered as full prose, `--ft`.
- **Admin response textarea**: Form input value → `--ft` 13px.
- **Status select**: `--fl` 13px (functional UI control).
- **`.tk-empty`** (empty state message): Informational prose → `--ft` 13px.

## Files to Change

- `public/css/admin-layout.css` (Tickets section selectors only)
- `public/css/player-layout.css` (Tickets-related selectors if player-side ticket display exists)

## Acceptance Criteria

- [ ] No Tickets-tab selector uses `var(--fhd)` or `var(--fb)`
- [ ] `.tk-badge` and all seven `.tk-badge-*` variants use the dense badge base: Lato 9px 900 uppercase radius:3px padding:2px 6px
- [ ] Badge colours use semantic tokens (`--result-succ`, `--result-pend`, `--warn-dk`, `--accent-a8/a40`) — not hardcoded hex
- [ ] Form inputs and textareas: `--ft` 13px
- [ ] Status selects and labels: `--fl` 13px
- [ ] Parchment override rules for ticket badge selectors deleted where redundant (`.tk-badge-*` parchment colour block in `player-layout.css` lines ~3373+)
- [ ] No visual regressions in Tickets tab (both themes)

## Tasks / Subtasks

- [ ] **Font sweep** — replace `--fhd`/`--fb` in Tickets selectors (both CSS files)
- [ ] **Badge consolidation**: Ensure `.tk-badge` base rule is Lato 9px 900 uppercase radius:3px; per-class colour overrides use semantic tokens
- [ ] **`player-layout.css` badge colours**: Replace hardcoded parchment badge colours with semantic tokens; remove from parchment override block
- [ ] **Colour sweep**: `var(--gold2)` → `var(--accent)` in Tickets selectors
- [ ] **Parchment override block** (`admin-layout.css` + `player-layout.css`): Delete ticket badge rules made redundant by semantic tokens

## Dev Notes

- Panel 30 in `public/test layout/font-test.html` is the visual spec.
- The `player-layout.css` parchment override block (lines ~3373+) has 7 `.tk-badge-*` selectors with hardcoded parchment colours. Once badge colours use semantic tokens (which are theme-aware), the entire 7-selector block is removable.
- Check if ticket subject lines are truncated single-line labels (→ `--fl`) or multi-line prose (→ `--ft`) in the actual admin UI before committing font choice.
