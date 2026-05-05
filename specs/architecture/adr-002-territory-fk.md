---
id: ADR-002
title: 'Territory _id-as-FK refactor (retire slug as identifier)'
status: approved
date: 2026-05-05
author: Ptah (DEV)
revision: 2
supersedes: null
related:
  - specs/architecture/adr-001-rules-engine-schema.md
  - GitHub issue #3 (parent - territories `id` overloaded as FK)
  - PR #20 (β - RFR-Test residue cleanup)
  - server/scripts/cleanup-rfr-territory-residue.js (precedent for the cross-doc migration script shape)
  - server/utils/territory-slugs.js (slug-variant normalisation utility, evidence of slug drift)
---

# ADR-002 - Territory `_id`-as-FK refactor

## Revision history

| Rev | Date | Change | Author |
|---|---|---|---|
| 1 | 2026-05-05 | Initial draft. Audit, decision, migration plan, rollout sequence, open questions. | Ptah (DEV) |
| 2 | 2026-05-05 | Maat editorial QA addressed: Concern A (Q5 audit accuracy - corrected the claim that no `/api/territory-residency` consumer exists; one is present at `downtime-form.js:1312` but is dead code). Concern B (count reconciliation - 31 sites, table now matches text, narrow-grep undercount of 19 explained). Concern C (em-dash sweep - count went from 74 to 0, replaced with hyphen-minus per CLAUDE.md style). Concern D (Step 3 rollback wording softened to manual `mongorestore`, no paired script scoped). User resolutions on Q1-Q7 recorded inline; Q5 user diverges from Ptah recommendation (MIGRATE not DROP). Status promoted from `draft` to `approved`. | Ptah (DEV) |

## Context

Issue #3 was raised after a downtime form bug surfaced through the slug-as-FK pattern: `territories.find(t => t.id === 'secondcity')` was returning a test-residue document instead of the real one. PR #20 (story β) cleaned the residue. This ADR scopes the design of the deeper refactor - replacing the overloaded `id` slug with `_id` as the canonical foreign key.

The audit below was carried out 2026-05-05 against `dev` at commit 4bddf20, with a read-only probe of live `tm_suite` for cross-document FK shape confirmation.

### Why this matters

Three findings make the refactor non-optional, not cosmetic:

1. **The slug-uniqueness contract is structurally broken.** `server/schemas/territory.schema.js` declares `id: { type: 'string', minLength: 1 }` with no uniqueness constraint and no Mongo index. PR #20 cleaned the four duplicate `secondcity` rows but the schema is unchanged - the same situation will recur the next time a test fixture writes through the live API without cleanup. Slug uniqueness is a convention enforced by hope.
2. **Cross-document FKs use an overloaded slug.** `downtime_cycles.confirmed_ambience` and `discipline_profile` are objects keyed by territory slug. `regent_confirmations[].territory_id` stores the slug. `downtime_submissions.responses.feeding_territories` stores its keys in **a third slug variant** (`the_second_city`, `the_north_shore`) that doesn't match the canonical `territories.id` values - `server/utils/territory-slugs.js` is a 50-line normaliser that papers over this drift. The bug class "wrong territory data surfaces because slug collided" is wired everywhere.
3. **MongoDB's `_id` is already the right answer.** It exists, it is unique, it is indexed, and `regent_id` already references characters by their `_id` ObjectId-stringified - a single character-FK convention, in the same document, alongside the broken territory-FK convention. Using `_id` for both is the natural fix.

The user (Angelus) authorised **Scope C - full refactor** in chat: promote `_id` to the canonical FK, retire `id` as an identifier. This ADR scopes the **design**; stories #3b through #3e scope the implementation.

### Live-data baseline (post-PR-#20)

Read-only probe of `tm_suite` on 2026-05-05:

- `territories.count = 5`. All slugs unique (`academy`, `dockyards`, `harbour`, `northshore`, `secondcity`). All `regent_id` values are 24-char ObjectId-stringified character references.
- `downtime_cycles.count = 3` (Downtime 1 closed, Downtime 2 closed, Downtime 3 in `game` status).
- Only Downtime 2 has populated `confirmed_ambience` (5 keys, slug-keyed) and `discipline_profile` (5 keys, slug-keyed). No cycle currently has populated `regent_confirmations` - that field is empty across all three cycles, so the cross-doc FK there is not yet exercised in production data.
- `downtime_submissions.responses.feeding_territories` keys observed: `the_academy`, `the_harbour`, `the_dockyards`, `the_second_city`, `the_north_shore`, `the_barrens__no_territory_` (sometimes `the_barrens_no_territory_` with one underscore - both variants present). None match the canonical territories.id values; all require translation through `server/utils/territory-slugs.js`.
- `territory_residency` collection: 0 documents. Schema present, route present, no live state. Effectively dormant.

This baseline matters: the migration's data-side blast radius is small. Five territory documents, one cycle with cross-doc FKs, one submission collection that already requires translation. The pain is *code* surface area (~30 client sites), not data volume.

## Audit

The largest section of this ADR. One row per FK reader/writer site. Coverage covers server collections, server routes, server schemas, server middleware, server scripts, client lookups, client writes, and reference data.

### Server collections

| Collection | Field | Reads slug? | Writes slug? | Cross-doc FK? | Classification |
|---|---|---|---|---|---|
| `territories` | `_id` (ObjectId) | n/a - primary key | yes (auto) | n/a | **canonical FK target** |
| `territories` | `id` (string slug) | yes (every lookup) | yes (POST upsert key, PUT/PATCH lookup fallback) | n/a | **demote to label / retain or rename to `slug`** |
| `territories` | `regent_id` (string) | yes | yes | character `_id` | unchanged - already correct |
| `territories` | `lieutenant_id` (string) | yes | yes | character `_id` | unchanged |
| `territories` | `feeding_rights` (string[]) | yes | yes | character `_id`s | unchanged |
| `downtime_cycles` | `regent_confirmations[].territory_id` (string) | yes | yes | territory slug | **migrate to territory `_id`** (currently empty in prod) |
| `downtime_cycles` | `confirmed_ambience.<key>` (object key) | yes | yes | territory slug | **migrate keys to `_id`** (1 cycle has data) |
| `downtime_cycles` | `discipline_profile.<key>` (object key) | yes | yes | territory slug | **migrate keys to `_id`** (1 cycle has data) |
| `downtime_cycles` | `territory_pulse.<key>` (object key) | yes | yes | territory slug | **migrate keys to `_id`** (no live data observed) |
| `downtime_submissions` | `responses.feeding_territories.<key>` (object key) | yes | yes | territory slug-variant (`the_<slug>` form) | **out of scope for canonical FK** - keep slug-variant pattern, replace existing normaliser with `_id`-aware lookup. Open question Q4. |
| `territory_residency` | `territory` (string) | yes | yes | territory **name** (not slug) | **dormant** - 0 docs. Migrate field to `_id`. Open question Q5. |
| `tracker_state` | none | - | - | - | not referenced |
| `characters` | `regent_territory` (string) | yes | yes | territory **name** (legacy import field) | **future-work** - appears in `characters.js:212` projection and in the Mammon import script (`migrate-regent-to-id.js`). Comment in that script says it has already been migrated to live on territory documents instead. Audit confirms only stale projection remains. Defer to RDE-style follow-up. |

### Server routes

| Route | File:line | Reads slug? | Writes slug? | Cross-doc FK? | Classification |
|---|---|---|---|---|---|
| `GET /api/territories` | `server/routes/territories.js:26-29` | no (returns all) | no | n/a | unchanged |
| `POST /api/territories` (upsert by `id`) | `:32-42` | **yes** - uses slug as upsert key | yes | n/a | **rewrite** - accept `_id` for update, allow create with slug-as-label |
| `PUT /api/territories/:id` (by ObjectId) | `:45-58` | no - uses `_id` already | n/a | n/a | unchanged |
| `PATCH /api/territories/:id/feeding-rights` | `:65-142` | yes - accepts `_id` OR slug via `$or` | n/a | character `_id`s in body | **simplify** - accept `_id` only after migration |
| `POST /api/downtime_cycles/:id/confirm-feeding` | `server/routes/downtime.js:52-120` | yes - `findOne({ id: territory_id })` at `:70` | yes - writes `territory_id` (slug) into `regent_confirmations[]` at `:93, 99` | territory slug | **rewrite** - accept territory `_id` in body, write `_id` into confirmations |
| `GET /api/territory-residency` | `server/routes/territory-residency.js:11-19` | uses **name** as query | n/a | territory name | **rewrite** - query by `_id` |
| `PUT /api/territory-residency` | `:24-36` | uses **name** as upsert key | yes | territory name | **rewrite** - upsert by `_id` |

### Server schemas

| Schema | File | Issue | Action |
|---|---|---|---|
| `territorySchema` | `server/schemas/territory.schema.js:6-22` | `required: ['id']`, no uniqueness, no `_id` mention | drop `id` from `required`; if retained as slug, mark `additionalProperties: true` continues |
| `territoryResidencySchema` | `server/schemas/territory.schema.js:24-36` | `required: ['territory', 'residents']`, `territory` is a name string | rename `territory` → `territory_id`, type ObjectId-string, paired with collection migration |

### Server middleware / auth

| Site | File:line | Notes |
|---|---|---|
| `isRegentOfTerritory` | `server/middleware/auth.js:101-105` | reads `territory.regent_id`. **No territory FK touched** - only character FK. Unchanged. |

### Server scripts (history-only inventory)

| Script | Touches territories? | Notes |
|---|---|---|
| `cleanup-rfr-territory-residue.js` | yes - deleted by `_id` | template for RDE-3c migration script. **Retain.** |
| `migrate-regent-to-id.js` | reads char `regent_territory` field, writes territory docs | **historical** - already run; retain for record. Future work to retire `characters.regent_territory` field is out of scope here. |
| `import-mammon-dt.js` | reads slug-keyed `feeding_territory_<slug>` form data | **historical** - one-shot data import. Retain. |
| `compare-tm-suite-dbs.js` | optional `--collections=territories` flag | unaffected; reads docs as-is |

### Client lookup sites - territories

**Total: 31 sites** by site count (audit, 2026-05-05). The headline grep `\.find(t => t\.id ==\|territories\.find` returns only 19; the audit added the 3 defensive coalesce sites in `downtime-story.js` (`String(t.id || t._id) === String(terrId)` at `:506, :678, :2345`) plus 9 secondary patterns the narrow grep misses (slug-keyed object reads at `confirmed_ambience[territory.id]` etc., dataset attributes like `data-terr-id="${td.id}"`, sites that compare `t.id === tid || t.name === ...`). The 31 figure is the migration-relevant count. Coarse breakdown by directory:

| Directory | Approx count | Representative sites |
|---|---|---|
| `public/js/admin/downtime-views.js` | 12 | `:2064` (confirmed_ambience by `territory.id`), `:2066` (cached lookup), `:6700, :6713, :7494` (slug compare in feeding-grid), `:9252, :9398, :9531, :9624` (territory render rows), `:10010, :10028` (POST upsert by `td.id`) |
| `public/js/admin/downtime-story.js` | 4 | `:506, :678, :2345` (`String(t.id \|\| t._id) === String(terrId)` - *defensive `_id` fallback already present*), `:2532` (dedup by `t.id`), `:3010` (`territory_pulse[terr.id]`) |
| `public/js/admin/city-views.js` | 4 | `:343` (regent_confirmations match by territory.id), `:586, :650, :676` (TERRITORIES.find for label) |
| `public/js/tabs/regency-tab.js` | 3 | `:45, :282` (territories.find by t.id), `:140` (regent_confirmations match), `:328` (POST territory_id slug) |
| `public/js/tabs/feeding-tab.js` | 1 | `:469` (effectiveTerrs.find by `t.id`) |
| `public/js/tabs/downtime-form.js` | 1 | `:3087` (TERRITORY_DATA.find by t.id for joint label) |
| `public/js/admin/feeding-engine.js` | 1 | `:95` (FEED_TERRS.find by t.id) |
| `public/js/suite/territory.js` | 3 | `:90, :207, :362` (state.territories find/map by `t.id`) |
| `public/js/suite/tracker-feed.js` | 1 | `:95` (TERRITORY_DATA.find by t.id) |
| `public/js/data/helpers.js` | 1 | `:160` (`findRegentTerritory` - matches by `regent_id`, not territory id, so already correct) |

Two patterns in current code worth flagging:

- **Defensive coalesce already in places.** `public/js/admin/downtime-story.js:506,678,2345` does `String(t.id || t._id) === String(terrId)`. Some developer was already nervous about this. Migrating to `_id`-only removes the defensive cruft.
- **Slug-keyed object reads.** `confirmed_ambience[territory.id]` and `discipline_profile[territory.id]` (admin/downtime-views.js:2064, 2072, 6694, 6717, 9504, 9605, 9655). These are object key reads, not array lookups - migration also flips the *key shape* of these objects in `downtime_cycles`.

### Client write sites

| Site | File:line | What it writes | Action |
|---|---|---|---|
| Admin syncs territories to API | `public/js/admin/downtime-views.js:10010, 10028` | `apiPost('/api/territories', { id: td.id, name, ambience })` | **rewrite** - pass `_id` for update; slug stays as label |
| Regency tab confirm-feeding | `public/js/tabs/regency-tab.js:328` | `apiPost('/api/downtime_cycles/.../confirm-feeding', { territory_id: ri.territoryId })` where `territoryId` is the slug | **rewrite** - pass territory `_id` |
| Regency tab feeding-rights PATCH | `public/js/tabs/regency-tab.js:277` | `apiPatch('/api/territories/${territoryId}/feeding-rights', ...)` - `territoryId` is slug | **rewrite** - use `_id` in URL |

### Reference data

| Site | File:line | Purpose | Action |
|---|---|---|---|
| `TERRITORY_DATA` | `public/js/tabs/downtime-data.js:86-92` | Hardcoded array of 5 territories with `id` (slug), `name`, default `ambience`, `ambienceMod`. Used as fallback when live `cachedTerritories` is empty. | **retain as display/sort manifest, stop using its `id` for FK** - convert to `{ slug, name, ambience, ambienceMod }` in RDE-3e |
| `TERRITORY_SLUG_MAP` | `server/utils/territory-slugs.js:14-43` | Maps multiple legacy slug variants (`the_second_city`, `'The Second City'`, etc.) to canonical `secondcity` slug | **retain temporarily**; phase out once `feeding_territories` keys are migrated to `_id` (Q4 decides whether to migrate or accept the variant pattern as feature) |

## Decision

### Canonical FK

**`_id`** (Mongo `ObjectId`, stringified for client / wire / URL use). Universally - every reference to a territory across all collections, routes, and client modules.

### Status of `id` (current slug)

**Recommendation: rename `id` → `slug`** (rev-1 ADR position). Retained as a non-unique human-readable label, surfaced in URLs that benefit from readability (e.g. an ST bookmark like `/admin/territories/secondcity` is friendlier than `/admin/territories/69d9e54c00815d471503bea8`). The rename costs little (one Mongo `$rename` in the migration script) and removes the term-confusion risk where "the territory's `id`" sometimes meant slug, sometimes meant `_id`.

If the user prefers full retirement (`id` field deleted), the only material loss is the readable URL convenience; nothing in code depends on the slug as an identifier post-refactor. See open question Q1.

### API behaviour

**Recommendation: strict cutover, no transitional acceptance.** API endpoints that today take a slug switch to taking `_id` directly. Slug-acceptance is removed in the same PR that introduces `_id` acceptance. The transitional dual-acceptance pattern is rejected for two reasons:

1. The data volume is small (5 territories, 1 cycle with cross-doc FKs). The migration script can be run in a deploy window without a back-compat tail.
2. Dual-acceptance ages badly. The "remove legacy compat" follow-up rarely lands. Strict cutover keeps the contract honest.

The exception: `downtime_submissions.responses.feeding_territories` keys are user-typed in legacy submissions, mapped via `TERRITORY_SLUG_MAP`. These submissions are read-only after their cycle closes; they should not be retroactively rewritten. The normaliser becomes a *legacy reader*, not a writer. See open question Q4.

### Client read/write contract

- Every territory lookup: `territories.find(t => String(t._id) === String(id))`. Delete every `t => t.id === ...` site.
- Every API call: pass the territory's `_id` (stringified). Delete every `?territory=<slug>` query, every `{ territory_id: <slug> }` body.
- The `_regentTerritory` cache on character objects (`public/js/data/helpers.js:158-167`) - already keyed correctly by `territoryId` (a string), but the value of `territoryId` shifts from slug to `_id`. Cache shape unchanged; cache busting may need attention (cross-cuts ADR, see open question Q6 in the related Issue #13 city-status stocktake).

## Migration plan

Six steps. Order is non-negotiable: each depends on the previous step's contract being stable. Ptah confirms the default ordering from the story; no audit finding forces deviation.

### Step 1 - Server schema

Update `server/schemas/territory.schema.js`:

- `required` becomes `[]` (no field is universally required for an upsert; at write time the route enforces what's needed).
- Optionally rename `id` → `slug`. If renamed, `slug` joins `additionalProperties` as a non-required label.
- `territoryResidencySchema.territory` → `territory_id`, type ObjectId-string.

**Success criterion:** the new schema accepts a body with `_id` and rejects nothing the prior valid bodies accepted (modulo the rename).
**Rollback:** revert the schema file. No data changes yet at this step.
**Dependent on:** nothing. Pure schema edit.

### Step 2 - Server routes

Update `server/routes/territories.js` and `server/routes/downtime.js`:

- `POST /api/territories`: accept `_id` for update path; create path uses generated `_id` and stores `slug` if provided.
- `PATCH /api/territories/:id/feeding-rights`: drop the `$or: [{ _id: oid }, { id }]` fallback.
- `POST /api/downtime_cycles/:id/confirm-feeding`: read `territory_id` from body as `_id` string, look up via `_id`.
- `GET /api/territory-residency`: query by `_id` not name. (Per Q5 user decision: collection is parked-but-revivable, so the route migrates to the new contract rather than being retired.)

**Success criterion:** every route accepts `_id` and rejects slugs. Manual smoke test with curl + the live MongoDB.
**Rollback:** revert the routes file. Schema is forward-compatible (additionalProperties: true), so no data state corruption.
**Dependent on:** Step 1 schema lands first.

### Step 3 - Migration script

`server/scripts/migrate-territory-fk.js` modelled on `cleanup-rfr-territory-residue.js`:

- Dry-run by default; `--apply` to execute.
- Backup-before-write to `server/scripts/_backups/territory-fk-migration-<ISO>.json` capturing all `downtime_cycles` documents in their pre-migration shape.
- For each cycle: rewrite `regent_confirmations[].territory_id` from slug to territory `_id`; rekey `confirmed_ambience`, `discipline_profile`, `territory_pulse` from slug to `_id`.
- For each `territory_residency` document (currently zero, but for safety): rewrite `territory` field from name to territory `_id`, rename to `territory_id`.
- For each territory document: optionally `$rename: { id: 'slug' }` if Q1 decides retain-as-slug.
- Idempotent: detect already-migrated docs (key shape is ObjectId-string) and no-op.
- Safety guard: abort if any cycle's slug key doesn't resolve to exactly one territory `_id`.

**Success criterion:** dry-run output shows expected per-document deltas; `--apply` reports success counts; re-run reports `already-migrated: true`.
**Rollback:** manual restore by replaying the backup JSON via `mongorestore` or a small ad-hoc script. No paired rollback script is scoped into #3c; if rollback is ever needed, it is operator-driven from the backup file rather than automated.
**Dependent on:** Step 2 routes - production must already accept the new shape, otherwise migration corrupts active state.

### Step 4 - Client refactor

Every `t.id ===` site (31 sites per audit, including the 3 defensive `String(t.id || t._id)` coalesce forms) becomes `String(t._id) === String(id)`. Every API call body changes shape. Suggested split: one PR per directory (`admin/`, `tabs/`, `suite/`, `data/`) so reviews stay tractable. Within a directory, all sites flip in one commit.

Special handling at `public/js/admin/downtime-views.js:2064-2200` and similar - the slug-keyed object reads (`confirmed_ambience[territory.id]`) become `[String(territory._id)]`. Test against a fixture cycle whose slug-keyed objects have been rewritten.

**Success criterion:** every territory lookup runtime-verified against a live character viewing each affected admin/player tab. Browser smoke; no automated test framework.
**Rollback:** revert the client commit(s). Server back-compatibility is gone (Step 2), so a partial rollback risks broken UI - keep Step 2 + Step 3 + Step 4 close together in deploy timing.
**Dependent on:** Steps 2 + 3 deployed.

### Step 5 - Reference data alignment

`public/js/tabs/downtime-data.js:86 TERRITORY_DATA`:

- Restructure: `{ slug, name, ambience, ambienceMod }`. The array itself loses authoritative status - its only job becomes display ordering and default ambience labels for fallback. No code may use `TERRITORY_DATA[i].slug` as a Mongo FK.
- Code that previously matched `cachedTerritories.find(t => t.id === td.id)` flips to matching by `slug`-as-label, which is now an explicit human-readable join, not a hidden FK. Acceptable because `TERRITORY_DATA` is reference data, not live state.

`server/utils/territory-slugs.js TERRITORY_SLUG_MAP`:

- Repurposed as a *legacy reader* for `downtime_submissions.responses.feeding_territories`. Removed from any write path.
- A future story (out of scope) may eliminate it entirely by migrating submission data to `_id` keys; per Q4, that's deferred.

**Success criterion:** `grep -rn "TERRITORY_DATA\[.*\]\.id\b" public/js` returns no matches. `TERRITORY_SLUG_MAP` is referenced only in feeding-grid read paths, never in writes.
**Rollback:** revert; reference data has no data side-effect.
**Dependent on:** Step 4 (clients no longer use slug as FK before reference-data shape changes).

### Step 6 - Removal of legacy compatibility

If Step 2 deliberately landed *transitional* code (e.g. accept-either-slug-or-`_id` while clients catch up), this step removes it. Per the strict-cutover decision above, **no transitional code should exist** - Step 2 already lands the strict version. Step 6 then collapses to:

- Delete `_TERR_ID_NAME` legacy fallback in `public/js/data/helpers.js:148-154` (slug-to-name map for legacy territory documents without a `name` field). Live data has names; the fallback was protective for a transition that's already past.
- Drop `id` field from territory documents if Q1 decides full retirement. Single `$unset` migration.

**Success criterion:** repository contains no `id`-as-slug-FK code. Audit grep returns zero matches for the canonical pattern.
**Rollback:** revert.
**Dependent on:** Steps 1–5 stable in production for at least one game cycle.

## Rollout sequence (story mapping)

| Story | Migration steps | Independence | Notes |
|---|---|---|---|
| **#3b** | Steps 1 + 2 | Sequential - must merge before #3c | Server-side schema + routes. New shape live, old shape rejected. |
| **#3c** | Step 3 | Sequential - must follow #3b | Migration script. Same shape as cleanup-rfr-territory-residue.js (dry-run + --apply + backup + safety guard + idempotent). User authorises `--apply` per the same gate as β. |
| **#3d** | Step 4 | Sequential - must follow #3c | Client refactor. Optionally split into #3d-i (admin/), #3d-ii (tabs/ + suite/), #3d-iii (data/) if size demands. |
| **#3e** | Steps 5 + 6 | Sequential - must follow #3d | Reference data alignment + legacy removal. Smaller; can ship in one PR. |

**Parallelism note:** none of these can ship in parallel. The hard constraint is that Step 2 invalidates the old slug-as-FK contract; running clients still on the old contract break the moment Step 2 deploys. The window between #3b deploy and #3d deploy must be minimised - deploy them in close succession, not weeks apart.

**Time-of-day risk:** the migration script (#3c) is a brief data-state change touching 1 cycle and 0 residency docs. Run during a non-game window. Post-cycle (Downtime 3 currently in `game` status) is a natural fit - wait for it to close, then run the migration before any new cycle opens.

## Open questions

Each requires user sign-off before code work starts.

### Q1 - Retain `id` as `slug` label, or retire `id` entirely?

- **Retain (recommended).** Rename `id` → `slug` in the territory document. Keep as a human-readable label for URLs and debug output. Cost: one `$rename` line in the migration script.
- **Retire.** Drop the field. Cost: one `$unset` line. Removes any future ambiguity about what "id" means for a territory.

**Ptah's recommendation: retain as `slug`.** The cost is identical and the readable-URL benefit is small but real. ST debugging benefits from `secondcity` over `69d9e54c00815d471503bea8` in tooling output. Retaining the field with no FK role is harmless once the contract is "FK is `_id`, label is `slug`".

**User decision: RETAIN as `slug`.** Aligned with Ptah's recommendation. Migration script in #3c renames `id` to `slug`; field carries no FK role post-refactor.

### Q2 - API behaviour: strict cutover or transitional dual-acceptance?

- **Strict cutover (recommended).** API accepts `_id` only after #3b. Slug bodies are rejected with 400.
- **Transitional dual-acceptance.** API accepts either for one release cycle, deprecation-logs slug usage, removed in #3e.

**Ptah's recommendation: strict cutover.** Transitional code rarely retires; the data volume is small enough that strict deploy timing is feasible. If the user prefers a softer landing, transitional is implementable but adds removal work.

**User decision: STRICT cutover.** Aligned with Ptah's recommendation. No transitional dual-acceptance. Stories #3b through #3d must deploy in close succession to avoid client-side breakage.

### Q3 - Retain or retire `_TERR_ID_NAME` fallback in `public/js/data/helpers.js`?

The slug-to-name map at `:148-154` exists for "territory documents that pre-date the name field being saved". Live audit shows all 5 territories have `name` populated. The fallback is dead code under current data shape but is a back-compat shim if old documents ever resurface.

- **Remove (recommended).** Delete in #3e. Live data contradicts its premise.
- **Keep.** Costs nothing; protects against a hypothetical legacy import.

**Ptah's recommendation: remove in #3e.** Dead defensive code rots; removing it is a small clarity win.

**User decision: REMOVE in #3e.** Aligned with Ptah's recommendation.

### Q4 - Migrate `downtime_submissions.responses.feeding_territories` keys, or leave the slug-variant pattern?

The keys (`the_academy`, `the_harbour`, `the_north_shore`, etc.) are user-typed via the legacy form and don't match the canonical territories.id. `server/utils/territory-slugs.js` normalises them at read time.

- **Migrate (one-shot).** Rewrite all submission `feeding_territories` keys to territory `_id`. Cost: one migration script step; touches every closed submission. Risk: rewrites historical data, complicates audit trail.
- **Leave (recommended).** Submissions are append-only audit trail of what the player typed. Keep the slug-variant keys; keep `TERRITORY_SLUG_MAP` as a legacy reader; never write a slug-variant from new code. Future submissions use `_id` keys natively when the form is rebuilt.

**Ptah's recommendation: leave.** Submissions are facts about what the player did; the right cure is to rebuild the form to write `_id` keys, not to retroactively rewrite the past. The normaliser becomes a museum piece, not a hot path.

**User decision: LEAVE submissions intact.** Aligned with Ptah's recommendation. `TERRITORY_SLUG_MAP` becomes a legacy reader. Form rebuild is a separate future story.

### Q5 - Is `territory_residency` collection alive or dormant?

Live audit: 0 documents in `tm_suite.territory_residency`. Schema present (`server/schemas/territory.schema.js:24-36`), routes mounted (`server/index.js:84` mounts `server/routes/territory-residency.js` under `requireAuth`), tested (`server/tests/api-players-sessions-residency.test.js` exercises GET and PUT).

A client consumer does exist - corrected from the rev-1 ADR's incorrect claim that no consumer was found. `public/js/tabs/downtime-form.js:1311-1317` calls `await apiGet('/api/territory-residency')`, populates the module-scoped cache `residencyByTerritory` declared at `:73`, and writes per-territory `Set` instances at `:1315`. The cache is **set but never read**: `grep -rn "residencyByTerritory\b" public/js` returns only the four declaration/write sites and zero read sites. The consumer block is dead code that fetches a dormant collection.

This sharpens, rather than weakens, the original recommendation. The case for dropping the collection is now: drop the collection (0 docs), drop the schema, drop the route, drop the test suite, drop the dead client block (`downtime-form.js:73` declaration plus `:1311-1317` fetch+populate). Total surface removed: ~60 lines server-side plus the client-side dead block.

- **Migrate.** Keep the collection parked-but-revivable. Rename `territory` field to `territory_id`, type ObjectId-string. Schema and routes get the new contract; the dead client block stays alive long enough to either be removed in a separate cleanup story or be put to use by a future feature that reads from the cache. No production-data work (collection is empty).
- **Drop entirely.** Retire the collection, schema, routes, test suite, and the dead client block. Saves ~60 lines and one server route. Future revival cost is "re-add a collection plus minimal CRUD" which is genuinely small.

**Ptah's recommendation: drop the collection.** The dead consumer is a confirmed liability rather than a confirmed feature; preserving an unused contract through a refactor is a vote for inertia.

**User decision: MIGRATE.** Diverges from Ptah's recommendation. The collection is treated as parked-but-revivable. Schema and routes get the rename + ObjectId-string contract under #3b/#3c; the collection itself stays. The dead client block at `downtime-form.js:73, 1311-1317` is **explicitly noted as needing attention** but is **not** scoped into #3c - it is orthogonal to the FK migration and belongs to a separate follow-on cleanup story (file as a future-work issue per Q7 once this ADR is approved).

### Q6 - Do we coordinate with Issue #13 (city status stocktake) on the `_regentTerritory` cache?

Issue #13 (Stocktake: City Status calculation) flagged the `c._regentTerritory` cache invalidation problem. ADR-002 changes the *value* stored in that cache (slug → `_id`) but does not change the cache mechanism. The cache lifecycle work belongs to Issue #13.

- **Decouple (recommended).** ADR-002 changes the value's shape. Issue #13 fixes invalidation. Independent.

**Ptah's recommendation: decouple.** Mention in #3d's PR body that the cache value type changed; Issue #13's eventual fix lands on top.

**User decision: DECOUPLE.** Aligned with Ptah's recommendation.

### Q7 - Future-work items surfaced by the audit (not in scope, but worth recording)

The audit surfaced items that do not belong in this refactor but should be filed as separate issues:

- `characters.regent_territory` projection at `server/routes/characters.js:212` - vestigial field, predates the move to territory-document-as-source-of-truth. Retire in a future story.
- `_TERR_ID_NAME` fallback (covered in Q3 - included in #3e).
- The `the_<slug>` vs canonical-slug drift in `feeding_territories` keys (covered in Q4 - covered by leaving in place).
- `server/utils/territory-slugs.js` will become read-only after this refactor; consider sunsetting once submissions form is rebuilt.
- Per Q5 user decision: dead `territory_residency` consumer block at `public/js/tabs/downtime-form.js:73, 1311-1317` (cache populated, never read). Out of scope for the FK migration; should be addressed by a follow-on cleanup story.

These are intentionally **not** scoped into stories #3b-e. Filing each as its own issue (or a single "territory FK follow-ups" issue) is the user's call after this ADR is approved.

**User decision: file separate issues post-ADR-approval.** Aligned with Ptah's recommendation.

## References

- `specs/architecture/adr-001-rules-engine-schema.md` - structural template for this ADR.
- GitHub Issue #3 (parent - open through this refactor's completion).
- PR #20 / story β - `cleanup-rfr-territory-residue.js`, the precedent for the cross-doc migration script shape used in #3c.
- `server/schemas/territory.schema.js` - current schema; modified in #3b.
- `server/routes/territories.js`, `server/routes/territory-residency.js`, `server/routes/downtime.js` - server routes touched in #3b.
- `server/utils/territory-slugs.js` - slug-variant normaliser; demoted to legacy reader in #3e.
- `public/js/tabs/downtime-data.js` - `TERRITORY_DATA` reference array; restructured in #3e.
- `public/js/data/helpers.js` - `findRegentTerritory` and `_TERR_ID_NAME` fallback; latter removed in #3e.
- `public/js/admin/downtime-views.js`, `public/js/admin/downtime-story.js`, `public/js/admin/city-views.js`, `public/js/tabs/regency-tab.js`, `public/js/tabs/feeding-tab.js`, `public/js/suite/territory.js`, `public/js/suite/tracker-feed.js`, `public/js/admin/feeding-engine.js`, `public/js/tabs/downtime-form.js` - client lookup sites refactored in #3d.

## Out of scope

- **Other foreign-key audits.** Characters, sessions, downtime cycles between themselves, NPCs - none are touched here. If similar slug-as-FK patterns exist elsewhere, file them as separate issues.
- **Rebuilding the downtime submissions form to write `_id`-keyed `feeding_territories`.** Future story; this ADR makes the legacy pattern survivable.
- **Retirement of `characters.regent_territory` projection field.** Future story; the audit flagged it, the refactor doesn't need it.
- **Cache invalidation for `c._regentTerritory`.** Owned by Issue #13.
- **The decision to actually execute the refactor.** This ADR makes the case and recommends; the user reads, makes calls on Q1–Q7, and either approves (greenlights #3b–e) or sends back.
