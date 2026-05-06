---
id: dt-form.22
task: 22
epic: epic-dt-form-mvp-redesign
status: Draft
priority: medium
depends_on: ['dt-form.17', 'dt-form.20']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Q2)
---

# Story dt-form.22 — ROTE hunt redesign (secondary feeding)

As a player who wants to use ROTE-hunt as a secondary feeding option,
I should see a clear secondary-feeding UI within the feeding section that explicitly distinguishes ROTE from primary feeding,
So that ROTE choices are not buried in primary-feeding chrome and the section's MINIMAL/ADVANCED gating handles ROTE correctly.

## Context

ADR-003 §Audit-baseline notes ROTE hunt as "secondary feeding" within the existing `feeding` section. ADR §Q2 calls feeding for simplification in MINIMAL but does not specifically reduce ROTE chrome — that's this story's redesign.

ROTE hunt is the "this is where you usually feed" lighter option that contrasts with primary feeding's per-cycle hunt. Players who do ROTE this cycle still need a way to declare it; the redesign gives ROTE a clear surface inside the feeding section.

### Files in scope

- `public/js/tabs/downtime-form.js` — the feeding section's ROTE-secondary render
- `public/js/data/dt-completeness.js` — `isMinimalComplete()` rule for feeding may need to consider ROTE-only as a valid completion (or not — this story decides)

### Files NOT in scope

- Primary feeding logic (covered by #20)
- Feeding territory tinting (#21)
- The `MAINTENANCE_MERITS` ROTE-related interaction (separate concern)

## Acceptance Criteria

**Given** a player on MINIMAL or ADVANCED with feeding section visible
**When** the ROTE option is selected
**Then** the form shows a secondary-feeding UI clearly distinguished from primary feeding (separate sub-block, label, optional collapse/expand affordance).

**Given** ROTE-only is a valid feeding choice for the cycle
**When** `isMinimalComplete()` is evaluated against a submission that has filled ROTE but not primary feeding
**Then** the rule passes (ROTE counts as feeding for MINIMAL completeness — confirm with rules; if ROTE does NOT count, story decides MINIMAL requires primary feeding and ROTE is ADVANCED-only).

**Given** ROTE is selected
**When** the player provides whatever ROTE-specific fields are needed (territory, RP description, etc.)
**Then** those values persist on `responses.feeding_rote_*` keys (or follow the existing convention if these fields already exist).

## Implementation Notes

The ROTE-vs-primary distinction in current code is fuzzy. Implementer should first **survey current ROTE behaviour** (grep for `rote`, `ROTE`, `_feeding_rote`, etc. in `downtime-form.js`); document findings in DAR; then redesign.

If the survey shows ROTE has no current implementation at all (just a placeholder in the section list), this story should ship a minimum-viable ROTE block (territory + description) and mark deeper game-rules questions for a follow-up story.

## Test Plan

- DAR captures the survey of current ROTE state
- Browser smoke: ROTE selection surfaces clearly; persists; mode-switch preserves ROTE values

## Definition of Done

- [ ] ROTE secondary-feeding block clearly distinguished in the feeding section
- [ ] Persistence keys documented in DAR
- [ ] `isMinimalComplete()` rule for ROTE-only confirmed (counts vs ADVANCED-only)
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #17 (rendering gate); #20 (simplified feeding)
- **Downstream**: none
- **Open question**: surface "is ROTE-only sufficient for MINIMAL completeness?" to Piatra during pickup — likely a quick chat answer
