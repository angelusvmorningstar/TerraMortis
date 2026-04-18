# Story feat.13: Regent Territory Ambience Status Bonus

**Story ID:** feat.13
**Epic:** Feature Backlog
**Status:** ready-for-dev
**Date:** 2026-04-18

---

## User Story

As an ST viewing a character sheet in the game app or admin editor, I want regent characters to show their correct effective city status — including the bonus granted by their territory's ambience — so that the status track and breakdown reflect actual rules-derived totals.

---

## Background

### The rule

Regents gain a city status modifier based on their territory's ambience:
- **Curated** or **Verdant** → +1
- **The Rack** → +2
- All other ambience values → no bonus

### Existing infrastructure — DO NOT reinvent

**`findRegentTerritory(territories, c)` in `public/js/data/helpers.js` lines 146–157** — already exists and is the canonical client-side regent lookup. It:
- Takes a territories array and a character object
- Finds the territory where `territory.regent_id === String(c._id)`
- Caches the result on `c._regentTerritory = { territory, territoryId, lieutenantId }` (ephemeral, never persisted)
- Returns `null` if character is not a regent
- Already used by: `admin.js`, `editor/export-character.js`, `player/downtime-form.js`

**The territory document** (MongoDB `territories` collection) has an `ambience` field (string). `findRegentTerritory` already holds the matched territory object `t` — `t.ambience` is accessible at lookup time. The result object just needs `ambience` added.

### The two bypass problems (critical — must fix)

`calcCityStatus(c)` in `accessors.js` is the correct function for all city status calculations, but two render points bypass it:

**`editor/sheet.js` line 1526:**
```js
const cityBase = st.city || 0, titleBonus = titleStatusBonus(c), cityTotal = cityBase + titleBonus;
```
This manually sums base + title bonus. It will miss the regent ambience bonus unless fixed.

**`export-character.js` line 99:**
```js
city: (st.city || 0) + titleStatusBonus(c),
```
Same problem in the character export/print path.

Both must be updated to use `calcCityStatus(c)` (or manually add `regentAmienceBonus(c)`).

### What does NOT need changing

- `suite/status.js` line 64: `function cityVal(c) { return calcCityStatus(c); }` — already correct, picks up change automatically
- The territories collection — no schema change needed
- MongoDB character documents — `regent_territory`/`regent_lieutenant` were already migrated off character docs by `migrate-regent-to-id.js`; regent assignment lives on the territory document as `regent_id`

---

## Implementation Plan

### Task 1 — Extend `findRegentTerritory` to include ambience

**File:** `public/js/data/helpers.js` — `findRegentTerritory` function (lines 146–157)

Add `ambience` to the cached result object:

```js
export function findRegentTerritory(territories, c) {
  if (!territories || !c) return null;
  if (c._regentTerritory !== undefined) return c._regentTerritory;
  const cid = String(c._id);
  const t = territories.find(t => t.regent_id === cid);
  if (!t) { c._regentTerritory = null; return null; }
  const territory = (t.name && t.name !== t.id) ? t.name : (_TERR_ID_NAME[t.id] || t.id);
  const result = { territory, territoryId: t.id, lieutenantId: t.lieutenant_id || null, ambience: t.ambience || null };
  c._regentTerritory = result;
  return result;
}
```

One-word change: add `, ambience: t.ambience || null` to the result object.

### Task 2 — Add `regentAmienceBonus(c)` to accessors.js

**File:** `public/js/data/accessors.js` — add after `titleStatusBonus` (around line 205)

```js
const REGENT_AMBIENCE_BONUS = { 'Curated': 1, 'Verdant': 1, 'The Rack': 2 };

export function regentAmienceBonus(c) {
  return REGENT_AMBIENCE_BONUS[c._regentTerritory?.ambience] || 0;
}
```

Note: `c._regentTerritory` is the cached object set by `findRegentTerritory`. This is `null` when the character is not a regent, so `null?.ambience` safely returns `undefined`, and the `|| 0` fallback handles it.

### Task 3 — Update `calcCityStatus` to include regent bonus

**File:** `public/js/data/accessors.js` — `calcCityStatus` function (line 207)

```js
export function calcCityStatus(c) {
  return (c.status?.city || 0) + titleStatusBonus(c) + regentAmienceBonus(c);
}
```

### Task 4 — Fix `editor/sheet.js` city status calculation

**File:** `public/js/editor/sheet.js` — line 1526

Replace:
```js
const cityBase = st.city || 0, titleBonus = titleStatusBonus(c), cityTotal = cityBase + titleBonus;
```
With:
```js
const cityBase = st.city || 0, titleBonus = titleStatusBonus(c), regentBonus = regentAmienceBonus(c), cityTotal = cityBase + titleBonus + regentBonus;
```

Import `regentAmienceBonus` at the top of `editor/sheet.js` — it already imports from `'../data/accessors.js'` (line 9). Add `regentAmienceBonus` to that import.

**Important:** `c._regentTerritory` is already pre-populated on the character before `editor/sheet.js` renders it (the admin editor calls `findRegentTerritory` before render — confirmed by `admin.js` line 587 comment). No additional setup needed.

Also update the `_statusDots` call on the following lines to pass `regentBonus` if the display is broken into base/bonus layers. Check how `_statusDots(cityBase, titleBonus, 10)` is used and whether regent bonus should be a third layer or merged with `titleBonus`. Merging into `titleBonus` is acceptable: `titleBonus + regentBonus`.

### Task 5 — Fix `export-character.js` city status

**File:** `public/js/editor/export-character.js` — line 99

Replace:
```js
city: (st.city || 0) + titleStatusBonus(c),
```
With:
```js
city: calcCityStatus(c),
```

`calcCityStatus` is already imported at line 14 of `export-character.js`. `regentAmienceBonus` doesn't need to be imported here since `calcCityStatus` handles it internally. Verify that `c._regentTerritory` is populated before `exportCharacter(c)` is called — in the admin editor flow, it should be, as `_regentTerritory` is set during sheet render which precedes export.

---

## Acceptance Criteria

- [ ] Alice Vunder (regent of The North Shore — check its ambience) shows the correct city status bonus
- [ ] A regent of a Curated or Verdant territory shows city status +1 above their base
- [ ] A regent of The Rack shows city status +2 above their base
- [ ] A non-regent character shows no change to city status
- [ ] A territory with no regent (`regent_id` null/absent) is unaffected
- [ ] The bonus is visible in the admin editor sheet (editor/sheet.js render)
- [ ] The bonus flows correctly through to `suite/status.js` (game app city status tab)
- [ ] Character export/print shows the correct total (export-character.js)
- [ ] `c._regentTerritory.ambience` is null for vacant territories (not a crash)
- [ ] No regression to title status bonus, clan status, or covenant status

---

## Files to Change

| File | Change |
|---|---|
| `public/js/data/helpers.js` | Add `ambience: t.ambience \|\| null` to `findRegentTerritory` result |
| `public/js/data/accessors.js` | Add `REGENT_AMBIENCE_BONUS` constant + `regentAmienceBonus(c)` function; update `calcCityStatus` |
| `public/js/editor/sheet.js` | Import `regentAmienceBonus`; fix line 1526 city total calc |
| `public/js/editor/export-character.js` | Replace manual `titleStatusBonus` sum with `calcCityStatus(c)` |

**Do not touch:**
- `public/js/suite/status.js` — already uses `calcCityStatus`, picks up change automatically
- `public/js/suite/sheet.js` — verify it uses `calcCityStatus` for city status; if not, fix it (but do not change other parts)
- MongoDB documents — no migrations needed
- `server/` — server-side enrichment is NOT needed; client-side `_regentTerritory` cache is the correct pattern

---

## Critical Constraints

- `c._regentTerritory` is **ephemeral** — never saved to MongoDB, never sent in PUT/PATCH requests (`stripEphemeral` in `characters.js` strips underscore-prefixed fields from request bodies)
- `findRegentTerritory` **must be called before** any code that reads `c._regentTerritory?.ambience`. In the admin editor this already happens. In the game app, verify `suiteState.territories` is loaded before sheet render — if not, `c._regentTerritory` will be null and the bonus will be 0 (safe fallback, but means it won't display until territories load)
- Do NOT modify `findRegentTerritory`'s caching logic — the `if (c._regentTerritory !== undefined) return c._regentTerritory` guard means once stamped, it won't re-query. This is correct.
- `REGENT_AMBIENCE_BONUS` uses exact string matching — ambience values are case-sensitive. The territory schema stores them exactly as listed (`Curated`, `Verdant`, `The Rack`)

---

## Reference

- `findRegentTerritory`: `public/js/data/helpers.js` lines 146–157
- `titleStatusBonus` / `calcCityStatus`: `public/js/data/accessors.js` lines 203–209
- `editor/sheet.js` bypass point: line 1526
- `export-character.js` bypass point: line 99
- `suite/status.js` (already correct): line 64
- Territory schema: `server/schemas/territory.schema.js`
- Ambience values: `Hostile | Barrens | Neglected | Untended | Settled | Tended | Curated | Verdant | The Rack`
