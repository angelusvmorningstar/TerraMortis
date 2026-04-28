---
id: npcr.6
epic: npcr
status: review
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
- Disposition chip colours visible in all three states (positive/neutral/negative)
- localStorage-based New/Updated badges work across reloads
- Quinn verification pass
- `bmad-code-review` required (auth boundary + new player endpoint)

---

## Revision History

- **2026-04-24 r1**: initial draft from the epic. Target entry point listed as `public/js/index.js`; disposition described as 5-point (`allied/friendly/neutral/strained/hostile`); pending PC-PC confirmation banner specified with live Accept/Decline handoff to NPCR.10.
- **2026-04-24 r2**: implemented against the current repo shape. Corrections:
  - Client entry is `public/js/app.js` (unified portal per the three-product vision 2026-04-20); the tab module is `public/js/tabs/relationships-tab.js`; HTML anchor is `<div id="t-relationships">` in `public/index.html`; sidebar registration is in the `MORE_APPS` array in `app.js` under `section: 'player'`.
  - Disposition is **3-point** (`positive / neutral / negative`) matching the NPCR.2 `DISPOSITION_ENUM`. Chip colours: positive=green accent, neutral=muted, negative=crim. The r1 five-point colour mapping is dropped.
  - Pending PC-PC confirmation banner is **deferred to NPCR.10**. NPCR.7 is PC-to-NPC only; no PC-PC edges can be created from the player side until NPCR.10 lands, so a banner now would be dead UI. Banner + Accept/Decline flow ship together when NPCR.10 is built.
  - "Updated" chip label is bare — the chip shows `Updated ✕` (dismiss control) with no sub-text. `history[].change` is too generic (`created`/`updated`/`retired`) to be worth displaying; per-field delta summaries deferred unless the bare label proves unclear.
  - Server endpoint returns each edge with `_other_name` attached (NPC or PC on the far side of this character), so the client doesn't need ST-only GETs to resolve names. The enrichment mirrors the `character._touchstones[i]._npc_name` pattern from NPCR.4.
  - Collapsible family state persists per character in `tm:rel_family_collapsed:{charId}` alongside `tm:rel_last_seen:{charId}` and `tm:rel_dismissed_updates:{charId}`.
