# Story fix.393: Recalculate Territories button must not write to MongoDB

**Story ID:** fix.393
**Epic:** DT City tab fixes
**Status:** ready-for-dev
**Date:** 2026-05-19
**Issue:** [#393](https://github.com/angelusvmorningstar/TerraMortis/issues/393)
**Branch:** ms/issue-393-recalculate-ambience-mutation

---

## User Story

As an ST recalculating the Ambience matrix mid-cycle, I want the "Recalculate Territories" button to refresh the display only — so that the Starting ambience values are not permanently overwritten before I am ready to confirm end-of-cycle.

---

## Background

### The bug

The "Recalculate Territories" button in the Ambience section of the DT City tab is wired to `_applyProjectedAmbience(false)` (line 10676), which:

1. Fetches all territory records from the API.
2. Runs `buildAmbienceData()` to compute projected ambience.
3. Issues `apiPut(/api/territories/:id)` for **every** territory, writing `r.projStep` (projected end-of-cycle value) into each territory's `ambience` field.

This is identical to the end-of-cycle write path (`handleApplyAmbience` → `_applyProjectedAmbience(true)`), except for the `markApplied` flag. After clicking Recalculate, the territory `ambience` field (used as the "Starting" column in the matrix) is permanently advanced. Clicking the button multiple times during a cycle compounds the drift.

### The intended behaviour

The button should be a **display refresh only**: re-read current feeding/project data, re-run `buildAmbienceData()`, re-render the matrix. No MongoDB writes.

### End-of-cycle write paths (do NOT touch)

- Individual "Confirm [Ambience]" buttons per territory row: `apiPatch` on `cycle.confirmed_ambience` — correct, unaffected.
- "Apply Ambience" action: `handleApplyAmbience()` → `_applyProjectedAmbience(true)` — correct, unaffected.

---

## Acceptance Criteria

- [ ] Clicking "Recalculate Territories" does not alter any territory document's `ambience` field in MongoDB.
- [ ] The Ambience matrix re-renders after clicking (display refresh still works).
- [ ] The "Starting" column values are identical before and after clicking "Recalculate Territories".
- [ ] The end-of-cycle "Apply Ambience" path (`handleApplyAmbience` → `_applyProjectedAmbience(true)`) is unaffected.
- [ ] Individual per-territory "Confirm" buttons continue to write correctly.

---

## Implementation

### File: `public/js/admin/downtime-views.js`

#### `.city-amb-recalc-btn` click handler (line ~10674)

```js
// Before:
el.querySelector('.city-amb-recalc-btn')?.addEventListener('click', async e => {
  e.stopPropagation();
  await _applyProjectedAmbience(false);
  renderCityOverview();
});

// After:
el.querySelector('.city-amb-recalc-btn')?.addEventListener('click', e => {
  e.stopPropagation();
  renderCityOverview();
});
```

Remove `await _applyProjectedAmbience(false)` entirely. `renderCityOverview()` already re-runs `buildAmbienceData()` from the current in-memory state and re-renders the full matrix — no separate recalculation step is needed.

If there is any concern about stale territory data (e.g., another ST changed ambience externally), a territory refresh could be added before `renderCityOverview()`:

```js
el.querySelector('.city-amb-recalc-btn')?.addEventListener('click', async e => {
  e.stopPropagation();
  try { cachedTerritories = await apiGet('/api/territories'); } catch { /* use cached */ }
  renderCityOverview();
});
```

This reads territory data fresh from the API (updating `cachedTerritories`) but writes nothing. This is the safer option and is recommended.

#### Button tooltip update (line ~10535)

Update the button's `title` attribute to match its actual behaviour:

```js
// Before:
h += `<button class="city-amb-recalc-btn dt-btn-sm" title="Write projected ambience to all territory records now">Recalculate Territories</button>`;

// After:
h += `<button class="city-amb-recalc-btn dt-btn-sm" title="Refresh matrix from current feeding and project data">Recalculate Territories</button>`;
```

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-views.js` | Remove `_applyProjectedAmbience(false)` from `.city-amb-recalc-btn` handler; optionally replace with territory cache refresh; update button tooltip. |

No schema changes. No API changes. No CSS changes.

---

## Dev Notes

- `_applyProjectedAmbience(false)` and `_applyProjectedAmbience(true)` differ only in the `markApplied` flag. Both write to MongoDB. Neither should be called from the Recalculate button.
- `renderCityOverview()` already calls `buildAmbienceData()` internally, so removing the `_applyProjectedAmbience` call does not affect the calculation — it only removes the write side-effect.
- The territory cache refresh option (`cachedTerritories = await apiGet(...)`) is lightweight and avoids any risk of showing stale starting values if a Confirm button was clicked earlier in the session.
- Verify by opening DT City tab mid-cycle, noting Starting ambience values, clicking Recalculate, and confirming the Starting column is unchanged.
