# Story: game.6 — Phablet View Override Button in Sidebar Footer

## Status: review

## Summary

STs using the desktop sidebar want a quick way to toggle into the phablet/mobile bottom-nav layout without resizing the window. A small button next to the ST Admin button in the sidebar footer should toggle desktop mode off (reverting to the phone layout) and back on.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/app.js` | Add toggle button to `renderDesktopSidebar()` footer |
| `public/css/suite.css` | Style the toggle button |

---

## Acceptance Criteria

1. A button appears in the sidebar footer next to the ST Admin button
2. Clicking it toggles between desktop sidebar layout and phablet bottom-nav layout
3. The button shows a visual indicator of current state (e.g. phone icon when in desktop, monitor icon when in phablet)
4. The toggle does not affect the `tm-mode` localStorage value used for auto-detection — it only applies for the session
5. ST Admin and settings cog remain visible in both states

---

## Tasks / Subtasks

- [x] Add view toggle button to sidebar footer (AC: #1, #2, #3)
  - [x] Added inline after ST Admin button in `renderDesktopSidebar()` footer
  - [x] Phone icon when in desktop (click → phablet); monitor icon when in phablet (click → desktop)
  - [x] Calls existing `toggleDesktopMode()` — no new function needed
  - [x] Uses `.sidebar-st-btn` class — no new CSS needed

---

## Dev Notes

### `renderDesktopSidebar()` footer (app.js ~line 1822–1836)

The footer currently renders:
```js
h += `<a href="/admin" class="sidebar-st-btn" title="ST Admin">ST</a>`;
h += `<button class="sidebar-settings-btn" onclick="goTab('settings')">⚙</button>`;
```

Add alongside:
```js
h += `<button class="sidebar-st-btn" id="sb-view-toggle" title="Toggle phablet view" onclick="toggleDesktopMode()">
  <svg>...</svg>
</button>`;
```

### `toggleDesktopMode()` (app.js line 1694)

Already handles `body.classList.toggle('desktop-mode')` and `localStorage.setItem('tm-mode', ...)`. Calling it directly is sufficient — no new function needed.

### Icons

- Desktop mode (click to go phablet): phone SVG — `<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`
- Phablet mode (click to go desktop): monitor SVG — `<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`

The button icon needs to update when the mode changes. `renderDesktopSidebar()` is already called by `_applyDesktopMode()` so the icon will update on each toggle — no separate logic needed.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- Button added to sidebar footer next to ST Admin, using existing `.sidebar-st-btn` class
- Phone icon (desktop → phablet) / monitor icon (phablet → desktop); icon set by current mode at render time
- `renderDesktopSidebar()` is re-called by `toggleDesktopMode()` so icon updates automatically on each toggle

### File List

- `public/js/app.js`

### Change Log

- 2026-04-23: Implemented game.6 — phablet view override button in sidebar footer
