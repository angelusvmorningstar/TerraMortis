---
id: dt-form.31
task: 31
epic: epic-dt-form-mvp-redesign
status: Ready for Dev
priority: high
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Q5)
issue: 72
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/72
branch: piatra/issue-72-submit-final-modal
---

# Story dt-form.31 — Submit Final modal (ADVANCED) + Admin section removal

As an ADVANCED-mode player who wants to declare "I'm done editing,"
I should see a Submit Final modal (dismissable, action-spent summary, optional rate-the-form widget) when I click a "Submit Final" button,
So that the form has a clear "I am done" affordance — replacing the manual submit button and the removed Admin section's form-rating widget.

For MINIMAL-mode players, the form auto-submits silently with a persistent toast confirmation. No modal.

## Context

ADR-003 §Q5 locks the Submit Final modal:
- ADVANCED-only
- Triggered by a "Submit Final" button (visible only in ADVANCED)
- Modal contents:
  - Action-spent summary ("4/4 Personal Actions, 2/3 Contact actions, 1/1 Sphere actions, 0/2 Acquisition slots used.")
  - Optional rate-the-form widget (Likert 1-5, free-text feedback) — optional, not blocking
  - "Submit Final" button which sets `responses._final_submitted_at` (timestamp marking player's stated intent)
- Per §Q9: an ADVANCED player who only filled MINIMAL still sees the modal (with zeros in most slots)
- Cycle close still seals (Q11)

This story also handles the **Admin section removal** since the Admin section's form-rating widget moves to this modal.

Note: `_final_submitted_at` is **not** a status flip — the form is already in `submitted` state from the auto-flip per §Q3. It's a player-stated "I am done editing" hint for the ST.

For MINIMAL: the form auto-submits silently. A persistent toast confirms ("Submitted — keep editing until the deadline").

### Files in scope

- `public/js/tabs/downtime-form.js` — Submit Final button (ADVANCED-only); modal trigger; modal render; MINIMAL toast
- `public/js/tabs/downtime-data.js` — remove the `admin` section entry from `DOWNTIME_SECTIONS` (the section is gone)
- `server/schemas/downtime_submission.schema.js` — document `_final_submitted_at` under `properties` (per ADR §Implementation-plan)
- `public/css/...` — modal styling (mirror existing modal patterns if any)

### Files NOT in scope

- The `_has_minimum` lifecycle (covered by #17)
- The XP-spend UI move into a personal action (covered by #26 — coordinate)
- The `submitted` workflow flip (already auto via #17)
- Server-side validation of the modal's contents (Q7 deferred)

## Acceptance Criteria

**Given** an ADVANCED-mode player
**When** the form renders
**Then** a "Submit Final" button is visible (location: top-right or bottom — implementer's call; mirror existing button positions).

**Given** the player clicks "Submit Final"
**When** the modal opens
**Then** the modal shows:
- Action-spent summary (e.g. "4/4 Personal Actions, 2/3 Contact actions, 1/1 Sphere actions, 0/2 Acquisition slots used.")
- An optional rate-the-form widget (Likert 1-5 + free-text feedback) — optional, not blocking
- A "Submit Final" button inside the modal that confirms the action

**Given** the player clicks the modal's "Submit Final" button
**When** the action fires
**Then** `responses._final_submitted_at = <ISO timestamp>` is set; the form auto-saves; the modal dismisses; a toast confirms ("Final submission recorded; keep editing until the deadline").

**Given** the player dismisses the modal without confirming
**When** they close it
**Then** no `_final_submitted_at` is set; the form continues as draft (auto-submit per #17 is unaffected).

**Given** a MINIMAL-mode player
**When** their form flips `_has_minimum` to true
**Then** a persistent toast appears: "Submitted — keep editing until the deadline." No modal.

**Given** an ADVANCED-mode player who has only filled MINIMAL fields
**When** they click "Submit Final"
**Then** the modal still opens, with zeros in most slots (per ADR §Q9). The player sees their actual usage even if it's all zeros.

**Given** the Admin section is removed
**When** the form renders (any mode)
**Then** the Admin section header and content are gone. The form-rating widget that used to live there now lives in the Submit Final modal.

**Given** the schema documents the new field
**When** a developer reads `downtime_submission.schema.js`
**Then** `_final_submitted_at: { type: 'string', format: 'date-time' }` is under `properties`.

## Implementation Notes

The action-spent summary is data-driven. Compute counts from `responses` by walking each section's slot counts. Helper recommended (e.g. `actionSpentSummary(responses)` returning a small structured object the modal renders).

The rate-the-form widget is the existing widget from the Admin section, just in a modal now. Lift the existing render code rather than re-implementing.

Coordinate merge with #26 (XP Spend overhaul + Admin section removal). Both touch Admin section. Recommend #31 land first to remove the Admin section structure entirely; #26 follows to put XP Spend in a project slot.

## Test Plan

- Static review: ADVANCED-only button + modal; MINIMAL toast; Admin section removed; schema documents new field
- Browser smoke (DEFERRED):
  1. ADVANCED player → click Submit Final → modal shows summary + rating → confirm → toast appears
  2. ADVANCED player → click Submit Final → dismiss → no `_final_submitted_at` set
  3. MINIMAL player → fill enough to flip `_has_minimum` true → toast appears, no modal
  4. ADVANCED player who filled only MINIMAL → click Submit Final → modal shows with zeros
  5. Admin section absent in all modes

## Definition of Done

- [ ] ADVANCED-only "Submit Final" button + modal with summary + optional rating widget
- [ ] MINIMAL toast on auto-submit
- [ ] Admin section removed from `DOWNTIME_SECTIONS`
- [ ] `_final_submitted_at` schema field documented
- [ ] Coordination with #26 in place
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #17 (lifecycle — modal is a layer atop the auto-submit; Q5 explicit)
- **Cross-coordination**: #26 (XP Spend; both touch Admin section — recommend #31 lands first)
- **Downstream**: none
