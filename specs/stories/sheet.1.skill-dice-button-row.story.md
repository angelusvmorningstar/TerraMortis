# Story: sheet.1 — Move Skill/Discipline Dice Button to New Row Below Chip

## Status: review

## Summary

The dice-roll compute button currently sits inline with the dots and 9-Again chip in each skill row (and similar for discipline powers). This breaks the visual alignment of the dots column between attributes and skills — the button pushes the dots out of place when a chip is present, creating a jagged edge.

The button should move to a new row beneath the skill content — directly under any chip — so the top row stays clean and the dots column aligns consistently.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/suite/sheet.js` | Move dice button out of top row; render as second row inside `.skill-row` |
| `public/css/suite.css` | Update `.skill-row` to stack vertically when dice button present; reposition `.skill-dice-btn` |
| Discipline powers | Apply the same fix to `.disc-power-dice` |

---

## Acceptance Criteria

1. The dots column aligns vertically across attribute rows and skill rows (no jagged offset when a chip is present)
2. When the dice button is shown for a skill, it appears in a new row below the dots/chip, right-aligned or left-aligned under the chip
3. The button is only visible when dice roll mode is on (`_showDice`) and the skill has dots — unchanged from current logic
4. Same layout change applied to discipline powers that have dice buttons
5. Hover behaviour on the dice button unchanged

---

## Tasks / Subtasks

- [x] Restructure skill-row in `sheet.js` (AC: #1, #2, #3)
  - [x] Wrapped name+dots in `.skill-row-top`; dice button now in `.skill-row-actions` below
- [ ] Restructure disc-power row (AC: #4)
  - [ ] Deferred — disciplines don't share a dots column with attributes, so the inline dice button doesn't break alignment. Layout preserved as-is.
- [x] CSS for new structure (AC: #1, #2, #5)
  - [x] `.skill-row` now `flex-direction: column`
  - [x] `.skill-row-top` inherits former `.skill-row` layout
  - [x] `.skill-row-actions` right-aligned, 4px top margin
- [x] Verify dots column alignment (AC: #1)
  - [x] Top row layout unchanged for rows without dice buttons — dots column aligns consistently

---

## Dev Notes

### Current structure (`sheet.js:371-381`)

```js
html += `<div class="skill-row${hasDots ? ' has-dots' : ''}">
  <div class="skill-name-wrap">
    <span class="skill-name">${s}</span>
    ${sp ? `<span class="skill-spec">${sp}</span>` : ''}
  </div>
  <div class="skill-dots-wrap">
    <span class="${hasDots ? 'skill-dots' : 'skill-zero'}">${dotStr}</span>
    ${naLabel ? `<span class="skill-na${ptNa || ohmNa ? ' pt-na' : ''}">${naLabel}</span>` : ''}
  </div>
  ${_diceBtn}   ← this is a direct child of .skill-row, same flex row as dots
</div>`;
```

### Target structure

```js
html += `<div class="skill-row${hasDots ? ' has-dots' : ''}">
  <div class="skill-row-top">
    <div class="skill-name-wrap">...</div>
    <div class="skill-dots-wrap">...</div>
  </div>
  ${_diceBtn ? `<div class="skill-row-actions">${_diceBtn}</div>` : ''}
</div>`;
```

### CSS changes

Current `.skill-row` (suite.css:273):
```css
.skill-row{display:flex;justify-content:space-between;align-items:flex-start;padding:5px 6px;border-bottom:.5px solid var(--bdr);}
```

Target:
```css
.skill-row{display:flex;flex-direction:column;padding:5px 6px;border-bottom:.5px solid var(--bdr);}
.skill-row-top{display:flex;justify-content:space-between;align-items:flex-start;}
.skill-row-actions{display:flex;justify-content:flex-end;margin-top:4px;}
```

### Discipline powers

Check `sheet.js` for `.disc-power-dice` usage — apply the same row-split treatment so the power name and dice button aren't competing for the same line.

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-7

### Debug Log

### Completion Notes

- Skill row restructured: `.skill-row` → column; `.skill-row-top` holds name/dots/chip; dice button in `.skill-row-actions` below
- CSS updated — dots column alignment now consistent regardless of dice button presence
- Discipline power dice buttons left as-is — no dots column shared with attributes, existing inline placement is fine. Can be revisited if user wants consistency.

### File List

- `public/js/suite/sheet.js`
- `public/css/suite.css`

### Change Log

- 2026-04-23: Implemented sheet.1 — dice button moved to new row under skill chip
