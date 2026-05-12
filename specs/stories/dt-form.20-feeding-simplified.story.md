---
id: dt-form.20
task: 20
issue: 76
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/76
epic: epic-dt-form-mvp-redesign
status: Done
priority: high
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Q2)
---

# Story dt-form.20 — Feeding simplified MINIMAL variant

As a player on MINIMAL mode,
I should see a Simplified Feeding Form (territory + method + blood type + violence + description, with auto-pick best dice pool),
So that the feeding decision is captured without exposing the dice-pool selector chrome.

## Context

ADR-003 §Q2 lists the MINIMAL feeding state: "Simplified Feeding Form variant; auto-pick best dice pool; territory + method + blood type + violence + description." The full feeding section with manual dice-pool / ROTE-as-secondary chrome remains the ADVANCED variant.

"Auto-pick best dice pool" means the form derives the highest-quality dice pool the character can use given their feeding rights, method choice, and territory ambience — no UI for the player to hand-pick.

### Files in scope

- `public/js/tabs/downtime-form.js` — the `feeding` section render path (currently around `:3500-4200` for `renderFeedingSection`)
- `public/js/data/dt-completeness.js` — `isMinimalComplete()` updated to consume the simplified feeding fields

### Files NOT in scope

- ROTE hunt logic itself — that's #22, **and per Piatra clarification 2026-05-06 ROTE is a personal-project-action variant, NOT a feeding-section sub-block.** ROTE never renders inside this story's feeding section.
- Feeding territory tinting — that's #21 (separate visual change)
- Feeding rights data model (`territories.feeding_rights[]` is canonical post-fix.39)
- The full ADVANCED feeding form (unchanged in this story)

## Acceptance Criteria

**Given** a player on MINIMAL mode
**When** the Feeding section renders
**Then** they see: territory selector (uses #16 picker if applicable, otherwise existing chip set per #21 tinting), method selector, blood type selector, violence-mode selector, description text input.

**Given** territory + method + blood-type + violence are all set
**When** the form computes dice pool
**Then** the highest-quality pool the character can use under those choices is auto-selected. The player sees the resulting pool but not a UI to pick from alternatives.

**Given** all five MINIMAL feeding fields are filled
**When** `isMinimalComplete()` is evaluated
**Then** Feeding passes its rule.

**Given** a player on ADVANCED mode
**When** the Feeding section renders
**Then** the full existing feeding form renders unchanged (manual dice-pool selector, ROTE-as-secondary chrome, etc.).

## Implementation Notes

Auto-pick best dice pool: derive from existing helpers (search for `feedDicePool`, `bestFeedingPool`, or similar) or compute inline against the character's feeding-rights territories crossed with method/blood-type/violence affinities. Surface the resulting pool number near the description input as read-only ("Pool: 7" or similar).

**Pool helper export**: the auto-pick computation should be exported from this section so #22 (ROTE) can import and reuse it for the inherited-pool display. Suggest a small named export from the section module (or inline helper in `dt-completeness.js` if more natural).

`isMinimalComplete()` rule for Feeding (per ADR §Q2 + this story): all five PRIMARY feeding fields present. ROTE in a project slot does NOT satisfy this rule — that's the project-slot rule, separately gated.

## Test Plan

- Static review: MINIMAL branch renders only the 5 fields; auto-pool computes; ADVANCED path untouched
- Browser smoke (DEFERRED): MINIMAL fills cleanly, mode-switch preserves data, dice pool auto-derives sensibly

## Definition of Done

- [x] MINIMAL feeding renders the 5-field simplified form
- [x] Auto-pick best dice pool surfaces a read-only pool number
- [x] ADVANCED feeding form unchanged
- [x] `isMinimalComplete()` consults the simplified fields
- [x] PR opened into `dev`

## Dependencies

- **Upstream**: #17 (lifecycle + `_mode`); #16 (picker, if territory selector adopts it)
- **Soft co-ordination**: #21 (territory tinting) ships independently but the same territory chip surface is used; coordinate visual style on overlap
- **Downstream**: none
