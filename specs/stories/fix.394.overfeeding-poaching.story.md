# Story fix.394: Overfeeding column must count poaching and rote-poach feeds

**Story ID:** fix.394
**Epic:** DT City tab fixes
**Status:** ready-for-dev
**Date:** 2026-05-19
**Issue:** [#394](https://github.com/angelusvmorningstar/TerraMortis/issues/394)
**Branch:** ms/issue-394-overfeeding-poaching

---

## User Story

As an ST reviewing the Ambience matrix, I want the Overfeeding column to count every character who fed in a territory — including poachers — so that the overfeeding penalty accurately reflects total territory pressure.

---

## Background

### The pipeline

The Overfeeding column in the Ambience matrix is built by `_buildAmbienceHtml(feedCountsByTerrId)`. The `feedCountsByTerrId` object is assembled in `renderCityOverview()` at lines 10540-10543:

```js
const feedCountsByTerrId = {};
for (const td of TERRITORY_DATA) {
  feedCountsByTerrId[td.slug] = (matrix['feeding'][td.slug] || []).length;
}
```

`matrix['feeding']` is the TAAG (Territory Actions At a Glance) matrix, populated at lines 10500-10507 for `source === 'feeding'` queue entries by iterating `entry.feedTerrs` (the character's `responses.feeding_territories` grid) and skipping only `'none'` and falsy values.

### The bug

Despite the skip condition appearing correct (it does not explicitly filter out `'poaching'`), poaching feeds do not appear in the Overfeeding count in practice. The feeding matrix cell display (O / X / O O / X X) and its footer totals use the separate `_computeMatrixFeederCounts()` → `_getSubFedTerrs()` path, which correctly includes poachers.

### The correct path already exists

`_computeMatrixFeederCounts()` (`downtime-views.js:3737`) is already described as the "single source of truth for feeder counts — used by both the matrix footer and the ambience Overfeeding column so the two can never diverge." However, it is only actually used for the matrix footer and the individual vitae panel calculation; the Overfeeding column currently reads from the TAAG `matrix['feeding']` instead.

The fix is to align `feedCountsByTerrId` with `_computeMatrixFeederCounts().byTerrId`.

### Rote-poach feeds

Rote-feed-poaching means a character has a rote project slot AND selected a poaching territory in their rote territory grid (`responses.feeding_territories_rote`). `_getSubFedTerrs()` already handles this correctly (lines 10061-10076), capping at 2 feeds per character per territory. The fix inherits this behaviour automatically.

---

## Acceptance Criteria

- [ ] A territory with both feeding-with-rights and poaching submissions shows a feeder count in the Overfeeding column that includes all feeds (rights + poaching combined).
- [ ] A territory with only poaching submissions shows a non-zero feeder count in the Overfeeding column.
- [ ] Rote-feed-poaching (rote project slot + poaching territory grid) contributes a second feed count for that territory.
- [ ] The feeding matrix cell display (O / X / O O / X X) and footer totals are unchanged.
- [ ] The -2 per-overfeed penalty formula in `buildAmbienceData()` is unchanged — only the feeder count input is corrected.

---

## Implementation

### File: `public/js/admin/downtime-views.js`

#### `feedCountsByTerrId` source in `renderCityOverview()` (lines ~10539-10544)

```js
// Before:
// Extract TAAG feeding counts so Ambience overfeeding uses the exact same numbers
const feedCountsByTerrId = {};
for (const td of TERRITORY_DATA) {
  feedCountsByTerrId[td.slug] = (matrix['feeding'][td.slug] || []).length;
}
h += _buildAmbienceHtml(feedCountsByTerrId);

// After:
// Use _computeMatrixFeederCounts as the single source of truth (includes poaching)
const { byTerrId: feedCountsByTerrId } = _computeMatrixFeederCounts();
h += _buildAmbienceHtml(feedCountsByTerrId);
```

`_computeMatrixFeederCounts().byTerrId` is already keyed by the same territory slugs (`TERRITORY_DATA` ids) that `_buildAmbienceHtml` expects, and counts all feeding statuses (rights, poaching, rote) via `_getSubFedTerrs()`.

**Note:** The comment on line 10539 ("Extract TAAG feeding counts so Ambience overfeeding uses the exact same numbers") was aspirational — the TAAG `matrix['feeding']` was supposed to match but does not include poaching. After this fix, the comment should be updated to reflect the actual source.

Update the comment:

```js
// Use _computeMatrixFeederCounts() — single source of truth for all feed types
// (feeding_rights, poaching, rote). Shared with feeding matrix footer totals.
const { byTerrId: feedCountsByTerrId } = _computeMatrixFeederCounts();
```

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-views.js` | Replace TAAG-based `feedCountsByTerrId` build (lines 10540-10543) with `_computeMatrixFeederCounts().byTerrId`. Update comment. |

No schema changes. No API changes. No CSS changes. No form changes.

---

## Dev Notes

- `_computeMatrixFeederCounts()` already iterates all non-retired characters and calls `_getSubFedTerrs()` for each — the same loop that `renderCityOverview()` already does for the TAAG matrix. There is a small performance consideration (a second pass over submissions), but at ~30 characters this is negligible.
- `_computeMatrixFeederCounts()` returns `{ byCsvKey, byTerrId, subByCharId }`. Only `byTerrId` is needed here.
- `byTerrId` is keyed by `TERRITORY_DATA` slug (e.g. `'academy'`, `'harbour'`). `_buildAmbienceHtml` / `buildAmbienceData` use `passedFeedCounts` keyed by the same slugs. Confirm with a quick search for `r.id` usage in `buildAmbienceData` if uncertain.
- Verify with DT3 data: any poaching character's territory should now show an incremented feeder count in the Overfeeding column. The Dockyards (11/4 | -14 in the screenshot) was the most overloaded territory — check that its feeder count is now accurate.
- The root cause of why `matrix['feeding']` misses poachers (despite the skip condition appearing correct) does not need to be resolved for this fix — the fix bypasses that path entirely.
