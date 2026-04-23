---
id: dtosl.1
epic: dt-off-screen-life
status: review
priority: high
depends_on: []
---

# Story DTOSL-1: NPC Model — `is_correspondent` Flag + ST Toggle

As an ST,
I want to mark certain NPCs as "correspondents" (epistolary contacts),
So that players can select them from a filtered list in the Off-Screen Life section without seeing every NPC in the world.

---

## Context

Prereq for DTOSL-2 (Off-Screen Life choice selector). The `npcs` collection exists (`server/routes/npcs.js`, ST-only). Schema is in `server/schemas/investigation.schema.js`. Needs an `is_correspondent: boolean` field and an ST admin toggle so STs can promote an NPC to be eligible in the Correspondence dropdown.

---

## Acceptance Criteria

**Given** an ST is editing an NPC in admin
**When** the edit form renders
**Then** a checkbox labelled "Available as a correspondent" appears
**And** its current value reflects `npc.is_correspondent`

**Given** the ST toggles the checkbox and saves
**When** the save returns 200
**Then** the NPC document has `is_correspondent: true` (or `false`)

**Given** a non-ST user queries `/api/npcs?is_correspondent=true`
**Then** the request returns 403 (NPC routes remain ST-only for now)

**Given** the schema validator runs with a doc containing `is_correspondent: true`
**Then** it accepts the property

---

## Implementation Notes

- `server/schemas/investigation.schema.js` — add `is_correspondent: { type: 'boolean' }` to `npcSchema`.
- `server/routes/npcs.js` — no code change needed (existing upsert pattern persists additional fields).
- ST admin NPC edit view — locate the file (likely `public/js/admin/investigation-views.js` or `admin.html` inline). Add the checkbox in the edit form and include it in the save payload.
- GET list can stay ST-only for now; DTOSL-2 will introduce a player-facing filtered read endpoint that returns only correspondent NPCs linked to the calling player's character.
- Migration: none needed. Existing NPCs default to `is_correspondent: undefined` which is falsy.

---

## Files Expected to Change

- `server/schemas/investigation.schema.js`
- `public/js/admin/investigation-views.js` (or equivalent NPC edit file — confirm on implementation)
- Possibly `admin.html` if the NPC edit form is inline
