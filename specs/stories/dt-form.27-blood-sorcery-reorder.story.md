---
id: dt-form.27
task: 27
epic: epic-dt-form-mvp-redesign
status: Draft
priority: medium
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Audit-baseline)
---

# Story dt-form.27 — Blood Sorcery section reorder (Crúac / Theban)

As a player using Blood Sorcery (Crúac or Theban) in downtime,
I should see the rituals reordered into a logical reading order (e.g. Crúac vs Theban grouped, or by tier, or by frequency-of-use),
So that finding the ritual I want to declare is faster than scrolling the current order.

## Context

ADR-003 §Audit-baseline lists `blood_sorcery` as the section with reordering as task #27: *"Crúac/Theban; conditional on rituals owned. Remediation reorders (task #27)."* The exact target order isn't specified in the ADR — implementer should propose during pickup.

This is ADVANCED-only per ADR §Q2 (blood_sorcery is not in the MINIMAL set). Players who use ritual sorcery declare it via the ADVANCED variant.

### Files in scope

- `public/js/tabs/downtime-form.js` — the `blood_sorcery` section render path
- Possibly `public/js/data/rituals.js` (or wherever ritual reference data lives) if a sort key is needed; otherwise just a render-side reorder

### Files NOT in scope

- The ritual reference data itself (Crúac and Theban canon — not changing)
- The conditional-on-rituals-owned gating (already in place; preserve it)
- The MINIMAL gate (this section stays ADVANCED)

## Acceptance Criteria

**Given** a player owns ritual sorcery
**When** the Blood Sorcery section renders in ADVANCED mode
**Then** the rituals are presented in this order: **Crúac first, then Theban** (per Piatra clarification 2026-05-06). Within each style, alphabetical-by-name unless the implementer surfaces a better-justified alternative during pickup.

**Given** a player does not own any ritual sorcery
**When** the Blood Sorcery section is evaluated
**Then** the section does not render (existing conditional preserved).

**Given** the reordering ships
**When** an existing player opens their cycle's submission
**Then** their already-selected rituals load correctly (no data loss; persistence keys unchanged).

## Implementation Notes

Target order locked by Piatra 2026-05-06: **Crúac first, Theban second.** Within each style, alphabetical-by-name is the implementer's default; if pickup-time analysis suggests a better order (e.g. tier-level grouping, frequency-of-use), surface for Piatra's sign-off rather than diverging silently.

## Test Plan

- DAR captures current vs target order rationale
- Browser smoke: rituals appear in target order; persistence preserved

## Definition of Done

- [ ] Target order chosen and documented in DAR
- [ ] Rituals render in that order
- [ ] Conditional-on-rituals-owned gate preserved
- [ ] Persistence keys unchanged (no data loss)
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #17 (rendering gate; ADVANCED-only)
- **Downstream**: none
