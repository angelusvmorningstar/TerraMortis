# Story: game.5 — Dice Roller: Single "Collapse All Pools" Toggle

## Status: review

## Summary

The per-section collapse added in game.2 (separate toggles for Skill Pools and Discipline Pools) doesn't work correctly and isn't the desired UX. Replace with a single "collapse/expand all pools" button that hides or shows the entire pool grid at once.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/game/char-pools.js` | Remove per-section toggles; add single collapse button above all pools |
| `public/css/suite.css` | Remove per-section toggle CSS; add single toggle button style |

---

## Acceptance Criteria

1. A single toggle button (e.g. "▾ Pools" / "› Pools") sits above the pool grid
2. Clicking it collapses or expands ALL pool sections at once
3. State persists in localStorage (`tm_pools_collapsed`)
4. The per-section `.gcp-section-toggle` / `.gcp-chevron` / `.gcp-section-collapsed` classes and their event handlers are removed
5. Section headers (`SKILL POOLS`, `DISCIPLINE POOLS`) remain as plain labels (no toggle behaviour)
6. No regression to pool card click behaviour

---

## Tasks / Subtasks

- [x] Remove per-section toggle code from `char-pools.js` (AC: #4, #5)
  - [x] Section headers reverted to plain `.gcp-section-hd` divs
  - [x] Per-section localStorage keys removed; per-section event listener removed
- [x] Add single collapse toggle button (AC: #1, #2, #3)
  - [x] `<button class="gcp-collapse-btn">▾/▸ Pools</button>` before `.gcp-pools-wrap`
  - [x] `tm_pools_collapsed` localStorage key; `gcp-all-collapsed` on wrap
  - [x] Click handler toggles class + icon + localStorage
- [x] CSS (AC: #1, #4)
  - [x] Per-section CSS removed; `.gcp-collapse-btn` and `.gcp-all-collapsed` rules added

---

## Dev Notes

### Current per-section code to remove (char-pools.js)

Lines 107 and 141 — section headers currently render as toggles with chevrons. Revert to plain divs:
```js
h += `<div class="gcp-section-hd">Skill Pools</div>`;
h += `<div class="gcp-pool-grid">${skillHtml}</div>`;
```

### New single toggle (above first section)

```js
const collapsed = localStorage.getItem('tm_pools_collapsed') === '1';
h += `<div class="gcp-pools-wrap${collapsed ? ' gcp-all-collapsed' : ''}">`;
h += `<button class="gcp-collapse-btn">${collapsed ? '&#8250;' : '&#8964;'} Pools</button>`;
// ... section headers and grids ...
h += '</div>';
```

Click handler in event wiring:
```js
el.querySelector('.gcp-collapse-btn')?.addEventListener('click', () => {
  const wrap = el.querySelector('.gcp-pools-wrap');
  const nowCollapsed = !wrap.classList.contains('gcp-all-collapsed');
  wrap.classList.toggle('gcp-all-collapsed', nowCollapsed);
  el.querySelector('.gcp-collapse-btn').innerHTML = (nowCollapsed ? '&#8250;' : '&#8964;') + ' Pools';
  localStorage.setItem('tm_pools_collapsed', nowCollapsed ? '1' : '0');
});
```

### CSS additions

```css
.gcp-all-collapsed .gcp-pool-grid { display: none; }
.gcp-collapse-btn {
  background: none; border: none; cursor: pointer;
  font-family: var(--fl); font-size: 9px; letter-spacing: .2em;
  text-transform: uppercase; color: var(--gold);
  padding: 0; margin-bottom: 4px;
}
```

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- Replaced two per-section toggles with single `.gcp-collapse-btn` above `.gcp-pools-wrap`
- Section headers are plain labels again; `▾/▸` chevron on the single toggle button
- `tm_pools_collapsed` localStorage key; collapses both grids and section headers at once

### File List

- `public/js/game/char-pools.js`
- `public/css/suite.css`

### Change Log

- 2026-04-23: Implemented game.5 — single collapse all pools toggle
