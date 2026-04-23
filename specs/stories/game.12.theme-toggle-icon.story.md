# Story: game.12 — Theme Toggle Sun/Moon Icon

## Status: review

## Summary

The light/dark mode toggle button in the header (`#btn-theme-toggle`) renders as an empty square because the HTML is missing inner SVG content. The JS `_updateThemeIcon()` already expects two icon elements (`#theme-icon-dark` and `#theme-icon-parch`) and swaps them based on current theme — they just don't exist in the DOM.

Add moon and sun SVG icons inside the button: moon shows during dark theme, sun shows during light/parchment theme.

ST-only visibility is already enforced by game.11 — no extra gating needed.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/index.html` | Add sun + moon SVG children to `#btn-theme-toggle` with the IDs the JS expects |

---

## Acceptance Criteria

1. The theme toggle button shows a moon icon when the page is in dark theme
2. The theme toggle button shows a sun icon when the page is in light/parchment theme
3. Clicking the button swaps theme and the icon updates immediately
4. The button is only visible to STs (already enforced by game.11 — verify unchanged)
5. Icon style matches the adjacent phablet/desktop toggle button (same size, same stroke weight, currentColor)

---

## Tasks / Subtasks

- [x] Add SVG icons to `#btn-theme-toggle` (AC: #1, #2, #3, #5)
  - [x] Added moon SVG with `id="theme-icon-dark"` (default visible)
  - [x] Added sun SVG with `id="theme-icon-parch" style="display:none"`
  - [x] Same dimensions/stroke as desktop-toggle button
- [x] Verify ST-only gating (AC: #4)
  - [x] `#hdr-nav` parent gated by game.11 — unchanged, button still ST-only

---

## Dev Notes

### Current empty button (`index.html:58`)

```html
<button id="btn-theme-toggle" class="app-nav-btn theme-toggle-btn" onclick="toggleTheme()"></button>
```

### Target

```html
<button id="btn-theme-toggle" class="app-nav-btn theme-toggle-btn" onclick="toggleTheme()" title="Toggle theme">
  <!-- Moon: shown when dark theme is active -->
  <svg id="theme-icon-dark" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
  <!-- Sun: shown when parchment/light theme is active -->
  <svg id="theme-icon-parch" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:none">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
</button>
```

### Existing logic (`app.js:1883`) — no JS change needed

```js
function _updateThemeIcon() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                 !document.documentElement.hasAttribute('data-theme');
  const sunEl = document.getElementById('theme-icon-dark');   // ← actually the moon (shown during dark)
  const moonEl = document.getElementById('theme-icon-parch'); // ← actually the sun (shown during parchment)
  if (sunEl) sunEl.style.display = isDark ? '' : 'none';
  if (moonEl) moonEl.style.display = isDark ? 'none' : '';
}
```

Note: the variable names `sunEl`/`moonEl` in the existing JS are misleading — they actually hold references to moon and sun respectively (named after the theme they're shown in, not the shape). This story doesn't rename them, to keep the change minimal; flagged as a minor cleanup for a future pass.

### Default state

The default theme is dark (no `data-theme` attribute). So the moon (`theme-icon-dark`) should be visible by default, sun should be `display:none`.

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-7

### Debug Log

### Completion Notes

- Added moon SVG (shown during dark theme) and sun SVG (shown during light theme) inside `#btn-theme-toggle`
- Existing `_updateThemeIcon()` JS swap logic now has elements to swap — no JS change needed
- Default visible: moon (since dark is default theme)

### File List

- `public/index.html`

### Change Log

- 2026-04-23: Implemented game.12 — theme toggle sun/moon icon
