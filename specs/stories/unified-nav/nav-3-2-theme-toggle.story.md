# Story 3.2: Theme Toggle — Dark/Light with Persistent Preference

Status: ready-for-dev

## Story

As a user,
I want to switch between dark and parchment themes,
So that I can choose the display that suits my environment.

## Background

Story 1.1 already fixes the theme *default* (dark, no flash). This story adds the user-controlled toggle on top. The token-based CSS system already supports both themes throughout all components — this is a toggle UI plus preference persistence.

## Acceptance Criteria

1. **Given** a user opens the unified app (no saved preference) **When** the app loads **Then** dark theme is applied — this was done in Story 1.1; verify it still holds
2. **Given** a user taps the theme toggle **When** they select parchment **Then** `localStorage['tm-theme']` is set to `'light'` and the app applies parchment immediately
3. **Given** a user returns to the app **When** they have a saved `'light'` preference **Then** parchment applies before first render
4. **Given** a user on parchment taps the toggle **When** they select dark **Then** `localStorage['tm-theme']` is set to `'dark'` and dark theme applies
5. **Given** the toggle is accessed **When** the user looks in the More grid **Then** the toggle is visible and no more than 2 taps from any screen
6. **Given** new components added in Epics 1 + 2 **When** parchment theme is active **Then** all new components render correctly in parchment — no broken colours

## Tasks / Subtasks

- [ ] Add theme toggle to More grid or settings area (AC: #5)
  - [ ] Add "Theme" option to More grid app registry in Story 1.3 (`goTab('theme')`) OR
  - [ ] Add a persistent toggle icon in the bottom nav or page header
  - [ ] Recommend: More grid entry labelled "Theme" with sun/moon icon — simpler
- [ ] Implement `toggleTheme()` function in `app.js` (AC: #2, #4)
  - [ ] Read current `localStorage['tm-theme']`
  - [ ] If dark (or absent) → set `'light'`, apply `document.documentElement.removeAttribute('data-theme')`
  - [ ] If light → set `'dark'`, apply `document.documentElement.setAttribute('data-theme', 'dark')`
- [ ] Parchment audit of new Epic 1 + 2 components (AC: #6)
  - [ ] Check `.more-app-icon`, `.lifecycle-card`, `.more-grid` in parchment
  - [ ] Any component using tokens adapts automatically — verify, don't assume
  - [ ] Add parchment overrides to `suite.css` parchment block if any icon filters need fixing (SVG mask fills)
- [ ] Theme toggle UI (AC: #5)
  - [ ] `.action-btn` style toggle button — "Dark" / "Parchment" label or icon
  - [ ] Active state shows current theme using `.action-btn.on`

## Dev Notes

- `public/index.html` — theme init already fixed in Story 1.1
- `public/css/suite.css` — add parchment override block at end: `html:not([data-theme="dark"]) { ... }`
- `public/css/theme.css` — token definitions for both themes — already complete
- **CSS icon filters:** SVG icons in dark mode use `invert(1) sepia(1) brightness(.78) saturate(2.8)` (gold). Parchment override: `invert(1) sepia(1) hue-rotate(300deg) brightness(0.30)` (crimson). Check if any new icons in Epic 1+2 need this override.
- **localStorage:** `tm-theme` is one of two permitted localStorage uses — this is correct
- Token auto-adaptation: `--accent` is `--crim` in parchment, `--gold2` in dark — components using `--accent` adapt automatically

### References
- [Source: specs/epic-unified-nav.md#Design & API Constraints]
- [Source: specs/reference/reference_parchment_theme_overrides.md] — override patterns
- [Source: public/mockups/font-test.html] — both themes in one file; use as test reference

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
