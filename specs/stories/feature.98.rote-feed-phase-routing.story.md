---
issue: 317
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/317
branch: morningstar-issue-317-rote-feed-phase-routing
status: review
---

# Story feature.98: DT Processing — Rote Feed phase routing fix

## Status: review

## Story

**As an** ST processing downtimes,
**I want** all Rote / Rote Feeding project actions to appear in Step 3 — Feeding,
**so that** I can review every character's rote feeding in one place instead of hunting through Step 10 — Miscellaneous.

---

## Background

`dt-form.22` redesigned the player-facing rote feed project slot. Before that redesign, the form stored the action as `action_type: 'feed'`. After it, the form stores the action as `action_type: 'rote'`.

In `buildProcessingQueue()` (`downtime-views.js`), a special block at line 2900 routes `'feed'` submissions to `phaseNum: 1` (Step 3 — Feeding). That block predates `dt-form.22` and was never updated to also handle `'rote'`. As a result:

- Characters whose submission was saved with the old `'feed'` type (e.g. Keeper, who submitted before or during the dt-form.22 rollout) correctly appear in Step 3.
- Every character who submitted after dt-form.22 stores `'rote'`, which falls through the special block, hits `PHASE_ORDER['rote'] ?? 7` (Miscellaneous), and lands in Step 10.

The fix is a single condition expansion in the routing block combined with normalising the queue entry's `actionType` to `'feed'`, so all downstream card rendering logic (which already checks `entry.actionType === 'feed'`) continues to work without modification.

---

## Acceptance Criteria

1. A Rote / Rote Feeding project action submitted with `action_type: 'rote'` appears under Step 3 — Feeding in DT Processing, not Step 10 — Miscellaneous.
2. A Rote / Rote Feeding project action submitted with the legacy `action_type: 'feed'` continues to appear in Step 3 — no regression.
3. The action card rendered in Step 3 for a `'rote'` submission is visually identical to that of a `'feed'` submission (same label "Rote Feed", same card layout).
4. Non-Rote project actions (e.g. `patrol_scout`, `xp_spend`, `investigate`) are unaffected and remain in their correct phases.
5. Standard feeding actions (`source: 'feeding'`) are unaffected.

---

## Tasks / Subtasks

### Task 1: [x] Expand the rote-feed routing block in `buildProcessingQueue`

**File:** `public/js/admin/downtime-views.js`

**Location:** line 2900 — the `if (actionType === 'feed')` block.

**Change:**

```javascript
// BEFORE
if (actionType === 'feed') {

// AFTER
if (actionType === 'feed' || actionType === 'rote') {
```

Inside the block, the queue entry already sets:
```javascript
actionType: 'feed',
originalActionType: 'feed',
```

Change `originalActionType` to use the raw value so we preserve what the player submitted:
```javascript
actionType: 'feed',          // normalised — so all downstream feed-checks work
originalActionType: actionType, // 'feed' or 'rote' — preserves what player stored
```

No other changes to the block's content are needed.

### Task 2: [x] Write E2E tests

**File:** `tests/issue-317-rote-feed-phase-routing.spec.js`

Test scenarios (Playwright, follow the pattern from `tests/issue-315-xp-spend-breakdown.spec.js`):

1. Submission with `action_type: 'rote'` → action row appears under Step 3 (`.proc-phase-header[data-toggle-phase="feeding"]` section), NOT Step 10
2. Submission with legacy `action_type: 'feed'` → also appears in Step 3 (no regression)
3. Action row label shows "Rote Feed" for both types
4. Non-rote project action (`patrol_scout`) still appears in Step 9 — Support & Patrol, not Step 3

**Navigation pattern** (same as issue-315 tests):
- `setup()`: click `[data-domain="downtime"]`, wait for ribbon, click `#dt-phase-ribbon .pr-tab[data-phase="projects"]`
- To reach Step 3 — Feeding: `await page.locator('[data-toggle-phase="feeding"]').click()`

---

## Dev Notes

### Root cause (one-liner)

`buildProcessingQueue` line 2900: `if (actionType === 'feed')` does not handle the post-dt-form.22 value `'rote'`.

### Why only Keeper's shows correctly

Keeper's submission predates `dt-form.22` (or was shaped using the old form), so it stores `action_type: 'feed'`. Every subsequent submitter uses the current form which writes `action_type: 'rote'`.

### Downstream rendering — why normalising to `'feed'` is enough

After the queue entry is pushed, `entry.actionType` is read in several places:

| Location | Check | Effect if `'rote'` |
|---|---|---|
| `downtime-views.js:7731` | `entry.actionType === 'feed'` | Card skips Rote-Feed-specific fields |
| `downtime-views.js:3436` | `actionType === 'feed'` (isRoteFeed) | Discipline-profile miss |
| `ACTION_TYPE_LABELS` (line 134) | Key `'feed'` → `'Rote Feed'` | Label would be `undefined` for `'rote'` |

Normalising `actionType: 'feed'` in the queue entry fixes all three at once — no other file touches are needed.

### `originalActionType` preservation

We store `originalActionType: actionType` (the raw player value) on the entry so any future audit/export code can distinguish `'feed'` (legacy) from `'rote'` (current) if needed.

### Files to touch

| File | Change |
|---|---|
| `public/js/admin/downtime-views.js` | Expand routing condition at line 2900; set `originalActionType: actionType` |
| `tests/issue-317-rote-feed-phase-routing.spec.js` | New E2E test file |

### Action types reference

| Value | Source | Era |
|---|---|---|
| `'feed'` | Player form pre-dt-form.22 | Legacy |
| `'rote'` | Player form post-dt-form.22 | Current |

Both represent a project slot dedicated to rote quality feeding. They are functionally identical.

---

## Dev Agent Record

### Completion Notes

- Task 1: Expanded routing condition at `downtime-views.js:2900` from `actionType === 'feed'` to `actionType === 'feed' || actionType === 'rote'`. Updated `originalActionType` to use the raw player value (`actionType`) rather than the hardcoded `'feed'`, so legacy vs current form submissions are distinguishable for future audit/export.
- Task 2: 7 E2E Playwright tests. Fixed test 7 assertion: feeding section always renders (every submission gets a standard feeding entry per line 2780 comment), so asserted absence of "Rote Feed" label in the feeding section instead of asserting the header is absent.
- All 7 tests pass. All 4 ACs satisfied.

### File List

- `public/js/admin/downtime-views.js`
- `tests/issue-317-rote-feed-phase-routing.spec.js`
- `specs/stories/feature.98.rote-feed-phase-routing.story.md`

### Change Log

- 2026-05-15: Task 1 implemented — routing condition expanded, `originalActionType` preserved (Dev Agent)
- 2026-05-15: Task 2 implemented — 7 E2E tests, 7/7 passing (Dev Agent)

---

## References

- Issue #317: https://github.com/angelusvmorningstar/TerraMortis/issues/317
- `public/js/admin/downtime-views.js:2900` — routing block to fix
- `public/js/admin/downtime-views.js:7731` — downstream feed-specific card rendering
- `public/js/admin/downtime-views.js:3436` — isRoteFeed in discipline profile
- `public/js/admin/downtime-views.js:134` — `ACTION_TYPE_LABELS` (feed → 'Rote Feed')
- `public/js/tabs/downtime-form.js:82` — where `'rote'` is written at submission time
- `public/js/tabs/downtime-form.js:162` — `'rote': 'Rote Hunt'` player-side label
