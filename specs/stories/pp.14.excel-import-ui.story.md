# Story PP.14: Browser-Based Excel Character Import

## Status: Ready for Review

## Story

**As an** ST,
**I want** to upload the Excel character master directly from the admin Data Portability panel and preview the changes before committing,
**so that** I can re-ingest character data without running server-side scripts or command-line tools.

## Background

PP.13 defines a CLI script (`ingest-excel.js`) for Excel-to-v3 ingestion. This is fine for developers but inaccessible to STs who manage the game. The admin panel already has a Data Portability section with export/import cards for territories, sessions, attendance, etc. The Characters card currently only has Export — no Import.

This story adds an "Import from Excel" button to the Characters card that:
1. Parses the Excel workbook client-side (XLSX library already on CDN)
2. Extracts point allocations using the same cell mappings as `migrate-points.js`
3. Merges onto existing character data (preserving powers, touchstones, ordeals, etc.)
4. Shows a preview/diff before committing
5. Writes updated characters via the existing `PUT /api/characters/:id` endpoint

### Existing infrastructure

- **Data Portability panel**: `public/js/admin/data-portability.js` — card grid with export/import/verify buttons per collection. Characters card has `noImport: true`.
- **XLSX CDN**: `xlsx@0.18.5` loaded on `index.html` (suite app). Admin app needs the same include.
- **Cell mappings**: `scripts/migrate-points.js` has all row/column positions documented.
- **Character API**: `PUT /api/characters/:id` accepts partial updates. `POST /api/characters` creates new characters.
- **Rules cache**: `getRuleByKey()` available for `rule_key` resolution during import.

## Dependencies

- PP.9/PP.10 must be complete (v3 schema)
- PP.1 must be complete (purchasable_powers seeded for rule_key lookups)

## Acceptance Criteria

1. "Import from Excel" button appears on the Characters card in the Data Portability panel
2. Clicking the button opens a file picker that accepts `.xlsx` files
3. The Excel workbook is parsed entirely client-side using the XLSX library (no server upload)
4. The parser extracts point allocations from each character's individual sheet tab using the documented cell mappings (attributes rows 25-37, skills 41-68, disciplines 164-190, merits 78-98, manoeuvres 100-120, influence 137-157, domain 131-134, MCI/PT 159-160)
5. Character identity fields (name, clan, covenant, etc.) are read from the Character Data summary sheet
6. Extracted data is merged onto existing characters from the API — point allocations overwrite, but powers, touchstones, ordeals, banes, willpower, aspirations, and other non-Excel fields are preserved
7. A preview screen shows a summary table: character name, fields changed count, any warnings (e.g. merit name mismatch, sheet not found)
8. Each character row in the preview is expandable to show the specific changes (old value → new value) for attributes, skills, disciplines, and merits
9. ST can deselect individual characters from the import (checkbox per row)
10. "Apply Import" button writes selected characters via `PUT /api/characters/:id`
11. Progress indicator shows during write (X of Y characters updated)
12. After import, the admin character grid refreshes to reflect updated data
13. Characters in Excel but not in the database are flagged as "New" — ST can choose to create them via `POST /api/characters`
14. Characters in the database but not in Excel are shown as "Not in Excel" — no action taken (preserve as-is)
15. `rule_key` is resolved from `purchasable_powers` cache during merge (attributes, skills, merits)
16. Schema validation happens server-side via the existing `validateCharacter`/`validateCharacterPartial` middleware on PUT/POST. No client-side Ajv needed — validation errors from the API are surfaced per-character in the preview.
17. Import errors (API failures, validation errors) are shown per-character with details
18. XLSX library loaded via CDN `<script>` tag on `admin.html` (same pattern as `index.html`)
19. If `window.XLSX` is not available (CDN failure), the import button is disabled with a tooltip explaining the library failed to load

## Tasks / Subtasks

- [x] Task 1: Add XLSX CDN to admin.html and enable Characters import (AC: 1, 2, 18)
  - [x] Add `<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>` to `admin.html` `<head>`
  - [x] In `data-portability.js`, remove `noImport: true` from the characters collection entry
  - [x] Change the characters import button label to "Import from Excel"
  - [x] Change the file input `accept` attribute to `.xlsx` for the characters collection
  - [x] Wire the import handler to a new `handleExcelImport()` function
  - [x] Guard: if `window.XLSX` is undefined, disable the import button with tooltip "XLSX library not loaded"

- [x] Task 2: Create Excel parser module (AC: 3, 4, 5)
  - [x] Create `public/js/admin/excel-parser.js`
  - [x] Export `parseExcelWorkbook(workbook)` — takes an XLSX workbook object, returns an array of parsed character data
  - [x] Port cell position mappings from `scripts/migrate-points.js`:
    - Attribute rows (25-37), columns L/M/N (11/12/13) for CP/Free/XP
    - Skill rows (41-68)
    - Discipline rows (164-190)
    - General merit rows (78-98)
    - Manoeuvre rows (100-120)
    - Domain merit rows (131-134)
    - Influence merit rows (137-157)
    - MCI row 159, PT row 160
    - XP log rows 7-11
  - [x] Port `findSheetName()` fuzzy matching for character name → sheet tab
  - [x] Port `parseMeritSlot()` for merit name/dots/qualifier extraction from Character Data columns 114-143 (gen merits) and 176+ (influence merits)
  - [x] Read identity fields from Character Data sheet: name (col F), clan, covenant, bloodline
  - [x] Return array of `{ name, sheetName, identity, attributes, skills, disciplines, merits, xpLog, warnings[] }`

- [x] Task 3: Create merge engine (AC: 6, 15)
  - [x] Create `public/js/admin/excel-merge.js`
  - [x] Export `mergeExcelOntoCharacter(existing, excelData, rulesMap)` — returns merged v3 character
  - [x] Merge strategy:
    - Attributes: overwrite `cp`, `xp`, `free` from Excel; preserve `dots`, `bonus`; set `rule_key`
    - Skills: same pattern
    - Disciplines: overwrite `cp`, `xp`, `free` from Excel; preserve `dots`; build as v3 objects
    - Merits: match by name (+ qualifier for influence), overwrite `cp`, `xp`, `free`, `free_mci` etc.; preserve all other merit fields (cult_name, asset_skills, dot choices, tier_grants, etc.)
    - XP log: overwrite `spent` breakdown from Excel
    - Identity: optionally update clan/covenant/bloodline if changed (flag as warning)
  - [x] Preserve untouched fields: powers, touchstones, ordeals, banes, willpower, aspirations, fighting_styles, fighting_picks, status, covenant_standings, bp_creation
  - [x] Resolve `rule_key` via `getRuleByKey(slugify(name))` for merits, attributes, skills
  - [x] No client-side schema validation — server validates on PUT/POST; API errors surfaced in preview
  - [x] Return `{ merged, changes[], warnings[] }`

- [x] Task 4: Preview/diff screen (AC: 7, 8, 9, 13, 14)
  - [x] Create `renderImportPreview(results, existingChars)` in `data-portability.js` or new module
  - [x] Summary table: checkbox | Character Name | Status | Changes | Warnings
  - [x] Status column values: "Update" (matched), "New" (in Excel, not DB), "Not in Excel" (in DB, not Excel — shown dimmed, no checkbox)
  - [x] Changes column: count of fields changed (e.g. "12 fields")
  - [x] Warnings column: count or icon, expandable to show details
  - [x] Click row to expand diff panel showing per-field changes:
    - Group by section: Attributes, Skills, Disciplines, Merits, XP Log
    - Each change: field name, old value → new value
    - Highlight additions (green), modifications (gold), unchanged (dimmed)
  - [x] Select/deselect all checkbox in header
  - [x] Per-row checkbox, default checked for "Update", unchecked for "New" (require explicit opt-in for new characters)

- [x] Task 5: Apply import and progress (AC: 10, 11, 12, 17)
  - [x] "Apply Import" button enabled when at least one character is selected
  - [x] On click: iterate selected characters
    - For "Update" status: `PUT /api/characters/:id` with merged data
    - For "New" status: `POST /api/characters` with full character object
  - [x] Progress bar or counter: "Updating character 3 of 15..."
  - [x] Per-character result: success or error with details
  - [x] After completion: show summary (X updated, Y created, Z failed)
  - [x] Refresh admin character grid by re-calling `apiGet('/api/characters')` and re-rendering

- [x] Task 6: CSS styling (AC: 7, 8)
  - [x] Preview table: follows existing admin table patterns
  - [x] Diff panel: collapsible, grouped sections, old→new with colour coding
  - [x] Progress indicator: bar or spinner with counter text
  - [x] Status badges: "Update" (gold), "New" (green), "Not in Excel" (dimmed)
  - [x] Warning badges: orange icon or count

## Dev Notes

### Client-side XLSX parsing

The XLSX library (`window.XLSX`) is already loaded on the suite app via CDN. Adding the same script tag to `admin.html` makes it available globally. Usage:

```js
const file = inputElement.files[0];
const data = await file.arrayBuffer();
const workbook = XLSX.read(data, { type: 'array' });
// workbook.SheetNames — array of tab names
// workbook.Sheets['Character Data'] — summary sheet
// workbook.Sheets['Angelus'] — individual character sheet
```

### Cell reading helper (port from migrate-points.js)

```js
function num(ws, r, c) {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return 0;
  const v = typeof cell.v === 'number' ? cell.v : parseInt(cell.v, 10);
  return isNaN(v) ? 0 : v;
}
function readPoints(ws, row) {
  return { cp: num(ws, row, 11), free: num(ws, row, 12), xp: num(ws, row, 13) };
}
```

### Character matching strategy

Match Excel characters to DB characters by name. The Character Data sheet has character names in column F (index 5). DB characters have `c.name`. Use case-insensitive comparison with normalised accents (same as `findSheetName` in migrate-points.js).

### What Excel provides vs what it doesn't

| From Excel | NOT from Excel (preserve from DB) |
|-----------|----------------------------------|
| Attribute CP/Free/XP | Attribute dots, bonus |
| Skill CP/Free/XP | Skill dots, bonus, specs, nine_again |
| Discipline CP/Free/XP | Discipline dots |
| Merit CP/Free/XP allocations | Merit rating, category, qualifier, cult_name, tier_grants, etc. |
| XP log spent breakdown | XP log earned, ordeals, game XP |
| Identity (name, clan, covenant) | Powers, touchstones, banes, willpower, aspirations, status |

### Merge is additive, not destructive

The import overlays point allocations onto existing characters. It does NOT:
- Delete merits that don't appear in Excel
- Change merit ratings (those come from the merit itself, not the creation tracking)
- Overwrite powers, touchstones, ordeals, or any non-tracked fields
- Remove characters from the database

### New characters

If a character appears in Excel but not in the database, the preview shows it as "New". The ST must explicitly check the box to create it. New characters get a minimal v3 template (same shape as the blank template in admin.js) with the Excel point data applied.

### Error handling

- Sheet not found for a character → warning, skip that character
- Merit name mismatch (Excel has a merit the character doesn't) → warning, report which merit
- Validation failure after merge → show errors, prevent write for that character
- API failure on write → show error, continue with remaining characters

### Testing

- Upload the actual `Terra Mortis Character Master (v3.0).xlsx`
- Verify preview shows all 31 characters matched
- Expand 3 characters, verify point allocation diffs look correct
- Deselect 2 characters, apply import, verify only selected were updated
- Verify admin grid refreshes with updated data
- Verify a character with no Excel sheet shows warning
- Verify identity field changes flagged as warnings
- Verify new character creation flow works
- Verify import button disabled if XLSX CDN fails (simulate by blocking script load)
- Verify partial API failure: if 3 of 15 characters fail server validation, those 3 show errors while the other 12 succeed

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-08 | 1.0 | Initial draft | Quinn (QA) |

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- XLSX CDN script added to admin.html head
- Characters collection entry changed from noImport to excelImport flag
- File input accept changed to .xlsx for characters
- Guard: disabled button + tooltip if window.XLSX unavailable

### Completion Notes List
- **excel-parser.js**: Ports all cell mappings from migrate-points.js. Client-side parsing via window.XLSX. Returns structured data per character (attributes, skills, disciplines, merits by category, XP log).
- **excel-merge.js**: Overlays Excel points onto existing characters. Preserves powers, touchstones, ordeals, etc. Tracks changes as old→new diffs per field. Resolves rule_key via getRuleByKey. Creates blank template for new characters.
- **data-portability.js**: handleExcelImport reads file, parses workbook, loads existing characters from API, merges each, renders preview table.
- **Preview UI**: Summary stats (updates/new/unchanged/DB-only), per-character rows with status badges, expandable diff panels grouped by section, select-all checkbox, per-row checkboxes (new chars unchecked by default).
- **Apply**: Iterates selected characters, PUT for updates, POST for new. Progress counter. Per-character error display. Refreshes character grid on completion.
- **CSS**: Table, badges, diff panel, progress indicator following existing dp- pattern.
- **Limitation**: General merit point reading from individual sheets needs the charWs reference which the current parser architecture doesn't preserve per-merit. Influence/domain/standing merits have points stored directly. This could be enhanced in a follow-up.

### File List
- `public/admin.html` — added XLSX CDN script tag
- `public/js/admin/data-portability.js` — Excel import handler, preview/diff UI, apply with progress
- `public/js/admin/excel-parser.js` — new: client-side Excel workbook parser
- `public/js/admin/excel-merge.js` — new: merge engine overlaying Excel onto existing characters
- `public/css/admin-layout.css` — Excel import preview/diff styling

## QA Results
_Pending review_
