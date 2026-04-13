# Story feature.64: Data Portability Redesign

## Status: review

## Story

**As an** ST managing live game data,
**I want** a single, clearly-signposted Data Portability tab with full export/import coverage for every collection,
**so that** I can back up and restore any part of the game state or rules data from one place, and mass-edit rules data without tedious line-by-line work.

## Background

The current Data Portability tab has partial coverage:
- 6 collections (characters, territories, game_sessions, attendance, investigations, npcs)
- Export CSV only — no JSON export, no JSON import
- Import via CSV for non-character collections; characters use Excel import
- No warning banner, no confirmation dialogs
- Missing collections: downtime cycles/submissions, offices, ordeals
- Rules data (purchasable_powers MongoDB collection + static reference JSON files) has no export/import UI at all
- The rules admin allows individual line-item editing, but for mass operations (e.g. replacing all Cruac rites) the user needs to export, bulk-edit, and re-import

## Acceptance Criteria

### AC1 — Warning banner
A prominent banner at the top of the Data Portability tab reads:
> "This tab modifies live game data. Importing will overwrite or change records in the database. Always export before importing. Any action here affects all players immediately."
Banner uses a crimson/warning colour and is always visible (not dismissible).

### AC2 — Two sections
Content is split into two clearly labelled sections:
1. **Game State** — live operational data (characters, territories, sessions, downtimes, ordeals, investigations, NPCs)
2. **Rules Data** — purchasable powers stored in MongoDB, plus static reference files

### AC3 — Game State cards
Each card in Game State provides four buttons (unless noted):
- **Export CSV** — download current data as UTF-8 CSV (existing behaviour preserved)
- **Import CSV** — upload CSV, validate rows, write to API (existing behaviour preserved)
- **Export JSON** — download current data as formatted JSON
- **Import JSON** — upload JSON array, write each document to API

| Card | API endpoint | Notes |
|------|-------------|-------|
| Characters | `/api/characters` | Excel import preserved; JSON import uses `PUT /api/characters/:id` per doc (`_id` match); new docs `POST` |
| Territories | `/api/territories` | |
| Game Sessions | `/api/game_sessions` | |
| Attendance | `/api/game_sessions` | Nested in game_sessions; same shape as existing CSV rows |
| Downtime Cycles | `/api/downtime_cycles` | New card |
| Downtime Submissions | `/api/downtime_submissions` | New card; export all or optionally filter by cycle; import `PUT` by `_id` |
| Investigations | `/api/downtime_investigations` | |
| NPCs | `/api/npcs` | |
| Ordeal Rubrics | `/api/ordeal_rubrics` | New card; rubric definitions/templates |
| Ordeal Submissions | `/api/ordeal_submissions` | New card; player ordeal submission records |
| Ordeal Responses | `/api/ordeal_responses` | New card; player responses for Rules/Lore/Covenant ordeals |
| Offices | — | **Placeholder card only** — court positions not yet designed; card shows "Coming soon — court offices are not yet implemented" with all buttons disabled |

### AC4 — Rules Data cards

Two sub-groups:

#### AC4a — Purchasable Powers (MongoDB)
One card covering the `purchasable_powers` MongoDB collection via `/api/rules`.
This is the primary target for mass rules editing (e.g. replacing all Cruac rites by category).

| Button | Behaviour |
|--------|-----------|
| Export JSON | `GET /api/rules` (all, no `?page`) → download as `TM_rules_YYYY-MM-DD.json` |
| Import JSON | Upload JSON array; for each doc: if `key` exists `PUT /api/rules/:key`, else `POST /api/rules`; confirmation required |
| Export CSV | Flat CSV (key, name, category, sub_category, parent, rank, description) |
| Import CSV | Disabled — button labelled "Not supported" with tooltip "Rules CSV import not supported; use JSON" |

#### AC4b — Static Reference Files
Three read-only export cards for the compiled frontend reference files served by Netlify.
These cannot be imported via the UI (Netlify serves static assets from the git repo; runtime writes are not possible).
Each card has **Export JSON only** — Import buttons are absent. A note on the card reads: "Read-only — to update, edit the source file and redeploy."

| Card | Source file |
|------|-------------|
| Merits DB | `fetch('/data/merits_db.json')` → download |
| Devotions DB | `fetch('/data/devotions_db.json')` → download |
| Manoeuvres DB | `fetch('/data/man_db.json')` → download |

### AC5 — Confirmation on every import
Every import action (CSV or JSON, any collection) shows `window.confirm()` before beginning:
> "Import [Collection Name] from '[filename]'? This will overwrite matching records in the live database. Continue?"
If the user clicks Cancel, nothing proceeds.

### AC6 — Import consolidation
Any import UI that currently exists outside this tab is removed. Export-only controls may remain in their original panels.

### AC7 — JSON export shape
Raw API response arrays, `JSON.stringify(..., null, 2)`. Filename: `TM_[collection]_YYYY-MM-DD.json`.

### AC8 — Result panel
The existing `dp-result` panel (processed/written/rejected + per-row errors) is reused for all import operations including JSON.

## Out of Scope

- Offices implementation (placeholder card only)
- CSV import for Rules Data purchasable_powers (too complex to flatten/roundtrip)
- Bulk-delete via import (upsert only)
- Migrating static reference JSON files to MongoDB (separate architectural decision)

## Architecture Notes

### Two separate rules systems
`/api/rules` → MongoDB `purchasable_powers` — live, editable per record in the admin rules tab. Full CRUD is available.
Static files (`merits_db.json`, `devotions_db.json`, `man_db.json`) — compiled reference data used by the sheet renderer. Served from Netlify CDN; cannot be written to at runtime. Export-only.

### Mass rules editing workflow
To replace all Cruac rites: Export JSON from Purchasable Powers card → filter/edit the JSON locally → Import JSON back. The `key` field is the upsert key.

### Downtime submissions export
`GET /api/downtime_submissions` with no params returns all submissions for an ST (confirmed in route). `?cycle_id=` is optional. No cycle selector UI needed — plain export of all submissions.

### Ordeal routes
`ordeal_rubrics`, `ordeal_submissions`, `ordeal_responses` are all ST-only (`requireRole('st')`). No special auth handling needed beyond the existing ST session.

## Tasks / Subtasks

- [x] Task 1: Warning banner
  - [x] Add `.dp-warning` banner element at top of `buildShell()`
  - [x] CSS: crimson background, white text, full-width, bold "Warning" prefix

- [x] Task 2: Section headings in `buildShell()`
  - [x] Wrap existing 6 cards in "Game State" section
  - [x] Add "Rules Data" section below

- [x] Task 3: Add new Game State cards
  - [x] Downtime Cycles card
  - [x] Downtime Submissions card (check if cycle filter needed)
  - [x] Ordeal Rubrics card
  - [x] Ordeal Submissions card
  - [x] Ordeal Responses card
  - [x] Offices placeholder card (all buttons disabled, "Coming soon" note)

- [x] Task 4: Export JSON for all Game State cards
  - [x] `exportCollectionJson(apiPath, filename)` helper
  - [x] `triggerJsonDownload(json, filename)` helper
  - [x] Wire `.dp-export-json-btn` for all 11 active Game State cards

- [x] Task 5: Import JSON for all Game State cards
  - [x] `handleJsonImport(collection, file)` — confirm → parse → write per doc
  - [x] `writeJsonDoc(collection, doc)` — routes to correct API + method
  - [x] Hidden `.dp-file-json-input` inputs for each card
  - [x] Wire `.dp-import-json-btn` for all active Game State cards

- [x] Task 6: Rules Data — Purchasable Powers card
  - [x] Export JSON: `GET /api/rules` (all, unpaginated) → download
  - [x] Import JSON: confirm → upsert each doc via `PUT`/`POST /api/rules`
  - [x] Export CSV: flat rules CSV
  - [x] Import CSV: disabled button with tooltip

- [x] Task 7: Rules Data — Static reference export cards
  - [x] Merits DB card: `fetch('/data/merits_db.json')` → download
  - [x] Devotions DB card: `fetch('/data/devotions_db.json')` → download
  - [x] Manoeuvres DB card: `fetch('/data/man_db.json')` → download
  - [x] Each card: Export JSON only, "Read-only" note, no import buttons

- [x] Task 8: Confirmation guards on all imports
  - [x] Wrap all import entry points (CSV, JSON, Excel) with `window.confirm()`

- [x] Task 9: Remove import UI from outside this tab
  - [x] Audit `downtime-views.js` for any import buttons/handlers; remove

- [x] Task 10: CSV headers/rows for new collections (Downtime Cycles, Submissions, Ordeals)
  - [x] Define header arrays and `toRows` functions for each new collection

## Key Files

| File | Change |
|------|--------|
| `public/js/admin/data-portability.js` | Major refactor — all new features |
| `public/js/admin/downtime-views.js` | Remove any import UI found in audit |
| `public/admin.html` or inline CSS | `.dp-warning` styles |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-13 | 1.0 | Initial draft | Angelus / Claude Sonnet 4.6 |
| 2026-04-13 | 1.1 | Added Ordeals cards, Offices placeholder, static reference exports, mass-edit workflow note | Angelus / Claude Sonnet 4.6 |
| 2026-04-13 | 1.2 | Implemented — full redesign, all 10 tasks complete | Claude Sonnet 4.6 |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- `data-portability.js` fully rewritten: warning banner, two-section layout (Game State + Rules Data), 12 Game State cards (11 active + Offices placeholder), Purchasable Powers card, 3 static reference export cards
- All cards get Export CSV + Import CSV + Export JSON + Import JSON where applicable; confirmation guard (`window.confirm`) on every import entry point including Excel
- `buildCard(c)` helper generates card HTML from config, supports `excelImport`, `csvImportLabel`, `verify`, `placeholder` flags
- `handleExportJson` + `triggerJsonDownload` for all collections; `handleStaticExport` fetches static files from Netlify CDN
- `handleJsonImport` + `writeJsonDoc` routes each doc to correct API: PUT if `_id` present, POST otherwise; territories use slug `id` field; ordeal_rubrics + ordeal_submissions are update-only (no POST route on server); rules upsert by `key`
- `handleDowntimeCSVImport` calls exported `processDowntimeCsvFile` and renders result into `#dp-result` using dp- CSS classes
- Drop zone + file input UI removed from `downtime-views.js` `buildShell()` and init listeners; `processFile` refactored to `export async function processDowntimeCsvFile(file)` returning `{ created, updated, unmatched, warnings }` for use by data-portability caller; still writes to `#dt-warnings` if present in DOM
- CSV headers/rows added for all new collections: downtime_cycles, downtime_submissions, ordeal_rubrics, ordeal_submissions, ordeal_responses
- CSS: `.dp-warning` (crimson banner), `.dp-section`, `.dp-section-heading`, `.dp-card-placeholder`, `.dp-placeholder-note` added to admin-layout.css
- `ordeal-responses` API path uses hyphen (not underscore) — matched in `collectionApiPath` map
- Attendance JSON import throws a clear error directing user to use Game Sessions JSON (attendance is nested; no direct attendance-only API)

### File List
- `public/js/admin/data-portability.js`
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `specs/stories/feature.64.data-portability-redesign.story.md`
