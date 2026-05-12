---
id: hotfix.43
issue: 43
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/43
branch: angelus/issue-43-feeding-grounds-double-bonus
status: done
priority: critical
depends_on: []
labels: [bug, cycle-blocker, dt-form]
---

# Story hotfix.43 — Feeding Grounds double-counts bonus dice (+10 instead of +5)

As a player with Feeding Grounds,
I should see my feeding pool reflect the correct dot rating (N dots = +N dice),
So that I am not advantaged over other players by a data error.

---

## Context

### Root cause (identified before story authoring)

`meritEffectiveRating()` in `public/js/editor/domain.js` sums every `free_*` channel on a merit. This is correct design — each named channel (`free_mci`, `free_pt`, `free_fwb`, etc.) represents a distinct grant source.

Yusuf Kalusicj's Feeding Grounds merit in MongoDB has:

```json
{ "free": 5, "free_fwb": 5 }
```

Both are non-zero for the same 5-dot FwB grant. `meritEffectiveRating` returns `5 + 5 = 10`.

**How it happened:** When the `free_fwb` named channel was introduced (RDE epic), the auto-bonus evaluator began writing FwB bonus dots to `free_fwb` on the target merit. But the existing `free: 5` entry on Yusuf's Feeding Grounds — which represented that same FwB grant under the old convention — was never zeroed. From that point on, every save wrote back `free: 5, free_fwb: 5`.

**The auto-bonus evaluator** (`rule_engine/auto-bonus-evaluator.js`) correctly stale-clears and re-writes `free_fwb` on every render pass. It does NOT touch `free` — that field may legitimately hold manually-assigned free dots, so the evaluator cannot zero it indiscriminately.

**The fix is a data fix, not a code fix.** The calculation and auto-bonus-evaluator are both correct.

### Check scope

Other characters may have the same issue (FwB grant recorded in both `free` and `free_fwb` on the same merit). Any merit where `free > 0` AND `free_fwb > 0` on the same entry is a candidate for double-counting. The fix must check all characters, not just Yusuf.

### Files in scope

- `server/scripts/` — one-shot migration script to identify and fix affected merits (sets `free: 0` where `free_fwb > 0` and `free === free_fwb`)
- `server/tests/` — regression test asserting the corrected character shape produces the expected `effectiveDomainDots` output

### Files NOT in scope

- `public/js/editor/domain.js` — `meritEffectiveRating` is correct; do not change
- `public/js/tabs/downtime-form.js` — the feeding pool calculation is correct; do not change
- `public/js/editor/rule_engine/auto-bonus-evaluator.js` — stale-clear behaviour is correct; do not change

---

## Acceptance Criteria

**Given** Yusuf's Feeding Grounds merit has `free: 5, free_fwb: 5` in MongoDB
**When** the migration script runs
**Then** `free` is set to `0`, `free_fwb` remains `5`, `rating` is synced to `5`.

**Given** the corrected character data
**When** `effectiveDomainDots(c, 'Feeding Grounds')` is called
**Then** it returns `5`.

**Given** a character with Feeding Grounds N dots (1, 2, 3, 4, 5)
**When** the feeding pool renders
**Then** the Feeding Grounds contribution is exactly `+N` dice.

**Given** a character with no Feeding Grounds merit
**When** the feeding pool renders
**Then** no Feeding Grounds contribution appears.

**Given** any character whose merit has `free > 0` AND `free_fwb > 0` AND `free === free_fwb` (same-value double-entry)
**When** the migration script runs
**Then** that merit's `free` is zeroed and `rating` is re-synced.

**Given** the regression test fixture
**When** the test suite runs
**Then** a character with the pre-fix shape (`free: 5, free_fwb: 5`) is shown to produce the wrong result (10), and a character with the fixed shape (`free: 0, free_fwb: 5`) produces the correct result (5).

---

## Implementation Notes

### Migration script approach

Write `server/scripts/fix-feeding-grounds-double-free.js`. Pattern:

```js
// For each character, for each merit where free > 0 && free_fwb > 0 && free === free_fwb:
//   - Set free = 0
//   - Recalculate rating = cp + xp + meritFreeSum(m) with free now 0
//   - Update in MongoDB
```

The condition `free === free_fwb` tightens scope to merits where the same value was clearly double-entered. Any merit where `free !== free_fwb` but both are non-zero is ambiguous and should be flagged in the output but NOT auto-fixed.

**Run the script, print the diff, confirm before writing back.** Implement as a dry-run first (print affected merits), then a write pass.

### meritFreeSum re-implementation in script

Do not import client-side ES modules in a Node script. Re-implement the sum inline:

```js
function meritFreeSum(m) {
  return (m.free || 0) + (m.free_bloodline || 0) + (m.free_pet || 0)
    + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0)
    + (m.free_ohm || 0) + (m.free_inv || 0) + (m.free_pt || 0)
    + (m.free_mdb || 0) + (m.free_sw || 0) + (m.free_fwb || 0)
    + (m.free_attache || 0);
}
function syncMeritRating(m) {
  return (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);
}
```

### Regression test shape

The test should be a pure-function unit test (no DB) in `server/tests/`. It re-implements `meritEffectiveRating` logic for a domain merit (no shared_with branch needed) and asserts:

- `{ free: 5, free_fwb: 5 }` → 10 (demonstrates the pre-fix bug)
- `{ free: 0, free_fwb: 5 }` → 5 (demonstrates the corrected state)
- `{ free: 5, free_fwb: 0 }` → 5 (alternate correct state)
- `{ free: 0, free_fwb: 0 }` → 0 (no contribution)

---

## Test Plan

1. **Static review** — confirm root cause: Yusuf's `free: 5, free_fwb: 5` → `meritEffectiveRating` = 10.
2. **Run migration script dry-run** — print affected characters and merits.
3. **Run migration script write pass** — apply fixes to `tm_suite` via MongoDB.
4. **Run regression test** — assert pre-fix vs post-fix shapes.
5. **Browser smoke** — load Yusuf in DT form; confirm feeding pool shows `+5` Feeding Grounds, not `+10`.

---

## Definition of Done

- [x] Migration script written and executed; Yusuf's Feeding Grounds corrected in MongoDB
- [x] All characters with double-entry pattern identified and fixed (or flagged if ambiguous)
- [x] Regression test added and passing
- [ ] Browser smoke: Yusuf's feeding pool shows +5
- [x] No other feeding-pool merits regressed
- [ ] PR opened from `angelus/issue-43-feeding-grounds-double-bonus` into `dev`

## Dev Agent Record

### Implementation Notes

Root cause confirmed: Yusuf's Feeding Grounds had `free: 5, free_fwb: 5` — both set to the same value from the same FwB grant. When the `free_fwb` channel was added (RDE epic), the auto-bonus evaluator began writing to `free_fwb` but the legacy `free: 5` entry was never cleared. `meritEffectiveRating` sums all channels → returned 10.

Migration script (`server/scripts/fix-feeding-grounds-double-free.js`) dry-ran and confirmed 3 affected characters:
- Yusuf Kalusicj: Feeding Grounds free=5→0, rating=5
- Eve Lockridge: Feeding Grounds free=10→0, rating=10
- Xavier Boussade: Feeding Grounds free=5→0, rating=5

No ambiguous cases (no merits where free ≠ free_fwb but both > 0).

Write pass confirmed in MongoDB: Yusuf's Feeding Grounds now `free: 0, free_fwb: 5, rating: 5`.

No code changes — calculation and auto-bonus-evaluator are both correct.

### Files Changed

- `server/scripts/fix-feeding-grounds-double-free.js` — migration script (one-shot, run complete)
- `server/tests/feeding-grounds-double-free.test.js` — 9 regression tests (all passing)
- `specs/stories/hotfix.43-feeding-grounds-double-bonus.story.md` — story file
