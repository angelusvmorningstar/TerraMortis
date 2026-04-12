# Story Fix.10: Remove Free Dots Input from Discipline Edit Rows

## Status: done

## Story

**As an** ST editing a character's disciplines,
**I want** the discipline CP/XP panel to show only CP and XP inputs,
**so that** I cannot accidentally enter free dots in a field that has no valid use case for disciplines.

## Background

`renderDiscEditRow()` in `public/js/editor/sheet.js` (line ~374) currently renders a three-input panel for each discipline:

```
CP | Free | XP
```

The `free` field exists in the schema (`{ cp, free, xp, dots }`) but discipline free dots are never granted by any game mechanic in this system. The field was carried over from attributes/skills/merits where free dots are legitimate (PT, MCI grants, etc.). For disciplines, there is no grant source, so the input creates confusing UI and a vector for data entry errors.

The panel should show only CP and XP:

```
CP | XP
```

The `has-free-dots` CSS class applied to the row when `cr.free > 0` (line ~365) should remain, as it provides a visual indicator if any legacy data has a non-zero `free` value. Only the input itself is removed.

### Data integrity

If any character currently has `disciplines[d].free > 0` in the DB, removing the input means STs can no longer edit that value. This is acceptable: free dots should not exist for disciplines. Existing non-zero `free` values are data errors. They will be visible via the `has-free-dots` class highlight; an ST noticing the highlight can correct the value via the data import/export tool or by reporting it for a data fix.

## Acceptance Criteria

1. Each discipline edit row shows CP and XP inputs only — no Free input
2. Cruac and Theban edit rows (Blood Sorcery section) also show CP and XP only
3. The dot total displayed at the end of the row still computes correctly: `cp + free + xpToDots(xp, cp+free, costMult)` — `free` is still read from the object, just not editable
4. The `has-free-dots` highlight class is preserved on the row when `cr.free > 0`
5. No regression in discipline dot display, power unlock, or CP counter

## Tasks / Subtasks

- [ ] In `public/js/editor/sheet.js`, find `renderDiscEditRow` (~line 363)
- [ ] Locate the `bd-grp` block for `Free` within the `disc-bd-panel` string (~line 374):
  ```html
  <div class="bd-grp"><span class="bd-lbl">Free</span> <input class="attr-bd-input" type="number" min="0" value="' + (cr.free || 0) + '" onchange="shEditDiscPt(\'' + dE + '\',\'free\',+this.value)"></div>
  ```
- [ ] Remove that entire `<div class="bd-grp">...</div>` block. Leave CP and XP blocks untouched.
- [ ] Confirm the dot total formula (`db2`, `xd`, `dt`) still includes `cr.free` in the base calculation so existing free dots are not silently zeroed in the display.

## Dev Notes

- The `has-free-dots` class is set on line ~365 based on `cr.free > 0`. Do not remove this.
- `shEditDiscPt` in `edit.js` handles `'free'` writes — leave that handler intact in case it is called programmatically.
- Manual verification: open any character in the editor, check all discipline rows show only CP + XP, and that the running total matches manual arithmetic.

---

## Dev Agent Record

### Implementation Plan
_To be filled by dev agent_

### Debug Log
_To be filled by dev agent_

### Completion Notes
_To be filled by dev agent_

## File List
_To be filled by dev agent_

## Change Log
_To be filled by dev agent_
