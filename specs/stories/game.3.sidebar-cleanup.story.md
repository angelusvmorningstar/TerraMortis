# Story: game.3 — Sidebar: Remove Duplicate ST Admin, Align Collapse Arrow

## Status: review

## Summary

Two sidebar presentation issues: (1) The ST Admin button appears near the top of the sidebar AND at the bottom — only the bottom instance (alongside the settings cog) should exist. (2) The collapse arrow is a standalone element below the character selector/actions row instead of being inline with the "TERRA MORTIS / GAME APP" header.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/index.html` | Remove top ST Admin button; move collapse button into header row |
| `public/css/suite.css` | Align collapse chevron inline with header |

---

## Acceptance Criteria

1. The ST Admin button appears only at the bottom of the sidebar (alongside settings cog) — not at the top
2. The collapse chevron (‹/›) is inline with the "TERRA MORTIS" / "GAME APP" header row, not floating below
3. No regression to collapse functionality — sidebar still collapses/expands correctly

---

## Tasks / Subtasks

- [x] Remove top ST Admin button (AC: #1)
  - [x] `#nav-admin` in `index.html:63` is `display:none` — kept in DOM (used for role show/hide logic at app.js:1265) but `_syncSidebarActions()` no longer clones it into sidebar-actions
  - [x] `_syncSidebarActions()` emptied — ST Admin now only appears in sidebar footer via `renderDesktopSidebar()`
  - [x] `#desktop-sidebar-actions` div removed from `index.html`
- [x] Move collapse button inline with header (AC: #2, #3)
  - [x] Added `.sidebar-header-top` flex row wrapping `.sidebar-header-text` (title + sub) and `#sb-collapse-btn`
  - [x] CSS: `.sidebar-header-top { display: flex; align-items: center; justify-content: space-between }`
  - [x] Collapse functionality unchanged

---

## Dev Notes

### Top button location
`index.html:63`: `<a href="/admin" id="nav-admin" class="app-nav-btn">ST Admin</a>` — inside header nav. This is the duplicate. The bottom instance is rendered by `app.js:1837` inside `renderDesktopSidebar()` as `<a href="/admin" class="sidebar-st-btn">ST</a>`.

### `_syncSidebarActions()` reference
`app.js` around line 1708 clones `#nav-admin` into `#desktop-sidebar-actions`. Once the top button is removed, this function may error or do nothing useful — remove or guard the clone logic.

### Collapse button location
`index.html:77-80`: standalone `<button id="sb-collapse-btn">` sibling of the sidebar header, not a child. Move it inside `.sidebar-header` and flex the header so title is `flex: 1` and button is flush right.

### CSS target
`.sidebar-header` in `suite.css` around line 1869. Add `display: flex; align-items: center; justify-content: space-between;` and remove `margin-top` from the collapse button.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- `_syncSidebarActions()` gutted — no longer clones `#nav-admin` into sidebar header; ST Admin only in footer
- `#desktop-sidebar-actions` div removed from index.html
- `#sb-collapse-btn` moved inside new `.sidebar-header-top` flex row alongside `.sidebar-header-text` (title + sub)
- CSS: `.sidebar-header-top` is `flex; space-between; center` — collapse button now inline with "TERRA MORTIS" heading

### File List

- `public/index.html`
- `public/js/app.js`
- `public/css/suite.css`

### Change Log

- 2026-04-23: Implemented game.3 — sidebar ST Admin deduped, collapse arrow inline with header
