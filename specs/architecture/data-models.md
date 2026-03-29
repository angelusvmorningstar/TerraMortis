# Data Models

## Schema Source of Truth

The canonical schema is `data/chars_v2.schema.json` (JSON Schema Draft 2020-12). All data access must conform to this schema. No derived stats are stored -- they are calculated at render time.

## Core Types

### DotBonus

All nine attributes are stored as `DotBonus` objects. Never as bare integers.

```json
{ "dots": 3, "bonus": 0 }
```

`dots` = permanent rating. `bonus` = situational/temporary modifier (Devotions, Disciplines, etc.). Display and roll pools use `dots + bonus`.

### Skill

```json
{ "dots": 2, "bonus": 0, "specs": ["Forgery"], "nine_again": false }
```

`specs` is an array of specialisation strings. `nine_again` is true when the skill grants 9-again by default (e.g. via Professional Training).

### Power (oneOf)

Powers are discriminated by `category`:

| category | Type | Key fields |
|---|---|---|
| `discipline` | Standard Discipline power | `discipline`, `rank`, `name`, `stats`, `pool_size`, `effect` |
| `rite` | Cruac / Theban Sorcery ritual | `tradition`, `level`, `name`, `stats`, `pool_size`, `effect` |
| `devotion` | Cross-discipline devotion | `name`, `stats`, `pool_size`, `effect` |
| `pact` | Invictus oath / covenant pact | `name`, `rank`, `effect` (no stats or pool_size) |

### Merit

All merits are a single array on the character, discriminated by `category`:

| category | Optional fields |
|---|---|
| `general` | `qualifier` (specialisation) |
| `influence` | `area` (sphere name, e.g. "Finance") |
| `domain` | `area` (asset type, e.g. "Safe Place") |
| `standing` | `cult_name` (Mystery Cult name) |
| `manoeuvre` | `rank_name` (chain rank, e.g. "Ravage") |

Professional Training merits additionally carry `role` (e.g. "Enforcer") on a `general` category merit entry.

### Character (top-level)

Required fields: `name`, `player`, `concept`, `clan`, `covenant`, `mask`, `dirge`, `apparent_age`, `features`, `willpower`, `aspirations`, `blood_potency`, `humanity`, `xp_total`, `xp_spent`, `status`, `covenant_standings`, `attributes`, `skills`, `disciplines`, `powers`, `merits`, `touchstones`, `banes`.

Optional fields: `pronouns`, `bloodline`, `court_title`.

**`status`** -- mechanical Status dots in own covenant:
```json
{ "city": 2, "clan": 1, "covenant": 3 }
```

**`covenant_standings`** -- diplomatic standing with OTHER covenants (not own):
```json
{ "Invictus": 1, "Crone": 0 }
```
Keys are constrained to: `"Carthian"`, `"Crone"`, `"Invictus"`, `"Lance"`, `"Ordo"`. A character's own covenant is excluded (tracked in `status.covenant`).

**`disciplines`** -- dot totals keyed by discipline name:
```json
{ "Celerity": 2, "Resilience": 3 }
```
Dots are derived from XP cost via `xpToDots()` at render time; this field stores the final dot total for display.

## XP Cost Rates

| Trait type | XP per dot |
|---|---|
| Attributes | 4 |
| Skills | 2 |
| Clan Disciplines | 3 |
| Out-of-clan Disciplines / Rituals | 4 |
| Merits | 1 |
| Devotions | variable (per `DEVOTIONS_DB`) |

XP fields store **actual XP cost paid**, not dot counts. Dot values are derived at render time:

```js
function xpToDots(xpCost, baseBefore, costPerDot) {
  return baseBefore + Math.floor(xpCost / costPerDot);
}
```

## Derived Stats (never stored)

These are calculated at render time from stored values:

| Stat | Formula |
|---|---|
| Size | 5 (default), modified by Merits |
| Speed | Strength.dots + Dexterity.dots + 5 |
| Defence | min(Wits, Dexterity).dots + Athletics.dots |
| Armour | from relevant Merits |
| Health | Stamina.dots + Size |
| Willpower max | Resolve.dots + Composure.dots |
| Vitae max | Blood Potency table lookup |
| Vitae per turn | Blood Potency table lookup |

## localStorage Layout

| Key | Format | Contents |
|---|---|---|
| `tm_chars_db` | JSON array | Full character array in v2 schema |
| `tm_tracker_<name>` | JSON object | Per-character tracker state (session data) |

The `tm_chars_db` key is shared between Editor and Suite. After Epic 1c, both apps read this key in v2 format via the accessor layer.

## Accessor Layer

All data access routes through `js/data/accessors.js`. No direct property access outside this module.

```js
// Attributes
attrDots(c, a)      // c.attributes[a].dots
attrBonus(c, a)     // c.attributes[a].bonus
attrTotal(c, a)     // dots + bonus

// Skills
skDots(c, s)        // c.skills[s]?.dots || 0
skBonus(c, s)       // c.skills[s]?.bonus || 0
skTotal(c, s)       // dots + bonus
skSpecs(c, s)       // c.skills[s]?.specs || []
skSpecStr(c, s)     // specs joined as string
skNineAgain(c, s)   // c.skills[s]?.nine_again || false

// Merits by category
meritsByCategory(c, cat)   // c.merits.filter(m => m.category === cat)
influenceMerits(c)
domainMerits(c)
standingMerits(c)
generalMerits(c)
manoeuvres(c)

// Influence
influenceTotal(c)
domainRating(c, name)

// Powers
powersByCategory(c, cat)   // c.powers.filter(p => p.category === cat)
discDots(c, name)          // c.disciplines[name] || 0
```

This covers ~25 direct access points in the Suite that currently break against v2 format (see `integration_plan.md` for the full refactor scope).

## Reference Data Files (to be externalised in Epic 1)

Currently baked inline into `tm_editor.html`. Target location after Epic 1:

| File | Contents | Current size |
|---|---|---|
| `data/merits_db.json` | 203+ merit entries with prerequisites and descriptions | ~large |
| `data/devotions_db.json` | 42 devotion entries (31 general + 11 bloodline-exclusive) | ~medium |
| `data/man_db.json` | Manoeuvre definitions | ~small |
| `data/icons.json` | Icon mappings | ~small |
| `data/clan_banes.json` | Clan bane definitions (5 clans) | ~small |
| `data/bloodline_discs.json` | Bloodline discipline mappings | ~small |

## Known Data Issues

These are data quality issues in the existing `chars_v2.json`, not schema violations:

| Character | Issue | Impact |
|---|---|---|
| Gel | Skills XP = 1 total, not per-skill | Incorrect dot calculation for all skills |
| Magda | Skills XP = 1 total, not per-skill | Incorrect dot calculation for all skills |
| Kirk Grimm | Intelligence XP = 5 (not divisible by 4) | Fractional dot result; display as 1 dot |
| Conrad | Discipline dot splits manually corrected | May have errors; verify against sheet |
| 5 unnamed | `features` field populated | Not yet rendered (Epic 2 scope) |

These issues are documented, not fixed. Do not attempt to auto-correct in Epic 1.
