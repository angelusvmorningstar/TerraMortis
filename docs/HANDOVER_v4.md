# Terra Mortis Editor — Handover Document v4

**Date:** 29 March 2026
**Project:** Terra Mortis LARP ST Suite & Character Editor
**Lead ST:** Angelus
**Domain:** terramortislarp.com (Netlify)

---

## 1. Project Overview

Terra Mortis is a Vampire: The Requiem 2e parlour LARP running monthly in Sydney. The tooling consists of several single-file HTML/CSS/JS apps with no build step, deployed to Netlify by dragging a folder.

### File Inventory

| File | Purpose | Size | Schema |
|------|---------|------|--------|
| `index.html` | ST Suite (Roll, Sheet, ST, Territory tabs) | 333K | v1 |
| `tm_editor.html` | Character editor (creation point tracking, merit validation) | 414K | v2 |
| `sheet_preview.html` | Print character sheet preview | 226K | sheet |
| `terra_mortis_v3.html` | Public website | 113K | n/a |
| `terra_mortis_web_style_guide.html` | Website style guide | 35K | n/a |
| `tm_territory_bids.html` | Territory bidding tool | 24K | n/a |
| `chars_v2.json` | Full 30-character dataset (authoritative, not deployed) | 363K | v2 |

All deployed files currently contain **6 fake test characters** only. Real character data lives in `chars_v2.json` (not deployed).

### Technology

- Vanilla HTML/CSS/JS throughout, no frameworks (except React 18 CDN for the Territory tab in index.html)
- Google Fonts: Cinzel, Cinzel Decorative, Lato
- No npm, no bundler, no build step
- Deployment: drag folder to Netlify

---

## 2. Character Data Schemas

Three schema variants exist across the apps. The editor's v2 schema is authoritative.

### v2 Schema (tm_editor.html, chars_v2.json)

```
name: string
player: string
concept: string
pronouns: string
clan: "Daeva" | "Gangrel" | "Mekhet" | "Nosferatu" | "Ventrue"
bloodline: string | null
covenant: "Carthian Movement" | "Circle of the Crone" | "Invictus" | "Lancea et Sanctum"
mask: string
dirge: string
court_title: string | null
apparent_age: string | null
features: string | null

willpower: {
  mask_1wp: string,
  mask_all: string,        // NOTE: v1 uses "mask_all_wp"
  dirge_1wp: string,
  dirge_all: string        // NOTE: v1 uses "dirge_all_wp"
}

blood_potency: int
humanity: int
xp_total: int
xp_spent: int              // NOTE: v1 uses "xp_left" (= xp_total - xp_spent)

status: { city: int, clan: int, covenant: int }

covenant_standings: {       // NOTE: v1 uses array of {label, status}
  "Carthian": int,
  "Invictus": int,
  "Lance": int
}

attributes: {
  "Intelligence": { dots: int, bonus: int },
  ...                       // NOTE: v1 uses flat int
}

skills: {
  "Academics": { dots: int, bonus: int, specs: string[], nine_again: bool },
  ...                       // NOTE: v1 uses { dots: int, spec: "comma,joined" }
}

disciplines: { "Auspex": int, ... }   // Same in v1

powers: [
  {
    category: "discipline" | "devotion" | "rite" | "pact" | "theme",
    discipline: string,
    rank: int,
    name: string,
    stats: string,
    pool_size: int | null,
    effect: string
  }
]
// NOTE: v1 uses a single "name" string like "Obfuscate ●● | Touch of Shadow"

merits: [                  // Unified array with category field
  {
    category: "general" | "influence" | "domain" | "standing" | "manoeuvre",
    name: string,
    rating: int,
    qualifier: string,     // Optional (e.g., AoE spec name, shared info)
    area: string,          // Influence merits: sphere or retainer name
    ghoul: bool,           // Retainer only
    cult_name: string,     // MCI only
    role: string,          // PT only
    asset_skills: string[],// PT only
    benefits: string[5],   // MCI only: text description per dot level
    benefit_grants: [      // MCI only: structured merit grants per dot level
      { category: string, name: string, rating: int, qualifier?: string } | null
    ],
    active: bool,          // MCI only: false = suspended
    shared_with: string[], // Domain merits: partner character names
    notes_col_d: string,   // Source annotation from spreadsheet column D
    granted_by: string,    // Static annotation (legacy, being replaced by derived system)
    derived: bool,         // true = injected at render time by applyDerivedMerits()
    prereq_failed: bool    // true = grant failed prereq check
  }
]
// NOTE: v1 uses string[] for merits (e.g., "Closed Book ●●●")
// NOTE: v1 uses separate "influence" array of {area, dots}

merit_creation: [          // Parallel array to merits, same indices
  { cp: int, free: int, xp: int, up: int }
  // cp = Creation Points, free = Free dots, xp = XP dots
  // up = Unaccounted Points (visible, mechanically inert)
  // Rating = cp + free + xp (UP excluded)
]

touchstones: [{ humanity: int, name: string, desc: string }]
banes: [{ name: string, effect: string }]
aspirations: string[]
ordeals: [{ name: string, complete: bool, xp: int }]

xp_log: {
  earned: { starting: int, humanity_drop: int, ordeals: int, game: int },
  spent: { attributes: int, skills: int, merits: int, powers: int, special: int }
}

attribute_priorities: { Mental: string, Physical: string, Social: string }
skill_priorities: { Mental: string, Physical: string, Social: string }
clan_attribute: string
attr_creation: { "Intelligence": { cp: int, free: int, xp: int }, ... }
skill_creation: { "Academics": { cp: int, free: int, xp: int }, ... }
disc_creation: { "Auspex": { cp: int, free: int, xp: int }, ... }
```

### Key Schema Differences (v2 vs v1)

| Field | v2 (editor) | v1 (index.html) |
|-------|-------------|-----------------|
| willpower keys | `mask_all`, `dirge_all` | `mask_all_wp`, `dirge_all_wp` |
| XP tracking | `xp_spent` | `xp_left` (= total - spent) |
| attributes | `{ dots, bonus }` | flat int |
| skills | `{ dots, bonus, specs: [], nine_again }` | `{ dots, spec: "string" }` |
| merits | unified array with `category` field | string array + separate influence array |
| covenant_standings | object `{ "Carthian": 0 }` | array `[{ label, status }]` |
| powers | structured `{ category, discipline, rank, name }` | single name string |

---

## 3. Editor Architecture (tm_editor.html)

### File Structure (3,121 lines)

| Lines | Content |
|-------|---------|
| 1-9 | HTML head |
| 10-436 | CSS (`<style>` block) |
| 437-528 | HTML body (sidebar, edit panel, sheet panel) |
| 529-648 | Constants (ICONS as base64, DEVOTIONS_DB, MERITS_DB, MAN_DB inline) |
| 649-770 | Utility functions, merit helpers, derived merit system |
| 771-1541 | Extracted renderSheet section functions (9 functions) |
| 1542-1694 | renderSheet orchestrator (186 lines) |
| 1695-1980 | Sheet interaction handlers (edit, status, banes, etc.) |
| 1981-2042 | CHARS_DATA (6 fake test characters, 51K) |
| 2043-2100 | loadDB, saveDB, charsForSave, syncToSuite |
| 2100-2550 | Edit panel functions (Identity tab, Attrs tab) |
| 2550-2780 | Merit manipulation functions |
| 2780-3121 | Remaining functions, init |

### Inline Data Blocks (to be externalised after build is complete)

| Block | Size | Content |
|-------|------|---------|
| `ICONS` | 117K | Base64-encoded SVG icons (clan, covenant, status) |
| `MAN_DB` | 44K | Manoeuvre reference database |
| `MERITS_DB` | 26K | Merit reference database (prereqs, ratings, descriptions) |
| `DEVOTIONS_DB` | 11K | Devotion/bloodline power reference |
| `CHARS_DATA` | 51K | 6 fake test characters |

### Key Architectural Patterns

**renderSheet extraction:** The main render function was split into 9 focused section functions that each return an HTML string. The orchestrator (`renderSheet`, 186 lines) calls them in sequence.

| Function | Purpose |
|----------|---------|
| `shRenderStatsStrip(c)` | BP, Humanity, Health, WP, Size, Speed, Defence |
| `shRenderAttributes(c, editMode)` | 3x3 attribute grid with priority headers and creation costs |
| `shRenderSkills(c, editMode)` | Skill list with specialisations, spec counter, 9-again |
| `shRenderDisciplines(c, editMode)` | Disciplines, blood sorcery themes, devotions, rites, pacts |
| `shRenderInfluenceMerits(c, editMode)` | Allies, Contacts, Mentor, Retainer, Resources, Status merits |
| `shRenderDomainMerits(c, editMode)` | Safe Place, Haven, Herd (shared partner UI) |
| `shRenderStandingMerits(c, editMode)` | MCI (with grant picker), PT (with asset skills) |
| `shRenderGeneralMerits(c, editMode)` | General merits with prereq-filtered dropdown, AoE spec picker |
| `shRenderManoeuvres(c)` | Fighting styles with expandable rank details |

**Centralised merit helpers:**
- `meritByCategory(c, category, filteredIdx)` — returns `{merit, realIdx}` for filtered-index lookups
- `ensureMeritSync(c)` — pads/trims `merit_creation` to match `merits` array length
- `addMerit(c, merit)` — pushes merit and syncs creation array
- `removeMerit(c, realIdx)` — splices both arrays

**Derived merit system:**
- `applyDerivedMerits(c)` runs at the top of `renderSheet`
- Strips all `derived: true` merits, then recomputes from active MCI `benefit_grants`
- Checks prereqs via `meritQualifies()` before injecting; sets `prereq_failed: true` on failures
- `charsForSave()` deep-copies chars and strips derived merits before writing to localStorage

**Merit breakdown row helper:**
- `meritBdRow(realIdx, mc)` — single function generating the CP/Fr/XP/UP input row
- All 7 previous inline constructions replaced with this helper

**Domain merit sharing:**
- `domMeritContrib(c, name)` — character's own dots (CP + Free + XP)
- `domMeritShareable(c, name)` — CP + XP only (what partners contribute to shared pool)
- `domMeritTotal(c, name)` — own + partners' shareable, capped at 5
- Partners share CP + XP only; Free points stay with the owner

---

## 4. MCI Benefit Grant System

### How It Works

Each MCI dot level can have a structured merit grant stored in `benefit_grants` on the MCI merit object. At render time, `applyDerivedMerits()` injects these as derived merits into the character's merits array.

### Data Structure

```json
{
  "category": "standing",
  "name": "Mystery Cult Initiation",
  "rating": 5,
  "cult_name": "The Hollow Archive",
  "active": true,
  "benefits": ["", "", "", "", ""],
  "benefit_grants": [
    { "category": "general", "name": "Eidetic Memory", "rating": 1 },
    { "category": "general", "name": "Table Turner", "rating": 1 },
    { "category": "general", "name": "Indomitable", "rating": 2 },
    { "category": "general", "name": "Peacemaker", "rating": 3 },
    { "category": "general", "name": "Closed Book", "rating": 3 }
  ]
}
```

### Edit Mode UI

Each dot level shows:
1. A prereq-filtered merit dropdown (same filter as `buildMeritOptions`)
2. A rating input (capped by MERITS_DB max rating)
3. A qualifier text input
4. A description text input (stored in `benefits` array)

### Prereq Validation

- Grants must meet character prerequisites (MCI does not bypass prereqs)
- `meritQualifies(c, prereqString)` checks the character's stats against MERITS_DB prereqs
- Failed prereqs are flagged with `prereq_failed: true` and shown with red "Invalid" tag and strikethrough styling

### View Mode

Each dot level shows a gold "Grant" tag with the merit name and dots, plus description text.

### Suspend/Activate

Toggling MCI `active` to `false` hides all derived merits from the Merits section.

### Current State

Only Whisper (mirrors Keeper) has structured `benefit_grants`. The other four MCI characters (Viktor, Selene, Solomon, Jade) still have their grants as static `granted_by` entries in the merits array. These need dot-level mapping confirmation from the ST before converting.

---

## 5. UP (Unaccounted Points)

The `up` field in `merit_creation` objects is a temporary parking spot for dots whose source hasn't been traced. UP is visible in edit mode (red styling) but does NOT contribute to rating, totals, or sharing.

As sources get structured (MCI grants, SSJ derivation, Lorekeeper, etc.), dots move from UP into structured grants and the UP count drops to zero.

---

## 6. Test Characters

All deployed files contain 6 fake test characters mirroring the mechanical complexity of the originals:

| Fake Name | Mirrors | Key Features |
|-----------|---------|--------------|
| Viktor Ashwood | Charlie Ballsack | 32 merits, PT4, MCI5, 4 Oaths, shared domain, AoE x3 |
| Selene Varga | Ivana Horvat | 18 merits, MCI4, shared domain, bloodline devotions |
| Whisper | Keeper | 8+5 derived merits, MCI5 with benefit_grants, shared domain |
| Marcus Webb | Conrad Sondergaard | 5 merits, PT4 with granted Contacts, Lorekeeper |
| Jade Moreno | Brandy LaRoux | 17 merits, MCI5, SSJ, Viral Mythology |
| Solomon 'Shade' Katz | Yusuf 'Mammon' Kalusicj | 17 merits, MCI5, Fucking Thief |

Shared domain group: Viktor/Selene/Whisper (mirrors Charlie/Ivana/Keeper).

---

## 7. Conversion Between Schemas

When porting characters between apps, the key transformations are:

### v2 to v1 (editor to index.html)
- Flatten attributes: `{dots, bonus}` to `dots + bonus`
- Join skill specs: `["Archery"]` to `"Archery"`
- Compute `xp_left` from `xp_total - xp_spent`
- Rename willpower keys: `mask_all` to `mask_all_wp`
- Convert covenant_standings object to array
- Convert structured powers to name strings (e.g., `"Obfuscate ●● | Touch of Shadow"`)
- Split merits array into string `merits[]` and `influence[]`
- Nameless discipline powers: just `"Celerity ●"` (don't double the name)

### v2 to sheet (editor to sheet_preview.html)
- Same as v2 to v1, plus:
- Extract `domain` object from domain-category merits
- Extract `standing` object from standing-category merits
- Add `type` field to influence entries

---

## 8. Rules and Conventions

### British English Throughout
Defence, Armour, Vigour, Honour, Socialise, capitalise, manoeuvre.

### No Em-Dashes
Use commas, semicolons, or sentence breaks instead.

### XP Costs (Flat Rates)
- Attributes: x4
- Skills: x2
- Clan Disciplines: x3
- Out-of-clan/Ritual: x4

### Domain Merit Sharing
- Safe Place and Haven capped at 5 dots maximum
- Partners share CP + XP (not Free points)
- MCI-granted domain dots count as shareable
- Herd: maximum 1 per character, no notes field, no shared partner UI

### Influence Generation
- Standard merits (Allies, Contacts, Mentor, Resources, Retainer, Staff, Mortal Status): 1 influence at 3 dots, 2 at 5 dots
- Narrow/Specialist Status and MCI: 1 at 5 dots only
- Clan and Covenant Status: 1 per dot
- 16 spheres: Bureaucracy, Church, Finance, Health, High Society, Industry, Legal, Media, Military, Occult, Police, Politics, Street, Transportation, Underworld, University

### Merit Prereqs
- MCI grants must meet character prerequisites
- `buildMeritOptions(c, currentName)` filters MERITS_DB by prereqs
- `meritQualifies(c, prereqString)` checks attrs, skills, disciplines, clan, covenant

---

## 9. Development Practices

### Editing Workflow
- Work on `/home/claude/` copies
- Output to `/mnt/user-data/outputs/`
- `/mnt/project/` is read-only reference
- Use `ensure_ascii=True` when re-serialising CHARS_DATA via Python
- Validate every JS edit with `node -e "new vm.Script(...)"`
- Use Python `str.replace()` for multi-line edits (sed breaks on template literals)
- Use `grep -n` with `| grep -v "CHARS_DATA\|MAN_DB\|MERITS_DB"` to filter false matches

### Validation Commands

```bash
# Validate JS syntax
node -e "
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('tm_editor.html','utf8');
const s=src.match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n');
new vm.Script(s); console.log('JS valid');
"

# Check for real character names
grep -l "Charlie Ballsack\|Ivana Horvat\|Brandy LaRoux" *.html

# Check extracted function boundaries
python3 -c "
with open('tm_editor.html') as f: lines=f.readlines()
for fn in ['shRenderStatsStrip','shRenderAttributes','shRenderSkills','shRenderDisciplines',
           'shRenderInfluenceMerits','shRenderDomainMerits','shRenderStandingMerits',
           'shRenderGeneralMerits','shRenderManoeuvres']:
    start=depth=None
    for i,line in enumerate(lines):
        if f'function {fn}' in line: start=i; depth=0
        if start is not None:
            depth+=line.count('{')-line.count('}')
            if depth<=0 and i>start:
                has_ret=any('return h' in lines[j] for j in range(max(start,i-5),i+1))
                print(f'  {fn}: {start+1}-{i+1} ({i-start+1} lines) {\"OK\" if has_ret else \"MISSING return h!\"}')
                break
"
```

---

## 10. Pending Work

### High Priority
- Wire MCI `benefit_grants` on remaining 4 test characters (need dot-level mapping confirmation)
- Professional Training grant system (design agreed: same dropdown pattern as MCI, not coded)
- MCI granting domain merits (Selene's Safe Place from MCI L1: design for domain grants not yet built)

### Medium Priority
- SSJ to Herd derivation rules (awaiting ST confirmation)
- Viral Mythology bonus dots (awaiting confirmation for Alice, Brandy, Charles, Jack)
- Rating cap enforcement from MERITS_DB
- Herd: enforce max 1 per character, no notes, no shared UI
- Externalise MAN_DB, MERITS_DB, DEVOTIONS_DB to separate JSON files (after build is complete)

### Lower Priority
- Status editing, BP/Humanity editing in the editor
- `features` field rendering (5 characters have it, no display code)
- Print character sheet (SVG asset kit exists, direction not chosen, samples A/B/C produced)
- Downtime 2 processing infrastructure
- Sub-pages for terramortislarp.com (About & Safety, House Rules, Player Tools)
- Julia (Amelia) not yet in the editor

### Known Data Issues
- Whisper's Mandragora Garden qualifier still says "Shared (Ivana)" (should be "Shared (Selene Varga)" in fake data)
- Cyrus Reynolds's Contacts entries missing area strings (real data)
- Einar Solveig's large XP gap unresolved (real data)
- Conrad's Herd shows effective 0 (its `merit_creation` has all zeros because it's `granted_by: 'Lorekeeper'`, derivation not wired)

---

## 11. Reference Files

| File | Purpose |
|------|---------|
| `CharacterData.xlsx` | Authoritative character data source (openpyxl, data_only=True) |
| `Downtime1.xlsx` | Downtime 1 submissions (uploaded version more complete than project copy) |
| `TM_Downtime_Merit_Actions.md` | Highest authority on merit actions |
| `TM_Investigation_Matrix.md` | Investigation threshold rules |
| `Terra Mortis Style Guide` | Editorial style reference |
| `Terra Mortis Document Design Guide` | Visual design reference |
| `tblMerits_updated.tsv` | Merit data source |
| `tblDisciplines_updated.tsv` | Discipline data source |
| `tblManoeuvre_updated.tsv` | Manoeuvre data source |
| `merits_db.json` / `man_db.json` / `disc_lookup_final.json` | Processed reference databases |

### CharacterData.xlsx Column Mapping (K-W, Row 1 Headers)
K=Lost, L=CP, M=SP, N=XP, O=Cnv, P=Ttl, Q=Min, R=Max, S=(empty), T=Spc, U=Bon, V=Add, W=9A

Column D is the authoritative source for `granted_by` annotations.

---

## 12. Approach and Patterns

- Iterative delivery: each change delivered as a complete file before proceeding
- Validation before character data: always check attributes, skills, disciplines as well as merits
- Read directly from source files rather than memory or inference
- Confirm pools before rolling; roll on explicit instruction
- Extract key points first, await confirmation, then draft
- When a str_replace misses, diagnose with `grep -n` or extract the relevant block
- Symon holds specific narrative decisions (flag for him rather than resolving)
