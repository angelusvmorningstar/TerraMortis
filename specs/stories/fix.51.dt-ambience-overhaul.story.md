# Story fix.51: DT Ambience — fix entropy, overfeeding, project values, and per-territory thresholds

**Story ID:** fix.51
**Epic:** Fixes
**Issue:** 272
**Issue URL:** https://github.com/angelusvmorningstar/TerraMortis/issues/272
**Branch:** morningstar-issue-272-ambience-overhaul
**Status:** ready-for-dev
**Date:** 2026-05-12

---

## User Story

As an ST using the DT City Ambience panel, I want the Net Change calculation to use correct per-territory values for entropy, overfeeding penalty, project contributions, and step thresholds, so that the projected ambience step reflects the actual Damnation City rules rather than placeholder constants.

---

## Background

`_computeAmbienceRows()` / `buildAmbienceData()` in `downtime-views.js` contains four hardcoded bugs plus a terminology issue. All data constants (entropy, thresholds, feeding tolerance) belong in `downtime-data.js` alongside the existing `AMBIENCE_CAP` and `AMBIENCE_MODS` exports.

**Rating table (source of truth for all new lookups):**

| Rating | Entropy | Feeding Tolerance | Pos Threshold (step up) | Neg Thresh -1 step | Neg Thresh -2 steps |
|--------|---------|-------------------|------------------------|--------------------|---------------------|
| The Rack | -8 | 8 | N/A | 0 | 5 |
| Verdant | -7 | 7 | 15 | 1 | 6 |
| Curated | -6 | 7 | 13 | 2 | 7 |
| Tended | -5 | 6 | 11 | 3 | 8 |
| Settled | -3 | 6 | 9 | 4 | 9 |
| Untended | -3 | 6 | 5 | 5 | 10 |
| Neglected | -3 | 6 | 5 | 6 | 11 |
| Hostile | -3 | 0 | 5 | N/A | N/A |
| Barrens | N/A | 0 | N/A | N/A | N/A |

**Step threshold logic:** check -2 condition first, then -1, then +1:
- `net <= -(negThresh2)` → delta = -2
- `net <= -(negThresh1)` → delta = -1  
- `net >= posThreshold` → delta = +1
- Use `null` for N/A values; null check skips the comparison.
- Barrens: skip entirely (no ambience calculation).
- The Rack negThresh1 = 0: `net <= -0` = `net <= 0`, meaning any non-positive net degrades.

**AMBIENCE_STEPS_LIST ordering:** worst→best (Hostile at index 0, The Rack at top). `delta = +1` moves toward better. Verify by checking `downtime-constants.js` import before implementing.

**Personal downtime projects (AC deferred):** The follow-up issue will define which action types count. Do NOT implement AC4 (personal projects) — mark it deferred in completion notes.

---

## Acceptance Criteria

- [x] Entropy uses per-rating value from the table above; column header no longer says "Fixed -3"
- [x] Overfeeding penalty is −2 per feed over Feeding Tolerance
- [x] Ambience-change project contributions corrected: 1–4 successes = ±2, 5+ = ±4
- [ ] Personal downtime projects also contribute ±2 / ±4 — **DEFERRED** to follow-up issue
- [x] Step thresholds are per-territory per the table above; Barrens skipped; The Rack cannot step up
- [x] Footer legend / column header tooltips updated to reflect correct project values and per-territory thresholds
- [x] "PC Cap" / "Feeding Tolerance" rename applied in `downtime-data.js`, `regency-tab.js`, and column headers
- [x] Rating table data consolidated in `downtime-data.js`
- [x] Verdant sanity check: 0 feeders, 0 projects, 0 influence → Net = −7, no step change (−7 does not trigger −1 step because negThresh1 = 1 → threshold is −1; −7 triggers −2 steps actually... wait: negThresh2=6, so net <= -6 → -2 steps; -7 <= -6 → yes, -2 steps. Revise expected: Net = −7 → -2 steps from Verdant = Untended)

---

## Implementation

### File 1: `public/js/tabs/downtime-data.js`

**Step 1 — Rename `AMBIENCE_CAP` → `AMBIENCE_FEEDING_TOLERANCE`**

Current (line 71):
```js
export const AMBIENCE_CAP = {
```
Change to:
```js
export const AMBIENCE_FEEDING_TOLERANCE = {
```
Values unchanged (already match the rating table).

**Step 2 — Add `AMBIENCE_ENTROPY` after the renamed export:**

```js
export const AMBIENCE_ENTROPY = {
  'The Rack':  -8,
  'Verdant':   -7,
  'Curated':   -6,
  'Tended':    -5,
  'Settled':   -3,
  'Untended':  -3,
  'Neglected': -3,
  'Hostile':   -3,
  'Barrens':   null,
};
```

**Step 3 — Add `AMBIENCE_THRESHOLDS` after `AMBIENCE_ENTROPY`:**

```js
// posThreshold: net must be >= this to step up (null = cannot step up)
// negThresh1: |net| must exceed this to drop 1 step (null = cannot drop)
// negThresh2: |net| must exceed this to drop 2 steps (null = cannot drop 2)
// null entry = Barrens (uninhabitable; skip entirely)
export const AMBIENCE_THRESHOLDS = {
  'The Rack':  { posThreshold: null, negThresh1: 0,    negThresh2: 5    },
  'Verdant':   { posThreshold: 15,   negThresh1: 1,    negThresh2: 6    },
  'Curated':   { posThreshold: 13,   negThresh1: 2,    negThresh2: 7    },
  'Tended':    { posThreshold: 11,   negThresh1: 3,    negThresh2: 8    },
  'Settled':   { posThreshold: 9,    negThresh1: 4,    negThresh2: 9    },
  'Untended':  { posThreshold: 5,    negThresh1: 5,    negThresh2: 10   },
  'Neglected': { posThreshold: 5,    negThresh1: 6,    negThresh2: 11   },
  'Hostile':   { posThreshold: 5,    negThresh1: null, negThresh2: null },
  'Barrens':   null,
};
```

---

### File 2: `public/js/tabs/regency-tab.js`

**Step 1 — Update import (line 13):**

Current:
```js
import { AMBIENCE_CAP } from './downtime-data.js';
```
Change to:
```js
import { AMBIENCE_FEEDING_TOLERANCE } from './downtime-data.js';
```

**Step 2 — Update usage (line ~117 in `getRegentCap()`):**

Current:
```js
return td ? (AMBIENCE_CAP[td.ambience] || 5) : 5;
```
Change to:
```js
return td ? (AMBIENCE_FEEDING_TOLERANCE[td.ambience] || 5) : 5;
```

**Step 3 — Scan for any player-facing "PC Cap" string in this file and rename to "Feeding Tolerance".**

---

### File 3: `public/js/admin/downtime-views.js`

**Step 0 — Update import.** Find the import line that includes `AMBIENCE_CAP` from `downtime-data.js` and add the two new exports:

Current (find the import, exact line TBD — grep for `AMBIENCE_CAP` in imports):
```js
import { ..., AMBIENCE_CAP, ... } from '../tabs/downtime-data.js';
```
Change to:
```js
import { ..., AMBIENCE_FEEDING_TOLERANCE, AMBIENCE_ENTROPY, AMBIENCE_THRESHOLDS, ... } from '../tabs/downtime-data.js';
```

**Step 1 — Fix `_gatherProjectAmbience()` (~line 3703):**

Current:
```js
const contrib = successes >= 5 ? 2 : successes > 0 ? 1 : 0;
```
Change to:
```js
const contrib = successes >= 5 ? 4 : successes > 0 ? 2 : 0;
```

**Step 2 — Fix `_computeAmbienceRows()` / `buildAmbienceData()` (~lines 3812–3832):**

Current `AMBIENCE_CAP` usage:
```js
const cap = AMBIENCE_CAP[ambience] ?? 6;
```
Change to:
```js
const cap = AMBIENCE_FEEDING_TOLERANCE[ambience] ?? 6;
```

Current overfeeding formula (~line 3815):
```js
const overfeedVal = feeders > cap ? -(feeders - cap) : 0;
```
Change to:
```js
const overfeedVal = feeders > cap ? -(feeders - cap) * 2 : 0;
```

Current entropy (~line 3816):
```js
const entropy = -3;
```
Change to:
```js
const entropy = AMBIENCE_ENTROPY[ambience] ?? -3;
```

Current step threshold block (~lines 3828–3833):
```js
if (net >= 3) delta = 1;
else if (net <= -5) delta = -2;
else if (net < 0) delta = -1;
```
Replace entire `if (startIdx >= 0)` block with:
```js
if (startIdx >= 0) {
  const thresh = AMBIENCE_THRESHOLDS[ambience];
  if (thresh) {
    let delta = 0;
    if (thresh.negThresh2 !== null && net <= -thresh.negThresh2)       delta = -2;
    else if (thresh.negThresh1 !== null && net <= -thresh.negThresh1)  delta = -1;
    else if (thresh.posThreshold !== null && net >= thresh.posThreshold) delta = 1;
    const newIdx = Math.max(0, Math.min(AMBIENCE_STEPS_LIST.length - 1, startIdx + delta));
    projStep = AMBIENCE_STEPS_LIST[newIdx];
  }
  // Barrens (thresh === null): projStep stays as-is
}
```

**Step 3 — Update column header tooltips in `_buildAmbienceHtml()` (~lines 10069–10072):**

Current entropy header:
```js
<th title="Fixed -3 entropy per cycle">Entropy</th>
```
Change to:
```js
<th title="Per-territory entropy (Hostile/Settled/Untended/Neglected −3; Tended −5; Curated −6; Verdant −7; The Rack −8)">Entropy</th>
```

Current overfeeding header:
```js
<th title="Feeders vs cap">Overfeeding</th>
```
Change to:
```js
<th title="Feeders vs Feeding Tolerance (−2 per feed over tolerance)">Overfeeding</th>
```

Current projects header:
```js
<th title="Ambience project contributions: 1–4 successes = 1 pt, 5+ = 2 pts">Projects</th>
```
Change to:
```js
<th title="Ambience project contributions: 1–4 successes = ±2, 5+ = ±4; step thresholds are territory-specific">Projects</th>
```

**Step 4 — Scan for any remaining `AMBIENCE_CAP` references in `downtime-views.js` and rename to `AMBIENCE_FEEDING_TOLERANCE`.**

---

## Verification

After all changes, run these greps to confirm no stale references:

```
grep -n "AMBIENCE_CAP" public/js/tabs/downtime-data.js
grep -n "AMBIENCE_CAP" public/js/tabs/regency-tab.js
grep -n "AMBIENCE_CAP" public/js/admin/downtime-views.js
grep -n "entropy = -3" public/js/admin/downtime-views.js
grep -n "feeders - cap)" public/js/admin/downtime-views.js
grep -n "Fixed -3" public/js/admin/downtime-views.js
grep -n "1 pt, 5+ = 2 pts" public/js/admin/downtime-views.js
```

Expected: all return zero matches (except `AMBIENCE_CAP` in downtime-data.js comment if any — check and remove).

**Sanity check — Verdant territory, pure entropy (no feeders, no projects, no influence, no allies):**
- Entropy: −7
- Overfeeding: 0 (0 feeders, cap 7)
- Net: −7
- negThresh2 = 6: −7 <= −6 → delta = −2 (step down 2: Verdant → Settled)
- Expected projected step: Settled

---

## Scope Notes

- **In scope**: `downtime-data.js`, `downtime-views.js`, `regency-tab.js` — listed changes only
- **Out of scope**: personal downtime projects (follow-up issue); Feed Action vs game-start feed distinction (follow-up issue); XP per Month, Feeding Grounds Merit Limit, Effective City Status (not wired to current UI)
- **No schema, API, or data-structure changes** — purely compute and display logic
