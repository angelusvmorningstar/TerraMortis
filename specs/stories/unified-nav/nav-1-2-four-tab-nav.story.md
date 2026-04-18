# Story 1.2: Replace Bottom Nav with 4-Tab Layout

Status: ready-for-dev

## Story

As a user on a phone,
I want exactly four bottom tabs (Dice, Sheet, Map, More),
So that I can reach any primary function in one tap with no ambiguity.

## Background

The current game app has 6–7 bottom tabs with no clear hierarchy. This story replaces that with a focused 4-tab structure. Existing content is carried forward (Story 1.4 runs in parallel); this story is purely structural — the nav shell.

**Depends on:** Stories 1.1 and 1.4 complete.

## Acceptance Criteria

1. **Given** any authenticated user **When** the app loads **Then** the bottom nav shows exactly: Dice, Sheet, Map, More — in that order
2. **Given** I am on any tab **When** I tap a bottom nav button **Then** I navigate to that tab with no more than one transition
3. **Given** a screen width of 390px (iPhone 14) **When** the bottom nav renders **Then** all 4 tabs are visible without scrolling, each with ≥44px tap target
4. **Given** I am on the active tab **When** the nav renders **Then** the active tab is visually distinct using `--accent` colour
5. **Given** the app loads on desktop (>1024px) **When** the nav renders **Then** the 4-tab layout still works correctly

## Tasks / Subtasks

- [ ] Remove existing 6–7 tab nav from `index.html` `#bnav` (AC: #1)
  - [ ] Map old tabs to new: Roll → Dice, Characters → Sheet, Territory → Map; others deferred to Story 1.3 (More grid)
  - [ ] Remove old tab buttons that no longer map to primary nav
- [ ] Add 4 new nav buttons to `#bnav` in `index.html` (AC: #1, #3)
  - [ ] Dice tab (`#n-dice` or reuse `#n-roll`)
  - [ ] Sheet tab (`#n-sheet`)
  - [ ] Map tab (`#n-map` or reuse `#n-territory`)
  - [ ] More tab (`#n-more`)
- [ ] Wire tab navigation via `goTab()` in `app.js` (AC: #2)
  - [ ] Each button calls `goTab('dice'|'sheet'|'map'|'more')`
  - [ ] Add tab containers `#t-dice`, `#t-sheet`, `#t-map`, `#t-more` to `index.html` if not present
- [ ] Apply correct CSS (AC: #3, #4, #5)
  - [ ] Each `.nbtn` min 44px height — extend `#bnav` in `suite.css`
  - [ ] Active state uses `--accent` colour, `--accent-a8` background
  - [ ] Lato small-caps labels below icons
  - [ ] `--surf2` nav background, `--bdr` top border

## Dev Notes

- `public/index.html` — `#bnav` is the bottom nav container
- `public/css/suite.css` — `.nbtn` styles; extend, do not replace
- `public/js/app.js` — `goTab(t)` handles tab switching; `applyRoleRestrictions()` controls visibility
- CSS tokens: `--accent` active, `--surf2` background, `--bdr` border, `--fl` (Lato) labels — no hardcoded colours
- Tap target rule: ≥44px on all interactive elements (NFR2)
- Existing `goTab` already handles tab div show/hide via `.active` class — reuse this pattern

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: public/mockups/font-test.html#Tab nav] — `.tab`, `.tab.on` pattern
- [Source: public/css/suite.css] — existing `.nbtn` styles

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
