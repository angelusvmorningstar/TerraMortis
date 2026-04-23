---
id: dtosl.5
epic: dt-off-screen-life
status: ready-for-dev
priority: medium
depends_on: [dtosl.2]
---

# Story DTOSL-5: Inline Quick-Add NPC

As a player,
I want to add a new NPC to my story without leaving the DT form,
So that I can capture a name/relationship/note in the moment rather than dropping my draft to message the ST.

---

## Context

The DTOSL-2 dropdowns list existing NPCs. Sometimes a player wants to write about someone that doesn't exist yet (a barista, a distant cousin, a contact overheard in a bar). Give them a short "Add an NPC" control that creates a pending NPC record scoped to the character, for ST review.

---

## Acceptance Criteria

**Given** the player is in Personal Story: Off-Screen Life
**When** they click "Add an NPC" next to an NPC dropdown
**Then** a small inline form appears with three fields:
- Name (required)
- Relationship (to this character — free text)
- General note (short textarea)

**Given** the player fills in name and submits the quick-add
**When** the submit returns 200
**Then** a new NPC document is created with:
- `name`, `description` (from general note), `notes` (from relationship)
- `linked_character_ids: [currentCharacterId]`
- `status: 'pending'` (new status for player-created NPCs)
- `created_by: { type: 'player', player_id, character_id }`
**And** the new NPC immediately appears in the active dropdown and is auto-selected

**Given** an ST opens the NPC admin view
**When** they see a pending NPC
**Then** it's visually tagged "Player-created · awaiting review"
**And** the ST can edit/approve/archive like any other NPC

**Given** the ST approves the pending NPC
**When** they set `status: 'active'`
**Then** the NPC appears in the Other dropdown for any character it's linked to

**Given** an authenticated non-ST player posts to the quick-add endpoint
**Then** the request is accepted ONLY if `linked_character_ids` contains one of the player's `character_ids`

---

## Implementation Notes

- **Schema**: add `status` enum value `'pending'` if not already present; add `created_by: { type: 'object' }` to `npcSchema`.
- **New endpoint**: `POST /api/npcs/quick-add` — auth: any authenticated player. Validation: `linked_character_ids` must include a character_id from the caller's `req.user.character_ids`. Sets `status: 'pending'` and `created_by` automatically.
- **Existing `POST /api/npcs`** stays ST-only. Quick-add goes through the dedicated endpoint.
- **UI**:
  - "Add an NPC" link next to each DTOSL-2 dropdown
  - Inline mini-form (collapsible) with 3 fields + Save/Cancel buttons
  - On save: POST, await response, inject new NPC into dropdown data, select it
- **ST admin view**:
  - Filter chip: "Pending · N" that narrows to `status: 'pending'`
  - On each pending NPC card: show "Created by <player name> for <character>" badge
- **Avoid spam**: client-side rate-limit (1 quick-add per 30 seconds) + a hard cap of 20 pending NPCs per character. Return 429 if exceeded.

---

## Files Expected to Change

- `server/schemas/investigation.schema.js`
- `server/routes/npcs.js` (new quick-add endpoint, player-accessible)
- `public/js/tabs/downtime-form.js`
- `public/js/admin/investigation-views.js` (pending filter + badge)
- `public/css/components.css`
