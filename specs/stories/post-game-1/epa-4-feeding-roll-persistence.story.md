# Story EPA.4: Fix Feeding Roll State Persistence Across Player Navigation

Status: ready-for-dev

## Story

**As an** ST running feeding rolls during a live game,
**I want** a character's feeding roll state to persist when I switch to another character and return,
**so that** I don't lose locked-in results mid-session.

## Background

During the first live game (2026-04-18), the ST reported: rolling feeding for a character, locking in the result, navigating to another player, then returning to find the state wiped.

The feeding roll state is saved to `downtime_submissions.feeding_roll_player` via API when the player rolls — so the persistence mechanism is correct. The bug is that `renderFeedingTab()` in `player/feeding-tab.js` **resets all module-scope state variables to null/empty at the top of every call** (lines 56–75), regardless of whether API data will restore them.

The API fetch for `feeding_roll_player` happens asynchronously after the reset. During the async gap the tab shows a loading state. If the API call succeeds, state is restored and `feedingState = 'rolled'` is set correctly. **The actual persistence works.** The bug is likely one of:

1. The feeding tab is re-rendered from a cached (cleared) character object before the async fetch completes — leaving a stale "loading" or "ready" render.
2. The game app character selector triggers `renderFeedingTab()` with a new character, but on return it passes the same char object that has been cleared in memory.
3. The `activeCycle` check fails on return (network error or timing) causing early-exit before `feeding_roll_player` is checked.
4. The `responseSubId` (submission `_id`) is not being found on the return visit — mismatched `character_id` type comparison (string vs ObjectId).

This story identifies the exact failure path and fixes it.

## Acceptance Criteria

1. After rolling feeding for character A, switching to character B, and returning to character A — the rolled result is displayed correctly without re-rolling.
2. The "rolled" state (dice result, vessel grid, confirm panel) is fully restored from the API on each navigation to a character.
3. A character with no feeding roll shows the "ready" state (pool display + roll button) — not a blank or error state.
4. A character with no active cycle shows the "feeding not yet open" message — not an error.
5. The ST confirm panel (vitae gained / influence remaining steppers) is preserved correctly between navigation — or clearly reset to the last confirmed values.
6. No regression to the roll-and-lock flow: once a player rolls, the roll is locked and the player cannot re-roll (ST override only).

## Tasks / Subtasks

- [ ] Diagnose exact failure path (AC: #1)
  - [ ] Add `console.log` tracing to `renderFeedingTab()` entry, `getGamePhaseCycle()` result, submission lookup result, and `feeding_roll_player` check
  - [ ] Reproduce the bug: roll for char A, switch to char B, return to char A, observe logs
  - [ ] Identify which branch is being hit incorrectly on return
- [ ] Fix the identified failure path (AC: #1, #2, #3, #4)
  - [ ] **If activeCycle fails on return**: add retry/fallback — if `getGamePhaseCycle()` throws, attempt the published-submission fallback path (already exists at lines 91–111) before showing "not yet open"
  - [ ] **If character_id comparison fails**: normalise both sides to string before `.find()` — `String(s.character_id) === String(char._id)`
  - [ ] **If render races the async fetch**: ensure `render()` is only called after state is fully set — check for missing `await` or early returns
  - [ ] **If module state is shared across characters**: confirm the module-scope reset at lines 56–75 is correct — all state should be per-character, reset before each load, then repopulated by async fetch
- [ ] Harden the `_stConfirmed` session cache (AC: #5)
  - [ ] After EPA.2 lands, `_stConfirmed` in `feeding-tab.js` no longer needs to read from `localStorage['tm_st_feed_{id}']`
  - [ ] `_stConfirmed` is module-scope and survives character navigation within the same page session — confirm it is keyed by `charId` string and correctly restores the confirmed badge on return
  - [ ] If `_stConfirmed[charId]` exists on render, show the confirmed badge immediately without re-fetching
- [ ] Add defensive error handling (AC: #3, #4)
  - [ ] Wrap `getGamePhaseCycle()` in a try/catch that falls through to the published-submission path rather than showing an error state
  - [ ] If both paths fail (no cycle, no published sub), show "Feeding rolls open when the ST opens the game phase" — which is the correct message, not an error

## Dev Notes

### Key File

- `public/js/player/feeding-tab.js` — the entire feeding tab implementation (~1033 lines)

### State Reset Pattern (lines 56–75)

Every call to `renderFeedingTab(el, char)` resets all module state. This is correct — state must be per-character. The issue is that the async fetch path must correctly repopulate state before calling `render()`.

```js
// Correct reset at entry
feedingState = 'loading';
rollResult = null;
vitaeAllocation = null;
feedingRecord = null;
// etc.
```

After reset, the function fetches `activeCycle`, then fetches the submission, then checks `feeding_roll_player`. Each early-return branch must set `feedingState` and call `render()` — check that no path exits without rendering.

### character_id Comparison (line 129)

```js
// Current — may fail if one is ObjectId and other is string
mySub = subs.find(s =>
  (s.character_id === char._id || s.character_id?.toString() === char._id?.toString())
) || null;
```

This should work, but confirm both sides are stringified consistently. MongoDB ObjectIds compare by reference, not value, in JavaScript.

### Dependency on EPA.2

This story MUST be implemented AFTER EPA.2 (`epa-2-tracker-state-api-centralisation`) is complete. EPA.2 removes the `localStorage['tm_st_feed_{id}']` write from the feeding confirm. This story's task for `_stConfirmed` assumes that localStorage write is already gone.

If implementing before EPA.2: leave the `_stConfirmed` localStorage fallback read in place — just don't write to it.

### What NOT to Change

- The `doFeedingRoll()` function — roll mechanics are correct.
- The vessel allocation confirm flow — correct.
- The ST override (reset roll) — correct.
- The defer flow — correct.
- The pool builder logic — correct.

### References

- [Source: specs/architecture/system-map.md#Section 6] — Feeding roll data flow
- [Source: public/js/player/feeding-tab.js#lines 56-75] — State reset on entry
- [Source: public/js/player/feeding-tab.js#lines 125-133] — Submission lookup
- [Source: public/js/player/feeding-tab.js#lines 148-166] — feeding_roll_player check
- [Source: public/js/player/feeding-tab.js#lines 981-1013] — doFeedingRoll and API persist

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
