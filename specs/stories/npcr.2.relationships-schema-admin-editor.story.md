---
id: npcr.2
epic: npcr
status: ready-for-dev
priority: high
depends_on: [npcr.1]
---

# Story NPCR-2: Relationships schema and admin edge editor

As an ST,
I want a Relationships section on the NPC detail pane where I can create, edit, and retire typed edges,
So that I can model each NPC's connections to PCs and other NPCs.

---

## Context

Introduces the `relationships` collection, the closed-enum kind taxonomy module, and the admin-side edge editor surface. All edges are ST-created in this story; player-writable endpoints land in NPCR.6 and NPCR.7.

See `specs/epic-npcr.md` Context section for the full graph model.

---

## Acceptance Criteria

**Given** `server/schemas/relationship.schema.js` exists **Then** it defines fields `a{type,id}, b{type,id}, kind, direction, disposition, state, st_hidden, status, created_by, history[], created_at, updated_at` with `additionalProperties: false`.

**Given** multikey indexes are required **Then** `server/scripts/create-relationship-indexes.js` exists and produces indexes on `a.id` and `b.id` when run.

**Given** a starting kind taxonomy is needed **Then** `public/js/data/relationship-kinds.js` exists with the ~15 starting kinds, each carrying `{code, label, family, direction, typicalEndpoints, custom_label_allowed}`.

**Given** I open an NPC detail pane **Then** a "Relationships" section lists all edges involving this NPC, grouped by kind family (Lineage, Political, Mortal, Other).

**Given** I click "Add Relationship" **Then** a form opens: endpoint picker (PC or NPC), kind dropdown, optional disposition chip, optional freeform state, optional st_hidden toggle.

**Given** kind='other' **When** I save **Then** a `custom_label` field is required.

**Given** I save a new edge **Then** POST `/api/relationships` creates it with status='active', created_by={type:'st', id: me}, and initial history row `{at, by, change: 'created'}`.

**Given** I edit disposition, state, kind, or st_hidden and save **Then** PUT appends a history row recording before/after values.

**Given** I click Retire on an edge **Then** status='retired' and it renders muted.

**Given** the API receives identical endpoints (same type and id on both sides) **Then** it returns 400 VALIDATION_ERROR.

**Given** I am not ST **Then** POST, PUT, and DELETE on `/api/relationships` return 403.

---

## Implementation Notes

- `server/routes/relationships.js` is ST-only in this story. Player-readable `GET /for-character/:id` lands in NPCR.6.
- History writes are server-side on every mutation; never user-editable. Shape: `{at, by: {type, id}, change: string, fields?: {before, after}}`.
- Kind taxonomy starting list (from epic):
  - Lineage: sire, childe, grand-sire, clan-mate
  - Political: coterie, ally, rival, enemy, mentor, debt-holder, debt-bearer
  - Mortal: touchstone, family, contact, retainer, correspondent, romantic
  - Other: other (with custom_label)
- Endpoint picker for admin: PC list from `characters`, NPC list from `npcs` (both sourced via existing admin data)
- User runs `create-relationship-indexes.js` manually per project convention

---

## Files Expected to Change

- `server/schemas/relationship.schema.js` (new)
- `server/routes/relationships.js` (new)
- `server/index.js` (mount router)
- `server/scripts/create-relationship-indexes.js` (new, user runs manually)
- `public/js/data/relationship-kinds.js` (new)
- `public/js/admin/relationship-editor.js` (new)
- `public/js/admin/npc-register.js` (integrate editor into detail pane)
- `server/tests/api-relationships.test.js` (new, against tm_suite_test)

---

## Definition of Done

- Schema round-trip verified (write → read → edit → re-save with no additionalProperties errors)
- Indexes verified via MongoDB MCP `collection-indexes` tool
- API tests pass in `tm_suite_test`
- In-browser: create, edit, retire edge from NPC detail pane; verify history log grows on each change
- Save-failure errors surface visibly (no silent failure)
- Quinn verification pass
- `bmad-code-review` required (schema + auth-boundary change)
