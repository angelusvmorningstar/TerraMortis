---
id: dt-form.26
task: 26
epic: epic-dt-form-mvp-redesign
status: Draft
priority: high
depends_on: ['dt-form.17', 'dt-form.24', 'dt-form.31']
hotfix_predecessor: 'GitHub issue #44'
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (Implementation Plan)
---

# Story dt-form.26 — XP Spend action overhaul + remove Admin XP section

As a player wanting to spend any amount of XP in a downtime,
I should do all my XP-spend declaration inside a single Personal Action slot of type `xp_spend` (with a merit selector that shows all merit categories, including Carthian Law / Invictus Oaths under their covenant gating),
So that the form has one canonical XP-spend surface instead of a duplicate UI in the Admin section.

This story **PRESERVES the merit-selector category fix** from hotfix #44 — the redesign replaces the surrounding UI but the underlying merit-eligibility logic from #44 remains the source of truth.

## Context

ADR-003 + Piatra (2026-05-06) lock the redesign:
- XP Spend personal action allows any XP amount in a single action.
- Move the entire XP spend UI from the Admin section (`admin.xp_spend` per `DOWNTIME_SECTIONS`) into this personal action.
- Merit selector dropdown must include all merit categories: general, influence, domain, standing, manoeuvre, plus Carthian Law / Invictus Oaths under their covenant gating.

Cross-cutting note from Piatra: hotfix issue #44 (Merit selector dropdown missing Carthian Law / Invictus Oath / standing-merit categories) lands BEFORE this story via the hotfix lane. **Story #26 must preserve the #44 fix's merit-eligibility logic.**

This story also depends on #31 (Submit Final modal / Admin section removal) for the Admin XP section's actual removal — both stories touch the Admin section's lifecycle.

### Files in scope

- `public/js/tabs/downtime-form.js` — the `xp_spend` action render within project slots; also the Admin section's xp_spend sub-section (for removal — coordinate with #31)
- `public/js/tabs/downtime-data.js` — Admin section sub-keys (likely a `DOWNTIME_SECTIONS` entry change to remove `admin.xp_spend`)
- Reference data: `public/js/data/merits.js` `MERITS_DB` if the merit-eligibility logic from #44 needs adjustment (most likely it doesn't — preserve it)

### Files NOT in scope

- The merit-eligibility logic itself (locked by #44 hotfix)
- The XP cost rate constants (`CLAUDE.md` documents these — 4 XP/dot for attributes, 2 XP/dot for skills, etc.)
- The full Admin section removal (covered by #31)
- The Submit Final modal (covered by #31)

## Acceptance Criteria

**Given** a player creates a Personal Action slot of type `xp_spend`
**When** the slot renders
**Then** the full XP spend UI is in-slot: amount input, target type (attribute / skill / discipline / merit / etc.), target selector (filtered per type), cost computation visible, save persists to `responses.project_N_xp_*` keys.

**Given** the merit-target selector renders
**When** the dropdown opens
**Then** all merit categories are present (general, influence, domain, standing, manoeuvre, Carthian Law, Invictus Oaths). Covenant gating is correct (Carthian Law gated to Carthian Movement covenant; Invictus Oaths gated to Invictus). The eligibility logic from hotfix #44 is the canonical source — this story must not override or duplicate it.

**Given** the Admin section's xp_spend sub-section exists pre-redesign
**When** this story (and #31) ship
**Then** the Admin section's xp_spend UI is gone. `DOWNTIME_SECTIONS` entry for `admin.xp_spend` is removed.

**Given** legacy submission data has XP-spend entries on the old `admin.xp_*` keys
**When** the form loads against pre-existing data
**Then** the legacy entries are tolerated (not errors). Implementer's call: surface a one-time migration banner or silently leave them. Recommendation: silent leave; the data is in `responses` and ignored.

**Given** XP cost computation
**When** the slot is filled
**Then** the cost is shown to the player in the slot UI (read-only annotation), so they see the cost before saving.

## Implementation Notes

Coordinate merge with #31. Both touch Admin section. Recommended: #31 lands first (removes Admin section structure entirely, replaces with submit-final modal); #26 lands second (puts XP spend functionality in the project slot). If both ship in the same PR, coordinate.

Survey current Admin xp_spend UI before move — its persistence keys, its computation helpers, its dropdown sources — so the redesigned in-slot UI doesn't lose features.

## Test Plan

- Static review: hotfix #44 logic untouched; admin xp_spend removed; in-slot xp_spend has full feature parity with admin's
- Browser smoke (DEFERRED): XP spend in-slot for an attribute, skill, discipline, merit, including a Carthian Law and an Invictus Oath; persistence; cost shown; legacy admin xp_* data tolerated

## Definition of Done

- [ ] In-slot `xp_spend` action has full XP-spend UI (amount, target type, target selector, cost)
- [ ] Merit selector category-filter logic (#44 hotfix) preserved as source of truth
- [ ] Admin section's xp_spend sub-section removed from `DOWNTIME_SECTIONS`
- [ ] Coordination with #31 documented
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #17 (lifecycle); #24 (chrome strip — same render path); **#31** (Admin section removal — coordinate); **hotfix #44** (merit-selector category-filter — must land first via hotfix lane)
- **Downstream**: none
- **Cross-reference**: GitHub issue #44 carries the merit-eligibility hotfix; this story's #44 dependency is hard (#26 cannot land before #44).
