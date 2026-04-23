---
id: dtosl.2
epic: dt-off-screen-life
status: review
priority: high
depends_on: [dtosl.1]
---

# Story DTOSL-2: Off-Screen Life — Correspondence/Touchstone/Other Choice + Contextual Dropdown

As a player,
I want to pick how I spend off-screen time (a letter, a touchstone moment, or something else) with a clear NPC/person dropdown for each choice,
So that my narrative prompt is steered by who I'm engaging with.

---

## Context

Personal Story: Off-Screen Life currently leans on a free-text "Story direction" field. This story replaces that with a three-way choice (Correspondence / Touchstone / Other) where each choice reveals a different dropdown sourced from distinct data:
- **Correspondence** — NPCs where `is_correspondent: true` AND linked to this character
- **Touchstone** — character's mortal Touchstones (from Touchstone merit data)
- **Other** — any NPC linked to this character

Depends on DTOSL-1 (correspondent flag). Also supersedes DTR-2's temporary move of Correspondence — this story formally replaces the old Correspondence field.

---

## Acceptance Criteria

**Given** a player opens Personal Story: Off-Screen Life
**When** the section renders
**Then** three radio chips are shown: Correspondence / Touchstone / Other
**And** no dropdown or text area appears until one is selected

**Given** the player picks Correspondence
**Then** a dropdown appears listing NPCs where `is_correspondent === true` AND the NPC is linked to this character (via `linked_character_ids`)

**Given** the player picks Touchstone
**Then** a dropdown appears listing the character's mortal Touchstones (read from character's Touchstone merit / touchstone data)

**Given** the player picks Other
**Then** a dropdown appears listing every NPC linked to this character (no correspondent filter)

**Given** a dropdown has no entries
**Then** it renders with placeholder "No [correspondents / touchstones / linked NPCs] available. Ask your ST."

**Given** the player changes the choice
**When** a different option is picked
**Then** the dropdown resets and shows the new filtered list

**Given** the player submits
**Then** the submission persists:
- `responses.osl_choice` — one of `correspondence | touchstone | other`
- `responses.osl_target_id` — NPC `_id` or touchstone identifier
- `responses.osl_target_type` — `npc` or `touchstone`

---

## Implementation Notes

- **Schema additions** (`server/schemas/downtime_submission.schema.js`):
  - `responses.osl_choice: { type: 'string', enum: ['correspondence', 'touchstone', 'other', ''] }`
  - `responses.osl_target_id: { type: 'string' }`
  - `responses.osl_target_type: { type: 'string', enum: ['npc', 'touchstone', ''] }`
- **New player-readable NPC endpoint** — `GET /api/npcs/for-character/:character_id` returning only NPCs with `linked_character_ids` including `character_id`. Optional query param `?is_correspondent=true`. Auth: player if their `character_ids` includes the param; ST always.
- **Touchstone data source** — read from character's Touchstone merit `benefit_grants` or equivalent. Confirm data path on implementation.
- **UI**: chip-style radio selector (match existing `.qf-chip-group` pattern). Dropdown renders below, no animation needed.
- **Legacy `correspondence` field** — keep the schema key for backwards-compat read only; don't emit on new submissions.
- **Cross-reference DTR-2**: this story supersedes DTR-2's move of the old Correspondence field. If DTR-2 ships first, this story removes that textarea and replaces with the new choice structure.

---

## Files Expected to Change

- `server/schemas/downtime_submission.schema.js`
- `server/routes/npcs.js` (new player-readable endpoint)
- `public/js/tabs/downtime-form.js`
- `public/js/data/helpers.js` (touchstone lookup helper if new)
- `public/css/components.css`
