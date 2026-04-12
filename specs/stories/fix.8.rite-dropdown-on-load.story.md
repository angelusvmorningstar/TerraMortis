# Story Fix.8: Rite Add — Always Show Rules-DB Dropdown

## Status: done

## Story

**As an** ST editing a character with blood sorcery,
**I want** the rite add row to always show a dropdown of permitted rites (filtered by tradition and rank),
**so that** I can select a valid rite by name instead of typing free text or seeing an error state.

## Background

Fix.3 replaced the free-text rite input with a rules-DB dropdown. The dropdown is built from `getRulesByCategory('rite')` (`public/js/data/loader.js`), which reads from the in-memory rules cache.

The cache is populated asynchronously on app load. When `shRenderPowers()` is called for the first time (triggered by opening the editor), the cache is empty and `getRulesByCategory('rite')` returns `[]`. The render path then falls back to the old text input:

```js
// public/js/editor/sheet.js ~line 467–480
const allRites = getRulesByCategory('rite');
const availRites = allRites
  .filter(r => r.parent === defaultTrad && r.rank != null && r.rank <= defaultDots)
  ...
if (availRites.length) {
  nameSel = '<select id="rite-add-name" ...>...</select>';
} else {
  nameSel = '<input type="text" id="rite-add-name" ...>'
    + '<span style="...">Rites not loaded</span>';
}
```

The fallback triggers every time because by the time the editor is opened the cache is always loaded — yet `getRulesByCategory()` still returns empty on the first call. This is a timing issue: the cache load promise resolves, but the render already ran before the rules were cached.

The simplest fix is to re-render the rite dropdown after the rules cache confirms it has loaded. The loader already exposes a `onRulesReady` hook (or equivalent); if not, a one-time `getRulesReadyPromise().then(...)` call can trigger a targeted dropdown refresh.

The existing `shRefreshRiteDropdown(tradition)` function in `edit.js` already knows how to rebuild just the rite name `<select>`. It can be called once after the rules cache is ready, without re-rendering the whole sheet.

### Files involved

- `public/js/data/loader.js` — exposes rules cache; check if it has a ready-callback or promise
- `public/js/editor/sheet.js` — `shRenderPowers()` builds the rite add row (lines ~460–486)
- `public/js/editor/edit.js` — `shRefreshRiteDropdown(tradition)` — already built, already exposed on `window`
- `public/js/admin.js` — calls `initEditor()` and loads rules; is the right place to hook the post-load refresh

## Acceptance Criteria

1. When the editor is opened on a character who has Cruac or Theban dots, the rite add row shows a `<select>` dropdown populated with permitted rites (rank <= disc dots), not a text input
2. If a character has both Cruac and Theban dots, the tradition `<select>` and name `<select>` both render correctly; changing the tradition dropdown refreshes the rite name dropdown as before
3. If no rites match (e.g. 0 dots in both traditions) the add row is not shown at all — no regression from current behaviour
4. The "Rites not loaded" text fallback is removed or unreachable in normal app use

## Tasks / Subtasks

- [ ] Task 1: Establish when the rules cache is ready
  - [ ] Read `public/js/data/loader.js`: find whether it exposes a `Promise`, callback, or event for "all rules loaded"
  - [ ] If no ready mechanism exists, add a `getRulesReadyPromise()` export that resolves once the cache is populated

- [ ] Task 2: Trigger dropdown refresh after cache loads
  - [ ] In `public/js/admin.js`, after the rules-load `await`, call `shRefreshRiteDropdown` for whichever tradition is currently selected in `#rite-add-trad` (if that element exists in the DOM)
  - [ ] Guard: only call if the element exists — the editor may not be open yet. If it is not open, no action is needed; the next render will have a populated cache

- [ ] Task 3: Remove the "Rites not loaded" fallback branch
  - [ ] In `sheet.js` `shRenderPowers()`, remove the `else` branch that renders the text input and "Rites not loaded" span
  - [ ] Replace the fallback with an empty `<select id="rite-add-name">` with a single disabled placeholder option (`-- rites loading --`), so the Add button is harmlessly blocked until the refresh fires
  - [ ] Remove the dual `addOnclick` path that handles the text-input case; use only the select path

## Dev Notes

- No test framework. Verify by opening a character with Cruac/Theban dots in the admin editor. The rite add row should show a dropdown immediately.
- The cache is loaded via `loadRules()` in `loader.js`, called in `admin.js` during init. This always completes before a user can open an editor, but the current first render races with it.
- `shRefreshRiteDropdown` is already on `window` — no export changes needed.

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
