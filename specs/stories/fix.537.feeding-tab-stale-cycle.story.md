# Story fix.537: Feeding tab surfaces stale confirmed roll from previous cycle

## Status: review

## Issue
[#537](https://github.com/angelusvmorningstar/TerraMortis/issues/537) — Feeding tab shows stale confirmed roll from previous cycle on new DT open

## Branch
`morningstar-issue-537-feeding-tab-stale-cycle`

---

## Story

**As a** player opening the Feeding tab at the start of a new downtime cycle,
**I want** to see a fresh/pending state (not a previous cycle's confirmed result),
**so that** I can't accidentally act on stale vitae numbers before Game 4 has occurred.

---

## Background

### Why this is high severity

The confirmed feeding roll is the **output** of downtime processing — the ST resolves it from each player's feeding section submission. It is also what a player uses to **perform their feeding at the game session**. If DT3's confirmed result appears as "Your feeding roll is ready" before Game 4 has happened, a player could act on it at the table using DT3's vitae allocation, contaminating both the in-game action and the DT4 cycle.

### Root cause (confirmed by code trace)

`public/js/tabs/feeding-tab.js` — `renderFeedingTab()` — resolves the active cycle in two steps:

**Step 1 (primary, lines 92–93):**
```js
let activeCycle = null;
try { activeCycle = await getGamePhaseCycle(); } catch { }
```
`getGamePhaseCycle()` (`downtime/db.js:116`) returns the first cycle with `status === 'game'`. DT4 is `'active'`, not `'game'`, so this returns `null`.

**Step 2 (fallback, lines 99–121):**
```js
if (!activeCycle) {
  const [allCycles, allSubs] = await Promise.all([...]);
  const charId = String(char._id);
  const candidateSub = allSubs
    .filter(s => String(s.character_id) === charId &&
      (s.published_outcome || s.feeding_roll_player || s.feeding_deferred))
    .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1))[0] || null;
  if (candidateSub) {
    activeCycle = allCycles.find(c => String(c._id) === String(candidateSub.cycle_id)) || null;
    mySub = candidateSub;
  }
}
```

This fallback scans **all** submissions across **all** cycles for the current character and picks the most recent one with a published outcome, player roll, or deferred flag. René Meyer's DT3 submission has `published_outcome` set — so the fallback finds it, sets `activeCycle = DT3`, and renders DT3's full confirmed feeding roll as current.

**The fallback has no guard against a newer non-closed cycle superseding the candidate.** When DT4 exists in any live status (`'prep'`, `'active'`, `'game'`, `'open'`), the fallback result from DT3 is stale.

### What the fallback is for (preserve this behaviour)

The fallback's original intent is: after the game phase ends and the cycle advances out of `'game'` status, a player who already performed their feeding roll (`feeding_roll_player`) should still see it. Without the fallback, `getGamePhaseCycle()` would return null and the tab would show "Feeding rolls open when the ST opens the game phase" — losing the player's roll state.

The fix must preserve this behaviour: if the candidate submission belongs to the **current** (newest non-closed) cycle, the fallback is valid and should fire. It should only be suppressed when the candidate comes from an older cycle.

---

## Acceptance Criteria

- [x] Given DT4 is the newest non-closed cycle and has no confirmed feeding roll, the Feeding tab shows: "Feeding rolls open when the Storyteller opens the game phase." — not DT3's confirmed result
- [x] Given DT3 is closed and DT4 is `'active'`, the fallback does NOT surface DT3 data
- [x] Given prior cycles are left in unexpected states (e.g. DT3 stuck in `'game'`), the fix is still robust — it uses cycle `_id` ordering as the recency check, not just status
- [x] Given a player who rolled during the current cycle's game phase (DT4 `'game'` status → post-game, cycle advanced), their `feeding_roll_player` result is still shown correctly via the fallback
- [x] DT3's confirmed result remains accessible in the Feeding history pane (right panel) — it is not deleted, just not surfaced as current

---

## Scope

**In scope**: add a "newest non-closed cycle" guard to the fallback block in `renderFeedingTab()`.

**Out of scope**:
- Changing `getGamePhaseCycle()` or `deriveCycleStatus()` — not touched
- Server routes — no server change needed
- The feeding history right-pane — must continue rendering all prior cycle rolls unchanged

---

## Dev Notes

### File to change

**`public/js/tabs/feeding-tab.js`** — the fallback block inside `renderFeedingTab()`, lines 99–121.

### Exact change

```js
// BEFORE (lines 99–121):
if (!activeCycle) {
  try {
    const [allCycles, allSubs] = await Promise.all([
      apiGet('/api/downtime_cycles'),
      apiGet('/api/downtime_submissions'),
    ]);
    allSubs.forEach(s => { /* promote published */ });
    const charId = String(char._id);
    const candidateSub = allSubs
      .filter(s => String(s.character_id) === charId &&
        (s.published_outcome || s.feeding_roll_player || s.feeding_deferred))
      .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1))[0] || null;
    if (candidateSub) {
      activeCycle = allCycles.find(c => String(c._id) === String(candidateSub.cycle_id)) || null;
      mySub = candidateSub;
    }
  } catch { }
}

// AFTER — add newestLiveCycle guard before using candidateSub:
if (!activeCycle) {
  try {
    const [allCycles, allSubs] = await Promise.all([
      apiGet('/api/downtime_cycles'),
      apiGet('/api/downtime_submissions'),
    ]);
    allSubs.forEach(s => { /* promote published — unchanged */ });
    const charId = String(char._id);
    const candidateSub = allSubs
      .filter(s => String(s.character_id) === charId &&
        (s.published_outcome || s.feeding_roll_player || s.feeding_deferred))
      .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1))[0] || null;

    // Guard: only use the candidate if its cycle is the newest non-closed cycle.
    // If a newer live cycle exists (DT4 in any status), the candidate is stale.
    const newestLiveCycle = allCycles
      .filter(c => c.status !== 'closed')
      .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1))[0] || null;

    if (candidateSub && (!newestLiveCycle || String(candidateSub.cycle_id) === String(newestLiveCycle._id))) {
      activeCycle = allCycles.find(c => String(c._id) === String(candidateSub.cycle_id)) || null;
      mySub = candidateSub;
    }
    // else: fall through → activeCycle stays null → "Feeding rolls open when ST opens game phase"
  } catch { }
}
```

### What NOT to change

- `getGamePhaseCycle()` in `downtime/db.js` — not touched
- Lines 125–134 (the `!activeCycle` render path showing "Feeding rolls open...") — this is the correct pending-state display that will now fire when the fallback is suppressed
- Lines 136–143 (submission load for the active cycle) — not touched
- Lines 147–215 (feeding state machine: `rolled`, `deferred`, `ready`, `no_submission`) — all unchanged
- The history right-pane (`renderFeedingHistoryPane`) — not touched; it renders all prior cycles' rolls independently

### Testing manually

1. Ensure DT3 is `'closed'`, DT4 is `'active'`, DT4 has no confirmed feeding roll for René Meyer.
2. Open the Game App as René Meyer → Feeding tab → should show "Feeding rolls open when the Storyteller opens the game phase."
3. Verify the history right-pane still shows DT3's confirmed roll in the archive section.
4. To test preserved fallback: set DT4 to `'game'`, simulate a player roll saved to `feeding_roll_player` on the DT4 submission, then advance DT4 to `'active'` — Feeding tab should still show the DT4 roll via fallback.
