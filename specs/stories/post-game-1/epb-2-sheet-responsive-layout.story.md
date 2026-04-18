# Story EPB.2: Character Sheet Responsive Layout — Apply Single-Column to Player View

Status: ready-for-dev

## Story

**As a** player viewing their character sheet on a phone or tablet,
**I want** the sheet to display in a readable single-column layout,
**so that** I can read my stats without horizontal scrolling or cramped columns.

## Background

A single-column sheet mockup was built at `public/mockups/sheet-col1-mockup.html` but was never wired into the actual player view. The current sheet in `player.html` uses a 3-column layout inherited from the desktop admin editor.

The player portal (`player.html`) is the primary surface affected — it's what players open on their phones. The admin ST view is secondary.

The mockup uses:
- `.sheet-col1` container (max-width 760px)
- Vertical sections: `.sh-header`, `.sh-track-zone`, `.sh-body`
- Stat gems and tracker rows laid out vertically

## Acceptance Criteria

1. The character sheet in `player.html` renders in a single-column layout on screens ≤ 768px wide.
2. On desktop (> 768px), layout remains unchanged — no regression.
3. Attributes, Skills, Disciplines, Merits, and all other sections are visible and readable without horizontal scrolling on a 390px-wide phone screen (iPhone 14 viewport).
4. The sheet CSS uses the existing design token variables (`--surf`, `--bdr`, `--accent`, etc.) — no hardcoded colours.
5. The existing `sheet-col1-mockup.html` approach is the reference — match its layout patterns.

## Tasks / Subtasks

- [ ] Read `public/mockups/sheet-col1-mockup.html` fully to extract the CSS and layout approach
- [ ] Identify the current sheet rendering entry point in `public/js/editor/sheet.js` and the CSS classes driving column layout
- [ ] Add responsive breakpoint to `public/css/player-layout.css`: at ≤ 768px collapse multi-column sheet sections to single column
- [ ] Verify on a narrow viewport (390px) — all sections stack cleanly

## Dev Notes

- `public/js/editor/sheet.js` — sheet HTML renderer; `public/css/player-layout.css` — player-specific CSS
- `public/css/components.css` — shared component styles; do NOT modify for player-only changes
- Player portal is desktop-first per project rules — but mobile must work. Add responsive rules to `player-layout.css` only.
- The mockup is a reference, not a direct copy — the live sheet has more sections. Match the layout principles, not the exact HTML.
- Check what classes the sheet renderer emits for its column containers, then write the breakpoint override in `player-layout.css`

### References
- [Source: public/mockups/sheet-col1-mockup.html]
- [Source: public/js/editor/sheet.js]
- [Source: public/css/player-layout.css]

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
