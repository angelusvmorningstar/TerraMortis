# Story Fix.3: Rites Add — Replace Text Input with Dropdown

## Status: done

## Story

**As an** ST editing a character's rites,
**I want** the "Add Rite" field to show a dropdown of accessible rites rather than a free-text box,
**so that** I can only add rites that exist in the database, at a level the character can access.

## Background

The current "Add Rite" UI in the character editor (`public/js/editor/sheet.js` ~line 433) uses a free-text `<input type="text" id="rite-add-name">` for the rite name, plus a separate level `<select>` (1-5). This allows typing any arbitrary string.

The rites database lives in MongoDB's `purchasable_powers` collection and is already loaded into `_rulesCache` by `loadRulesFromApi()`. `getRulesByCategory('rite')` returns all rite documents, each with:
- `name` — display name
- `parent` — `'Cruac'` or `'Theban'`
- `rank` — integer 1-5 (the rite's level); may be `null` if not yet set in the DB

`getRulesByCategory` is already imported in `sheet.js` (line 13).

A character's accessible rites for a given tradition are those with `rank <= discDots`. The free pool and free/XP logic in `shAddRite()` (edit.js:577) do not need to change.

Characters with both Cruac and Theban disciplines have a tradition `<select>` rendered by sheet.js; single-tradition characters have a hidden `<input>`. When the tradition changes, the rite list must update to show only rites for the newly selected tradition.

## Acceptance Criteria

1. The "Add Rite" section shows a `<select>` dropdown (id `rite-add-name`) in place of the text input, populated with rites from the rules cache
2. Rites in the dropdown are filtered to: `parent === selectedTradition` AND `rank <= discDots` for that tradition
3. Rites are sorted by rank ascending, then name alphabetically; each option displays as `[dots] Rite Name` (e.g., `● Blood Awakening`)
4. The dropdown has a leading disabled blank option (`— select rite —`) that prevents accidental adds
5. The separate level `<select id="rite-add-level">` is removed; the level is read from the selected option's `data-rank` attribute when Add is clicked
6. When the tradition selector changes (dual-tradition characters only), a function `shRefreshRiteDropdown(tradition)` rebuilds the rite dropdown filtered to the new tradition
7. Clicking Add with the blank option selected does nothing (guard in `shAddRite` already handles empty name)
8. If `getRulesByCategory('rite')` returns no results for the selected tradition (empty DB / API not yet loaded), fall back to the original text input + level selector and show a small warning: `"Rites not loaded — type name manually"`
9. No change to `shAddRite()` logic or free/XP pool accounting

## Tasks / Subtasks

- [ ] Task 1: Build rite dropdown render function in `sheet.js`
  - [ ] Add helper `_buildRiteOptions(tradition, discDots)` near the rites section (~line 393):
    ```js
    function _buildRiteOptions(tradition, discDots) {
      const allRites = getRulesByCategory('rite');
      const tradRites = allRites
        .filter(r => r.parent === tradition && r.rank != null && r.rank <= discDots)
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
      return tradRites;
    }
    ```
  - [ ] In the rites add section (~line 432-433), replace the text input with:
    ```html
    <!-- if rites available: -->
    <select id="rite-add-name" class="gen-qual-input" style="flex:1;min-width:140px">
      <option value="" data-rank="" disabled selected>— select rite —</option>
      <!-- per rite: -->
      <option value="[rite.name]" data-rank="[rite.rank]">[dots(rite.rank)] [rite.name]</option>
    </select>
    <!-- if no rites available (fallback): -->
    <input type="text" id="rite-add-name" ...> + level select + warning span
    ```
  - [ ] Remove the `<select id="rite-add-level">` from the rendered HTML (level now comes from the selected option's `data-rank`)
  - [ ] Update the Add button onclick to read level from selected option:
    ```js
    onclick="(function(){
      const s=document.getElementById('rite-add-name');
      const t=document.getElementById('rite-add-trad').value;
      const n=s.value;
      const lv=+(s.selectedOptions[0]?.dataset?.rank||1);
      if(n) shAddRite(t,n,lv);
    })()"
    ```
    Or extract to a named function `shDoAddRite()` exported from `edit.js` for clarity.

- [ ] Task 2: Handle tradition change for dual-tradition characters
  - [ ] Export a function `shRefreshRiteDropdown(tradition)` from `edit.js` (or `sheet.js` if sheet rendering functions are reachable):
    - Gets `discDots` for the given tradition from current character
    - Rebuilds `<select id="rite-add-name">` options using `_buildRiteOptions(tradition, discDots)`
    - Replaces `innerHTML` of the select
  - [ ] Update the tradition `<select>` onchange in the rendered HTML to call `shRefreshRiteDropdown(this.value)`

- [ ] Task 3: Fallback and edge cases
  - [ ] If `_buildRiteOptions()` returns an empty array, render the original text input + level selector instead, with a `<span style="font-size:10px;color:var(--crim)">Rites not loaded</span>` warning
  - [ ] Ensure the `value` attribute on option elements uses the rite name exactly as it appears in the DB (this feeds straight into `shAddRite` as the name — no change needed there)

## Dev Notes

### Architecture
- No test framework. Verify in-browser manually.
- British English in any new strings.
- `shDots(n)` in helpers.js renders filled-circle dot strings — use it for option labels.
- `getRulesByCategory('rite')` is synchronous (reads from cache). The cache is populated by `loadRulesFromApi()` on admin page load. If the API hasn't responded yet, the cache may be empty — this triggers the fallback (AC: 8).
- The `rank` field on a purchasable_power rite document is the canonical level (1-5). The character's stored `level` on the rite power object is still the source of truth after adding; `rank` is only used at add-time to populate the dropdown and auto-set the level.
- `shAddRite(tradition, name, level)` is in `edit.js` — its signature and logic do not change.

### Manual verification
- Open a character with Cruac 3; confirm dropdown shows only Cruac rites at ranks 1, 2, 3
- Open a character with both Cruac 2 and Theban 1; confirm tradition change rebuilds the dropdown correctly
- Select a rite and click Add; confirm the rite appears in the list with the correct level and free/XP status
- Confirm blank option cannot trigger an add

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
