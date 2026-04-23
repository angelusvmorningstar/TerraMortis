# Story: game.9 — Fix Autodetect Regression + Show Desktop Toggle for STs

## Status: review

## Summary

game.8 introduced a regression: `_initDesktopMode()` now reads `localStorage.tm-mode` on page load and uses that as the mode, bypassing viewport autodetection. Any user who previously toggled to phablet is now permanently stuck there — even after hard refresh — because the stored value overrides viewport detection.

Additionally, the desktop-toggle button (which should appear next to ST ADMIN in the header) is CSS-hidden at suite.css:1970 by a legacy rule from when autodetection was meant to replace the manual toggle. STs need the manual override visible.

**Target behaviour:**
1. Page load: always viewport autodetect (no localStorage preference)
2. User toggle (via a visible button): session-only override, not persisted across reloads
3. Desktop toggle button visible in header (where the theme toggle is)

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/app.js` | Revert localStorage-first init; keep session `_userModeOverride` flag for the session only; stop writing `tm-mode` to localStorage |
| `public/css/suite.css` | Unhide `.desktop-toggle-btn` so the button is visible in header next to ST ADMIN |

---

## Acceptance Criteria

1. Hard refresh on a ≥900px desktop → always enters desktop mode regardless of any previous user toggle
2. Hard refresh on a <900px viewport → always enters phablet mode
3. The desktop/phablet toggle button is visible in the header next to the theme toggle and ST ADMIN
4. Clicking the toggle switches the mode for the current session only — does not persist across reloads
5. On wide viewport in phablet mode, resizing the window still does not flip back (session override still works within the session)
6. No regression to game.8 AC#1 (nav items reachable), AC#2 (toggle visible in both modes)

---

## Tasks / Subtasks

- [x] Revert localStorage-first init in `_initDesktopMode()` (AC: #1, #2, #4)
  - [x] Always uses `DESKTOP_MQ.matches` on load; clears stale `tm-mode` for recovery
  - [x] Resize listener still respects `_userModeOverride` for in-session override
- [x] Stop writing `tm-mode` to localStorage on toggle (AC: #4)
  - [x] Removed `localStorage.setItem('tm-mode', ...)` — toggle is session-only
  - [x] Added `localStorage.removeItem('tm-mode')` on init for recovery
- [x] Unhide the desktop-toggle button (AC: #3)
  - [x] Removed `.desktop-toggle-btn { display: none !important }` rule at suite.css:1970
- [x] Verify game.8 fixes still work (AC: #6)
  - [x] `justify-content: flex-start` on `#bnav` retained
  - [x] `#hdr-nav` still shown in both modes
  - [x] `_userModeOverride` still set by toggle

---

## Dev Notes

### Current broken `_initDesktopMode()` (app.js line 1733, from game.8)

```js
function _initDesktopMode() {
  const stored = localStorage.getItem('tm-mode');
  const initial = stored ? stored === 'desktop' : DESKTOP_MQ.matches;
  if (stored) _userModeOverride = true;  // ← this locks in stored mode forever
  _applyDesktopMode(initial);
  DESKTOP_MQ.addEventListener('change', e => {
    if (_userModeOverride) return;
    _applyDesktopMode(e.matches);
  });
}
```

### Target — always autodetect on load

```js
function _initDesktopMode() {
  // Always autodetect on page load — user toggle is session-only.
  // Clean up any stale stored value from the buggy previous version.
  localStorage.removeItem('tm-mode');
  _applyDesktopMode(DESKTOP_MQ.matches);
  DESKTOP_MQ.addEventListener('change', e => {
    // Respect in-session user override
    if (_userModeOverride) return;
    _applyDesktopMode(e.matches);
  });
}
```

### `toggleDesktopMode()` — remove localStorage write

Current (app.js ~line 1694):
```js
function toggleDesktopMode() {
  _userModeOverride = true;
  const isDesktop = document.body.classList.toggle('desktop-mode');
  localStorage.setItem('tm-mode', isDesktop ? 'desktop' : 'game');  // ← remove
  // ...
}
```

Target:
```js
function toggleDesktopMode() {
  _userModeOverride = true;
  const isDesktop = document.body.classList.toggle('desktop-mode');
  // No localStorage write — session only.
  // ...
}
```

### Unhiding the button — `suite.css:1970`

```css
/* Current — hidden entirely */
.desktop-toggle-btn { display: none !important; }

/* Target — remove the rule, or scope it (e.g. only hide on actual mobile) */
```

Check context around line 1970 — there may be a media query scoping already. If not, just remove this rule.

### Sidebar footer toggle (from game.6)

The sidebar footer button added in game.6 stays — it's still useful in desktop mode. The header button is for when the sidebar is gone (phablet mode).

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-7

### Debug Log

### Completion Notes

- `_initDesktopMode()` reverted to always-autodetect on load; clears stale `tm-mode` localStorage for recovery
- `toggleDesktopMode()` no longer persists to localStorage — session-only override
- Removed `.desktop-toggle-btn { display: none !important }` — button is now visible in header next to theme toggle

### File List

- `public/js/app.js`
- `public/css/suite.css`

### Change Log

- 2026-04-23: Implemented game.9 — fixed autodetect regression, unhid desktop-toggle button
