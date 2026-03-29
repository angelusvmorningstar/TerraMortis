# Terra Mortis TM Suite

A browser-based character management system for a **Vampire: The Requiem 2nd Edition** campaign. Two self-contained HTML applications — no backend, no build system, no dependencies.

## Applications

| File | Purpose |
|------|---------|
| `tm_editor.html` | Character editor with List / Sheet / Edit views. Runs on v2 schema. |
| `index.html` | Storyteller Suite with Roll, Sheet, Territory, and Tracker tabs. Currently on legacy schema. |
| `Terra Mortis — Territory Bid Tracker.html` | Standalone territory management tool. |

## Getting Started

Open any `.html` file directly in a browser. No build step or server required.

Data is stored in `localStorage`:

- `tm_chars_db` — v2 character JSON (Editor)
- `tm_import_chars` — legacy format JSON (Suite)
- `tm_tracker_<name>` — per-character tracker data

## Data Files

| File | Description |
|------|-------------|
| `chars_v2.json` | 30 characters in v2 schema (source of truth) |
| `tm_characters.json` | 30 characters in legacy schema (used by Suite) |
| `Terra Mortis Character Master (v3.0).xlsx` | Source Excel workbook |

## v2 Schema

Full specification in `schema_v2_proposal.md`. Key design rules:

- Attributes are `{ dots, bonus }` objects, never bare integers
- Skills are `{ dots, bonus, specs: [], nine_again }` objects
- Merits use a single array with a `category` field
- Derived stats (size, speed, defence, health) are calculated at render time, never stored
- XP fields store actual XP cost; dots are derived via cost-per-dot rates

### XP Cost Rates (VtR 2e Flat)

| Type | Cost per Dot |
|------|-------------|
| Attributes | 4 XP |
| Skills | 2 XP |
| Clan Disciplines | 3 XP |
| Out-of-clan / Ritual Disciplines | 4 XP |
| Merits | 1 XP |
| Devotions | Variable |

## Embedded Reference Data

The editor embeds several large lookup tables:

- **CLANS** (5) and **COVENANTS** (5)
- **MASKS_DIRGES** (26 archetypes)
- **MERITS_DB** (203+ entries with prerequisites and descriptions)
- **DEVOTIONS_DB** (42: 31 general + 11 bloodline-exclusive)
- **MAN_DB** (manoeuvre definitions)
- **CLAN_BANES**, **BLOODLINE_DISCS**

## Integration Roadmap

The two applications are converging into a single tool. See `integration_plan.md` for details.

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | Current | Editor on v2, Suite on legacy, manual sync |
| 2 | Planned | Suite reads v2 via shared accessor functions |
| 3 | Future | Single merged application |

## Conventions

- British English throughout (Defence, Armour, Vigour, etc.)
- Dark theme with gold (`#E0C47A`) accents and crimson (`#8B0000`) damage states
- Fonts: Cinzel / Cinzel Decorative (headings), Lora (body) via Google Fonts
- Dots displayed as `●` (U+25CF)

## Documentation

- `schema_v2_proposal.md` — v2 data schema specification
- `integration_plan.md` — Suite/Editor convergence plan
- `HANDOVER_v3.md` — Latest implementation notes and known issues
- `HANDOVER_v2.md` — Previous handover notes
