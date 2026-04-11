# Story feature.41: Push Cycle Wizard — Pre-Push Warnings, Open Feeding, Deadline Input

## Status: Approved

## Story

**As an** ST finalising a downtime cycle,
**I want** the Cycle Reset Wizard to require me to acknowledge unresolved submissions, explicitly confirm opening feeding, and set a deadline for the next cycle,
**so that** nothing is silently skipped and each critical step is a deliberate action.

## Background

The Cycle Reset Wizard (`openResetWizard` in `public/js/admin/downtime-views.js`) already runs a 6-phase sequence: snapshot → income → mutations → publish → tracks → new-cycle. It also shows a pre-wizard checklist that flags unreviewed submissions as advisory warnings — "Warnings are advisory. You may still proceed."

Two gaps remain from the game-cycle design:

1. **Unresolved submissions pass silently.** A submission is "unresolved" when the ST has written no reply (`st_review.outcome_visibility` is absent, `'pending'`, or `'hidden'`). The current checklist notes these as a warning but allows the wizard to proceed. The design requires the ST to explicitly acknowledge each one.

2. **Opening feeding is not part of the wizard.** After the wizard completes, the selected cycle sits at `'closed'` status. The ST must then separately select it and click "Open Game Phase" to transition it to `'game'` (which unlocks player feeding rolls). This step should be part of the wizard, not a separate manual action.

3. **New cycle has no deadline.** The wizard creates `Downtime N` with no `deadline_at`. Deadlines must be set manually by STs — no auto-calculation. The wizard should prompt for one at creation time.

### Current status flow

```
active  →  closed  →  game
           (wizard    (Open Game
           closes     Phase btn)
           here)
```

After this story, "Open Game Phase" fires inside the wizard. The existing standalone "Open Game Phase" button remains for edge cases.

---

## Acceptance Criteria

1. The pre-wizard checklist identifies each unresolved submission by player/character name.
2. Each unresolved submission has an "Acknowledge" checkbox or button the ST must tick before the "Begin Reset" button becomes active.
3. A "Dismiss all unresolved" shortcut is available if there are multiple.
4. Zero unresolved submissions → wizard begins immediately (no blocking gate needed).
5. After Phase 5 (tracks reset), the wizard pauses and asks: "Open feeding for this game phase?" with Confirm and Skip buttons.
   - Confirm → calls `openGamePhase(cycleId)` (transitions cycle `closed → game`)
   - Skip → leaves cycle at `closed`; ST can use the standalone button later
6. Phase 6 (new-cycle) prompts for the next cycle's deadline before creating it:
   - A date input (`<input type="date">`) pre-populated with today's date
   - ST may clear it and proceed without a deadline (field is optional)
   - The deadline value is passed to `createCycle()` as `deadline_at`
7. The rollback path is unaffected — if the wizard fails, rollback works as before.
8. The existing standalone "Open Game Phase" button continues to work unchanged.
9. The "New Cycle" button (which runs the wizard) is unchanged.

---

## Tasks / Subtasks

- [ ] Task 1: Blocking acknowledgement of unresolved submissions (AC: 1, 2, 3, 4)
  - [ ] In `buildWizardChecklistHtml()`, replace the advisory `pendingSubs` warning with a blocking list
  - [ ] For each pending sub, render a row: `<li class="gc-chk-block"><input type="checkbox" class="gc-dismiss-check" data-sub-id="..."> <span class="gc-chk-name">Character — Player</span></li>`
  - [ ] "Begin Reset" button starts disabled when `pendingSubs.length > 0`
  - [ ] Wire a delegated `change` listener on the checklist: enable Begin Reset when all `.gc-dismiss-check` boxes are checked
  - [ ] Add a "Dismiss all" button that checks all boxes when `pendingSubs.length > 1`

- [ ] Task 2: Open Feeding confirmation step after tracks phase (AC: 5)
  - [ ] In `runWizardPhases()`, after Phase 5 (tracks done), add a manual gate:
    - `setPhaseState(overlay, 'tracks', 'done')` (already exists)
    - Show footer prompt: "Open feeding for this game phase?" with two buttons: "Open Feeding" and "Skip"
    - If "Open Feeding": call `await openGamePhase(cycleId)`, then continue to Phase 6
    - If "Skip": continue to Phase 6 without calling `openGamePhase`
  - [ ] Add `{ id: 'open-game', label: 'Open game phase (feeding)' }` to `RESET_PHASES`
  - [ ] `setPhaseState(overlay, 'open-game', 'paused', 'Awaiting confirmation')` before showing the prompt
  - [ ] On "Open Feeding" confirm: `setPhaseState(overlay, 'open-game', 'done')`
  - [ ] On "Skip": `setPhaseState(overlay, 'open-game', 'done', 'Skipped')`

- [ ] Task 3: Deadline input in new-cycle phase (AC: 6)
  - [ ] In `runWizardPhases()`, before `createCycle(nextNum)`, pause and render a date input in the footer:
    - Label: "Set deadline for Downtime N"
    - `<input type="date" id="gc-deadline-input">` pre-populated with today's date (ISO format, date part only)
    - A "Create Cycle" confirm button
  - [ ] On confirm: read the date input value, call `createCycle(nextNum, deadlineAt)` passing the ISO string (or `null` if empty)
  - [ ] Update `createCycle()` in `public/js/downtime/db.js` to accept an optional `deadline_at` param and include it in the POST body if provided
  - [ ] `setPhaseState(overlay, 'new-cycle', 'running')` fires after the ST confirms

---

## Dev Notes

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | `buildWizardChecklistHtml`, `runWizardPhases`, `RESET_PHASES` |
| `public/js/downtime/db.js` | `createCycle(nextNum, deadlineAt?)` |

### openGamePhase is already defined

`openGamePhase(cycleId)` is defined in `public/js/downtime/db.js` and transitions a cycle from `'closed'` to `'game'`. It is called by `handleOpenGamePhase()` in downtime-views.js. Wire it directly in `runWizardPhases`.

### Unresolved submission definition

A submission is "unresolved" when `s.st_review?.outcome_visibility` is absent, `'pending'`, or `'hidden'` — i.e. the same `pendingSubs` filter already in `buildWizardChecklistHtml`:

```js
const pendingSubs = submissions.filter(s => {
  const vis = s.st_review?.outcome_visibility;
  return !vis || vis === 'pending' || vis === 'hidden';
});
```

### Character/player name for checklist rows

Use `sub.character_name` and `sub.player_name` — these are top-level fields on submission docs.

### createCycle signature

Current: `async function createCycle(gameNum)` — POSTs `{ label: 'Downtime N', game_number: N }` to `/api/downtime_cycles`. Extend to accept optional `deadline_at`:

```js
async function createCycle(gameNum, deadlineAt = null) {
  const body = { label: `Downtime ${gameNum}`, game_number: gameNum };
  if (deadlineAt) body.deadline_at = deadlineAt;
  return apiPost('/api/downtime_cycles', body);
}
```

### What this story does NOT change

- The 6 existing phases run identically — this adds 1 new phase (`open-game`) and upgrades the pre-checklist blocking logic
- Rollback logic is untouched
- The standalone "Close Cycle" and "Open Game Phase" buttons remain for manual use
- No server-side changes required (openGamePhase already uses the existing cycle PUT endpoint)

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Initial draft | Claude (SM) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
