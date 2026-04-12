# Story feature.53: Ambience Change Validation and Cycle Push

## Status: done

## Story

**As an** ST processing a downtime cycle,
**I want** to confirm the projected ambience change for each territory and have that confirmed value apply automatically when the cycle is pushed,
**so that** feeding rolls use the correct post-downtime ambience and the territories update without manual intervention.

## Background

The Ambience Dashboard already calculates a projected ambience step for each territory based on entropy, overfeeding, influence spend, and project results. This projected step is informational only — it does not currently update territory documents.

**Timing rule:** Feeding happens at the START of the next game. The ambience modifier that applies to feeding rolls is the post-downtime ambience, not the current stored value. So when the ST processes feeding submissions, the vitae tally panel should use the confirmed new ambience, not `cachedTerritories`.

**Desired flow:**
1. ST resolves all ambience actions in the dashboard
2. ST clicks "Confirm" on each territory row → confirmed step saved to `currentCycle.confirmed_ambience`
3. Feeding vitae tally reads `confirmed_ambience` for the territory (falls back to `cachedTerritories` if not confirmed)
4. Push cycle wizard: new phase applies each confirmed ambience step to the territory document in MongoDB

## Acceptance Criteria

1. Each territory row in the Ambience Dashboard has a **Confirm** button. When clicked, the confirmed ambience step for that territory is saved to `currentCycle.confirmed_ambience[terrId]` (an object `{ ambience, ambienceMod }`). The button changes to show the confirmed step with a tick.
2. `confirmed_ambience` is persisted on the cycle document via `updateCycle(cycleId, { confirmed_ambience: {...} })`.
3. The full `confirmed_ambience` object is maintained — confirming one territory does not clear others. Each territory is confirmed independently.
4. The feeding vitae tally panel (`_renderFeedRightPanel`) reads ambience from `currentCycle.confirmed_ambience[terrId]` when available, falling back to `cachedTerritories` then `TERRITORY_DATA`.
5. `AMBIENCE_MODS` lookup is exported from `downtime-data.js` (moved from `city-views.js`) so both `city-views.js` and `downtime-views.js` can derive `ambienceMod` from a confirmed level.
6. Push cycle wizard gains a new phase **`ambience`** (between `tracks` and `open-game`) that:
   - Reads `cycle.confirmed_ambience`
   - For each confirmed territory, calls `apiPost('/api/territories', { id: terrId, ambience, ambienceMod })`
   - Sets `cachedTerritories = null` after completion so next render reloads from DB
   - If `confirmed_ambience` is empty or absent, the phase completes immediately with detail "No changes"
7. `RESET_PHASES` gains `{ id: 'ambience', label: 'Apply ambience changes' }` between `tracks` and `open-game`.
8. Confirmed territories are visually distinguished in the dashboard row (gold text / tick icon on the Confirm button).

## Tasks / Subtasks

- [x] Task 1: Export `AMBIENCE_MODS` from `downtime-data.js` (AC: 5)
  - [x] Added `export const AMBIENCE_MODS` to `downtime-data.js`
  - [x] `city-views.js`: removed local declaration, imports from `../player/downtime-data.js`
  - [x] `downtime-views.js`: `AMBIENCE_MODS` added to existing import

- [x] Task 2: Add Confirm button to each Ambience Dashboard territory row (AC: 1, 2, 3, 8)
  - [x] `<th>Confirm</th>` column added to dashboard table header
  - [x] Each row renders: confirmed → gold tick + step + Re-confirm button; unconfirmed → Confirm button with `data-terr-id`, `data-proj-step`, `data-proj-mod`
  - [x] `renderProcessingMode`: `.proc-amb-confirm-btn` click handler — spreads existing `confirmed_ambience`, calls `updateCycle`, updates `currentCycle`, re-renders

- [x] Task 3: Update feeding vitae tally to use confirmed ambience (AC: 4)
  - [x] `_renderFeedRightPanel`: reads `currentCycle?.confirmed_ambience?.[normalizedTerrId]` first; falls back to `terrRec?.ambienceMod`

- [x] Task 4: Push cycle ambience phase (AC: 6, 7)
  - [x] `RESET_PHASES`: `{ id: 'ambience', label: 'Apply ambience changes' }` added between `tracks` and `open-game`
  - [x] `runWizardPhases`: ambience phase iterates `currentCycle.confirmed_ambience` entries, POSTs each to `/api/territories`, sets `cachedTerritories = null`; empty confirmed_ambience → "No changes"

## Dev Notes

### `currentCycle` in `downtime-views.js`
Module-level `let currentCycle = null`. Updated when a cycle is selected. `confirmed_ambience` is stored as a plain object on the cycle doc — no schema enforcement on the cycles collection.

### `confirmed_ambience` shape
```js
{
  academy:    { ambience: 'Curated', ambienceMod: 3 },
  harbour:    { ambience: 'Neglected', ambienceMod: -3 },
  northshore: { ambience: 'Tended', ambienceMod: 2 },
  // ...only confirmed territories listed
}
```

### Timing of `normalizedTerrId` in `_renderFeedRightPanel`
`normalizedTerrId` is already computed (TERRITORY_SLUG_MAP lookup from `entry.primaryTerr`). This gives us the territory id (e.g. `'harbour'`) which is the same key used in `confirmed_ambience`.

### `projMod` in confirm button dataset
The projected step's mod is derived from `AMBIENCE_MODS[projStep]` at render time. Store it in `data-proj-mod` so the click handler doesn't need to re-derive.

### Rollback
The ambience phase applies territory saves. If it fails mid-way, partial saves remain. This is acceptable — the ST can correct via the manual ambience override added in feature.52. Full rollback of territory documents is out of scope.

### No change to `buildAmbienceData`
The projected step is already computed in `buildAmbienceData`. The confirm button just freezes that projection into `confirmed_ambience`.

### Key files

| File | Change |
|------|--------|
| `public/js/player/downtime-data.js` | Export `AMBIENCE_MODS` |
| `public/js/admin/city-views.js` | Import `AMBIENCE_MODS` from downtime-data |
| `public/js/admin/downtime-views.js` | Import `AMBIENCE_MODS`; dashboard confirm button; vitae tally fix; push phase |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-12 | 1.0 | Initial draft | Amelia (claude-sonnet-4-6) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- `AMBIENCE_MODS` moved to `downtime-data.js` as shared export; removed from `city-views.js` local declaration
- Confirm column added to Ambience Dashboard table; confirmed rows show gold tick + Re-confirm; unconfirmed show Confirm button
- Click handler updates `currentCycle.confirmed_ambience` in memory and persists via `updateCycle`
- `_renderFeedRightPanel` vitae tally prefers `confirmed_ambience[normalizedTerrId].ambienceMod` over `cachedTerritories`
- Push cycle wizard gains `ambience` phase (between `tracks` and `open-game`) that applies confirmed values to territory documents

### File List
- `public/js/player/downtime-data.js`
- `public/js/admin/city-views.js`
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
