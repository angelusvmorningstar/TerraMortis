---
id: dt-form.28
task: 28
issue: 86
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/86
epic: epic-dt-form-mvp-redesign
status: Ready for Dev
priority: medium
depends_on: ['dt-form.16', 'dt-form.17']
hotfix_predecessor: 'GitHub issue #45'
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (Implementation Plan)
---

# Story dt-form.28 — Mentor + Staff actions

As a player who holds Mentor or Staff merits,
I should see one Mentor action per Mentor merit owned (like Retainer's existing pattern) and one Staff action per dot of Staff (like Contacts' existing pattern),
So that these merits surface their downtime actions cleanly alongside Retainer / Contacts.

This story's merit detection follows the **established walk pattern from hotfix #45** (Charlie Ballsack Retainer-via-Attaché missing-action fix).

## Context

Per Piatra (2026-05-06):
- **Mentor**: one action per Mentor merit owned, mirrors Retainer's pattern
- **Staff**: one action per dot of Staff, mirrors Contacts' pattern
- Both surface alongside Retainer / Contacts in the form
- Use the universal character picker (#16) for any character selection within these actions

Cross-cutting note from Piatra: hotfix issue #45 (granted-merit detection walk) lands BEFORE this story. **Story #28's merit detection follows the same walk pattern from #45.**

### Files in scope

- `public/js/tabs/downtime-form.js` — wherever Retainer / Contacts merit-action detection currently happens; add Mentor + Staff to the same surface
- Per Piatra: detection should walk `benefit_grants` / `granted_by` per the pattern issue #45 establishes

### Files NOT in scope

- `MERITS_DB` (Mentor and Staff are already in the data; this story consumes them)
- Other merit-driven actions (Retainer, Contacts — preserved unchanged; they're the template)
- The granted-merit detection logic itself (locked by #45 hotfix)

## Acceptance Criteria

**Given** a character holds N Mentor merits
**When** the Personal Actions area renders
**Then** N "Mentor" actions are surfaced, one per merit. Each Mentor action carries the standard action UI (target picker, dice pool if applicable, description).

**Given** a character holds Staff with M dots
**When** the Personal Actions area renders
**Then** M "Staff" actions are surfaced, one per dot. Each Staff action carries the standard simple-action UI (similar to Contacts per-sphere actions).

**Given** any character-selection within a Mentor or Staff action
**When** the picker renders
**Then** it uses `charPicker({ scope: 'all', cardinality: 'single', excludeIds: [...] })` from #16.

**Given** a character holds Mentor or Staff via a granted source (e.g. via Attaché)
**When** the merit-detection walk fires
**Then** the granted Mentor/Staff is detected per the walk pattern from hotfix #45. Story #28's detection logic must use the same walk (no duplicating, no diverging).

**Given** Mentor or Staff merit-action surfacing exists
**When** persistence fires
**Then** Mentor/Staff selections persist on `responses.mentor_action_*` / `responses.staff_action_*` keys (or follow the existing convention in the surrounding Retainer/Contacts pattern).

## Implementation Notes

Survey: where do Retainer and Contacts actions currently surface? That's the template. Read the surrounding render code — likely a "for each [merit]" loop over the character's merit set, gated on merit name. Add Mentor (per-merit) and Staff (per-dot) to the same loop.

Detection walk: hotfix #45 establishes that granted merits should be detected by walking `c.merits[i].benefit_grants` and `c.merits[i].granted_by`. Ensure this story's Mentor/Staff detection uses the same walk so a granted Mentor (e.g. via Patron) is surfaced too.

## Test Plan

- Static review: Mentor surfaces N actions per N merits; Staff surfaces M actions per M dots; #16 picker used; #45 walk pattern applied
- Browser smoke (DEFERRED): a character with Mentor + Staff sees both action sets; selections persist

## Definition of Done

- [ ] Mentor action: one per Mentor merit (like Retainer)
- [ ] Staff action: one per dot of Staff (like Contacts)
- [ ] Character pickers use `charPicker` (#16)
- [ ] Merit detection follows hotfix #45 walk
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #16 (picker); #17 (lifecycle); **hotfix #45** (granted-merit detection walk — must land first via hotfix lane)
- **Downstream**: none
- **Cross-reference**: GitHub issue #45 establishes the merit-detection walk; #28's detection follows that pattern.
