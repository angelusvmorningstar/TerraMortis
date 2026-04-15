# Story DTQ.1: Feed Rote Project Renders in Feed Phase

Status: review

## Story

As an ST processing a downtime,
I want rote feed projects to appear in the Feed step after the standard feeding section,
so that I can review the character's extended feeding effort in the correct phase context.

## Acceptance Criteria

1. A project with `action_type === 'feed'` (rote feed) appears in the **Feed phase** of the processing queue, after the standard feeding entry for the same character.
2. The rote feed project card shows the same fields as other project cards: title, desired outcome, description, cast, and pool expression.
3. Rote feed projects do **not** appear in any other phase (they must not fall through to the default project rendering path).
4. Characters without a rote feed project are unaffected.
5. The secondary feed method field (`project_${slot}_feed_method2`) is surfaced in the card if present.

## Tasks / Subtasks

- [x] Task 1: Replace the `return` skip with a full queue push (AC: 1, 2, 3)
  - [x] In `buildProcessingQueue()` in `public/js/admin/downtime-views.js`, replaced early `return` at line 1920 with shared field extraction + queue push using `phaseNum: 1`, `phase: PHASE_NUM_TO_LABEL[1]`, `source: 'project'`, `label: 'Rote Feed'`
  - [x] All standard project fields included; `return` added after push to prevent fall-through

- [x] Task 2: Surface secondary feed method if present (AC: 5)
  - [x] Reads `resp[\`project_${slot}_feed_method2\`]`; appends `'Secondary method: {value}'` to `projDescription` via em-dash join

- [x] Task 3: Verify rendering (AC: 1–4)
  - [x] 4 E2E tests added to `tests/downtime-processing-dt-fixes.spec.js` — all 37 tests passing, zero regressions

## Dev Notes

### Exact Change Location

- **File:** `public/js/admin/downtime-views.js`
- **Function:** `buildProcessingQueue()` — projects loop starting at line 1918
- **Line to change:** 1920 — `if (actionType === 'feed') return;`

### How the Queue Works

`buildProcessingQueue()` iterates all submissions and pushes queue entry objects. Each entry has:
- `phaseNum` (int) + `phase` (string label) — determines which phase section the card renders under
- `source` — `'feeding'`, `'project'`, `'sphere'`, `'contact'`, `'retainer'` etc.

Phase 1 = `'feeding'`. The standard feeding entry (lines 1880–1901) is pushed **before** the projects loop. So pushing a feed project with `phaseNum: 1` inside the loop will append it after the standard feeding entry in the queue, which is the correct display order.

### Data Pattern to Follow

Lines 1928–1987 show the full data extraction for a normal project. The feed project replacement should follow the same pattern (slot, description, cast resolution, merits resolution) — just with `phaseNum: 1` and `source: 'feed_project'` instead of `phaseNum: PHASE_ORDER[actionType]` and `source: 'project'`.

```js
// Replace line 1920 with something like:
if (actionType === 'feed') {
  const slot = idx + 1;
  const projDescription = resp[`project_${slot}_description`] || '';
  // ... same cast + merits resolution as lines 1934–1965 ...
  queue.push({
    key: `${sub._id}:feed_proj:${idx}`,
    subId: sub._id,
    charName,
    phase: PHASE_NUM_TO_LABEL[1],
    phaseNum: 1,
    actionType: 'feed',
    label: 'Rote Feed',
    description: projDescription || proj.desired_outcome || '',
    source: 'feed_project',
    actionIdx: idx,
    projSlot: slot,
    poolPlayer: proj.primary_pool?.expression || resp[`project_${slot}_pool_expr`] || '',
    projTitle:       resp[`project_${slot}_title`]        || '',
    projOutcome:     proj.desired_outcome || resp[`project_${slot}_outcome`] || '',
    projDescription,
    projCast:        projCastResolved,
    projMerits:      projMeritsResolved,
    projTerritory:   resp[`project_${slot}_territory`]    || '',
    feedMethod2:     resp[`project_${slot}_feed_method2`] || '',
  });
  return;
}
```

### Rendering Layer

The existing rendering for `source: 'project'` entries already displays the standard project card fields. If the render switch-cases on `source`, a new `'feed_project'` branch may be needed. If it renders all queue entries generically (by field presence), it may just work. Check the rendering function that consumes the queue to confirm — add a `'feed_project'` case if needed, rendering it identically to a project card with `feedMethod2` appended when present.

### References

- Queue building: `public/js/admin/downtime-views.js` lines 1800–2000
- Standard feeding push: lines 1880–1901
- Projects loop: lines 1918–1988
- PHASE_ORDER / PHASE_NUM_TO_LABEL: lines 50–94
- Feed project detection (player form side): line 945, `hasFeedAction` flag

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Replaced early `return` for `actionType === 'feed'` in `buildProcessingQueue()` with a full queue push using `phaseNum: 1` (feeding phase). Used `source: 'project'` to get existing project detail panel rendering for free.
- Secondary feed method (`project_N_feed_method2`) appended to description via em-dash join.
- 4 E2E tests added covering: phase placement, row label, no-bleed-to-other-phases, secondary method display. All 37 tests pass.

### File List

- `public/js/admin/downtime-views.js`
- `tests/downtime-processing-dt-fixes.spec.js`
- `specs/stories/dtq.1.feed-rote-project-in-feed-phase.story.md`
