# Story feature.65: Purchasable Powers Subset Export / Import

## Status: review

## Story

**As an** ST managing rules data,
**I want** to export and import specific subsets of the Purchasable Powers collection (e.g. only Cruac rites, only merits, only disciplines),
**so that** I can mass-edit one category at a time without touching unrelated records.

## Background

The Purchasable Powers card in Data Portability currently exports and imports the entire collection as one JSON blob. For targeted operations (e.g. replacing all Cruac rites before a new chronicle, bulk-updating merit descriptions) this is cumbersome — the ST must filter the file manually after export and risk overwriting unrelated records on import.

The `/api/rules` endpoint already supports `?category=` filtering. A sub-filter on `parent` is not supported server-side but can be applied client-side after fetching.

## Acceptance Criteria

### AC1 — Category dropdown
The Purchasable Powers card gains a `<select>` dropdown with options:
- All (default)
- Merits
- Disciplines
- Devotions
- Rites
- Manoeuvres
- Attributes
- Skills

### AC2 — Sub-filter text input
A free-text input labelled "Filter by parent" appears next to the dropdown. When non-empty it filters the fetched results client-side by `doc.parent` (case-insensitive contains match). This enables e.g. "Rites + Cruac" or "Disciplines + Animalism". It is always visible but only meaningful when a category is selected.

### AC3 — Export respects filters
- Export JSON: fetches `GET /api/rules?category=X` (or `/api/rules` if All), then applies parent filter client-side, then downloads.
- Export CSV: same filtered fetch, then builds CSV.
- Filename includes the active filter: `TM_rules_merit_2026-04-13.json`, `TM_rules_rite_cruac_2026-04-13.json`, `TM_rules_all_2026-04-13.json`.

### AC4 — Import ignores filters
Import JSON upserts every document in the uploaded file by `key` regardless of the dropdown selection. The filter is for export only. A note below the import button reads: "Import applies to all documents in the file regardless of filter."

### AC5 — Empty result handling
If the filtered export returns zero documents, show an alert: "No records found for the selected filter."

## Tasks / Subtasks

- [x] Task 1: Add category dropdown and parent filter input to Purchasable Powers card in `buildShell()`
  - [x] `<select id="dp-rules-category">` with All + 7 category options
  - [x] `<input id="dp-rules-parent" placeholder="Filter by parent (optional)">` text input

- [x] Task 2: Update `handleExportJson('rules')` to read dropdown + input values
  - [x] Fetch `GET /api/rules?category=X` or `/api/rules` if All
  - [x] Apply client-side `parent` filter if text input non-empty
  - [x] Show alert if result is empty
  - [x] Build filename from active filters

- [x] Task 3: Update `handleExport('rules')` (CSV) with same filter logic

- [x] Task 4: Add "Import applies to all documents in the file regardless of filter" note below Import JSON button

- [x] Task 5: CSS — style the filter controls to sit inline with the card buttons without breaking the card layout

## Dev Notes

### API category values (lowercase, match server enum)
`merit`, `discipline`, `devotion`, `rite`, `manoeuvre`, `attribute`, `skill`

### Filename construction
```javascript
const cat = categorySelect.value || 'all';
const parent = parentInput.value.trim().toLowerCase().replace(/\s+/g, '_') || '';
const suffix = parent ? `${cat}_${parent}` : cat;
// → TM_rules_merit_2026-04-13.json
// → TM_rules_rite_cruac_2026-04-13.json
```

### Client-side parent filter
```javascript
if (parentFilter) {
  docs = docs.filter(d => d.parent?.toLowerCase().includes(parentFilter.toLowerCase()));
}
```

### Key files
| File | Change |
|------|--------|
| `public/js/admin/data-portability.js` | Add filter controls, update export handlers |
| `public/css/admin-layout.css` | Filter control styles |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-13 | 1.0 | Initial draft | Angelus / Claude Sonnet 4.6 |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- `fetchRulesFiltered()` shared helper reads `#dp-rules-category` and `#dp-rules-parent` from the DOM; fetches `GET /api/rules?category=X` (or all if empty); applies client-side `parent` contains filter; returns `{ docs, filenameSuffix }`
- Both `handleExportJson('rules')` and `exportRulesCSV()` now delegate to `fetchRulesFiltered()` — single source of filter logic
- Filename encodes active filters: `TM_rules_all_YYYY-MM-DD.json`, `TM_rules_rite_cruac_YYYY-MM-DD.json`
- Import JSON unchanged — upserts by `key` regardless of filter; import note added to card
- CSS: `.dp-rules-filters` flex row, `.dp-rules-select`, `.dp-rules-parent`, `.dp-rules-import-note`

### File List
- `public/js/admin/data-portability.js`
- `public/css/admin-layout.css`
- `specs/stories/feature.65.rules-subset-export-import.story.md`
