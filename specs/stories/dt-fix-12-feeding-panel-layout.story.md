# Story DT-Fix-12: Feeding Panel Layout Refinements

## Status: done

## Story

**As an** ST reviewing a feeding action,
**I want** the feeding right panel to use the same 4-zone layout structure as action panels,
**so that** the panel is predictably organised and the ST can navigate it without hunting for controls.

## Background

Action panels (project, merit) were standardised in the DT Processing Consistency epic (DT-Proc-D1 through D3) to a 4-zone pattern:
1. Action type / key info row
2. Pool / roll zone
3. Status zone (status buttons + committed pool display)
4. Notes / feedback zone

The feeding right panel (`_renderFeedRightPanel`) was not restructured in that epic. It currently has:
1. Dice Pool Modifiers panel (feeding grounds, unskilled, equipment)
2. Vitae Tally panel (Herd, OoF, ambience, ghouls, rite costs, modifier, total)
3. Toggles row (Rote, 9-Again, 8-Again)
4. Validation Status section (status buttons)
5. Response review section (removed by DT-Fix-7)

The layout lacks zone headers, visual separation between the tally and the pool builder (DT-Fix-11 addresses the padding), and the status zone doesn't include the committed pool display (DT-Fix-9 addresses that). This story addresses the remaining structural layout work: zone headers, spacing, and section order rationalisation.

---

## Current Structure (`_renderFeedRightPanel`, ~line 5480)

```
proc-feed-right
  └─ proc-feed-right-section proc-feed-mod-panel   ← Dice Pool Modifiers
  └─ proc-feed-right-section proc-feed-mod-panel   ← Vitae Tally
  └─ [toggles row — no section wrapper?]
  └─ proc-feed-right-section proc-feed-right-validation ← Validation Status
  └─ proc-response-review-section                  ← REMOVED (DT-Fix-7)
```

---

## Required Changes

### 1. Add zone header labels

Each section should have a consistent `proc-mod-panel-title` header matching action panels:

| Section | Header text |
|---|---|
| Dice Pool Modifiers | `Dice Pool Modifiers` (already has this — verify) |
| Vitae Tally | `Vitae Tally` (already has this — verify) |
| Validation Status | `Validation Status` (already has this — verify) |
| Toggles row | Wrap in section with no header or `Roll Options` header |

Check each section and add missing headers.

### 2. Wrap toggles row in a section div

If the toggles row (Rote / 9-Again / 8-Again) does not have a `proc-feed-right-section` wrapper, add one for consistent spacing:

```html
<div class="proc-feed-right-section proc-feed-right-toggles">
  [toggles content]
</div>
```

### 3. Verify section order

Preferred order after DT-Fix-7 and DT-Fix-9:

1. Dice Pool Modifiers
2. Vitae Tally
3. Roll Options (toggles)
4. Validation Status (buttons + committed pool + Clear Pool)

If the current order differs, reorder.

### 4. Consistent section spacing

Check `admin-layout.css` for `.proc-feed-right-section` margin/padding. Ensure it matches the spacing used by `.proc-action-section` or equivalent action panel section class. If different, align them.

---

## Acceptance Criteria

1. Feeding right panel has the same visual zone structure as project/merit action panels.
2. All sections have a `proc-mod-panel-title` header or are intentionally unlabelled (toggles).
3. Section order is: Modifiers → Vitae Tally → Roll Options → Validation Status.
4. Section spacing is consistent with action panel sections.
5. No feeding-specific controls (vitae tally, ambience, rite costs) are removed — only layout/structure changes.
6. DT-Fix-9 (Committed button) and DT-Fix-11 (territory ticker padding) can be applied independently; this story does not conflict with them.

---

## Tasks / Subtasks

- [ ] Task 1: Read `_renderFeedRightPanel` fully — document current section structure
- [ ] Task 2: Add/verify zone headers on all sections
- [ ] Task 3: Wrap toggles row in section div if missing
- [ ] Task 4: Verify section order; reorder if needed
- [ ] Task 5: Check and align section spacing in CSS
- [ ] Task 6: Verify no feeding controls removed; verify layout visually in browser

---

## Dependencies

- DT-Fix-7 (Remove ST Response) should ship first to remove the response review section before this story restructures the panel. If not possible, remove the response review section as part of this story.
- DT-Fix-9 (Committed button) and DT-Fix-11 (padding) can ship in any order relative to this story.

---

## Dev Notes

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Restructure `_renderFeedRightPanel()` sections |
| `public/css/admin-layout.css` | Verify/align section spacing |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
