# Story 3.2: Character Data CSV Export

**Status:** ready-for-dev

## Story

As a Storyteller,
I want to export all character data as a CSV matching the Affinity Publisher data merge format,
so that I can produce printed character sheets using the existing Affinity template without manual data entry.

## Context

The existing workflow uses a Power Query in `Terra Mortis Character Master (v3.0).xlsx` to pull character data from individual Excel tabs and format it for Affinity Publisher mail merge. This story replicates that output format from the v2 character data in the app, replacing the Excel dependency for print sheet production.

A full HTML-rendered printable character sheet is a future story. This story focuses solely on the CSV data export that feeds the existing Affinity template.

## Acceptance Criteria

1. A "Download CSV" button exists in the admin app's Player domain (character list view).
2. Clicking the button downloads a CSV file containing one row per character, matching the column structure of `Character Data Export.csv` (reference file in repo root).
3. Attributes are formatted as dot strings using `●` (e.g. `●●●●` for 4 dots). Bonus dots use `○` (e.g. `●●○○` for 2 base + 2 bonus).
4. Skills are formatted the same way as attributes (dot strings).
5. Specialisations are comma-separated in their respective `[Skill] Spec` columns.
6. Health, Willpower, and Vitae use filled/empty square strings (`□` for available, `■` for used/missing) matching the Excel format. Current values show as `N / N` in the numeric column.
7. Humanity renders individual level columns (Humanity 10 through Humanity 1) with touchstone text at the appropriate level, `●` for filled levels, `○` for empty levels.
8. Merits populate 30 numbered `Merit N` and `Merit Effect N` column pairs. Standing merits (MCI, PT) include their role/cult name. Derived merits (from MCI/PT grants) are included.
9. Influence populates 20 numbered slots with `Influence N` (merit name), `Area N` (sphere), and `Influence Dots N` (dot string).
10. Disciplines populate individual columns (Animalism through Transmutation) as dot strings. Zero-dot disciplines show `-`.
11. Blood powers populate 30 numbered `Blood N`, `Blood Stats N`, and `Blood Effect N` column pairs from the character's powers array.
12. Banes populate Clan Bane, Bloodline Bane, Other Bane 1-3 columns with name and effect.
13. Derived stats (Size, Speed, Defence) are calculated and included.
14. Willpower triggers (Mask 1WP, Mask AllWP, Dirge 1WP, Dirge AllWP) and Aspirations (3 slots) are included.
15. The `¬` character is used for empty/not-applicable fields (matching the Excel convention).
16. Clan Icon and Covenant Icon columns contain file path strings (matching existing Excel format).
17. The CSV filename follows the pattern `TM_Character_Export_YYYY-MM-DD.csv`.

## Tasks / Subtasks

- [ ] Task 1: Build CSV column mapping (AC: all)
  - [ ] Define the complete column header array matching `Character Data Export.csv` (~300+ columns)
  - [ ] Create a `formatDots(n)` helper returning `●` strings
  - [ ] Create a `formatDotsWithBonus(base, bonus)` helper returning `●●○○` strings
  - [ ] Create a `formatSquares(filled, total)` helper returning `□□□■■■` strings
  - [ ] Create a `formatHumanityLevel(level, humanity, touchstones)` helper

- [ ] Task 2: Build character-to-row mapper (AC: 3-14)
  - [ ] Map identity fields (name, player, clan, etc.)
  - [ ] Map attributes as dot strings (AC 3)
  - [ ] Map skills as dot strings + specialisations (AC 4-5)
  - [ ] Map BP, Health, Willpower, Vitae with squares (AC 6)
  - [ ] Map humanity levels with touchstones (AC 7)
  - [ ] Map status fields (city, clan, covenant + covenant standings)
  - [ ] Map domain merits (Safe Place, Haven, Feeding Grounds, Herd, MCI, PT)
  - [ ] Map general merits into 30 slots with effects (AC 8)
  - [ ] Map influence merits into 20 slots with areas and dots (AC 9)
  - [ ] Map disciplines as dot strings (AC 10)
  - [ ] Map powers into 30 Blood slots with stats and effects (AC 11)
  - [ ] Map banes (AC 12)
  - [ ] Calculate and map derived stats (AC 13)
  - [ ] Map willpower triggers, aspirations, apparent age, features (AC 14)

- [ ] Task 3: Implement download (AC: 1, 17)
  - [ ] Replace `downloadCSV()` stub in `export.js` with implementation
  - [ ] Generate CSV with proper escaping (commas in text, quotes)
  - [ ] Trigger browser download with dated filename (AC 17)
  - [ ] Add "Download CSV" button to admin Player domain view

- [ ] Task 4: Verify against reference (AC: 2, 15-16)
  - [ ] Compare output for 2-3 characters against `Character Data Export.csv` values
  - [ ] Verify `¬` used for empty fields (AC 15)
  - [ ] Verify icon path format (AC 16)

## Dev Notes

### Architecture Compliance

**Source:** `specs/architecture-st-admin.md`

This is a frontend-only feature. No API changes. The CSV is generated client-side from the character data already loaded in memory. The existing XLSX library (`xlsx@0.18.5`, already loaded in `index.html`) can be used for CSV generation, or standard `Blob` + `URL.createObjectURL` for a pure CSV approach.

### Reference File

`Character Data Export.csv` in repo root contains the exact column structure and sample data for 30 characters. This is the source of truth for column ordering and formatting conventions.

`Character Template.csv` in repo root contains the blank template structure showing field names and layout.

### Key Column Groups (from reference CSV)

| Group | Columns | Format |
|---|---|---|
| Identity | Sheet through Court Title | Plain text, `¬` for empty |
| Attributes | Intelligence through Composure | Dot strings `●●●` |
| Skills | Academics through Subterfuge | Dot strings (empty = no column content) |
| BP/Health/WP/Vitae | Blood Potency through Can Feed From | Numeric + squares |
| Specialisations | `[Skill] Spec` x24 | Comma-separated text |
| Status | City/Clan/Covenant Status + covenant standings | Numeric + dot strings |
| Domain merits | Safe Place through Prof Training Role | Dot strings + text |
| Humanity | Hum, Hum Icon, Humanity 10-1 | `●`/`○` + touchstone text |
| Merits 1-30 | Name + Effect pairs | Text, `¬` for empty |
| Influence | Total + Squares + 20 slots (name, area, dots) | Dot strings |
| Disciplines | Animalism through Transmutation (17) | Dot strings, `-` for zero |
| Blood powers 1-30 | Name, Stats, Effect triples | Text |
| Banes | Clan/Bloodline/Other + Effects | Text |
| Derived | Size, Speed, Defence | Numeric |
| WP triggers | Mask/Dirge 1WP/AllWP | Text |
| Aspirations | 1-3 | Text |
| Misc | Apparent Age, Features | Text |

### Existing Code to Reuse

- **`accessors.js`**: `getAttrVal()`, `getAttrBonus()`, `skDots()`, `skBonus()`, `skSpecs()`, `meritsByCategory()`, `influenceMerits()`, `discPowers()`, `devotions()`, `rites()`
- **`derived.js`**: `calcSize()`, `calcSpeed()`, `calcDefence()`, `calcHealth()`, `calcWillpowerMax()`, `calcVitaeMax()`
- **`mci.js`**: `applyDerivedMerits()` — call this before export to include PT/MCI grants
- **`export.js`**: `charsForSave()` for clean character copies, `downloadCSV()` stub to replace
- **`suite/sheet-helpers.js`**: `dots(n)` function exists but returns HTML — need a plain-text version

### Formatting Conventions (from reference CSV)

- **Dot strings**: `●` (U+25CF) repeated. No spaces between dots.
- **Bonus dots**: `○` (U+25CB) appended after filled dots. E.g. `●●○○` for BP 2 with 2 bonus.
- **Squares**: `□` (U+25A1) for available, `■` (U+25A0) for used/max. E.g. `□□□□■■■■■■` for 4/10 health.
- **Empty fields**: `¬` (U+00AC) — not blank, not null.
- **Discipline zeros**: `-` (hyphen), not `¬`.
- **Icon paths**: Full local file paths like `D:\Terra Mortis\Character Sheets\Sheet Elements\Mekhet icon.svg`. These should use a configurable base path.

### File Placement

- Primary implementation in `public/js/editor/export.js` (replace stub)
- If the mapper exceeds 500 lines, split formatting helpers into `public/js/editor/csv-format.js`
- Button added to admin Player domain in `public/js/admin/player-views.js` or equivalent

### What This Story Does NOT Do

- No HTML/CSS print sheet (future story)
- No PDF generation
- No server-side export (pure client-side)
- No changes to character data or schema

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
