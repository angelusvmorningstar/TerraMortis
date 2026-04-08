# Story PP.13: Excel-to-v3 Direct Ingestion Pipeline

## Status: Draft

## Story

**As an** ST,
**I want** a single script that reads the Excel character master and produces v3-schema characters directly in MongoDB,
**so that** I can re-ingest character data from the authoritative spreadsheet without chaining three separate migration steps.

## Background

The current ingestion pipeline is a three-step chain:

1. `scripts/migrate-points.js` — reads `Terra Mortis Character Master (v3.0).xlsx`, merges CP/Free/XP into `data/chars_v2.json` (v2 schema with parallel `_creation` arrays)
2. `server/migrate.js` — drops and re-seeds MongoDB `characters` collection from `chars_v2.json`
3. `server/scripts/migrate-schema-v3.js` — converts v2 documents to v3 inline schema in-place

This is fragile: step 1 uses CommonJS (`require`), writes v2-shaped data, and the three scripts must be run in order. Any step can silently produce bad data that only surfaces in step 3.

This story replaces the chain with a single ES module script that reads the Excel directly and produces v3-schema characters, validated before insert.

### Existing tooling

- `scripts/migrate-points.js` — has all Excel cell position mappings (attributes rows 25-37, skills 41-68, disciplines 164-190, merits 78-98, manoeuvres 100-120, influence 137-157, domain 131-134, MCI/PT 159-160, XP log row 7-11)
- `server/scripts/seed-purchasable-powers.js` — has `slugify()` and `makeKey()` for rule_key generation
- `server/scripts/migrate-schema-v3.js` — has the v2→v3 transform logic and `purchasable_powers` lookup pattern
- `server/schemas/character.schema.js` — v3 schema for validation

## Dependencies

- PP.1 (purchasable_powers collection must be seeded for rule_key lookups)
- PP.9 (v3 character schema must be defined)

## Acceptance Criteria

1. Single script `server/scripts/ingest-excel.js` reads the Excel workbook and produces v3-schema character documents
2. Each character built with inline creation tracking (cp/xp/free on every attribute, skill, discipline, merit) — no parallel `_creation` arrays at any stage
3. Disciplines built as objects `{ dots, cp, xp, free, rule_key }` — never integers
4. Every merit, attribute, skill, power, and fighting style has `rule_key` resolved from `purchasable_powers` collection
5. All 31 characters pass v3 schema validation (Ajv) before any database write
6. Script is idempotent: drops and re-inserts `characters` collection (same pattern as existing `migrate.js`)
7. Script connects to MongoDB via `MONGODB_URI` env var, reads `purchasable_powers` for rule_key lookups
8. `--dry-run` flag validates and logs without writing to database
9. `--json` flag writes validated v3 characters to `data/chars_v3.json` (useful for inspection and as a new seed file)
10. Output logs: character count, per-character merit/discipline/power counts, any rule_key lookup misses, any validation warnings
11. ES module (`import` syntax) — no CommonJS `require()`
12. Old pipeline scripts (`scripts/migrate-points.js`) remain untouched (not deleted — kept as reference)

## Tasks / Subtasks

- [ ] Task 1: Create `server/scripts/ingest-excel.js` scaffold (AC: 1, 7, 11)
  - [ ] ES module with `import` syntax
  - [ ] Read `MONGODB_URI` from env, connect to MongoDB
  - [ ] Load `purchasable_powers` collection into a lookup Map (same pattern as `migrate-schema-v3.js`)
  - [ ] Read Excel workbook from configurable path (default: `Terra Mortis Character Master (v3.0).xlsx` in project root)
  - [ ] Parse `--dry-run` and `--json` flags from `process.argv`
  - [ ] Build sheet name lookup and Character Data row lookup (port from `migrate-points.js:228-245`)

- [ ] Task 2: Port character extraction to v3 shape (AC: 2, 3, 4)
  - [ ] Port attribute extraction (rows 25-37): build `{ dots, bonus, cp, xp, free, rule_key }` directly
  - [ ] Port skill extraction (rows 41-68): build `{ dots, bonus, specs, nine_again, cp, xp, free, rule_key }` directly
  - [ ] Port discipline extraction (rows 164-190): build `{ dots, cp, xp, free, rule_key: null }` objects (not integers)
  - [ ] Port merit extraction — general (rows 78-98), influence (rows 137-157), domain (rows 131-134), standing (rows 159-160): build with inline cp/xp/free/free_mci/etc and rule_key
  - [ ] Port manoeuvre/fighting style extraction (rows 100-120): build with inline cp/xp/free and rule_key
  - [ ] Port XP log extraction (rows 7-11)
  - [ ] Port identity fields from Character Data sheet (name, clan, covenant, bloodline, etc.)
  - [ ] Reuse `readPoints(ws, row)` helper for CP/Free/XP cell reads (columns L/M/N = 11/12/13)
  - [ ] Reuse `parseMeritSlot(raw)` helper for merit name/dots/qualifier parsing
  - [ ] Reuse `findSheetName()` for fuzzy name→sheet matching

- [ ] Task 3: rule_key resolution (AC: 4)
  - [ ] Build rule_key lookup Map from `purchasable_powers`: `"category:slug" → key`
  - [ ] Attributes: `rulesMap.get("attribute:" + slugify(name))`
  - [ ] Skills: `rulesMap.get("skill:" + slugify(name))`
  - [ ] Merits: `rulesMap.get("merit:" + slugify(name))`
  - [ ] Discipline powers: `rulesMap.get("discipline:" + slugify(powerName))`
  - [ ] Devotions: `rulesMap.get("devotion:devotion-" + slugify(name))`
  - [ ] Rites: `rulesMap.get("rite:rite-" + slugify(name))`
  - [ ] Manoeuvres/fighting styles: `rulesMap.get("manoeuvre:" + slugify(name))`
  - [ ] Log any misses (null rule_key) as warnings — don't fail, just report

- [ ] Task 4: Existing character data merge (AC: 2)
  - [ ] Read `data/chars_v2.json` as base — Excel only has point allocations, not full character data (powers, touchstones, ordeals, banes, willpower conditions, aspirations, etc.)
  - [ ] Merge strategy: Excel provides identity + attributes + skills + disciplines + merit point allocations. Existing JSON provides powers, touchstones, ordeals, banes, fighting_styles, fighting_picks, willpower, aspirations, status, covenant_standings, etc.
  - [ ] For merits: match Excel merit slots to existing v2 merits by name, apply point data inline
  - [ ] Preserve fields that don't exist in Excel (e.g. `merit.cult_name`, `merit.asset_skills`, `merit.dot1_choice`, `power.stats`, `power.tradition`)

- [ ] Task 5: Validation and output (AC: 5, 6, 8, 9, 10)
  - [ ] Validate every character against `characterSchema` via Ajv before any write
  - [ ] Abort on first validation failure with detailed error (field path + message)
  - [ ] `--dry-run`: validate and log, write nothing
  - [ ] `--json`: write validated array to `data/chars_v3.json`
  - [ ] Default (no flags): drop `characters` collection and re-insert, with confirmation prompt (same pattern as `migrate.js`)
  - [ ] Log summary: total characters, per-character counts (merits, disciplines, powers), rule_key hit/miss stats

- [ ] Task 6: Verification (AC: 5, 10)
  - [ ] Run with `--dry-run --json` and inspect output
  - [ ] Compare merit dot totals against pre-existing data for 5+ characters
  - [ ] Compare XP spent totals against pre-existing data
  - [ ] Verify rule_key is populated for all standard merits/attributes/skills
  - [ ] Verify no validation errors on all 31 characters

## Dev Notes

### Excel workbook structure

The workbook `Terra Mortis Character Master (v3.0).xlsx` has:
- **Character Data** sheet — summary tab with one row per character (row 1-31, column F = name). Merit names in columns 114-143, influence merits in 176+, areas in 196+.
- **Per-character sheets** — one tab per character (named by first name or nickname). Contains the detailed point allocations at fixed row positions. Columns: L(11)=CP, M(12)=Free, N(13)=XP.

### Cell position reference (from migrate-points.js)

```
Attributes:    rows 25-37 (3 groups of 3, gaps at 28-29, 33-34)
Skills:        rows 41-68 (3 groups of 8, gaps at 49-50, 59-60)
Gen merits:    rows 78-98 (20 slots)
Manoeuvres:    rows 100-120 (20 slots)
Domain merits: rows 131-134 (Safe Place, Haven, Feeding Grounds, Herd)
Influence:     rows 137-157 (20 slots)
MCI:           row 159
PT:            row 160
Disciplines:   rows 164-190 (10 core + Cruac/Theban + 5 sorcery themes)
XP log:        rows 7-11, column N (attrs, skills, merits, powers, special)
```

### What Excel DOESN'T have

The Excel has point allocations but NOT:
- Powers list (discipline powers, devotions, rites, pacts)
- Touchstones
- Ordeals
- Banes
- Willpower conditions
- Aspirations
- Fighting picks (individual manoeuvre selections)
- MCI benefit grant details (dot choices, tier grants)
- BP creation tracking

These must come from the existing JSON data (`chars_v2.json` or the live database). The script merges Excel point data onto the existing character structure.

### Merit matching strategy

Excel merit slots (columns 114-143 in Character Data) contain formatted strings like `"Indomitable ●●"` or `"Allies ●●● | Police"`. The script must:
1. Parse the slot: extract name, dot count, qualifier
2. Match to the existing character's merit array by name (and qualifier for influence merits)
3. Apply the CP/Free/XP from the corresponding row in the character's individual sheet
4. Set rule_key from purchasable_powers lookup

This matching logic already exists in `migrate-points.js:126-213` — port it.

### Comparison with old pipeline

| Aspect | Old (3-step) | New (single script) |
|--------|-------------|---------------------|
| Steps | migrate-points.js → migrate.js → migrate-schema-v3.js | ingest-excel.js |
| Intermediate format | v2 JSON with parallel arrays | None — builds v3 directly |
| Module system | CommonJS (require) | ES modules (import) |
| Validation | Only in step 3 | Before any write |
| rule_key | Only in step 3 | Resolved during build |
| Output options | JSON file only → MongoDB only → MongoDB only | --dry-run, --json, or MongoDB |

### Testing

- Run `node scripts/ingest-excel.js --dry-run --json` and verify `data/chars_v3.json` is valid
- Compare 5 characters: attribute CP/XP/Free totals match migrate-points.js output
- Compare 5 characters: merit dot totals match
- Compare 5 characters: XP spent breakdown matches
- Verify all 31 pass schema validation
- Verify rule_key populated on standard entries (null only for custom/homebrew)
- Run without flags against tm_suite_dev, verify characters load correctly in admin editor

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-08 | 1.0 | Initial draft | Quinn (QA) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
_Pending implementation_
