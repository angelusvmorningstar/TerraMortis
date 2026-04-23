---
id: npcr.8
epic: npcr
status: ready-for-dev
priority: high
depends_on: [npcr.6, npcr.7]
---

# Story NPCR-8: Player quick-adds pending NPC inline

As a player,
I want to create a new pending NPC from the Add Relationship picker,
So that I can write about someone who does not yet exist as a record, without leaving the app.

---

## Context

Completes the player edge-creation flow. New `POST /api/npcs/quick-add` endpoint (player-writable) creates NPCs with `status='pending'` and `created_by={type:'player', ...}` for ST review. The companion relationship edge is created in the same UI flow.

---

## Acceptance Criteria

**Given** I click "Quick-add new NPC" **Then** an inline form appears with fields Name (required), Relationship note, General note.

**Given** I submit **Then** `POST /api/npcs/quick-add` creates an npcs row with `name, description=generalNote, notes=relationshipNote, status='pending', created_by={type:'player', player_id, character_id}`.

**Given** the NPC is created **Then** a relationship edge is auto-created in the same flow: `a=pc, b=newNpc, kind (player picks after quick-add), status='active', created_by={type:'pc', id:myChar}`.

**Given** a player has >=20 open pending NPCs across all characters **Then** quick-add returns 429 RATE_LIMIT.

**Given** a player submits two quick-adds within 30 seconds **Then** the second returns 429 (server-enforced, client-throttled too).

**Given** the ST filters the Register by "Pending" **Then** new player-created NPCs appear with a "Player-created · by {character name}" badge.

**Given** the ST sets a pending NPC to `status='active'` **Then** it moves out of the pending filter and appears in normal views.

---

## Implementation Notes

- Rate limit: server-side enforcement uses an in-memory Map keyed by player_id → last_quickadd_at (acceptable for a single-node deployment)
- Pending NPC cap: query `npcs` for count where `created_by.player_id=me AND status='pending'`; 20 hard limit
- Player-created badge in admin: join against `players` or `characters` collection by `created_by.character_id` to render the character's displayName
- The existing `POST /api/npcs` stays ST-only; quick-add is a dedicated player endpoint

---

## Files Expected to Change

- `public/js/tabs/relationships-tab.js` (quick-add form + flow)
- `server/routes/npcs.js` (new `/quick-add` endpoint)
- `public/js/admin/npc-register.js` (pending filter + player-created badge)
- `server/tests/api-npcs-quick-add.test.js` (new)

---

## Definition of Done

- Player quick-add → NPC + edge created in one flow, end-to-end browser-tested
- Rate limit (30s) verified
- Cap (20 pending per player) verified
- Admin Pending filter shows new NPCs with badge
- ST approval flow (pending → active) verified
- Quinn verification pass
- `bmad-code-review` required (new player endpoint)
