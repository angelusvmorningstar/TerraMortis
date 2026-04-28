---
id: npcr.10
epic: npcr
status: review
priority: high
depends_on: [npcr.6, npcr.7]
---

# Story NPCR-10: PC-to-PC mutual confirmation

As a player,
I want to propose a relationship with another PC that requires their acceptance,
So that we mutually agree on our in-character connection rather than one side imposing it.

---

## Context

One edge record, two confirm/decline endpoints, filtered dual-sided view. Oath of the Safe Word's mutual-sync pattern is a UX reference (button placement, copy tone, modal shape) but the storage shape differs: OotSW mirrors across character docs; this story uses one edge row queried from both sides.

Directionality: symmetric kinds (coterie, ally, rival) produce one active edge readable from both sides. Asymmetric kinds (sire-childe) preserve a → b ordering regardless of who initiated.

---

## Acceptance Criteria

**Given** I click Add Relationship and choose a PC-to-PC kind family **Then** the endpoint picker lists PCs not NPCs.

**Given** I select another PC and fill kind, disposition, and state **Then** POST creates an edge with `status='pending_confirmation', a=me, b=otherPc`.

**Given** the other PC opens their Relationships tab **Then** a banner appears "{My Character} wants to connect as {kind_label}. Accept / Decline."

**Given** they click Accept **Then** `POST /api/relationships/:id/confirm` sets status='active' AND appends a history row.

**Given** they click Decline **Then** `POST /api/relationships/:id/decline` sets status='rejected' AND appends history. **And** the edge is filtered out of both players' list views.

**Given** the initiator views their tab before confirmation **Then** the pending edge shows an "Awaiting {other PC}" chip.

**Given** the API receives a confirm or decline from a PC who is not endpoint `b` of the edge **Then** 403.

**Given** `direction='symmetric'` (e.g. coterie) **Then** a single active edge is readable from both sides.

**Given** `direction='a_to_b'` (e.g. sire-childe) **Then** directionality is preserved regardless of who initiated. **And** a is the sire, b is the childe.

**Given** Oath of the Safe Word has a comparable confirmation flow **Then** its UX (copy tone, button placement, modal shape) is referenced for consistency. Implementation diverges where OotSW mirrors across character docs; this story uses one edge row queried from both sides.

---

## Implementation Notes

- For asymmetric kinds, the picker needs to let the initiator specify which role they're claiming (if I propose sire-childe, am I the sire or the childe?). Capture via the kind dropdown variant or a second click
- Confirmation endpoints read the edge, verify caller is endpoint `b`, then mutate status and append history
- Rejected edges are NOT deleted (audit trail) but filtered from list views. Retired vs rejected: retired = consensually dissolved later; rejected = never accepted
- Reference the existing Oath of the Safe Word code paths during implementation; grep for "safe_word" in public/js/editor

---

## Files Expected to Change

- `public/js/tabs/relationships-tab.js` (banner + confirm/decline handlers)
- `server/routes/relationships.js` (confirm + decline endpoints, auth checks)
- `server/tests/api-relationships-mutual.test.js` (new)

---

## Definition of Done

- Initiator can propose PC-PC edge; recipient sees banner; accept flow produces active edge readable from both sides; decline flow produces rejected edge filtered from views
- Asymmetric kind preserves direction (verify via test)
- 403 on confirm/decline from wrong PC
- Quinn verification pass
- `bmad-code-review` required (new endpoints + auth boundary)

---

## Revision History

- **2026-04-24 r1**: initial draft from the epic.
- **2026-04-24 r2**: implemented. Notes:
  - **Picker mode**: added as a third chip ("Another PC") alongside "Existing NPC" / "New NPC (pending)" in the existing Add Relationship form — rather than a separate PC-PC picker flow. PC list sourced from `GET /api/characters/public` (already exposed to all authenticated users). Self-reference blocked client-side.
  - **Eligible kinds for PC-PC**: the subset where `typicalEndpoints.b === 'any'` (Lineage family + Political family + 'romantic' + 'other'). Mortal kinds (`family`, `contact`, `retainer`, `correspondent`) stay NPC-only. Touchstone is already excluded elsewhere.
  - **Duplicate-check scope expanded** to `status IN ('active', 'pending_confirmation')` so a player can't re-propose while a prior proposal is still unresolved. Applies to PC-NPC too.
  - **Initial status**: PC-PC player POSTs land as `pending_confirmation` with first history row `change: 'proposed'`. ST PC-PC POSTs remain `active` by design — ST can impose edges without asking.
  - **Transition endpoints**: `POST /:id/confirm` and `POST /:id/decline` registered above the ST guard. Gate: caller must be endpoint `b` (or ST), and the edge must be in `pending_confirmation`. Atomic update via `findOneAndUpdate({status: 'pending_confirmation'})` prevents double-apply.
  - **Banner**: rendered at the top of the Relationships tab for any edge where `b.type='pc'`, `b.id === char._id`, `status='pending_confirmation'`. Accept/Decline buttons hit the transition endpoints.
  - **Initiator chip**: existing `statusChip` for pending_confirmation now shows "Awaiting {other PC}" when caller is the initiator (endpoint a). Falls back to "awaiting confirmation" for recipient-side cards; the banner is the actionable surface there.
  - **Directionality**: kind codes carry direction semantics — e.g. `sire` means "a is sire of b", `childe` means "a is childe of b". Initiator picks the kind that matches their intended role. No separate role switch needed.
