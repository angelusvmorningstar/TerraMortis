# Story DTP-1: Privacy Scrub — projects_resolved

Status: ready-for-dev

## Story

As a player receiving my downtime results,
I should never be able to read the ST's internal notes about my actions,
so that out-of-character information stays out-of-character.

## Context

`projects_resolved` and `merit_actions_resolved` are top-level fields on the submission document — they are NOT inside `st_review` and are therefore not touched by `stripStReview`. This means `st_note` (ST shorthand for internal tracking) and `notes_thread` (threaded internal ST discussion) currently reach the player via the API response.

This must be fixed before DTP-2 ships. It is a prerequisite.

## Acceptance Criteria

1. `st_note` is absent from every entry in `projects_resolved` in the player-facing API response.
2. `notes_thread` is absent from every entry in `projects_resolved` in the player-facing API response.
3. Same scrub applies to `merit_actions_resolved` entries.
4. All other fields in `projects_resolved` (pool, roll, pool_status, st_response, player_feedback, action_type, no_roll) are preserved.
5. ST-facing API responses are unaffected (admin app still reads full data).
6. `feeding_deferred: { type: 'boolean' }` added to the submission schema (consumed by DTP-3).

## Tasks / Subtasks

- [ ] Task 1: Extend `stripStReview` to scrub internal fields (AC: 1–4)
  - [ ] In `server/helpers/strip-st-review.js`, after the existing `delete submission.st_review` line, add:
    ```js
    const SCRUB_KEYS = ['st_note', 'notes_thread', 'response_author', 'response_status'];

    function scrubResolvedArray(arr) {
      if (!Array.isArray(arr)) return;
      arr.forEach(entry => {
        if (!entry) return;
        SCRUB_KEYS.forEach(k => { delete entry[k]; });
      });
    }

    scrubResolvedArray(submission.projects_resolved);
    scrubResolvedArray(submission.merit_actions_resolved);
    ```
  - [ ] Note: `response_author` and `response_status` are also internal fields (who reviewed the response) — scrub these too

- [ ] Task 2: Add `feeding_deferred` to submission schema (AC: 6)
  - [ ] In `server/schemas/downtime_submission.schema.js`, in the top-level properties block (near `feeding_roll_player`), add:
    ```js
    feeding_deferred: { type: 'boolean' },  // Player chose to defer feeding — see Storytellers
    ```

## Dev Notes

### Why scrub response_author and response_status too

These record which ST drafted/reviewed the narrative response. Not useful to players and potentially identifying. Remove them from the player view while the admin app has full access.

### Admin app unaffected

`stripStReview` is called only in the player-facing API route (`server/routes/downtime.js`). The admin app calls the same route with ST auth — but ST auth routes bypass player-side stripping (or the admin uses a separate endpoint). Verify that the admin downtime route does NOT call `stripStReview` before shipping.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

- `server/helpers/strip-st-review.js`
- `server/schemas/downtime_submission.schema.js`
