# Story Fix.5: MCI Free Merit Dots — Pool Allocation (Lorekeeper/VM Pattern)

## Status: done

## Story

**As an** ST editing a character with Mystery Cult Initiation,
**I want** MCI's free merit dots to be a pool I can allocate freely across any merit,
**so that** MCI works like Lorekeeper or Viral Mythology — a running total of free dots I distribute by entering numbers directly on each merit, rather than selecting specific merits from per-tier dropdowns.

## Background

### Current behaviour

The MCI editor shows a per-tier merit picker at each dot level using `_tierPicker(tier)` (sheet.js:692–710). For each tier that grants merit dots, the ST selects a specific merit from a dropdown (e.g., "Allies for tier 2"). `applyDerivedMerits()` then auto-sets `free_mci` on those specific merits and clears it on all others each render cycle.

This is a rigid, per-slot assignment. The free dots are not allocatable freely — they are locked to the tier where they were assigned.

### New behaviour

MCI should work exactly like Lorekeeper and Viral Mythology:

- MCI's total merit dots become a **single free pool** (same total as now — `mciPoolTotal(mci)`)
- The ST allocates from this pool by entering a number in the **MCI field** on any merit's breakdown row
- The MCI breakdown field (labelled "MCI", `free_mci`) shows on ALL merits in ALL categories (general, influence, domain) when the pool is > 0
- The pool counter ("MCI: X / Y used") shows in the merit section header
- No per-tier merit dropdowns

### Existing infrastructure that stays unchanged

| Element | Stays the same |
|---------|----------------|
| `mciPoolTotal(mci)` in mci.js | Total merit dot calculation from tier choices — unchanged |
| `getMCIPoolUsed(c)` in mci.js | Sums `free_mci` across all merits + fighting styles — unchanged |
| `meritBdRow()` in xp.js | Already has `showMCI` flag and `free_mci` input rendering — no change |
| `shEditMeritPt()` in edit.js | Already handles `free_mci` edits; needs capping added |
| MCI tier choice buttons (tiers 1, 3, 5) | Skill speciality / skill dot / advantage choices remain — only the merit dropdown portion is removed |

### What changes

| Element | Change |
|---------|--------|
| `_tierPicker()` in sheet.js | **Removed** — no more per-tier merit selection dropdowns |
| MCI tier_grants auto-allocation block in mci.js | **Removed** — `free_mci` on merits is no longer cleared and reapplied per render |
| `showMCI` flag in general merits | **Always enabled** when MCI pool > 0 (currently gated by `_mciHasTiers`) |
| 'any' pool counter in `_renderPoolCounters()` | **Shows in all merit sections**, not just 'general' |
| `shEditMeritPt()` free_mci capping | **Added** — prevent over-allocation beyond pool total |

### Data migration

Existing characters have `tier_grants` on their MCI merits, and their target merits have `free_mci` set from those tier grants. After this change:
- `tier_grants` on MCI merits are left in place but ignored by all code
- The `free_mci` values already on merits persist (they become the starting allocation, no longer auto-cleared)
- No data migration script needed

## Acceptance Criteria

1. The MCI block in the editor shows no per-tier merit selection dropdowns — merit-granting tiers show a label only (e.g., "1 dot → merit pool")
2. The tier choice buttons at dots 1, 3, 5 (Specialisation / Skill Dot / Advantage vs merit pool) remain; only the `_tierPicker()` dropdown is removed from the merit option
3. A "MCI" numeric input appears on every merit's breakdown row (general, influence, domain) when the character's MCI pool total > 0
4. The pool counter shows the total pool and how many dots are used: `MCI: 3 / 7 used`
5. Entering a number in a merit's MCI field is capped so the total allocation across all merits cannot exceed `mciPoolTotal(allActiveMCIs)`
6. Saving the character persists the `free_mci` values on merits directly (no auto-clear on next render)
7. View mode (non-edit) shows the MCI block with merit-pool tiers labelled as "X merit dot(s)" and the total pool allocated, rather than showing specific tier-grant merit names
8. Characters with existing `tier_grants` data see their `free_mci` values preserved and editable after the change

## Tasks / Subtasks

- [x] Task 1: Remove tier_grants auto-allocation from `applyDerivedMerits()` in `mci.js` (lines 147-205)
  - [x] Delete the entire block starting at `// ── MCI tier_grants auto-allocation ──` through the closing `}` of the second pass loop (~line 205)
  - [x] This includes: `_hasTierGrants` check, the broad `free_mci = 0` clear, the targeted clear, and the second-pass tier_grants apply loop
  - [x] The `c._grant_pools.push(...)` for the `'any'` category pool (line 143-145) is **kept** — pool counter still needs to know the total
  - [x] The `mciPoolTotal()` calculation at line 142 is **kept** for the same reason

- [x] Task 2: Remove `_tierPicker()` and update the MCI block edit-mode rendering in `sheet.js` `_renderMCI()` (lines 692-753)
  - [x] Delete the `_tierPicker` function definition (lines 692-710)
  - [x] Delete the `_tg`, `_MCI_TIER_BUDGET`, `_tierGrant` variables (lines 689-691) — no longer needed
  - [x] For each tier row in the `for (let d = 0; d < 5 && d < eDots; d++)` loop, replace the `_tierPicker(tier)` call with a static label:
    - Tier 2 (d=1): replace `_tierPicker(2)` with nothing (the "1 merit dot" text remains)
    - Tier 4 (d=3): replace `_tierPicker(4)` with nothing (the "3 merit dots" text remains)
    - Tier 1 (d=0): when `d1c === 'merits'`, remove `_tierPicker(1)` call — just show the button row, no dropdown
    - Tier 3 (d=2): when `d3c === 'merits'`, remove `_tierPicker(3)` call — just show the button row, no dropdown
    - Tier 5 (d=4): when `d5c === 'merits'`, remove `_tierPicker(5)` call — just show the button row, no dropdown
  - [x] Update the pool display line (line 753): remove `autoAlloc` and `manualRemain` — just show:
    ```js
    if (pool > 0) h += '<div class="mci-pool-row"><span class="mci-pool-lbl">Merit Pool</span><span class="mci-pool-val">' + pool + ' dot' + (pool === 1 ? '' : 's') + ' — allocate via MCI field on each merit</span></div>';
    ```
  - [x] Delete the `autoAlloc` and `manualRemain` variables (line 751-752) — no longer meaningful

- [x] Task 3: Update MCI view mode (non-edit) in `_renderMCI()` (lines 754-767)
  - [x] Delete `_tg2` and `_tierLabel` variables (lines 756-757) — tier_grants no longer displayed
  - [x] Replace tier-grant label logic per `d`: for merit-pool tiers, replace `_tierLabel(tier)` with a plain label:
    - d=1 (tier 2): `txt = '1 merit dot'`
    - d=3 (tier 4): `txt = '3 merit dots'`
    - d=0 tier merits: `txt = '1 merit dot'`
    - d=2 tier merits: `txt = '2 merit dots'`
    - d=4 tier merits: `txt = '3 merit dots'`

- [x] Task 4: Enable `showMCI` on general merits unconditionally in `shRenderGeneralMerits()` (sheet.js ~line 847)
  - [x] Removed the `_mciHasTiers` module-level variable declaration and its assignment in `_renderSheet()`
  - [x] Removed the `_mciHasTiers ? 0 :` guard from all five pool computations: `_inflMciPool`, `_domMciPool`, `_standMciPool`, `_genMciPool`, and `mciPool` in the manoeuvres section

- [x] Task 5: Show 'any' pool counter in all merit sections in `_renderPoolCounters()` (sheet.js ~line 84)
  - [x] Changed `anyPools` to show in all categories, not just `'general'`
  - [x] MCI pool counter now appears in influence and domain merit section headers as well

- [x] Task 6: Add `free_mci` capping in `shEditMeritPt()` (edit.js ~line 719)
  - [x] Pre-existing: capping already implemented at lines 741-746 in edit.js using `mciPoolTotal` and `getMCIPoolUsed` (both already imported from `./mci.js`). No change needed.

## Dev Notes

### Architecture
- No test framework. Verify in-browser manually.
- The `tier_grants` array on MCI merits remains on the character objects — it is simply never read by any code after this change. No cleanup of existing data is needed.
- `free_mci` values on merits are now the sole source of truth for MCI allocation. They persist to the DB on save and are NOT reset on render.
- `shEditMCITierGrant()` and `shEditMCITierQual()` in `edit-domain.js` become dead code (no longer called from the UI). They can be left in place or removed; do not remove them if it risks merge conflicts.
- `buildMCIGrantOptions()` in `merits.js` becomes dead code. Leave it unless the file size warrants cleanup.

### Checking imports in edit.js
Before writing the `free_mci` capping in Task 6, check the top of `edit.js` for existing imports of `mciPoolTotal` and `getMCIPoolUsed` from `../editor/mci.js`. If already imported, use them directly — no new import needed.

### Influence and domain `showMCI` flag
The existing `shRenderInfluenceMerits()` and `shRenderDomainMerits()` already pass `showMCI` to `meritBdRow()`. Verify that `_inflMciPool` and `_domMciPool` in those functions are computed from `mciPoolTotal()` (not gated by `_mciHasTiers`). If they reference `_mciHasTiers`, remove that gate.

### Manual verification
- Character with MCI 3, no tier_grants: Merit Pool shows 3 dots; MCI input visible on all merits; entering values allocates freely; saving preserves allocations
- Character with MCI 4, existing tier_grants and free_mci on Allies/Contacts: After update, those free_mci values remain; MCI inputs show on those merits; pool counter is correct; no auto-reset on page reload
- MCI block in view mode: merit-granting tiers show "1 merit dot", "3 merit dots" etc. — no "(unassigned)" labels
- Over-allocation: trying to enter more than the pool in a single merit is capped; splitting across multiple merits respects the total
- Characters without MCI: no MCI field visible on any merit; no pool counter

---

## Dev Agent Record

### Implementation Plan

Three files changed; no new imports needed.

1. **Task 1 — mci.js**: Removed the entire `// ── MCI tier_grants auto-allocation ──` block (59 lines). Kept the `mciPoolTotal` calculation and `c._grant_pools.push()` for the 'any' pool counter. `free_mci` on merits is now the sole source of truth — it persists to the DB and is never auto-cleared.

2. **Task 2 — sheet.js `_renderMCI()` edit mode**: Removed `_tg`, `_MCI_TIER_BUDGET`, `_tierGrant`, and `_tierPicker` variables/function. Removed all `_tierPicker(N)` calls from the tier loop — the choice buttons (Specialisation/1 Merit, Skill Dot/2 Merits, Advantage/3 Merits) remain; only the merit dropdown below them is gone. Simplified pool display to a plain label: "N dots — allocate via MCI field on each merit".

3. **Task 3 — sheet.js `_renderMCI()` view mode**: Removed `_tg2` and `_tierLabel`. Replaced `_tierLabel(N)` calls with static strings: '1 merit dot' (tiers 1/2), '2 merit dots' (tier 3), '3 merit dots' (tiers 4/5).

4. **Task 4 — sheet.js `_mciHasTiers`**: Removed the module-level `let _mciHasTiers = false` declaration and its assignment in `_renderSheet()`. Removed `_mciHasTiers ? 0 :` guard from all five pool computations across influence, domain, standing, general, and manoeuvres sections.

5. **Task 5 — sheet.js `_renderPoolCounters()`**: Changed `anyPools` from `category === 'general' ? ... : []` to unconditional filter. MCI pool counter now shows in all merit section headers.

6. **Task 6 — edit.js**: Pre-existing. `free_mci` capping already present at lines 741-746.

### Debug Log

- `buildMCIGrantOptions` import in sheet.js is now unused (no longer called by `_tierPicker`). Left in place per story guidance on dead code.
- The "Auto-map free_mci → tier_grants" block (mci.js lines 53-85) is left intact. It creates `tier_grants` from existing `free_mci` for MCIs without `tier_grants`, but since the new code never reads `tier_grants` for allocation, this is harmless noise.
- `shEditMCITierGrant()` and `shEditMCITierQual()` in `edit-domain.js` are now dead code (no longer called from UI). Left in place.

### Completion Notes

- **Task 1**: tier_grants auto-allocation block removed from `applyDerivedMerits()`. `free_mci` values on merits now persist across renders.
- **Tasks 2/3**: `_tierPicker` and `_tierLabel` removed from `_renderMCI()` edit and view modes. MCI block shows choice buttons only; merit pool tiers show plain text labels.
- **Task 4**: `_mciHasTiers` removed entirely. MCI input (`showMCI`) now appears on all merit categories whenever the pool is > 0.
- **Task 5**: MCI pool counter now shows in general, influence, and domain merit section headers.
- **Task 6**: Pre-existing capping in `shEditMeritPt()` confirmed correct.

## File List

- `public/js/editor/mci.js`
- `public/js/editor/sheet.js`

## Change Log

- Remove tier_grants auto-allocation block from `applyDerivedMerits()`; `free_mci` on merits is now the allocatable pool (2026-04-10)
- Remove `_tierPicker()` from `_renderMCI()` edit mode; remove `_tierLabel()` from view mode; simplify pool display (2026-04-10)
- Remove `_mciHasTiers` and its gate from all merit section pool computations (2026-04-10)
- Show MCI 'any' pool counter in all merit sections, not just general (2026-04-10)
- Confirmed `free_mci` capping in `shEditMeritPt()` (edit.js) pre-existing; no change needed (2026-04-10)
