---
id: dt-form.24
task: 24
issue: 78
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/78
epic: epic-dt-form-mvp-redesign
status: Draft
priority: high
depends_on: ['dt-form.16', 'dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (Implementation Plan)
---

# Story dt-form.24 — Personal Actions chrome strip + adopt charPicker for ALLY

As a player filling Personal Action slots,
I should not see MODE / SUPPORT / single-vs-dual roll selectors that no rule consumes,
And ALLY-attach pickers should use the universal `charPicker()` (with `excludeIds: [self]`),
So that the action chrome is decluttered and ALLY selection is consistent with the rest of the form.

## Context

ADR-003 §Audit-baseline names redundant chrome the rules don't consume on Personal Action slots: MODE, SUPPORT, and single-vs-dual roll choice. The Implementation Plan locks task #24 to strip this chrome and adopt `charPicker()` for any ALLY-attach selectors.

MINIMAL mode renders only 1 project slot per ADR §Q2 (Q1's MINIMAL composition). ADVANCED renders all 4. This story applies to both.

### Files in scope

- `public/js/tabs/downtime-form.js` — the project-slot render path (`:5000+`-ish, `renderProjectSlot(...)` and the Personal Actions section rendering)
- `public/js/tabs/downtime-data.js` — if MODE/SUPPORT enums need cleanup (likely they do)

### Files NOT in scope

- The action-type list itself (action types like `ambience_increase`, `attack`, `xp_spend`, etc. — those are scoped per-action by other stories)
- Single-slot vs four-slot rendering — covered by #17's MINIMAL gate
- Joint authoring / project invitation — that's removed in #32

## Acceptance Criteria

**Given** a Personal Action slot renders
**When** the slot is in any state
**Then** there is no MODE selector visible. There is no SUPPORT selector visible. There is no single-vs-dual roll selector visible. Any backing fields in `responses` for these have been removed (or migrated to inert under-the-hood derivations).

**Given** an ALLY-attach selector exists within an action slot
**When** it renders
**Then** it uses `charPicker({ scope: 'all', cardinality: 'single', excludeIds: [String(currentChar._id)], onChange: fn })`.

**Given** the player previously had a MODE/SUPPORT value persisted
**When** the form loads against pre-existing data
**Then** the legacy fields are tolerated (not an error) but not surfaced. Optional: the form auto-cleans them on next save (drop the keys); recommend yes for hygiene.

**Given** the chrome is stripped
**When** the action slot is filled and saved
**Then** the surviving fields (action type, target, dice pool if applicable, cast, merits) round-trip cleanly.

## Implementation Notes

Survey current chrome before stripping: grep for `_mode`, `_support`, `_single_dual` (or the actual literal field names) in `downtime-form.js` to find every render and persist site. Strip them all.

ALLY-attach is the principal `excludeIds` consumer per ADR §Q6 — confirms the v1 parameter shipping.

## Test Plan

- Static review: chrome fields gone from renders + persists; ALLY-attach uses `charPicker`
- Browser smoke: action slot fills cleanly; legacy data with MODE/SUPPORT loads without error; ALLY picker excludes self

## Definition of Done

- [ ] MODE / SUPPORT / single-vs-dual chrome removed from action-slot render
- [ ] ALLY-attach uses `charPicker` with `excludeIds: [self]`
- [ ] Legacy data tolerated (or auto-cleaned)
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #16 (charPicker), #17 (lifecycle/mode)
- **Downstream**: #25 (ambience action redesign — operates on individual action types within slots; #24's chrome strip is the surface they share), #26 (XP spend), #28 (Mentor/Staff)
