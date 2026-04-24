---
id: npcr.8
epic: npcr
status: review
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
- Admin Pending filter shows new NPCs with badge (already shipped in NPCR.1; verify)
- ST approval flow (pending → active) verified
- Quinn verification pass
- `bmad-code-review` required (new player endpoint)

---

## Revision History

- **2026-04-24 r1**: initial draft from the epic. Spec said the edge carries `created_by={type:'pc', id:myChar}`; implied a two-phase UX ("inline form appears with fields Name, Relationship note, General note" → then "kind (player picks after quick-add)").
- **2026-04-24 r2**: implemented. Notes:
  - **`created_by.type='pc'` rejected** — same NPCR.2 schema constraint as NPCR.7. Player-created edges carry `created_by={type:'player', id:discord}` plus `created_by_char_id: myChar`. No story-spec change to the edge shape is needed beyond what NPCR.7 already locked in.
  - **Admin side already shipped** via NPCR.1: `public/js/admin/npc-register.js` already has the pending filter chip (line 104), the pending status CSS class, and a creator label at line 425 rendering `charNameFor(created_by.character_id)`. No admin work in this story.
  - **NPC schema already prepared** via DTOSL.5 stub: `investigation.schema.js` line 64 already defines `created_by: {type:'player'|'st', player_id, character_id}`. No schema change.
  - **One-form UX** with a mode toggle at the top of the picker: "Existing NPC" vs "New NPC (pending)". Single Save submits both (client orchestrates `POST /api/npcs/quick-add` → use returned `_id` → `POST /api/relationships`). If the edge POST fails after the NPC is created, the pending NPC persists and the ST sees it in the register — acceptable per design call.
  - **Rate limit key** is `req.user.player_id` (Mongo id) falling back to `req.user.id` (Discord) — stable across Discord account changes.
  - **Client-side throttling**: Save button disables during the in-flight request; server enforces the real 30s gate.
  - **Test helper**: exported `_resetQuickAddRateLimit` from `routes/npcs.js` so tests can clear in-memory state between blocks. `beforeEach` also deletes player-created NPCs from `p-player-*` test ids to keep the cap test deterministic.
