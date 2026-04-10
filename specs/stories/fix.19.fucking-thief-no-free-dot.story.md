# Story Fix.19: Fucking Thief — Remove Erroneous Free Dot Grant

## Status: ready-for-dev

## Story

**As an** ST editing a character with Fucking Thief,
**I want** the stolen merit to require normal CP/XP purchase,
**so that** Fucking Thief only bypasses prerequisites and does not silently grant a free dot.

## Background

Fucking Thief allows a character to take one 1-dot merit without meeting its prerequisites. It does **not** grant the merit for free — the character still needs to purchase it with CP or XP.

In `public/js/editor/edit-domain.js`, `shEditGenMerit` handles the qualifier change (when the ST selects a merit from the Fucking Thief dropdown). At line 121:

```js
// Add newly stolen merit with granted_by marker
if (val) {
  let newIdx = (c.merits || []).findIndex(...);
  if (newIdx < 0) {
    addMerit(c, { category: 'general', name: val, rating: 0, granted_by: 'Fucking Thief' });
    newIdx = c.merits.length - 1;
  }
  c.merits[newIdx].free = 1;   // ← WRONG: grants a free dot
}
```

The `free: 1` line is incorrect. It causes:
1. The stolen merit to display as "1 dot" without any CP or XP spent
2. The `Fr` input to show 1 (a generic free bucket value — see Fix.14 for full removal)
3. Any existing DB records for FT-stolen merits to have a phantom `free: 1` that persists

## Acceptance Criteria

1. When a merit is selected in the Fucking Thief dropdown, it is created with `free: 0` (or no `free` field)
2. The stolen merit shows "0 dots" until CP or XP is added by the ST
3. Existing characters with `granted_by: 'Fucking Thief'` and `free: 1` have that dot cleared on next render

## Tasks / Subtasks

- [ ] In `public/js/editor/edit-domain.js`, line 121: **remove** the line `c.merits[newIdx].free = 1`

- [ ] In `public/js/editor/mci.js`, in the migration cleanup block (alongside the MCI/Bloodline cleanups), add a pass to clear stale `free` on FT-stolen merits:
  ```js
  // Clear legacy free dot on Fucking Thief stolen merits (never legitimate)
  (c.merits || []).forEach(m => {
    if (m.granted_by === 'Fucking Thief') m.free = 0;
  });
  ```

## Dev Notes

- This is a two-line change total.
- The `granted_by: 'Fucking Thief'` marker remains — it is still used to suppress prereq warnings in the audit (`audit.js` line 277) and to suppress the prereq warning tooltip (`sheet.js` line 78).
- The `Fr` input showing on FT merits is addressed by Fix.14 (remove generic `free` input across all merits). This story only removes the erroneous value being set.

---

## Dev Agent Record

### Implementation Plan
_To be filled by dev agent_

### Completion Notes
_To be filled by dev agent_

## File List
_To be filled by dev agent_

## Change Log
_To be filled by dev agent_
