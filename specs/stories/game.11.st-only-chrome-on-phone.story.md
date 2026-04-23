# Story: game.11 — ST-Only Chrome on Phone: Dice Tab, Header Controls

## Status: review

## Summary

Peter's design pattern: **simplify and remove options for players, especially on phone.** STs get the full chrome; players get a clean minimal interface.

Two things regressed into player-visible chrome and need to be gated to STs only:

1. **Dice tab in bottom nav** — The dice roller has been refactored to a modal summoned from inside the character sheet; players don't need the standalone tab on phone. Earlier `game.1` story added it to `NAV_ITEMS` without a role gate, so it now shows for everyone. Should be ST-only.

2. **Header controls (`#hdr-nav`)** — Contains the theme toggle, phablet/desktop toggle, and ST Admin link. Earlier work (game.8, game.9) made this visible in both modes to allow STs to switch back from phablet. But the container is now visible to players too, adding clutter to the phone header. Should be role-gated.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/app.js` | Add `stOnly: true` to Dice in `NAV_ITEMS`; role-gate `#hdr-nav` visibility on real ST role |

---

## Acceptance Criteria

1. Players on phone do **not** see the Dice tab in the bottom nav
2. STs continue to see the Dice tab in the bottom nav in all modes
3. Players on phone do **not** see the `#hdr-nav` header controls (theme toggle, phablet toggle, ST Admin)
4. STs see `#hdr-nav` in both phablet and desktop modes (so they can toggle back)
5. STs in player-view mode follow the player rules (no Dice tab, no header controls) — the view toggle actually previews what a player sees
6. Desktop sidebar (ST view) still exposes the theme toggle, phablet toggle, and ST Admin via the sidebar footer

---

## Tasks / Subtasks

- [x] Gate Dice tab on ST role (AC: #1, #2, #5)
  - [x] Added `stOnly: true` to Dice in `NAV_ITEMS` line 249
  - [x] `renderBottomNav()` already filters stOnly via `effectiveRole()` — player-view mode correctly hides the tab
- [x] Gate `#hdr-nav` visibility on real ST role (AC: #3, #4, #5)
  - [x] `_applyDesktopMode()` now gates on `effectiveRole()` — ST sees hdrNav, players don't
  - [x] `toggleDesktopMode()` gated the same way
  - [x] `renderUserHeader()` gated the same way (was only checking desktop-mode, now also checks role)
- [x] Verify sidebar access in ST desktop mode (AC: #6)
  - [x] Desktop sidebar footer retains ST Admin + phablet toggle + settings — no change needed

---

## Dev Notes

### Current Dice tab entry (`app.js:249`)

```js
{ id: 'dice', label: 'Dice', icon: '<svg ...>', goTab: 'dice' },
```

Target:
```js
{ id: 'dice', label: 'Dice', icon: '<svg ...>', goTab: 'dice', stOnly: true },
```

Note: This supersedes `game.1` story (which added the Dice tab to web app nav unconditionally). The original intent was to make the Dice tab reachable on web; the better solution is the modal summoned from the sheet, which works for both STs and players everywhere.

### `#hdr-nav` visibility

Current `_applyDesktopMode()` (post-game.8):
```js
const hdrNav = document.getElementById('hdr-nav');
if (hdrNav) hdrNav.style.display = '';  // Always shown in both modes
```

Target:
```js
const hdrNav = document.getElementById('hdr-nav');
if (hdrNav) {
  const isST = effectiveRole() === 'st' || effectiveRole() === 'dev';
  hdrNav.style.display = isST ? '' : 'none';
}
```

Same treatment needed in `toggleDesktopMode()` and `renderUserHeader()` wherever hdrNav visibility is touched.

### Design pattern reinforcement

Peter's rule: **default to hiding chrome from players on phone**. Any future ST-only dev/admin control should default to `stOnly: true` (for nav items) or role-gated visibility (for container elements).

Consider capturing this as a project convention in `CLAUDE.md` or `docs/`, e.g.:
> "New admin/dev UI elements must be gated on real ST role (`effectiveRole()`). Player-facing phone UI should be minimal by default; if in doubt, hide."

That's out of scope for this story but flagged as a follow-up.

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-7

### Debug Log

### Completion Notes

- Dice tab added `stOnly: true` — players no longer see it; STs keep it
- `#hdr-nav` now gated on `effectiveRole()` in three places: `_applyDesktopMode`, `toggleDesktopMode`, `renderUserHeader`
- ST-in-player-view correctly hides chrome (preview mode actually previews)
- Sidebar footer retains ST Admin + phablet toggle + settings for desktop STs

### File List

- `public/js/app.js`

### Change Log

- 2026-04-23: Implemented game.11 — ST-only Dice tab and header controls
