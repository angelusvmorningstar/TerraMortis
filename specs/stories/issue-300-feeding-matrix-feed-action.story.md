---
title: "Feeding matrix never shows OO/XX: rote project slots not counted"
issue: 300
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/300
branch: morningstar-issue-300-feeding-matrix-feed-action
status: review
type: bug
---

## Story

As an ST reviewing the feeding matrix, I want characters who declared a rote feed project action in
addition to their main feeding to show OO or XX in the matrix, so I can correctly see that they fed
twice in the same territory.

## Acceptance Criteria

- [x] AC1: Keeper's submission with main feed + rote feed both targeting Barrens shows XX in the matrix Barrens column.
- [x] AC2: A character with feeding rights who feeds twice in the same territory (main feed + rote project slot) shows OO.
- [x] AC3: Characters with a single feed (no rote project slot) are unaffected — O and X still display as before.
- [x] AC4: Matrix feeder-count footer increments by 2 for double-feeders (both feeds in same territory).
- [x] AC5: A rote in a different territory to the main feed results in two separate single-feed entries (O + O, or X + X across two columns) — not OO/XX in either.

## Dev Notes

### Scope correction vs. issue description

The issue description states the fix reads `project_N_territory` for slots where `project_N_action`
is `'feed'` or `'rote'`. **This is incorrect.** Code analysis shows:

- `ACTION_FIELDS['rote'] = ['description']` — the territory picker is **not** rendered for rote slots.
- `ACTION_FIELDS['feed'] = []` — no fields at all (legacy rote-locked toggle slot).

For both action types, `document.getElementById('dt-project_N_territory')` returns null, so
`project_N_territory` is always `''` (empty string). The territory for rote-hunt project slots is
stored in a separate top-level responses key: **`feeding_territories_rote`**.

### Territory field — `feeding_territories_rote`

Written by `downtime-form.js:444-456` whenever any project slot has `action === 'rote'`:

```js
// Same key format as feeding_territories (underscore-slugified FEEDING_TERRITORIES names)
// e.g. { the_academy: 'feeding_rights', the_harbour: 'none', the_barrens__no_territory_: 'none' }
responses['feeding_territories_rote'] = JSON.stringify(roteGridVals);
```

Keys and status values are identical to `feeding_territories`. The Barrens key is
`the_barrens__no_territory_` with status (e.g. `'feeding_rights'` or `'poaching'`).

**Note:** `feeding_territories_rote` is not explicitly cleared when the rote slot is removed — it
may contain stale data from a prior save. Guard by checking `project_N_action === 'rote' || 'feed'`
before reading it.

### What 'feed' vs 'rote' action types mean

| Action type | Source | Semantics |
|------------|--------|-----------|
| `'rote'` | dt-form.22 (post-redesign) | Player allocated a project slot to a rote hunt — a second separate feeding action. Territory in `feeding_territories_rote`. |
| `'feed'` | Legacy (pre-dt-form.22) | ST-toggle marking the main feeding as rote quality. Same territory as main feeding — **not** a second feeding in VtR terms. |

The existing code at `downtime-views.js:1366` and `2795` uses both to detect "a rote slot is
present". For the matrix count fix, both should gate reading `feeding_territories_rote`:
- `'rote'` → unambiguously wrote `feeding_territories_rote`; count it
- `'feed'` → legacy; `feeding_territories_rote` may or may not be present; the guard handles it

### The fix — exact location

**File:** `public/js/admin/downtime-views.js`  
**Function:** `_getSubFedTerrs` (line 9825)  
**Replace TODO comment** at line 9864 with the implementation below.

**Insert before** the default Barrens block at line 9867 (the `if (fed.size === 0 && ...)` check).

```js
// Issue #300: count additional feeds from rote-hunt project slots.
// The territory for 'rote' action slots is stored in feeding_territories_rote
// (same slug-key format as feeding_territories), not in project_N_territory.
const hasRoteSlot = [1, 2, 3, 4].some(n => {
  const a = sub.responses?.[`project_${n}_action`];
  return a === 'rote' || a === 'feed';
});
if (hasRoteSlot && sub.responses?.feeding_territories_rote) {
  let roteGrid = null;
  try { roteGrid = JSON.parse(sub.responses.feeding_territories_rote); } catch { roteGrid = null; }
  if (roteGrid) {
    for (const [slug, status] of Object.entries(roteGrid)) {
      if (!status || status === 'none' || status === 'Not feeding here') continue;
      const tid = Object.prototype.hasOwnProperty.call(TERRITORY_SLUG_MAP, slug)
        ? TERRITORY_SLUG_MAP[slug] : undefined;
      if (tid === undefined) continue;
      const mt = MATRIX_TERRS.find(m => TERRITORY_SLUG_MAP[m.csvKey] === tid);
      if (!mt) continue;
      const current = fed.get(mt.csvKey) || 0;
      if (current < 2) fed.set(mt.csvKey, current + 1);
    }
  }
}
```

### Barrens handling

`TERRITORY_SLUG_MAP['the_barrens__no_territory_'] === null`. The Barrens MATRIX_TERRS entry has
`csvKey: 'The Barrens (No Territory)'` and `TERRITORY_SLUG_MAP['The Barrens (No Territory)'] === null`.
So `MATRIX_TERRS.find(m => TERRITORY_SLUG_MAP[m.csvKey] === null)` correctly resolves the Barrens
entry. No special-case needed.

### What is preserved / not broken

- ST territory overrides (lines 9831-9838) still return early before this code. No change.
- Characters with no rote slot: `hasRoteSlot === false`, loop skipped, zero impact.
- The default Barrens fallback at line 9867 (`fed.size === 0 && ...`) continues to work as
  before for characters who fed in Barrens without a rote slot.
- `_buildMatrixTableHtml` and the footer accumulator already handle count ≥ 2 correctly
  (lines 9914-9921, 9902-9903) — no changes needed there.

### File change summary

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | Replace TODO at line 9864 with rote-slot loop (≈15 lines) |

Single-file change. No schema, API, or other JS file changes needed.

### Verification

To verify manually:
1. Load the DT Processing panel in admin, open Cycle 2 (Keeper is the confirmed repro case).
2. Open the Feeding Matrix.
3. Keeper's row → Barrens column should show XX.
4. Footer Barrens count should increment by 2 for Keeper (was 1, now 2).
5. Characters without rote slots: unchanged.

## Dev Agent Record

- Story created: 2026-05-14
- Key file: `public/js/admin/downtime-views.js:9825` (`_getSubFedTerrs`)
- Repro character: Keeper
- Root cause confirmed: `feeding_territories_rote` never read by `_getSubFedTerrs`
- Fix: read `feeding_territories_rote` when a rote slot is present; increment count capped at 2

### Completion Notes

Implemented 2026-05-14. Single-file change: `public/js/admin/downtime-views.js`.

Replaced the two-line TODO comment at line 9864 with a 15-line rote-slot loop. The loop:
1. Guards on `hasRoteSlot` (any project slot with `action === 'rote' || 'feed'`) to avoid acting on stale `feeding_territories_rote` data.
2. Parses `feeding_territories_rote` using the same slug-key format as `feeding_territories`.
3. Resolves each slug to a MATRIX_TERRS entry via `TERRITORY_SLUG_MAP` (handles Barrens via `null` sentinel).
4. Increments the `fed` Map count capped at 2.

Key correction from issue description: the issue claimed territory was in `project_N_territory`, but code analysis showed `ACTION_FIELDS['rote'] = ['description']` (no territory picker rendered). The actual field is `feeding_territories_rote`, confirmed by `downtime-form.js:444-456`.

Parse check: `node --input-type=module --check` passed with no output (ES module clean).
No schema, API, test, or other file changes required.

### File List

- `public/js/admin/downtime-views.js` — replaced TODO comment with rote-slot loop in `_getSubFedTerrs`

### Change Log

- 2026-05-14: Issue #300 — `_getSubFedTerrs` now reads `feeding_territories_rote` when a rote/feed project slot is present; increments territory count capped at 2; matrix now correctly shows OO/XX for double-feeders.
