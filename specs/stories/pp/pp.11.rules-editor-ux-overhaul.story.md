# Story PP.11: Rules Editor UX Overhaul

## Status: Review

## Story

**As an** ST,
**I want** the admin Rules page to have a proper paginated table with modal edit/add dialogs,
**so that** I can efficiently browse, search, edit, and create game rules for 620+ entries without performance issues or awkward inline editing.

## Dependencies

- PP.8 must be complete (existing rules-view.js and API routes)

## Background

PP.8 shipped a functional but minimal rules browser. With 620 documents rendering at once the DOM is sluggish, the inline expand pattern is awkward for editing, there is no way to add new rules, and the table lacks structured columns. This story replaces the current implementation with a production-quality admin tool.

**Scope note:** Delete functionality is explicitly out of scope — accidental deletion of game rules is high-risk and not needed for MVP. If needed later, it gets its own story with confirmation dialogs and soft-delete.

## Acceptance Criteria

1. `GET /api/rules` supports server-side pagination: `?page=1&limit=50` returns `{ data: [...], total, page, pages }`
2. `GET /api/rules` supports server-side text search: `?q=indomitable` filters by name and description (case-insensitive)
3. Category filter (`?category=merit`) and text search combine — both applied server-side
4. Existing non-paginated consumers (`loadRulesFromApi`) still work (no `page` param = return full array, backwards compatible)
5. Table has structured columns: Name, Category, Parent, Rating/Rank, Prereq summary
6. Table has fixed header row with column labels
7. Pagination controls below table: Previous/Next, page indicator ("Page 2 of 13"), page size selector (25/50/100)
8. Each row has an Edit action button (pencil icon or "Edit" text)
9. Edit button opens a modal dialog with all fields — read-only fields displayed, editable fields as inputs
10. Modal Save calls `PUT /api/rules/:key`, shows validation errors inline, closes on success
11. "Add Rule" button above the table opens a modal with empty fields for creating a new rule
12. Add modal Save calls `POST /api/rules`, validates required fields (key, name, category) client-side before submit
13. After add/edit save, table refreshes to show updated data
14. Search input retains focus on keystroke (no re-render focus loss)
15. Search input has a clear (X) button

## Tasks / Subtasks

- [x] Task 1: API pagination and server-side search (AC: 1, 2, 3, 4)
  - [x] Update `GET /` in `server/routes/rules.js`
  - [x] If `page` query param present: apply `skip((page-1)*limit)` and `limit(limit)`, run `countDocuments(filter)` for total, return `{ data, total, page, pages }`
  - [x] If `page` param absent: return flat array as before (backwards compatible)
  - [x] If `q` param present: add `{ $or: [{ name: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }] }` to filter
  - [x] Combine `category` and `q` filters with `$and`
  - [x] Default limit: 50. Clamp to max 100.
  - [x] Create compound text index on `name` + `description` for search performance (or rely on regex for 620 docs — acceptable at this scale)

- [x] Task 2: Rewrite rules-view.js table rendering (AC: 5, 6, 7, 14, 15)
  - [x] Replace client-side filtering with server-side fetch on every filter/search/page change
  - [x] Render `<table>` with `<thead>` fixed header: Name, Category, Parent, Rating/Rank, Prereqs, Actions
  - [x] Render `<tbody>` rows from paginated response `data` array
  - [x] Rating column: show `rating_range` as "1-5" for merits, `rank` for disciplines/manoeuvres, `xp_fixed` + "XP" for devotions
  - [x] Prereq column: truncated `prereqLabel()` output, max ~40 chars with ellipsis
  - [x] Actions column: Edit button per row
  - [x] Pagination controls: Prev/Next buttons (disabled at bounds), "Page X of Y", page size dropdown
  - [x] Debounce search input (300ms) to avoid excessive API calls on every keystroke
  - [x] Retain search focus + cursor position after re-render
  - [x] Clear (X) button on search input (existing fix from this session)

- [x] Task 3: Edit modal dialog (AC: 8, 9, 10, 13)
  - [x] Create `renderEditModal(rule)` — overlay + dialog following existing `.plm-overlay`/`.plm-dialog` pattern
  - [x] Read-only section: key, category (immutable after creation)
  - [x] Editable section: name, parent, rank, description (textarea), rating_range (min/max number inputs), pool (attr + skill + disc), resistance, cost, action, duration, prereq (JSON textarea with validation), special, exclusive, bloodline, sub_category (dropdown), xp_fixed (shown for devotions)
  - [x] Footer: Save button, Cancel button, inline status/error display
  - [x] Save: collect edited fields, `PUT /api/rules/:key`, show validation errors from API response, close on success
  - [x] On success: invalidate rules cache, re-fetch current page

- [x] Task 4: Add modal dialog (AC: 11, 12, 13)
  - [x] "Add Rule" button in toolbar above table (next to search)
  - [x] Create `renderAddModal()` — same modal template but all fields editable including key, name, category
  - [x] Category dropdown: 7-value enum from schema
  - [x] Sub-category dropdown: shown when category === 'merit' (general/influence/domain/standing)
  - [x] Client-side validation before submit: key (required, slug format), name (required), category (required)
  - [x] Key field: auto-generate slug from name on blur (editable override)
  - [x] Save: `POST /api/rules`, show errors (including 409 duplicate key conflict), close on success, re-fetch current page

- [x] Task 5: CSS styling (AC: 5, 6, 8, 9, 11)
  - [x] Table styles: `.rules-tbl`, `.rules-tbl th`, `.rules-tbl td` — follow existing admin table patterns
  - [x] Alternating row backgrounds, hover highlight
  - [x] Fixed header: `thead { position: sticky; top: 0 }`
  - [x] Pagination bar: flex row, centered controls
  - [x] Modal: reuse `.plm-overlay`/`.plm-dialog` pattern with `rules-` prefix
  - [x] Modal field layout: 2-column grid for short fields, full-width for textarea
  - [x] Edit button: subtle icon or text button, gold on hover

- [x] Task 6: Remove old inline expand code
  - [x] Remove `expandedKey` state, `renderEditPanel()`, `roField()`, `editField()`, `editRatingRange()` from rules-view.js
  - [x] Remove `.rules-edit-panel`, `.rules-ro-*`, `.rules-edit-fields`, `.rules-field-*` CSS (replaced by modal styles)
  - [x] Remove old inline row toggle from `wireEvents`

## Dev Notes

### API backwards compatibility
The client-side `loadRulesFromApi()` in `data/loader.js` calls `GET /api/rules` without pagination params and expects a flat array. When `page` is absent, the endpoint must return the flat array exactly as before. Only when `page` is present does it return the paginated envelope `{ data, total, page, pages }`.

### Existing modal pattern
`public/css/admin-layout.css` has `.plm-overlay` and `.plm-dialog` for the player link modal. Follow the same structural pattern (fixed overlay, centered dialog, header/body/footer) but with `rules-modal-` prefix to avoid collision.

### Search debounce
At 620 documents with server-side regex, each search request is <10ms on MongoDB. Debounce is a courtesy to avoid visual flicker, not a performance necessity. 300ms is standard.

### Page size in localStorage
Persist the selected page size to `localStorage.getItem('tm_rules_page_size')` so it survives page reloads.

### Testing

- Verify `GET /api/rules` without `page` param returns flat array (backwards compat)
- Verify `GET /api/rules?page=1&limit=25` returns envelope with 25 items
- Verify `GET /api/rules?page=1&limit=50&category=merit` returns only merits
- Verify `GET /api/rules?page=1&limit=50&q=indo` returns filtered results with correct total
- Verify table renders with proper columns and pagination
- Verify Edit modal opens, displays correct data, saves changes
- Verify Add modal creates a new rule, appears in table
- Verify validation errors display in modal
- Verify search retains focus, debounces, clears with X button
- Verify app startup: `loadRulesFromApi()` still receives flat array (backwards compat after route change)
- Verify Add modal shows 409 error when creating a duplicate key

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-08 | 1.0 | Initial draft | Quinn (QA) |
| 2026-04-08 | 2.0 | Implementation complete: paginated table, edit/add modals | Claude Opus 4.6 |

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Server route syntax check passed
- rules-view.js is browser ES module (node --check CJS error expected)

### Completion Notes List
- **API (rules.js)**: Added pagination envelope `{data, total, page, pages}` when `?page` present; flat array when absent (backwards compatible). `?q` does case-insensitive regex on name+description. `?category` and `?q` combine with `$and`. Default limit 50, max 100.
- **Table (rules-view.js)**: Complete rewrite. Server-side fetch on every filter/search/page change. `<table>` with sticky `<thead>`, columns: Name, Category, Parent, Rating, Prereqs, Actions (edit button). Pagination controls: Prev/Next, page indicator, page size selector (25/50/100) persisted to localStorage.
- **Search**: 300ms debounce, retains focus + cursor position after re-render, clear (X) button.
- **Edit modal**: Fetches single rule via `GET /api/rules/:key`. Read-only: key, category. Editable: all other fields including pool (3 sub-fields), prereq (JSON textarea), rating_range (min/max). Save via `PUT /api/rules/:key`, validation errors shown inline.
- **Add modal**: All fields editable. Key auto-generated from name on blur (editable override). Client-side validation: key (slug format), name, category required. Save via `POST /api/rules`, shows 409 duplicate key errors.
- **CSS**: Table with alternating rows, hover highlight, sticky header. Modal follows plm-overlay pattern with `rules-modal-` prefix. 2-column grid for short fields, full-width for textareas.
- **Old code removed**: Entire file rewritten — expandedKey, renderEditPanel, roField, editField, editRatingRange, old wireEvents row toggle all gone. Old CSS classes (rules-edit-panel, rules-ro-*, rules-edit-fields, rules-field-*) replaced with modal equivalents.

### File List
- `server/routes/rules.js` — added pagination, search, category filter with backwards-compatible flat array mode
- `public/js/admin/rules-view.js` — complete rewrite: paginated table, edit/add modals, debounced search
- `public/css/admin-layout.css` — replaced old rules CSS with table + pagination + modal styles

## QA Results
_Pending review_
