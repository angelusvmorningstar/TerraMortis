# Story: city.2 — Edit Court Positions Improvements

## Status: review

## Summary

The Edit Court Positions panel has three issues: it only allows one holder per category (e.g. one Primogen slot), dropdowns show honorific-prefixed names, and there is no way to set the Court Title for a position. All categories except Head of State can have multiple holders.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/admin/city-views.js` | Multi-slot edit, bare names in dropdown, court title input |

---

## Acceptance Criteria

1. All categories except Head of State support multiple holders — an "Add [Category]" button adds a new row
2. Each row has a remove (×) button to clear that slot
3. Dropdowns show bare name only (no honorific) — e.g. "Eve Lockridge" not "Premier Eve Lockridge"
4. Each row has a text input for Court Title, pre-filled with the character's current `court_title`
5. Saving writes both `court_category` and `court_title` to each assigned character
6. Characters removed from all slots have both fields cleared to `null`
7. Head of State remains a single-slot dropdown (one holder only)

---

## Tasks / Subtasks

- [x] Refactor edit form to multi-slot (AC: #1, #2, #7)
  - [x] Replace single `select` per category with a list of slot rows
  - [x] Each slot row: character dropdown + court title input + remove button
  - [x] Add "Add [Category]" button below each category group (all except Head of State)
  - [x] Head of State remains a single dropdown row
- [x] Use bare name in dropdowns (AC: #3)
  - [x] Replace `displayNameRaw(c)` with `c.moniker || c.name` in option rendering
- [x] Add court title input per slot (AC: #4)
  - [x] Text input pre-filled from `c.court_title` when character is selected
  - [x] Placeholder: category name (e.g. "Primogen")
- [x] Update saveCourt() to write court_title (AC: #5, #6)
  - [x] Collect `{ charId, category, title }` per slot
  - [x] PUT each character with `{ court_category: category, court_title: title || category }`
  - [x] Characters removed: PUT with `{ court_category: null, court_title: null }`

---

## Dev Notes

### Current edit form (city-views.js:100–111)

One dropdown per category from `COURT_CATEGORIES`. Uses `active.find(c => c.court_category === cat)` — returns only first match. `saveCourt()` only writes `court_category`.

### Multi-slot data structure

Track slots as a JS array per category in the edit form's DOM. Each slot is a `<div class="court-slot-row">` containing:
- A `<select>` with `data-court-category` and `data-slot-index`
- A `<input type="text">` with `data-court-title`
- A `<button>` for remove (hidden for Head of State)

On init, populate slots from existing `court_category` holders (multiple characters can share the same category value — `active.filter(c => c.court_category === cat)` not `.find()`).

### saveCourt() changes

Current approach: builds `assignments` map from selects. New approach: collect all slot rows, build array of `{ charId, category, title }`. Clear all current holders not in new list; assign all in new list.

### court_title default

If the title input is blank, default to the category name when saving (e.g. blank title for Primogen slot → save `court_title: "Primogen"`). This matches the current data pattern.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- `_renderSlot()` helper renders one slot row (dropdown + title input + optional remove button)
- Edit form iterates `active.filter(c => c.court_category === cat)` for initial slots (supports multiple existing holders)
- Add/remove slot wired via delegated click on court-edit-panel
- `saveCourt()` collects all `.court-slot-row` nodes, writes both `court_category` and `court_title`; clears removed chars to null/null
- CSS: `.court-slot-row`, `.court-title-input`, `.court-add-slot-btn`, `.court-remove-slot-btn` added

### File List

- `public/js/admin/city-views.js`
- `public/css/admin-layout.css`

### Change Log

- 2026-04-23: Implemented city.2 — multi-slot court edit with court title
