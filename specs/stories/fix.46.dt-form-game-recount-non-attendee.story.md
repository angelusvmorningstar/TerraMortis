---
id: fix.46
task: 46
issue: 111
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/111
branch: morningstar-issue-111-game-recount-non-attendee
epic: epic-dt-form-mvp-redesign
status: done
priority: high
---

# Story fix.46 — DT form: Game Recount must not block non-attendees from minimum-complete submission

As a player who did not attend last session,
I should be able to reach the MINIMAL-complete bar and submit my downtime,
So that my absence at game does not make the DT form permanently incomplete.

## Context

The Court section has `gate: 'attended'` in `downtime-data.js`, which hides the entire
Court section (including Game Recount) for non-attendees. Despite the field being
hidden, `isMinimalComplete()` in `dt-completeness.js` always required `_hasAnyGameRecount()`
to pass — meaning non-attendees could never satisfy the MINIMAL bar and the banner
would never unlock for them.

Root cause: `_completenessCtx()` in `downtime-form.js` did not pass `attended` to the
completeness functions, so the functions had no way to skip the Game Recount check for
absent players.

## Files Modified

- `public/js/data/dt-completeness.js` — conditional game-recount gate
- `public/js/tabs/downtime-form.js` — `_completenessCtx()` now includes `attended`
- `tests/fix-46-game-recount-non-attendee.spec.js` — new: 3 Playwright regression tests

## Acceptance Criteria

**AC-1 — Non-attendee with all other MINIMAL fields filled is MINIMAL-complete**
Given a player did not attend last session (Court section hidden)
And has filled personal story, feeding, and project_1_action
When minimum completeness is evaluated
Then `isMinimalComplete()` returns true

**AC-2 — Non-attendee missing other fields is still incomplete**
Given a player did not attend last session
And has NOT filled personal story or project fields
When minimum completeness is evaluated
Then `isMinimalComplete()` returns false

**AC-3 — Attendee still requires Game Recount**
Given a player DID attend last session
And has left Game Recount blank
When minimum completeness is evaluated
Then `isMinimalComplete()` returns false

**AC-4 — MINIMAL mode regression: pure-function contract**
The `isMinimalComplete` and `missingMinimumPieces` exports from `dt-completeness.js`
work correctly when called directly with a synthetic responses bag and ctx.

## Implementation

### `dt-completeness.js`

Both `isMinimalComplete` and `missingMinimumPieces` destructure `attended = true` from ctx.
The Game Recount check is guarded:

```javascript
const { isRegent = false, regencyConfirmed = false, attended = true } = ctx;
// ...
if (attended && !_hasAnyGameRecount(responses)) return false;
```

Default `true` preserves backward compatibility for callers that don't pass `attended`.

### `downtime-form.js`

`_completenessCtx()` (line ~1552) adds one field:

```javascript
function _completenessCtx() {
  return {
    isRegent: gateValues.is_regent === 'yes',
    regencyConfirmed: _isRegencyConfirmedThisCycle(),
    attended: gateValues.attended === 'yes',
  };
}
```

`gateValues` is already populated from the attendance API before completeness is ever called.

## Test Plan

1. `npx playwright test tests/fix-46-game-recount-non-attendee.spec.js` — all 3 tests green.
2. `npx playwright test tests/fix-45-feeding-validation-false-block.spec.js` — no regression.

## Definition of Done

- [x] `dt-completeness.js` — `attended` guard on Game Recount check in both exports
- [x] `downtime-form.js` — `_completenessCtx()` includes `attended`
- [x] `tests/fix-46-game-recount-non-attendee.spec.js` created with 3 passing tests
- [x] AC-1: non-attendee reaches MINIMAL-complete with recount blank
- [x] AC-2: non-attendee still incomplete when other fields missing
- [x] AC-3: attendee still blocked by blank Game Recount
- [x] AC-4: pure-function direct-call tests pass
- [x] No regressions in other DT form tests

## Dev Agent Record

**Agent:** Claude (Morningstar)
**Date:** 2026-05-07

### File List

**Modified**
- `public/js/data/dt-completeness.js`
- `public/js/tabs/downtime-form.js`

**Added**
- `tests/fix-46-game-recount-non-attendee.spec.js`

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-07 | James (story) | Story created from issue #111 analysis. |
| 2026-05-07 | Claude (Morningstar) | Two-file fix + 3 Playwright regression tests. All ACs satisfied. |
