---
id: npcr.4
epic: npcr
status: ready-for-dev
priority: high
depends_on: [npcr.2]
---

# Story NPCR-4: Character-sheet touchstone picker (Shape B bridge)

As an ST (player UI lands in NPCR.8),
I want character-sheet touchstone rows to pick real NPC records with the Humanity rating preserved,
So that touchstones stop being disconnected text and become part of the relationships graph.

---

## Context

Current character schema carries `touchstones[]` as free-text entries `{humanity, name, desc}` plus a disconnected `npcs[]` stub array with `touchstone_eligible` flag. This story introduces the Shape B bridge: the character holds IDs, the relationships collection holds records. `touchstone_meta.humanity` on the edge preserves the V:tR 2e mechanical Humanity anchor rating.

Legacy `touchstones[]` array stays in the schema during this story — deprecation happens in a follow-up story after NPCR.5 migration is verified.

---

## Acceptance Criteria

**Given** `relationship.schema.js` has an optional `touchstone_meta: { humanity: int 1..10 }` field **Then** it is present only when `kind='touchstone'`.

**Given** `character.schema.js` adds `touchstone_edge_ids: string[]` **Then** the sheet reads touchstones from this field.

**Given** I open a character sheet as ST **When** I view Touchstones **Then** each Humanity slot shows a picker with three options:
- Select existing NPC → creates edge with kind='touchstone', a=pc, b=npc, touchstone_meta.humanity=slot_rating, state=(blank or provided desc)
- Create new NPC → quick-add form (name + short description) creates npcs row (status='active' for ST) then creates the edge
- If slot already linked → View / edit state / remove controls

**Given** I save **Then** `character.touchstone_edge_ids[]` contains the relationship _ids. **And** server validates each listed edge exists, has kind='touchstone', and has the character as one endpoint.

**Given** an edge is deleted **Then** the character's `touchstone_edge_ids[]` is cleaned up (via DELETE hook on /api/relationships, or via next character save).

**Given** a character has only legacy `touchstones[]` (no touchstone_edge_ids) **Then** the sheet falls back to rendering legacy shape as read-only with a "migration required" badge.

**Given** the legacy `character.touchstones[]` array **Then** it remains in the schema during this story. Deprecation follows after NPCR.5 migration is verified.

---

## Implementation Notes

- Touchstone humanity slots are tied to the character's current Humanity rating; slot count = Humanity dots
- Server-side validation: on character save, walk `touchstone_edge_ids[]`, verify each edge exists, is kind='touchstone', and the character id is one endpoint
- Quick-add NPC from ST sheet uses existing `POST /api/npcs` (creates with status='active'). Player quick-add uses `/api/npcs/quick-add` from NPCR.8.
- NPC type discriminator (mortal/kindred/ghoul) is a Tier 4 polish; touchstone kind accepts any NPC in MVP

---

## Files Expected to Change

- `server/schemas/character.schema.js`
- `server/schemas/relationship.schema.js`
- `public/js/editor/sheet.js`
- `public/js/suite/sheet.js` (if touchstone row renders there too)
- `public/css/components.css`
- `server/tests/api-touchstone-edges.test.js` (new)

---

## Definition of Done

- Schema validates with new fields, round-trip verified
- In-browser (ST login): pick existing NPC as touchstone; create new NPC as touchstone; remove touchstone — all via the sheet picker
- Legacy `character.touchstones[]` still renders read-only when no `touchstone_edge_ids`
- Humanity rating preserved on every touchstone edge
- Quinn verification pass
- `bmad-code-review` required (schema change)
