# Story Fix.13: Character Dropdowns — Alphabetical by sortName

## Status: done

## Story

**As an** ST using any dropdown that lists characters,
**I want** characters to appear in the same alphabetical order as the characters tab (sortName: moniker overrides legal name, ascending),
**so that** I can find any character quickly without having to know their position in the database.

## Background

Several dropdowns across the admin app list character names as `<option>` elements. These are built directly from `state.chars` (or `chars` in module scope), which preserves MongoDB document insertion order. This order is not alphabetical and varies depending on when characters were created.

The character tab uses `sortName(c)` to sort the grid (implemented in `public/js/editor/list.js` line 28). `sortName(c)` returns `c.moniker || c.name` — the same field used for the characters-tab grid order.

### Known unsorted character dropdown locations

**`public/js/editor/sheet.js`**

1. **Pact partner select** (~line 495):
   ```js
   const _charNames = (state.chars || []).filter(ch => ch.name && ch.name !== c.name)
     .map(ch => '<option value="' + esc(ch.name) + '">' + esc(ch.name) + '</option>').join('');
   ```
   Used at line ~547 inside pact rows (`shEditPact` partner select).

2. **Domain merit `shared_with` partner dropdown** (~line 672):
   ```js
   const avP = chars.filter(ch => ch.name !== c.name && !parts.includes(ch.name));
   ```
   (Used to populate the "add partner" dropdown in the domain merit edit row. `chars` here is likely `state.chars` via closure or local reference — confirm the variable.)

There may be additional locations in other files (downtime views, city views, etc.) — the implementation agent should search for `state.chars.*option\|chars.*option` patterns across `public/js/` and apply the same sort to all character dropdowns.

### Sort function

`sortName` is exported from `public/js/data/helpers.js`. It is already imported in `public/js/editor/list.js` and `public/js/admin.js`. Any file that builds a character dropdown needs to import and apply it.

`sheet.js` currently imports from `helpers.js` but does **not** import `sortName`. It must be added to the import.

## Acceptance Criteria

1. The pact partner `<select>` in the pact edit row lists characters sorted alphabetically by `sortName` (moniker || name)
2. The domain merit `shared_with` partner `<select>` lists available partners sorted the same way
3. Any other character `<select>` dropdowns found across the admin app are also sorted by `sortName`
4. The current character (whose editor is open) continues to be excluded from the partner list — no regression
5. Character option values remain `ch.name` (legal name), only display order changes

## Tasks / Subtasks

- [ ] Task 1: Add `sortName` import to `sheet.js`
  - [ ] In `public/js/editor/sheet.js`, in the `helpers.js` import (~line 8), add `sortName` to the destructured import list

- [ ] Task 2: Sort `_charNames` in `sheet.js`
  - [ ] At line ~495, change:
    ```js
    const _charNames = (state.chars || []).filter(ch => ch.name && ch.name !== c.name)
      .map(ch => '<option value="' + esc(ch.name) + '">' + esc(ch.name) + '</option>').join('');
    ```
    to:
    ```js
    const _charNames = [...(state.chars || [])].filter(ch => ch.name && ch.name !== c.name)
      .sort((a, b) => sortName(a).localeCompare(sortName(b)))
      .map(ch => '<option value="' + esc(ch.name) + '">' + esc(displayName(ch)) + '</option>').join('');
    ```
    Note: also switch from `esc(ch.name)` to `esc(displayName(ch))` for the displayed text, so the user sees the same name as on the character tab.

- [ ] Task 3: Sort domain merit partner dropdown in `sheet.js`
  - [ ] Locate the `avP` variable (~line 672) and apply `.sort((a, b) => sortName(a).localeCompare(sortName(b)))` after the `.filter()`
  - [ ] Confirm the option text uses `displayName(ch)` not `ch.name`

- [ ] Task 4: Audit other files for character dropdowns
  - [ ] Search `public/js/admin/` and `public/js/editor/` for patterns like `state.chars.*<option` or `chars.*map.*option` 
  - [ ] Apply the same sort wherever characters are listed in a dropdown
  - [ ] Common suspects: `admin/downtime-views.js`, `admin/city-views.js`, `editor/merits.js`

## Dev Notes

- `sortName` is in `public/js/data/helpers.js`: `export function sortName(c) { return c.moniker || c.name; }`
- `displayName` is already imported in `sheet.js`; use it for the visible option text.
- Use spread before filter/sort to avoid mutating `state.chars` in place.
- Manual check: open an editor pact row or domain merit shared_with dropdown — characters should appear in the same order as the character grid sidebar.

---

## Dev Agent Record

### Implementation Plan
_To be filled by dev agent_

### Debug Log
_To be filled by dev agent_

### Completion Notes
_To be filled by dev agent_

## File List
_To be filled by dev agent_

## Change Log
_To be filled by dev agent_
