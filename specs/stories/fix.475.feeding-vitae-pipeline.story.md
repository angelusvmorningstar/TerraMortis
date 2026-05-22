---
id: fix.475
title: Feeding vitae pipeline — FG bonus dots, stale pill ambience, wrong roll territory
status: review
issue: 475
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/475
branch: ms/issue-475-feeding-vitae-pipeline
type: fix
---

## Story

As a player whose character has Feeding Grounds bonus dots, feeds in a non-default territory,
or views the territory ambience badge in the downtime form,
I want the feeding roll panel, vitae tally, and DT form pills to all read live and correct data,
so that my dice pool, vitae bonus, and displayed ambience match what the Storytellers confirm.

## Background

Three separate bugs were observed during DT3 processing for René M (Regent of The Second City):

**Bug 1 — FG bonus dots ignored everywhere (dice pool and processing panel)**

René's Feeding Grounds merit has `bonus: 4, cp: 0, xp: 0` (i.e. all four dots are ST-awarded
bonus, none are purchased). Her FG contributes 0 dice everywhere it should show +4:

- **DT form pool preview** (downtime-form.js `effectiveDomainDots`): goes through
  `meritEffectiveRating` → `domMeritTotalSingle` → `domMeritContribSingle`. That function
  (domain.js:39) sums `cp + free + free_mci + xp + free_fwb + free_attache` — `bonus` is
  never included. Result: 0.
- **DT Processing right panel** (downtime-views.js:1009, 7270, 8390): reads `fg.rating || 0`.
  `fg.rating` is undefined or 0 for René's merit. Result: 0.
- **Feeding roll `buildPool`** (feeding-tab.js:453): disciplines use `c.disciplines?.[d]?.dots`
  directly — this path is unrelated to FG. FG is not included in `buildPool` at all. The DT form
  _does_ add FG dice (line 4946) but the feeding-tab roll does not. These need to match.

**Bug 2 — Stale territory ambience in DT form pills**

The feeding territory pills in the DT form (`renderFeedingTerritoryPills`) read ambience and
ambienceMod from the hardcoded `TERRITORY_DATA` constant (downtime-form.js:5363-5364).
The Second City in TERRITORY_DATA has `ambience: 'Tended', ambienceMod: +2` — but the live DB
(MongoDB territories collection, the SSOT) has it at `ambience: 'Settled', ambienceMod: 0`.

The DT form already loads live territories into `_territories` (for regent/feeding-rights checks
at line 5373). This data is available but ignored for ambience display.

**Bug 3 — Feeding roll vitae tally uses Barrens instead of submitted territory**

`computeVitateTally` in feeding-tab.js (lines 492-505) reads the `feeding_territories` JSON from
the submission and looks up the territory via:
```js
const td = effectiveTerrs.find(t => t.slug === tid || tid.startsWith(t.slug));
```

The `feeding_territories` grid key for "The Second City" is `the_second_city`
(derived by: `terr.toLowerCase().replace(/[^a-z0-9]+/g, '_')` — see downtime-form.js:5361).
But `TERRITORY_DATA` (downtime-data.js:127) has `slug: 'secondcity'` — no "the_", no underscore.

Neither `'the_second_city' === 'secondcity'` nor `'the_second_city'.startsWith('secondcity')`
is true. Every named territory lookup silently fails; the loop finds no match;
`ambience` stays at its default of `−4` (Barrens). This is Bug 3.

The DT Processing panel does NOT have this bug — it uses `MATRIX_TERRS` + `TERRITORY_SLUG_MAP`
for a different lookup path.

## Acceptance Criteria

- [ ] AC1: A character with FG `bonus: 4, cp: 0, xp: 0` shows +4 FG dice in the DT form pool
  preview
- [ ] AC2: The DT Processing right panel "Dice Pool Modifiers → Feeding Grounds" row shows +4 for
  the same character (all three `fg.rating || 0` call sites fixed)
- [ ] AC3: The feeding tab roll panel includes FG dice in `buildPool` so the player-rolled pool
  matches the DT form preview (add FG to `buildPool` the same way the DT form does it)
- [ ] AC4: The DT form feeding territory pills show live territory ambience (Settled +0 for Second
  City), not stale hardcoded values (Tended +2)
- [ ] AC5: After rolling, the vitae tally card shows the correct territory ambience for characters
  whose submission has a named feeding territory — Second City shows 0, not −4 (Barrens)
- [ ] AC6: Characters whose `feeding_vitae_tally` was already persisted by the ST are unaffected
  (the fix only touches the `computeVitateTally` fallback path)
- [ ] AC7: Characters with no feeding territory in their submission still default to Barrens (−4)
  — no regression
- [ ] AC8: Characters with a properly purchased FG merit (cp > 0, bonus = 0) remain unaffected
  — `domMeritContribSingle` fix is additive

## Tasks

- [x] T1: Fix 1a — `domain.js`: add `m.bonus` to `domMeritContribSingle`
- [x] T2: Fix 1b — `downtime-views.js`: add `meritEffectiveRating` to import + 3 call sites
- [x] T3: Fix 1c — `feeding-tab.js`: add FG dice to `buildPool`
- [x] T4: Fix 2 — `downtime-form.js`: prefer live `_territories` for pill ambience
- [x] T5: Fix 3 — `feeding-tab.js`: add name-based slug fallback in `computeVitateTally`

## Implementation

### Fix 1a — `public/js/editor/domain.js` (FG bonus dots root cause)

**`domMeritContribSingle`** (line 37-43) — add `(m.bonus || 0)` to the sum:

```js
// BEFORE
export function domMeritContribSingle(c, m) {
  if (!m) return 0;
  const purchased = (m.cp || 0) + (m.free || 0) + (m.free_mci || 0) + (m.xp || 0);
  return purchased
    + (m.name === 'Herd' ? ssjHerdBonus(c) + flockHerdBonus(c) : 0)
    + (m.free_fwb || 0) + (m.free_attache || 0);
}

// AFTER
export function domMeritContribSingle(c, m) {
  if (!m) return 0;
  const purchased = (m.cp || 0) + (m.free || 0) + (m.free_mci || 0) + (m.xp || 0)
    + (m.bonus || 0);
  return purchased
    + (m.name === 'Herd' ? ssjHerdBonus(c) + flockHerdBonus(c) : 0)
    + (m.free_fwb || 0) + (m.free_attache || 0);
}
```

This is the single source-of-truth function for domain merit rating. Adding `m.bonus` here
propagates the fix to every consumer: `domMeritTotalSingle`, `meritEffectiveRating`,
`effectiveDomainDots` in the DT form, `domMeritContrib` for Herd, etc.

`domMeritShareableSingle` (line 46-49) — do NOT add `m.bonus` there. That function returns
partner-shareable dots only; an ST-awarded bonus to one character's FG is not transferable.

### Fix 1b — `public/js/admin/downtime-views.js` (FG dice — three call sites)

All three sites read `fg.rating || 0`. Replace with `meritEffectiveRating(char, fg)`.
Confirm `meritEffectiveRating` is already imported at the top of the file (it is — check with
grep). If not, add it to the import from `'../editor/domain.js'`.

**Line ~1009** (inside `buildFeedPool`):
```js
// BEFORE
const fg = (char.merits || []).find(m => m.name === 'Feeding Grounds');
const fgVal = fg ? Math.min(fg.rating || 0, 5) : 0;

// AFTER
const fg = (char.merits || []).find(m => m.name === 'Feeding Grounds');
const fgVal = fg ? Math.min(meritEffectiveRating(char, fg), 5) : 0;
```

**Line ~7270** (inside `_renderFeedRightPanel`):
```js
// BEFORE
const fg = (char?.merits || []).find(m => m.name === 'Feeding Grounds');
const fgDice = fg ? Math.min(fg.rating || 0, 5) : null;

// AFTER
const fg = (char?.merits || []).find(m => m.name === 'Feeding Grounds');
const fgDice = fg ? Math.min(char ? meritEffectiveRating(char, fg) : (fg.rating || 0), 5) : null;
```
(Guard with `char ?` because `char` can be null in this function.)

**Line ~8390** (inside the pool-builder wiring block):
```js
// BEFORE
const fg0 = (char?.merits || []).find(m => m.name === 'Feeding Grounds');
const fgDice0 = fg0 ? Math.min(fg0.rating || 0, 5) : 0;

// AFTER
const fg0 = (char?.merits || []).find(m => m.name === 'Feeding Grounds');
const fgDice0 = fg0 ? Math.min(char ? meritEffectiveRating(char, fg0) : 0, 5) : 0;
```

### Fix 1c — `public/js/tabs/feeding-tab.js` (FG dice missing from `buildPool`)

`buildPool` (line 435-464) computes attr + skill + disc but omits FG dice entirely. The DT form
pool preview (`renderFeedPoolPanel` line 4946) adds `effectiveDomainDots(c, 'Feeding Grounds')`.
These must agree.

Add FG to `buildPool` after the unskilled penalty calculation:

```js
// After the existing unskilled calculation (around line 453-454):
const unskilled = bestSV === 0
  ? (method.skills.some(s => !SKILLS_MENTAL.includes(s)) ? -1 : -3)
  : 0;

// ADD this:
const fgVal = (c.merits || [])
  .filter(m => m.category === 'domain' && m.name === 'Feeding Grounds')
  .reduce((s, m) => s + ((m.cp || 0) + (m.free || 0) + (m.free_mci || 0) + (m.xp || 0) + (m.bonus || 0)), 0);

poolTotal = Math.max(0, bestAV + bestSV + discVal + specBonus + unskilled + fgVal);

const parts = [`${bestAV} ${bestA}`, `${bestSV} ${bestS}`];
if (discVal) parts.push(`${discVal} ${discName}`);
if (specBonus) parts.push(`${specBonus} ${specName}`);
if (unskilled) parts.push(`−${Math.abs(unskilled)} (unskilled)`);
if (fgVal) parts.push(`${fgVal} Feeding Grounds`);
poolBreakdown = parts.join(' + ') + ` = ${poolTotal}`;
```

Note: import `domMeritContribSingle` from `domain.js` if you want to reuse the function, OR
inline the sum as above to avoid a new import (the import is the cleaner approach — domain.js is
already imported via `domMeritContrib` at line 18).

Actually: `domMeritContrib(char, 'Feeding Grounds')` (already imported) returns the sum of ALL
FG instances using `domMeritContribSingle`. Use that directly:

```js
// SIMPLER — replace the fgVal block above with:
import { domMeritContrib } from '../editor/domain.js'; // check if already imported

// Inside buildPool:
const fgVal = domMeritContrib(c, 'Feeding Grounds');
poolTotal = Math.max(0, bestAV + bestSV + discVal + specBonus + unskilled + fgVal);
...
if (fgVal) parts.push(`${fgVal} Feeding Grounds`);
```

Check `feeding-tab.js` line 18 — `domMeritContrib` is already imported from `'../editor/domain.js'`. Use it.

### Fix 2 — `public/js/tabs/downtime-form.js` (stale ambience in territory pills)

**`renderFeedingTerritoryPills`** (line 5363-5416) — prefer live territory data over hardcoded:

```js
// BEFORE (line 5363-5364)
const terrData = TERRITORY_DATA.find(t => t.name === terr);
const ambience = terrData ? terrData.ambience : '';

// AFTER
const liveTerrData = (_territories || []).find(t => t.name === terr);
const terrData = liveTerrData || TERRITORY_DATA.find(t => t.name === terr);
const ambience = terrData ? terrData.ambience : '';
```

The `_territories` module-level array is loaded at DT form init (for regent/feeding-rights checks).
No new fetch is needed. The live data takes precedence; TERRITORY_DATA is the fallback.

### Fix 3 — `public/js/tabs/feeding-tab.js` (slug mismatch in `computeVitateTally`)

**`computeVitateTally`** (line 499) — add name-based fallback to territory lookup:

The `feeding_territories` JSON grid uses keys derived by:
```
terr.toLowerCase().replace(/[^a-z0-9]+/g, '_')
```
e.g. `'The Second City'` → `'the_second_city'`

But `effectiveTerrs` slugs are short-form: `'secondcity'`, `'academy'`, etc.

```js
// BEFORE (line 499)
const td = effectiveTerrs.find(t => t.slug === tid || tid.startsWith(t.slug));

// AFTER
const td = effectiveTerrs.find(t =>
  t.slug === tid ||
  tid.startsWith(t.slug) ||
  t.name?.toLowerCase().replace(/[^a-z0-9]+/g, '_') === tid
);
```

The third clause converts `'The Second City'` → `'the_second_city'` and checks equality with
`tid`. This correctly matches all named territories.

Verify the Barrens case: `'The Barrens (No Territory)'` → `'the_barrens_no_territory_'`.
The Barrens entry in TERRITORY_DATA has `slug: undefined` (not in the array — it's the default).
The grid can contain `the_barrens_no_territory_` with status `'barrens'` (not `'resident'` or
`'poach'`), so the `if (status !== 'resident' && status !== 'poach') continue` guard already
skips it. No regression.

## Dev Notes

### Critical: `meritEffectiveRating` import in downtime-views.js

`meritEffectiveRating` is NOT currently imported in `downtime-views.js`. The existing domain
import at line 13 is:
```js
import { calcTotalInfluence, domMeritContrib, ssjHerdBonus, flockHerdBonus, effectiveInvictusStatus } from '../editor/domain.js';
```

Add `meritEffectiveRating` to that line. Do NOT add a second import line:
```js
import { calcTotalInfluence, domMeritContrib, ssjHerdBonus, flockHerdBonus, effectiveInvictusStatus, meritEffectiveRating } from '../editor/domain.js';
```

### `domMeritContrib` vs `domMeritContribSingle`

- `domMeritContrib(c, name)` — sums ALL instances of a named domain merit (correct for FG,
  which can have multiple instances). Already imported in feeding-tab.js line 18.
- `domMeritContribSingle(c, m)` — handles one instance + partner sharing. This is what
  Fix 1a modifies. Called by `domMeritTotalSingle` → `meritEffectiveRating` → `effectiveDomainDots`.

After Fix 1a, both paths pick up `m.bonus` correctly.

### Scope of Fix 1a (domain.js change)

Adding `m.bonus` to `domMeritContribSingle` affects every domain merit's effective rating.
This is correct — bonus dots are real dots (project memory: "Bonus dots are real dots").
No characters currently have `bonus` set on domain merits other than René's FG, so no
unintended side-effects are expected. Verify by querying MongoDB if needed:
```
db.characters.find({ "merits": { $elemMatch: { category: "domain", bonus: { $gt: 0 } } } })
```

### `_territories` availability in renderFeedingTerritoryPills

The `_territories` module-level variable is set when the DT form loads territory data.
`renderFeedingTerritoryPills` is called from `renderFeedingSection` which is always called
after the async init. If `_territories` is null (edge case: offline, load failure), the fallback
to `TERRITORY_DATA` ensures the pills still render.

### What is NOT in scope

- The admin-side DT Processing vitae panel (lines 7325-7373) uses `MATRIX_TERRS` /
  `TERRITORY_SLUG_MAP` for territory lookup — it has its own slug-resolution path and does
  NOT have Bug 3. Do not change it.
- `feeding_roll_player.breakdown` stored in MongoDB — already has the pool size at roll time.
  Fix 1c changes `buildPool` which only runs pre-roll; persisted rolls are unaffected.
- `computeVitateTally` is only called when `mySub.feeding_vitae_tally` is not yet persisted
  (the ready state and the just-rolled display before ST processes). After ST writes
  `feeding_vitae_tally`, the stored value is used. No migration of existing data needed.

### File change summary

| File | What changes |
|------|-------------|
| `public/js/editor/domain.js` | `domMeritContribSingle`: add `(m.bonus \|\| 0)` |
| `public/js/admin/downtime-views.js` | 3 × `fg.rating \|\| 0` → `meritEffectiveRating(char, fg)` |
| `public/js/tabs/feeding-tab.js` | `buildPool`: add FG via `domMeritContrib`; `computeVitateTally`: name-based slug fallback |
| `public/js/tabs/downtime-form.js` | `renderFeedingTerritoryPills`: prefer `_territories` for ambience |

## Dev Agent Record

### Files Changed

- `public/js/editor/domain.js`
- `public/js/admin/downtime-views.js`
- `public/js/tabs/feeding-tab.js`
- `public/js/tabs/downtime-form.js`

### Completion Notes

- **T1 (domain.js)**: Added `+ (m.bonus || 0)` to the `purchased` sum in `domMeritContribSingle`. This single-line change propagates through the entire domain merit rating chain — `domMeritTotalSingle` → `meritEffectiveRating` → `effectiveDomainDots` — so the DT form pool preview and all merit rating consumers automatically pick up FG bonus dots.

- **T2 (downtime-views.js)**: Added `meritEffectiveRating` to the existing domain.js import at line 13. Replaced `fg.rating || 0` at all three call sites: line 1009 (`buildFeedingPool`), line 7270 (`_renderFeedRightPanel` — guarded with `char ?` since char can be null), line 8390 (pool-builder wiring — same guard).

- **T3 (feeding-tab.js `buildPool`)**: Added `const fgVal = domMeritContrib(c, 'Feeding Grounds')` (already imported at line 18). `domMeritContrib` sums all FG instances via `domMeritContribSingle`, so after T1 it also includes `m.bonus`. Added `fgVal` to `poolTotal` and to the `parts` breakdown string with `if (fgVal)` guard. The feeding roll panel pool now matches the DT form pool preview.

- **T4 (downtime-form.js)**: In `renderFeedingTerritoryPills`, the `terrData` lookup now tries `(_territories || []).find(t => t.name === terr)` first, falling back to `TERRITORY_DATA` if the live array doesn't have a match. `_territories` is already loaded at form init for regent/feeding-rights checks — no new fetch needed.

- **T5 (feeding-tab.js `computeVitateTally`)**: Extended the `effectiveTerrs.find()` call with a third clause: `t.name?.toLowerCase().replace(/[^a-z0-9]+/g, '_') === tid`. This converts territory names using the same transformation the DT form applies when building the `feeding_territories` JSON grid, resolving the `the_second_city` vs `secondcity` slug mismatch. Barrens is unaffected — it uses `status: 'barrens'`, skipped by the `resident`/`poach` guard before the lookup.

### Change Log

- 2026-05-22: Fix #475 — FG bonus dots counted in all three surfaces; DT form pills use live territory ambience; feeding roll vitae tally resolves territory by name when slug doesn't match.
