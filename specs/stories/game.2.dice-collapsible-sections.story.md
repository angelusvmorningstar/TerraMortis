# Story: game.2 — Dice Roller Collapsible Pool Sections

## Status: review

## Summary

The dice roller shows Skill Pools and Discipline Pools as fixed sections with no way to collapse them. When a character has many pools the view becomes long. Both sections should be collapsible via their header, with state persisted in localStorage so the preference survives tab switches.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/game/char-pools.js` | Collapsible section headers with toggle |
| `public/css/suite.css` | Collapsed state CSS |

---

## Acceptance Criteria

1. Clicking "SKILL POOLS" or "DISCIPLINE POOLS" header toggles its pool grid open/closed
2. A chevron on the header indicates current state (▾ open, ▸ collapsed)
3. Sections start expanded by default
4. Collapsed state persists in localStorage per section key (survives tab switch and page reload)
5. No regression to pool card click behaviour (clicking a card should still trigger a roll)

---

## Tasks / Subtasks

- [x] Add collapse toggle to section headers (AC: #1, #2)
  - [x] Section headers now have `gcp-section-toggle` class, `data-section` attribute, and a `gcp-chevron` span
  - [x] Click handler on `.gcp-section-toggle` toggles `gcp-section-collapsed` on sibling grid
- [x] Persist state in localStorage (AC: #4)
  - [x] On toggle, writes `tm_pool_collapsed_skills` / `tm_pool_collapsed_discs`
  - [x] On render, reads localStorage and applies collapsed class immediately (no flicker)
- [x] CSS for collapsed state (AC: #1, #5)
  - [x] `.gcp-section-collapsed { display: none }`
  - [x] `.gcp-chevron-collapsed { transform: rotate(-90deg) }` with transition

---

## Dev Notes

### Section header location (`char-pools.js`)
- Line 106: `h += '<div class="gcp-section-hd">Skill Pools</div>';`
- Line 139: `h += '<div class="gcp-section-hd">Discipline Pools</div>';`

### Pool grid class
`.gcp-pool-grid` immediately follows each header. Toggling `display:none` on this collapses the section without affecting card click events.

### Collapse state keys
```js
const COLLAPSE_KEYS = { skills: 'tm_pool_collapsed_skills', discs: 'tm_pool_collapsed_discs' };
```

Read on render:
```js
const skillsCollapsed = localStorage.getItem(COLLAPSE_KEYS.skills) === '1';
```

Apply via class on the `gcp-pool-grid` div at render time, so no flicker on load.

### Event wiring
Delegated click on the char-pools container — check `e.target.closest('.gcp-section-hd')` and toggle the next sibling's `gcp-section-collapsed` class + write localStorage.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- Section headers get `gcp-section-toggle` + `data-section` + chevron span; collapse state read from localStorage at render time
- Delegated click handler toggles `gcp-section-collapsed` on sibling grid + rotates chevron + writes localStorage
- Pool card click events unaffected — they're on `.gcp-pool-btn` which is inside the grid

### File List

- `public/js/game/char-pools.js`
- `public/css/suite.css`

### Change Log

- 2026-04-23: Implemented game.2 — collapsible Skill/Discipline Pools sections
