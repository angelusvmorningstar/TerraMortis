---
id: npcr.3
epic: npcr
status: ready-for-dev
priority: high
depends_on: [npcr.2]
---

# Story NPCR-3: NPC flags collection and admin flag queue

As an ST,
I want an `npc_flags` collection and a Flagged queue in the admin NPC Register,
So that players can signal concerns about NPCs (via NPCR.11) and I can resolve them.

---

## Context

Establishes the flag model end-to-end on the server and the ST-side resolution UI. The player-facing flag creation UI lands in NPCR.11; the POST endpoint is implemented here with correct auth so NPCR.11 is pure client work.

---

## Acceptance Criteria

**Given** `server/schemas/npc_flag.schema.js` exists **Then** it defines fields `npc_id, flagged_by{player_id, character_id}, reason, status (open|resolved), resolved_by, resolved_at, resolution_note, created_at` with `additionalProperties: false`.

**Given** indexes are required **Then** `server/scripts/create-npc-flag-indexes.js` produces indexes on `status` and `npc_id` when run.

**Given** the ST-only route `GET /api/npc-flags?status=open` **Then** it returns open flags sorted by created_at desc.

**Given** ST-only `PUT /api/npc-flags/:id/resolve` accepts `{resolution_note}` **Then** status='resolved', resolved_by, resolved_at are set.

**Given** `POST /api/npc-flags` exists **Then** player must be authenticated AND have an active relationship edge to the flagged NPC. **And** reason is required. **And** it returns 403 if unauthorised, 400 if missing reason.

**Given** an NPC has open flags **Then** the NPC detail pane shows a red "Flagged · N" chip and a Flags section listing each flag with reason, flagged_by display name, and a Resolve button.

**Given** I click Resolve **Then** a modal opens for `resolution_note`. **And** saving calls the resolve endpoint. **And** the row shows muted.

**Given** the "Flagged" filter chip on the admin list is clicked **Then** the list filters to NPCs with at least one open flag. **And** the chip shows total open flag count.

---

## Implementation Notes

- Relationship check in POST: query `relationships` for any edge involving flagger's PC AND this NPC with status='active'. If none, return 403.
- One open flag per (player, npc) pair: enforced by composite uniqueness check on insert (client shouldn't allow, but server enforces too).
- Resolution note is optional; if blank, the resolution still records the resolver and timestamp.
- User runs the index script manually.

---

## Files Expected to Change

- `server/schemas/npc_flag.schema.js` (new)
- `server/routes/npc-flags.js` (new)
- `server/index.js` (mount router)
- `server/scripts/create-npc-flag-indexes.js` (new, user runs manually)
- `public/js/admin/npc-register.js` (add Flags section + chip count + Flagged filter behaviour)
- `server/tests/api-npc-flags.test.js` (new, against tm_suite_test)

---

## Definition of Done

- Schema round-trip verified
- Indexes verified via MongoDB MCP
- API tests pass; 403 on unauthorised POST verified
- In-browser: flagged chip appears when a test-seeded flag is inserted via MCP; resolve flow works end-to-end with resolution note
- Quinn verification pass
- `bmad-code-review` required (schema + auth-boundary change)
