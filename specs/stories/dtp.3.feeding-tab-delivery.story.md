# Story DTP-3: Feeding Tab — Validated Delivery

Status: ready-for-dev

## Story

As a player opening the Feeding tab when the game phase is active,
I want to roll my pre-game feeding using the ST's validated pool (with correct 9-Again / 8-Again / Rote),
so that my roll reflects what the ST approved — or I can defer to see them at game if my feeding wasn't validated.

## Context

The ST sets pool size, rote, and again (8/9/10) when rolling feeding dice in the processing panel. These are saved to `feeding_roll.params` on the submission. The player feeding tab reads `params.size` and `params.rote` but **never reads `params.again`** — so 9-again and 8-again have no effect on the player's roll. Additionally, the tab uses localStorage as a fallback lock — this is to be removed. All state persists to DB only.

## Acceptance Criteria

1. If `mySub.feeding_roll.params.size` is set (ST-validated pool): display the validated pool with Rote badge if `params.rote`, and 9-Again or 8-Again badge if `params.again` is 9 or 8 respectively.
2. The player roll uses the `params.again` value (8, 9, or 10) for dice chain re-roll threshold. Default is 10 if absent.
3. Roll-once lock is DB-only (`feeding_roll_player` on submission). localStorage is not written or read anywhere in the feeding tab.
4. If no validated pool and no submission: show generic method picker AND a "See Storytellers at Start of Game" button as a separate path.
5. Clicking "See Storytellers at Start of Game" saves `feeding_deferred: true` to the submission via `PUT /api/downtime_submissions/:id`, locks the tab with a "See your Storytellers at the start of game" message, and removes the roll option.
6. Once `feeding_deferred` is true (read from `mySub.feeding_deferred` on init), the tab shows the locked deferred message without a roll button.
7. Dramatic failure (discipline used + 0 successes) shows the "See your Storytellers at the start of game" message alongside the locked roll result — this does not set `feeding_deferred`, it is a display state derived from `rollResult.dramaticFailure`.
8. No regression on existing roll, vitae allocation, or ST re-roll behaviour.

## Tasks / Subtasks

- [ ] Task 1: Parameterise `mkDie` / `mkChain` / `rollDice` for configurable again threshold (AC: 2)
  - [ ] Replace the existing dice functions at the top of `public/js/player/feeding-tab.js`:
    ```js
    function mkDie(v, again = 10)  { return { v, s: v >= 8, x: v >= again }; }
    function mkChain(rv, again = 10) {
      const r = mkDie(rv, again); const ch = [];
      let l = r; while (l.x) { const c = mkDie(d10(), again); ch.push(c); l = c; }
      return { r, ch };
    }
    function rollDice(n, again = 10) {
      const c = []; for (let i = 0; i < n; i++) c.push(mkChain(d10(), again)); return c;
    }
    ```
  - [ ] Update `rollDiceRote` to accept and pass `again`:
    ```js
    function rollDiceRote(n, again = 10) {
      const r1 = rollDice(n, again), r2 = rollDice(n, again);
      return cntSuc(r1) >= cntSuc(r2) ? r1 : r2;
    }
    ```

- [ ] Task 2: Read `params.again` and `feeding_deferred` from `mySub` on init (AC: 1, 6)
  - [ ] After the existing `stRote` assignment (~line 136), add:
    ```js
    stAgain   = mySub.feeding_roll?.params?.again  ?? 10;
    ```
  - [ ] Add `let stAgain = 10;` to the module-level variable declarations (near `let stRote = false;`)
  - [ ] After the `feeding_roll_player` check (line ~102), add early return for deferred state:
    ```js
    if (mySub.feeding_deferred) {
      feedingState = 'deferred';
      render();
      return;
    }
    ```

- [ ] Task 3: Remove all localStorage usage (AC: 3)
  - [ ] Remove the localStorage read block (~lines 114–121):
    ```js
    // DELETE: Fall back to localStorage lock
    const lockKey = `tm_feed_rolled_${char._id}`;
    const existing = localStorage.getItem(lockKey);
    if (existing) { ... }
    ```
  - [ ] In `doFeedingRoll`, remove:
    ```js
    // DELETE: Persist to localStorage as fallback
    const lockKey = `tm_feed_rolled_${currentChar._id}`;
    localStorage.setItem(lockKey, JSON.stringify(rollResult));
    ```
  - [ ] In the ST re-roll handler, remove:
    ```js
    // DELETE:
    const lockKey = `tm_feed_rolled_${currentChar._id}`;
    localStorage.removeItem(lockKey);
    ```
  - [ ] If the DB write fails in `doFeedingRoll`, keep the existing `catch` but do NOT fall back to localStorage — stay in rolled state visually but alert the player the save failed so they can retry

- [ ] Task 4: Use `stAgain` in `doFeedingRoll` (AC: 2)
  - [ ] In `doFeedingRoll`, replace:
    ```js
    const cols = stRote ? rollDiceRote(poolTotal) : rollDice(poolTotal);
    ```
    With:
    ```js
    const cols = stRote ? rollDiceRote(poolTotal, stAgain) : rollDice(poolTotal, stAgain);
    ```
  - [ ] Store `again: stAgain` in `rollResult` for reference

- [ ] Task 5: Display 9-Again / 8-Again badge in ready state (AC: 1)
  - [ ] In `render()`, in the `feedingState === 'ready'` block, after the existing Rote badge:
    ```js
    if (stAgain === 9) h += ' <span class="feeding-again-badge">9-Again</span>';
    if (stAgain === 8) h += ' <span class="feeding-again-badge">8-Again</span>';
    ```
  - [ ] Add matching CSS in `public/css/player-layout.css` (near `.feeding-rote-badge`):
    ```css
    .feeding-again-badge {
      display: inline-block;
      font-size: 10px;
      font-family: var(--fl);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: var(--surf3);
      border: 1px solid var(--bdr);
      border-radius: 3px;
      padding: 1px 5px;
      color: var(--txt3);
      margin-left: 4px;
      vertical-align: middle;
    }
    ```

- [ ] Task 6: Add "See Storytellers" defer path for unvalidated state (AC: 4–5)
  - [ ] In `render()`, in the `feedingState === 'no_submission'` block, add a separator and defer button after the method selection UI:
    ```js
    h += '<div class="feeding-defer-row">';
    h += '<span class="feeding-defer-or">or</span>';
    h += '<button id="feeding-defer-btn" class="feeding-defer-btn">See Storytellers at Start of Game</button>';
    h += '</div>';
    ```
  - [ ] Add `feedingState === 'deferred'` render block:
    ```js
    if (feedingState === 'deferred') {
      h += '<div class="feeding-deferred-msg">See your Storytellers at the start of game.</div>';
    }
    ```
  - [ ] Wire defer button in `wireEvents()`:
    ```js
    container.querySelector('#feeding-defer-btn')?.addEventListener('click', async () => {
      if (!responseSubId) return;
      try {
        await apiPut(`/api/downtime_submissions/${responseSubId}`, { feeding_deferred: true });
        feedingState = 'deferred';
        render();
      } catch {
        alert('Could not save — please try again.');
      }
    });
    ```
  - [ ] Add CSS in `public/css/player-layout.css`:
    ```css
    .feeding-defer-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid var(--bdr);
    }
    .feeding-defer-or { font-size: 11px; color: var(--txt3); flex-shrink: 0; }
    .feeding-defer-btn {
      font-family: var(--fl);
      font-size: 12px;
      background: transparent;
      border: 1px solid var(--bdr);
      border-radius: 4px;
      color: var(--txt3);
      padding: 5px 12px;
      cursor: pointer;
    }
    .feeding-defer-btn:hover { border-color: var(--crim); color: var(--crim); }
    .feeding-deferred-msg {
      font-family: var(--fl);
      font-size: 13px;
      color: var(--result-pend);
      padding: 12px 0;
    }
    ```

## Dev Notes

### again threshold values

VtR 2e: standard = 10-again, 9-again re-rolls 9s and 10s, 8-again re-rolls 8s, 9s, and 10s. The `mkDie` `x: v >= again` condition covers all three cases. A die with value >= `again` explodes (chains a re-roll).

### Deferred vs dramatic failure

`feeding_deferred` = player chose not to roll, wants to see STs. Set on init read, locked persistently.
`dramaticFailure` = player rolled, used a discipline, got 0 successes. Derived from rollResult — not stored as a separate flag. Both show the "see your Storytellers" message but via different render paths.

### No submission still allows generic roll

If `feedingState === 'no_submission'` and the player selects a generic method, they can still roll — the defer button is an alternative, not a replacement. Both paths are available until one is chosen.

### DB write failure on roll

If `apiPut` fails during `doFeedingRoll`, stay in `feedingState = 'rolled'` but show a brief alert. Do not silently accept an unlocked result. The player can attempt to re-load or contact the ST.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

- `public/js/player/feeding-tab.js`
- `public/css/player-layout.css`
- `server/schemas/downtime_submission.schema.js` (feeding_deferred — added in DTP-1)
