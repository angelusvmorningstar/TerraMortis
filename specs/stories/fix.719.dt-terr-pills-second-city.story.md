---
title: 'Territory pill switcher missing The Second City (hardcoded list out of sync)'
type: 'fix'
issue: 719
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/719
branch: ms/issue-719-dt-terr-pills-second-city
created: '2026-06-14'
status: done
recommended_model: 'sonnet — two small edits across two files; low scope'
context:
  - public/js/admin/downtime-views.js
  - public/js/tabs/downtime-data.js
---

## Intent

**Problem:** The territory pill row in DT processing is built from a hardcoded array in
`_renderInlineTerrPills` that is missing The Second City. Aleksei selected The Second City
in the player DT form but the ST cannot assign that territory in the processing panel —
only Academy, Harbour, Dockyards, N. Shore, Barrens, N/A appear.

**Domain model (important):**
- `TERRITORY_DATA` (5 entries) = the **formal** territories: Academy, Harbour, Dockyards, North Shore, Second City.
- **The Barrens** = everywhere outside formal territories — not a territory itself, never in `TERRITORY_DATA`.
- **N/A** = territory not applicable to this action — a UI-only sentinel (`id: ''`).

The issue body suggested adding Barrens to `TERRITORY_DATA`. **Do NOT do this.** `TERRITORY_DATA` is iterated by Territory Pulse (line 2483 of `downtime-views.js`) — adding Barrens would generate a spurious "Territory Pulse: The Barrens" panel. Barrens belongs in the pill row as an explicit append, not as a territory record.

**Fix:** Two changes:

1. Add a `shortLabel` field to each entry in `TERRITORY_DATA` so the pill row can use a compact display name without re-deriving it.

2. Replace the hardcoded `TERR_PILLS` array in `_renderInlineTerrPills` with a list derived from `TERRITORY_DATA`, then explicitly append Barrens + N/A.

---

## Root cause file

| File | Lines | Role |
|------|-------|------|
| `public/js/tabs/downtime-data.js` | 122–128 | `TERRITORY_DATA` — missing `shortLabel` field |
| `public/js/admin/downtime-views.js` | 6729–6737 | `_renderInlineTerrPills` — hardcoded `TERR_PILLS` array |

---

## Current code (verbatim)

### `TERRITORY_DATA` (downtime-data.js lines 122–128)

```js
export const TERRITORY_DATA = [
  { slug: 'academy',    name: 'The Academy',    ambience: 'Curated',  ambienceMod: +3 },
  { slug: 'dockyards',  name: 'The Dockyards',  ambience: 'Settled',  ambienceMod:  0 },
  { slug: 'harbour',    name: 'The Harbour',    ambience: 'Untended', ambienceMod: -2 },
  { slug: 'northshore', name: 'The North Shore', ambience: 'Tended',  ambienceMod: +2 },
  { slug: 'secondcity', name: 'The Second City', ambience: 'Tended',  ambienceMod: +2 },
];
```

### `_renderInlineTerrPills` (downtime-views.js lines 6729–6737)

```js
function _renderInlineTerrPills(subId, terrContext, currentTerrId, feedingSet = null, noLabel = false) {
  const TERR_PILLS = [
    { id: 'academy',    label: 'Academy' },
    { id: 'harbour',    label: 'Harbour' },
    { id: 'dockyards',  label: 'Dockyards' },
    { id: 'northshore', label: 'N. Shore' },
    { id: 'barrens',    label: 'Barrens' },
    { id: '',           label: 'N/A' },
  ];
  // ... loop renders pills
}
```

---

## Tasks

### T1 — Add `shortLabel` to `TERRITORY_DATA` [x]

**File:** `public/js/tabs/downtime-data.js`, lines 122–128.

```js
// BEFORE:
export const TERRITORY_DATA = [
  { slug: 'academy',    name: 'The Academy',    ambience: 'Curated',  ambienceMod: +3 },
  { slug: 'dockyards',  name: 'The Dockyards',  ambience: 'Settled',  ambienceMod:  0 },
  { slug: 'harbour',    name: 'The Harbour',    ambience: 'Untended', ambienceMod: -2 },
  { slug: 'northshore', name: 'The North Shore', ambience: 'Tended',  ambienceMod: +2 },
  { slug: 'secondcity', name: 'The Second City', ambience: 'Tended',  ambienceMod: +2 },
];

// AFTER:
export const TERRITORY_DATA = [
  { slug: 'academy',    name: 'The Academy',    shortLabel: 'Academy',      ambience: 'Curated',  ambienceMod: +3 },
  { slug: 'dockyards',  name: 'The Dockyards',  shortLabel: 'Dockyards',    ambience: 'Settled',  ambienceMod:  0 },
  { slug: 'harbour',    name: 'The Harbour',    shortLabel: 'Harbour',      ambience: 'Untended', ambienceMod: -2 },
  { slug: 'northshore', name: 'The North Shore', shortLabel: 'N. Shore',    ambience: 'Tended',  ambienceMod: +2 },
  { slug: 'secondcity', name: 'The Second City', shortLabel: 'Second City', ambience: 'Tended',  ambienceMod: +2 },
];
```

**Note:** All existing consumers of `TERRITORY_DATA` use `.slug`, `.name`, `.ambience`, or `.ambienceMod` — adding `shortLabel` is purely additive and will not break anything.

**Do NOT add a Barrens entry.** The Barrens is not a formal territory; adding it here would cause a spurious entry in Territory Pulse (line 2483 of `downtime-views.js`) and `ensureTerritories()` fallback (line 3763).

---

### T2 — Derive `TERR_PILLS` from `TERRITORY_DATA` in `_renderInlineTerrPills` [x]

**File:** `public/js/admin/downtime-views.js`, lines 6730–6737 (inside `_renderInlineTerrPills`).

```js
// BEFORE:
  const TERR_PILLS = [
    { id: 'academy',    label: 'Academy' },
    { id: 'harbour',    label: 'Harbour' },
    { id: 'dockyards',  label: 'Dockyards' },
    { id: 'northshore', label: 'N. Shore' },
    { id: 'barrens',    label: 'Barrens' },
    { id: '',           label: 'N/A' },
  ];

// AFTER:
  const TERR_PILLS = [
    ...TERRITORY_DATA.map(t => ({ id: t.slug, label: t.shortLabel })),
    { id: 'barrens', label: 'Barrens' },
    { id: '',        label: 'N/A' },
  ];
```

`TERRITORY_DATA` is already imported at line 9 of `downtime-views.js` — no new import needed.

**Pill order after change:** Academy, Dockyards, Harbour, N. Shore, Second City, Barrens, N/A.

The order of the first five follows `TERRITORY_DATA` declaration order (academy, dockyards, harbour, northshore, secondcity). This is a minor visual reorder vs the old hardcoded list (which had Harbour before Dockyards). That reorder is acceptable — the issue doesn't mandate a specific order, and the critical fix is Second City appearing.

---

### T3 — QA: write and run Playwright spec [x]

**File:** `tests/fix-719-dt-terr-pills-second-city.spec.js`

Use the `setupDowntimeProcessing` pattern from `tests/downtime-processing-dt-fixes.spec.js` (lines 305–337). Open a feeding action to get to a card that renders `_renderInlineTerrPills`.

Test cases required:

| # | Assertion |
|---|-----------|
| 1 | `.proc-terr-pill[data-terr-id="secondcity"]` exists in the pill row |
| 2 | `.proc-terr-pill[data-terr-id="secondcity"]` text is "Second City" |
| 3 | `.proc-terr-pill[data-terr-id="barrens"]` still exists |
| 4 | `.proc-terr-pill[data-terr-id="academy"]` still exists |
| 5 | `.proc-terr-pill[data-terr-id=""]` (N/A) still exists and is the last pill |
| 6 | Total pill count is 7 (5 territories + Barrens + N/A) |

---

## Acceptance criteria

- [ ] The Second City pill appears in the territory pill row for all action types (feeding, project, merit) in DT processing
- [ ] `_renderInlineTerrPills` derives its list from `TERRITORY_DATA` rather than a hardcoded array
- [ ] `TERRITORY_DATA` gains a `shortLabel` field on every entry; no existing field is removed or renamed
- [ ] The Barrens pill (`id: 'barrens'`) remains present and is the second-to-last pill
- [ ] The N/A pill (`id: ''`) remains present and is the last pill
- [ ] All five formal territory pills (Academy, Dockyards, Harbour, N. Shore, Second City) are present

---

## Guardrails

- **Do NOT add Barrens to `TERRITORY_DATA`** — it is not a territory, it is "everywhere outside formal territories". Adding it pollutes Territory Pulse and `ensureTerritories`.
- `TERRITORY_DATA` is imported at line 9 of `downtime-views.js` — no import change needed.
- Only two files change: `downtime-data.js` (T1) and `downtime-views.js` (T2).
- The rest of `_renderInlineTerrPills` (the loop, the active-state logic, the button HTML) is unchanged.

---

## Dev Agent Record

### Files changed
- `public/js/tabs/downtime-data.js` — T1: added `shortLabel` field to each of the 5 `TERRITORY_DATA` entries. No existing fields removed. Barrens NOT added (not a formal territory).
- `public/js/admin/downtime-views.js` — T2: replaced 6-entry hardcoded `TERR_PILLS` array in `_renderInlineTerrPills` with `[...TERRITORY_DATA.map(t => ({id: t.slug, label: t.shortLabel})), {id:'barrens',...}, {id:'',...}]`.
- `tests/fix-719-dt-terr-pills-second-city.spec.js` — T3: 5 Playwright tests covering ACs 1-6.

### Completion notes
T1: `shortLabel` is purely additive. All existing consumers of `TERRITORY_DATA` use `.slug`, `.name`, `.ambience`, `.ambienceMod` — unaffected. T2: Pill order is now driven by `TERRITORY_DATA` declaration order (academy, dockyards, harbour, northshore, secondcity), then Barrens, then N/A — 7 total, matching the AC. `TERRITORY_DATA` is already imported at line 9 of `downtime-views.js`; no import change needed. 5/5 Playwright tests pass.
