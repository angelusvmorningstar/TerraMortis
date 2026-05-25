---
title: 'DT Story: skip deleted actions in story sections and final report'
type: 'fix'
issue: 429
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/429
branch: ms/issue-429-dt-story-skip-deleted-actions
created: '2026-05-21'
status: review
recommended_model: 'sonnet — affects 5–6 call sites across two functions, needs careful index tracking'
context:
  - public/js/admin/downtime-story.js
---

## Intent

**Problem:** `downtime-story.js` has zero awareness of deleted actions. The ST can delete
player-submitted actions (stored in `sub.st_review.deleted_action_keys`) and ST-created
actions (via `st_actions[idx]._deleted = true`). The DT Processing queue already filters
these correctly via `buildProcessingQueue`. The Story tab does not: deleted merit actions
still render Copy Context cards, still count toward completion checks, and would appear in
the published report.

**Root cause — no deleted-action guard in three Story-tab code paths:**

1. `renderMeritSection` (line 2699) filters by category and `pool_status !== 'skipped'`
   but never checks `deleted_action_keys`.
2. `meritSummaryComplete` (line 2233) iterates all `merit_actions` skipping only
   `pool_status === 'skipped'`, so a deleted action without an outcome_summary returns `false`
   and blocks overall sign-off.
3. `getApplicableSections` (line 1101) `hasCategory` predicate does not exclude deleted
   actions, so sections remain visible even when all their actions are deleted.
4. `renderMeritSummary` (line 2257) groups non-skipped actions but does not skip deleted
   ones — deleted actions appear in the published summary ledger.
5. `projectResponsesComplete` (line 471) and the `project_responses` gate in
   `getApplicableSections` (line 1110) do not skip deleted project slots.

**Deletion schemas:**

| Path | Where stored | Key format |
|------|-------------|------------|
| Player-deleted merit action | `sub.st_review.deleted_action_keys[]` | `"merit:${idx}"` (0-based index into `sub.merit_actions`) |
| Player-deleted project action | `sub.st_review.deleted_action_keys[]` | `"proj:${idx}"` (0-based index into `sub.projects_resolved`) |
| ST-deleted custom action | `sub.st_actions[idx]._deleted === true` | n/a — already not part of `merit_actions`; not in scope here |

**Reference implementation:** `buildProcessingQueue` in `downtime-views.js:2802–3566`
reads `deleted_action_keys` at line 2805–2806 and filters at lines 3562–3566.

## Tasks

### T1 — Add `_isDeletedMeritAction` helper

Add near `isSectionComplete` (line 463):

```js
/** True if the merit action at index idx was player-deleted via st_review.deleted_action_keys. */
function _isDeletedMeritAction(sub, idx) {
  return (sub?.st_review?.deleted_action_keys || []).includes(`merit:${idx}`);
}
```

### T2 — Add `_isDeletedProjectAction` helper

Add adjacent to T1:

```js
/** True if the project action at index idx was player-deleted via st_review.deleted_action_keys. */
function _isDeletedProjectAction(sub, idx) {
  return (sub?.st_review?.deleted_action_keys || []).includes(`proj:${idx}`);
}
```

### T3 — `getApplicableSections`: exclude deleted from `hasCategory` and project gate

**Merit `hasCategory` predicate (line 1114–1118):**

Current:
```js
const hasCategory = (cats) => (sub?.merit_actions || []).some((a, i) => {
  const cat = deriveMeritCategory(a.merit_type);
  if (!cats.includes(cat)) return false;
  const rev = sub?.merit_actions_resolved?.[i] || {};
  return rev.pool_status !== 'skipped';
});
```

Fixed — add deleted guard as first check:
```js
const hasCategory = (cats) => (sub?.merit_actions || []).some((a, i) => {
  if (_isDeletedMeritAction(sub, i)) return false;
  const cat = deriveMeritCategory(a.merit_type);
  if (!cats.includes(cat)) return false;
  const rev = sub?.merit_actions_resolved?.[i] || {};
  return rev.pool_status !== 'skipped';
});
```

**Project gate (line 1110–1112):**

Current:
```js
if (sub?.projects_resolved?.length) {
  sections.push({ key: 'project_responses', label: 'Project Reports' });
}
```

Fixed — only add if at least one non-deleted project exists:
```js
if ((sub?.projects_resolved || []).some((_, idx) => !_isDeletedProjectAction(sub, idx))) {
  sections.push({ key: 'project_responses', label: 'Project Reports' });
}
```

### T4 — `renderMeritSection`: exclude deleted from `applicable` (line 2704–2706)

Current:
```js
const applicable = actions
  .map((a, i) => ({ a, i, rev: resolved[i] || {} }))
  .filter(({ a, rev }) => categories.includes(deriveMeritCategory(a.merit_type)) && rev.pool_status !== 'skipped');
```

Fixed:
```js
const applicable = actions
  .map((a, i) => ({ a, i, rev: resolved[i] || {} }))
  .filter(({ a, i, rev }) =>
    !_isDeletedMeritAction(sub, i) &&
    categories.includes(deriveMeritCategory(a.merit_type)) &&
    rev.pool_status !== 'skipped'
  );
```

### T5 — `meritSummaryComplete`: skip deleted in loop (line 2238)

Current:
```js
for (let i = 0; i < actions.length; i++) {
  const rev = resolved[i] || {};
  if ((rev.pool_status || '') === 'skipped') continue;
  ...
}
```

Fixed — add deleted skip immediately after loop open:
```js
for (let i = 0; i < actions.length; i++) {
  if (_isDeletedMeritAction(sub, i)) continue;
  const rev = resolved[i] || {};
  if ((rev.pool_status || '') === 'skipped') continue;
  ...
}
```

### T6 — `renderMeritSummary`: skip deleted when building groups (line 2265–2276)

Current:
```js
actions.forEach((a, i) => {
  const rev = resolved[i] || {};
  if (rev.pool_status === 'skipped') return;
  ...
});
```

Fixed:
```js
actions.forEach((a, i) => {
  if (_isDeletedMeritAction(sub, i)) return;
  const rev = resolved[i] || {};
  if (rev.pool_status === 'skipped') return;
  ...
});
```

### T7 — `projectResponsesComplete`: skip deleted project slots (line 471–476)

Current:
```js
function projectResponsesComplete(sub) {
  const resolved = sub?.projects_resolved || [];
  const responses = sub?.st_narrative?.project_responses || [];
  const applicable = resolved.filter(r => r?.pool_status !== 'skipped');
  if (!applicable.length) return false;
  return applicable.every((_, i) => responses[i]?.status === 'complete');
}
```

Fixed — filter by index so `responses[i]` stays aligned:
```js
function projectResponsesComplete(sub) {
  const resolved = sub?.projects_resolved || [];
  const responses = sub?.st_narrative?.project_responses || [];
  const applicable = resolved
    .map((r, idx) => ({ r, idx }))
    .filter(({ r, idx }) => r?.pool_status !== 'skipped' && !_isDeletedProjectAction(sub, idx));
  if (!applicable.length) return false;
  return applicable.every(({ idx }) => responses[idx]?.status === 'complete');
}
```

### T8 — Playwright spec

File: `tests/issue-429-dt-story-skip-deleted-actions.spec.js`

Use `fake-test-token` pattern (see `tests/fix-432-checklist-merit-star-icon.spec.js` for
full auth setup — notably: mock `/api/auth/me` returning ST user, no catch-all route, set
`merit_actions` directly on submission to bypass `buildMeritActions`).

**Test fixtures needed:**

- `SUB_WITH_DELETED_MERIT` — submission with one allies merit action at index 0,
  `st_review.deleted_action_keys: ['merit:0']`, `merit_actions_resolved: []`
- `SUB_WITH_ACTIVE_AND_DELETED` — submission with two merit actions, index 0 deleted,
  index 1 active with `outcome_summary` populated
- `SUB_WITH_ALL_DELETED` — all merit actions deleted; section should not appear
- `SUB_WITH_DELETED_PROJECT` — one project in `projects_resolved`, deleted via `proj:0`

**Acceptance criteria to cover (AC-1 through AC-6):**

```
AC-1: deleted merit action → no card rendered in allies section
AC-2: deleted merit action (no outcome_summary) → meritSummaryComplete still returns true
      when all remaining actions are resolved
AC-3: all merit actions deleted → merit_summary section not rendered (getApplicableSections
      excludes it)
AC-4: mixed (deleted + active) → only active action renders; section is pending until
      active action has outcome_summary
AC-5: deleted project → project_responses section not shown
AC-6: deleted merit action does not appear in published merit summary ledger
```

**Helper pattern for all tests:**

```js
async function getMeritSectionHtml(page, sectionKey) {
  return page.evaluate((key) => {
    const el = document.querySelector(`.dt-story-section[data-section="${key}"]`);
    return el ? el.innerHTML : null;
  }, sectionKey);
}
```

## Acceptance Criteria

- [ ] AC-1: A merit action matching a key in `st_review.deleted_action_keys` (e.g. `"merit:0"`) renders no card in the merit section
- [ ] AC-2: A deleted merit action without `outcome_summary` does not block `meritSummaryComplete` returning true when all remaining actions are resolved
- [ ] AC-3: If all merit actions are deleted, the `merit_summary` section does not appear and does not block sign-off
- [ ] AC-4: Mixed submissions (deleted + active) render only the active action; section completion reflects only active actions
- [ ] AC-5: A project action in `deleted_action_keys` does not appear in `project_responses` and does not block section sign-off
- [ ] AC-6: Deleted merit actions do not appear in the published merit summary ledger (final report)
- [ ] AC-7: Submissions with no deleted actions produce identical output to current behaviour (no regression)

## Dev Agent Record

_To be completed by the implementing agent._

### Tasks Completed
- [x] T1 — `_isDeletedMeritAction` helper
- [x] T2 — `_isDeletedProjectAction` helper
- [x] T3 — `getApplicableSections` merit hasCategory + project gate
- [x] T4 — `renderMeritSection` applicable filter
- [x] T5 — `meritSummaryComplete` loop guard
- [x] T6 — `renderMeritSummary` groups forEach guard
- [x] T7 — `projectResponsesComplete` deleted filter
- [x] T8 — Playwright spec (7 tests: AC-1 through AC-7)

### Notes

T1–T7 implemented in `downtime-story.js`. T8 Playwright spec covers AC-1 through AC-7 + T7
index-alignment test. 8/8 tests pass.

Note on AC-1 vs AC-3: the current codebase consolidates all merit categories into a single
`merit_summary` section (not individual `allies_actions` etc.). AC-1 (single deleted merit) and
AC-3 (all deleted) both result in `hasCategory` returning false → section absent. Both are covered.

Note on AC-4/AC-6 overlap: both use `SUB_ACTIVE_AND_DELETED`. AC-4 checks section content (status
outcome present, allies absent), AC-6 checks the specific label "Grow police network" absent from
the ledger. Kept as separate tests per story spec intent.

### File List

- `public/js/admin/downtime-story.js` — T1–T7 guards added
- `tests/fix-429-dt-story-skip-deleted-actions.spec.js` — 8 Playwright tests (AC-1 to AC-7, T7 index)

### Change Log

- 2026-05-24: Implemented T1–T7 deleted-action guards; 8 Playwright tests all pass
