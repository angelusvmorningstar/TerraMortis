---
id: dtosl.3
epic: dt-off-screen-life
status: ready-for-dev
priority: medium
depends_on: [dtosl.1, dtosl.2, NPC6.1]
---

# Story DTOSL-3: ST-Suggested NPC — Confirm or Reject

> **2026-04-27 SEQUENCING NOTE**
>
> This story renders ST-flagged NPCs to the player. It must ship **after Epic 6 NPC6.1** (server-side query-level scoping on `/api/npcs`). Reason: the suggested-NPC fetch path needs to be subject to the same role-scoped privacy filter as the rest of the NPC API, otherwise the implementation could inadvertently bypass the scope and expose unrelated NPCs.
>
> Story logic itself does not conflict with Epic 6 — these are NPCs explicitly linked to the player's character via `st_suggested_for`, so they pass the privacy gate by design. The dependency is purely about ensuring NPC6.1's server-side gate is the foundation everything reads through.

As a player,
I want to accept or reject NPCs that the ST has suggested for my character,
So that I have a light-touch say in which NPCs enter my story without having to message the ST separately.

---

## Context

Replaces the existing "Story direction" sub-section in Personal Story: Off-Screen Life. When an NPC is flagged as ST-suggested for a character, the player sees it in the DT form with Confirm / Reject controls. Rejection opens a small text field for the player to describe what they'd prefer instead.

Depends on DTOSL-1 (NPC model baseline). Needs an additional flag on the NPC record — `st_suggested: boolean` OR a per-character suggestion relationship. Below notes both options; pick one on implementation.

---

## Acceptance Criteria

**Given** an ST has marked an NPC as "suggested" for a character
**When** that character's player opens Personal Story: Off-Screen Life
**Then** the suggested NPC(s) appear in a "Suggested from your ST" card
**And** each card shows: NPC name, short description, two buttons: "Confirm" and "Reject"

**Given** the player clicks Confirm
**When** the click fires
**Then** a confirmation is recorded on the submission (`responses.st_suggested_<npc_id>: 'confirmed'`)
**And** the card collapses to a small chip "Confirmed · [name]"

**Given** the player clicks Reject
**Then** a small text field appears labelled "What would you prefer? (optional)"
**And** on submit, `responses.st_suggested_<npc_id>: 'rejected'` and `responses.st_suggested_<npc_id>_preference: <text>` persist

**Given** the player has neither confirmed nor rejected
**When** the form is submitted
**Then** the ST-suggested cards persist in an unaddressed state (no status recorded)

**Given** the old "Story direction" field existed on the form
**Then** it is removed from the Personal Story: Off-Screen Life section (data preserved in legacy field for historical read)

---

## Implementation Notes

- **Data model — two options** (pick in implementation):
  - **A)** Add `st_suggested_for: string[]` (character IDs) to NPC doc. Render-side: query NPCs where `st_suggested_for` includes the active character.
  - **B)** New collection `npc_suggestions: { character_id, npc_id, created_at, created_by }`. More normalised but adds a table.
  - Recommendation: A. Simpler, fewer queries, matches existing `linked_character_ids` pattern.
- **ST admin UI** — add a chip selector or checkbox to mark NPCs as ST-suggested for one or more characters.
- **Schema additions** to `responses`:
  - Dynamic keys: `st_suggested_<npc_id>: { type: 'string', enum: ['confirmed', 'rejected', ''] }`
  - `st_suggested_<npc_id>_preference: { type: 'string' }`
- **Remove "Story direction" field** from the Off-Screen Life render. Legacy submissions keep the data in `responses.story_direction` (read-only in historical views).
- **UI**: match existing suggestion card patterns (e.g. the DT early-access toggle). Confirm/Reject buttons styled as standard `.qf-btn`.

---

## Files Expected to Change

- `server/schemas/investigation.schema.js` (add `st_suggested_for` to npcSchema)
- `server/schemas/downtime_submission.schema.js` (allow dynamic `st_suggested_<id>` keys via `additionalProperties: true` — already the case)
- `public/js/admin/investigation-views.js` (or NPC edit file)
- `public/js/tabs/downtime-form.js`
- `public/css/components.css`
