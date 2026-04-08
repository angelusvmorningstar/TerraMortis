# Story PP.12: MCI Per-Tier Merit Allocation Tracking

## Status: Ready for Review

## Story

**As an** ST editing a character's Mystery Cult Initiation,
**I want** to select which specific merits are granted at each MCI tier directly in the per-dot UI,
**so that** the allocation is explicitly tracked per tier, visible in both editor and player views, and the free_mci pool is auto-allocated instead of requiring manual distribution.

## Background

MCI currently uses a flat pool system: each tier that grants merit dots contributes to a shared pool (`free_mci`), and the ST manually distributes those dots across merits. This means:
- No record of which tier granted which merit
- Player view shows allocated merits but not their source tier
- Adding/removing an MCI dot doesn't automatically adjust merit allocations
- The ST must separately navigate to the merit section to allocate MCI dots

This story adds per-tier merit selection inline in the MCI editor UI, auto-manages `free_mci` on target merits, and displays the tier breakdown in the player view.

## Dependencies

- PP.9/PP.10 must be complete (v3 inline creation tracking on merits)

## Acceptance Criteria

1. Each MCI tier that grants merit dots (dot 1 if "merits" chosen, dot 2 always, dot 3 if "merits", dot 4 always, dot 5 if "merits") shows an inline merit picker below the choice
2. The merit picker offers a dropdown of eligible merits filtered by rating (dot budget for that tier: 1, 1, 2, 3, 3) and prerequisites
3. Selected merits are stored on the MCI merit object in a `tier_grants` array: `[{ tier, name, category, rating, qualifier? }]`
4. When a tier merit is selected, `free_mci` on the target merit is auto-updated (no manual pool allocation needed for tier-assigned merits)
5. Existing manual `free_mci` pool allocation still works for unassigned pool dots (backwards compatible)
6. Tier grants that exceed the tier's dot budget are rejected (e.g. can't assign a 3-dot merit to tier 1 which only grants 1 dot)
7. Changing a tier choice from "merits" to "speciality"/"skill"/"advantage" clears that tier's grants and deallocates `free_mci`
8. Player view (suite/sheet.js) shows per-tier breakdown under each MCI:
   ```
   Mystery Cult Initiation  ●●●●●  (Cult of the Black Sun)
     Tier 1: Contacts (Underworld) ●
     Tier 2: Allies (Finance) ●
     Tier 3: Air of Menace ●●
     Tier 4: Resources ●●●
     Tier 5: Safe Place ●●●
   ```
9. Editor view shows the same breakdown with editable dropdowns per tier
10. Schema updated: `tier_grants` array added to merit definition
11. Migration: existing `benefit_grants` data (if present) mapped into `tier_grants` format
12. Audit module (`audit.js`) validates tier grant totals don't exceed tier budgets

## Tasks / Subtasks

- [x] Task 1: Schema and data model (AC: 10, 11)
  - [x] Add `tier_grants` to merit definition in `character.schema.js`: `{ type: 'array', items: { type: 'object', properties: { tier: integer 1-5, name: string, category: string, rating: integer, qualifier: string|null }, required: ['tier', 'name', 'category', 'rating'] } }`
  - [x] Write migration in `applyDerivedMerits()` (mci.js): if MCI has `benefit_grants` but no `tier_grants`, convert `benefit_grants[i]` to `tier_grants` entries with tier = i+1. Skip null entries (some tiers may be unassigned in legacy data).
  - [x] Verify schema validation passes for both new and migrated data

- [x] Task 2: Auto-allocation engine (AC: 4, 5, 7)
  - [x] In `applyDerivedMerits()` (mci.js), after computing MCI pools:
    - For each active MCI, iterate `tier_grants`
    - For each grant, find the target merit in `c.merits` by name + category + qualifier
    - Set `free_mci` on target merit to the grant's rating
    - Track total auto-allocated dots
  - [x] Remaining pool (total pool - auto-allocated) stays available for manual `free_mci` allocation
  - [x] When a tier choice changes away from "merits", remove matching `tier_grants` entries and clear their `free_mci`

- [x] Task 3: Editor per-tier merit picker UI (AC: 1, 2, 6, 9)
  - [x] In `_renderMCI()` (sheet.js), for each tier that grants merit dots:
    - Below the choice buttons, render a merit dropdown (reuse `buildMCIGrantOptions` pattern)
    - Filter by: rating range includes tier budget, prerequisites met, not a standing merit
    - Show current selection if `tier_grants` has an entry for this tier
    - Include qualifier input for merits that need one (Allies area, Contacts sphere, etc.)
  - [x] Add handler `shEditMCITierGrant(standIdx, tier, meritName, qualifier)` in edit-domain.js
    - Creates/updates `tier_grants` entry for the given tier
    - Finds or creates the target merit in `c.merits` (with inline creation defaults)
    - Re-renders sheet to reflect changes
  - [x] Validate: tier grant rating ≤ tier budget (1 for dots 1-2, 2 for dot 3, 3 for dots 4-5)

- [x] Task 4: Player view per-tier display (AC: 8)
  - [x] In `suite/sheet.js`, replace flat `mci-grants` block with per-tier display
  - [x] For each MCI, iterate tiers 1-5:
    - If tier choice is speciality/skill/advantage, show that (already shown)
    - If tier choice is merits AND `tier_grants` has entries for this tier, show "Tier N: Merit Name ●●"
    - If tier choice is merits but no `tier_grants`, show "Tier N: (unassigned)" dimmed
  - [x] Non-merit tiers (speciality, skill, advantage) continue to display as before

- [x] Task 5: Audit integration (AC: 12)
  - [x] In `public/js/data/audit.js`, add gate `mci_tier_over`: check each tier_grant doesn't exceed its budget
  - [x] Add gate `mci_unassigned`: warn if merit-choice tiers have no tier_grants (pool dots unassigned to tiers)

- [x] Task 6: Remove/update flat pool display
  - [x] Remove the flat `mci-grants` block from suite/sheet.js (replaced by per-tier in Task 4)
  - [x] Update pool counter in editor to show "X auto-assigned + Y manual" breakdown
  - [x] Ensure `getMCIPoolUsed()` still counts both tier-assigned and manually allocated `free_mci`

## Dev Notes

### Tier dot budgets (constant — reuse `_DOT_RATING` in `edit-domain.js`)

| Tier | Dot 1 | Dot 2 | Dot 3 | Dot 4 | Dot 5 |
|------|-------|-------|-------|-------|-------|
| Grants | 1 (if merit) | 1 (always) | 2 (if merit) | 3 (always) | 3 (if merit) |
| Max merit rating | 1 | 1 | 2 | 3 | 3 |

### tier_grants data shape

```json
"tier_grants": [
  { "tier": 1, "name": "Contacts", "category": "influence", "rating": 1, "qualifier": "Underworld" },
  { "tier": 2, "name": "Allies", "category": "influence", "rating": 1, "qualifier": "Finance" },
  { "tier": 3, "name": "Air of Menace", "category": "general", "rating": 2 },
  { "tier": 4, "name": "Resources", "category": "influence", "rating": 3 },
  { "tier": 5, "name": "Safe Place", "category": "domain", "rating": 3 }
]
```

### Auto-allocation vs manual pool

After auto-allocation from `tier_grants`, any remaining pool dots (e.g. tier grants only use 8 of 10 available dots) can still be manually allocated via the existing `free_mci` controls on individual merits. The `getMCIPoolUsed()` function already sums all `free_mci` across merits — it doesn't care whether the dots came from tier assignment or manual allocation.

### Reusable patterns

- **Merit dropdown**: `buildMCIGrantOptions(c, dotLevel, currentName)` in merits.js already filters merits by rating and prerequisites for a given dot level. Reuse this for tier pickers.
- **Contacts per-dot UI**: `sheet.js` lines 526-545 show a per-dot dropdown pattern (sphere selection per Contacts dot). Similar UI pattern for per-tier merit selection.
- **Choice button pattern**: MCI dots 1, 3, 5 already have toggle buttons (`mci-choice-btn`). The merit picker appears below the active choice when "merits" is selected.

### Qualifier handling

Some merits need a qualifier to be meaningful:
- Allies: `area` field (e.g. "Finance", "Underworld") — show sphere dropdown
- Contacts: adds to shared Contacts pool — no qualifier needed
- Status: `area` field — show sphere dropdown
- Most general merits: optional `qualifier` text input

The tier grant should store `qualifier` when applicable, and the picker should show the appropriate input.

### Edge cases

- **Multiple MCIs**: A character can have multiple MCI merits (different cults). Each has its own `tier_grants`. Auto-allocation should not cross-contaminate.
- **Rating change**: If MCI rating drops (e.g. from 5 to 3), tier_grants for tiers 4-5 should be cleared and their `free_mci` deallocated.
- **Merit already exists**: If the tier grant targets a merit the character already owns, add `free_mci` dots to the existing merit. If the merit doesn't exist, create it with `addMerit()`.
- **Merit removed**: If a target merit is removed from the character, the tier_grant becomes orphaned. `applyDerivedMerits` should handle this gracefully (skip orphaned grants, show warning).

### Testing

- Create character with MCI 5 dots, all merit choices → verify 10-dot pool
- Assign merits per tier → verify `free_mci` auto-allocated correctly
- Change dot 3 from "merits" to "skill" → verify tier 3 grants cleared, `free_mci` updated
- Drop MCI from 5 to 3 → verify tier 4-5 grants cleared
- Player view → verify per-tier breakdown displayed correctly
- Multiple MCIs → verify grants don't cross-contaminate
- Audit → verify tier over-budget and unassigned warnings
- Backwards compat: character with existing manual `free_mci` allocations (no `tier_grants`) → verify merits and pool totals still work correctly

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-08 | 1.0 | Initial story creation | Claude Opus 4.6 |
| 2026-04-08 | 2.0 | Implementation complete — all 6 tasks | Claude Opus 4.6 |

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- benefit_grants → tier_grants migration added to applyDerivedMerits
- Auto-allocation clears tier-targeted free_mci before re-applying (prevents stacking on re-render)
- buildMCIGrantOptions reused for tier picker filtering
- Player view shows per-tier breakdown with dots, including non-merit choices (spec/skill/advantage)

### Completion Notes List
- Schema: `tier_grants` array added to merit definition with tier, name, category, rating, qualifier
- Migration: benefit_grants auto-converted to tier_grants in applyDerivedMerits (runs on every load)
- Auto-allocation: tier_grants drive free_mci on target merits; merits created if not found; stale allocations cleared per render cycle
- Editor: per-tier merit dropdown appears below each merit-choice tier; qualifier input for Allies/Status; pool counter shows "X assigned, Y manual"
- Player view: per-tier breakdown under each MCI showing tier dots, merit name, and dots; non-merit choices (spec/skill/advantage) shown inline
- Audit: mci_tier_over (error if grant exceeds budget), mci_unassigned (warning for empty merit tiers)
- Choice change: switching from merits to speciality/skill/advantage clears that tier's grants

### File List
- `server/schemas/character.schema.js` — tier_grants added to merit definition
- `public/js/editor/mci.js` — benefit_grants migration, tier auto-allocation engine
- `public/js/editor/sheet.js` — per-tier merit picker in _renderMCI, read-only tier display
- `public/js/editor/edit-domain.js` — shEditMCITierGrant, shEditMCITierQual handlers, tier clearing on choice change
- `public/css/editor.css` — tier picker styles
- `public/js/suite/sheet.js` — per-tier display in player view
- `public/css/suite.css` — tier list styles
- `public/js/data/audit.js` — mci_tier_over and mci_unassigned gates
