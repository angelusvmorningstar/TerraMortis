# Story Fix.17: Professional Training — Contacts Bonus Not Applying

## Status: ready-for-dev

## Story

**As an** ST editing a character with Professional Training,
**I want** the 2 free Contacts dots granted at PT dot 1 to appear automatically as soon as PT is set to 1+,
**so that** the benefit is visible without requiring the character to be saved and re-opened.

## Background

`applyDerivedMerits` in `mci.js` applies the PT Contacts grant at ~line 175:

```js
const pts = (c.merits || []).filter(m => m.name === 'Professional Training');
for (const pt of pts) {
  const dots = pt.rating || 0;
  ...
  if (dots >= 1) {
    let ctM = (c.merits || []).find(m => m.category === 'influence' && m.name === 'Contacts');
    if (!ctM) { ctM = { name: 'Contacts', category: 'influence', rating: 0, granted_by: 'PT' }; c.merits.push(ctM); }
    ctM.free_pt = 2;
  }
```

The condition `dots >= 1` uses `pt.rating`. But `pt.rating` is the **last-saved value** — it is not synced from inline creation fields (`cp`, `xp`) until `ensureMeritSync` at the very end of `applyDerivedMerits`. PT is explicitly excluded from the inline sync loop:

```js
// At the end of applyDerivedMerits:
(c.merits || []).forEach(m => {
  if (m.name === 'Mystery Cult Initiation' || m.name === 'Professional Training' || ...) return;
  ...
});
```

So if a character has PT with `cp: 1` but the merit's `rating` field is still `0` in the DB (not yet re-saved after CP was set), `dots = 0` and `free_pt` is never set. The Contacts bonus silently disappears.

### MCI solves this correctly

MCI has the same structure but syncs its rating from inline fields early (lines 127–132):

```js
for (const mci of mcis) {
  const _inlineTotal = (mci.cp || 0) + (mci.xp || 0) + (mci.free || 0);
  if (_inlineTotal > 0) mci.rating = _inlineTotal;
}
```

This ensures `mci.rating` is current before the pool calculations run. PT needs the same treatment.

### Display confirmation

Once `free_pt = 2` is correctly set, `meritBdRow` in `xp.js` already includes `fpt` in the total:
```js
const total = cp + xp + fr + fmci + fvm + flk + fohm + finv + fpt + fmdb;
```
And `sheet.js` line 623 shows the "PT Bonus" info line when `contactsEntry.free_pt` is truthy. No display-layer changes needed — the only fix is in `applyDerivedMerits`.

## Acceptance Criteria

1. A character with PT `cp: 1` (dot 1) and no prior save shows Contacts with 2 dots total on first render
2. Removing all PT CP/XP (rating drops to 0) removes the 2 free Contacts dots
3. The "PT Bonus: +2 dots (auto)" info line appears below the Contacts breakdown row
4. PT at dot 2+ continues to work correctly (dot 2+ grants use rating too)

## Tasks / Subtasks

- [ ] In `public/js/editor/mci.js`, immediately before the PT grant block (~line 175), add an early rating sync for PT — matching the pattern used for MCI at lines 127–132:
  ```js
  // Sync PT rating from inline creation fields before applying grants
  for (const pt of pts) {
    const _ptInlineTotal = (pt.cp || 0) + (pt.xp || 0) + (pt.free || 0);
    if (_ptInlineTotal > 0) pt.rating = _ptInlineTotal;
  }
  ```
  This must run AFTER the `const pts = ...` line and BEFORE the `for (const pt of pts) { const dots = pt.rating || 0; ... }` loop.

## Dev Notes

- `pts` is already defined by the time we add the sync — no re-query needed.
- The sync uses the same `(cp + xp + free)` sum as MCI. PT is excluded from `ensureMeritSync`'s general loop (that exclusion remains — PT has its own role/asset display logic that `ensureMeritSync` doesn't handle). This early sync is separate from and does not conflict with that.
- `free` on PT is the generic free bucket — if Fix.14 is implemented first this becomes `(pt.cp || 0) + (pt.xp || 0)` only.

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
