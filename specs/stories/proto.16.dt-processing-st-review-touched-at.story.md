# Story proto.16: DT Processing — st_review_touched_at Write-Back

Status: review

## Story

As an ST,
when any pool review field is saved on a submission,
I want a `st_review.st_review_touched_at` ISO timestamp written atomically alongside the review data,
so a future live-refresh story can detect which submissions have been reviewed since last seen.

## Acceptance Criteria

1. `saveEntryReview` computes `const ts = new Date().toISOString()` immediately after the early `!sub` guard.
2. For `travel` source: `st_review_touched_at: ts` is included in the `stReview` spread object (already written atomically to `st_review`).
3. For all other source types (`feeding`, `project`, `merit`, `sorcery`, `st_created`, `acquisition`): `'st_review.st_review_touched_at': ts` is added to the `updateSubmission` call's update object, making it one atomic write with the source-specific sub-document update.
4. After all source branches (excluding the early-return `travel` branch): `sub.st_review` in-memory object is updated with `st_review_touched_at: ts`.
5. The timestamp is ISO 8601 (`new Date().toISOString()`).
6. Parse check clean: `node --input-type=module --check < public/js/admin/downtime-views.js`
7. No regression on existing save behaviour for any source type.

## Tasks / Subtasks

- [x] Add `ts` computation and wire all branches in `saveEntryReview` (AC: 1, 2, 3, 4, 5)
  - [x] Add `const ts = new Date().toISOString();` immediately after `if (!sub) return;` (line ~3666)
  - [x] Travel branch: add `st_review_touched_at: ts` to the `stReview` spread (line ~3669)
  - [x] Feeding branch: add `'st_review.st_review_touched_at': ts` to the `updateSubmission` call
  - [x] Project branch: add `'st_review.st_review_touched_at': ts` to the `updateSubmission` call
  - [x] Merit branch: add `'st_review.st_review_touched_at': ts` to the `updateSubmission` call
  - [x] Sorcery branch: add `'st_review.st_review_touched_at': ts` to the `updateSubmission` call
  - [x] st_created branch: add `'st_review.st_review_touched_at': ts` to the `updateSubmission` call
  - [x] Acquisition branch: add `'st_review.st_review_touched_at': ts` to the `updateSubmission` call
  - [x] After all branches (end of function): `if (!sub.st_review) sub.st_review = {}; sub.st_review.st_review_touched_at = ts;`

- [x] Verify parse check and no regression (AC: 6, 7)
  - [x] `node --input-type=module --check < public/js/admin/downtime-views.js` — clean
  - [x] Trace each source branch: confirm existing sub-object save still occurs unchanged alongside timestamp

## Dev Notes

### Depends on

- proto.task-sa (D1 gap): server does NOT set `updatedAt` automatically — confirmed by reading `server/routes/downtime.js` PUT handler at line 788 (`findOneAndUpdate($set: updates)` — no timestamp injection). Approach 2 required.

### Server-side confirms dot-notation mixed with top-level keys

The PUT handler does `{ $set: updates }` where `updates` is the raw request body. MongoDB `$set` accepts mixed dot-notation and top-level keys atomically. Sending `{ merit_actions_resolved: [...], 'st_review.st_review_touched_at': '...' }` sets both in one operation. ✓

### Why not a separate `updateSubmission` call per save?

A second call would double API round-trips and create a race window. Including the timestamp in the same `$set` call is atomic and has no extra cost.

### Travel branch has early return — in-memory handled differently

Travel branch sets `sub.st_review = stReview` (the full spread already includes `st_review_touched_at`), then `return`s. The end-of-function in-memory update doesn't run for travel — that's correct and safe.

### Implementation shape for each non-travel branch

Current feeding branch update:
```js
await updateSubmission(entry.subId, { feeding_review: updated });
```
After proto.16:
```js
await updateSubmission(entry.subId, { feeding_review: updated, 'st_review.st_review_touched_at': ts });
```

Same pattern for project, merit, sorcery, st_created, acquisition.

### End-of-function in-memory update

```js
// proto.16: update in-memory st_review timestamp for all non-travel branches
if (!sub.st_review) sub.st_review = {};
sub.st_review.st_review_touched_at = ts;
```

Place this after the closing `}` of the `else if (entry.source === 'acquisition')` branch.

### No UI changes, no CSS changes, no changes to admin.js or app.js

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `const ts = new Date().toISOString()` added at top of `saveEntryReview` after `!sub` guard. Travel branch: `st_review_touched_at: ts` spread into `stReview` object (full object written, `sub.st_review` updated, early return). All six other branches: `'st_review.st_review_touched_at': ts` appended to each `updateSubmission` call as a dot-notation key — atomic with source-specific sub-document write, no extra API call. End-of-function: `sub.st_review.st_review_touched_at = ts` updates in-memory state for all non-travel branches. Confirmed server `$set` handler supports mixed top-level and dot-notation keys in one operation. Parse check clean. Closes D1 gap from proto.task-sa.

### File List

- `public/js/admin/downtime-views.js`
