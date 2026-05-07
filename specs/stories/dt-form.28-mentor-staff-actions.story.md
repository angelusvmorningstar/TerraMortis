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

- [x] Mentor action: one per Mentor merit (like Retainer)
- [x] Staff action: one per dot of Staff (like Contacts)
- [x] Character pickers use `charPicker` (#16)
- [x] Merit detection follows hotfix #45 walk
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #16 (picker); #17 (lifecycle); **hotfix #45** (granted-merit detection walk — must land first via hotfix lane)
- **Downstream**: none
- **Cross-reference**: GitHub issue #45 establishes the merit-detection walk; #28's detection follows that pattern.

## Dev Agent Record

### Agent Model Used
claude-opus-4-7 (Ptah / James persona, BMAD dev)

### Survey findings
- **Hotfix #45 walk helper** is `detectMerits()` at `public/js/tabs/downtime-form.js:249`, where `expandedInfluence` is built by walking each merit's `benefit_grants[]` (lines 262-274) and merging non-duplicate granted entries into the influence pool. Mentor/Staff detection extends this same function — no re-implementation, no divergence.
- **Retainer template**: per-merit, persistence keys `retainer_${n}_type`, `retainer_${n}_task`, `retainer_${n}_merit` (collect at lines 766-789, render at 5466-5513). No charPicker today.
- **Contacts template**: per-sphere (sphere is the per-dot unit for Contacts via `m.spheres[]` expansion in detection), persistence keys `contact_${n}_info`, `contact_${n}_request`, `contact_${n}_merit` (collect at lines 752-771, render at 5415-5463). No charPicker today.
- **Persistence-key convention divergence**: Retainer uses `_type`/`_task`/`_merit`; Contacts uses `_info`/`_request`/`_merit`. Different field names but identical structure (`<merit>_${n}_<field>`). Mentor mirrors Retainer's row pattern; Staff mirrors Contacts' per-slot pattern.
- **No legacy `mentor_*` / `staff_*` keys** exist anywhere in `public/` or `server/` — Lesson #105 drop-the-iteration doesn't apply (clean greenfield).
- **Mentor and Staff merits**: both `category: 'influence'` with `m.area` carrying the human-readable name/area (per `public/js/editor/sheet.js:899-903`).

### Persistence shape (chosen)
- **Mentor**: `mentor_${n}_target` (charPicker hidden id), `mentor_${n}_task` (textarea), `mentor_${n}_merit` (hidden meritLabel ref). Mirrors Retainer's `<merit>_${n}_<field>` shape with the addition of `_target` for the optional charPicker.
- **Staff**: `staff_${n}_target`, `staff_${n}_task`, `staff_${n}_merit`. Same shape; `n` indexes total Staff dots summed across detected Staff merits.

### Completion Notes
- Detection extends `detectMerits()` at downtime-form.js:309-318: `detectedMerits.mentors` (per-merit) and `detectedMerits.staff` (per-merit list, dot count summed at render time). Both filtered from `expandedInfluence` so granted instances (e.g. via Patron / MCI grants) surface — same #45 walk pattern, no parallel implementation.
- Render extends `renderMeritToggles()`: Mentor block (per-merit, mirrors Retainer chrome), Staff block (per-dot total summed across detected Staff merits, mirrors Contacts per-slot chrome). Both reuse `dt-contacts-table` / `dt-contact-row` / `dt-contact-panel` classes for visual consistency.
- charPicker (#16) used for an OPTIONAL "Person involved" target in both Mentor and Staff rows. `excludeIds: [currentChar._id]` so the player can't target themselves. Each picker site has a stable hidden mirror input that the picker's `onChange` writes to (`dt-mentor_${n}_target` / `dt-staff_${n}_target`).
- Click handlers + live row-status badge updates follow the existing Retainer/Contacts pattern verbatim (toggle, clear button, input-driven badge flip).
- Tick rules added to `updateSectionTicks` for `mentors` and `staff` keys; both flip when any row has either a target or task.
- Action-spent summary (`public/js/data/dt-action-summary.js`) extended with `mentor_actions` / `staff_actions` cells so the Submit Final modal renders Mentor/Staff counts alongside Contacts/Retainer when the character has those merits. Wired through `openSubmitFinalModal()` totals at downtime-form.js:1632-1636.
- No HALT-DARs encountered. Persistence convention divergence between Retainer (`_type`/_task`) and Contacts (`_info`/`_request`) is preserved — mirrored field-by-field rather than normalised; the broader "row keyed `<merit>_${n}_<field>`" structure is the actual shared convention.
- Server tests baseline preserved: 678/678 passing on full suite with changes applied.

### File List
- Modified: `public/js/tabs/downtime-form.js` (Mentor/Staff detection in `detectMerits`; collect loops; render blocks in `renderMeritToggles`; click handlers; live row-status updates; tick rules; modal totals)
- Modified: `public/js/data/dt-action-summary.js` (`mentorSlots`/`staffSlots` totals; `mentor_actions`/`staff_actions` summary cells; labels)

### Change Log
| Date | Change | Notes |
|---|---|---|
| 2026-05-07 | Mentor + Staff actions implemented in DT form (per-merit / per-dot mirrors of Retainer / Contacts) | downtime-form.js + dt-action-summary.js |
