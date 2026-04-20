# Story feat-20: Ordeals Tab — CSS and Half-Frame Fix

Status: review

## Story

As a player,
I want the Ordeals tab to render with correct styling and a single-column layout,
so that it is visually consistent with the rest of the player portal and not broken-looking.

## Acceptance Criteria

1. The Ordeals tab renders with all expected CSS applied — ordeal cards, status colours, XP breakdown table, section headings.
2. The half-frame (`.tab-split` two-column) layout is removed. The Ordeals tab renders in a single-column layout: ordeal list first, XP breakdown below.
3. The parchment/light theme correctly applies to all ordeal elements when the light theme is active.
4. All five ordeal types (Questionnaire, History, Setting/Lore, Rules, Covenant) render with their correct status styling (approved/in-review/draft/not-started).
5. The XP breakdown table renders beneath the ordeal list, fully visible without a side-by-side split.
6. No visual regressions in other tabs (Feeding, Downtime, City) that share the `.tab-split` base CSS.

## Tasks / Subtasks

- [x] Task 1 — Investigate root cause (AC: 1)
  - [x] Tab container ID `tab-xplog` in player.html matches `initOrdeals` target — correct
  - [x] `.tab-split` / `.tab-split-left` / `.tab-split-right` confirmed present in rendered HTML
  - [x] Ordeal CSS (player-layout.css lines 583+) IS defined and will apply once layout is fixed
  - [x] No parchment-specific overrides needed — ordeal classes use CSS vars which parchment theme overrides automatically
  - [x] Root cause: `.tab-split` two-column layout is the half-frame; no class mismatch

- [x] Task 2 — Fix the layout: replace split with single column (AC: 2, 5)
  - [x] In `ordeals-view.js` `renderOrdealsList()`: replaced `.tab-split` / `.tab-split-left` / `.tab-split-right` with single `.ordeal-col` wrapper
  - [x] Ordeal sections render inside `.ordeals-container` as before
  - [x] XP breakdown (`renderXPBreakdown`) renders directly after `.ordeals-container`, inside `.ordeal-col`
  - [x] Added `.ordeal-col` to `player-layout.css`: `display: flex; flex-direction: column; gap: 24px` — no padding (tab panel already provides it via `.tab-panel:not(#tab-sheet)`)
  - [x] `.tab-split` left untouched in `components.css`

- [x] Task 3 — Fix or confirm CSS linkage (AC: 1, 3)
  - [x] CSS linkage confirmed correct — no stylesheet changes needed
  - [x] Parchment theme uses CSS vars; ordeal classes inherit correctly — no extra overrides required

- [x] Task 4 — Verify all ordeal states render correctly (AC: 4)
  - [x] Status classes (`.ordeal-card.done`, `.ordeal-card.in_review` etc.) are unchanged and apply via existing CSS
  - [x] XP breakdown renders in full width below ordeal list

## Dev Notes

### Root Cause

The Ordeals tab used `.tab-split` to create a two-column layout (ordeals left, XP right). This was the "half frames" the user saw. The ordeal CSS was always defined — the layout was simply restructured. No stylesheet linkage issue existed.

### Key Change

`ordeals-view.js` `renderOrdealsList()`: single wrapper `<div class="ordeal-col">` replaces the three-div split structure. XP breakdown is now a direct sibling of `.ordeals-container` inside `.ordeal-col`.

### No Padding on `.ordeal-col`

`.tab-panel:not(#tab-sheet)` provides `padding: 24px clamp(16px, 2.5vw, 32px)`. Adding padding to `.ordeal-col` would double it.

### References

- `public/js/player/ordeals-view.js` — `renderOrdealsList()` function
- `public/css/player-layout.css` — `.ordeal-col` added before `.ordeals-container`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Single-pass implementation: ordeals-view.js layout restructure + ordeal-col CSS addition
- `.tab-split` preserved in components.css — Feeding and Downtime tabs unaffected

### File List

- public/js/player/ordeals-view.js
- public/css/player-layout.css
