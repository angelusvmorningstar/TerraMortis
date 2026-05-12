# Story fix.53: DT City — ST Notes block missing horizontal padding

**Story ID:** fix.53
**Epic:** Fixes
**Issue:** 271
**Issue URL:** https://github.com/angelusvmorningstar/TerraMortis/issues/271
**Branch:** morningstar-issue-271-city-spheres-padding
**Status:** review
**Date:** 2026-05-12

---

## User Story

As an ST viewing the City Overview panel, I want the ST Notes label and textarea to be inset from the panel edges, so the section is visually consistent with all other City Overview content blocks.

---

## Background

Issue #271 originally covered `.spheres-grid` lacking horizontal padding — that fix (PR #275, `padding: 8px 0 → 8px 16px`) is already merged. The remaining gap in the same panel is `.proc-amb-notes-block`, which has `padding-top: 12px` but no left/right padding, leaving the "ST Notes" label and textarea flush to the left edge.

The fix mirrors what was done for `.spheres-grid`: add 16px horizontal padding, matching the `padding: 10px 16px` on section headers (`.proc-disc-header`) and the `padding: 14px` on body sections (`.proc-amb-body`).

---

## Acceptance Criteria

- [x] `.proc-amb-notes-block` has 16px left and right padding
- [x] "ST Notes" label and textarea are visually inset from panel edges — no longer flush
- [x] The `border-top` separator and `margin-top` spacing are preserved
- [x] No other uses of `.proc-amb-notes-block` exist outside the City Overview panel (verify before patching)

---

## Implementation

### File: `public/css/admin-layout.css` — line 6086

**Current:**
```css
.proc-amb-notes-block {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--bdr);
}
```

**Change to:**
```css
.proc-amb-notes-block {
  margin-top: 16px;
  padding: 12px 16px 0;
  border-top: 1px solid var(--bdr);
}
```

This collapses `padding-top: 12px` into the shorthand and adds the 16px horizontal inset.

---

## Verification

```
grep -n "proc-amb-notes-block" public/css/admin-layout.css
grep -rn "proc-amb-notes-block" public/js/
```

Expected: one CSS definition (updated), one usage in `downtime-views.js` (`renderCityOverview`).

Visual check: reload admin City tab — "ST Notes" label and textarea should be inset ~16px from the left edge, consistent with the Territory Pulse and Spheres sections below/above.

---

## Scope Notes

- **In scope**: `public/css/admin-layout.css` — `.proc-amb-notes-block` rule only
- **Out of scope**: the textarea behaviour, save logic, or any JS changes
- **No regressions expected**: class is used in exactly one place (`renderCityOverview` in `downtime-views.js`)
