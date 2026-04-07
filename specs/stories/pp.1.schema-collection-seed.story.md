# Story PP.1: Schema, Collection, and Seed Script

## Status: Approved

## Story

**As a** system architect,
**I want** all purchasable game elements stored in a single validated MongoDB collection,
**so that** the data layer is unified, schema-enforced, and ready for API consumption.

## Acceptance Criteria

1. `purchasable_powers` collection contains ~620 documents covering all 7 categories (attribute, skill, discipline, merit, devotion, rite, manoeuvre)
2. Each document passes JSON Schema validation via the existing `validate()` middleware pattern
3. Seed script is idempotent (drops collection and re-inserts)
4. `json_data_from_js/` files serve as the migration source
5. Schema rejects documents missing required fields (`key`, `name`, `category`)
6. `category` field is constrained to the 7-value enum
7. `prereq` field accepts null or a valid `all`/`any` tree structure

## Tasks / Subtasks

- [ ] Task 1: Create JSON Schema file (AC: 2, 5, 6, 7)
  - [ ] Create `server/schemas/purchasable_power.schema.js`
  - [ ] Define required fields: `key` (string, slug format), `name` (string), `category` (enum)
  - [ ] Define optional fields: `parent`, `rank`, `rating_range`, `description`, `pool` (object with attr/skill/disc), `resistance`, `cost`, `action`, `duration`, `prereq`, `exclusive`, `xp_fixed`, `special`, `bloodline`
  - [ ] Define `prereq` as a recursive schema supporting `all`/`any` arrays and leaf nodes with `type`/`name`/`dots`/`qualifier`/`max`
  - [ ] Export `purchasablePowerSchema`

- [ ] Task 2: Build transform script (AC: 1, 4)
  - [ ] Create `server/scripts/seed-purchasable-powers.js`
  - [ ] Read all 6 JSON files from `json_data_from_js/`
  - [ ] Transform merits: key from object key, map `type` → `parent`, parse `rating` string → `rating_range` array, parse `prereq` string → JSON Logic tree
  - [ ] Transform disciplines: key from power name slug, extract `d` → `parent`, `a`/`s`/`d` → `pool` object, `r` → `resistance`, `c` → `cost`, `ac` → `action`, `du` → `duration`, `ef` → `description`
  - [ ] Transform devotions: key from `n` slug, parse `p[]` → `prereq.all` with discipline leaf nodes, `xp` → `xp_fixed`, parse `stats` string for pool/action/duration
  - [ ] Transform manoeuvres: key from name slug, `style` → `parent`, `rank` → rank integer, `effect` → `description`, `prereq` → parsed prereq tree
  - [ ] Transform attributes (9): key from name slug, `parent` from category (Mental/Physical/Social), `rating_range: [1,5]`
  - [ ] Transform skills (24): same pattern as attributes
  - [ ] Extract rites as separate category from discipline entries where `ac === 'Ritual'` and `d` is 'Cruac' or 'Theban'
  - [ ] Generate URL-safe slug keys: lowercase, replace spaces/special chars with hyphens
  - [ ] Validate all generated documents against schema before insert

- [ ] Task 3: Prereq string parser (AC: 7)
  - [ ] Create `server/scripts/lib/parse-prereq.js`
  - [ ] Parse comma-separated AND conditions: `"Brawl 2, Stealth 3"` → `{ all: [{ type: 'skill', name: 'Brawl', dots: 2 }, ...] }`
  - [ ] Parse OR conditions: `"Brawl 1 or Weaponry 1"` → `{ any: [...] }`
  - [ ] Parse mixed: `"Carthian Status 1, Athletics 2 or Stealth 2"` → nested all/any
  - [ ] Handle special patterns: `"Humanity < 5"` → `{ type: 'humanity', max: 4 }`, `"No Invictus Status"` → `{ type: 'not', name: 'Status', qualifier: 'Invictus' }`, `"Mekhet"` → `{ type: 'clan', name: 'Mekhet' }`, `"Kerberos bloodline"` → `{ type: 'bloodline', name: 'Kerberos' }`
  - [ ] Handle discipline prereqs: `"Protean 3"` → `{ type: 'discipline', name: 'Protean', dots: 3 }`
  - [ ] Handle merit prereqs: `"Contacts"` → `{ type: 'merit', name: 'Contacts' }`, `"Carthian Status 1"` → `{ type: 'merit', name: 'Status', qualifier: 'Carthian', dots: 1 }`
  - [ ] Return `null` for empty/absent prereqs
  - [ ] Log unrecognised patterns for manual review

- [ ] Task 4: Seed execution and validation (AC: 1, 3)
  - [ ] Script connects to MongoDB via `MONGODB_URI` env var
  - [ ] Drop `purchasable_powers` collection before insert
  - [ ] Insert all transformed documents
  - [ ] Log count per category
  - [ ] Create index on `key` (unique) and `category`
  - [ ] Verify total count matches expected ~620

## Dev Notes

### Source Files (migration inputs)
- `json_data_from_js/merits_db.json` — 189 merits, keyed by lowercase name, fields: `desc`, `prereq`, `rating`, `type`, `special`, `excl`
- `json_data_from_js/devotions_db.json` — 42 devotions, array of `{ n, p: [{ disc, dots }], xp, cost, effect, stats }`
- `json_data_from_js/disciplines_db.json` — 161 powers, keyed by name, fields: `d` (discipline), `a` (attr), `s` (skill), `r` (resistance), `c` (cost), `ac` (action), `du` (duration), `ef` (effect)
- `json_data_from_js/manoeuvres_db.json` — 195 manoeuvres, keyed by lowercase name, fields: `name`, `style`, `rank`, `effect`, `prereq`
- `json_data_from_js/constants.json` — contains `ALL_ATTRS` (9), `ALL_SKILLS` (24), `SKILL_CATS` (category mapping)

### Schema location pattern
Follow existing pattern: `server/schemas/purchasable_power.schema.js` exporting `purchasablePowerSchema`
[Source: server/schemas/character.schema.js for pattern]

### Validation middleware pattern
Use `validate()` from `server/middleware/validate.js` — already wired for all other collections
[Source: server/middleware/validate.js]

### Prereq string patterns found in MERITS_DB
~50 distinct patterns including: simple stat checks (`"Resolve 3"`), OR conditions (`"Brawl 1 or Weaponry 1"`), clan gates (`"Mekhet"`), covenant status (`"Carthian Status 1"`), negations (`"No Invictus Status"`), humanity thresholds (`"Humanity < 5"`), compound (`"Manipulation 3, Wits 3, Investigation 2, Subterfuge 2"`)
[Source: json_data_from_js/merits_db.json, conversation analysis]

### Testing

- Run seed script against a test MongoDB instance
- Verify document count per category
- Spot-check 5 entries per category for correct field mapping
- Verify prereq parsing against known complex cases
- Ensure schema rejects malformed documents

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-07 | 1.0 | Initial draft | Bob (SM) |

## Dev Agent Record

### Agent Model Used
_TBD_

### Debug Log References
_TBD_

### Completion Notes List
_TBD_

### File List
_TBD_

## QA Results
_Pending implementation_
