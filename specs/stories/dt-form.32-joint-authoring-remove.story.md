---
id: dt-form.32
task: 32
issue: 83
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/83
epic: epic-dt-form-mvp-redesign
status: Draft
priority: low
depends_on: []
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Out-of-scope)
---

# Story dt-form.32 — Remove joint authoring / project invitation from MVP

As an ST shipping the MVP DT form,
I should not see joint-authoring / project-invitation UI surfaces in the form,
So that the MVP scope matches ADR-003 and joint authoring is preserved as a future scoping decision rather than a half-functional feature.

## Context

ADR-003 §Out-of-scope: *"Joint authoring / project invitation. Task #32 removes from MVP. Re-enabling is a future scoping decision."*

This story removes the joint-authoring affordances from the form. Data already in submissions that referenced joint authors is preserved (no destructive migration); the surface that lets players create new joint-author relationships is removed.

### Files in scope

- `public/js/tabs/downtime-form.js` — joint-authoring UI render paths (likely "Add co-author" buttons, invitation lists, etc. — survey for exact locations)
- Possibly `public/js/tabs/downtime-data.js` — joint-author related field defaults

### Files NOT in scope

- Existing submission data (preserved as-is in `responses`)
- Server-side joint-authoring routes if any (out of scope for this story; may re-enable at the route level when joint authoring returns)
- Admin views of joint authorship (separate concern; scope this story to the player form)

## Acceptance Criteria

**Given** the player opens the DT form (any mode)
**When** the form renders
**Then** there is no joint-authoring UI surface: no "Invite co-author" button, no joint-author list, no per-slot joint-author toggles.

**Given** legacy data has joint-author references in `responses`
**When** the form loads
**Then** no error. Joint-author fields are not surfaced but are preserved in `responses` for historical record.

**Given** a future story revives joint authoring
**When** that work picks up
**Then** the removed UI can be reintroduced cleanly. This story should aim to delete joint-authoring chrome via removal (not feature-flag), keeping the diff legible.

## Implementation Notes

Survey first. Joint authoring may be a thin surface (a single button + dropdown) or a deeper invitation flow. DAR captures the survey + the specific UI sites removed.

If the survey reveals joint authoring is significantly entangled with project-slot structure (e.g. project slot data shape includes joint-author fields), surface to Piatra; this story may need to expand scope to include data-shape simplification.

## Test Plan

- DAR captures pre-removal joint-authoring surface
- Browser smoke: form renders without joint-author UI; legacy data loads cleanly

## Definition of Done

- [ ] Joint-authoring UI surfaces removed from `downtime-form.js`
- [ ] Legacy data preserved on save
- [ ] Survey + removal sites documented in DAR
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: none direct (removal is independent of #16 / #17)
- **Downstream**: none
