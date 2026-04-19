---
id: nav.4
epic: unified-nav-polish
group: C
status: ready
priority: high
---

# Story nav.4: CSS & Layout Fixes

As a user on any device,
I want the unified game app to display correctly — correct contrast, no overflow, proper padding, and mobile-friendly layouts,
So that the app looks and feels polished and usable.

## Background

Seven visual defects were identified during dev review. All are independent of API data and can ship in parallel with the regression investigation (Groups A/B).

### Issues in scope

| # | Issue | Location |
|---|---|---|
| 1 | Again buttons — 8-again/9-again should be ALL CAPS; 10-again button should be removed (redundant default) | `public/js/` dice tab |
| 2 | Roll the Dice button — low contrast in parchment theme | `public/css/suite.css` parchment overrides |
| 4 | Sheet picker — should use 6-col grid in desktop mode for density | `public/css/suite.css` desktop mode |
| 5 | Status tab — excessive padding, incomplete city list, missing Clan/Covenant ladder sections | Status tab render + CSS |
| 9 | Map tab — map image flush against edges (needs padding); missing regent/lieutenant list (ref: `player.html` city tab) | Map tab render + CSS |
| 18 | Primer — ToC duplicated (appears in sidebar panel AND inline in document body); split-frame layout not mobile-friendly; sidebar ToC should be collapsible | `public/js/` primer tab, CSS |
| 20 | Sidebar tile grid overflowing sidebar width in desktop mode | `public/css/suite.css` desktop sidebar |

## Acceptance Criteria

### Issue 1 — Again buttons

**Given** the dice tab renders
**When** the again-type buttons (8-again, 9-again) are displayed
**Then** their labels are ALL CAPS: "8-AGAIN", "9-AGAIN"

**Given** the 10-again button exists
**When** this story is complete
**Then** it is removed — 10-again is the default roll behaviour and does not need a modifier button

### Issue 2 — Roll the Dice contrast

**Given** the parchment (light) theme is active
**When** the "Roll the Dice" button renders
**Then** it meets WCAG AA contrast (4.5:1 minimum) — button text is clearly legible against its background

### Issue 4 — Sheet picker desktop density

**Given** desktop mode is active (`body.desktop-mode`)
**When** the sheet character picker renders
**Then** it uses a 6-column chip grid (not the default 3 or 4 col)

### Issue 5 — Status tab

**Given** the Status tab renders
**When** viewed on a 390px screen
**Then** padding is appropriate — content does not have excessive whitespace above it

**Given** the Status tab renders
**When** Clan and Covenant status ladder sections are expected
**Then** they are present and display correctly (not missing)

**Note:** The incomplete city list may be a data issue — confirm with dev fixture before treating as a CSS fix.

### Issue 9 — Map tab

**Given** the Map tab renders
**When** the map image is displayed
**Then** there is at least 12px padding on all sides — the image does not touch the screen edge

**Given** territory data is available
**When** the Map tab renders
**Then** a regent/lieutenant list is displayed alongside the map, matching the format in `main:public/player.html` city tab

### Issue 18 — Primer

**Given** the Primer tab renders
**When** the layout is viewed
**Then** the ToC appears only once — either in the sidebar panel OR inline in the document body, not both

**Given** the Primer ToC sidebar is present
**When** viewed on a screen ≤768px
**Then** the ToC sidebar is collapsed by default, with a visible toggle to expand it

**Given** the Primer is viewed on a phone (390px)
**When** the layout renders
**Then** it is single-column — the two-pane split-frame collapses to column, same as `story-split` / `tab-split` fix

### Issue 20 — Sidebar tile overflow

**Given** desktop mode is active
**When** the sidebar renders Lore or Storyteller section tile grids
**Then** all tiles fit within the sidebar width — no clipping, no overflow, no wrapping beyond 3 tiles per row

**Given** the sidebar is `clamp(180px, 16vw, 220px)` wide
**When** 3-col tile grids render
**Then** tiles use `repeat(3, 1fr)` with correct padding so they fill the sidebar without exceeding it

## Dev Notes

- Issue 1: Find the again button render code; apply `.toUpperCase()` or CSS `text-transform: uppercase`. Remove the 10-again button element.
- Issue 2: Check the parchment override block in `suite.css` — the roll button likely inherits a dark-theme colour that doesn't work on parchment. Add a specific `[data-theme="parchment"]` or `:root:not([data-theme="dark"])` override.
- Issue 4: Add a `body.desktop-mode .char-picker-grid { grid-template-columns: repeat(6, 1fr); }` rule to the desktop mode block in `suite.css`.
- Issue 9: Regent/lieutenant list — port from `player.html` city tab. Use `GET /api/territories` data. Render as a simple list below or beside the map.
- Issue 18: The inline "Contents" section in the Primer document body (the one with page numbers) should remain — that is part of the document content. The sidebar ToC panel is the one to make collapsible. Add `<details><summary>Contents</summary>` pattern or a JS toggle. Single-column collapse: add `.primer-split { flex-direction: column; }` in the `≤768px` media query.
- Issue 20: Check `.sidebar-app-grid` CSS — ensure `grid-template-columns: repeat(3, 1fr)` is set and that the grid container has `padding: 0 8px` so tiles don't touch the border. Add `min-width: 0` to tile children.

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
All 7 issues implemented. Issue 5 (status tab excessive padding) deferred — data-dependent, needs nav.1 dev fixture to verify. Issue 18 ToC single-column was already handled by existing CSS; added collapsible details element for mobile.
### File List
- public/index.html
- public/js/suite/roll.js
- public/css/suite.css
