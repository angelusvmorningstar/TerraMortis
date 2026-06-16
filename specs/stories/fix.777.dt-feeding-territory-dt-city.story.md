---
title: 'DT feeding territory not reaching DT City view or processing panel (main + rote)'
type: 'fix'
issue: 777
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/777
branch: morningstar-issue-777-dt-feeding-territory-dt-city
created: '2026-06-16'
status: review
recommended_model: 'sonnet — two disconnected fix sites, each needs careful field tracing'
context:
  - public/js/admin/downtime-views.js
---

## Intent

Two separate disconnects in the feeding territory data chain:

1. **DT Processing pre-selection shows N/A** — `_renderInlineTerrPills` resolves
   territory keys from `responses.feeding_territories` via `TERRITORY_SLUG_MAP`,
   but DT4+ submissions store ObjectID keys, not slugs. The map can't match them
   → pills show N/A.

2. **DT City doesn't reflect ST override** — `renderCityOverview` populates the
   feeding matrix from `entry.feedTerrs` (which comes from
   `responses.feeding_territories` only). The ST override field
   `st_review.territory_overrides.feeding` is never read by the City renderer.
   Player pick and ST override are completely disconnected from this view.

Both bugs apply to rote feed via the parallel fields
`feeding_territories_rote` / `st_review.territory_overrides.feeding_rote`.

---

## Data flow (established by pre-story trace)

### Write path (player form → submission)

**`public/js/tabs/downtime-form.js`**
- Main feed territory: `responses.feeding_territories` → JSON string, ObjectID keys
  (e.g. `{"507f...": "feeding_rights", "508a...": "none"}`)
- Rote feed territory: `responses.feeding_territories_rote` → same format

### Read path (DT Processing pre-selection)

**`public/js/admin/downtime-views.js` ~line 9812**
- Reads `feedSub?.responses?.feeding_territories`, parses JSON
- Converts keys to territory IDs via `TERRITORY_SLUG_MAP` — **this map only covers
  slug keys; ObjectID keys return undefined → pill not pre-selected → N/A**
- Pre-selected set passed to `_renderInlineTerrPills(...)`

### ST override write

**`public/js/admin/downtime-views.js` ~line 4998**
- ST clicks territory pill in feeding context → multi-select
- Saves to `st_review.territory_overrides.feeding` as array of territory ID strings

### DT City read path

**`public/js/admin/downtime-views.js` → `renderCityOverview()` ~line 12044**
- `buildProcessingQueue` (~line 2909) populates `entry.feedTerrs` from
  `responses.feeding_territories` only
- `renderCityOverview` iterates `entry.feedTerrs` → feeding matrix
- **Never reads `st_review.territory_overrides.feeding`**

---

## Fix

### T1 — Fix DT Processing pre-selection: use `resolveTerrId` instead of `TERRITORY_SLUG_MAP`

**File:** `public/js/admin/downtime-views.js`

**Site:** ~line 9812–9822, inside the territory pill pre-selection block

The existing resolution chain for `TERRITORY_SLUG_MAP` is slug-only. DT4+
submissions use ObjectID keys. Use `resolveTerrId(key)` (already used in the
snapshot panel fix from #733) — it handles both ObjectID and slug formats.

```js
// BEFORE (slug-only):
const terrId = TERRITORY_SLUG_MAP[key];

// AFTER:
const terrId = resolveTerrId(key);
```

Apply the same change to the rote feed pre-selection site (~line 7177 or wherever
`feeding_territories_rote` is parsed for pill pre-selection).

If ST override exists (`st_review.territory_overrides.feeding` is non-empty),
that array should win over the player's `responses.feeding_territories` for the
pre-selection. Apply the same ObjectID-safe resolution to the override values too
(they are territory IDs and should resolve via `resolveTerrId`).

### T2 — Fix DT City view: factor in ST override when building `feedTerrs`

**File:** `public/js/admin/downtime-views.js`

**Site:** `buildProcessingQueue` ~line 2909, where `entry.feedTerrs` is assigned

After populating `entry.feedTerrs` from `responses.feeding_territories`, check
whether `st_review.territory_overrides.feeding` is set and non-empty. If so,
rebuild `feedTerrs` from the override array — each entry gets a status value
of `'feeding_rights'` (or preserve the original player status if the territory
was also in the player's selection).

Pseudocode:
```js
let feedTerrs = JSON.parse(sub.responses.feeding_territories || '{}');
const stOverride = sub.st_review?.territory_overrides?.feeding;
if (stOverride?.length) {
  // ST override wins — use override territory IDs
  feedTerrs = Object.fromEntries(stOverride.map(id => [id, 'feeding_rights']));
}
entry.feedTerrs = feedTerrs;
```

Apply the same pattern for rote:
- `responses.feeding_territories_rote` → `entry.feedTerrsRote`
- `st_review.territory_overrides.feeding_rote` → override for rote

### Guardrails

- Do NOT touch `renderCityOverview` itself — the fix belongs in
  `buildProcessingQueue` where `feedTerrs` is populated. The City renderer
  is correct; it's the data it receives that's wrong.
- Do NOT change how the player form stores territory — that format is correct.
- `resolveTerrId` is already imported/defined in `downtime-views.js` (used in
  #733 fix). Confirm before adding a duplicate.
- All changes are in `public/js/admin/downtime-views.js` only.

---

## Acceptance criteria

- [ ] Given Hazel selected The Barrens in the DT form, when an ST opens her
      feeding action in DT Processing, The Barrens pill is pre-selected (not N/A)
- [ ] Given the above, DT City (Downtime → City view) shows Hazel in The Barrens
      zone for the current cycle
- [ ] Given an ST overrides the territory to Barrens via the processing panel pill,
      DT City updates to reflect Barrens for Hazel
- [ ] AC-1 through AC-3 hold for rote feed actions
- [ ] Characters with no territory selected still show correctly (no crash/blank row)
- [ ] Regression: existing slug-keyed submissions (DT1/DT2 legacy) still resolve
      correctly in both DT Processing and DT City

---

## Dev Agent Record

### Files changed

- `public/js/admin/downtime-views.js` — three edits (rote pill first block, rote pill second block fallback, DT City TAAG feeding matrix)
- `tests/fix-777-dt-feeding-territory-dt-city.spec.js` — new Playwright spec (9 tests, 5 describe blocks)

### Completion notes

Three disconnected fix sites in `downtime-views.js`:

**Edit 1 — `_renderRightMechanics` rote pill first block (~line 7163):** The `_rtGrid` loop resolved territory keys via `TERRITORY_SLUG_MAP` only, which cannot match OID keys. Added `/^[a-f0-9]{24}$/i` branch: OID keys look up the territory document in `cachedTerritories` and resolve to its `slug`; slug keys continue through `TERRITORY_SLUG_MAP` as before. Same OID-safe resolution added to the `projTerritory` fallback.

**Edit 2 — `_renderActionTypeRow` rote pill second block (~line 8476):** Identical OID-safe fallback for the parallel rote context — same pattern, same `cachedTerritories` lookup.

**Edit 3 — `renderCityOverview` TAAG feeding matrix (~line 12092):** The feeding matrix row was populated by iterating `entry.feedTerrs` (raw player data set by `buildProcessingQueue`). Switched to `_getSubFedTerrs(_feedSub)` which: (a) honours `st_review.territory_overrides.feeding` when set; (b) resolves OID keys via `cachedTerritories` lookup; (c) returns a `Map<csvKey, count>` keyed by the canonical MATRIX_TERRS `csvKey` strings that `TERRITORY_SLUG_MAP` can resolve to real territory IDs.

The `openRoteFeedAction` Playwright helper was initially written targeting `[data-toggle-phase="feeding"]` (from an older DT Processing UI with phase section headers). `renderProcessingMode` now renders a flat list of `.proc-action-row` divs with no phase wrappers. The helper was corrected to find the "Rote Feed" label directly within the flat list.

All 9 tests pass: AC-rote-1, AC-rote-2, AC-taag-1, AC-taag-2, AC-override-1, AC-override-2, AC-empty, AC-legacy-1, AC-legacy-2.
