# Story EPB.1: Fix Dot Rendering on iOS — Hollow Dots and Bonus Dots

Status: done

## Story

**As a** player viewing their character sheet on iPhone,
**I want** hollow and filled dots to render at the same size,
**so that** attribute and skill rows are visually consistent across all devices.

## Background

Two related dot rendering bugs reported from game night:

**Bug 1 (task #18):** On iOS Safari, ○ (U+25CB, hollow dot) renders noticeably larger than ● (U+25CF, filled dot). Apple's system font assigns different glyph metrics to these characters. The fix is to replace the Unicode hollow dot with a CSS-rendered element that matches the filled dot's size exactly.

**Bug 2 (task #19):** Bonus dots from Herd and other sources not showing on mobile. `shDotsWithBonus()` in `public/js/data/helpers.js` produces a string of `●●●○○` — raw Unicode characters. The bonus dots may be suppressed on mobile if the font stack renders them as zero-width or if a CSS rule clips them.

### Current implementation

In `public/js/data/helpers.js`:
```js
export function shDots(n) { return '●'.repeat(n || 0); }
export function shDotsWithBonus(base, bonus) {
  return '●'.repeat(base || 0) + '○'.repeat(bonus || 0);
}
```

### Fix approach

Replace `○` with a `<span class="dot-hollow"></span>` element. This renders identically to ● in size across all browsers. The `shDotsWithBonus` function needs to return HTML rather than a plain string, and all call sites need to use `innerHTML` not `textContent`.

CSS to add to `components.css`:
```css
.dot-hollow {
  display: inline-block;
  width: 0.7em;
  height: 0.7em;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  vertical-align: middle;
  margin-bottom: 0.05em;
}
```

## Acceptance Criteria

1. On iOS Safari, hollow dots (bonus/free dots) render at the same visual size as filled dots.
2. Bonus dots from Herd and all other merit sources render on mobile.
3. The dot string `●●●○○` (3 base + 2 bonus) displays correctly in attribute rows, skill rows, and merit rows across all platforms.
4. The fix uses the design system — `.dot-hollow` class, `currentColor` for theming, no hardcoded colours.
5. No regression in desktop rendering.

## Tasks / Subtasks

- [ ] Add `.dot-hollow` CSS class to `components.css` (AC: #1, #4)
- [ ] Update `shDotsWithBonus()` in `helpers.js` to return HTML with `<span class="dot-hollow"></span>` for each bonus dot (AC: #1, #2, #3)
- [ ] Audit call sites of `shDotsWithBonus()` — ensure all use `innerHTML` not `textContent` (AC: #3)
- [ ] Check `shDots()` call sites — no change needed for filled dots (AC: #5)

## Dev Notes

- `public/js/data/helpers.js` — `shDots()` and `shDotsWithBonus()` definitions
- `public/css/components.css` — add `.dot-hollow` at end of dot-related rules
- Call sites of `shDotsWithBonus`: likely `sheet.js`, `editor/sheet.js` and similar renderers — grep to confirm
- Use `currentColor` so the dot inherits the text colour of its parent — works in both parchment and dark themes with no override needed
- Do NOT use `--accent` directly in the CSS rule — `currentColor` is the correct pattern here

### References
- [Source: specs/architecture/system-map.md#Section 11] — iOS dot rendering fix approach
- [Source: public/js/data/helpers.js] — shDots / shDotsWithBonus

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
