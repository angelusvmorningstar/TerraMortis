# Epic ECM: Equipment Catalogue Migration & Admin

## Motivation

EQ-1..EQ-4 shipped the equipment domain as a static JS catalogue (`public/js/data/equipment-data.js`) plus a server-side mirror (`server/data/equipment-catalogue.js`) parity-tested for drift. That model is a **regression against the established Mongo-backed reference-data pattern** Epic PP delivered for merits, disciplines, devotions, manoeuvres, and the rules engine (`purchasable_powers` collection, `server/routes/rules.js`).

Three concrete problems with the static model:

1. **STs cannot add campaign-specific items without a code deploy.** Every bespoke piece of equipment requires editing two JS files, opening a PR, and shipping. Player-level "I want a custom thing" workflows are blocked.
2. **No cross-character visibility.** STs cannot answer "who owns the Glock?" without opening every character.
3. **The static + mirror + parity-test pattern is technical debt by construction** — three artefacts maintained for what is one piece of data, only to avoid a CJS/ESM boundary that wouldn't exist if the data lived in Mongo.

This epic completes the migration the rest of the reference-data domain already underwent:
- All 70 catalogue entries (the EQ-1 seed) move into a new `equipment_catalogue` MongoDB collection.
- `character.equipment[].catalogue_id` migrates from string slug to `ObjectId` reference.
- A new admin sidebar page provides full CRUD over the catalogue.
- DT form and character editor select **only** from the Mongo-backed list — no free-text catalogue entry from any UI surface.
- Players who want an item not in the catalogue file a free-text **item request** on their DT submission; ST adjudicates inline during DT processing and, if approved, creates the catalogue entry via the new admin UI.

The static JS modules are deleted at the end of the epic; the parity test is deleted with them; CLAUDE.md is amended.

## Goals

- Single source of truth: `equipment_catalogue` collection in MongoDB. No JS mirrors. No parity test.
- ST can create, edit, and delete catalogue items via a dedicated admin sidebar page.
- ObjectID references throughout — `character.equipment[].catalogue_id` is a Mongo `ObjectId` pointing at `equipment_catalogue._id`.
- DT form and character editor both **gate selection** to existing catalogue items — neither UI accepts a free-text catalogue entry.
- Players surface "I want a thing not in the list" as a free-text **item request** on their DT submission; ST adjudicates inline.
- Catalogue edits surface an **impact warning** at edit time (held-by-N-characters notice) so STs see the blast radius before committing a change.
- Existing character records migrate cleanly — no orphaned references, no stub catalogue rows.

## Non-Goals

- **No catalogue audit ledger.** Peter explicitly chose Option B (impact warning only) over Option A (edit log) — accepted silent-rewrite risk at edit time in exchange for a smaller surface. If a future bug demonstrates an audit ledger is needed, it can be added then.
- **No global cross-campaign catalogue.** Items are campaign-local. (Same scope rule as Epic STM Rev 4 — no template library across compounds.)
- **No copy-on-reference immutability.** Editing a catalogue item silently rewrites every character that holds it; the impact warning is the only mitigation.
- **No structured item-request form.** The request lives as a free-text field on the existing DT submission; no new submission flow.
- **No `defence_penalty` wire-in to `calcDefence()` in this epic.** That's a separate work item Peter has authorised (the EQ-1 ADR-required note); tracked outside ECM scope.
- **No state-enum per-bucket schema validation in this epic.** That's a separate bugfix Peter has authorised; tracked outside ECM scope.

## Design Decisions

### D1 — Schema mirrors the EQ-1 catalogue shape

The new `equipment_catalogue` document keeps the existing field shape (bucket-specific fields explicit-null where absent). `_id: ObjectId` is the only identity — **no slug field**.

```js
{
  _id: ObjectId,
  bucket: 'weapon',             // enum: 'weapon' | 'armour' | 'equipment' | 'asset'
  name: 'Glock 17',
  description: '...',
  availability: 2,              // integer 0-5
  tags: ['ranged', 'firearm'],

  // bucket-specific (explicit null where absent — matches EQ-1 pattern)
  damage_mod: 2,
  damage_type: 'lethal',
  weapon_type: 'ranged',
  armour_value: null,
  defence_penalty: null,
  skill_domain: null,
  bonus_dice: null,

  // audit-light metadata (kept minimal per Non-Goal "no audit ledger")
  created_at: ISODate,
  updated_at: ISODate
}
```

**No unique index on slug** — it doesn't exist. Soft duplicate detection (warn-only) at the admin UI on create, matching by `name + bucket` (see D6). No hard uniqueness constraint at the DB layer; two items with the same name + bucket are technically legal — the admin UI just warns the ST to double-check.

### D2 — `character.equipment[].catalogue_id` becomes ObjectId

Schema change in `server/schemas/character.schema.js`. Existing string-slug references migrate to ObjectId in the backfill story. No dual-shape support — one-shot conversion. The ~30-character live dataset makes this safe.

### D3 — Endpoint shape mirrors `purchasable_powers`

New routes in `server/routes/equipment-catalogue.js`, ST-auth-gated for writes, **no auth** for the bulk read (DT form and player app both need it — same as the existing `GET /api/equipment/catalogue`):

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/equipment_catalogue` | none | list all items |
| `GET /api/equipment_catalogue/:id` | none | single item by ObjectId |
| `POST /api/equipment_catalogue` | ST | create new item |
| `PATCH /api/equipment_catalogue/:id` | ST | edit item (triggers impact warning UX upstream) |
| `DELETE /api/equipment_catalogue/:id` | ST | delete item (refuses if held by any character; see D5) |

The existing `GET /api/equipment/catalogue` endpoint becomes a thin alias of `GET /api/equipment_catalogue` for one release cycle, then deprecated by ECM-7.

### D4 — Impact warning at edit (and delete)

When an ST opens an item for edit in the admin UI, the panel queries `GET /api/equipment_catalogue/:id/impact` (or includes the count in the item GET) and renders a banner:

> This item is held by 7 characters. Edits will apply to all current holders.

The warning is **informational** — the edit proceeds normally on save. No second confirmation step (Peter explicitly chose Option B's minimal-surface model).

Same banner applies on **delete**, but delete is hard-blocked if `count > 0`: the ST sees "Held by 7 characters — cannot delete. Remove from holders first or replace via edit." This prevents silent reference dangling.

### D5 — Delete is blocked when referenced; edit is not

The asymmetry between edit (silent rewrite allowed) and delete (hard-blocked) is intentional. Edits preserve referential integrity (the ObjectId still resolves); delete breaks it. The impact warning covers edit; a hard block covers delete.

### D6 — Item request is a free-text field on DT submission

A new `item_request` string field is added to the DT submission schema. The DT processing UI surfaces the text alongside other notes. ST adjudicates inline:

- **Approve + create** → ST opens the catalogue admin in a new tab, creates the entry, then returns to DT processing and assigns the new item.
- **Approve + substitute** → ST assigns an existing similar item directly.
- **Reject** → ST leaves a counter-note ("not in scope this cycle") and resolves the DT.

No new gate state; no new collection; no notification system. Matches existing DT note patterns.

### D7 — Migration is a one-shot script per environment

A seed/backfill script (`server/scripts/ecm-migrate.js`) does both halves in one run:

1. Refuses to seed if `equipment_catalogue.countDocuments() > 0` (without `--force`) — the seed is conceptually one-shot per environment. Reads `public/js/data/equipment-data.js`, inserts each entry into `equipment_catalogue` with a fresh ObjectId. Builds an **in-memory** map `{ oldSlug → newObjectId }` keyed by the slug from the JS module (used only by step 2 — never persisted).
2. Walks every `character` document. For each element of `equipment[]`, looks up `catalogue_id` (slug, the legacy shape) in the in-memory map and replaces with the ObjectId. Drops any item with an unresolved slug **and** logs it for ST review.

Idempotency: step 1 guards on empty-collection check. Step 2 detects already-converted refs (typeof catalogue_id === 'object' / instanceof ObjectId) and skips them — re-running after a partial run is safe.

A pre-flight DRY-RUN mode reports both the seed plan (item count) and the orphan-slug count without writing. **Run DRY-RUN on production first; review the orphan-slug list with Peter before the destructive run** (HALT-DAR pin on ECM-3 acceptance).

### D8 — DT form and character editor switch to API-fed dropdowns

Both UI surfaces fetch the catalogue once at app boot via the new endpoint, cache in a module-level constant, and re-fetch on a `broadcastCatalogueUpdate` WS frame (mirroring the existing `broadcastTrackerUpdate` pattern). No localStorage persistence — the catalogue is small enough to refetch on every boot.

The dropdown is the **only** way to assign an item. No free-text catalogue entry from any UI. Players who want a new thing use the item-request field (D6).

### D9 — Static JS modules + parity test deleted at the end of the epic

The penultimate story (ECM-7) deletes:
- `public/js/data/equipment-data.js`
- `server/data/equipment-catalogue.js`
- `server/tests/equipment-catalogue-parity.test.js`

Final story (ECM-8) amends CLAUDE.md (the stale "Immutable reference data baked into JS modules" section, line ~106) — same load-bearing pattern as STM-2's CLAUDE.md amendment.

## Stories

Sized ~1 day each. Critical path is ECM-1 → ECM-2 → ECM-3 → ECM-4 / ECM-5. ECM-6 (admin UI) parallel-dispatchable after ECM-1. ECM-9 (item-request flow) fully independent.

### ECM-1: Collection, schema, CRUD API (no client wiring)

Create `equipment_catalogue` collection. Add `server/schemas/equipment_catalogue.schema.js`. Add `server/routes/equipment-catalogue.js` with the 5 endpoints from D3, ST-auth gates on writes. Bulk read remains unauthenticated. Mount router in `server/index.js`. Vitest tests cover happy paths + 400 (invalid bucket, missing required) + 401 (unauth write) + 404 (missing id).

### ECM-2: Seed script — JS module → Mongo

`server/scripts/ecm-migrate.js` step 1 only. Reads `public/js/data/equipment-data.js`, inserts the catalogue entries into `equipment_catalogue` with fresh ObjectIds. **Idempotency mechanism per D7**: refuses to seed if `equipment_catalogue.countDocuments() > 0` without an explicit `--force` flag. DRY-RUN mode reports the seed plan (item count, sample entries) without writing. Logs final seeded count.

### ECM-3: Backfill — character.equipment[].catalogue_id slug → ObjectId

Same script, step 2. Walks every `character` document, converts `equipment[].catalogue_id` from slug to ObjectId via the slug→ObjectId map built in step 1. Drops + logs any item with unresolved slug. **Schema migration**: `character.equipment[].catalogue_id` type becomes ObjectId. **HALT-DAR pin:** dry-run report must be reviewed by Peter before the destructive run; the orphan-slug list is product-relevant, not just operational.

### ECM-4: DT form switches to API-fed catalogue

`public/js/tabs/downtime-form.js` drops the static import of `EQUIPMENT_CATALOGUE`. Fetches from `GET /api/equipment_catalogue` at boot, caches module-level. Dropdown sources from cache. Item selection writes ObjectId, not slug. Refetch on `broadcastCatalogueUpdate` WS frame (ECM-6 adds the broadcaster).

### ECM-5: Character editor (EQ-4 admin) switches to API-fed catalogue

`public/js/editor/edit.js` — same pattern as ECM-4. `getCatalogueByBucket` becomes a cache reader rather than a static-module reader. Dropdown sources from cache. Item assignment writes ObjectId. Refetch on `broadcastCatalogueUpdate`.

### ECM-6: Catalogue admin sidebar page

New sidebar nav entry **Equipment Catalogue** on `admin.html`. Page surfaces:

- **List view** — filter by bucket, search by name, sort by availability. Each row shows item name, bucket, slug, availability, **holders count**.
- **Create form** — bucket selector, name/description/availability/tags inputs, bucket-specific fields revealed conditionally. **Soft duplicate warning** on save: if a `name + bucket` match already exists, render a non-blocking warning ("An item with this name and bucket already exists — continue?") with the existing item linked for the ST to inspect. ST can override.
- **Edit form** — all fields editable; **impact warning banner** at top showing "Held by N characters; edits will apply to all" (per D4).
- **Delete control** — disabled when holders count > 0, with explanatory tooltip; allowed only when zero holders (per D5).

Server-side `GET /api/equipment_catalogue/:id/impact` returns `{ holders: N, character_names: [...] }` for the banner. The Create/Edit/Delete actions broadcast `broadcastCatalogueUpdate` on the WS so ECM-4 and ECM-5 refetch.

**HALT-DAR pin:** delete-when-referenced must hard-block at the API layer, not just the UI. A 409 response if `count > 0`.

### ECM-7: Static JS modules deleted

Delete `public/js/data/equipment-data.js`, `server/data/equipment-catalogue.js`, `server/tests/equipment-catalogue-parity.test.js`. Update any remaining imports (sweep with `grep -r equipment-data\|equipment-catalogue` first). Remove the alias on `GET /api/equipment/catalogue` (the EQ-1 endpoint) — it's now redundant with `GET /api/equipment_catalogue`. Communicate the endpoint deprecation in the PR description for awareness.

### ECM-8: CLAUDE.md amendment

Amend CLAUDE.md "Immutable reference data (baked into JS modules)" section (~line 106) to:
- Acknowledge Epic PP completed migration of `MERITS_DB`, `DEVOTIONS_DB`, `MAN_DB`, and the rules engine into MongoDB.
- Acknowledge Epic ECM completed migration of the equipment catalogue.
- Update the remaining-static list to whatever genuinely remains static (`CLANS`, `COVENANTS`, `MASKS_DIRGES` are still small enums and probably stay).
- Add a note that **any new reference-data introduction must default to MongoDB-backed**; static JS modules require an explicit ADR carve-out.

Same load-bearing pattern as STM-2's CLAUDE.md amendment — a future agent reading the file would otherwise still introduce static JS modules.

### ECM-9: Item-request field on DT submission

Add `item_request` string field to the DT submission schema (`server/schemas/downtime_submission.schema.js` or wherever the existing notes fields live). Surface as a labelled textarea on the DT submission form (`public/js/tabs/downtime-form.js`). Surface as a labelled block on the DT processing UI (`public/js/admin/downtime-views.js`) — visible to ST during adjudication.

No new collection. No new state. No notification. ST sees the text, acts on it inline via existing flows.

**Fully independent of ECM-1..ECM-8** — can dispatch and merge at any time.

## Dispatch order and parallelism

- **ECM-1** first, solo.
- After ECM-1 merges: **ECM-2** and **ECM-6** in parallel (seed script depends on the API; admin UI depends on the API; they don't touch each other).
- After ECM-2 merges: **ECM-3** (backfill needs the seeded ObjectIds).
- After ECM-3 merges: **ECM-4** and **ECM-5** in parallel (both depend on a clean Mongo state).
- After ECM-4, ECM-5 merge: **ECM-7** (cleanup — no static-JS consumers remain).
- **ECM-8** after ECM-7 (CLAUDE.md amendment last).
- **ECM-9** dispatch any time — fully independent.

## Dependencies

- **Existing infrastructure:** Mongo-backed reference-data pattern from Epic PP (`server/routes/rules.js`, `getCollection('purchasable_powers')`). WebSocket broadcast pattern from STM Rev 3 (`broadcastStModUpdate`, `broadcastTrackerUpdate`).
- **Existing routes to deprecate:** `GET /api/equipment/catalogue` (alias for one release, removed in ECM-7).
- **CLAUDE.md amendment** owned by ECM-8 — load-bearing per the convention established by STM-2.
- **Architecture decision:** none required — this epic follows the established Mongo-backed pattern. If during ECM-1 design Imhotep wants to depart from the `purchasable_powers` shape (e.g. for tagging, audit hooks, soft-delete), an ADR is warranted; otherwise mirror the established pattern.
- **Out of scope, tracked separately:**
  - `defence_penalty` wire-in to `calcDefence()` (per Peter's ask + EQ-1's ADR-required note) — separate story / separate ADR.
  - `state` enum per-bucket schema validation (UI-only currently; AJV gap) — separate bugfix.

## Open Questions for Architect

None gate-blocking. Two informational asks for the ECM-1 design:

1. **Schema-validation tooling.** EQ-1 used AJV against `server/schemas/character.schema.js`. The `purchasable_powers` pattern uses `validate(purchasablePowerSchema)` middleware in `server/routes/rules.js`. Confirm ECM-1 follows the latter pattern, since this is a new collection.
2. **WebSocket broadcaster naming.** Suggest `broadcastCatalogueUpdate` to match `broadcastTrackerUpdate` and `broadcastStModUpdate` naming. If Imhotep wants a different convention (e.g. namespaced `broadcastEquipmentCatalogueUpdate`), call it in ECM-1.
