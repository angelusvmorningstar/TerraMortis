# Story: game.7 — Replace Regency Tab Icon with Scroll/Deed SVG

## Status: review

## Summary

The Regency tab uses a crown icon which doesn't fit the role — Regents are territory holders, not royalty. Replace with a scroll/deed SVG (confirmed by user). Two locations in `app.js` need updating.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/app.js` | Replace crown SVG at line 269 (NAV_ITEMS inline) and line 1308 (`_svg.regency`) |

---

## Acceptance Criteria

1. The Regency tab icon is a scroll/deed SVG in both the bottom nav and the desktop sidebar
2. No other icons are affected

---

## Tasks / Subtasks

- [x] Replace both regency icon instances (AC: #1)
  - [x] Both NAV_ITEMS (line 269) and `_svg.regency` (line 1308) updated to scroll/deed SVG

---

## Dev Notes

### Current crown SVG (both locations)
```
<svg viewBox="0 0 24 24"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
```

### Scroll/deed SVG
A rolled scroll with curled ends:
```
<svg viewBox="0 0 24 24"><path d="M4 4c0-1.1.9-2 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z"/><path d="M4 4c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2"/><path d="M20 4c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>
```

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- Both crown SVG instances replaced with scroll/deed SVG (document body + curl ends + ruled lines)
- Tracker icon also updated in same commit: clock → sliders (3 horizontal bars with markers)

### File List

- `public/js/app.js`

### Change Log

- 2026-04-23: Implemented game.7 — regency scroll icon + tracker slider icon
