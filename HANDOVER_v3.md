# Terra Mortis Character Editor — Handover v3

**Date:** 2026-03-27
**File:** `/home/claude/tm_editor.html` (~517KB)
**Data:** `/home/claude/chars_v2.json` (30 characters, v2 schema)

---

## What Was Built This Session

### XP System (corrected)

XP fields throughout store **actual XP cost**, not dot counts. Dots are derived via `xpToDots(xpCost, baseBeforeXP, costPerDot)` using **flat rates** from VtR 2e:

- Attributes: 4 XP per dot
- Skills: 2 XP per dot
- Clan Disciplines: 3 XP per dot
- Out-of-clan / Ritual Disciplines: 4 XP per dot
- Merits: 1 XP per dot
- Devotions: variable (stored per devotion in DEVOTIONS_DB)

The `xpToDots()` and `dotsToXP()` helper functions use simple division/multiplication. The earlier progressive costing (new rating × multiplier) was incorrect and has been fully replaced.

### Column Mapping from Excel

Confirmed correct mapping for character sheet tabs:

| Column | Letter | Content |
|--------|--------|---------|
| 12 | L | Creation Points (CP) |
| 13 | M | Special / Free Points (SP) — for attributes, includes starting dots |
| 14 | N | Raw XP spent |
| 15 | O | Conversion (dots from XP) |
| 16 | P | Base total |
| 20 | T | Specialisation count |
| 21 | U | Bonus dots (e.g. from Vigour, PT) |
| 22 | V | Total including bonus |
| 23 | W | 9-Again flag |

Discipline tracking is in the **BLOOD POWERS** section starting at row 163, with core disciplines at rows 165–174 and Cruac/Theban at rows 184–185, using the same L/M/N/O/P column structure.

### Attributes (edit mode)

- Three columns (Mental/Physical/Social) with priority dropdowns (Primary 5CP / Secondary 4CP / Tertiary 3CP)
- CP remaining counter per category, green at 0, red if over
- Per-attribute breakdown panel: CP, Fr, XP inputs with derived total
- CP capped to category budget
- `free` field includes starting dots (1 base + 1 for clan attribute)
- Clan attribute selector with star marker
- Derived/Effective row for Vigour→Strength, Resilience→Stamina bonus dots
- Clan attribute change recalculates dots for both old and new attribute (adjusts free field)

### Skills (edit mode)

- Same three-column layout with priority dropdowns (Primary 11CP / Secondary 7CP / Tertiary 4CP)
- Per-skill CP/Fr/XP breakdown panels beneath each skill row
- CP capped to category budget
- Specialisation editing: per-spec input rows with add/remove
- Area of Expertise +2 display derived from AoE merit qualifier match (`hasAoE()`, `formatSpecs()`)
- Spec budget counter: 3 base + 2 from Professional Training ●●
- Skill bonus dots from column U verified against schema (all 5 match)
- 9-Again from column W verified (zero mismatches)

### Disciplines (edit mode)

- **All 10 core disciplines visible** in edit mode (not just owned ones)
- In-clan tagged based on clan or bloodline (`BLOODLINE_DISCS` lookup)
- CP counter: 3 total, minimum 2 in-clan, maximum 1 out-of-clan
- Per-discipline CP/Fr/XP breakdown panels
- Cruac/Theban shown if character is in relevant covenant or already has dots
- Sorcery themes displayed without breakdown (no separate cost)
- Devotions, Rites, Pacts render in both modes (moved outside if/else block)

### Devotions (edit mode)

- **42 devotions in DEVOTIONS_DB**: 31 general + 11 bloodline-exclusive
- Each owned devotion: expandable row with XP cost tag, prereqs in drawer, remove button
- **"+ Add Devotion" button** reveals dropdown of qualified devotions only
- Prerequisite checking via `meetsDevPrereqs()`:
  - General devotions: character must meet all discipline dot prereqs (AND), or any one (OR for Summoning)
  - Bloodline devotions: must have matching bloodline (`bl` field) + discipline prereqs if any
- Bloodline-restricted: City Attunement, Incriminating Evidence, Our Mother's Mind → Scions of the First City only
- Bloodline devotions extracted from character data: Lasombra, Order of Sir Martin, Rotgrafen, Mnemosyne, Norvegi, Zelani, Apollinaire

### Influence Merits (edit mode)

- Per-merit row: type dropdown (Allies/Contacts/Mentor/Resources/Retainer/Staff/Status), area text input, rating input (0–5), influence value display, remove button
- "Add Influence Merit" button adds a new Allies at rating 1
- **Influence calculation** (`calcTotalInfluence()`):
  - Clan Status: 1 per dot
  - Covenant Status: 1 per dot
  - Influence merits at 3 dots: 1 influence
  - Influence merits at 5 dots: 2 influence
  - MCI at 5 dots: 1 influence
  - Narrow Status (outside 16 spheres): 1 at 5 dots only
- **16 Influence Spheres** in `INFLUENCE_SPHERES` constant
- Total influence shown in both view and edit modes

### Stats Strip

Now shows 7 cells: BP, Humanity, **Health**, **Willpower**, Size, Speed, Defence

- Health = Stamina + Size + Resilience (discipline)
- Willpower = Resolve + Composure
- Speed = Strength + Dexterity + Size + Vigour (discipline) + Fleet of Foot
- Defence = min(Dex, Wits) + Athletics (or Defensive Combat skill)
- Health uses heart SVG (full), Willpower uses chevron shield SVG, both crimson

### Character List

- Cards show covenant icon + clan icon in header (was clan only)

### MERITS_DB Updated

203 entries (up from 155), rebuilt from Character Builder `Lookup-Merits`. Each entry now has:
- `desc`: description
- `prereq`: prerequisite string (134 entries)
- `type`: Kindred/Mental/Physical/Social/Carthian Law/Invictus Oath/Style (184 entries)
- `rating`: min–max range (129 entries)
- `excl`: exclusion list (6 entries)
- `special`: "standing" flag for PT and MCI

---

## Data Issues / Known State

### Conrad's discipline data — manually corrected
Auspex CP=2 XP=9, Obfuscate CP=0 XP=3, Theban CP=1 XP=12. Total powers XP=24. Matches Excel.

### Other characters' discipline data
Still derived by algorithm (not from Excel BLOOD POWERS rows 163+). Some allocations may be wrong. Fix by feeding individual character sheets and reading from rows 165–174 (core) and 184–185 (sorcery).

### Attribute/Skill data
28/30 match Excel exactly. Gel and Magda have specialty XP (1 XP each) in the Skills XP total that isn't per-skill.

### Kirk Grimm
Excel has Intelligence XP=5 (not divisible by 4). `floor(5/4)=1` dot, total=2. Correct total, odd XP value.

---

## Pending / Not Yet Built

### Merit Editing (General)
- General merits need add/remove/edit with prereq validation from MERITS_DB
- Domain merits (Safe Place, Haven, Feeding Grounds): simple add/rating/remove
- Manoeuvres: already have their own section, not yet editable

### Standing Merit Editing (PT / MCI)
- Professional Training: role input, asset skill selection (dropdown of character's skills), rating
- Mystery Cult Initiation: cult name input, rating
- Area of Expertise dropdown from character's specialisations (noted in memory)

### Status Editing
- City/Clan/Covenant status values not yet editable inline
- Court title not yet editable

### BP / Humanity Editing
- Not yet editable in stats strip

### Other Pending
- `features` field rendering (exists on 5 characters, no code)
- Export view (CSV download stub)
- Sync to Suite (`v2ToOld()` converter documented but not coded)
- Domain merit backfill from Excel
- Full discipline data re-extract from Excel BLOOD POWERS rows

---

## Key Files

| File | Purpose |
|------|---------|
| `/home/claude/tm_editor.html` | Main editor (production build) |
| `/home/claude/chars_v2.json` | v2 character data (30 chars) |
| `/home/claude/devotions_db.json` | Full devotions DB (42 entries) |
| `/home/claude/devotions_db_compact.json` | Compact JS version |
| `/home/claude/merits_db_new.json` | Rebuilt MERITS_DB (203 entries) |
| `/home/claude/index.html` | ST Suite (reference) |
| `/home/claude/icons_block.js` | Base64 SVG icons |

---

## Conventions

- British English (Defence, Armour, Vigour, Honour, Socialise)
- No em-dashes
- Validate JS: `node -e "new vm.Script(...)"`
- Work on `/home/claude/`, deliver to `/mnt/user-data/outputs/`
- Use Python `str.replace()` for file edits, not sed
- Assert anchor strings exist before index arithmetic
- `ensure_ascii=True` when re-serialising CHARS_DATA via Python
