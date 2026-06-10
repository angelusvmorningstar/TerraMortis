---
title: 'Tests: fold feature96 survivors into downtime-processing.spec.js and delete the file'
type: 'fix'
issue: 615
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/615
branch: morningstar-issue-615-fold-feature96-tests
created: '2026-06-06'
status: review
recommended_model: 'sonnet — test-only, two-file diff + delete; moderate scope'
context:
  - tests/downtime-processing-feature96.spec.js
  - tests/downtime-processing.spec.js
---

## Intent

`tests/downtime-processing-feature96.spec.js` was repaired in #602 for the flat card wall but
35 of its 50 tests were retired as obsolete (they asserted `.proc-status-ribbon` and
`.proc-val-btn` subsystems that no longer exist). The 15 survivors cover real live behaviour
(roll buttons, Confirm Dice Pool, auto-merit compact panel) but are split across a 70%-skipped
file. Keeping that shell is noise. This story moves the 15 survivors into the maintained
`downtime-processing.spec.js` suite and deletes the feature96 file.

**Test-only. No product code changes.**

---

## Acceptance criteria

- [x] All 15 surviving (non-skipped) tests from `feature96` are in `downtime-processing.spec.js`.
- [x] Tests that genuinely duplicate coverage in `downtime-processing.spec.js` are dropped (not moved); document which ones are dropped and why.
- [x] `tests/downtime-processing-feature96.spec.js` is deleted.
- [x] `npx playwright test tests/downtime-processing.spec.js` passes (all green; no new skips).
- [x] No product code is modified.

---

## Pre-analysis: the 15 surviving tests

The following tests are **not** skipped in `feature96` and must be evaluated for uniqueness.
None of these assert `.proc-status-ribbon`, `.proc-val-btn`, or `.proc-pool-clear-btn`, so
all 15 are real coverage. Cross-check against `downtime-processing.spec.js` before moving.

| # | Describe block | Test name | Fixture used |
|---|----------------|-----------|--------------|
| 1 | F96-4 Auto-merit unaffected | `auto-merit action still renders compact panel (not val-status row)` | SUBMISSION_AUTO_MERIT_PENDING |
| 2 | F96-5 Roll visible from pending | `project Roll button is visible when pool_status is pending` | SUBMISSION_PROJECT_PENDING |
| 3 | F96-5 | `feeding Roll button is visible when pool_status is pending` | SUBMISSION_FEEDING_PENDING |
| 4 | F96-5 | `project Roll Dice Pool button remains visible after pool_status advances to confirmed` | SUBMISSION_PROJECT_CONFIRMED |
| 5 | F96-7 Confirm Dice Pool | `project panel shows Confirm Dice Pool button when pool_status is pending` | SUBMISSION_PROJECT_PENDING |
| 6 | F96-7 | `project Confirm Dice Pool button is labelled correctly` | SUBMISSION_PROJECT_PENDING |
| 7 | F96-7 | `project panel has NO Confirm Dice Pool button when pool_status is confirmed` | SUBMISSION_PROJECT_CONFIRMED |
| 8 | F96-7 | `feeding panel shows Confirm Dice Pool button when pool_status is pending` | SUBMISSION_FEEDING_PENDING |
| 9 | F96-7 | `project Roll Dice Pool button label is correct (first roll, no prior roll)` | SUBMISSION_PROJECT_PENDING |
| 10 | F310-2 Confirm absent | `project panel has NO Confirm Dice Pool button when pool_status is rolled` | SUBMISSION_PROJECT_ROLLED |
| 11 | F310-2 | `project panel has NO Confirm Dice Pool button when pool_status is terminal (validated)` | SUBMISSION_PROJECT_VALIDATED |
| 12 | F310-3 Confirm API write | `clicking Confirm Dice Pool on pending project triggers at least one API write` | SUBMISSION_PROJECT_PENDING (custom route) |
| 13 | F310-5 Labels | `feeding Roll Dice Pool button label is correct (first roll, no prior roll)` | SUBMISSION_FEEDING_PENDING |
| 14 | F310-5 | `project Roll button label is Re-roll when a prior roll exists` | SUBMISSION_PROJECT_ROLLED |
| 15 | F310-5 | `project Roll Dice Pool button visible from rolled state` | SUBMISSION_PROJECT_ROLLED |

**Coverage verdict:** `downtime-processing.spec.js` has no tests for `.proc-confirm-pool-btn`,
`.proc-proj-roll-btn`, `.proc-feed-roll-btn`, or `.proc-compact-merit-panel`. All 15 are
unique. Move all 15.

---

## Dev notes

### Fixture data to add to `downtime-processing.spec.js`

`downtime-processing.spec.js` does not have these fixtures. Copy them verbatim from
`feature96` (they are already defined and correct):

- `SUBMISSION_PROJECT_PENDING` — project with `projects_resolved: [{ pool_status: 'pending', pool_validated: '...' }]`
- `SUBMISSION_PROJECT_CONFIRMED` — project with `pool_status: 'confirmed'`
- `SUBMISSION_PROJECT_ROLLED` — project with `pool_status: 'rolled'` and `roll: { dice_string: '...', successes: 2 }`
- `SUBMISSION_PROJECT_VALIDATED` — project with `pool_status: 'validated'`
- `SUBMISSION_FEEDING_PENDING` — feeding with `pool_status: 'pending'`
- `SUBMISSION_AUTO_MERIT_PENDING` — merit action `ambience_decrease`, no `projects_resolved`

Add these alongside the existing fixtures at the top of `downtime-processing.spec.js`,
keeping the `CHAR_PT4` / `CHAR_OTHER` / `TEST_CYCLE` constants that are already there.

**Do not replace the existing `SUBMISSION_FEEDING`.** The existing fixture has
`pool_status: 'validated'` and is used by the feeding panel toggle tests. The new
`SUBMISSION_FEEDING_PENDING` is a separate object.

### Helper function: `openActionInPhase` vs `openFirstAction`

`downtime-processing.spec.js` uses `openActionInPhase(page, phaseKey)` where `phaseKey`
is the raw filter pill value. Replace every `openFirstAction(page, label)` call with the
correct `openActionInPhase` call using this map:

| feature96 call | replacement |
|----------------|-------------|
| `openFirstAction(page, 'Ambience')` | `openActionInPhase(page, 'ambience')` |
| `openFirstAction(page, 'Feeding')` | `openActionInPhase(page, 'feeding')` |

The auto-merit test (#1) also calls `openFirstAction(page, 'Ambience')` — `ambience_decrease`
routes to the ambience phase, so `openActionInPhase(page, 'ambience')` is correct.

**Note:** `openFirstAction` conditionally clicked the pill (skipped if pill not found).
`openActionInPhase` always clicks it. For the 5 new fixture types listed above, the ambience
or feeding pill always exists, so this is safe.

### Test #12 — custom route handler

F310-3 contains its own inline `page.addInitScript` + `page.route` block (it needs to
capture write counts). Preserve this inline approach — do not try to adapt it to use the
shared `setupDowntimeProcessing` helper. Copy it verbatim, replacing the
`openFirstAction` call inside.

### `setupDowntimeProcessing` signature

`feature96`'s `setupDowntimeProcessing` takes a second `chars` param (defaults to
`[CHAR_PT4]`). `downtime-processing.spec.js`'s version does not. When migrating tests,
call the existing `setupDowntimeProcessing(page, submission)` — it always serves
`[CHAR_PT4, CHAR_OTHER]` which is a superset, and the migrated tests don't depend on
`chars` being exactly one character.

### Structure in `downtime-processing.spec.js`

Add the migrated tests as new `test.describe` blocks at the bottom of the file, preserving
the original F-code describe names and test strings. This makes git-blame tracing easier
and avoids disturbing the existing test order.

Example structure:
```js
// ── Migrated from feature96 (#615) ────────────────────────────────────────────

test.describe('F96-4: Auto-merit compact panel unaffected by flat card wall', () => {
  test('auto-merit action still renders compact panel (not val-status row)', ...);
});

test.describe('F96-5: Roll buttons visible from pending state', () => { ... });

test.describe('F96-7 / F310-2 / F310-3 / F310-5: Confirm Dice Pool + Roll button states', () => { ... });
```

Feel free to group F96-7, F310-2, F310-3 and F310-5 into one describe if they share the
same fixture setup — just keep the original test names intact.

---

## Out of scope

- The 35 already-retired (skipped) tests — they stay gone.
- `dt-vitae-projection.spec.js` flakiness — tracked in #613.
- Remaining flat-wall-broken specs — tracked in #614.
- Any product code change.

---

## Files to modify

| File | Change |
|------|--------|
| `tests/downtime-processing.spec.js` | Add 6 fixtures + 15 tests at bottom |
| `tests/downtime-processing-feature96.spec.js` | **Delete** |
