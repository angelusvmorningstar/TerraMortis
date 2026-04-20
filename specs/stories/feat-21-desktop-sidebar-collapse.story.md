# Story feat-21: Desktop Sidebar — Collapsible Icons-Only State

Status: review

## Story

As a desktop user,
I want the desktop mode sidebar to be collapsible to an icons-only strip,
so that I can keep the navigation visible without sacrificing screen real estate when I need more content width.

## Acceptance Criteria

1. In desktop mode, the sidebar has a collapse button that reduces it to a narrow icons-only strip.
2. The collapsed strip shows each app's SVG icon, one per row, in the same section order as the expanded grid.
3. Clicking an icon in the collapsed strip navigates to that app (same as clicking in expanded mode).
4. An expand button (or clicking the strip itself) restores the full sidebar.
5. Collapse/expand state is persisted to localStorage (`tm-sidebar-collapsed`) so it survives page refresh.
6. The collapse toggle is only visible/functional in desktop mode — game mode (bottom nav) is unaffected.
7. The main content area (`#app-body .tab-wrap`) fills the full remaining width when the sidebar is collapsed.

## Tasks / Subtasks

- [x] Task 1 — Add collapse/expand toggle button to desktop sidebar (AC: 1, 4)
  - [x] Added `#sb-collapse-btn` with left/right chevron SVGs inside `.sidebar-header` in `index.html`
  - [x] `toggleSidebarCollapse()` in `app.js` toggles `body.sidebar-collapsed`, updates icon visibility
  - [x] `_updateCollapseIcon(collapsed)` helper updates which SVG is shown

- [x] Task 2 — Implement collapsed icons-only strip (AC: 2, 3, 7)
  - [x] CSS changes grid to single column in collapsed mode — existing `sidebar-app-tile` buttons reused as-is
  - [x] Labels (`.sidebar-app-tile-label`) hidden via CSS; icons remain visible and clickable
  - [x] `goTab()` calls on tiles unchanged — routing unaffected
  - [x] Section labels and user area hidden in collapsed state

- [x] Task 3 — CSS for collapsed state (AC: 2, 7)
  - [x] `body.desktop-mode.sidebar-collapsed #desktop-sidebar { width: 56px; overflow: hidden; }`
  - [x] Labels, section headers, user area, sidebar actions hidden in collapsed state
  - [x] Grid switches to `grid-template-columns: 1fr` with tighter padding
  - [x] `transition: width 0.2s ease` on `#desktop-sidebar` for smooth collapse
  - [x] `.sidebar-collapse-btn` styled in `suite.css`

- [x] Task 4 — Persist state to localStorage (AC: 5, 6)
  - [x] `localStorage.setItem('tm-sidebar-collapsed', 'true'|'false')` on toggle
  - [x] `_initSidebarCollapse()` reads `tm-sidebar-collapsed` on init, applies class
  - [x] Called from both `_initDesktopMode()` and `toggleDesktopMode()`
  - [x] `toggleDesktopMode()` removes `sidebar-collapsed` class when switching out of desktop mode

## Dev Notes

### Implementation

All changes are CSS-class-based (`body.sidebar-collapsed`). No re-render of the sidebar nav is needed — the existing 3-column grid collapses to a single-column icon strip purely via CSS.

- `toggleSidebarCollapse()` is a global function (called by `onclick` in HTML)
- Guard in `toggleSidebarCollapse()` ensures no-op when not in desktop mode (AC: 6)
- Sidebar user area hidden in collapsed state (no space for it at 56px width)

### Files Changed

- `public/index.html` — `#sb-collapse-btn` added to `.sidebar-header`
- `public/js/app.js` — `toggleSidebarCollapse()`, `_initSidebarCollapse()`, `_updateCollapseIcon()` added; `toggleDesktopMode()` and `_initDesktopMode()` updated
- `public/css/suite.css` — collapsed state rules + `.sidebar-collapse-btn` styles added

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Pure CSS-class approach — no sidebar re-render needed for collapse/expand
- Width transition gives smooth animation
- `sidebar-collapsed` class removed on desktop mode exit to prevent stale state

### File List

- public/index.html
- public/js/app.js
- public/css/suite.css
