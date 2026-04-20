# Story CSS-4: Mobile Tap Targets and Padding

Status: review

## Story

As a user on a phone at a live game,
I want every interactive element to be large enough to tap reliably and every screen to have consistent breathing room,
So that I don't mis-tap during a scene and the app doesn't feel cramped.

## Background

The audit found territory tracker buttons sitting at 36px (minimum is 44px) and inconsistent padding across tab containers. Some screens have content flush against screen edges. This was CSS written for desktop that never got a mobile pass.

## Acceptance Criteria

1. **Given** any button, chip, or tappable row in the game app **When** measured **Then** its height is ≥44px
2. **Given** the territory tracker **When** opened on a phone **Then** bidding buttons and action controls are ≥44px height
3. **Given** any More grid tab content area **When** rendered **Then** content has ≥16px outer padding on all sides — nothing flush against screen edges
4. **Given** the Dice tab **When** rendered **Then** consistent vertical spacing between sections (shortcut row, pool, modifiers, buttons, history)
5. **Given** the Status tab **When** rendered **Then** content has appropriate padding and the prestige/court sections are readable on a 390px screen

## Tasks / Subtasks

- [ ] Territory tracker tap targets (AC: #1, #2)
  - [ ] `suite.css` — find all `#t-territory` scoped buttons with `min-height` or `padding` below 44px
  - [ ] `.btn-sm` at 36px → increase to min-height 44px
  - [ ] `.back-del` at 36px → increase to min-height 44px
  - [ ] Check all other territory interactive elements
- [ ] Tab container padding audit (AC: #3)
  - [ ] Create a baseline rule or ensure all `.tab.active` content areas have `padding: 0 16px 80px` (80px bottom clears the nav bar)
  - [ ] Specifically check: DT Report, Status, Ordeals, Tickets, Feeding — each needs outer padding
  - [ ] Territory tracker — currently may have no outer padding
- [ ] Dice tab spacing (AC: #4)
  - [ ] Review `#t-dice` section spacing — shortcut row, pool stepper, modifier chips, roll button, history should have consistent gaps
  - [ ] Confirm gap between sections is 16–20px throughout
- [ ] Status tab mobile pass (AC: #5)
  - [ ] Open Status tab on 390px viewport
  - [ ] Flag any overflow, cramped sections, or unreadable text
  - [ ] Adjust padding/spacing in `suite.css` for `.status-*` classes

## Dev Notes

- `public/css/suite.css` — primary file
- Territory tracker CSS is scoped with `#t-territory` — search for all button rules in that scope
- The 80px bottom padding on tab containers accounts for the bottom nav bar height
- Minimum tap target rule: `min-height: 44px` on all `<button>`, `<a>`, tappable `<div>` with click handlers
- Reference: `public/mockups/font-test.html` — `.exp-row { min-height: 44px }` shows the correct pattern

### References
- [Source: public/css/suite.css] — territory button rules
- Audit findings: `suite.css:267` `.btn-sm` at 36px; `suite.css:364` `.back-del` at 36px

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
