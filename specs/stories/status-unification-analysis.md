# Status Unification — Analysis & Story Plan

## Problem Statement

Character covenant status is split across two separate objects:
- `status.covenant` (integer) — the character's primary covenant standing
- `covenant_standings` (object keyed by covenant short label) — diplomatic standings with OTHER covenants

This dual structure causes:
1. Every consumer must check both objects and determine which to use based on `c.covenant`
2. Prerequisite checks (`prereq.js`) need branching logic: "is this the character's own covenant? → read `status.covenant`, else → read `covenant_standings[key]`"
3. Status tab rendering needs to merge data from both sources to display hierarchy tables
4. The schema says `covenant_standings` should exclude the primary covenant, but **live data violates this** — most characters have their own covenant in `covenant_standings` too, often with a different value than `status.covenant`
5. Data inconsistencies: e.g., Brandy LaRoux has `status.covenant=3` but `covenant_standings.Crone=2`
6. OTS bonus (`_ots_covenant_bonus`) adds a third source of truth for effective covenant status

## Current Data Shape

```json
{
  "covenant": "Circle of the Crone",
  "status": { "city": 2, "clan": 2, "covenant": 3 },
  "covenant_standings": { "Invictus": 1, "Lance": 0 }
}
```

## Proposed New Shape

Unify ALL status into a single `status` object:

```json
{
  "covenant": "Circle of the Crone",
  "status": {
    "city": 2,
    "clan": 2,
    "covenant": {
      "Carthian Movement": 0,
      "Circle of the Crone": 3,
      "Invictus": 1,
      "Lancea et Sanctum": 0,
      "Ordo Dracul": 0
    }
  }
}
```

### Benefits
- Single source of truth for all covenant standings
- No branching logic — always read `status.covenant[covenantName]`
- Character's own covenant is just the entry matching `c.covenant`
- OTS bonus remains a runtime computed field on top
- All five covenants always present (defaults to 0)
- Full covenant names as keys (no short-label mapping needed)

## Live Data Issues to Resolve During Migration

| Character | `status.covenant` | `covenant_standings` own covenant | Conflict? |
|-----------|-------------------|-----------------------------------|-----------|
| Alice Vunder | 2 | Crone: 2 | No |
| Anichka | 5 | Crone: 5 | No |
| Brandy LaRoux | 3 | Crone: 2 | **YES** — which is correct? |
| Carver | 4 | Lance: 3 | **YES** |
| Cazz | 2 | Carthian: 1 | **YES** |
| Charlie Ballsack | 4 | Invictus: 3 | **YES** |
| Charles M-W | 2 | Crone: 3 | **YES** |
| Conrad | 3 | Lance: 3 | No |
| Cyrus | 2 | Crone: 1 | **YES** |
| Doc | 2 | Carthian: 2 | No |
| Edna | 5 | Lance: 4 | **YES** |
| Einar | 2 | Carthian: 2 | No |
| Eve | 3 | Carthian: 3 | No (also has Invictus: 1) |
| Hazel | 3 | Lance: 1 | **YES** |
| Ivana | 2 | Crone: 1 | **YES** |
| Jack | 4 | Crone: 3 | **YES** |
| Keeper | 3 | Crone: 3 | No (also has Invictus: 2) |
| Ludica | 2 | Invictus: 1 | **YES** |
| Mac | 3 | Carthian: 3 | No |
| Magda | 2 | Lance: 2 | No |
| Reed | 3 | Invictus: 2 | **YES** |
| René SD | 5 | Invictus: 4 | **YES** |
| Wan | 2 | Invictus: 2 | No |
| Xavier | 2 | Carthian: 2 | No |
| Yusuf | 2 | Crone: 0, Invictus: 0, Lance: 0 | No (own cov not in standings) |

**14 characters have conflicting values.** ST must confirm which is authoritative before migration.

## Code Touches (files requiring changes)

### Client JS — Core reads/writes
| File | Lines | What |
|------|-------|------|
| `suite/status.js` | 171, 232, 237-242, 277-278, 289-320 | Status tab rendering + edit |
| `data/prereq.js` | 20-30, 168-174 | Prerequisite status resolution |
| `editor/identity.js` | 149-161, 178-182 | Status field editors + updStatus() |
| `editor/sheet.js` | 263-279, 806, 1098-1103 | Standings editor + OTS display + prereq check |
| `editor/domain.js` | 251 | effectiveInvictusStatus() |
| `editor/mci.js` | 370-374 | OTS bonus computation |
| `editor/csv-format.js` | 88-101 | CSV export columns |
| `suite/tracker.js` | 116 | Prestige calculation |
| `admin/city-views.js` | 183 | City admin display |
| `editor/export-character.js` | ~190 | Print data serialisation |
| `editor/print.js` | 106 | Print preview |
| `print/page1.js` | 251-277 | PDF generation |

### Server
| File | Lines | What |
|------|-------|------|
| `routes/characters.js` | 166, 189-190 | Projection + OTS bonus calc |
| `schemas/character.schema.js` | 112-125 | Schema validation |
| `scripts/ingest-excel.js` | 122-174 | Excel import |
| `scripts/fix-covenant-standings.js` | 25-34 | Cleanup script |

### Tests
| File | What |
|------|------|
| `tests/feat-13-14-15-ots.spec.js` | OTS bonus tests |
| `tests/feat-16-17-fix44-tracker-feeding.spec.js` | Prestige tests |

## Stories

### Story 1: Data Migration Script
- Write `server/scripts/migrate-status-unification.js`
- For each character: merge `status.covenant` + `covenant_standings` into new `status.covenant` object
- Use `status.covenant` (integer) as authoritative for own covenant when conflicts exist
- Flag conflicts for ST review
- Dry-run mode (report only) + apply mode
- **Prerequisite:** ST confirms conflict resolutions

### Story 2: Schema Update
- Update `character.schema.js` to accept new shape
- Update `chars_v2.schema.json`
- Update `schema_v2_proposal.md`
- Remove `covenant_standings` field

### Story 3: Client Refactor — Reads
- Update all `status.covenant` (integer) reads to `status.covenant[c.covenant]`
- Update all `covenant_standings[key]` reads to `status.covenant[fullName]`
- Remove all branching "is this the own covenant?" logic
- Update prereq.js, status.js, sheet.js, domain.js, tracker.js, etc.

### Story 4: Client Refactor — Writes
- Identity tab editor: render all 5 covenant status inputs
- Status tab ST edit: write to `status.covenant[name]` directly
- Standings up/down buttons: same path as own covenant

### Story 5: Server + Import/Export
- Update characters route projection
- Update CSV export/import format
- Update Excel ingest script
- Update print/PDF generation

### Story 6: Tests
- Update OTS and tracker tests for new shape
- Add migration verification test
