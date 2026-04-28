---
id: npcr.7
epic: npcr
status: review
priority: high
depends_on: [npcr.6]
---

# Story NPCR-7: Player creates PC-to-NPC edge (pick existing)

As a player,
I want to create a relationship between my PC and an existing NPC from the Relationships tab,
So that I can record a connection without having to ask the ST.

---

## Context

The first player-writable operation on the relationships graph. Quick-add (creating a new pending NPC inline) is NPCR.8; this story is strictly pick-from-existing.

---

## Acceptance Criteria

**Given** I am on the Relationships tab **Then** an "Add Relationship" button is present in the header.

**Given** I click it **Then** a picker opens with options "Link to existing NPC" and "Quick-add new NPC" (the latter is gated behind NPCR.8 until that ships).

**Given** I pick "Link to existing NPC" **Then** a searchable list of NPCs with `status='active'` opens.

**Given** I select an NPC **Then** a kind dropdown appears, filtered to PC-to-NPC kinds via `relationship-kinds.js` metadata.

**Given** I pick kind and optionally set disposition and state **Then** Save calls `POST /api/relationships` with `a={type:'pc', id:myChar}, b={type:'npc', id:selectedNpc}, status='active', created_by={type:'pc', id:myChar}`.

**Given** the API receives a POST where `a.type='pc'` and `a.id` is not in caller's `character_ids` **Then** 403.

**Given** an identical edge (same endpoints and kind) with `status='active'` already exists **Then** 409 CONFLICT.

**Given** the edge is created **Then** the tab refreshes and the new edge appears under the correct family.

---

## Implementation Notes

- Player POST handler is a new branch inside `server/routes/relationships.js` that splits auth: ST can create any edge; player can only create edges where `a` is one of their own characters
- NPC picker: searchable list sourced from `/api/npcs?status=active` (existing ST-only endpoint; extend to allow player reads since list is effectively public within the app now) OR a new restricted endpoint that returns minimal public fields (name, description, id). Simpler: reuse existing ST endpoint and add a minimal-read variant for players if needed
- Kind filter metadata: each entry in `relationship-kinds.js` carries `typicalEndpoints: ['pc-pc', 'pc-npc']`; picker filters accordingly

---

## Files Expected to Change

- `public/js/tabs/relationships-tab.js` (picker UI, post handler)
- `server/routes/relationships.js` (player-writable POST branch)
- `server/routes/npcs.js` (possibly: player-readable minimal listing — confirm on implementation)
- `server/tests/api-relationships-player-create.test.js` (new)

---

## Definition of Done

- Player can create a PC-to-NPC edge end-to-end
- 403 verified for POST with someone else's character_id
- 409 verified for duplicate active edge
- NPC picker filters to status IN ('active', 'pending') — excludes archived (r2 correction)
- Quinn verification pass
- `bmad-code-review` required (auth boundary)

---

## Revision History

- **2026-04-24 r1**: initial draft from the epic. Spec said `created_by={type:'pc', id:myChar}`; said picker filters to `status='active'` only; did not specify touchstone exclusion or how broad the NPC listing should be.
- **2026-04-24 r2**: implemented. Corrections + decisions:
  - **`created_by.type='pc'` rejected** — NPCR.2 locked `actorSchema.type` enum to `['st', 'player']`, so player-created edges now carry `created_by={type:'player', id:discord_user_id}` plus a new optional schema field `created_by_char_id: string` set to the PC endpoint id. NPCR.9 reads `created_by_char_id` for edit-rights scoping. (NPCR.9 spec needs the same correction when it lands.)
  - **Touchstone kind excluded** from the player picker. Touchstones live on `character.touchstones[]` and are managed by the NPCR.4 sheet picker. Server-side: POST with `kind='touchstone'` as a player returns 400 with a message redirecting the user to the character sheet.
  - **NPC directory endpoint**: new `GET /api/npcs/directory`, any authenticated user, returns minimal projection (`_id, name, description, status, is_correspondent`) for NPCs with `status IN ('active', 'pending')` — includes pending so player-quick-added NPCs from NPCR.8 remain pickable.
  - **Duplicate-edge policy**: strict `{a.type, a.id, b.type, b.id, kind, status='active'}` uniqueness. Reversed endpoints are a *different* edge (a/b carry directional meaning). Same NPC mentoring multiple PCs is allowed (distinct `a.id`).
  - **Kind dropdown** is grouped by family (Lineage / Political / Mortal / Other) via `<optgroup>`, matching the admin editor pattern.
  - Test helper (`server/tests/helpers/test-app.js`) did not mount `/api/npcs`; added the mount to unblock the new test file.
