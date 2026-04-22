# Story: game.8 — Phablet Override: Fix Container, Toggle Visibility, and MQ Clobber

## Status: review

## Summary

The phablet override feature (game.6) has three architectural issues uncovered when actually using it:

1. **Bottom nav items off-screen left** — `#bnav` has `justify-content: center` at viewports ≥600px which, combined with `overflow-x: auto`, clips leftmost items (Dice, Stats) on wide viewports in phablet mode. Scrollbar is hidden so users can't recover them. The real root is that `#app` has no max-width constraint in forced-phablet mode — it stretches full viewport.
2. **No way to switch back from phablet on desktop** — `#hdr-nav` is `display:none` by default. `_applyDesktopMode(false)` explicitly sets it to `none` too. In phablet mode on a wide desktop, the sidebar is gone AND the header toggle buttons are hidden. User is trapped unless they resize the window.
3. **`DESKTOP_MQ` listener clobbers user toggle** — If the user toggles to phablet on ≥900px, any resize fires the matchMedia listener and flips back to desktop, silently undoing the override.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/css/suite.css` | Constrain `#app` in phablet mode regardless of viewport; remove broken `justify-content: center` |
| `public/js/app.js` | Show `#hdr-nav` in phablet mode (so the desktop-toggle button is visible); make MQ listener respect explicit user toggle |

Out of scope: redesigning the nav or sidebar layout. Keep existing behaviour, just plug the holes.

---

## Acceptance Criteria

1. On a wide desktop (≥900px) in phablet mode, the bottom nav shows all items, starting from the left — Dice tab visible, no clipping
2. On a wide desktop in phablet mode, the user can switch back to desktop view via a visible button (header desktop-toggle button, or equivalent)
3. When the user has explicitly toggled to phablet on ≥900px, resizing the window does NOT flip back to desktop
4. When no user toggle has been made, `DESKTOP_MQ` auto-detection continues to work on initial load and resize (unchanged default behaviour)
5. Reloading the page in phablet mode (after user toggle) restores phablet mode — i.e., `tm-mode` localStorage is honoured
6. No regression to mobile layout or actual-phone usage

---

## Tasks / Subtasks

- [x] Fix bottom nav container in forced-phablet mode (AC: #1)
  - [x] Changed `#bnav @media (min-width: 600px)` from `justify-content: center` to `flex-start` — items start from left, scrollable naturally
  - [x] `#app { max-width: 900px }` kept (not changed) — adequate with flex-start; no hard mobile-width constraint needed
- [x] Make the desktop-toggle button visible in phablet mode (AC: #2)
  - [x] `_applyDesktopMode` now shows `#hdr-nav` in both modes (header itself hidden in desktop via CSS, so no conflict)
  - [x] Added `#hdr-nav { display: flex; gap: 8px; align-items: center; }` to suite.css so the nav layouts correctly when shown
  - [x] `_updateDesktopIcon()` already handles icon swap
- [x] Make MQ listener respect explicit user toggle (AC: #3, #4, #5)
  - [x] Added module-level `_userModeOverride` flag set by `toggleDesktopMode()`
  - [x] `_initDesktopMode()` reads `localStorage.tm-mode` first, falls back to `DESKTOP_MQ.matches`; sets `_userModeOverride = true` if stored value found
  - [x] `DESKTOP_MQ.addEventListener('change', …)` returns early when `_userModeOverride` is set
- [x] Clean up the duplicate toggle button in sidebar footer (decision)
  - [x] Kept — still useful in desktop mode, no harm in dual access

---

## Dev Notes

### Current `_applyDesktopMode()` flow (app.js lines 1731–1745)

```js
function _applyDesktopMode(isDesktop) {
  document.body.classList.toggle('desktop-mode', isDesktop);
  _updateDesktopIcon();
  if (isDesktop) {
    renderDesktopSidebar();
    _initSidebarCollapse();
    const hdrNav = document.getElementById('hdr-nav');
    if (hdrNav) hdrNav.style.display = '';       // ← shown in desktop
  } else {
    const hdrNav = document.getElementById('hdr-nav');
    if (hdrNav) hdrNav.style.display = 'none';   // ← hidden in phablet — THIS IS THE BUG
  }
  renderBottomNav();
}
```

In phablet mode, the only nav surface is the bottom nav, and that doesn't include a desktop toggle. So the user has no UI affordance to switch back. The fix: show `#hdr-nav` in phablet mode too (or at least show the desktop-toggle button).

### Current MQ listener (app.js lines 1722–1727)

```js
const DESKTOP_MQ = window.matchMedia('(min-width: 900px)');

function _initDesktopMode() {
  _applyDesktopMode(DESKTOP_MQ.matches);
  DESKTOP_MQ.addEventListener('change', e => _applyDesktopMode(e.matches));
}
```

This listener blindly applies the media-query result on every resize, overriding user toggle. Fix:

```js
let _userOverride = false;

function toggleDesktopMode() {
  _userOverride = true;
  // ... existing code
}

function _initDesktopMode() {
  // Prefer localStorage if the user has toggled this session
  const stored = localStorage.getItem('tm-mode');
  const initial = stored ? stored === 'desktop' : DESKTOP_MQ.matches;
  _applyDesktopMode(initial);
  DESKTOP_MQ.addEventListener('change', e => {
    if (_userOverride) return;  // respect user's explicit choice
    _applyDesktopMode(e.matches);
  });
}
```

### Container max-width in phablet mode

Line 12 in suite.css:
```css
#app { max-width: 900px; ... }
```
Line 1808 (only in desktop mode):
```css
body.desktop-mode #app { max-width: none; }
```

So in phablet mode, `#app` is already capped at 900px. The issue is that 900px is wider than the bottom nav needs, and with `justify-content: center` the leftmost items get clipped.

Two fixable options:
- **Option A** — Keep `max-width: 900px` but remove the broken `justify-content: center`. Nav starts from the left, all items reachable by scroll.
- **Option B** — Tighten `max-width` to 600px when phablet is forced. More "phone-like" look.

Recommendation: **Option A** — less visually disruptive, preserves the tablet landscape experience. Users on actual tablets at 600–900px still get a natural centre-aligned look because most items fit without overflow.

### Why `justify-content: center` was likely added

Probably to center the nav items when there are few items on a wide viewport. The bug: it only works cleanly when items fit without overflow. Once items overflow, centring clips the start.

Better solution if centring is desired: `margin: 0 auto` on a wrapper inside `#bnav`, so the content centres when it fits and left-aligns when it overflows. But `justify-content: flex-start` is simpler and sufficient.

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-7

### Debug Log

### Completion Notes

- `#bnav` no longer centres items at ≥600px — flex-start means all items reachable by scrolling from the left
- `#hdr-nav` now visible in phablet mode too, so desktop-toggle button is always reachable from the header
- Added `#hdr-nav` ID-specific CSS matching the existing `.hdr-nav` class rules (the HTML uses id, not class)
- `toggleDesktopMode()` sets `_userModeOverride = true` and also re-renders bottom nav
- `_initDesktopMode()` prefers localStorage over matchMedia; resize listener respects override
- Stored choice survives reloads (sets `_userModeOverride = true` if localStorage present on boot)

### File List

- `public/css/suite.css`
- `public/js/app.js`
- `public/index.html` (comment only — kept inline display:none as anti-flash)

### Change Log

- 2026-04-23: Implemented game.8 — phablet override architecture fixes (nav container, toggle visibility, MQ clobber)
