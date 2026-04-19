# Story 2.1: Read-Only Platform-Aware Character Sheet

Status: ready-for-dev

## Story

As a user on any device,
I want a read-only character sheet that renders appropriately for my screen,
So that I can reference my character's stats clearly whether I'm on a phone or desktop.

## Scope Boundary

**Read-only only.** Edit mode stays in `admin.html` — it is not part of the unified app. Players never need edit mode. STs in the game app are looking up characters, not editing them. `editor/sheet.js` is untouched.

## Acceptance Criteria

1. **Given** a phone screen (≤768px) **When** the Sheet tab opens **Then** attributes and skills render in a single column, no horizontal scroll required
2. **Given** a desktop screen (>1024px) **When** the Sheet tab opens **Then** wider layout renders with multiple columns where appropriate
3. **Given** an ST user on Sheet tab **When** no character is selected **Then** the character picker is shown first as a regular 3-column grid of equal-width chips
4. **Given** an ST selects a character chip **When** tapped **Then** that character's sheet renders replacing the picker
5. **Given** the character picker renders **When** measured on a 390px phone **Then** chips are arranged in 3 equal columns with consistent padding (16px outer, 8px gap)
6. **Given** each character chip **When** rendered **Then** it shows the covenant icon alongside the character name
7. **Given** any chip in the grid **When** rendered **Then** all chips are the same width and height (not sized to content) — no ragged edges
5. **Given** a player user on Sheet tab **When** the tab opens **Then** their own character sheet renders immediately — no picker
6. **Given** any sheet renders **When** inspected **Then** all colours use CSS tokens only (`--accent`, `--label-secondary`, etc.) — no hardcoded values

## Tasks / Subtasks

- [ ] Confirm `suite/sheet.js` is the base implementation (AC: scope)
  - [ ] Verify it is read-only — no edit inputs, no save buttons
  - [ ] Confirm EPB.2 CSS breakpoints in `player-layout.css` cover 1-col mobile
- [ ] Extend responsive CSS for unified app (AC: #1, #2)
  - [ ] Verify `.sh-attr-grid` and `.skill-grid` collapse to 1-col at ≤768px in the unified app context
  - [ ] Add breakpoints to `suite.css` if not already covered from `player-layout.css`
- [ ] ST character picker — 3-column equal-width grid with covenant icons (AC: #3, #4, #5, #6, #7)
  - [ ] On Sheet tab open for ST: render character picker using CSS grid `repeat(3, 1fr)`, not flex-wrap
  - [ ] Each chip: equal width/height, fixed dimensions, 16px outer padding, 8px gap
  - [ ] Each chip shows: covenant icon (SVG, 16px) + character display name
  - [ ] Covenant icon: use existing `covIcon(c.covenant, 16)` helper
  - [ ] On chip tap: call `onSheetChar(char)` to render that character's sheet
  - [ ] Show back button to return to chip grid
  - [ ] Update `.char-chip` or add `.sheet-char-chip` variant to `suite.css` for 3-col fixed layout
- [ ] Player sheet wiring (AC: #5)
  - [ ] On Sheet tab open for player: call `onSheetChar(playerChar)` directly
  - [ ] `playerChar` from `getPlayerInfo().character_ids[0]` → look up in `suiteState.chars`
- [ ] Token audit on sheet output (AC: #6)
  - [ ] Check `suite/sheet.js` for any hardcoded colour values — replace with tokens if found

## Dev Notes

- `public/js/suite/sheet.js` — read-only sheet renderer
- `public/js/editor/sheet.js` — admin edit sheet — DO NOT TOUCH
- `public/css/player-layout.css` — EPB.2 breakpoints already here (`.sh-attr-grid`, `.skill-grid` collapse at ≤768px)
- `public/css/suite.css` — unified app CSS — add responsive rules here if needed
- `public/js/editor/list.js` — `renderList()` already renders `.char-chip` — reuse for ST picker
- `public/js/app.js` — `onSheetChar()` already defined; `applyRoleRestrictions()` handles player vs ST logic
- **API:** Player chars → `GET /api/characters?mine=1`. ST chars → `GET /api/characters`. Already loaded in `suiteState.chars`.
- Derived stats (health max, vitae max, willpower max) — calculated at render time, never stored

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: public/mockups/font-test.html] — attr-row, skill-row patterns
- [Source: specs/architecture/system-map.md#Section 5] — state management

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
