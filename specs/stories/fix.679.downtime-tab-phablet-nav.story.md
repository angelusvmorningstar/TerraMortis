# Story fix.679: Player Suite Downtime Tab Missing from Nav on Phablet

## Status: ready-for-dev

---
issue: 679
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/679
branch: ms/issue-679-downtime-tab-phablet-nav
---

## Story

**As a** player on a phablet (≤599px screen),
**I want** to see the downtime tab in the bottom nav bar,
**so that** I can access my downtime form without knowing I need to scroll.

## Background

The player suite nav (`#bnav`) scrolls horizontally on phablet with each button at 85px wide.
With 8 non-seasonal player tabs before downtime (dice, stats, skills, powers, status, info,
world, feeding), downtime starts at 8 × 85px = 680px — 81px off-screen on a 599px device.

A CSS `mask-image` gradient (`suite.css:88-93`) fades the right 16px of `#bnav` to transparent,
providing zero visible hint that the nav is scrollable. Downtime is entirely in the masked zone
and appears absent to the player.

At 65px per button, 9 buttons = 585px — downtime fits within 599px without any scrolling.

## Acceptance Criteria

- [ ] Given a phablet viewport (≤599px), the downtime tab button is visible in the suite nav without horizontal scrolling
- [ ] The downtime tab is tappable and navigates to the downtime form
- [ ] Desktop layout (≥600px) is unaffected
- [ ] No other player tabs are newly hidden or clipped

## Tasks / Subtasks

- [ ] Task 1: Reduce `.nbtn` width at phablet breakpoint in `public/css/suite.css`
  - [ ] Inside the existing `@media (max-width: 599px)` block, add: `.nbtn { flex: 0 0 65px; }`
  - [ ] Reduce mask fade from 16px to 8px: change both `-webkit-mask-image` and `mask-image` values from `16px` / `calc(100% - 16px)` to `8px` / `calc(100% - 8px)`

---

## Dev Notes

### Exact change — `public/css/suite.css:88-93`

Before:
```css
@media (max-width: 599px) {
  #bnav {
    -webkit-mask-image: linear-gradient(to right, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%);
            mask-image: linear-gradient(to right, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%);
  }
}
```

After:
```css
@media (max-width: 599px) {
  #bnav {
    -webkit-mask-image: linear-gradient(to right, transparent 0, #000 8px, #000 calc(100% - 8px), transparent 100%);
            mask-image: linear-gradient(to right, transparent 0, #000 8px, #000 calc(100% - 8px), transparent 100%);
  }
  .nbtn { flex: 0 0 65px; }
}
```

### Why this works

Player-visible tabs before downtime (non-ST, non-coordinator, non-guide, non-seasonal): dice, stats, skills, powers, status, info, world, feeding = 8 tabs.

| Button width | Downtime starts at | Visible on 599px? |
|---|---|---|
| 85px (current) | 680px | No — 81px off-screen |
| 65px (fix) | 520px, ends at 585px | Yes — fully visible |

Mask fade tightened from 16px to 8px: mask-out starts at 591px. Downtime ends at 585px, entirely before the fade zone.

### What still scrolls

With 65px buttons, tabs after downtime (ordeals at 585px, devlog at 650px, plus conditional regency/office) still require scrolling. That is acceptable — downtime is the highest-priority during an active cycle. The fade at the right edge retains the scroll affordance hint.

### No test needed

Pure CSS change, no JS. Visual verification in browser at 599px viewport width — confirm downtime button is visible and tappable.

## File List

- `public/css/suite.css` — MODIFY (Task 1)

## Change Log

- 2026-06-10: Story created from issue #679 (player-reported phablet bug)
