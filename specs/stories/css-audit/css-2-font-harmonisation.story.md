# Story CSS-2: Font Harmonisation — Cinzel on Interactive Elements → Lato

Status: ready-for-dev

## Story

As a user of the game app,
I want all interactive elements (buttons, card labels, chips, tabs) to use Lato,
So that the typography is consistent with the design system and feels intentional.

## Background

**Design system rule (absolute):**
- `--fh` (Cinzel) — character names and app title ONLY
- `--fl` (Lato) — all labels, nav, tabs, buttons, chips, section titles, card titles
- `--ft` (Libre Baskerville) — body text, prose, form inputs

The audit found Cinzel appearing on feeding method card names and potentially other interactive elements. This is the most visible design system violation.

## Acceptance Criteria

1. **Given** any button in the game app **When** inspected **Then** it uses `var(--fl)` (Lato), not `var(--fh)` (Cinzel)
2. **Given** feeding method cards (Seduction, Stalking, By Force, etc.) **When** rendered **Then** the card name uses `var(--fl)` Lato, small-caps or uppercase, NOT Cinzel
3. **Given** any chip, badge, or label in the game app **When** inspected **Then** `var(--fh)` does not appear unless the element displays a character name
4. **Given** territory tracker **When** rendered **Then** all non-name text uses `var(--fl)` or `var(--ft)` appropriately
5. **Given** archive badges **When** rendered **Then** they use `var(--fl)` (Lato) not `var(--ft)` (Libre Baskerville)

## Tasks / Subtasks

- [ ] Fix feeding method card names (AC: #2)
  - [ ] `player-layout.css:2621` — `.feeding-no-sub .dt-feed-card-name { font-family: var(--fh) }` → `var(--fl)`
  - [ ] Check all `.dt-feed-card-name` usages in `player-layout.css` and `suite.css` — ensure all use `var(--fl)`
- [ ] Full sweep of `suite.css` for Cinzel violations (AC: #1, #3)
  - [ ] `grep -n "var(--fh)\|var(--fhd)" suite.css` — review every result
  - [ ] Any result on a button, label, chip, nav item, or card title → change to `var(--fl)`
  - [ ] Character name displays (`.char-name`, `.cc-name`, `.sheet-char-chip-name`) — Cinzel IS correct here, do not change
- [ ] Full sweep of `player-layout.css` feeding section for Cinzel (AC: #2)
  - [ ] Any interactive element title in the feeding flow using `var(--fh)` → `var(--fl)`
- [ ] Archive badge font (AC: #5)
  - [ ] `.archive-badge { font-family: var(--ft) }` → `var(--fl)` (badges are labels, not prose)
- [ ] Territory tracker font audit (AC: #4)
  - [ ] Check all `#t-territory` scoped rules in `suite.css` for `var(--fh)` or `var(--fb)` usage on non-name elements

## Dev Notes

- `public/css/suite.css` — primary file; territory tracker rules are scoped with `#t-territory`
- `public/css/player-layout.css` — feeding section around line 2621
- Character names ARE correct in Cinzel — do not change `.cc-name`, `.char-name`, `.sheet-char-chip-name`, `.hdr-title`
- Pattern for interactive labels: `font-family: var(--fl); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--label-secondary);`
- Reference: `public/mockups/font-test.html` — `.section-title`, `.attr-name`, `.skill-name` show correct Lato label patterns

### References
- [Source: public/mockups/font-test.html] — canonical label patterns
- Audit finding: `player-layout.css:2621` Cinzel on feeding card names

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
