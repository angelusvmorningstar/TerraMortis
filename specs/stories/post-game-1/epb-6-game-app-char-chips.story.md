# Story EPB.6: Replace Character Cards with Finger-Friendly Chips in Game App ST View

Status: done

## Story

**As an** ST on an iPad during a live game,
**I want** to select a character from a compact list of name chips,
**so that** I can navigate to any character quickly with a single finger tap.

## Background

The game app ST character view currently renders full `.char-card` elements with icons, tags, and stats — the same dense cards as the admin grid. On a tablet mid-scene, these are too large to scroll and too small to tap accurately. Replace with compact chips showing character name only.

## Acceptance Criteria

1. The game app character selector renders characters as compact chips: display name only, minimum 44px height, finger-tap sized.
2. Chips are arranged in a wrapping flex grid — multiple per row on tablet, single column on phone.
3. Tapping a chip selects that character and opens their detail view (same behaviour as tapping a card now).
4. Search/filter input (if present) continues to work — chips update as the filter changes.
5. Chips use design system classes — `.chip` from `components.css` or a new `.char-chip` that follows the same token pattern.
6. No regression to admin character grid — only the game app selector is changed.

## Tasks / Subtasks

- [ ] Find the game app character selector render function — search `public/js/admin.js` or game-specific modules for the character list render in the game app context
- [ ] Replace the card HTML with chip HTML: `<button class="char-chip" data-id="{id}">{displayName}</button>`
- [ ] Add `.char-chip` CSS to `admin-layout.css`: `min-height: 44px`, padding, border, `var(--accent)` hover, uses `--fl` (Lato) font
- [ ] Wire chip click to the existing character select handler
- [ ] Verify search/filter still works if present

## Dev Notes

- The game app lives within `admin.html` — look for the game-mode character list render, likely toggled by a game mode flag in `admin.js`
- `public/css/admin-layout.css` — add `.char-chip` styles
- Chip style guide: Lato 12px small-caps wt 600, `var(--surf2)` bg, `var(--bdr)` border, `var(--accent)` on hover/active, border-radius 6px, padding 10px 14px, min-height 44px
- Do NOT use the `.chip` component class (that's for inline display badges) — `.char-chip` is a button variant

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
