---
id: npcr.11
epic: npcr
status: review
priority: high
depends_on: [npcr.3, npcr.6]
---

# Story NPCR-11: Player flags NPC for review

As a player,
I want to flag an NPC for ST review when something is off,
So that I can signal concern without being able to directly edit ST-owned records.

---

## Context

Client-side surface on top of the `POST /api/npc-flags` endpoint and resolution flow built in NPCR.3. "One open flag per (player, npc)" prevents spam; resolved flags show the ST's resolution note back to the flagger.

---

## Acceptance Criteria

**Given** I view my Relationships tab **Then** every NPC-endpoint edge card has a flag icon button with tooltip "Something off about this NPC?"

**Given** I click the flag icon **Then** a modal opens with a reason textarea and Submit button.

**Given** I submit **Then** `POST /api/npc-flags` creates a flag row with `npc_id, flagged_by={player_id, character_id}, reason, status='open'`.

**Given** I already have an open flag on this NPC **Then** the flag icon is replaced with a "Flagged · awaiting ST" chip. **And** the modal cannot be opened again until the flag resolves (one open flag per player per NPC, server-enforced).

**Given** an ST resolves the flag via NPCR.3 **Then** my NPC card updates to show "ST resolved · {resolution_note}" with a dismiss control.

**Given** I dismiss the resolved chip **Then** client local state clears. **And** the flag record stays in the DB as an audit trail.

**Given** POST `/api/npc-flags` from a player without an active relationship to the NPC **Then** 403 (auth check shared with NPCR.3).

---

## Implementation Notes

- Flag state per edge is queried via a new endpoint or baked into the existing `/api/relationships/for-character/:id` response (e.g. edge card augmented with `open_flag_for_me: boolean` and `recently_resolved_flag: {resolution_note, resolved_at} | null`)
- Dismiss-resolved stored in localStorage keyed by `npc_id` per character
- Modal uses existing confirmation-modal CSS patterns

---

## Files Expected to Change

- `public/js/tabs/relationships-tab.js` (flag button, modal, resolved chip, dismiss)
- `server/routes/npc-flags.js` (possibly: extend to return open-flag-for-me hint; auth check already exists)
- `server/routes/relationships.js` (if augmenting edge response with flag state)
- `server/tests/api-npc-flags-player.test.js` (new)

---

## Definition of Done

- Flag icon → modal → submit works end-to-end
- One open flag per (player, NPC) enforced client and server
- Resolved chip displays with ST's note; dismiss persists per character
- 403 verified for flag from unrelated player
- Quinn verification pass

---

## Revision History

- **2026-04-24 r1**: initial draft from the epic.
- **2026-04-24 r2**: implemented.
  - **Flag-state surfacing**: `GET /api/relationships/for-character/:id` now attaches `_flag_state` per NPC-endpoint edge: `{status:'open', reason, created_at}` for open flags; `{status:'resolved', resolution_note, resolved_at}` for resolved; absent when none. Most recent flag per (character_id, npc_id) wins. Keeps the flag system opaque to the client while driving UI state.
  - **Client**: flag icon (⚑) on NPC-endpoint edge cards by default; replaced by "⚑ Flagged" chip when an open flag exists (card is inert); replaced by "⚑ ST resolved · {note} ✕" chip when resolved. Resolved chip is dismissable — dismissal persists in localStorage `tm:rel_dismissed_flags:{charId}` keyed by `npc_id → resolved_at` (so a future resolution on the same NPC re-appears).
  - **Modal**: reuses the same NPCR.3 `.npcr-modal-overlay` theme (same styling used by the flag-resolve modal on the admin side). Esc / click-outside cancel, Ctrl/Cmd+Enter submits if reason is non-empty.
  - **Duplicate-flag handling**: server already 409s on a second open flag from the same player for the same NPC (NPCR.3 indexed constraint). Client treats 409 the same as success — just refreshes the tab, which will render the existing-open-flag chip.
  - **Server POST unchanged**: the existing `POST /api/npc-flags` from NPCR.3 handles auth + dedup. No route changes in this story.
