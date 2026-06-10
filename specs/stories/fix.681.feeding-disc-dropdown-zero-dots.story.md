# Story fix.681: Feeding Discipline Dropdown Hidden When Character Has Zero Relevant Discipline Dots

## Status: done

---
issue: 681
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/681
branch: ms/issue-681-feeding-disc-dropdown-zero-dots
---

## Story

**As a** player building a feeding pool,
**I want** to see and select any discipline from the template's list regardless of whether I own it,
**so that** I can freely override the template preset with any attribute/skill/discipline combo.

## Background

`feeding-tab.js:622` filters `m.discs` to only disciplines the character owns before rendering
the dropdown. If the character has zero dots in all of the template's disciplines, the `if
(availDiscs.length)` gate hides the dropdown entirely. The template is a preset, not a gate —
players must be able to choose any discipline. The suggestions chips already correctly show
0-dot disciplines; the dropdown must match.

## Acceptance Criteria

- [ ] Given a player selects a feeding template, the discipline dropdown is always rendered when `m.discs.length > 0`, even if the character has 0 dots in every template discipline
- [ ] The dropdown shows each discipline in `m.discs` with its dot count — `Dominate (0)` if the character has no Dominate
- [ ] Selecting a 0-dot discipline does not crash the pool builder (`currentChar.disciplines[d]` may be undefined — read safely)
- [ ] Characters who DO own matching disciplines still see their correct dot counts
- [ ] Suggestions chips are unaffected

## Tasks / Subtasks

- [x] Task 1: Fix `feeding-tab.js:622-634`
  - [x] Remove the `.filter()` from `availDiscs` — use `m.discs` directly
  - [x] Change the `if` gate from `availDiscs.length` to `m.discs.length`
  - [x] Make the dot count read safe: `currentChar.disciplines?.[d]?.dots ?? 0` (handles undefined)

---

## Dev Notes

### Exact change — `public/js/tabs/feeding-tab.js:622-634`

Before:
```js
const availDiscs = m.discs.filter(d => currentChar.disciplines?.[d]?.dots);
if (availDiscs.length) {
  h += '<div class="feeding-disc-row">';
  h += '<label>Discipline:</label>';
  h += '<select class="qf-select" id="feed-gen-disc">';
  h += '<option value="">None</option>';
  for (const d of availDiscs) {
    const dv = currentChar.disciplines[d].dots;
    const sel = selectedDisc === d ? ' selected' : '';
    h += `<option value="${esc(d)}"${sel}>${esc(d)} (${dv})</option>`;
  }
  h += '</select></div>';
}
```

After:
```js
if (m.discs.length) {
  h += '<div class="feeding-disc-row">';
  h += '<label>Discipline:</label>';
  h += '<select class="qf-select" id="feed-gen-disc">';
  h += '<option value="">None</option>';
  for (const d of m.discs) {
    const dv = currentChar.disciplines?.[d]?.dots ?? 0;
    const sel = selectedDisc === d ? ' selected' : '';
    h += `<option value="${esc(d)}"${sel}>${esc(d)} (${dv})</option>`;
  }
  h += '</select></div>';
}
```

### No test needed

Pure render-layer change in an already-tested component. Visual verification: select any feeding
template on a character with no matching disciplines — discipline dropdown must appear.

## File List

- `public/js/tabs/feeding-tab.js` — MODIFY (Task 1)

## Change Log

- 2026-06-10: Story created from issue #681
