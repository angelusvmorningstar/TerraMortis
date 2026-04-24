---
status: ready-for-dev
version: "0.1"
date: "2026-04-24"
author: Angelus
projectType: web_app
projectContext: brownfield
complexity: medium
workflowType: epic
workflow: create
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - party-mode-session-2026-04-24
  - specs/architecture.md
  - CLAUDE.md
  - C:/Users/angel/.claude/projects/D--Terra-Mortis-TM-Suite/memory/reference_npc_schema.md
  - server/schemas/investigation.schema.js
  - server/routes/npcs.js
---

# Epic NPCR: NPC Register and Relationships

## Goal

Replace the disconnected NPC data surfaces (basic embedded admin panel, character-sheet touchstone text fields, DT form hardcoded three-way choice) with a coherent graph of typed relationships between PCs and NPCs, backed by a first-class admin NPC Register and a new player-facing Relationships tab. Unblock the pending DTOSL stories and gate-open downtime story work that has been waiting on real NPC data.

## Why

1. Downtime is gated on having real NPC records. The existing DT form "Correspondence / Touchstone / Other" selector is a stub; players cannot tell stories involving NPCs who do not yet exist as records.
2. Touchstones on character sheets are currently free text, disconnected from any persistent model. This contradicts the game concept that touchstones are specific, tracked entities.
3. ST plot work needs a model of evolving relationships, not a flat list of names. The story lives on the edge (how does Alice feel about Mammon this month), not on the node.
4. Players have no structured way to propose, accept, or dispute NPC-related story elements. All such communication currently happens outside the app.
5. DTOSL.3 and DTOSL.5 have been blocked for weeks on the absence of a proper admin surface for NPC linkage and suggestion.

## Context: Model

Three collections underpin the epic.

**`npcs`** — ST-owned person records.
- Fields: `name`, `description`, `status`, `notes`, `st_notes`, `created_by`, `created_at`, `updated_at`
- Legacy fields on existing records (`linked_character_ids`, `is_correspondent`) are migrated to relationship edges and deprecated.

**`relationships`** — typed edges between PCs and NPCs.
- Endpoints: `a: { type: 'pc' | 'npc', id }`, `b: { type: 'pc' | 'npc', id }`
- `kind`: closed enum (~15 starting values) with `'other'` + `custom_label` escape hatch. Inverse pairs (`sire`/`childe`, `debt-holder`/`debt-bearer`) are kept as peer codes intentionally — users pick the code matching their entry-time mental frame; graph aggregation uses the `family` field (not individual codes), and duplicate-inverse detection is a client-side concern for player-creation flows (NPCR.6).
- `direction`: `'a_to_b'` or `'mutual'` (schema is technical; player-facing UIs render as natural language — e.g. "is sire of" / "mutual"). The kinds-module `direction` field (`'directed'`/`'mutual'`) is a per-kind *category* that controls picker defaults; `defaultDirectionFor()` translates to the schema instance vocabulary.
- `disposition`: optional enum (`positive | neutral | negative`) — 3-point for MVP; expandable later if needed
- `state`: freeform text capturing the current relationship narrative
- `history[]`: append-only log of changes. Each row: `{at, by: {type, id}, change, fields?: [{name, before, after}]}` — `fields` is an array of per-field deltas so the history UI can render "X changed from A to B" cleanly.
- `status`: `active | pending_confirmation | rejected | retired`
- `st_hidden`: boolean. When true, players never see the edge even if their PC is on it.
- `created_by`: `{ type: 'st' | 'player', id }` — id is the Discord id of the acting user
- `visibility rule`: every player query is filtered to "edge involves me" AND `st_hidden !== true`. There is no public directory.

**`npc_flags`** — lightweight player-to-ST signal.
- Fields: `npc_id`, `flagged_by: { player_id, character_id }`, `reason`, `status: 'open' | 'resolved'`, `resolved_by`, `resolved_at`, `resolution_note`, `created_at`
- Player flags an NPC they're unhappy with. ST sees in queue, edits the NPC, resolves the flag with an optional note. Players never directly edit NPC records.

**Kind taxonomy** (starting set, defined in a data module; expandable via code change):
- Blood / lineage: sire, childe, grand-sire, clan-mate
- Political / coterie: coterie, ally, rival, enemy, mentor, debt-holder, debt-bearer
- Mortal attachment: touchstone, family, contact, retainer, correspondent, romantic
- Other: other (with `custom_label`)

**PC-PC mutual confirmation** follows the Oath of the Safe Word pattern: a single relationship record with `status: 'pending_confirmation'` until both PCs accept. Cross-reference OotSW implementation during story drafting.

## Context: Tiers

**Tier 1 — Foundation** (ST-side only, no player-visible changes)
Schema + migrations + admin NPC Register tab + admin edge editor + character-sheet touchstone picker bridge.

**Tier 2 — Player Agency** (gate-opener for DT)
Player Relationships tab (list view only, web visual deferred), PC-to-NPC edge creation, PC-to-PC mutual confirmation, NPC flagging, state-in-UI banners.

**Tier 3 — DT Form Rewiring**
DT form story-moment picker reads from relationships, tailors prompts by kind, retires the hardcoded three-way choice.

**Tier 4 — Deferred** (out of MVP)
Relationship web visualisation (Cytoscape), timeline view per edge, NPC-NPC graph browser for ST, notification subsystem, public directory.

## Requirements Inventory

### Functional Requirements

**Tier 1 — Foundation**
- FR1: ST can create, edit, retire, and delete NPCs in a dedicated NPC Register admin tab, accessed as a first-class sidebar item.
- FR2: An NPC record holds: `name`, `description`, `status`, `notes`, `st_notes`, `created_by`, `created_at`, `updated_at`.
- FR3: ST can search and filter NPCs by status, flagged state, and text (name and description).
- FR4: ST can create, edit, and retire relationship edges from any NPC's detail pane.
- FR5: A relationship edge stores: endpoints (PC or NPC), kind (closed enum), direction, optional disposition, freeform state, `st_hidden` boolean, status, history log.
- FR6: Append-only history log records every change to a relationship edge, with timestamp, actor, and change summary.
- FR7: The character sheet touchstone field is a picker backed by relationships where `kind = 'touchstone'` (Shape B bridge: character holds IDs, relationships hold records).
- FR8: Existing `linked_character_ids`, `is_correspondent`, and touchstone text migrate cleanly to relationship records with no data loss.

**Tier 2 — Player Agency**
- FR9: Each player has a Relationships tab under the Player section of the unified index.html, showing only edges involving their PC.
- FR10: Player can create PC-to-NPC edges by picking an existing NPC from the register or quick-adding a pending NPC inline.
- FR11: Player can create PC-to-PC edges that require mutual confirmation from the other PC before becoming active.
- FR12: Player can edit their own side of edges they created.
- FR13: Player can flag an NPC for ST review with a reason note; flag appears in the ST queue.
- FR14: Player cannot see `st_hidden: true` edges even if their PC is involved.
- FR15: Player cannot edit ST-created edges, NPC records, or other players' edges.
- FR16: Player sees state-in-UI banners for pending PC-PC confirmations, ST flag resolutions, newly-created edges, and ST-modified edges.

**Tier 3 — DT Form Rewiring**
- FR17: The DT form story-moment picker reads from the PC's relationships, filtered to story-appropriate kinds.
- FR18: The DT form tailors the follow-up prompt label and placeholder text based on the selected edge's kind.
- FR19: The legacy three-way choice (Correspondence/Touchstone/Other) and its contextual dropdown are retired; legacy submissions remain readable.

### Non-Functional Requirements

- NFR1: Every player query on the Relationships tab filters by "edge involves me" at the data layer. No other players' relationships leak in.
- NFR2: `st_hidden: true` edges never surface in player queries under any circumstances.
- NFR3: Relationship edge history is append-only. No in-place rewrites.
- NFR4: Data migration preserves existing `linked_character_ids` as edges with a fallback kind pending ST reclassification. No data loss.
- NFR5: NPC records remain read-only to non-ST users end to end. Players interact only via the flag mechanism.
- NFR6: Multikey indexes on `relationships.a.id` and `relationships.b.id`; indexes on `npcs.status` and `npc_flags.status`.
- NFR7: Definition of Done per story: AC-by-AC evidence report, manual browser test for UI stories, Quinn verification pass, bmad-code-review for schema / auth / migration stories.
- NFR8: No new JS library dependencies in MVP. Visual deferred to Tier 4.
- NFR9: British English throughout. No em-dashes.

### Additional Requirements (Architecture)

- Preserves the three-product structure: admin tab lives in `admin.html`, player tab lives in unified `index.html`.
- Integration tests use `tm_suite_test` DB isolation per existing vitest setup.
- All styling uses the existing CSS token system. New semantic tokens permitted where needed; no bare hex in rule bodies.
- Character schema (`character.schema.js`) updated with `additionalProperties: false` discipline. Legacy touchstone text field deprecated cleanly, not drifted.
- PC-PC mutual confirmation implementation cross-references the Oath of the Safe Word pattern for UX consistency.

### UX Design Requirements

- UX-DR1: Admin NPC Register tab as first-class sidebar item in `admin.html`.
- UX-DR2: List + right-side detail pane pattern, consistent with existing admin surfaces.
- UX-DR3: Admin list filter chips: Pending, Flagged, Correspondents, Touchstones, Suggested.
- UX-DR4: NPC detail pane sections: basic fields, relationships grouped by kind, flag queue, history.
- UX-DR5: Player Relationships tab under the Player section of unified `index.html`.
- UX-DR6: Player edges rendered grouped by kind family: Lineage, Political, Mortal, Other.
- UX-DR7: Disposition chip on each edge card, coloured by value (allied, friendly, neutral, strained, hostile, or blank).
- UX-DR8: Pending PC-PC confirmation shown as a tab-header banner with Accept and Decline controls.
- UX-DR9: Flagging an NPC opens a modal with a reason textarea.
- UX-DR10: Resolved flag appears as a chip on the NPC card showing the ST resolution note.
- UX-DR11: Quick-add NPC is an inline form inside the edge picker: name, relationship note, general note.
- UX-DR12: No public directory surface in MVP. Visibility is per-player only.
- UX-DR13: British English throughout UI copy; no em-dashes.
- UX-DR14: Use existing CSS tokens. Add new semantic tokens only where genuinely required.

### FR Coverage Map

| FR | Tier | Summary |
|---|---|---|
| FR1 | 1 | Admin NPC tab CRUD |
| FR2 | 1 | NPC record fields |
| FR3 | 1 | Admin search and filter |
| FR4 | 1 | Edge editor on NPC detail pane |
| FR5 | 1 | Edge schema |
| FR6 | 1 | Edge history log |
| FR7 | 1 | Character-sheet touchstone picker |
| FR8 | 1 | Data migration |
| FR9 | 2 | Player Relationships tab |
| FR10 | 2 | PC-to-NPC edge creation and quick-add |
| FR11 | 2 | PC-to-PC mutual confirmation |
| FR12 | 2 | Player edits own side |
| FR13 | 2 | NPC flagging |
| FR14 | 2 | `st_hidden` exclusion enforced |
| FR15 | 2 | Player edit restrictions |
| FR16 | 2 | State-in-UI banners |
| FR17 | 3 | DT form picker reads from relationships |
| FR18 | 3 | DT form kind-aware prompts |
| FR19 | 3 | Retire legacy three-way choice |

### NFR Coverage

| NFR | Tier | Notes |
|---|---|---|
| NFR1 | 2 | Query isolation, enforced in player endpoints |
| NFR2 | 2 | `st_hidden` never leaks, same enforcement boundary |
| NFR3 | 1 | History append-only at edge write |
| NFR4 | 1 | Migration no data loss |
| NFR5 | 1+2 | NPC read-only to players, schema + API auth |
| NFR6 | 1 | Indexes on relationship endpoints, npc status, flag status |
| NFR7 | cross-cutting | Definition of Done baked into every story |
| NFR8 | cross-cutting | No new JS libs in MVP |
| NFR9 | cross-cutting | British English, no em-dashes |

### UX-DR Coverage

| UX-DR | Tier |
|---|---|
| UX-DR1 to UX-DR4 | 1 (admin surfaces) |
| UX-DR5 to UX-DR11 | 2 (player surfaces) |
| UX-DR12 to UX-DR14 | cross-cutting constraints |

## Tier dependencies

- Tier 1 schema and migration stories must land before Tier 2 player endpoints can be built.
- Tier 3 depends on Tier 2's FR10 (edge creation) and relationships being populated enough to drive the picker.

## Stories

### Definition of Done (applies to every story)

- All ACs verified in target environment (browser for UI, API for endpoints) with observed behaviour documented
- Files touched listed in the completion note
- No TODO or placeholder in shipped code
- Manual smoke test of the nearest adjacent flow
- Schema changes round-tripped (write, read, edit, save)
- Story completion note uses `done / deferred / skipped` per AC, with evidence
- Quinn verification pass
- `bmad-code-review` for schema, auth-boundary, or migration stories

---

## Tier 1 — Foundation

### NPCR.1: Admin NPC Register tab baseline

As an ST,
I want a first-class NPC Register tab in admin.html,
So that I can manage NPCs from a proper home rather than a collapsible panel inside the Downtime tab.

**Acceptance Criteria:**

**Given** I am ST **When** I open admin.html **Then** an "NPC Register" item appears in the sidebar.

**Given** I click the NPC Register item **Then** a list + right-side detail pane loads, consistent with existing admin surfaces.

**Given** the list loads **Then** NPCs are sorted alphabetically with badges for Correspondent, ST-suggested count, and Flagged count.

**Given** I click a row **Then** the detail pane shows: name, description, status, notes, st_notes, is_correspondent toggle, st_suggested_for (read-only chips for now), created_by, timestamps.

**Given** I click "Add NPC" **Then** a blank detail pane opens with Save enabled. **And** saving creates an `npcs` row with status='active' by default.

**Given** I edit and save **Then** PUT `/api/npcs/:id` fires. **And** save failures display visibly (no silent failure).

**Given** I click Retire **Then** status='archived' and the NPC leaves the default view.

**Given** a search box is present **When** I type **Then** the list filters case-insensitively across name + description.

**Given** filter chips (Pending, Flagged, Correspondents, Suggested) **When** I click a chip **Then** the list filters accordingly.

**Given** I am not ST **Then** the tab is not in the sidebar.

**Files expected to change:** `public/js/admin/npc-register.js` (new), `public/js/admin/downtime-views.js` (remove embedded panel), `public/js/admin.js`, `admin.html`, `public/css/components.css`.

**Dependencies:** none.

---

### NPCR.2: Relationships schema and admin edge editor

As an ST,
I want a Relationships section on the NPC detail pane where I can create, edit, and retire typed edges,
So that I can model each NPC's connections to PCs and other NPCs.

**Acceptance Criteria:**

**Given** `server/schemas/relationship.schema.js` exists **Then** it defines fields `a{type,id}, b{type,id}, kind, direction, disposition, state, st_hidden, status, created_by, history[], created_at, updated_at` with `additionalProperties: false`.

**Given** multikey indexes are required **Then** `server/scripts/create-relationship-indexes.js` exists and produces indexes on `a.id` and `b.id` when run.

**Given** a starting kind taxonomy is needed **Then** `public/js/data/relationship-kinds.js` exists with the ~15 starting kinds, each entry carrying `{code, label, family, direction, typicalEndpoints, custom_label_allowed}`.

**Given** I open an NPC detail pane **Then** a "Relationships" section lists all edges involving this NPC, grouped by kind family (Lineage, Political, Mortal, Other).

**Given** I click "Add Relationship" **Then** a form opens: endpoint picker (PC or NPC), kind dropdown, optional disposition chip, optional freeform state, optional st_hidden toggle.

**Given** kind='other' **When** I save **Then** a `custom_label` field is required.

**Given** I save a new edge **Then** POST `/api/relationships` creates it with status='active', created_by={type:'st', id: me}, and initial history row `{at, by, change: 'created'}`.

**Given** I edit disposition, state, kind, or st_hidden and save **Then** PUT appends a history row recording before/after values.

**Given** I click Retire on an edge **Then** status='retired' and it renders muted.

**Given** the API receives identical endpoints (same type and id on both sides) **Then** it returns 400 VALIDATION_ERROR.

**Given** I am not ST **Then** POST, PUT, and DELETE on `/api/relationships` return 403.

**Files expected to change:** `server/schemas/relationship.schema.js` (new), `server/routes/relationships.js` (new, ST-only in this story; player endpoints added in NPCR.6), `server/index.js` (mount router), `server/scripts/create-relationship-indexes.js` (new, run manually), `public/js/data/relationship-kinds.js` (new), `public/js/admin/relationship-editor.js` (new), `public/js/admin/npc-register.js` (integrate editor), `server/tests/api-relationships.test.js` (new).

**Dependencies:** NPCR.1.

---

### NPCR.3: NPC flags collection and admin flag queue

As an ST,
I want an `npc_flags` collection and a Flagged queue in the admin NPC Register,
So that players can signal concerns about NPCs (via NPCR.11) and I can resolve them.

**Acceptance Criteria:**

**Given** `server/schemas/npc_flag.schema.js` exists **Then** it defines fields `npc_id, flagged_by{player_id, character_id}, reason, status (open|resolved), resolved_by, resolved_at, resolution_note, created_at` with `additionalProperties: false`.

**Given** indexes are required **Then** `server/scripts/create-npc-flag-indexes.js` produces indexes on `status` and `npc_id` when run.

**Given** the ST-only route `GET /api/npc-flags?status=open` **Then** it returns open flags sorted by created_at desc.

**Given** ST-only `PUT /api/npc-flags/:id/resolve` accepts `{resolution_note}` **Then** status='resolved', resolved_by, resolved_at are set.

**Given** `POST /api/npc-flags` exists **Then** player must be authenticated AND have an active relationship edge to the flagged NPC. **And** reason is required. **And** it returns 403 if unauthorised, 400 if missing reason.

**Given** an NPC has open flags **Then** the NPC detail pane shows a red "Flagged · N" chip and a Flags section listing each flag with reason, flagged_by display name, and a Resolve button.

**Given** I click Resolve **Then** a modal opens for `resolution_note`. **And** saving calls the resolve endpoint. **And** the row shows muted.

**Given** the "Flagged" filter chip on the admin list is clicked **Then** the list filters to NPCs with at least one open flag. **And** the chip shows total count.

**Files expected to change:** `server/schemas/npc_flag.schema.js` (new), `server/routes/npc-flags.js` (new), `server/index.js`, `server/scripts/create-npc-flag-indexes.js` (new), `public/js/admin/npc-register.js` (add Flags section and chip count), `server/tests/api-npc-flags.test.js` (new).

**Dependencies:** NPCR.2 (POST auth check queries relationships).

---

### NPCR.4: Character-sheet touchstone picker (Shape B bridge)

As an ST (player UI lands in NPCR.8),
I want character-sheet touchstone rows to pick real NPC records with the Humanity rating preserved,
So that touchstones stop being disconnected text and become part of the graph.

**Acceptance Criteria:**

**Given** `relationship.schema.js` has an optional `touchstone_meta: { humanity: int 1..10 }` field **Then** it is present only when `kind='touchstone'`.

**Given** `character.schema.js` adds `touchstone_edge_ids: string[]` **Then** the sheet reads touchstones from this field.

**Given** I open a character sheet as ST **When** I view Touchstones **Then** each Humanity slot shows a picker with three options:
  - Select existing NPC → creates edge with kind='touchstone', a=pc, b=npc, touchstone_meta.humanity=slot_rating, state=(blank or provided desc)
  - Create new NPC → quick-add form (name + short description) creates npcs row (status='active' for ST) then creates the edge
  - If slot already linked → View / edit state / remove controls

**Given** I save **Then** `character.touchstone_edge_ids[]` contains the relationship _ids. **And** server validates each listed edge exists, has kind='touchstone', and has the character as one endpoint.

**Given** an edge is deleted **Then** the character's `touchstone_edge_ids[]` is cleaned up (via DELETE hook on /api/relationships, or via next character save).

**Given** a character has only legacy `touchstones[]` (no touchstone_edge_ids) **Then** the sheet falls back to rendering legacy shape as read-only with a "migration required" badge.

**Given** the legacy `character.touchstones[]` array **Then** it remains in the schema during this story; deprecation happens in a follow-up after NPCR.5 migration verified.

**Files expected to change:** `server/schemas/character.schema.js`, `server/schemas/relationship.schema.js`, `public/js/editor/sheet.js`, `public/js/suite/sheet.js`, `public/css/components.css`, `server/tests/api-touchstone-edges.test.js` (new).

**Dependencies:** NPCR.2.

---

### NPCR.5: Data migration — four legacy shapes to relationships

As the ST team,
I want a one-time migration script that converts all legacy NPC-shaped data into the new relationships model without data loss,
So that we can deprecate `character.npcs[]` and `character.touchstones[]` cleanly and start the era with the new graph fully seeded.

**Acceptance Criteria:**

**Given** `server/scripts/migrate-to-relationships.js` exists **Then** it is runnable against any environment and honours the `MONGODB_DB` env var.

**Given** the script is run twice against the same data **Then** the second run skips characters already flagged `_migrated_to_relationships: true`. Result is identical to a single run.

**Given** `--dry-run` flag **Then** the script produces a report with no writes.

**Given** an NPC has `linked_character_ids` with no `is_correspondent: true` **Then** each PC produces a relationship row with kind='linked' (fallback), created_by={type:'st', id:'migration'}, status='active'.

**Given** an NPC has `is_correspondent: true` AND `linked_character_ids` **Then** each PC produces a relationship row with kind='correspondent' (overrides fallback).

**Given** a character has `character.npcs[]` entries **Then** each entry is matched by name (case-insensitive) against `npcs`; unmatched entries create new npcs rows. **And** a relationship edge is created with kind mapped via `relationship-type-to-kind-map.js`; unmapped values become kind='other' with custom_label=original relationship_type. **And** the stub's `interaction_history[]` becomes the edge's `history[]`. **And** if `touchstone_eligible: true`, kind is forced to 'touchstone' (overrides mapping).

**Given** a character has `character.touchstones[]` entries **Then** each is fuzzy-matched (Levenshtein < 3) by name against just-migrated NPCs to avoid duplicates. **And** matched entries augment the existing edge with `touchstone_meta.humanity` and `state = touchstone.desc`. **And** unmatched entries create a new NPC + kind='touchstone' edge. **And** `character.touchstone_edge_ids[]` is populated with the resulting edge _ids.

**Given** migration completes for a character **Then** `_migrated_to_relationships: true` is set. **And** the legacy fields (`npcs[]`, `touchstones[]`) remain in the document (deprecated in a later story after verification).

**Given** the script runs to completion **Then** `specs/migration-reports/npcr-migration-{timestamp}.md` is produced with counts: characters_processed, npcs_created, edges_created, touchstones_migrated, unmatched_kinds, warnings[], errors[].

**Given** fixtures in `tm_suite_test` cover all four legacy shapes **Then** the integration test passes with zero data loss.

**Given** a follow-up story (NOT this one) will remove the legacy fields from the schema **Then** this story does not modify or remove any schema fields; it only populates new collections and sets the migration flag.

**Files expected to change:** `server/scripts/migrate-to-relationships.js` (new), `server/scripts/relationship-type-to-kind-map.js` (new), `specs/migration-reports/.gitkeep`, `server/tests/migration-to-relationships.test.js` (new).

**Dependencies:** NPCR.2, NPCR.3, NPCR.4.

---

## Tier 2 — Player Agency

### NPCR.6: Player Relationships tab scaffold and list view

As a player,
I want a Relationships tab under the Player section showing only my PC's edges,
So that I have a single home for viewing who my character is connected to.

**Acceptance Criteria:**

**Given** I am logged in with at least one character **Then** a "Relationships" tab appears in the Player section sidebar.

**Given** I click the tab **Then** a list renders edges involving my active character.

**Given** I have multiple characters **Then** a character selector is present and each character sees only their own edges.

**Given** the list loads **Then** edges are grouped by kind family (Lineage, Political, Mortal, Other) with collapsible sections.

**Given** an edge card **Then** it displays other-endpoint name, kind label, disposition chip (coloured or muted), state text (truncated with click-to-expand), and a status chip if non-active.

**Given** an edge has `status='pending_confirmation'` initiated by another PC **Then** an Accept or Decline banner appears at the top of the tab (flow in NPCR.10).

**Given** an edge has `st_hidden: true` **Then** it never appears in the list (NFR2).

**Given** a new endpoint `GET /api/relationships/for-character/:characterId` exists **Then** caller must own the character or be ST. **And** returns edges with `status IN ('active','pending_confirmation')` AND `st_hidden !== true`.

**Given** an ST calls the same endpoint **Then** all edges including hidden and retired are returned.

**Given** a player calls it for a character they do not own **Then** 403.

**Given** I view my Relationships tab **When** an ST has created a new edge involving my PC since my last tab visit **Then** the edge card shows a "New" badge. **And** the badge clears on the next reload after I've seen it.

**Given** I view an edge **When** its most recent history entry has `by.type='st'` and was written since my last tab visit **Then** the card shows an "Updated · {change summary}" chip with a dismiss control. **And** dismiss persists across reloads via client-side state.

**Given** client-side state tracks `relationships_last_seen_at` per character in localStorage **Then** server does not need to track read-state. Notification infrastructure remains out of scope (Tier 4).

**Files expected to change:** `public/js/tabs/relationships-tab.js` (new), `public/js/index.js`, `index.html`, `server/routes/relationships.js`, `public/css/components.css`, `server/tests/api-relationships-for-character.test.js` (new).

**Dependencies:** NPCR.2.

---

### NPCR.7: Player creates PC-to-NPC edge (pick existing)

As a player,
I want to create a relationship between my PC and an existing NPC,
So that I can record a connection without having to ask the ST.

**Acceptance Criteria:**

**Given** I am on the Relationships tab **Then** an "Add Relationship" button is present in the header.

**Given** I click it **Then** a picker opens with options "Link to existing NPC" and "Quick-add new NPC" (the latter gated behind NPCR.8).

**Given** I pick "Link to existing NPC" **Then** a searchable list of NPCs with `status='active'` opens.

**Given** I select an NPC **Then** a kind dropdown appears, filtered to PC-to-NPC kinds via `relationship-kinds.js` metadata.

**Given** I pick kind and optionally set disposition and state **Then** Save calls `POST /api/relationships` with `a={type:'pc', id:myChar}, b={type:'npc', id:selectedNpc}, status='active', created_by={type:'pc', id:myChar}`.

**Given** the API receives a POST where `a.type='pc'` and `a.id` is not in caller's `character_ids` **Then** 403.

**Given** an identical edge (same endpoints and kind) with `status='active'` already exists **Then** 409 CONFLICT.

**Given** the edge is created **Then** the tab refreshes and the new edge appears under the correct family.

**Files expected to change:** `public/js/tabs/relationships-tab.js` (picker UI), `server/routes/relationships.js` (player-writable POST branch), `server/tests/api-relationships-player-create.test.js` (new).

**Dependencies:** NPCR.6.

---

### NPCR.8: Player quick-adds pending NPC inline

As a player,
I want to create a new pending NPC from the Add Relationship picker,
So that I can write about someone who does not yet exist as a record, without leaving the app.

**Acceptance Criteria:**

**Given** I click "Quick-add new NPC" **Then** an inline form appears with fields Name (required), Relationship note, General note.

**Given** I submit **Then** `POST /api/npcs/quick-add` creates an npcs row with `name, description=generalNote, notes=relationshipNote, status='pending', created_by={type:'player', player_id, character_id}`.

**Given** the NPC is created **Then** a relationship edge is auto-created in the same flow: `a=pc, b=newNpc, kind (player picks after quick-add), status='active', created_by={type:'pc', id:myChar}`.

**Given** a player has >=20 open pending NPCs across all characters **Then** quick-add returns 429 RATE_LIMIT.

**Given** a player submits two quick-adds within 30 seconds **Then** the second returns 429 (server-enforced, client-throttled too).

**Given** the ST filters the Register by "Pending" **Then** new player-created NPCs appear with a "Player-created · by {character name}" badge.

**Given** the ST sets a pending NPC to `status='active'` **Then** it moves out of the pending filter and appears in normal views.

**Files expected to change:** `public/js/tabs/relationships-tab.js` (quick-add form), `server/routes/npcs.js` (new `/quick-add` endpoint), `public/js/admin/npc-register.js` (pending filter and badge), `server/tests/api-npcs-quick-add.test.js` (new).

**Dependencies:** NPCR.6, NPCR.7.

---

### NPCR.9: Player edits own side of own-created edges

As a player,
I want to edit state, disposition, and custom_label on relationships I created,
So that I can reflect the evolution of the relationship without bothering the ST for every tweak.

**Acceptance Criteria:**

**Given** I view my Relationships tab **Then** edges where `created_by.type='pc' AND created_by.id=myChar` show an Edit button. **And** ST-created edges do not.

**Given** I click Edit **Then** a form opens with editable fields state (textarea), disposition (chip selector), custom_label (only when kind='other').

**Given** I save **Then** PUT `/api/relationships/:id` updates the edge AND appends a history row with before and after values.

**Given** a player PUT on an edge where `created_by.type !== 'pc'` OR `created_by.id` not in caller's `character_ids` **Then** 403.

**Given** a player PUT includes fields outside the whitelist (state, disposition, custom_label) **Then** those fields are silently ignored and a server-side warning is logged.

**Given** the state textarea exceeds 2000 characters **Then** the UI prevents submission. **And** server enforces the same cap as a 400.

**Files expected to change:** `public/js/tabs/relationships-tab.js` (edit form), `server/routes/relationships.js` (player PUT handler with whitelist), `server/tests/api-relationships-player-edit.test.js` (new).

**Dependencies:** NPCR.6, NPCR.7.

---

### NPCR.10: PC-to-PC mutual confirmation

As a player,
I want to propose a relationship with another PC that requires their acceptance,
So that we mutually agree on our in-character connection rather than one side imposing it.

**Acceptance Criteria:**

**Given** I click Add Relationship and choose a PC-to-PC kind family **Then** the endpoint picker lists PCs not NPCs.

**Given** I select another PC and fill kind, disposition, and state **Then** POST creates an edge with `status='pending_confirmation', a=me, b=otherPc`.

**Given** the other PC opens their Relationships tab **Then** a banner appears "{My Character} wants to connect as {kind_label}. Accept / Decline."

**Given** they click Accept **Then** `POST /api/relationships/:id/confirm` sets status='active' AND appends a history row.

**Given** they click Decline **Then** `POST /api/relationships/:id/decline` sets status='rejected' AND appends history. **And** the edge is filtered out of both players' list views.

**Given** the initiator views their tab before confirmation **Then** the pending edge shows an "Awaiting {other PC}" chip.

**Given** the API receives a confirm or decline from a PC who is not endpoint `b` of the edge **Then** 403.

**Given** `direction='symmetric'` (e.g. coterie) **Then** a single active edge is readable from both sides.

**Given** `direction='a_to_b'` (e.g. sire-childe) **Then** directionality is preserved regardless of who initiated. **And** a is the sire, b is the childe.

**Given** Oath of the Safe Word has a comparable confirmation flow **Then** its UX (copy tone, button placement, modal shape) is referenced for consistency. Implementation diverges where OotSW mirrors across character docs; this story uses one edge row, queried from both sides.

**Files expected to change:** `public/js/tabs/relationships-tab.js` (banner plus confirm and decline), `server/routes/relationships.js` (confirm and decline endpoints, auth checks), `server/tests/api-relationships-mutual.test.js` (new).

**Dependencies:** NPCR.6, NPCR.7.

---

### NPCR.11: Player flags NPC for review

As a player,
I want to flag an NPC for ST review when something is off,
So that I can signal concern without being able to directly edit ST-owned records.

**Acceptance Criteria:**

**Given** I view my Relationships tab **Then** every NPC-endpoint edge card has a flag icon button with tooltip "Something off about this NPC?"

**Given** I click the flag icon **Then** a modal opens with a reason textarea and Submit button.

**Given** I submit **Then** `POST /api/npc-flags` creates a flag row with `npc_id, flagged_by={player_id, character_id}, reason, status='open'`.

**Given** I already have an open flag on this NPC **Then** the flag icon is replaced with a "Flagged · awaiting ST" chip. **And** the modal cannot be opened again until the flag resolves (one open flag per player per NPC, server-enforced).

**Given** an ST resolves the flag via NPCR.3 **Then** my NPC card updates to show "ST resolved · {resolution_note}" with a dismiss control.

**Given** I dismiss the resolved chip **Then** client local state clears. **And** the flag record stays in the DB as an audit trail.

**Given** POST `/api/npc-flags` from a player without an active relationship to the NPC **Then** 403 (auth check shared with NPCR.3).

**Files expected to change:** `public/js/tabs/relationships-tab.js` (flag button, modal, resolved chip), `server/routes/npc-flags.js` (minor extensions if needed; main POST lives since NPCR.3), `server/tests/api-npc-flags-player.test.js` (new).

**Dependencies:** NPCR.3, NPCR.6.

---

## Tier 3 — DT Form Rewiring

### NPCR.12: DT form story-moment picker reads from relationships

As a player filling out a downtime,
I want the Personal Story: Off-Screen Life picker to show my actual relationships (from Tier 2) rather than the hardcoded three-way choice,
So that I can pick anyone my PC has a relationship with as the subject of my story moment, regardless of kind.

Retires DTOSL.2's three-way choice (Correspondence/Touchstone/Other) in favour of reading from the relationships graph.

**Acceptance Criteria:**

**Given** I open Personal Story: Off-Screen Life in the DT form **Then** the old three-way choice buttons are removed.

**Given** the section loads **Then** a single picker labelled "Who is this moment about?" appears, populated from `GET /api/relationships/for-character/:myCharId`.

**Given** the picker lists edges **Then** entries are grouped by kind family (Lineage, Political, Mortal, Other). **And** each shows other-endpoint name + kind label (e.g. "Mammon · correspondent").

**Given** an edge has `status !== 'active'` **Then** it does NOT appear in the picker.

**Given** I have zero active relationships **Then** the picker shows an empty-state message "You have no active relationships yet. Visit the Relationships tab to create one, or submit this downtime without a story moment."

**Given** I choose to submit without selecting a relationship **Then** the field stays empty. **And** no validation error fires.

**Given** the DT submission schema already has `additionalProperties: true` on responses **Then** a new field `responses.story_moment_relationship_id: string` is documented and supported without schema blocking.

**Given** I select a relationship and submit **Then** `responses.story_moment_relationship_id` is saved with the relationship's `_id`.

**Given** legacy DT submissions have the old shape (`personal_story_choice`, `personal_story_npc_id`, `story_direction`, etc.) **Then** the ST Story tab and player report still render those legacy submissions without error.

**Given** the DT Story admin view reads a new submission **Then** it resolves `story_moment_relationship_id` to the edge and its endpoints, displaying name + kind.

**Files expected to change:** `public/js/tabs/downtime-form.js` (remove legacy three-way UI, add picker), `server/schemas/downtime_submission.schema.js` (document new field), `public/js/admin/downtime-story.js` (resolve relationship_id on render), `public/js/tabs/story-tab.js` (player-side rendering), `server/tests/api-downtime-story-moment.test.js` (new).

**Dependencies:** NPCR.6, NPCR.7, NPCR.5 migration (so existing players have edges to pick from).

---

### NPCR.13: DT form tailors prompt by kind

As a player filling out a downtime,
I want the follow-up prompt below the picker to ask the right question based on the kind of relationship I selected,
So that the form nudges me toward story content that fits the relationship.

**Acceptance Criteria:**

**Given** a `public/js/data/kind-prompts.js` module exists **Then** it maps each kind code to `{label, placeholder}` pairs.

**Given** I select a `kind='touchstone'` relationship **Then** the prompt swaps to label "Describe the moment of in-person contact" with a placeholder guiding what the moment should include.

**Given** `kind='correspondent'` **Then** label becomes "What did they write about?" with appropriate placeholder.

**Given** `kind='ally'` or `'coterie'` **Then** label becomes "What did you call on them for?" or similar.

**Given** `kind='rival'` or `'enemy'` **Then** label becomes "What did they do, or what did you do to them?"

**Given** `kind='family'` **Then** label becomes "What happened with your family this month?" with a placeholder encouraging mortal-world grounding.

**Given** `kind='other'` with a `custom_label` **Then** the label uses the custom_label verbatim where possible. **And** placeholder is a generic fallback.

**Given** no mapping is found for a kind (new kind added without updating the prompts module) **Then** a generic fallback is used: label "Describe this moment" with a generic placeholder.

**Given** I change my relationship selection after typing in the prompt **Then** label and placeholder swap. **And** my typed content persists (not cleared).

**Given** the existing DTOSL.4 contextual-moment-prompt logic is present **Then** it is replaced or absorbed by this kind-based mapping. **And** the legacy code path is removed cleanly.

**Files expected to change:** `public/js/data/kind-prompts.js` (new), `public/js/tabs/downtime-form.js` (replace DTOSL.4 logic with kind-mapping), `server/tests/data-kind-prompts.test.js` (optional light unit test).

**Dependencies:** NPCR.12.

## Deferred (Tier 4)

- Relationship web visualisation (Cytoscape, force-directed, PC at centre, first-ring only)
- Timeline view per edge reading from `history[]`
- NPC-NPC graph browser in admin for ST plot work
- Notification subsystem (in-app queue, push, email, Discord)
- Public relationship directory (may never exist; noted here for completeness)
