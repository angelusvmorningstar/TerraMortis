---
id: npcr.4
epic: npcr
status: review
priority: high
depends_on: [npcr.2]
---

# Story NPCR-4: Character-sheet touchstone picker

As an ST (player UI lands in NPCR.8),
I want to add, edit, and remove touchstones on a character sheet — each one either a free-standing object (heirloom, place, concept) or an NPC backed by a relationships edge — with the Humanity rating assigned correctly by the game's rules,
So that touchstones are first-class records instead of disconnected free text, and character touchstones become part of the relationships graph.

---

## Context

V:tR 2e touchstone rules as applied in Terra Mortis:

- A character starts with one touchstone. Its Humanity rating is the **anchor**: 7 for Ventrue, 6 for every other clan. Bloodlines are irrelevant — the rule keys on clan alone.
- STs may grant additional touchstones. Each new touchstone's rating descends one step from the anchor: the second is at anchor − 1, the third at anchor − 2, and so on.
- Hard cap: **6 touchstones maximum** (original + 5 grants). No touchstone can sit below Humanity (anchor − 5).
- **Attached vs Detached** is a render-time concern: a touchstone is Attached when the character's current Humanity ≥ that touchstone's rating, Detached otherwise. Current Humanity does not change the slot count or the ratings.
- A touchstone can be an **object** (free-standing — stored inline on the character) or a **character** (an NPC — linked into the relationships graph). The sheet add-form lets the ST flip between the two per touchstone.

`character.touchstones[]` is the authoritative store. Each entry carries `{humanity, name, desc, edge_id?}`. Presence of `edge_id` means this touchstone is an NPC; the referenced `relationships` document carries `kind='touchstone'` and `touchstone_meta.humanity` matching the item. Object touchstones omit `edge_id` and live purely on the character document.

---

## Acceptance Criteria

**Given** `relationship.schema.js` has an optional `touchstone_meta.humanity` (integer 1..10) **Then** it is present only on edges where `kind='touchstone'`. **And** POST/PUT on `/api/relationships` reject a `kind='touchstone'` edge without `touchstone_meta.humanity`, with endpoints other than one pc + one npc, or with humanity outside 1..10.

**Given** `character.schema.js` caps `touchstones` at `maxItems: 6` **Then** a save with more than six items is rejected (Ajv) at the root schema level.

**Given** each `touchstones[]` item **Then** its schema permits an optional `edge_id: string` alongside `humanity`, `name`, and `desc`.

**Given** I open a character sheet as ST in edit mode **Then** existing touchstones render as slots, sorted by humanity descending, each showing "Humanity N · Attached/Detached · (character|object)" plus **edit** and **remove** controls.

**Given** the character has fewer than 6 touchstones **Then** a single "+ Add touchstone (Humanity N)" button is shown beneath the slots, where N is computed as anchor − current_count. **And** the button is disabled and relabelled "Maximum of 6 touchstones reached" when length = 6.

**Given** I click "+ Add touchstone" **Then** a picker opens with:
- A **"This touchstone is a character"** checkbox (default off = object).
- When off: Name (required) + Description inputs. Saving adds `{humanity, name, desc}` to `touchstones[]`.
- When on: a pick-existing vs create-new mode switch, plus a touchstone-description field. Pick-existing shows a dropdown of active/pending NPCs excluding any already linked as touchstones on this character. Create-new takes an NPC name + NPC description. Saving creates an active NPC (if needed), creates a `kind='touchstone'` edge (a=this pc, b=that npc, `touchstone_meta.humanity` = auto-assigned rating), then appends `{humanity, name, desc, edge_id}` to `touchstones[]`.

**Given** I click **edit** on a slot **Then** an inline form lets me change the item's name and description. **And** saving PUTs the character with the updated `touchstones[]`. **And** if the item has an `edge_id`, the edge's `state` is synced to the new description on the same save.

**Given** I click **remove** on a slot **Then** a themed confirm modal appears (not browser-chrome `confirm()`). **And** on confirm the slot is spliced out of `touchstones[]`, the character is PUT, and if the item had an `edge_id` the edge is retired via DELETE.

**Given** I save a character with `touchstones[]` **Then** the server validates: cap ≤ 6; every `humanity` is within `[anchor − 5, anchor]` where anchor = 7 for Ventrue else 6; every present `edge_id` resolves to an active, non-retired, `kind='touchstone'` relationships doc with this character on one endpoint.

**Given** a character sheet is rendered (admin editor or player suite) **Then** any `touchstones[]` entry with an `edge_id` displays the linked NPC's name (resolved server-side as `_npc_name`) in place of the inline `name`. **And** `st_hidden` edges are excluded from the enrichment for player callers. **And** retired edges are excluded for all callers.

**Given** a user-facing error (validation or network) **Then** it surfaces as an inline banner inside the touchstone section (`role="alert"`), not a `window.alert()`.

---

## Implementation Notes

- `anchorFor(c)` lives in both `public/js/editor/edit.js` and `server/routes/characters.js`: `c.clan === 'Ventrue' ? 7 : 6`.
- Humanity is **always** auto-assigned on add: the new touchstone takes `anchor − existing_count`. No UI override.
- Cap enforcement is defence in depth: UI disables the Add button at 6; schema rejects `maxItems: 6` breaches; route validator double-checks.
- Quick-add NPC uses existing `POST /api/npcs` (ST-only; creates with status='active'). Player quick-add arrives in NPCR.8 via a separate endpoint.
- Soft-retire semantics: `DELETE /api/relationships/:id` sets status='retired' rather than hard-deleting. Client filters retired from enrichment; the server-side enrichment helper does the same.
- `touchstones.length` is the source of truth for slot count — there is no separate `touchstone_grants` field. Clan is the only input the anchor depends on.

---

## Files Changed

- `server/schemas/character.schema.js` — `touchstones` gains `maxItems: 6` and optional `edge_id` per item
- `server/schemas/relationship.schema.js` — optional `touchstone_meta: { humanity: 1..10 }`
- `server/routes/characters.js` — `anchorFor`, `validateTouchstones`, `enrichTouchstoneNpcNames` (replaces earlier `_touchstones_resolved` approach); wired into GET `/`, GET `/:id`, PUT `/:id`
- `server/routes/relationships.js` — `touchstoneShapeError` enforces humanity + one-pc/one-npc on POST/PUT; `touchstone_meta` tracked and cleared on kind change
- `public/js/editor/edit.js` — `anchorFor`, `shEnsureTouchstoneData` (NPC load), `shTouchstoneStartAdd/StartEdit/PickerClose/PickerDraft/PickerToggleCharacter/PickerSetMode/SaveAdd/SaveEdit/Remove`, `_tsConfirmModal`, `_tsSetError/_tsClearError`
- `public/js/editor/sheet.js` — `renderTouchstones` (unified renderer with add-form picker)
- `public/js/suite/sheet.js` — reads `touchstones[]` with `_npc_name` enrichment
- `public/js/admin.js` — window-exposes the nine new handlers
- `public/css/components.css` — `.sh-ts-slot`, `.sh-ts-picker*`, `.sh-ts-slot-kind`, error banner
- `public/css/admin-layout.css` — `.npcr-btn.muted`, `.npcr-btn.danger` variants used by the confirm modal
- `server/tests/api-touchstone-edges.test.js` (new) — 19 integration tests
- `server/scripts/cleanup-touchstone-edge-ids.js` (new) — one-off `$unset` for the transient field introduced during the first (wrong-model) pass; safe to run after Phase D ships

---

## Definition of Done

- Schema validates with new fields; character + relationship round-trip verified
- Server tests pass end-to-end: cap, anchor-range, embedded `edge_id` validation (happy / missing / retired / foreign endpoint), `_npc_name` enrichment with `st_hidden` filtering on the player path
- In-browser (ST login on Morningstar/dev):
  - Flow 1 — load existing character, see sorted slots with kind chip and no legacy migration UI — **confirmed**
  - Flow 2 — add an object touchstone — **confirmed**
  - Flow 3 — add a character touchstone picking an existing NPC — **confirmed**
  - Flow 4 — add a character touchstone by creating a new NPC — **confirmed**
  - Flow 5 — edit a touchstone's name/description, including edge state sync — **confirmed**
  - Flow 6 — remove a touchstone via the themed confirm modal — **confirmed**
  - Flow 7 — cap enforcement at 6 slots, button disables and relabels — **confirmed**
  - Flow 8 — anchor computes correctly (Ventrue=7, else=6) and ratings descend on add — **confirmed**
  - Flow 9 — player suite view — **deferred to NPCR.6+ verification**
- Humanity rating preserved correctly per the anchor-descending rule
- All user-facing confirms use the themed modal (NPCR.3 pattern); errors use the inline banner — never `window.alert`/`confirm`
- Quinn verification pass
- `bmad-code-review` (schema change — required per epic DoD)

---

## Revision History

- **2026-04-24 r1**: initial story as drafted from epic NPCR. Slot model was **1 touchstone per Humanity rating** (1..H). Implementation built and shipped against this spec.
- **2026-04-24 r2**: spec corrected during Flow 2 smoke test. Actual rule: anchor (7 Ventrue / 6 else) with up to 6 touchstones descending. Code reworked to match (commit `9d7863c`, alignment fix `448230a`). The `touchstone_edge_ids` field introduced in r1 was replaced by an optional per-item `edge_id` on `touchstones[]`; legacy-fallback / "Begin migration" UI removed; `_touchstones_resolved` enrichment replaced by per-item `_npc_name`. This spec reflects the r2 shape.
