---
id: dt-form.31
task: 31
epic: epic-dt-form-mvp-redesign
status: Done
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

- [x] ADVANCED-only "Submit Final" button + modal with summary + optional rating widget
- [x] MINIMAL toast on auto-submit
- [x] Admin section removed from `DOWNTIME_SECTIONS`
- [x] `_final_submitted_at` schema field documented
- [x] Coordination with #26 in place (Admin section removed structurally; XP Spend relocation is #26's scope)
- [x] PR opened into `dev`

---

## Dev Agent Record

**Agent Model Used:** James / Ptah (BMAD `dev`) — Claude Opus 4.7

### Tasks
- [x] Delete `admin` section entry from `DOWNTIME_SECTIONS` (`public/js/tabs/downtime-data.js`); lift `form_rating` + `form_feedback` definitions into a new exported `SUBMIT_FINAL_MODAL_QUESTIONS` constant the modal renders via the existing `renderQuestion()` switch.
- [x] Clean up the dead admin references in `downtime-form.js` render loops + remove the `dt-feedback-hidden` hack.
- [x] Document `responses._final_submitted_at` on `downtime_submission.schema.js`.
- [x] Persistent MINIMAL-mode auto-submit toast at the top of the form when `_has_minimum && mode === 'minimal'` with locked copy.
- [x] New pure-ESM `public/js/data/dt-action-summary.js` exporting `actionSpentSummary(responses, totals)` + `formatActionSpentSummary(summary)`.
- [x] ADVANCED-only `Submit Final` button + modal scaffold in `downtime-form.js`. Modal mirrors the existing `.npcr-modal` pattern with new `.dt-modal-*` classes in `components.css` (loaded on every surface; `.npcr-modal` lives in admin-only `admin-layout.css`).
- [x] Lifecycle: confirm sets `responses._final_submitted_at = ISO`, fires save (status doesn't flip — already auto per #17). Dismiss (Cancel button, overlay click, Escape) leaves the field unset.
- [x] Status set to Ready for Review; PR opened.

### File List

**New**
- `public/js/data/dt-action-summary.js`

**Modified**
- `public/js/tabs/downtime-form.js`
- `public/js/tabs/downtime-data.js`
- `public/css/components.css`
- `server/schemas/downtime_submission.schema.js`
- `specs/stories/dt-form.31-submit-final-modal.story.md` (Dev Agent Record only)

### Completion Notes

- HALT-DAR raised early to Khepri on the modal CSS path (promote `.npcr-modal-*` from admin-layout.css to components.css vs new `.dt-modal-*` set in components.css). Piatra subsequently dispatched implementation directly with the guidance "mirror existing modal patterns" + "Likely components.css". Settled on **new `.dt-modal-*` classes that mirror the existing shape** — the existing admin-layout.css `.npcr-modal` is unchanged, the player surface gets a working modal via components.css. Trade-off: a small amount of CSS duplication vs. the latent-bug exposure of moving CSS that other admin paths depend on.
- ADR §Q5 spec asked for `_final_submitted_at: { type: 'string', format: 'date-time' }`. The codebase's AJV is configured without `ajv-formats`, so the `format` keyword would throw at compile time. Adopted the existing convention (see `submitted_at` at line 155 of the same schema) — `{ type: 'string' }` with an explicit ISO-8601 comment. Documented in the schema. Not a behavioural deviation; just dropping a keyword AJV doesn't recognise.
- `actionSpentSummary` is data-driven and pure (`PROCEED-WITH-NOTICE` per Khepri). Caller in `openSubmitFinalModal` supplies the per-category totals from form module-scope (`detectedMerits`, slot counts) so the helper has no DOM dependency. `formatActionSpentSummary` flattens to an "N/M Label" string list and skips categories whose total is zero so characters with no contacts merits don't see an irrelevant "0/0 Contact actions" row.
- Modal close paths: Cancel button, overlay click, Escape key. Confirm path remounts the form (so the button label flips to "Update Final Submission") and triggers `scheduleSave()`. Player can re-open and re-confirm to stamp a fresh ISO; idempotent.
- Server tests 671/671 green.

### Change Log
| Date | Author | Change |
|---|---|---|
| 2026-05-06 | James (dev) | Implemented dt-form.31. Admin section removed; Submit Final modal + toast + action-spent summary shipped; status → Ready for Review. |

## Dependencies

- **Upstream**: #17 (lifecycle — modal is a layer atop the auto-submit; Q5 explicit)
- **Cross-coordination**: #26 (XP Spend; both touch Admin section — recommend #31 lands first)
- **Downstream**: none
