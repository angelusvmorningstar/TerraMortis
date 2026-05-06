---
id: dt-form.21
task: 21
issue: 75
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/75
epic: epic-dt-form-mvp-redesign
status: Draft
priority: medium
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (Implementation Plan)
---

# Story dt-form.21 — Feeding territory tinting (green/red regardless of selection)

As a player choosing a feeding territory,
I should see green tinting on territories where I have feeding rights / regency / lieutenancy and red tinting on barrens / no-rights territories — visible regardless of whether the territory is currently selected,
So that I can make an informed selection at a glance without selecting each chip to discover its status.

## Context

Currently the residency badge in the feeding territory selector only tints when the territory is selected. Per Piatra (2026-05-06), this should change: green-tint background if the character has feeding rights / regent / lieutenant in that territory; red-tint if barrens or no rights. Tint visible in both selected and unselected states.

Feeding-rights data is canonical at `territories.feeding_rights[]` (post-fix.39). Regent and lieutenant relationships are implicit per RFR.1 — the rights check must include all three:

```
hasFeedingRights(c, t) = t.feeding_rights.includes(String(c._id))
                      || String(t.regent_id) === String(c._id)
                      || String(t.lieutenant_id) === String(c._id)
```

### Files in scope

- `public/js/tabs/downtime-form.js` — the feeding territory chip render path
- CSS — green / red tint variants. Match existing tint patterns if any (search `dt-chip-*` for precedents); otherwise add `dt-chip-territory-rights` / `dt-chip-territory-barrens` classes

### Files NOT in scope

- The feeding-rights data model (already canonical via `territories.feeding_rights[]`)
- Territory editor / regent-management UI (separate flow)
- The simplified MINIMAL feeding shape (#20 — separate concern; both stories operate on the same chip surface)

## Acceptance Criteria

**Given** a character has feeding rights, regency, or lieutenancy on a territory
**When** the feeding territory chip set renders
**Then** that chip has the green-tint background applied. Visible in both selected and unselected states.

**Given** a territory is barrens (or the character has no rights / regency / lieutenancy)
**When** the chip renders
**Then** that chip has the red-tint background applied. Visible in both states.

**Given** the chip is currently selected
**When** the visual treatment renders
**Then** the selection state is layered on top of the tint (e.g. selection ring + tint background). Both signals are simultaneously legible.

**Given** the rights check
**When** evaluated for a character
**Then** it returns true for any of: `feeding_rights.includes(String(c._id))`, `String(regent_id) === String(c._id)`, `String(lieutenant_id) === String(c._id)`.

**Given** the chip set re-renders mid-session (e.g. after a regent change)
**When** the same character's feeding chip set is re-rendered
**Then** the tint reflects the updated state without needing a full reload (couples cleanly with #13b's drop-the-cache pattern that just shipped).

## Implementation Notes

The check function should be a small helper, ideally co-located with where the chip renders. Recommend exporting from `public/js/data/helpers.js` if other surfaces want it later, but keeping form-local for this story's scope (per ADR-003's cross-suite-helper gate).

Visual treatment: green = success / OK colour from existing CSS palette; red = warning / unavailable colour. Stay subtle — the tint is informational, not blocking.

## Test Plan

- Static review: rights check correctly checks all three fields; tint applied regardless of selection state
- Browser smoke (DEFERRED): walk through a character's feeding chips; confirm green/red tints match their feeding-rights status; select/deselect a chip and confirm tint persists

## Definition of Done

- [ ] Feeding territory chips green-tint on rights/regency/lieutenancy
- [ ] Red-tint on barrens / no-rights
- [ ] Tint visible regardless of selection state
- [ ] Rights check includes all three fields (feeding_rights, regent_id, lieutenant_id)
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #17 (rendering gate; this surface lives within the feeding section which renders in MINIMAL)
- **Soft co-ordination**: #20 (simplified feeding) — same chip surface; #21 is purely visual; merge order doesn't matter but conflicts in the same render path likely
- **Downstream**: none
