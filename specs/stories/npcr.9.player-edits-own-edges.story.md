---
id: npcr.9
epic: npcr
status: review
priority: high
depends_on: [npcr.6, npcr.7]
---

# Story NPCR-9: Player edits own side of own-created edges

As a player,
I want to edit state, disposition, and custom_label on relationships I created,
So that I can reflect the evolution of the relationship without bothering the ST for every tweak.

---

## Context

Scope is deliberately narrow: only edges where `created_by.type='pc' AND created_by.id=myChar`. ST-created edges are read-only to players (flag for review via NPCR.11 if change is needed). Field whitelist protects against scope creep.

---

## Acceptance Criteria

**Given** I view my Relationships tab **Then** edges where `created_by.type='pc' AND created_by.id=myChar` show an Edit button. **And** ST-created edges do not.

**Given** I click Edit **Then** a form opens with editable fields state (textarea), disposition (chip selector), custom_label (only when kind='other').

**Given** I save **Then** PUT `/api/relationships/:id` updates the edge AND appends a history row with before and after values.

**Given** a player PUT on an edge where `created_by.type !== 'pc'` OR `created_by.id` not in caller's `character_ids` **Then** 403.

**Given** a player PUT includes fields outside the whitelist (state, disposition, custom_label) **Then** those fields are silently ignored and a server-side warning is logged.

**Given** the state textarea exceeds 2000 characters **Then** the UI prevents submission. **And** server enforces the same cap as a 400.

---

## Implementation Notes

- Server PUT handler splits by role: ST body is trusted; player body is whitelisted to `{state, disposition, custom_label}` before `$set`
- Warning log format: `console.warn('[relationships] player attempted to modify field:', field, 'ignored for edge:', id)`
- History append is unchanged from NPCR.2 behaviour; every mutation logs before/after values

---

## Files Expected to Change

- `public/js/tabs/relationships-tab.js` (edit form + handler)
- `server/routes/relationships.js` (player PUT handler with whitelist)
- `server/tests/api-relationships-player-edit.test.js` (new)

---

## Definition of Done

- Player can edit own-created edge, history row appended
- Player cannot edit ST-created edge (Edit button absent; 403 on direct API call)
- Field whitelist verified: PUT with extra fields returns 200 but fields not changed; warning logged
- Cap verified at 2000 chars server-side
- Quinn verification pass
- `bmad-code-review` required (auth boundary + whitelist)

---

## Revision History

- **2026-04-24 r1**: initial draft. Edit-rights gate specified as `created_by.type='pc' AND created_by.id=myChar`.
- **2026-04-24 r2**: implemented. The `created_by.type='pc'` formulation is not schema-legal per NPCR.2 (`actorSchema.type` enum is `['st','player']`), so the gate redirects through `created_by_char_id: string` added in NPCR.7. Edit-rights check: `edge.status === 'active' AND edge.created_by_char_id ∈ caller.character_ids`. Also:
  - PUT /api/relationships/:id moved OUT of the ST-only `router.use` block; split-auth inside the handler matches the POST pattern from NPCR.7.
  - Existing `api-relationships.test.js` had a "player gets 403 on PUT" test that asserted the router-level guard. With PUT now checking existence first, a missing id returns 404; test updated to reflect the new semantic (player 403-on-not-owned covered in the new `api-relationships-player-edit.test.js`).
  - State cap is **player-only 2000 chars**; the schema's 4000 cap remains for ST writes. Checked after the whitelist is applied but before the diff/$set logic.
  - UI: Edit button appears on edge cards that pass the gate. Inline edit form replaces the card body (state textarea with live counter, 3-point disposition chips, custom_label for kind='other'). Same `apiRaw` pattern as the Add picker surfaces 403/409/400 as inline errors.
