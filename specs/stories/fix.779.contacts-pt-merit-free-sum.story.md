---
title: 'meritFreeSum double-counts PT dots when free_grants.pt and free_pt both set'
type: 'fix'
issue: 779
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/779
branch: ms/issue-779-contacts-pt-merit-free-sum
created: '2026-06-16'
status: review
recommended_model: 'sonnet — single-function fix with two callers to verify'
context:
  - public/js/data/rules-helpers.js
  - public/js/editor/domain.js
---

## Intent

`meritFreeSum` overcounts engine-granted free dots on any merit where both
`m.free_grants[slug]` (persisted by the N-2 backfill) and `m.free_<slug>`
(re-set at render by a clear-and-rewrite evaluator) are simultaneously non-zero.
Currently affects **11 characters** (escalating to all 20 with PT-Contacts as each
is saved again).

The fix is one function in `public/js/data/rules-helpers.js`: change `meritFreeSum`
from "sum both channels independently" to "per-slug map-wins semantics" — identical to
the already-correct `freeOf` helper in the same file.

---

## Root cause (fully investigated — do NOT re-investigate)

### Live DB state for Henry St. John's Contacts (representative case)

```
free_grants: { mci: 3, pt: 2 }   ← persisted by N-2 backfill
free_pt: 2                         ← re-set at every render by pt-evaluator.js:41
free_mci: 0                        ← no MCI double-count here
```

### The double-count chain

1. N-2 backfill migrated `free_pt = 2` → `free_grants.pt = 2` and zeroed `free_pt`.
2. `applyDerivedMerits` (`mci.js:78`) clears `m.free_pt = 0` before each render cycle.
3. `applyPTRulesFromDb` (`pt-evaluator.js:41`) writes `tgt.free_pt = rule.amount`,
   repopulating `free_pt = 2`.
4. After the next save cycle, both channels are simultaneously non-zero.
5. `meritFreeSum` sums ALL `Object.values(free_grants)` (=5) PLUS ALL `free_<slug>`
   legacy fields (`free_pt = 2` adds 2) = **7**.

`syncMeritRating` (`domain.js:224`) calls `meritFreeSum`, so `m.rating` is set to 7,
and `pruneContactsSpheres` (`domain.js:254`) uses `meritFreeSum` to compute the sphere
cap — currently allowing up to 7 spheres when only 5 are valid.

### Why `freeOf` is correct but `meritFreeSum` is not

`freeOf(m, 'pt')` returns `free_grants.pt = 2` (map wins via `?? `), never sums both.
`meritFreeSum` was designed assuming the two channels are disjoint — that the N-2
backfill would zero out legacy fields permanently. That assumption breaks for evaluators
that use the clear-and-rewrite pattern (PT, OHM, MDB, etc.): the clear step zeros the
field, but the evaluator immediately rewrites it, leaving both channels populated after
any save cycle.

### DB scope (as of 2026-06-16)

```
Characters with free_grants.pt on Contacts: 20
Currently double-counting (free_pt: 2 also set): 11
  Yusuf, Reed Justice, Carver, Conrad, Margaret Kane, Julia, René Meyer,
  Wan Yelong, Charlie Ballsack, Hazel, Henry St. John, Aleksei, Màibh
Will drift into double-count on next save: 9
  René St. Dominique, Don Ezzelino, Macheath, Edna Judge, Xavier,
  Terrassa, Benedict
```

---

## Fix specification

### T1 — Rewrite `meritFreeSum` in `public/js/data/rules-helpers.js`

**Current (lines 92–100):**
```js
export function meritFreeSum(m) {
  if (!m) return 0;
  const fromMap = Object.values(m.free_grants || {}).reduce((s, n) => s + (n || 0), 0);
  let fromLegacy = 0;
  for (const slug of LEGACY_FREE_SLUGS) {
    fromLegacy += (m['free_' + slug] || 0);
  }
  return fromMap + fromLegacy;
}
```

**Replacement — per-slug map-wins semantics:**
```js
export function meritFreeSum(m) {
  if (!m) return 0;
  // Build the union of all slugs present in either channel, then read
  // each via freeOf so the map wins when both are set. Fixes double-count
  // when N-2 backfill persisted free_grants[slug] while a clear-and-rewrite
  // evaluator (PT, OHM, MDB, etc.) re-populates the legacy flat field.
  const slugsInMap = Object.keys(m.free_grants || {});
  const slugsInLegacy = LEGACY_FREE_SLUGS.filter(s => m['free_' + s]);
  const allSlugs = new Set([...slugsInMap, ...slugsInLegacy]);
  let total = 0;
  for (const slug of allSlugs) {
    total += freeOf(m, slug);
  }
  return total;
}
```

Key invariants preserved:
- `freeOf` map-wins: if `free_grants[slug]` exists (even = 0), map value used; no legacy fallback.
- Characters with ONLY legacy fields (pre-N-2): `slugsInMap` empty, `slugsInLegacy` captures all
  non-zero legacy slugs → `freeOf` falls back to `m.free_<slug>`. Correct.
- Characters with ONLY map (post-N-2, evaluator not yet writing to legacy): `slugsInLegacy` empty,
  `slugsInMap` captures all map entries. Correct.
- `m.free` (player-allocated, un-prefixed) is intentionally excluded from `LEGACY_FREE_SLUGS`
  and is not in `free_grants` — excluded correctly as before.

### T2 — Verify downstream callers (read-only check, no code changes needed)

Two callers of `meritFreeSum` must be verified to still behave correctly after the fix:

- `syncMeritRating` (`domain.js:224`): `return (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);`
  → will now return 5 for Keeper's Contacts instead of 7. This is correct behaviour.

- `pruneContactsSpheres` (`domain.js:254`): `const r = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);`
  → sphere cap will be 5 for Keeper's Contacts. Henry has 5 spheres in `m.spheres` — no truncation
  needed. Verify this is safe.

- `meritEffectiveRating` (`domain.js:271`): calls `meritFreeSum` for domain-category merits.
  Contacts is influence-category, not domain — not reached by this path. No change needed.

No changes to `freeOf`, `syncMeritRating`, `pruneContactsSpheres`, or the evaluators.

---

## Acceptance criteria

- [ ] **AC-1** Henry St. John's Contacts merit displays 5 dots in the sheet editor (not 7)
- [ ] **AC-2** `meritFreeSum(m)` returns the correct total when a slug has both
      `free_grants[slug]` AND `free_<slug>` set — map value wins, no summing
- [ ] **AC-3** A character with ONLY legacy `free_pt = 2` (no `free_grants`) still
      returns 2 from `meritFreeSum` (no regression on pre-backfill data)
- [ ] **AC-4** A character with ONLY `free_grants: { pt: 2 }` (no legacy `free_pt`)
      still returns 2 from `meritFreeSum` (no regression on clean post-backfill data)
- [ ] **AC-5** After the fix, all 20 characters with `free_grants.pt` on Contacts
      display correct dot counts (verified by Node script against live DB)

---

## Dev notes

### Do NOT change

- `freeOf` — already correct; it is the reference implementation for the fix
- `pt-evaluator.js` — writing to `free_pt` is its correct ephemeral write target;
  changing it is a separate architectural story
- `syncMeritRating` — no code change; it will automatically benefit from the fixed `meritFreeSum`
- `pruneContactsSpheres` — no code change; verify the reduced sphere cap is safe for Henry

### LEGACY_FREE_SLUGS (line 71–74, same file)

```js
const LEGACY_FREE_SLUGS = [
  'attache', 'bloodline', 'carthian', 'fwb', 'inv', 'lk', 'mci', 'mdb',
  'ohm', 'pet', 'pt', 'retainer', 'sw', 'vm',
];
```

The new `meritFreeSum` uses this same constant for the legacy-channel scan. Do not
modify the constant — it enumerates the 14 valid legacy channels exactly.

### `freeOf` reference impl (line 120–125, same file)

```js
export function freeOf(m, slug) {
  if (!m || !slug) return 0;
  const fromMap = m.free_grants && m.free_grants[slug];
  if (fromMap != null) return fromMap;   // 0 in map → returns 0, no fallback
  return m['free_' + slug] || 0;
}
```

`fromMap != null` correctly handles: `0` in map → returns 0 (map wins, not undefined);
`undefined` (slug absent from map) → falls back to legacy field. Mirror this exactly.

### Testing approach

No Playwright needed — this is a pure-function fix. Write a Node/vitest inline test or
verify via a manual Node script:

```js
// Both channels set (the bug case)
const m1 = { free_grants: { pt: 2, mci: 3 }, free_pt: 2, free_mci: 0 };
assert(meritFreeSum(m1) === 5); // was 7

// Legacy only (pre-N-2)
const m2 = { free_pt: 2 };
assert(meritFreeSum(m2) === 2); // no regression

// Map only (post-N-2)
const m3 = { free_grants: { pt: 2 }, free_pt: 0 };
assert(meritFreeSum(m3) === 2); // no regression

// Empty
assert(meritFreeSum({}) === 0);
assert(meritFreeSum(null) === 0);
```

Verify live impact with:
```js
// Run from server/ with node --input-type=module
// Check all 20 affected chars show correct totals after the fix
```

---

## Dev Agent Record

### Files to change

- `public/js/data/rules-helpers.js` — rewrite `meritFreeSum` (lines 92–100)

### Files to verify (read-only)

- `public/js/editor/domain.js` — `syncMeritRating` (line 224), `pruneContactsSpheres` (line 254)

### Files changed

- `public/js/data/rules-helpers.js` — rewrote `meritFreeSum` (lines 92–100)
- `server/tests/fix-779-merit-free-sum.test.js` — 18 vitest tests (AC-1 through AC-4, guard, edges)

### Completion notes

Rewrote `meritFreeSum` to use per-slug map-wins semantics via `freeOf`, eliminating the double-count when both `free_grants[slug]` and `free_<slug>` are simultaneously non-zero.

- 8/8 inline unit tests pass (null, empty, legacy-only, map-only, both-set, map=0-wins, multi-slug, Keeper's exact DB state)
- 25/25 existing vitest tests covering `rules-helpers` and N-1 Collective Compound pass — no regressions
- AC-5 DB audit: 20/20 characters with `free_grants.pt` on Contacts return correct `meritFreeSum` totals
- Henry St. John's Contacts: `meritFreeSum` now returns 5 (was 7)
- Pre-existing vitest failures (29) confirmed baseline — unrelated to this change (N-3 Necropolis DB-state tests)
