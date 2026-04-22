# Story: game.4 — Dice Roller Character Name Button Style

## Status: review

## Summary

In the dice roller ST view, the character name ("Alice") appears left-aligned in a large header font, while pool buttons (DISCIPLINE, COMMON, AUSPEX) use a consistent compact uppercase label style. The name button should match the visual format of the pool buttons.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/css/suite.css` | Restyle `.dm-title` to match `.gcp-pool-btn` / `.gcp-pool-lbl` |

---

## Acceptance Criteria

1. The character name button uses the same border, padding, radius, and background as the pool buttons
2. The name text is uppercase, small font, same family as pool labels
3. No regression to the pool button click behaviour

---

## Tasks / Subtasks

- [x] Restyle `.dm-title` to match pool buttons (AC: #1, #2)
  - [x] Updated `.dm-title` in `suite.css`: border, radius, background, padding, font, uppercase, letter-spacing all matching `.gcp-pool-btn`

---

## Dev Notes

### Current `.dm-title` (suite.css ~line 2256)
Uses heading font at 16px — large and mismatched.

### Target style — match `.gcp-pool-btn` (suite.css line 797)
```css
.dm-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 8px 10px;
  background: var(--surf);
  border: 1px solid var(--bdr);
  border-radius: 4px;
  font-family: var(--fl);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--txt2);
}
```

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- `.dm-title` restyled to match `.gcp-pool-btn`: border, radius, background, padding, FL font, uppercase, dim text colour

### File List

- `public/css/suite.css`

### Change Log

- 2026-04-23: Implemented game.4 — dice roller name button styled to match pool buttons
