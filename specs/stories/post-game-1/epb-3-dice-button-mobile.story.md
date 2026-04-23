# Story EPB.3: Fix Dice Roll Button Size on Mobile

Status: done

## Story

**As an** ST rolling dice on a tablet or phone during a live game,
**I want** the Roll button to remain large and easy to tap,
**so that** I don't misfire or fumble the roll mid-scene.

## Background

The "Roll the Dice" button in the dice engine (`#de-roll`, class `de-roll-btn`) shrinks on mobile viewports. It is a primary action and must remain a large tap target regardless of screen size.

## Acceptance Criteria

1. The `#de-roll` button has a minimum height of 48px and minimum width of 120px on all screen sizes.
2. On mobile (≤ 768px) the button is full-width or near-full-width of its container.
3. Font size does not shrink below 15px on mobile.
4. The button uses existing `.de-roll-btn` styling — no new class needed, just override the responsive behaviour.

## Tasks / Subtasks

- [ ] Find `.de-roll-btn` rule in `admin-layout.css`
- [ ] Add mobile override in `admin-layout.css` parchment/responsive section: min-height 48px, min-width 120px, full width on ≤ 768px
- [ ] Verify button remains large on a 390px viewport

## Dev Notes

- `public/css/admin-layout.css` — existing `.de-roll-btn` rule and responsive overrides
- `public/js/admin/dice-engine.js` — button rendered as `<button class="de-roll-btn" id="de-roll">Roll the Dice</button>`
- Keep changes in `admin-layout.css` only — no JS changes needed

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
