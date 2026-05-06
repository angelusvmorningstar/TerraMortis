---
id: dt-form.19
task: 19
issue: 77
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/77
epic: epic-dt-form-mvp-redesign
status: Draft
priority: medium
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (Implementation Plan)
---

# Story dt-form.19 — City Influence breakdown tooltip

As a player or ST seeing the City Influence label (e.g. `8/10 Influence`),
I should be able to hover and see how that figure is derived (which merits, which adjustments, which territory bonuses contribute),
So that the figure is auditable inline without leaving the form.

## Context

The `8/10 Influence` label in the City section (territory + influence subsection) is currently a flat number. ADR-003 lists task #19 as independent feature work; per Piatra (2026-05-06): mirror an existing tooltip pattern from elsewhere in the codebase rather than invent a new one.

`influenceBreakdown(c)` in `public/js/editor/domain.js` already exists as the source-of-truth for the breakdown — reuse it.

### Files in scope

- `public/js/tabs/downtime-form.js` — the territory section's influence label render
- CSS — adopt the existing tooltip styling pattern (search for existing `tooltip` or `title=` patterns; the Attaché derived-note at `sheet.js:830` is a precedent for inline-explanatory copy)

### Files NOT in scope

- `influenceBreakdown(c)` itself — already correct; just consume it
- Other influence-display sites (admin, suite) — out of scope; this story is form-only per ADR-003 §Out-of-scope on broader adoption

## Acceptance Criteria

**Given** the City section renders the `N/M Influence` label
**When** the player hovers
**Then** a tooltip appears showing the breakdown by source: merit contributions, attaché bonuses, regency bonus (if any), and any other contributors per `influenceBreakdown(c)`.

**Given** the tooltip is keyboard-accessible
**When** the label receives focus
**Then** the tooltip surfaces (or an `aria-describedby` association exposes the breakdown to assistive tech).

**Given** an existing tooltip pattern exists elsewhere in the codebase
**When** this tooltip ships
**Then** it visually matches that pattern (no novel styling).

## Implementation Notes

`influenceBreakdown(c)` returns a structured object — render its contents as a small dt/dd list inside the tooltip body. Examples to mirror: any `title=` pattern in the form, or the Attaché derived-note inline-explanatory copy.

## Test Plan

- Static review: tooltip wired to the existing breakdown helper
- Browser smoke: hover on `N/M Influence` label, verify tooltip; tab to label, verify keyboard accessibility

## Definition of Done

- [ ] Tooltip on `N/M Influence` shows breakdown
- [ ] Visual treatment matches existing tooltip pattern
- [ ] Keyboard-accessible
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #17 (rendering gate; the territory section is ADVANCED-only)
- **Downstream**: none
