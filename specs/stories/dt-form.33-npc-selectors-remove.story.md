---
id: dt-form.33
task: 33
issue: 84
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/84
epic: epic-dt-form-mvp-redesign
status: Ready for Dev
priority: low
depends_on: []
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Out-of-scope)
---

# Story dt-form.33 — Remove NPC selectors from the DT form

As an ST shipping the MVP DT form,
I should not see NPC-selection UI surfaces in the form (per ADR-003 §Out-of-scope),
So that NPC selectors don't drag the form back into the registered-NPC complexity that issue #24 already partly retired.

## Context

ADR-003 §Out-of-scope: *"NPC selector replacement. Task #33 removes NPC selectors entirely; if NPCs come back to the form later, they will need their own picker variant. Not addressed here."*

Issue #24 (Story Personal Story free-text NPC fields, PR #28) already moved Personal Story away from the registered-NPC picker to free-text NPC names. This story removes any remaining NPC-selector chrome from other sections of the form.

### Files in scope

- `public/js/tabs/downtime-form.js` — any remaining NPC-selector dropdowns or pickers across sections
- Possibly survey other section-helper files if any

### Files NOT in scope

- The free-text NPC-name fields introduced by issue #24 (those stay)
- The NPC data model (registered NPCs, `npcs` collection — out of scope; the form just stops surfacing them)
- The character picker (#16) — this story removes NPC selectors specifically; the character picker is for character-list selection (registered characters, not NPCs)
- Issue #23 (NPC sidebar removal in admin app) — already shipped; separate surface

## Acceptance Criteria

**Given** the player opens the DT form (any mode)
**When** any section that previously surfaced an NPC selector renders
**Then** the NPC selector is gone. If a free-text NPC-name field was the issue-#24 replacement, it remains; if the section needs NPC reference at all post-removal, free-text is the path.

**Given** legacy data has NPC IDs in `responses`
**When** the form loads
**Then** no error. The IDs are preserved in `responses` but not surfaced. (Future stories that revive NPC selection will need to migrate them.)

**Given** the survey
**When** Ptah greps for NPC-selector patterns
**Then** every site is identified and removed. Document the inventory in DAR.

## Implementation Notes

Survey: grep for `npc`, `npcId`, `selectedNpc`, `_npc_*` field patterns in `downtime-form.js` and helper files. Some legitimate NPC mentions (free-text fields per issue #24) stay; selectors / dropdowns / typeaheads against the registered-NPC list go.

If the survey reveals an NPC selector that has rules-bound behaviour (e.g. an NPC pick affects dice pool), surface to Piatra — that's a "needs replacement, not just removal" case.

## Test Plan

- DAR captures the inventory of removed sites
- Browser smoke: form renders cleanly; no NPC-selector chrome anywhere; legacy data loads

## Definition of Done

- [ ] NPC selector UI surfaces removed from `downtime-form.js`
- [ ] Free-text NPC fields (issue #24) preserved
- [ ] Survey + removal sites documented in DAR
- [ ] Legacy data preserved on save
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: none direct (removal is independent of cross-cutting foundation)
- **Downstream**: none
