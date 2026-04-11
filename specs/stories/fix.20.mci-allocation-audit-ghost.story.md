# Story Fix.20: MCI Allocation Audit — Remove Ghost Hard Error

## Status: ready-for-dev

## Story

**As an** ST viewing a character with an MCI set up before the pool migration,
**I want** the "MCI not properly allocated" error to not fire,
**so that** characters with valid pool-based MCI allocations don't show false red error badges.

## Background

The `mci_unallocated` audit gate in `audit.js` (~line 175–205) checks that every MCI tier has a fully-specified `tier_grants` entry:

```js
const checkMeritTier = (tier) => {
  const g = tgByTier.get(tier);
  if (!g || !g.name) { missingTiers.push(tier); return; }  // ← requires tier_grants entry
  ...
};
```

If any active tier is missing a `tier_grants` record, it is pushed to `missingTiers` and a **hard error** is raised:

```js
errors.push({
  gate: 'mci_unallocated',
  message: `MCI not properly allocated (tiers ...)`,
  ...
});
```

### Why this is now wrong

The current MCI system is **pool-based**: `applyDerivedMerits` computes a total dot pool from the MCI's rating and `dotN_choice` values, and the ST allocates `free_mci` dots from that pool to whichever merits they choose. The `tier_grants` array is optional metadata — it records which merit is associated with which tier for display, but it is not required for the pool to function.

Characters whose MCI was configured before the pool migration have no `tier_grants` entries at all. The auto-map in `applyDerivedMerits` (lines 53–85) will try to build `tier_grants` from existing `free_mci` allocations if absent, but only does so once (when `mci.tier_grants` doesn't exist). If the character was saved after the auto-map ran, `tier_grants` may be partially populated or still empty.

The audit check is enforcing an old architectural requirement that no longer applies.

### Correct validation for pool-based MCI

What SHOULD be validated:
- The total `free_mci` dots allocated across all merits and styles does not exceed `mciPoolTotal(mci)`
- That is already checked indirectly by the MCI display (the pool counter goes red when over-allocated)
- The `dotN_choice` fields are set for tiers that offer a choice (tier 1, 3, 5 when at that rating) — this is useful

What should NOT be validated:
- Whether `tier_grants` entries exist for each tier

## Acceptance Criteria

1. Eve's MCI (and all other pre-migration MCIs) no longer show a red error badge for `mci_unallocated`
2. Over-allocation of the `free_mci` pool is still visible (existing pool counter UI)
3. The `dotN_choice` completeness check (tier 1/3/5 needing a choice set) is retained as a **warning**, not a hard error

## Tasks / Subtasks

- [ ] In `public/js/data/audit.js`, remove the entire `mci_unallocated` push block and its `missingTiers` logic (~lines 176–205):
  - Delete `const missingTiers = []`, all `checkMeritTier` calls, and the `if (missingTiers.length) errors.push(...)` block
  - Keep the `mci_tier_over` check (lines 167–172) — over-budget tier grants are still a real error

- [ ] **Recommended**: add a softer **warning** for unconfigured `dotN_choice` fields (removing `mci_unallocated` leaves no signal at all for MCI misconfiguration):
  ```js
  // Warn if dotN_choice tiers are reached but the choice field is blank
  if (rating >= 1 && !m.dot1_choice) warnings.push({ gate: 'mci_choice', message: `MCI${cultLbl}: dot 1 choice not set` });
  if (rating >= 3 && !m.dot3_choice) warnings.push({ gate: 'mci_choice', message: `MCI${cultLbl}: dot 3 choice not set` });
  if (rating >= 5 && !m.dot5_choice) warnings.push({ gate: 'mci_choice', message: `MCI${cultLbl}: dot 5 choice not set` });
  ```
  (These are warnings only — a missing choice defaults to `'merits'` already in the pool logic.)

## Dev Notes

- The `mci_tier_over` gate (checks `g.rating > budget`) is still valid and must be kept.
- `mciPoolTotal` and `getMCIPoolUsed` handle pool balance display; removing the audit gate does not affect them.
- This is a one-block deletion in `audit.js` — minimal risk.

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
