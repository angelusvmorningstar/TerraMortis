# Story fix.37: Rites Dropdown Stuck on "Loading"

## Status: done

## Story

**As an** ST,
**I want** the rites selection dropdown in the character editor to populate correctly,
**so that** I can add rites to a character without the dropdown being permanently stuck on "— loading —".

## Background

The Rites section in the character sheet editor (ST admin) shows a dropdown to select a rite to add. This dropdown is stuck on "— loading —" and never populates with available rites.

This is a regression — the rites dropdown previously worked.

---

## Technical Details

**Rendering:** `public/js/editor/sheet.js` — the rites dropdown renders `— loading —` when `availRites.length` is falsy (zero or undefined). The condition is:

```js
availRites.length
  ? '<option>...</option>'  // one per rite
  : '<option value="" disabled selected>— loading — —</option>'
```

**Data source:** `getRulesByCategory('rite')` from `public/js/data/loader.js`
- Reads from the rules DB loaded by `loadRulesFromApi()` → `GET /api/rules`
- Falls back to localStorage key `tm_rules_db`
- Filters by `category === 'rite'` and `rank <= disciplineDots`

**Root cause candidates:**

1. **`loadRulesFromApi()` not being called before render** — if the rules DB isn't populated when the sheet renders, `getRulesDB()` returns null and `availRites` is empty. The sheet renders synchronously; if the async load hasn't completed, the dropdown shows "loading" and never refreshes.

2. **`/api/rules` endpoint failing or returning empty** — check whether the endpoint is live and returning rite entries.

3. **Character has 0 discipline dots in Cruac/Theban** — if the filter `rank <= disciplineDots` yields nothing, the dropdown is empty (correct behaviour). But "loading" text implies the DB itself isn't loaded rather than a filter producing no results.

4. **localStorage `tm_rules_db` stale or empty** — if the cache key exists but contains no rites, the fallback silently returns [].

**Investigation steps:**
1. Open browser console on a character with Cruac or Theban dots — does `window.getRulesDB()` or the imported `getRulesDB()` return data?
2. Check Network tab — is `GET /api/rules` firing and returning rite entries?
3. Check if `loadRulesFromApi()` is called during admin.js startup and whether it's awaited before first sheet render.
4. Look at `shRefreshRiteDropdown()` in edit.js — is there a mechanism to re-render the dropdown after async load completes?

**Likely fix:** Ensure `loadRulesFromApi()` is awaited before the first `_renderSheet()` call, OR add a callback/re-render trigger in `loadRulesFromApi()` that refreshes the rites dropdown once data arrives.

If there is already a `shRefreshRiteDropdown` function, confirm it is called after the async load resolves.

---

## Acceptance Criteria

1. On a character with at least 1 dot in Cruac or Theban Sorcery, the rites dropdown populates with available rites of the appropriate rank.
2. The dropdown does not show "— loading —" after page load completes.
3. If a character has 0 dots in ritual disciplines, the dropdown shows "No rites available" or similar (not "loading").

---

## Files to Change

- `public/js/editor/sheet.js` — investigate rite dropdown render condition
- `public/js/data/loader.js` — confirm `loadRulesFromApi()` is called and awaited
- `public/js/admin.js` or `public/js/editor/edit.js` — confirm `shRefreshRiteDropdown` fires after async load

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Story authored | Claude (SM) |
| 2026-04-11 | 1.1 | Implemented: fallback to text input + level select when availRites is empty (rules DB not seeded or not yet loaded). admin.js post-load callback upgraded to full renderSheet() re-render so fallback is replaced once rules arrive. | Claude (SM) |
