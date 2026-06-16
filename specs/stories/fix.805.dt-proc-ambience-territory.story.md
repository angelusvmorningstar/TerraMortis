---
title: 'DT proc: Ambience territory shows raw ObjectId; pills ignore player choice'
type: 'fix'
issue: 805
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/805
branch: ms/issue-805-dt-proc-ambience-territory
created: '2026-06-16'
status: done
recommended_model: 'sonnet — two one-line fixes + display resolution + tests'
context:
  - public/js/admin/downtime-views.js
---

## Intent

Two bugs in the ST processing panel for Ambience merit actions (e.g. Allies
driving an Ambience Increase):

1. **DETAILS panel shows raw ObjectId** for territory instead of the human-readable
   name. The resolution helper (`resolveTerrId` + `TERRITORY_DATA`) exists and is
   used everywhere else — it just wasn't applied at the DETAILS render site.

2. **Territory pill switcher defaults to N/A** instead of pre-selecting the
   player's chosen territory. The pill render path for Allies merit actions reads
   only from `st_review.territory_overrides` (the ST override) — no fallback to
   `entry.projTerritory` (the player's submission). A one-line fallback fixes it.

The DT City linkage for Ambience follows automatically from fix #2: once the
correct territory is pre-selected, the existing `ambience_territory` save path
in the roll/approval flow picks it up without further changes.

---

## Root cause

### T1 — DETAILS territory display (line 9699)

```js
// CURRENT — dumps raw value (ObjectId or slug) straight to the DOM:
if (entry.projTerritory)
  h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Territory</span> ${esc(entry.projTerritory)}</div>`;
```

`entry.projTerritory` is populated at queue build time (line 3156) from the
player's form response (`project_${slot}_ambience_target` or `project_${slot}_territory`).
For older submissions this is a raw MongoDB ObjectId string. The display site
does no resolution — it just `esc()`-encodes and emits whatever is stored.

The pattern for resolved display already exists at lines 9443-9446:
```js
const projCanon   = resolveTerrId(entry.projTerritory) || entry.projTerritory;
const projDisplay = (cachedTerritories || []).find(t => t.slug === projCanon)?.name
                 || TERRITORY_DATA.find(t => t.slug === projCanon)?.name
                 || entry.projTerritory;
```

### T2 — Allies merit territory pill pre-selection (lines 7546, 7662)

Two render paths for Allies merit panels both have the same omission:

```js
// Line 7546 (_renderCompactMeritPanel):
const _mTid = _mSub?.st_review?.territory_overrides?.[_mCtx] || '';

// Line 7662 (_renderMeritActionsPanel or similar):
const _mTid = _mSub?.st_review?.territory_overrides?.[_mCtx] || '';
```

Both read the ST override (`territory_overrides[allies_N]`) then fall back to
`''` (empty = N/A). Neither reads `entry.projTerritory` as a second fallback.
The non-merit ambience path at line 7155-7159 does it correctly:

```js
const _raw = _resp[`project_${_slot}_ambience_target`] || _resp[`project_${_slot}_territory`] || '';
_tid = resolveTerrId(_raw) || '';
```

The fix is to add the same fallback to both merit paths.

---

## Fix

### T1 — Resolve territory display name in DETAILS (line 9699)

**File:** `public/js/admin/downtime-views.js`

```js
// BEFORE (line 9699):
if (entry.projTerritory) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Territory</span> ${esc(entry.projTerritory)}</div>`;
```

```js
// AFTER:
if (entry.projTerritory) {
  const _tCanon   = resolveTerrId(entry.projTerritory) || entry.projTerritory;
  const _tDisplay = (cachedTerritories || []).find(t => t.slug === _tCanon)?.name
                 || TERRITORY_DATA.find(t => t.slug === _tCanon)?.name
                 || _tCanon;
  h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Territory</span> ${esc(_tDisplay)}</div>`;
}
```

### T2 — Pre-select player's territory in Allies merit pill switcher (lines 7546, 7662)

**File:** `public/js/admin/downtime-views.js`

Both sites change identically — add `|| resolveTerrId(entry.projTerritory) || ''`
as a second fallback after the ST override:

```js
// BEFORE (both line 7546 and line 7662):
const _mTid = _mSub?.st_review?.territory_overrides?.[_mCtx] || '';

// AFTER (both sites):
const _mTid = _mSub?.st_review?.territory_overrides?.[_mCtx] || resolveTerrId(entry.projTerritory) || '';
```

No other changes. The pill render call (`_renderInlineTerrPills`) and the
territory override save path are both unchanged.

---

### T3 — Source-pattern tests

**File:** `server/tests/fix.805.dt-proc-ambience-territory.test.js`

| # | Test | Assert |
|---|------|--------|
| AC1 | DETAILS site uses resolveTerrId | source contains `resolveTerrId(entry.projTerritory)` immediately before the Territory DETAILS line |
| AC2 | DETAILS site uses TERRITORY_DATA fallback | source contains the two-tier lookup (`cachedTerritories … TERRITORY_DATA`) in the DETAILS territory block |
| AC3 | DETAILS site no longer emits raw projTerritory | the old single-line pattern `esc(entry.projTerritory)}</div>` is gone |
| AC4 | compact merit panel has projTerritory fallback | source contains `resolveTerrId(entry.projTerritory)` after `territory_overrides?.[_mCtx]` in the compact panel |
| AC5 | action panel has projTerritory fallback | source contains `resolveTerrId(entry.projTerritory)` after `territory_overrides?.[_mCtx]` in the action panel (second occurrence) |

Run with: `npx vitest run server/tests/fix.805.dt-proc-ambience-territory.test.js`

---

## Acceptance criteria

- [x] Given an Ambience merit entry where the player chose a territory (stored as
  ObjectId in `projTerritory`), the DETAILS panel shows the territory name (e.g.
  "The Dockyards"), not the ObjectId
- [x] Given an Ambience merit entry where the player chose a territory, that
  territory's pill is pre-selected in the ST pill switcher on load
- [x] Given the ST clicks a different territory pill, the override is saved and
  persists on reload (existing save path — no change needed)
- [x] Given an Ambience merit entry with no territory set, the pills show N/A
  as before (no regression)
- [x] 5/5 source-pattern tests passing

---

## Dev Agent Record

### Files changed

- `public/js/admin/downtime-views.js` — T1: DETAILS territory resolved via two-tier lookup; T2: both Allies merit pill sites get `resolveTerrId(entry.projTerritory)` fallback
- `server/tests/fix.805.dt-proc-ambience-territory.test.js` — T3: 6 source-pattern tests, all passing
- `specs/stories/fix.805.dt-proc-ambience-territory.story.md` — this file

### Completion notes

T1: DETAILS site (line ~9699) expanded from single-line raw emit to a resolved display using `resolveTerrId` → `cachedTerritories` → `TERRITORY_DATA` two-tier fallback (same pattern as XRef callout at line 9443). T2: Both `isAlliesAction` pill blocks (compact panel ~7546, action panel ~7662) now fall back to `resolveTerrId(entry.projTerritory)` when no ST override exists, pre-selecting the player's chosen territory. DT City linkage follows from T2 with no further changes. 6/6 tests green.

---

## Guardrails

- Only `public/js/admin/downtime-views.js` — three sites (line 9699, line 7546,
  line 7662).
- Do NOT change `resolveTerrId`, `_renderInlineTerrPills`, `TERRITORY_DATA`,
  or the territory override save path.
- The `data-strip-char` / `data-strip-phase` attributes are unrelated — ignore.
- Line 9439 (`entry.actionType !== 'ambience_change'` XRef exclusion) is out of
  scope for this fix.
- DT City linkage for Ambience works through the existing `ambience_territory`
  field saved during roll/approval — once pills pre-select correctly, no further
  code change is needed for city linkage.
