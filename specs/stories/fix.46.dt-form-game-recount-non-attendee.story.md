---
id: fix.46
issue: 111
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/111
branch: morningstar-issue-111-game-recount-non-attendee
status: review
---

# fix.46 — DT Form: Game Recount must not block non-attendees from minimum-complete

## Story

As a player who did not attend last game, I want to be able to submit my downtime form without a Game Recount highlight, because there is nothing for me to recount.

## Background

The minimum-complete validator in `dt-completeness.js` always requires at least one Game Recount highlight before clearing the MINIMAL bar. However, the Court section — which contains the Game Recount slot — is gated by `attended` in `downtime-data.js` and is entirely hidden for non-attendees. The result is a catch-22: the form demands a highlight the player cannot see or fill.

Reproducer: Charles Mercer-Willows, current active cycle.

## Acceptance Criteria

- **AC-1** — Given a character with no attendance for the current cycle, when they open the DT form, the minimum-complete banner does NOT include "Game Recount: add at least one highlight from last session" in its missing-pieces list.
- **AC-2** — Given the same character, when they click "Submit Downtime" with all other MINIMAL fields complete, submission succeeds (proceeds past the completeness gate) without a Game Recount highlight.
- **AC-3** — Given a character who *did* attend last game, the Game Recount requirement remains enforced — no regression.
- **AC-4** — The `isMinimalComplete` and `missingMinimumPieces` functions remain pure and DOM-free (no new side effects introduced).

---

## Root Cause

`_completenessCtx()` (`downtime-form.js` line 1552) currently returns only:

```js
function _completenessCtx() {
  return {
    isRegent: gateValues.is_regent === 'yes',
    regencyConfirmed: _isRegencyConfirmedThisCycle(),
  };
}
```

It does **not** pass `attended` into the context, so `isMinimalComplete()` and `missingMinimumPieces()` in `dt-completeness.js` have no way to know whether the character attended — and always evaluate the Game Recount check.

---

## Implementation

### File 1: `public/js/data/dt-completeness.js`

**Change 1a — Update `isMinimalComplete` JSDoc and ctx destructuring (lines 97–111):**

Update the `ctx` parameter docs and add `attended` to the destructure:

```js
/**
 * @param {object} responses
 * @param {object} [ctx]
 * @param {boolean} [ctx.isRegent]
 * @param {boolean} [ctx.regencyConfirmed]
 * @param {boolean} [ctx.attended]         — true if character attended last game
 * @returns {boolean}
 */
export function isMinimalComplete(responses, ctx = {}) {
  if (!responses || typeof responses !== 'object') return false;
  const { isRegent = false, regencyConfirmed = false, attended = true } = ctx;

  if (attended && !_hasAnyGameRecount(responses)) return false;
  if (!_hasPersonalStory(responses)) return false;
  if (!_hasFeedingComplete(responses)) return false;
  if (!_hasFirstProject(responses)) return false;
  if (isRegent && !regencyConfirmed) return false;
  return true;
}
```

Key change: `if (attended && !_hasAnyGameRecount(responses)) return false;`
The guard is only enforced when `attended` is `true`. Default is `true` so all existing callers without attendance context are unaffected.

**Change 1b — Update `missingMinimumPieces` (lines 121–157):**

Same `attended` destructure; wrap the Game Recount push:

```js
export function missingMinimumPieces(responses, ctx = {}) {
  const out = [];
  if (!responses || typeof responses !== 'object') {
    out.push({ section: 'court', label: 'Fill in your game recount' });
    out.push({ section: 'personal_story', label: 'Personal Story: pick Touchstone or Correspondence and describe it' });
    out.push({ section: 'feeding', label: 'Pick a feeding territory, method, blood type, and Kiss/Violent toggle' });
    out.push({ section: 'projects', label: 'Pick an action for Project 1' });
    return out;
  }
  const { isRegent = false, regencyConfirmed = false, attended = true } = ctx;

  if (attended && !_hasAnyGameRecount(responses)) {
    out.push({ section: 'court', label: 'Game Recount: add at least one highlight from last session' });
  }
  // ... rest unchanged
```

Only the Game Recount push is wrapped. The `!responses` fallback at the top intentionally keeps that path unmodified — it represents a degenerate state where the whole form is empty, not a non-attendee scenario.

---

### File 2: `public/js/tabs/downtime-form.js`

**Change 2a — `_completenessCtx()` (line 1552):**

Add `attended`:

```js
function _completenessCtx() {
  return {
    isRegent: gateValues.is_regent === 'yes',
    regencyConfirmed: _isRegencyConfirmedThisCycle(),
    attended: gateValues.attended === 'yes',
  };
}
```

`gateValues.attended` is already set at line 1240–1250 from the attendance API response (`att.attended ? 'yes' : 'no'`). No new data fetching required.

---

## What NOT to Change

- The Court section's `gate: 'attended'` in `downtime-data.js` — stays as-is. Non-attendees correctly do not see the Game Recount UI.
- The Court section's collection skip in `collectResponses()` (line 362) — stays as-is.
- The `validateRequiredFields()` highlight_slots check (line 1006–1016) — not in the minimum-complete path; leave it alone.
- No changes to the submission schema.
- No changes to API endpoints.

---

## Testing

Manual test with Charles Mercer-Willows in the local dev environment:
1. Load DT form for Charles (no attendance for current cycle).
2. Fill all MINIMAL fields *except* Game Recount (Court section should not be visible).
3. Verify the minimum-complete banner does not flag Game Recount as missing.
4. Click "Submit Downtime" — submission should succeed past the completeness gate.

Regression test with an attendee character:
1. Load DT form for a character who attended last game.
2. Leave Game Recount blank.
3. Verify the minimum-complete banner *does* flag Game Recount as missing.

The existing Vitest test suite in `tests/fix-45-feeding-validation-false-block.spec.js` is the closest pattern for a spec file. A new spec `tests/fix-46-game-recount-non-attendee.spec.js` should cover:
- `isMinimalComplete` returns `true` for a complete non-attendee response (no game recount)
- `missingMinimumPieces` returns empty array for same input
- `isMinimalComplete` returns `false` for an attendee response with no game recount
- `missingMinimumPieces` includes the Game Recount entry for an attendee with no game recount

---

## Dev Notes

- `gateValues` is a module-level object in `downtime-form.js`; it is populated before `_completenessCtx()` is ever called, so no timing issues.
- `attended` defaults to `true` in the ctx destructure — this preserves existing behaviour for any future callers (e.g., server-side validation) that don't supply attendance context.
- The fix is entirely in the completeness layer. No DOM changes, no section visibility changes, no submission logic changes.
- `dt-completeness.js` is a pure ESM module (no DOM, no fetch). The change keeps it pure.
