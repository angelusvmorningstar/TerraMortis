# Story nav-1-3b: More Grid Layout — Equal Tiles and Section Groupings

Status: ready-for-dev

## Story

As a user opening the More grid,
I want apps displayed in a regular equal-width grid with clear section groupings,
So that I can scan and tap quickly without hunting through an irregular layout.

## Background

nav-1-3 built the More grid with functional role-aware icons. Two layout problems observed in live testing:

1. **Irregular tile sizes** — chips size to content, creating a ragged grid. Should be equal-width fixed tiles like an iPhone app grid.
2. **No section structure** — all apps appear in one undifferentiated list. The grid should have three labelled sections with visual dividers.

## Acceptance Criteria

1. **Given** the More grid renders **When** measured **Then** each app tile is equal width — approximately one-third of the available screen width with consistent gaps
2. **Given** any viewport width **When** the grid renders **Then** tiles form clean rows of 3 (phone) or more (tablet/desktop) with no ragged edges
3. **Given** the ST More grid **When** it renders **Then** apps are grouped in labelled sections:
   - **Game** — Status, Who's Who, DT Report, Feeding
   - **Lore** — Rules, Primer, Game Guide
   - **Storyteller** — Tracker, Sign-In, Emergency
4. **Given** the player More grid **When** it renders **Then** Player-only apps (DT Submission, Ordeals) appear in a **Player** section above Lore
5. **Given** sections render **When** viewed **Then** section labels use `--label-secondary` Lato uppercase, a subtle `--bdr` divider separates sections
6. **Given** the grid renders on a 390px phone **When** measured **Then** 3 tiles fit per row, each tile ≥ 80px wide, ≥ 80px tall, with a minimum 44px tap target

## Tasks / Subtasks

- [ ] Update More grid CSS for equal-width tiles (AC: #1, #2, #6)
  - [ ] Replace `flex-wrap` free layout with CSS grid: `grid-template-columns: repeat(3, 1fr)`
  - [ ] Fixed row height so all tiles are square or consistent
  - [ ] Gap: 10–12px between tiles; outer padding: 16px
- [ ] Update `MORE_APPS` registry to add section grouping (AC: #3, #4)
  - [ ] Add `section` property to each app entry: `'game' | 'lore' | 'st' | 'player'`
  - [ ] Section assignments:
    - game: status, whos-who, dt-report, feeding
    - lore: rules, primer, game-guide
    - st: tracker, signin, emergency
    - player: dt-submission, ordeals
- [ ] Update `renderMoreGrid()` to render by section (AC: #3, #4, #5)
  - [ ] Render visible sections in order: game → player (if visible) → lore → st (if visible)
  - [ ] Each section: label heading + grid of that section's apps
  - [ ] Section label: `<div class="more-section-label">Section Name</div>`
  - [ ] Section grid: `<div class="more-section-grid">` containing `.more-app-icon` tiles
- [ ] Add section CSS to `suite.css` (AC: #5)
  - [ ] `.more-section-label`: `--fl` Lato 10px uppercase `--label-secondary`, padding 12px 0 6px
  - [ ] `.more-section-grid`: `display:grid; grid-template-columns:repeat(3,1fr); gap:10px`
  - [ ] `.more-grid` wrapper: `padding:16px; display:flex; flex-direction:column; gap:4px`

## Dev Notes

- `public/js/app.js` — `MORE_APPS` array and `renderMoreGrid()` function
- `public/css/suite.css` — `.more-grid`, `.more-app-icon` styles
- CSS grid `repeat(3, 1fr)` gives equal width automatically regardless of content
- Section order: Game first (most-used at game), Lore second (reference), ST last (less frequent)
- Player section only renders when `!isST` — conditionally inserted between Game and Lore
- Do not show empty sections — if ST, player section is skipped entirely

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: public/mockups/font-test.html] — section-title pattern for section labels

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
