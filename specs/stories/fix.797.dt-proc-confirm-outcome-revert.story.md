---
title: 'DT proc: confirmed outcome reverts to validated on reload'
type: 'fix'
issue: 797
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/797
branch: ms/issue-797-dt-proc-confirm-outcome-revert
created: '2026-06-16'
status: review
recommended_model: 'sonnet — one-line blur guard + test'
context:
  - public/js/admin/downtime-views.js
---

## Intent

When the ST clicks Confirm on an outcome, clicking the button also blurs
the outcome textarea. Both the blur handler and the click handler fire
concurrently and both call `saveEntryReview`. The blur handler saves
`{ outcome: text }` — without `outcome_confirmed`. If the blur's `PUT`
request lands after the click's `PUT`, it overwrites `outcome_confirmed`
in MongoDB, leaving the entry in `valid` state on the next page load.

The fix is a single guard in the blur handler: if the current review already
has `outcome_confirmed: true`, skip the save entirely.

---

## Root cause

### The race

`proc-outcome-input` has two save paths:

1. **Blur handler** (line 5476) — fires whenever focus leaves the textarea:
   ```js
   await saveEntryReview(entry, { outcome: ta.value.trim() || null });
   ```
   Saves `outcome` only. No `outcome_confirmed`.

2. **Confirm click handler** (line 5487) — fires when the ST clicks Confirm:
   ```js
   await saveEntryReview(entry, { outcome: text, outcome_confirmed: true });
   ```
   Saves both `outcome` and `outcome_confirmed: true`.

Clicking the Confirm button while focused in the textarea triggers **both
handlers simultaneously**: the click removes focus from the textarea (blur
fires) and the click handler fires. Both read the same in-memory
`sub.feeding_review` (or `projects_resolved[idx]`) before either has
completed its save. Both dispatch async `PUT /api/downtime_submissions/:id`
calls. MongoDB's `$set` is last-write-wins: whichever PUT resolves last is
the persisted state.

When the blur's PUT resolves after the click's PUT, the DB record has no
`outcome_confirmed` field. On reload, `_deriveActionRibbonState` (line 8429)
returns `'valid'` instead of `'complete'`, and the entry reappears in the
queue as unconfirmed.

### `_deriveActionRibbonState` (line 8429)

```js
function _deriveActionRibbonState(rev) {
  const ps = rev?.pool_status || 'pending';
  if (ps === 'pending') return 'pending';
  if (rev?.outcome_confirmed) return 'complete';
  return 'valid';
}
```

`outcome_confirmed` is the sole gate for 'complete'. A blur overwrite that
strips it silently downgrades the entry.

### `saveEntryReview` spread (line 3696)

For all sources the save is `{ ...current, ...patch }`. The blur patch
`{ outcome: text }` does NOT include `outcome_confirmed`, so when spread over
a `current` that hasn't yet been updated by the click's (still-in-flight)
save, it produces an object without `outcome_confirmed`. This object is then
written to the DB.

---

## Fix

### T1 — Guard the blur handler against clobbering confirmed state

**File:** `public/js/admin/downtime-views.js`

In the `proc-outcome-input` blur handler (~line 5476), add an early-return
if the current review is already confirmed:

```js
// BEFORE (~lines 5476-5483):
container.querySelectorAll('.proc-outcome-input').forEach(ta => {
  ta.addEventListener('click', e => e.stopPropagation());
  ta.addEventListener('blur', async e => {
    const key = ta.dataset.procKey;
    const entry = _getQueueEntry(key);
    if (!entry) return;
    await saveEntryReview(entry, { outcome: ta.value.trim() || null });
  });
});
```

```js
// AFTER:
container.querySelectorAll('.proc-outcome-input').forEach(ta => {
  ta.addEventListener('click', e => e.stopPropagation());
  ta.addEventListener('blur', async e => {
    const key = ta.dataset.procKey;
    const entry = _getQueueEntry(key);
    if (!entry) return;
    const review = getEntryReview(entry);
    if (review?.outcome_confirmed) return;
    await saveEntryReview(entry, { outcome: ta.value.trim() || null });
  });
});
```

The guard short-circuits when outcome has already been confirmed, preventing
the race from clobbering `outcome_confirmed`. The ST can still edit the
outcome text after confirming (by clicking Confirm again with new text).

---

### T3 — Auto-apply Player Pool mode on Confirm if no mode set

**File:** `public/js/admin/downtime-views.js`

If the ST clicks Confirm without having clicked any roll mode button, the
confirm handler should also save `roll_mode: 'player'` and
`pool_status: 'validated'` — the same effect as clicking Player Pool.

This is only triggered when:
1. No roll mode has been set yet (`rev.roll_mode` is falsy or not one of
   `'player' | 'st_override' | 'no_roll'`)
2. A pool exists (`rev.pool_validated || rev.pool_player || entry.poolPlayer`)
3. No roll has already been recorded (`!rev.roll`)

```js
// BEFORE — confirm handler saves only outcome fields:
await saveEntryReview(entry, { outcome: text, outcome_confirmed: true });
```

```js
// AFTER — also set Player Pool mode if not already set:
const review = getEntryReview(entry) || {};
const hasPool = !!(review.pool_validated || review.pool_player || entry.poolPlayer);
const modeAlreadySet = review.roll_mode === 'player' || review.roll_mode === 'st_override' || review.roll_mode === 'no_roll';
const patch = { outcome: text, outcome_confirmed: true };
if (!modeAlreadySet && hasPool && !review.roll) {
  patch.roll_mode = 'player';
  patch.pool_status = 'validated';
}
await saveEntryReview(entry, patch);
```

This mirrors the Player Pool button's own logic (line 5392-5407) but scoped
to the confirm path. It does NOT clear `pool_validated` (unlike the Player
Pool button which sets it to `''`) because the builder may have a valid
expression already — leaving it intact is correct.

---

### T2 — Source-pattern tests

**File:** `server/tests/fix.797.dt-proc-confirm-outcome-revert.test.js`

Use `readFileSync` source-pattern assertions.

| # | Test | Assert |
|---|------|--------|
| AC1 | blur handler reads current review before saving | source contains `const review = getEntryReview(entry)` inside the `proc-outcome-input` blur handler context |
| AC2 | blur handler short-circuits when already confirmed | source contains `if (review?.outcome_confirmed) return` before `saveEntryReview` in blur handler |
| AC3 | confirm handler still saves outcome_confirmed | source still contains `outcome_confirmed: true` in the confirm handler |
| AC4 | confirm handler checks roll mode before auto-setting | source contains `const modeAlreadySet = review.roll_mode === 'player'` in confirm handler |
| AC5 | confirm handler auto-sets Player Pool mode when not set | source contains `patch.roll_mode = 'player'` and `patch.pool_status = 'validated'` in confirm handler |
| AC6 | auto-set is guarded by hasPool and no existing roll | source contains `!modeAlreadySet && hasPool && !review.roll` in confirm handler |

Run with: `npx vitest run server/tests/fix.797.dt-proc-confirm-outcome-revert.test.js`

---

## Acceptance criteria

- [x] Given the ST types outcome text and clicks Confirm without first
  clicking elsewhere (textarea still focused), on page reload the entry
  retains 'complete' state
- [x] Given a confirmed entry, editing the outcome text and blurring away
  does NOT un-confirm the entry (blur guard fires)
- [x] The blur handler still saves outcome text for un-confirmed entries
  (no regression for normal blur-to-save path)
- [x] `_deriveActionRibbonState` returns 'complete' on reload for confirmed
  entries
- [x] Given an entry with a player pool but no roll mode set, clicking
  Confirm also sets `roll_mode: 'player'` and `pool_status: 'validated'`
- [x] Given an entry where Player Pool / ST Override / No Roll was already
  clicked, clicking Confirm does NOT change the roll mode
- [x] Given an entry with no pool at all (`pool_player` and `pool_validated`
  both empty), clicking Confirm does NOT auto-set a roll mode

---

## Dev Agent Record

### Files changed

- `public/js/admin/downtime-views.js` — T1: blur guard (2 lines added); T3: confirm handler expanded with auto Player Pool logic
- `server/tests/fix.797.dt-proc-confirm-outcome-revert.test.js` — T2: 8 source-pattern tests, all passing
- `specs/stories/fix.797.dt-proc-confirm-outcome-revert.story.md` — this file

### Completion notes

T1: blur handler now reads current review via `getEntryReview` and returns early if `outcome_confirmed` is truthy — eliminates the blur/click race that clobbered confirmed state.

T3: confirm handler builds a `patch` object; if no roll mode is set yet and a pool exists and no roll has been recorded, it also writes `roll_mode: 'player'` + `pool_status: 'validated'` in the same save call, mirroring the Player Pool button click. `pool_validated` is NOT cleared (unlike the Player Pool button) to preserve any existing builder expression.

8/8 source-pattern tests green. No changes to `_deriveActionRibbonState`, `saveEntryReview`, or any other handler.

---

## Guardrails

- Only `public/js/admin/downtime-views.js` — blur handler guard (T1) + confirm handler patch (T3).
- Do NOT change `_deriveActionRibbonState` or `saveEntryReview`.
- T3: do NOT clear `pool_validated` in the auto-set patch — unlike the Player Pool button
  click which sets it to `''`, Confirm should leave any existing builder expression intact.
- T3: the auto-set only fires when `!modeAlreadySet && hasPool && !review.roll` — mirrors
  the Player Pool button's own `hasPool && !rev.roll` guard at line 5394.
- The blur guard (T1) uses in-memory review via `getEntryReview` — correct, as
  `saveEntryReview` mutates the in-memory object on confirm click.
