# Story: game.13 — Visual Tint for Admin-Tier Nav Tabs

## Status: review

## Summary

ST-only tabs (Sign-In, Emergency, Territory, Tracker, Combat, Dice) currently look identical to player tabs — there's no visual signal that they're privileged/admin surfaces. Peter's UX suggestion: visually distinguish them.

Apply a subtle background tint to any admin-tier nav item — both in the phablet bottom nav and the desktop sidebar — so STs (and, in future, coordinators) know at a glance which tabs carry admin access.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/css/suite.css` | Add tint class for admin-tier nav buttons, theme-aware via CSS tokens |
| `public/js/app.js` | Apply the tint class when rendering stOnly nav items |

---

## Acceptance Criteria

1. Any nav item with `stOnly: true` renders with a subtle tinted background in both the bottom nav and the desktop sidebar
2. The tint is darker than base in parchment/light theme, lighter than base in dark theme — always readable
3. Active/selected state still visibly distinguishes the current tab on top of the admin tint
4. Hover state still responds as expected
5. No regression to player tabs — untinted, unchanged
6. Works for both ST admin view (game app) and sidebar icons in desktop mode

---

## Tasks / Subtasks

- [x] Add CSS tint rules (AC: #2)
  - [x] Used `var(--surf2)` directly — already darker than base in parchment, lighter in dark (the theme tokens do the work)
  - [x] No new token needed
- [x] Apply class when rendering nav (AC: #1, #6)
  - [x] `renderBottomNav()` — appends `nbtn-admin-tier` when `item.stOnly`
  - [x] `appIcon()` (More grid) — appends `more-app-admin-tier` when `app.stOnly`
  - [x] `renderDesktopSidebar()` sidebar tiles — appends `sidebar-app-tile-admin` when `app.stOnly`
- [x] Active/hover states (AC: #3, #4)
  - [x] `.nbtn.nbtn-admin-tier.on` uses `var(--surf3)` so active state still reads as distinct
  - [x] Existing hover behaviour preserved — text colour change shows through the tint

---

## Dev Notes

### Tint design

Parchment (light) theme — tint darkens slightly:
```css
.nbtn.nbtn-admin-tier {
  background: var(--surf2);     /* slightly darker than the base parchment surface */
}
```

Dark theme override:
```css
html[data-theme="dark"] .nbtn.nbtn-admin-tier {
  background: var(--surf3);     /* slightly lighter than the base dark surface */
}
```

(Confirm `--surf3` exists; if not, use a new token or a rgba layer.)

Sidebar equivalents on `.sidebar-app-tile.admin-tier`.

### Why tint not halo

Angelus prefers tint. Tint is:
- Layout-neutral (no ring/shadow sprawl)
- Clearly reads as "different category" rather than "notification"
- Works well with existing active/hover state overlays

### Forward-compatible with coordinator role

Once `game.14` (coordinator role) lands, the same treatment applies to `minRole: 'coordinator'` tabs — they get the tint too. A future extension could differentiate coordinator (lighter tint) from ST-only (deeper tint), but that's out of scope here. Ship single-tier tint first.

### Files likely touched

- `public/css/suite.css`
- `public/js/app.js` — renderBottomNav, renderMoreGrid, renderDesktopSidebar

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-7

### Debug Log

### Completion Notes

- Three render sites updated: `renderBottomNav()`, `appIcon()` (More grid), and `renderDesktopSidebar()` sidebar tiles
- Tint uses `var(--surf2)` — already theme-aware (darker in parchment, lighter in dark)
- Active state on admin-tier nbtn uses `var(--surf3)` to stay visually distinct over the tint
- Applied to `stOnly: true` items now; when coordinator role lands (fin.1), coordinator-tier tabs will also pick up the tint by virtue of being tagged appropriately

### File List

- `public/js/app.js`
- `public/css/suite.css`

### Change Log

- 2026-04-23: Implemented game.13 — admin-tier visual tint on nav tabs
