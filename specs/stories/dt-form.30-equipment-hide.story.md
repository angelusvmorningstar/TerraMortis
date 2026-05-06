---
id: dt-form.30
task: 30
issue: 85
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/85
epic: epic-dt-form-mvp-redesign
status: Draft
priority: low
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Audit-baseline)
---

# Story dt-form.30 — Equipment section hidden for this DT cycle

As an ST shipping the redesigned DT form,
I should not see the Equipment section in the form for this cycle (neither MINIMAL nor ADVANCED),
So that players are not asked questions about equipment that the cycle's mechanics don't yet consume.

## Context

ADR-003 §Audit-baseline marks Equipment as: *"Hidden for this DT cycle per task #30."*

This is a hide, not a remove. The section's render path is gated off; data already in `responses.equipment_*` keys is preserved and ignored. If a future cycle wants Equipment back, the gate is flipped.

### Files in scope

- `public/js/tabs/downtime-form.js` — Equipment section render path; gate it off
- `public/js/tabs/downtime-data.js` — `DOWNTIME_SECTIONS` Equipment entry annotated as hidden (or removed; either works)

### Files NOT in scope

- Existing Equipment data (preserved as-is in `responses`; ignored by the form)
- Equipment-related helpers elsewhere in the codebase (no audit of those; the form just stops surfacing)

## Acceptance Criteria

**Given** a player opens the DT form (any mode)
**When** the form renders
**Then** the Equipment section is not visible. No header, no fields, no chrome.

**Given** legacy submission data has `equipment_*` fields populated
**When** the form loads
**Then** no error. The data is in `responses` but not surfaced. Persistence on next save is unchanged (legacy fields stay; form-level is hidden).

**Given** the gate is implemented as a configurable flag (recommended)
**When** a future cycle wants Equipment back
**Then** flipping the flag re-enables the section without code archaeology.

## Implementation Notes

Simplest implementation: a top-of-file `EQUIPMENT_HIDDEN = true` const that the section render path checks. Or a per-section `hidden` flag in `DOWNTIME_SECTIONS` and the render loop respects it.

Recommend the per-section flag — generalises to any future "hide this section temporarily" need.

## Test Plan

- Static review: section gate is in place; data preservation confirmed
- Browser smoke: form renders without Equipment; legacy data loads without error

## Definition of Done

- [ ] Equipment section not rendered in MINIMAL or ADVANCED
- [ ] Legacy `equipment_*` data preserved on save
- [ ] Gate is configurable (flag-flip restores)
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #17 (rendering gate); independent otherwise
- **Downstream**: none
