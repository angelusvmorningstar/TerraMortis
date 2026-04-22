# Story: rites.0 — Rites CSV Export Script

## Status: superseded

## Summary

Generate `Rites DB.csv` from the authoritative `Rites.xlsx` source file. The script must normalise category, strip the "Offering: " prefix from offering values, and output the correct 21-column CSV (adding the new `offering` column).

---

## Scope

| Layer | Change |
|-------|--------|
| `scripts/export-rites-csv.py` | New Python script (run manually) |
| `Rites DB.csv` | Regenerated output |

Out of scope: MongoDB import (user runs that separately).

---

## Acceptance Criteria

1. Script reads `Rites.xlsx` from the project root and outputs `Rites DB.csv` in the same directory
2. Output CSV has exactly 21 columns in this order:
   `key, name, category, sub_category, parent, rank, rating_min, rating_max, pool_attr, pool_skill, pool_disc, resistance, cost, action, duration, prereq_json, exclusive, xp_fixed, bloodline, description, offering`
3. `category` is `rite` for every row (fixes Theban rows that have `None`)
4. `offering` column contains the material component text with the `"Offering: "` prefix stripped — blank when not present
5. `Book`, `Page`, `Edition` columns are excluded from the output (authoring metadata only)
6. All 133 rites are present in the output
7. Script prints a summary: row count, how many rows have offerings, any rows with missing keys

---

## Tasks / Subtasks

- [x] Write `scripts/export-rites-csv.py` (all ACs)
  - [x] Read `Rites.xlsx` with `openpyxl` (`data_only=True`)
  - [x] Fix `category` → `'rite'` for all rows
  - [x] Strip `"Offering: "` prefix (case-insensitive) from offering values
  - [x] Output 21-column CSV with correct header order
  - [x] Print summary stats on completion
- [x] Run script and verify `Rites DB.csv` output
  - [x] Confirm 133 rows
  - [x] Spot-check 3–5 rows for correctness (key, offering strip, category)

---

## Dev Notes

### Source file
`Rites.xlsx` — Sheet1, 134 rows (1 header + 133 rites), 24 columns:
`key, name, category, sub_category, parent, rank, rating_min, rating_max, pool_attr, pool_skill, pool_disc, resistance, cost, action, duration, prereq_json, exclusive, xp_fixed, bloodline, description, Offering, Book, Page, Edition`

### Column mapping
- Columns 1–20: pass through as-is
- Column 21 (`Offering`): rename to `offering`, strip `"Offering: "` prefix
- Columns 22–24 (`Book`, `Page`, `Edition`): drop

### Category fix
Theban rows have `category = None`. Set all rows to `'rite'`.

### Offering prefix stripping
Values are like `"Offering: A rod or staff"` — strip the leading `"Offering: "` (with capital O and trailing space). Use a case-insensitive strip to be safe.

### Key column
Keys should all be static strings by now (e.g. `rite-aarons-rod`). If any row has a formula key (starts with `=`), log a warning and skip.

### Output path
Same directory as the script's project root: `D:\Terra Mortis\TM Suite\Rites DB.csv`

### Dependencies
`openpyxl` — already used in prior scripts in this session.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- Script reads `Rites.xlsx` with `data_only=True`; Cruac keys were uncached formulas returning None — added `key_from_name()` fallback that replicates the Excel formula logic (lowercase, spaces→hyphens, strip apostrophes, prefix `rite-`)
- `category` forced to `'rite'` for all rows (Theban rows had None)
- `"Offering: "` prefix stripped case-insensitively via regex
- Output: 133 rows, 50 with offerings, 21 columns, no warnings on final run
- Verified: Aaron's Rod (Theban, offering present), Blood Scourge (Theban, offering with em-dash), Rigor Mortis (Cruac, no offering)

### File List

- `scripts/export-rites-csv.py`
- `Rites DB.csv`

### Change Log

- 2026-04-23: Implemented rites.0 — CSV export script with key fallback and offering normalisation
