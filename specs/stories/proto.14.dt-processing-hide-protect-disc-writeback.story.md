# Story proto.14: DT Processing — hide_protect_disc Write-Back

Status: review

## Story

As an ST,
when I validate a pool for a hide/protect action,
I want the discipline name saved as a structured field (`hide_protect_disc`) on the review object,
so future queries can find hide/protect actions by discipline without parsing text expressions.

## Acceptance Criteria

1. In `saveEntryReview`, the `merit` source branch auto-computes `hide_protect_disc` whenever `'pool_validated' in patch` and `entry.actionType === 'hide_protect'`.
2. `hide_protect_disc` is `KNOWN_DISCIPLINES.find(d => val.includes(d)) || ''` where `val = patch.pool_validated`.
3. When `pool_validated` is cleared to `''`, `hide_protect_disc` is also cleared to `''`.
4. The field is included in the merged save object alongside `pool_validated` — no separate write call required.
5. Non-hide_protect merit saves (block, investigate, etc.) are unaffected — the disc computation only fires when `entry.actionType === 'hide_protect'`.
6. Parse check clean: `node --input-type=module --check < public/js/admin/downtime-views.js`
7. No regression on feeding, project, sorcery, or other merit saves.

## Tasks / Subtasks

- [x] Extend `saveEntryReview` merit branch (AC: 1, 2, 3, 4, 5)
  - [x] In the `merit` source branch, after computing `patch`, check: if `'pool_validated' in patch` and `entry.actionType === 'hide_protect'`
  - [x] Compute `const disc = KNOWN_DISCIPLINES.find(d => (patch.pool_validated || '').includes(d)) || ''`
  - [x] Merge `hide_protect_disc: disc` into the patch before the `updateSubmission` call
  - [x] No change to any other source branch

- [x] Verify parse check and no regression (AC: 6, 7)
  - [x] `node --input-type=module --check < public/js/admin/downtime-views.js` — clean
  - [x] Confirm feeding, project, sorcery merit saves unaffected by tracing unchanged code paths

## Dev Notes

### Depends on

- proto.10: `_renderSnapshotHideProtect` already renders disc via text extraction — `hide_protect_disc` enables structured querying as a future upgrade; renderer is unchanged by this story.
- proto.task-sa: D10 gap identified (`hide_protect_disc` flagged as needed on `merit_actions_resolved[i]`).

### Implementation site

`saveEntryReview` (around line 3696 in `downtime-views.js`), in the `merit` source branch:

```js
} else if (entry.source === 'merit') {
  const resolved = [...(sub.merit_actions_resolved || [])];
  while (resolved.length <= entry.actionIdx) resolved.push(null);
  const current = resolved[entry.actionIdx] || { pool_player: entry.poolPlayer, pool_validated: '', pool_status: 'pending', notes_thread: [], story_context: '' };
  // proto.14: auto-save discipline when pool_validated is written for hide_protect actions
  if ('pool_validated' in patch && entry.actionType === 'hide_protect') {
    const disc = KNOWN_DISCIPLINES.find(d => (patch.pool_validated || '').includes(d)) || '';
    patch = { ...patch, hide_protect_disc: disc };
  }
  resolved[entry.actionIdx] = { ...current, ...patch };
  await updateSubmission(entry.subId, { merit_actions_resolved: resolved });
  sub.merit_actions_resolved = resolved;
```

### Key constraint: `patch` is a function parameter

The `patch` argument to `saveEntryReview` is the caller's object — do not mutate it. Use spread to create the enriched version:
```js
const savePatch = ('pool_validated' in patch && entry.actionType === 'hide_protect')
  ? { ...patch, hide_protect_disc: KNOWN_DISCIPLINES.find(d => (patch.pool_validated || '').includes(d)) || '' }
  : patch;
resolved[entry.actionIdx] = { ...current, ...savePatch };
```

### No UI changes

The Snapshot renderer (`_renderSnapshotHideProtect`) continues to use the KNOWN_DISCIPLINES text-extraction fallback — it still reads `getEntryReview(e)?.pool_validated`. Consumers that want the structured field can read `getEntryReview(e)?.hide_protect_disc` directly. No renderer changes in this story.

### No new CSS

### No changes to admin.js or app.js

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `saveEntryReview` merit branch extended with a 3-line spread: when `'pool_validated' in patch` and `entry.actionType === 'hide_protect'`, `savePatch` adds `hide_protect_disc` computed via `KNOWN_DISCIPLINES.find`. Clears to `''` when pool_validated is cleared. No mutation of caller's `patch` object (spread creates new object). All other source branches and non-hide_protect merit saves use `patch` unchanged. Parse check clean.
- Closes the D10 gap flagged in proto.task-sa. `_renderSnapshotHideProtect` renderer unchanged — continues to use text-extraction fallback; structured field available for future query use.

### File List

- `public/js/admin/downtime-views.js`
