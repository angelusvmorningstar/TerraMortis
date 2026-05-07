---
id: dt-form.25
task: 25
issue: 79
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/79
epic: epic-dt-form-mvp-redesign
status: Ready for Review
priority: medium
depends_on: ['dt-form.17', 'dt-form.24']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (Implementation Plan)
---

# Story dt-form.25 — Ambience Increase/Decrease action redesign (territory-row table, single selection)

As a player declaring an Ambience Increase or Decrease action,
I should see a territory-row table where each row has a RED DOWN arrow and a GREEN UP arrow, with **one direction on one row** selectable per action slot,
So that the choice surface is direct (territory + direction) and one Ambience action targets exactly one territory in exactly one direction.

## Context

The current `ambience_increase` and `ambience_decrease` action types within Personal Actions slots use generic target/direction inputs. Per Piatra (2026-05-06, FINAL clarification via Q2 follow-up 2026-05-06):

- **One territory affected per single Ambience action.**
- Multi-row table UX is fine for display (player sees all territories), but **only one row's UP/DOWN can be selected at a time per action slot**.
- If the player wants two ambience changes, they spend two project slots.

This supersedes the earlier "independently toggleable, multi-row allowed" interpretation. The action is single-target; the table is a display affordance, not a multi-selection surface.

Rules summary text: *"Success is +/-2 influence change to territory, +/-4 on exceptional success."*

### Files in scope

- `public/js/tabs/downtime-form.js` — the `ambience_increase` / `ambience_decrease` action render within project slots
- CSS — arrow-chip styling. Match existing chip patterns (`dt-chip` family) where possible.

### Files NOT in scope

- The underlying `projectActionEnum` — these actions remain in the list; only their UI shape changes
- Other project-slot action types (attack, feed, hide-protect, etc.) — out of scope
- The territory data source (live MongoDB territories collection, post-#3c)

## Acceptance Criteria

**Given** a player selects `ambience_increase` or `ambience_decrease` action type
**When** the action slot renders
**Then** a territory-row table renders. Each row has the territory name, a RED DOWN arrow chip, and a GREEN UP arrow chip. Both chips are visible at all times.

**Given** no row currently has a selection
**When** the player clicks any direction arrow on any row
**Then** that arrow becomes selected (highlighted) for that row. The clicked direction (UP or DOWN) is the action's chosen direction; the row's territory is the action's chosen target.

**Given** a row already has a direction selected
**When** the player clicks the same arrow again on the same row
**Then** the selection toggles off. The action slot is back to no-selection state.

**Given** a row already has a direction selected
**When** the player clicks the OPPOSITE direction on the same row
**Then** the selection switches to the new direction on the same row (UP becomes DOWN, or vice versa). The action retains the same territory; only direction changes.

**Given** a row already has a direction selected
**When** the player clicks any direction on a DIFFERENT row
**Then** the previous row's selection is cleared and the new row's clicked direction becomes the active selection. **At most one row can hold a selection at any time.**

**Given** the player wants to record two ambience changes
**When** they need a second target
**Then** they fill a separate project slot with another `ambience_*` action. Two ambience changes consume two project slots — the action is single-target by design.

**Given** the persistence
**When** the slot is saved
**Then** the selection is stored as a single (territory, direction) pair (e.g. `responses.project_N_ambience_target` and `responses.project_N_ambience_direction`).

_(Removed contradiction: an earlier draft AC mentioned a per-territory direction map shape. Superseded — Implementation Notes lock the single-pair shape per the FINAL Q2 follow-up clarification.)_

**Given** the rules summary needs to surface
**When** the action UI renders
**Then** the text "Success is +/-2 influence change to territory, +/-4 on exceptional success." appears near the table (above or below — implementer's call).

## Implementation Notes

**Action-type already collapsed at the form layer (Ptah survey 2026-05-07):** the form's `PROJECT_ACTIONS` (`downtime-data.js:10`) already uses a single `'ambience_change'` value. The legacy `'ambience_increase'`/`'ambience_decrease'` enum values survive only at:

1. **Schema `projectActionEnum`** (`downtime_submission.schema.js:27-34`) — out of sync (missing `'ambience_change'`, listing the two legacy values that the form never writes). Latent because schema validation is not enforced on the PUT route. **Fix opportunistically as part of this story:** add `'ambience_change'` to the enum; KEEP the legacy values for admin/parser back-compat.
2. **`SPHERE_ACTION_FIELDS`** (lines 186-187) — sphere-side code path with its own `ambience_change` + `ambience_dir` → legacy-enum normalisation at lines 691-693 + 735-737. **NOT in scope for this story.**
3. **Admin/parser** (`admin/downtime-views.js`, `downtime/parser.js`) — reads the legacy enums for CSV-imported submissions where `proj.action_type` is set by the CSV parser. Live-form submissions never trigger those branches because the form persists `ambience_change`. **Latent admin tally bug** (admin's `isIncrease`/`isDecrease` at `downtime-views.js:3138` never fires for form-saved ambience actions). Tracked as a separate follow-up; out of scope for this story.

**Persistence shape (lock):** single (territory, direction) pair per action slot, layered on top of the existing `ambience_change` action-type.
- `responses.project_N_action` = `'ambience_change'` (existing form value, unchanged)
- `responses.project_N_ambience_target` = territory `_id` string (NEW)
- `responses.project_N_ambience_direction` = `'up' | 'down'` (NEW)

The UI is direction-agnostic at the action-type-picker level — the player picks `Ambience` from the action-type dropdown, then picks the row + direction in the table. Drop the legacy `'target'` field from `ACTION_FIELDS['ambience_change']` (the row-table IS the territory picker; the legacy generic target zone becomes redundant). Any legacy `dt-project_N_ambience_dir` radios in the generic target zone fall away with `target` removal.

**Migration**: silent-leave per A1 precedent. Existing form drafts with the `ambience_change` action persist their legacy `_ambience_dir` value untouched (drop-the-iteration on collect — no else-write); the new render path reads the locked-shape fields. If a future hardening pass wants to migrate legacy `_ambience_dir` to the new `_ambience_direction` field, that's its own story.

## Test Plan

- Static review: arrow chips mutually exclusive per row; toggle-off works; persistence map shape sensible
- Browser smoke: pick a direction on a row; toggle off; pick on another row; reload; values persist

## Definition of Done

- [x] Territory-row table renders for ambience actions
- [x] At most one row holds a selection at any time per action slot (single-target design)
- [x] Clicking a different row clears the previous selection
- [x] Clicking the opposite direction on the same row switches direction (does NOT add a second selection)
- [x] Clicking the same arrow again toggles off
- [x] Rules summary text present
- [x] Persistence shape: single (territory, direction) pair per slot
- [x] PR opened into `dev` with `Closes #79`

## Dependencies

- **Upstream**: #17 (lifecycle); #24 (Personal Actions chrome strip — same render path for action slots; coordinate merge order)
- **Downstream**: none
