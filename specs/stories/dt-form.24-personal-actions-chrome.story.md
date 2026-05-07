---
id: dt-form.24
task: 24
issue: 78
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/78
epic: epic-dt-form-mvp-redesign
status: Ready for Review
priority: high
depends_on: ['dt-form.16', 'dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (Implementation Plan)
---

# Story dt-form.24 — Personal Actions chrome strip (single-vs-dual roll only)

As a player filling Personal Action slots,
I should not see the single-vs-dual roll selector that no rule consumes,
So that the action chrome is decluttered.

## Context

**Scope reduction 2026-05-07 (Piatra HALT-DAR turn):** the original story scope listed three chrome elements and an ALLY-attach charPicker adoption. Ptah's pre-implementation survey found:

- **MODE selector** (per-slot) — phantom; doesn't exist in code. Zero hits across all candidate field names. Either prior cleanup or never landed. Net work: 0 lines.
- **SUPPORT selector** — the `project_support` field at downtime-form.js:5078-5092 was misidentified by the original story; it's a SPHERE-action field (Allies/Status spheres attaching to a project slot), not Personal Action chrome. The project-side `support` action enum value was already deprecated pre-story per the backward-compat notice at downtime-form.js:3680-3681. Net work: 0 lines.
- **Single-vs-dual roll selector** — REAL. Only true strip target. Lives in `renderSecondaryDicePool` at downtime-form.js:3480-3496, backing fields `project_${n}_pool2_*`.
- **ALLY-attach charPicker adoption** — no ALLY surface exists in the DT form today; AC was vacuously satisfied. Story spec was silent on which action types should surface ALLY and on the semantic (other-player charPicker vs NPC-via-merit). User locked: omit Part B entirely (treat as misspoken). ALLY-attach affordance is a future story when the use case is locked.

Net Part A scope: strip `renderSecondaryDicePool` and its `project_${n}_pool2_*` backing fields.

ADR-003 §Audit-baseline mentions the broader chrome cleanup intent. The Implementation Plan locks task #24's scope; the reduction above is consistent with the plan.

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
**Then** there is no single-vs-dual roll selector visible. The `renderSecondaryDicePool` function and its backing fields (`project_${n}_pool2_attr`, `project_${n}_pool2_skill`, `project_${n}_pool2_disc`) are removed from the render path. The form-level minimal/advanced mode toggle from dt-form.17 is unaffected.

**Given** the player previously had `project_${n}_pool2_*` values persisted
**When** the form loads against pre-existing data
**Then** the legacy fields are tolerated (not an error) but not surfaced. Per dt-form.26 A1 precedent: silent-leave (no real users yet — only dev/ST testers).

**Given** the chrome is stripped
**When** the action slot is filled and saved
**Then** the surviving fields (action type, target, dice pool if applicable, cast, merits) round-trip cleanly.

## Implementation Notes

`renderSecondaryDicePool` at downtime-form.js:3480-3496 emits a `<fieldset>` with two `data-project-pool-count` radios (Single Roll / Dual Roll) plus a `dt-secondary-pool-wrap` containing `renderDicePool(n, 'pool2', ...)`. Click handler at downtime-form.js:2314. Schema has `project_${n}_pool2_*` fields under `projectSlotProps`.

Mirror-coverage check before deletion: grep for `pool2_attr|pool2_skill|pool2_disc` across `public/js/`, `server/`, and tests to surface any external consumers. If any reader depends on these fields, surface in PR body for the user's call (likely silent-leave still applies, but worth knowing).

## Test Plan

- Static review: secondary-pool render path gone; backing fields no longer collected; mirror-coverage report in PR body
- Browser smoke: action slot fills cleanly with no Single/Dual radio visible; legacy data with `_pool2_*` loads without error

## Definition of Done

- [x] `renderSecondaryDicePool` and its callers removed from the action-slot render path
- [x] `project_${n}_pool2_attr/_skill/_disc` no longer collected on save (silent-leave preserves any pre-existing values via spread base; do not unconditionally overwrite with empty strings — same lesson class as #105)
- [x] Mirror-coverage report on `_pool2_*` external consumers in PR body
- [x] PR opened into `dev` with `Closes #78`

## Dependencies

- **Upstream**: #17 (lifecycle/mode)
- **Downstream**: #25 (ambience action redesign — operates on individual action types within slots; #24's chrome strip is the surface they share). #26 (XP spend) and #22 (ROTE) already shipped on the soft-dep "post-#24 chrome adapts later" assumption — this story's narrowed scope means there's no chrome change those stories need to adapt to (they assumed MODE/SUPPORT might disappear; those were phantom; only `_pool2_*` strip is real, and those stories don't consume `_pool2_*`).
- **Out of scope:** ALLY-attach affordance (Part B of original draft, omitted per HALT-DAR resolution; future story when use case is locked).
