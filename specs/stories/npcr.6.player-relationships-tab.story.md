---
id: npcr.6
epic: npcr
status: ready-for-dev
priority: high
depends_on: [npcr.2]
---

# Story NPCR-6: Player Relationships tab scaffold and list view

As a player,
I want a Relationships tab under the Player section showing only my PC's edges,
So that I have a single home for viewing who my character is connected to.

---

## Context

Introduces the player-facing surface of the graph. Every query from this tab filters by "edge involves me" AND `st_hidden !== true` (NFR1/NFR2). Web visualisation is Tier 4; MVP is list view only.

State-in-UI banners (new-edge, updated-edge, pending confirmation) land in this story using localStorage-tracked `relationships_last_seen_at` per character. No notification subsystem.

---

## Acceptance Criteria

**Given** I am logged in with at least one character **Then** a "Relationships" tab appears in the Player section sidebar.

**Given** I click the tab **Then** a list renders edges involving my active character.

**Given** I have multiple characters **Then** a character selector is present and each character sees only their own edges.

**Given** the list loads **Then** edges are grouped by kind family (Lineage, Political, Mortal, Other) with collapsible sections.

**Given** an edge card **Then** it displays other-endpoint name, kind label, disposition chip (coloured or muted), state text (truncated with click-to-expand), and a status chip if non-active.

**Given** an edge has `status='pending_confirmation'` initiated by another PC **Then** an Accept or Decline banner appears at the top of the tab (flow in NPCR.10).

**Given** an edge has `st_hidden: true` **Then** it never appears in the list.

**Given** a new endpoint `GET /api/relationships/for-character/:characterId` exists **Then** caller must own the character or be ST. **And** returns edges with `status IN ('active','pending_confirmation')` AND `st_hidden !== true`.

**Given** an ST calls the same endpoint **Then** all edges including hidden and retired are returned.

**Given** a player calls it for a character they do not own **Then** 403.

**Given** I view my Relationships tab **When** an ST has created a new edge involving my PC since my last tab visit **Then** the edge card shows a "New" badge. **And** the badge clears on the next reload after I've seen it.

**Given** I view an edge **When** its most recent history entry has `by.type='st'` and was written since my last tab visit **Then** the card shows an "Updated · {change summary}" chip with a dismiss control. **And** dismiss persists across reloads via client-side state.

**Given** client-side state tracks `relationships_last_seen_at` per character in localStorage **Then** server does not need to track read-state. Notification infrastructure remains out of scope.

---

## Implementation Notes

- `GET /api/relationships/for-character/:characterId` auth check mirrors DTOSL.2's `/api/npcs/for-character` pattern: caller owns character OR is ST
- Kind family grouping driven by `relationship-kinds.js` metadata (NPCR.2)
- Disposition chip colouring defined in CSS tokens: allied=green, friendly=softer-green, neutral=grey, strained=amber, hostile=crim
- localStorage key format: `tm:rel_last_seen:{character_id}` → ISO timestamp
- Comparison for "New" / "Updated": `history[last].at > last_seen_at`

---

## Files Expected to Change

- `public/js/tabs/relationships-tab.js` (new)
- `public/js/index.js` (sidebar entry + tab wiring)
- `index.html` (tab anchor)
- `server/routes/relationships.js` (add for-character endpoint)
- `public/css/components.css` (edge cards, disposition chips, banners, badges)
- `server/tests/api-relationships-for-character.test.js` (new)

---

## Definition of Done

- ACs verified in-browser for a player with active character
- `st_hidden: true` edge never appears in player query (verify by inserting hidden test edge)
- Query isolation verified: player A cannot see player B's edges
- Disposition chip colours visible in all states
- localStorage-based New/Updated badges work across reloads
- Quinn verification pass
- `bmad-code-review` required (auth boundary + new player endpoint)
