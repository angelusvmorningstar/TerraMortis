---
id: dt-form.25
task: 25
epic: epic-dt-form-mvp-redesign
status: Draft
priority: medium
depends_on: ['dt-form.17', 'dt-form.24']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (Implementation Plan)
---

# Story dt-form.25 — Ambience Increase/Decrease action redesign (territory-row table)

As a player declaring an Ambience Increase or Decrease action,
I should see a territory-row table where each row has a RED DOWN arrow and a GREEN UP arrow, each independently toggleable,
So that the choice surface is direct (territory + direction) rather than a generic target/Increase/Decrease form.

## Context

The current `ambience_increase` and `ambience_decrease` action types within Personal Actions slots use generic target/direction inputs. Per Piatra (2026-05-06, clarified 2026-05-06 follow-up):
- One row per territory
- Each row has both a RED DOWN arrow and a GREEN UP arrow as toggleable selectors
- Each direction is **independently toggleable**: click to select that direction; click again to deselect
- Both selectors stay visible at all times (do not collapse on selection)
- The original brief's "mutually exclusive per row" language was relaxed to "independently toggleable" in the follow-up clarification

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

**Given** the player clicks the GREEN UP arrow on a row
**When** the chip toggles
**Then** the GREEN UP is selected (highlighted) for that row. The RED DOWN remains visible. Other rows are unaffected.

**Given** the GREEN UP arrow is selected for a row
**When** the player clicks the GREEN UP arrow again on the same row
**Then** the selection toggles off. The arrow returns to its unselected state.

**Given** the player clicks the RED DOWN arrow on the same row that already has GREEN UP selected
**When** the chip toggles
**Then** RED DOWN becomes selected. **GREEN UP and RED DOWN are independently toggleable per Piatra's 2026-05-06 follow-up clarification** — both directions may be selected simultaneously on the same row if the player chooses. The form does not enforce mutual exclusivity at the UI level.

**Given** a player has selected directions on multiple rows
**When** they click an arrow on a different row
**Then** all rows can hold independent selections — the table allows multi-row selection.

**Given** the form persists
**When** the slot is saved
**Then** the selections persist as a per-territory direction map (e.g. `responses.project_N_ambience_targets = { '<terr_id>': 'up' | 'down' }`).

**Given** the rules summary needs to surface
**When** the action UI renders
**Then** the text "Success is +/-2 influence change to territory, +/-4 on exceptional success." appears near the table (above or below — implementer's call).

## Implementation Notes

Both action types (`ambience_increase` and `ambience_decrease`) collapse to the same UI shape. The action-type field is retained in `responses` for historical reasons but the UI doesn't ask the player to pick "increase or decrease" before the table — they just pick directions per row.

If the per-action-type distinction (increase vs decrease) is no longer meaningful post-redesign, surface to Piatra during pickup as a simplification candidate (collapse to one action type called `ambience` with directions per territory).

## Test Plan

- Static review: arrow chips mutually exclusive per row; toggle-off works; persistence map shape sensible
- Browser smoke: pick a direction on a row; toggle off; pick on another row; reload; values persist

## Definition of Done

- [ ] Territory-row table renders for ambience actions
- [ ] RED DOWN / GREEN UP arrows mutually exclusive per row, toggle-off reveals both
- [ ] Rules summary text present
- [ ] Persistence shape documented in DAR
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #17 (lifecycle); #24 (Personal Actions chrome strip — same render path for action slots; coordinate merge order)
- **Downstream**: none
