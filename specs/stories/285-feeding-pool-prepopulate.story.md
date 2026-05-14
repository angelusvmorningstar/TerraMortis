---
title: "DT Processing Step 3: pool builder and territory pills pre-populate from form submission"
issue: 285
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/285
branch: morningstar-issue-285-feeding-pool-prepopulate
status: review
type: enhancement
---

## Story

As an ST using DT Processing Step 3 (Feeding), I want the pool builder dropdowns and territory pills to be pre-seeded from the player's own submission data, so I don't have to manually re-derive information the player already provided.

## Background

In DT Processing Step 3 (Feeding), the ST Pool Builder and territory pill row both start blank on every open. The player already submitted their feeding method (and therefore their intended pool) and the territories they fed in — but that data is only shown in the read-only `renderFeedingDetail()` display panel, never wired to the interactive builder or pill row.

Two independent pre-population behaviours are needed:
1. **Pool builder** — when no `pool_validated` exists, seed the Attribute / Skill / Discipline dropdowns from the player's `responses._feed_method` (or `_feed_custom_*` for the `other` method).
2. **Territory pills** — when no ST territory override exists (`st_review.territory_overrides.feeding` absent/null), highlight pills matching `responses.feeding_territories`.

If an ST has already saved data (pool validated, territory override), those saved values take precedence with no change to existing behaviour.

## Acceptance criteria

- [x] Given a feeding card with no previously saved `pool_validated`, when the ST opens Step 3, the pool builder Attribute/Skill/Discipline dropdowns are pre-selected to match the player's submitted feeding method pool
- [x] Given a feeding card where the ST has already committed a pool (`pool_validated` set), the builder continues to restore from that saved value (no regression)
- [x] Given a player who submitted feeding in "Harbour" and "Dockyards", the corresponding territory pills are highlighted on open without the ST clicking them
- [x] The pool total (the `— + — = 0` display) updates correctly after pre-population, reflecting the character's actual dot values
- [x] The `other` method case: custom attr/skill/disc are used when method is `other` and no `pool_validated` exists

---

## Dev notes

### Overview of changes

**Single file, two targeted changes. No new functions, no new imports, no new DB writes.**

File: `public/js/admin/downtime-views.js`  
Function: `renderActionPanel()` — starts at line **7683**

| Change | Lines | Description |
|--------|-------|-------------|
| 1 | 8108–8116 | Territory pills: pre-select from `responses.feeding_territories` when no ST override |
| 2 | 8138–8150 | Pool builder: seed from player method when no `pool_validated` |

---

### Change 1 — Territory pills (lines 8108–8116)

**Current code:**
```js
// Territory pills row — feeding multi-select
{
  const _feedOvrArr = Array.isArray(feedSub?.st_review?.territory_overrides?.feeding)
    ? feedSub.st_review.territory_overrides.feeding : [];
  const _feedSet = new Set(_feedOvrArr);
  h += `<div class="proc-recat-row">`;
  h += _renderInlineTerrPills(entry.subId, 'feeding', '', _feedSet);
  h += `</div>`;
}
```

**Target code:**
```js
// Territory pills row — feeding multi-select
{
  const _stOvrArr = feedSub?.st_review?.territory_overrides?.feeding;
  let _feedSet;
  if (Array.isArray(_stOvrArr)) {
    _feedSet = new Set(_stOvrArr);
  } else {
    // No ST override — pre-select from player's submitted territories
    _feedSet = new Set();
    try {
      const _grid = JSON.parse(feedSub?.responses?.feeding_territories || '{}');
      for (const [slug, status] of Object.entries(_grid)) {
        if (!status || status === 'none' || status === 'Not feeding here') continue;
        const tid = TERRITORY_SLUG_MAP[slug];
        if (tid) _feedSet.add(tid);
      }
    } catch { /* ignore malformed JSON */ }
    // Legacy fallback: _raw.feeding.territories (display-name keys)
    if (_feedSet.size === 0) {
      const _rawTerrs = _normTerrKeys(feedSub?._raw?.feeding?.territories || {});
      for (const [key, status] of Object.entries(_rawTerrs)) {
        if (!status || status === 'Not feeding here' || status === 'none') continue;
        const tid = TERRITORY_SLUG_MAP[key];
        if (tid) _feedSet.add(tid);
      }
    }
  }
  h += `<div class="proc-recat-row">`;
  h += _renderInlineTerrPills(entry.subId, 'feeding', '', _feedSet);
  h += `</div>`;
}
```

**Key facts:**
- `_renderInlineTerrPills(subId, 'feeding', '', feedingSet)` already handles `feedingSet.size === 0` → the em-dash pill gets `active`, showing nothing selected. No changes to `_renderInlineTerrPills`.
- `TERRITORY_SLUG_MAP` (imported from `downtime-constants.js`) maps every slug variant to the canonical pill ID (`'academy'`, `'harbour'`, `'dockyards'`, `'northshore'`, `'secondcity'`, or `null` for Barrens). The map already handles both new-format slugs (`the_harbour`) and display-name variants (`'The Harbour'`).
- The visual pre-selection does **not** write to the DB. If the ST clicks a pill to confirm, the existing click handler (lines 4696–4721) starts from `sub.st_review.territory_overrides.feeding` (which is still absent), initialises `arr = []`, and adds the clicked territory. First click saves correctly.
- `_normTerrKeys()` is defined at line 9852 and handles legacy territory name variants.
- Check: `Array.isArray(_stOvrArr)` — `undefined` and `null` both return false, so any absent/cleared override falls through to player suggestion. When the ST clears all territories via the em-dash, the click handler deletes the key (line 4710) and sets DB to null (line 4711), so next render will show the player suggestion again. This is acceptable — the player suggestion is informational only.

---

### Change 2 — Pool builder pre-population (lines 8138–8150)

This block is inside:
```js
if (entry.source === 'feeding') {          // line 8127
    const resp = feedSub?.responses || {}; // line 8129 — resp is in scope
    const char = feedChar;                 // line 8130 — char is in scope
    {                                      // line 8133 — anonymous ST Pool Builder block
      const charDiscs = ...;
      const allDiscNames = ...;
      // ↓ CHANGE HERE
      let preAttr = '', preSkill = '', preDisc = 'none', preMod = 0, showParseRef = false;
      if (poolValidated) { ... }
    }
}
```

**Current code (lines 8138–8150):**
```js
// Pre-populate from existing pool_validated
let preAttr = '', preSkill = '', preDisc = 'none', preMod = 0, showParseRef = false;
if (poolValidated) {
  const parsed = _parsePoolExpr(poolValidated, ALL_ATTRS, ALL_SKILLS, allDiscNames);
  if (parsed) {
    preAttr  = parsed.attr  || '';
    preSkill = parsed.skill || '';
    preDisc  = parsed.disc  || 'none';
    preMod   = parsed.modifier || 0;
  } else {
    showParseRef = true;
  }
}
```

**Target code:**
```js
// Pre-populate from existing pool_validated, else from player's submitted feeding method
let preAttr = '', preSkill = '', preDisc = 'none', preMod = 0, showParseRef = false;
if (poolValidated) {
  const parsed = _parsePoolExpr(poolValidated, ALL_ATTRS, ALL_SKILLS, allDiscNames);
  if (parsed) {
    preAttr  = parsed.attr  || '';
    preSkill = parsed.skill || '';
    preDisc  = parsed.disc  || 'none';
    preMod   = parsed.modifier || 0;
  } else {
    showParseRef = true;
  }
} else {
  const _method = resp._feed_method || '';
  if (_method === 'other') {
    preAttr  = resp._feed_custom_attr  || '';
    preSkill = resp._feed_custom_skill || '';
    const _cd = resp._feed_custom_disc || resp._feed_disc || '';
    preDisc  = (_cd && allDiscNames.includes(_cd)) ? _cd : 'none';
  } else if (_method && char) {
    const _pool = buildFeedingPool(char, _method, 0, { disc: resp._feed_disc || '', spec: resp._feed_spec || '' });
    if (_pool) {
      preAttr  = _pool.breakdown.attr  || '';
      preSkill = _pool.breakdown.skill || '';
      preDisc  = (_pool.breakdown.disc && allDiscNames.includes(_pool.breakdown.disc))
        ? _pool.breakdown.disc : 'none';
    }
  }
}
```

**Key facts:**

- `poolValidated` is defined at line 7703: `const poolValidated = rev.pool_validated || ''`. Falsy when not yet saved.
- `resp` is `feedSub?.responses || {}` (line 8129) — same block, already in scope.
- `char` is `feedChar` (line 8130) — character object. Can be null if character not found; the `else if (_method && char)` guard handles this.
- `buildFeedingPool(char, methodId, ambienceMod, picks)` is defined locally at line 910. It takes `ambienceMod = 0` (no ambience pre-baked in — the right-panel modifiers are computed separately via `initFeedPoolMod`). Returns `{ total, breakdown: { attr, attrVal, skill, skillVal, disc, discVal, spec, specBonus, fg, ambience, unskilled } }`.
- `allDiscNames` is the character's actual discipline names with dots > 0. The `allDiscNames.includes(discName)` guard prevents `preDisc` being set to a name not in the dropdown, which would silently fail to select but not error.
- For `other` method: `_feed_custom_disc` or `_feed_disc` may not be in `allDiscNames` (player entered a free-text disc). The guard falls through to `'none'` safely.
- The pool total display (lines 8191–8194) already uses `preAttr`, `preSkill`, `preDisc` to compute `initTotalStr`. No changes needed there — AC 4 is satisfied automatically once `pre*` variables are populated.

---

### What NOT to change

- `_renderInlineTerrPills` — no changes; already handles feedingSet correctly.
- The territory pill click handler (lines 4684–4740) — no changes; it already initialises from `st_review.territory_overrides.feeding` correctly when absent.
- `poolStatus === 'committed'` check (line 8196) — no changes; committed pool disables the builder, which is correct even with pre-population.
- `renderFeedingDetail()` (lines ~1280–1377) — separate display panel, do not touch.
- `buildFeedingPool` function definition (line 910) — no changes.
- The `_refreshPoolExpr` call used for `poolValidated` — only applies when `pool_validated` is already set, so untouched by the new else-branch.
- `feeding-pool.js` / `computeBestFeedingPool` — not used by the admin panel; that is the player-side function.

---

### Scope clarification: territory pills do NOT trigger ambience lookup

The issue raised this as an open question. The answer for this story: **visual highlight only**. The ambience lookup is triggered by the territory override being saved to `st_review.territory_overrides.feeding` (via the click handler). The pre-selection from player data is display-only and does not save to the DB, so it does not trigger ambience. An ST who wants ambience applied must click the pill to confirm.

---

### Verification checklist

1. Open Step 3 for a character whose feeding method is set (e.g. `Lure`). Before any pool save: Attribute and Skill dropdowns should pre-select to the best attr/skill for that method. Pool total should show a non-zero value.
2. Open Step 3 for a character with `pool_validated` already saved. Dropdowns should still show the saved expression — not the player method.
3. Open Step 3 for a character who submitted feeding in "Harbour". The Harbour pill should appear highlighted without clicking. Pool builder unaffected.
4. Click the em-dash pill to clear territory. On re-render (another click on the row to collapse/expand), the player suggestion should re-appear (no ST override persisted).
5. Open Step 3 for a character whose method is `other` with `_feed_custom_attr = 'Manipulation'`, `_feed_custom_skill = 'Persuasion'`. Those should pre-populate.
6. Confirm no console errors on any of the above.

---

## Dev agent record

### Files changed

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | 2 changes: territory pill pre-selection fallback + pool builder player-method seed |
| `tests/issue-285-feeding-pool-prepopulate.spec.js` | NEW — 13 Playwright E2E tests (all passing) |
| `specs/stories/285-feeding-pool-prepopulate.story.md` | NEW — story file |
| `specs/stories/sprint-status.yaml` | Status entry added |

### Completion notes

Change 1 (territory pills, ~line 8108): When `st_review.territory_overrides.feeding` is absent/null, builds the active `Set` from `responses.feeding_territories` (JSON slug keys) via `TERRITORY_SLUG_MAP`, with legacy `_raw.feeding.territories` fallback. No DB write — visual pre-selection only; click handler initialises from the override array as before.

Change 2 (pool builder, ~line 8159): Added `else` branch after `if (poolValidated)`. For standard methods calls `buildFeedingPool(char, method, 0, picks)` and seeds `preAttr/preSkill/preDisc` from `breakdown`. For `other` method reads `_feed_custom_attr/skill/disc` directly. Guards `preDisc` with `allDiscNames.includes()` to avoid setting a value absent from the dropdown. Pool total display (`initTotalStr`) updates automatically since it already uses the `pre*` variables.

All 5 ACs satisfied. 13 Playwright tests pass (first run).
