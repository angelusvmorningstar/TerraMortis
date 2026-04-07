# Epic PP: Unified Purchasable Powers

## Motivation

The application currently stores game reference data (merits, disciplines, devotions, rites, manoeuvres) as hardcoded JavaScript objects baked into client bundles. This data is duplicated across `data/` and `suite/` modules, cannot be edited without a code deploy, and uses inconsistent schemas per type. Prerequisite checking relies on fragile regex parsing of human-readable strings.

This epic consolidates all **XP-purchasable** game elements into a single MongoDB collection with a unified schema, served via API and cached client-side. Enum-only data (clans, covenants, bloodlines, banes, court titles) is explicitly out of scope — those remain as constants.

## Design Decisions

### What qualifies as a "purchasable power"

Any game element that a character spends XP to acquire or improve:

| Category | Count | Current Source | XP Model |
|---|---|---|---|
| `attribute` | 9 | constants.js | 4/dot (fixed) |
| `skill` | 24 | constants.js | 2/dot (fixed) |
| `discipline` | ~161 | disc-data.js | 3/dot clan, 4/dot out-of-clan (character-dependent) |
| `merit` | ~189 | merits-db-data.js | 1/dot (fixed) |
| `devotion` | ~42 | devotions-db.js | variable per devotion (intrinsic) |
| `rite` | (subset of disciplines) | disc-data.js | 4/dot (fixed) |
| `manoeuvre` | ~195 | man-db-data.js | 1/dot via fighting styles |

**Total: ~620 entries**

### XP cost is NOT stored on the power

XP cost depends on character context (clan disciplines cost less). A utility function calculates cost at runtime given the power + character data. Exception: devotions have a fixed intrinsic XP cost stored as `xp_fixed`.

### Prerequisite structure: JSON Logic tree

Prerequisites use composable `all` (AND) and `any` (OR) combinators instead of regex-parsed strings:

```json
{
  "any": [
    { "type": "skill", "name": "Brawl", "dots": 1 },
    { "type": "skill", "name": "Weaponry", "dots": 1 }
  ]
}
```

Leaf node types: `attribute`, `skill`, `discipline`, `merit`, `clan`, `bloodline`, `humanity`, `not`.

Human-readable labels are **derived at render time** from the structure — not stored.

### Unified document schema

```js
{
  key: String,              // URL-safe slug: "lay-open-the-mind"
  name: String,             // Display name: "Lay Open the Mind"
  category: String,         // "attribute"|"skill"|"discipline"|"merit"|"devotion"|"rite"|"manoeuvre"
  parent: String|null,      // Discipline name, fighting style, merit type, skill category
  rank: Number|null,        // Power level within parent (1-5), or null
  rating_range: [min,max]|null, // Purchasable dot range, or null for single-purchase

  description: String,      // Effect/description text
  pool: {                   // Dice pool components, or null
    attr: String|null,
    skill: String|null,
    disc: String|null,
  },
  resistance: String|null,  // Resistance expression
  cost: String|null,        // Activation cost ("1 V", "2 V & 1 WP")
  action: String|null,      // "Instant"|"Contested"|"Ritual"|"Reflexive"
  duration: String|null,    // Duration text

  prereq: Object|null,      // JSON Logic tree with all/any combinators
  exclusive: String|null,    // Mutually exclusive power names

  xp_fixed: Number|null,    // Only for devotions (fixed XP cost)
  special: String|null,      // "standing", "clan_disc", "bloodline_only"
  bloodline: String|null,    // Restricted bloodline name
}
```

## Functional Requirements

- FR-PP-01: All purchasable game elements are stored in a single `purchasable_powers` MongoDB collection with the unified schema
- FR-PP-02: API endpoint `GET /api/rules` serves the full collection; supports `?category=` filtering
- FR-PP-03: API endpoint `GET /api/rules/:key` returns a single power by slug
- FR-PP-04: Client-side loader fetches the rules collection on app startup, caches to localStorage, and falls back to cache if API is unreachable
- FR-PP-05: All existing consumers of `MERITS_DB`, `DISC`, `DEVOTIONS_DB`, `MAN_DB` are migrated to use the cached API data
- FR-PP-06: Duplicate JS modules (`data/merits-db-data.js` + `suite/merits-db-data.js`, etc.) are removed
- FR-PP-07: Prerequisites are stored as structured JSON Logic trees; the existing regex-based `meritQualifies()` function is replaced with a tree-walking `meetsPrereq(char, node)` resolver
- FR-PP-08: Prerequisite display labels are derived at render time from the tree structure via a `prereqLabel(node)` utility
- FR-PP-09: XP cost calculation remains in a client-side utility function; only `xp_fixed` (devotions) is stored on the power document
- FR-PP-10: A seed script transforms the existing JSON extracts (`json_data_from_js/`) into the unified schema and inserts into MongoDB
- FR-PP-11: ST can edit power entries (description, prerequisites, ratings) via the admin panel without a code deploy
- FR-PP-12: JSON Schema validation is applied to the `purchasable_powers` collection via the existing `validate()` middleware
- FR-PP-13: The downtime form XP spend grid reads available purchases from the cached rules data instead of hardcoded `getItemsForCategory()` switch

## Non-Functional Requirements

- NFR-PP-01: Full rules collection fetch completes in under 500ms; cached reload is instant
- NFR-PP-02: No regression in character sheet render time (< 500ms)
- NFR-PP-03: Offline fallback via localStorage cache — app remains functional if API is unreachable
- NFR-PP-04: British English throughout all power descriptions and labels

## Stories

### PP-1: Schema, Collection, and Seed Script
Create the `purchasable_powers` MongoDB collection. Write the JSON Schema (`server/schemas/purchasable_power.schema.js`). Build a transform script that converts all 4 JSON extracts + constants into unified documents and seeds the collection. Wire validation middleware to the new route.

**Acceptance Criteria:**
- Collection contains ~620 documents covering all 7 categories
- Each document passes schema validation
- Seed script is idempotent (drop + re-insert)
- `json_data_from_js/` files serve as the migration source

### PP-2: API Route and Client Loader
Create `GET /api/rules` (full collection, `?category=` filter) and `GET /api/rules/:key` (single lookup). Build a client-side `loadRules()` function in `data/loader.js` that fetches on startup, caches to localStorage (`tm_rules_db`), and falls back to cache. Export a `getRulesDB()` accessor.

**Acceptance Criteria:**
- API returns the full collection sorted by category + name
- Category filter works: `/api/rules?category=merit` returns only merits
- Client caches to localStorage and uses cache on API failure
- Any authenticated user can read rules (no role restriction)

### PP-3: Prerequisite Engine Rewrite
Replace the regex-based `meritQualifies(char, prereqString)` with `meetsPrereq(char, prereqNode)` that walks the `all`/`any` tree. Add `prereqLabel(node)` for rendering. Update all callers: character editor merit dropdown, downtime XP spend, sheet prerequisite warnings.

**Acceptance Criteria:**
- All existing prerequisite checks produce identical results
- `meetsPrereq` handles all leaf types: attribute, skill, discipline, merit, clan, bloodline, humanity, not
- `prereqLabel` produces human-readable strings with correct parenthesisation for nested `any` inside `all`
- No regex-based prereq parsing remains in the codebase

### PP-4: Migrate Consumers — Character Editor
Replace `MERITS_DB` imports in `editor/merits.js`, `editor/sheet.js`, `editor/edit.js`, `editor/mci.js`, `editor/domain.js` with lookups against the cached rules data. Remove `buildMeritOptions()` hardcoded exclusion sets — use `category` field filtering instead.

**Acceptance Criteria:**
- Merit dropdown in character editor populated from API-cached data
- Merit prerequisite warnings use the new `meetsPrereq` engine
- Discipline power details (pool, cost, effect) read from rules cache
- No imports of `merits-db-data.js` remain in the editor modules

### PP-5: Migrate Consumers — Suite and Game App
Replace `DISC`, `MAN_DB`, `MERITS_DB` imports in `suite/sheet.js`, `suite/sheet-helpers.js`, `suite/data.js`, `shared/pools.js`, `game/rules.js`, `admin/dice-engine.js`, `admin/feeding-engine.js`. Remove `suite/disc-data.js`, `suite/merits-db-data.js`, `suite/man-db-data.js`.

**Acceptance Criteria:**
- Dice pool calculations in `shared/pools.js` use rules cache
- Game app rules quick-reference reads from rules cache
- Suite sheet merit/manoeuvre rendering uses rules cache
- Duplicate `suite/*.js` data files are deleted

### PP-6: Migrate Consumers — Downtime and Player Portal
Replace `MERITS_DB` and `DEVOTIONS_DB` imports in `player/downtime-form.js`, `player/feeding-tab.js`, `editor/csv-format.js`. Update `getItemsForCategory()` to build options from rules cache filtered by category.

**Acceptance Criteria:**
- Downtime XP spend grid items populated from rules cache
- Feeding tab method/discipline references use rules cache
- CSV export/import merit names resolve against rules cache
- No imports of `devotions-db.js` or `merits-db-data.js` remain in player modules

### PP-7: Remove Legacy Data Files
Delete all hardcoded data modules now replaced by the API-backed cache. Remove `json_data_from_js/` directory (migration source, no longer needed). Update NFR-15 to reflect the new architecture.

**Acceptance Criteria:**
- Deleted: `data/merits-db-data.js`, `data/devotions-db.js`, `data/man-db-data.js`, `suite/disc-data.js`, `suite/merits-db-data.js`, `suite/man-db-data.js`
- Deleted: `json_data_from_js/` directory
- No remaining imports reference deleted files
- App functions identically from cached API data

### PP-8: Admin Rules Editor
Add a Rules domain to the admin sidebar. Render a searchable, filterable table of all powers. Each row expands to an inline edit form for description, prerequisites (JSON tree editor), ratings, and metadata. Save via `PUT /api/rules/:key`.

**Acceptance Criteria:**
- ST can browse all ~620 powers with category/search filtering
- ST can edit description, prereq tree, rating_range, special, and exclusive fields
- Edits persist immediately via API and are visible to players on next load
- No code deploy required to change game rules data

## Dependencies

- Existing `json_data_from_js/` extracts (migration source)
- `server/middleware/validate.js` (generic validation factory)
- `data/loader.js` (client-side caching pattern)
- `server/schemas/character.schema.js` (character data shape for prereq resolver)

## Risks

- **Prereq migration accuracy**: The regex-based `meritQualifies` handles ~50 distinct prereq patterns. Each must be correctly converted to a JSON Logic tree. Automated conversion with manual verification recommended.
- **Performance**: Loading ~620 documents on startup adds latency. Mitigated by localStorage caching and the small payload size (~150KB JSON).
- **Breaking changes during migration**: Stories PP-4 through PP-6 touch ~18 files. Feature-branch with thorough manual testing before merge.

## Out of Scope

- Enum data (clans, covenants, bloodlines, banes, court titles, masks/dirges, feed methods, territories) — these remain as constants
- Character sheet data structure changes — the `merits[]` / `merit_creation[]` parallel arrays are not refactored in this epic
- XP cost formula changes — the calculation logic stays in client-side utilities
