---
id: npcr.9
epic: npcr
status: ready-for-dev
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
