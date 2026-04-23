---
id: npcr.7
epic: npcr
status: ready-for-dev
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
- NPC picker filters to status='active' and excludes archived/pending
- Quinn verification pass
- `bmad-code-review` required (auth boundary)
