# Story: game.1 — Dice Tab Missing from Web App Navigation

## Status: review

## Summary

The Dice tab is only included in the desktop sidebar's Game section grid (`renderDesktopSidebar()`) but is absent from `NAV_ITEMS` — the array that drives the bottom nav and the More tab. Players using the web app (browser, any resolution) who rely on the bottom nav or More screen cannot access the dice roller.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/app.js` | Add Dice entry to `NAV_ITEMS` in the Game section |

---

## Acceptance Criteria

1. The Dice tab is accessible from the bottom nav / More screen in the web app
2. Dice appears in the Game section alongside Sheet, Status etc.
3. No regression to desktop sidebar — Dice continues to appear there as a primary tab

---

## Tasks / Subtasks

- [x] Add Dice to NAV_ITEMS (AC: #1, #2)
  - [x] In `app.js` `NAV_ITEMS` array (line 247), added Dice as first entry with inlined SVG (matching desktop sidebar icon at line 1787)
  - [x] No `stOnly` flag — dice is available to all roles

---

## Dev Notes

### NAV_ITEMS location
`app.js` around line 1311 defines `MORE_APPS` / `NAV_ITEMS`. The Game section entries include Sheet, Status, World, Feeding, Regency, Office. Add Dice here, before or after Sheet.

### SVG icon
The desktop sidebar entry at line 1787 already references the dice icon SVG. Use the same icon reference. Check `_svg` object definition (around line 1305) for the key name — likely `_svg.dice`.

### Tab HTML
`#t-dice` already exists in `index.html` (line 141). No HTML changes needed.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- Added Dice as first entry in NAV_ITEMS with inlined SVG (same icon as desktop sidebar)
- No stOnly flag — available to all roles
- `#t-dice` already exists in index.html; no HTML changes needed

### File List

- `public/js/app.js`

### Change Log

- 2026-04-23: Implemented game.1 — Dice tab added to web app navigation
