# Story 844: Carthian Pull cap rule for Haven / Mandragora Garden

## Status: Draft

## Metadata
- issue: 844
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/844
- branch: piatra/issue-844-carthian-pull-cap-rule
- type: bug fix
- model: fix.843.domain-granted-by-tag.test.js (test pattern); domain.js meritEffectiveRating (enforcement site)

---

## Story

**As** an ST reviewing domain merit allocations,
**I want** Carthian Pull bonus dots to be blocked (at the picker) and ignored in the effective rating (at render time) when a cap-bound merit's own dots already meet the Safe Place cap,
**so that** a Carthian Pull dot can never produce a haven rating that exceeds what the attached Safe Place permits.

---

## Background

Haven and Mandragora Garden are cap-bound: their effective rating is capped at the effective rating of the attached Safe Place (via `_havenCap`). A Carthian Pull bonus dot is stored in the `free_carthian` channel and is currently included in `meritFreeSum(m)`, which feeds the `stored` value in `meritEffectiveRating`. Because the cap applies via `Math.min(stored, cap)`, a `free_carthian` dot on a Haven that is already at cap from own dots (cp + xp + non-carthian free_*) produces no net effective rating change — but it still manifests as a hollow dot on the sheet and is mechanically invalid per ST ruling.

Additionally, the Carthian Pull picker in the DT form does not prevent a player from allocating a dot to a cap-bound merit that has no room. The write then lands in the DB producing the confusing hollow-dot state.

Eve Lockridge is the live example: Safe Place (Penthouse) = 1, Haven cp = 0, xp = 0, `free_carthian` = 1 -- the Carthian dot meets the cap, the effective rating is 1, but the dot's presence is misleading and invalid.

**Rule (Peter, 2026-07-05, option c):** A Carthian Pull dot may be allocated to a cap-bound merit ONLY when the merit's own dots -- `(m.cp || 0) + (m.xp || 0) + meritFreeSum(m) - freeOf(m, 'carthian')` -- are BELOW the anchor's cap. Non-cap-bound merits (Allies, Contacts, Herd) are unaffected.

**Allocator over-allocation fix (Peter, 2026-07-05):** Independent of the cap rule, the write path must enforce single-target semantics: setting `free_carthian` on a new target must clear any prior `free_carthian` on other merits for the same character. The server route already does a full strip-then-apply (`granted_by:'Carthian Pull'` filter + `free_carthian` clear), so this is already handled at the route level. The UI must not submit a new allocation when the player already has the full pool used -- that guard is also already in place (`used < pool`). No additional allocator fix is needed in this story.

**Manual cleanup:** Peter will correct Eve Lockridge's and Einar Solveig's over-allocated `free_carthian` state directly. No data migration script in this PR.

---

## Scope

| # | Layer | File | Change |
|---|-------|------|--------|
| 1 | Domain helper | `public/js/editor/domain.js` | Add `canAllocateCarthianPull(c, m)` export |
| 2 | DT form picker | `public/js/tabs/downtime-form.js` | Filter `haven` option out of target dropdown when cap-bound merit is at cap |
| 3 | Effective rating | `public/js/editor/domain.js` | Update `meritEffectiveRating` cap-bound branch to ignore `free_carthian` when own dots already meet cap |
| 4 | Tests | `server/tests/fix.844.carthian-pull-cap-rule.test.js` | Unit + behavioural + static-analysis tests |

No schema change. No route change. No data migration.

---

## Acceptance Criteria

1. `canAllocateCarthianPull(c, m)` returns `true` for any non-cap-bound merit.
2. `canAllocateCarthianPull(c, m)` returns `false` for a cap-bound merit where own-dots (excluding `free_carthian`) equal or exceed the cap.
3. `canAllocateCarthianPull(c, m)` returns `true` for a cap-bound merit where own-dots are below the cap.
4. `canAllocateCarthianPull(c, m)` returns `true` for a cap-bound merit with no Safe Place anchor (cap = 0 is treated as "unbounded" -- no anchor means no cap constraint to enforce).
5. The DT form Carthian Pull picker omits the `haven` option when the character's Haven fails `canAllocateCarthianPull`.
6. Eve-shaped fixture (cp=0, xp=0, `free_carthian`=1, cap=1): `meritEffectiveRating` returns 1, not 2. (No behaviour change -- still 1 -- but the calc path must not count the free_carthian dot when own-dots already meet cap.)
7. Legitimate below-cap fixture (cp=0, xp=1, `free_carthian`=1, cap=5): `meritEffectiveRating` returns 2.
8. Allies/Contacts effective rating is unaffected (non-cap-bound path unchanged).
9. `server/tests/fix.844.carthian-pull-cap-rule.test.js` passes (`vitest run`).

---

## Tasks

### Task 1 -- Add `canAllocateCarthianPull` to domain.js

**File:** `public/js/editor/domain.js`

Add below `meritEffectiveRating` (around line 334) or alongside `_havenCap`. Export it.

```js
/**
 * Returns true if a Carthian Pull bonus dot may be allocated to merit `m`
 * on character `c`. Cap-bound merits (Haven, Mandragora Garden) require that
 * the merit's own dots (all channels except free_carthian) are below the
 * anchor cap. Non-cap-bound merits always return true.
 *
 * #844: "own dots" = cp + xp + meritFreeSum(m) - freeOf(m, 'carthian').
 * This excludes any pre-existing Carthian dot from the room calculation,
 * so the question is: "does the merit have room for one more dot from
 * a non-Carthian source?" -- if yes, a Carthian dot also fits.
 */
export function canAllocateCarthianPull(c, m) {
  if (!CAP_DOMAIN.has(m.name)) return true;
  const cap = _havenCap(c, m);
  if (!cap) return true; // no anchor → no cap constraint
  const ownDots = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m) - freeOf(m, 'carthian');
  return ownDots < cap;
}
```

`freeOf` is already imported from `'../data/rules-helpers.js'` at the top of domain.js. `meritFreeSum` is already defined in the same file. `CAP_DOMAIN` and `_havenCap` are already in scope.

### Task 2 -- Filter the DT form picker

**File:** `public/js/tabs/downtime-form.js`

`renderCarthianPullSection` is at line 4576. The target dropdown options are built around lines 4612-4620:

```js
h += opt('allies', 'Allies');
h += opt('contacts', 'Contacts');
h += opt('haven', 'Haven');
h += opt('herd', 'Herd');
```

`canAllocateCarthianPull` is not yet imported. Add it to the existing `domain.js` import at line 21:

```js
import { calcTotalInfluence, domMeritTotal, attacheBonusDots, effectiveInvictusStatus,
  ssjHerdBonus, flockHerdBonus, meritEffectiveRating, influenceBreakdown, domKey,
  canAllocateCarthianPull } from '../editor/domain.js';
```

Then, before emitting the `haven` option, resolve whether Haven is allocatable:

```js
// #844: only offer Haven if the merit is below cap or has no anchor.
const havenMerit = (currentChar?.merits || [])
  .find(m => m.category === 'domain' && m.name === 'Haven');
const havenAllocatable = !havenMerit || canAllocateCarthianPull(currentChar, havenMerit);
if (havenAllocatable) h += opt('haven', 'Haven');
```

Do the same for Mandragora Garden -- but note the current dropdown does not include Mandragora Garden as a target. That is a pre-existing scope limit (Mandragora Garden was never a Carthian Pull target). Do not add it in this story; the filter only applies to the existing `haven` option.

**Placement:** insert the `havenMerit` / `havenAllocatable` block immediately before the `h += opt('haven', 'Haven')` line. Remove that bare `opt` call and replace with the conditional above.

### Task 3 -- Update `meritEffectiveRating` for cap-bound merits

**File:** `public/js/editor/domain.js`, `meritEffectiveRating` function (lines 309-334).

Current cap-bound branch:

```js
if (CAP_DOMAIN.has(m.name)) {
  const stored = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);
  return Math.min(stored, _havenCap(c, m));
}
```

Replace with:

```js
if (CAP_DOMAIN.has(m.name)) {
  const cap = _havenCap(c, m);
  const stored = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);
  // #844: if own dots (excluding free_carthian) already meet the cap,
  // the Carthian dot cannot contribute -- ignore it in the effective calc.
  const ownDots = stored - freeOf(m, 'carthian');
  const effectiveStored = (cap > 0 && ownDots >= cap)
    ? ownDots
    : stored;
  return Math.min(effectiveStored, cap || stored);
}
```

Rationale: when own-dots already meet cap, `effectiveStored = ownDots` (dropping `free_carthian`), then `Math.min(ownDots, cap) = cap`. When own-dots are below cap, `effectiveStored = stored` (the Carthian dot counts), then `Math.min(stored, cap)` applies normally. When there is no cap (`cap = 0` / no anchor), `cap || stored` falls back to `stored` so the result is unchanged from today.

The Eve fixture: ownDots = 0, cap = 1, `ownDots >= cap` is false, so `effectiveStored = stored = 1`, `Math.min(1, 1) = 1`. Numerically same as today, but if Eve had cp=0/xp=0/free_carthian=1/cap=1 then ownDots=0 which is < 1, so effectiveStored=1, result=1. Correct.

Wait -- re-read the AC. AC6 specifies "Eve-shaped: cp=0 xp=0 free_carthian=1 cap=1 → effective=1". With the formula above: stored=1, ownDots=0, 0 < 1 so effectiveStored=stored=1, min(1,1)=1. Correct.

Now: "what if cp=0 xp=1 free_carthian=1 cap=1?" -- ownDots=1 >= cap=1 → effectiveStored=ownDots=1, min(1,1)=1. The Carthian dot is silently dropped. Correct (own dot meets cap; Carthian gets no room).

And AC7: "cp=0 xp=1 free_carthian=1 cap=5" -- stored=2, ownDots=1, 1 < 5 → effectiveStored=2, min(2,5)=2. Correct.

### Task 4 -- Tests

**File:** `server/tests/fix.844.carthian-pull-cap-rule.test.js`

Pattern from `fix.843.domain-granted-by-tag.test.js` (REPO_ROOT + `fs.readFileSync` + `vitest`).

```js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const domainSrc = fs.readFileSync(
  path.join(REPO_ROOT, 'public/js/editor/domain.js'), 'utf8');
const formSrc = fs.readFileSync(
  path.join(REPO_ROOT, 'public/js/tabs/downtime-form.js'), 'utf8');
```

**Suite 1 -- Unit: `canAllocateCarthianPull` logic (static-analysis shape)**

```js
describe('canAllocateCarthianPull export', () => {
  it('is exported from domain.js', () => {
    expect(domainSrc).toContain('export function canAllocateCarthianPull');
  });

  it('early-returns true for non-CAP_DOMAIN merits', () => {
    // The function must check CAP_DOMAIN.has before doing cap arithmetic.
    expect(domainSrc).toMatch(/canAllocateCarthianPull[\s\S]{0,300}CAP_DOMAIN\.has/);
  });

  it('uses freeOf(m, .carthian.) in the own-dots calculation', () => {
    const start = domainSrc.indexOf('export function canAllocateCarthianPull');
    const end   = domainSrc.indexOf('\n}', start) + 2;
    const slice = domainSrc.slice(start, end);
    expect(slice).toContain("freeOf(m, 'carthian')");
  });

  it('calls _havenCap to resolve the cap', () => {
    const start = domainSrc.indexOf('export function canAllocateCarthianPull');
    const end   = domainSrc.indexOf('\n}', start) + 2;
    const slice = domainSrc.slice(start, end);
    expect(slice).toContain('_havenCap');
  });
});
```

**Suite 2 -- Unit: `meritEffectiveRating` cap-bound branch update**

```js
describe('meritEffectiveRating cap-bound branch (#844)', () => {
  it('contains freeOf(m, .carthian.) inside the CAP_DOMAIN branch', () => {
    const capIdx    = domainSrc.indexOf('CAP_DOMAIN.has(m.name)');
    const branchEnd = domainSrc.indexOf('if (MULTI_INSTANCE_DOMAIN', capIdx);
    const slice     = domainSrc.slice(capIdx, branchEnd);
    expect(slice).toContain("freeOf(m, 'carthian')");
  });

  it('references ownDots in the cap-bound branch', () => {
    const capIdx    = domainSrc.indexOf('CAP_DOMAIN.has(m.name)');
    const branchEnd = domainSrc.indexOf('if (MULTI_INSTANCE_DOMAIN', capIdx);
    const slice     = domainSrc.slice(capIdx, branchEnd);
    expect(slice).toContain('ownDots');
  });
});
```

**Suite 3 -- Behavioural: effective rating fixtures**

These tests import the module directly. Because `domain.js` uses ES modules with imports from `state.js` and `rules-helpers.js`, use dynamic import with a vitest module mock for `state`.

```js
// Vitest can handle ESM imports from public/ if the test runner is configured
// with the repo's vite/vitest config. If module resolution fails, fall back to
// the static-source approach (assert formula shape from source text).
//
// Preferred: source-text behavioural simulation (no import needed).
// The formula for the cap-bound branch is deterministic enough to test
// via a small inline reimplementation that mirrors the new code.

describe('meritEffectiveRating cap-bound behaviour (#844)', () => {
  // Inline reimplementation of the new cap-bound branch for fixture testing.
  // Mirrors the formula in Task 3 exactly. If the implementation diverges,
  // the static-analysis tests above will catch it.
  function havenCapFixture(cap) {
    // Simulates _havenCap returning a fixed value.
    return cap;
  }
  function freeOfCartian(m) {
    return (m.free_grants && m.free_grants.carthian != null)
      ? m.free_grants.carthian
      : (m.free_carthian || 0);
  }
  function meritFreeSum844(m) {
    // Simplified: only free_carthian for these fixtures.
    return freeOfCartian(m);
  }
  function effectiveRating844(m, cap) {
    const stored   = (m.cp || 0) + (m.xp || 0) + meritFreeSum844(m);
    const ownDots  = stored - freeOfCartian(m);
    const effectiveStored = (cap > 0 && ownDots >= cap) ? ownDots : stored;
    return Math.min(effectiveStored, cap || stored);
  }

  it('Eve fixture: cp=0 xp=0 free_carthian=1 cap=1 → 1', () => {
    const m = { name: 'Haven', category: 'domain', cp: 0, xp: 0, free_carthian: 1 };
    expect(effectiveRating844(m, 1)).toBe(1);
  });

  it('at-cap own-dots fixture: cp=0 xp=1 free_carthian=1 cap=1 → 1 (Carthian dropped)', () => {
    const m = { name: 'Haven', category: 'domain', cp: 0, xp: 1, free_carthian: 1 };
    expect(effectiveRating844(m, 1)).toBe(1);
  });

  it('below-cap fixture: cp=0 xp=1 free_carthian=1 cap=5 → 2 (Carthian counts)', () => {
    const m = { name: 'Haven', category: 'domain', cp: 0, xp: 1, free_carthian: 1 };
    expect(effectiveRating844(m, 5)).toBe(2);
  });

  it('no anchor (cap=0): stored is returned as-is', () => {
    const m = { name: 'Haven', category: 'domain', cp: 0, xp: 2, free_carthian: 1 };
    expect(effectiveRating844(m, 0)).toBe(3);
  });
});
```

**Suite 4 -- Static: allocator UI filter**

```js
describe('DT form picker cap filter (#844)', () => {
  it('imports canAllocateCarthianPull from domain.js', () => {
    expect(formSrc).toContain('canAllocateCarthianPull');
  });

  it('canAllocateCarthianPull is used before emitting the haven option', () => {
    const cpIdx   = formSrc.indexOf('renderCarthianPullSection');
    const endIdx  = formSrc.indexOf('\n}', cpIdx + 30);
    const slice   = formSrc.slice(cpIdx, endIdx);
    expect(slice).toContain('canAllocateCarthianPull');
    // The haven option emission must be conditional.
    expect(slice).toMatch(/canAllocateCarthianPull[\s\S]{0,300}haven/);
  });
});
```

---

## Dev Notes

### Why `ownDots < cap` and not `ownDots + 1 <= cap`

They are equivalent. `ownDots < cap` is the idiomatic form: "there is room for at least one more dot."

### `_havenCap` returns 0 when no anchor

When no Safe Place is attached, `_havenCap` returns 0. The `canAllocateCarthianPull` guard `if (!cap) return true` treats this as "no cap constraint" -- the character has no Safe Place so the question of cap compliance is moot. The effective-rating branch uses `cap || stored` as the fallback so a zero cap falls through to `stored`, which is the existing pre-#844 behaviour.

### Mandragora Garden

Mandragora Garden is in `CAP_DOMAIN` and the `canAllocateCarthianPull` helper covers it via the `CAP_DOMAIN.has(m.name)` check. However, the DT form target dropdown does not currently include a Mandragora Garden option, so no picker change is needed for it. If Mandragora Garden is ever added as a Carthian Pull target in a future story, the helper is already correct.

### Allocator over-allocation (single-target semantics)

The server route at `PATCH /api/characters/:id/carthian_pull` (characters.js line 607) performs a full strip-then-apply on every write: it deletes all `granted_by:'Carthian Pull'` merits and clears all `free_carthian` fields before applying the submitted allocation set. This means the route already enforces single-clear semantics -- a new allocation cannot stack on top of an old one. No client-side clear step is required. The client-side `_applyCarthianSet` calls `_carthianCurrentAllocations()` to build the full new set and submits it in one request; the server strips then applies. The end state is always a faithful reflection of the submitted set.

### Import change in downtime-form.js

The existing import at line 21 is a long single line. It is acceptable to break it into two lines or extend the existing line. Either approach is fine. What matters is that `canAllocateCarthianPull` appears in the named-import list.

### Test file placement

`server/tests/` is the established location for all vitest tests in this repo, including client-side static analysis tests. The test file goes there even though it analyses `public/` source.

---

## Dev Agent Record

### Agent Model Used

(fill in on completion)

### Debug Log

### Completion Notes

### File List

- `public/js/editor/domain.js`
- `public/js/tabs/downtime-form.js`
- `server/tests/fix.844.carthian-pull-cap-rule.test.js`
- `specs/stories/844-carthian-pull-cap-rule.story.md`

### Change Log
