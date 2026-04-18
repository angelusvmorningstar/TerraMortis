# Story fix.44: Attaché — Invested bonus gate

**Story ID:** fix.44
**Epic:** Fixes
**Status:** ready-for-dev
**Date:** 2026-04-18

---

## User Story

As an ST editing an Invictus character with the Invested merit, I want Invested bonus dots to be allocatable to Attaché — but only after the first dot has been purchased — so that the accounting correctly reflects the house rule that Invested can fund Attaché upgrades.

---

## Background

### Invested merit

`hasInvested(c)` — returns true if character has a merit named `'Invested'`.
`investedPool(c)` — equals `effectiveInvictusStatus(c)` (in `domain.js`).
`investedUsed(c)` — sums `free_inv` on merits in `['Herd', 'Mentor', 'Resources', 'Retainer']` only.

The `showINV` option in `meritBdRow` controls whether the INV input box appears in the breakdown row. Currently set for the above four merits via `_invMerits = new Set(['Herd', 'Mentor', 'Resources', 'Retainer'])` in `sheet.js` line 651.

### The gate rule

Invested dots may be allocated to Attaché, but **only if at least 1 dot has been purchased** (i.e. `(m.cp || 0) + (m.xp || 0) >= 1`). The INV box must not appear on an Attaché row where cp+xp = 0, even if the character has Invested.

### The `fixedAt` concern

`meritBdRow(realIdx, mc, fixedAt, opts)` uses `fixedAt` to compute `effective`:
```js
const effective = (fixedAt != null) ? (total >= fixedAt ? fixedAt : 0) : total;
```

If `meritFixedRating('Attaché')` returns `1` (because the rules cache has `rating_range: [1,1]`), then `effective` would be capped at 1 regardless of `free_inv`. This would make any Invested dots invisible in the display.

**Fix:** Pass `null` as `fixedAt` for Attaché unconditionally (not `meritFixedRating(m.name)`), since Attaché is no longer a strictly 1-dot merit when Invested is in play. This makes the effective dot count display the actual total.

---

## Acceptance Criteria

- [ ] An Invictus character with `Invested` AND `Attaché (cp: 0, xp: 0)` shows NO INV box on the Attaché row
- [ ] An Invictus character with `Invested` AND `Attaché (cp: 1, xp: 0)` shows the INV box on the Attaché row
- [ ] Entering a value in the INV box saves `free_inv` on the Attaché merit
- [ ] `investedUsed(c)` includes `free_inv` from Attaché in its total
- [ ] The Invested pool alert (red/yellow) fires correctly when Attaché's `free_inv` causes an over/under-allocation
- [ ] The dot display on the Attaché row shows the total (cp + xp + free_inv), not capped at 1

---

## Implementation

### `public/js/editor/domain.js`

Add `'Attaché'` to the list in `investedUsed`:

```js
export function investedUsed(c) {
  let total = 0;
  (c.merits || []).forEach((m, i) => {
    if (!['Herd', 'Mentor', 'Resources', 'Retainer', 'Attach\u00e9'].includes(m.name)) return;
    total += (m.free_inv || 0);
  });
  return total;
}
```

### `public/js/editor/sheet.js`

**a) `showINV` condition for Attaché** (line ~660):

The current line passes `showINV: _inflHasINV && _invMerits.has(m.name)`. Change to:

```js
showINV: _inflHasINV && (_invMerits.has(m.name) || (m.name === 'Attach\u00e9' && (m.cp || 0) + (m.xp || 0) >= 1))
```

`_invMerits` itself (the Set) does not need to include Attaché — the gate condition is different for Attaché (requires first purchased dot) so it is handled separately in the expression rather than added to the set.

**b) `fixedAt` for Attaché** (same line 660 call to `meritBdRow`):

Change the third argument from `meritFixedRating(m.name)` to:

```js
m.name === 'Attach\u00e9' ? null : meritFixedRating(m.name)
```

This ensures the dot display is not capped at 1 when Invested dots are present.

The full `meritBdRow` call for non-Contacts influence merits after both changes:

```js
h += meritBdRow(
  rIdx,
  m,
  m.name === 'Attach\u00e9' ? null : meritFixedRating(m.name),
  {
    showMCI:  _inflMciPool > 0,
    showVM:   _inflHasVM  && m.name === 'Allies',
    showLK:   _inflHasLK  && m.name === 'Retainer',
    showINV:  _inflHasINV && (_invMerits.has(m.name) || (m.name === 'Attach\u00e9' && (m.cp || 0) + (m.xp || 0) >= 1)),
    attachBonus: attacheBonusDots(c, m.area ? m.name + ' (' + m.area + ')' : m.name)
  }
);
```

---

## Files to Change

| File | Change |
|---|---|
| `public/js/editor/domain.js` | Add `'Attaché'` to `investedUsed` merit list |
| `public/js/editor/sheet.js` | Extend `showINV` condition; pass `null` as `fixedAt` for Attaché |
