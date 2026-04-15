# Story DTR-2: Contested Roll

Status: ready-for-dev

## Story

As an ST processing a project action that involves a contested roll (e.g. Mesmerise on a Rote Feed, Dominate vs. Composure),
I want to record the opposing character, build their resistance pool, roll it, and see the net result in the panel,
so that I don't have to calculate the outcome in my head and manually apply it as a success modifier.

## Acceptance Criteria

1. A "Contested" toggle appears in the project right-panel sidebar, below the Success Modifier section.
2. When the toggle is active, a character selector and a pool-label text input appear.
3. Character selector is sorted alphabetically by `sortName`. Selecting a character saves `contested_char` (sortName, lowercase) to the review.
4. The pool-label input accepts a free-text pool expression (e.g. `Resolve + BP = 4`) and saves it as `contested_pool_label`. It is display-only — no pool builder needed.
5. A "Roll Defence" button appears when both `contested_char` and `contested_pool_label` are set. Clicking it rolls the pool label's total (rightmost number after `=`) via `rollPool` and saves `contested_roll` to the review.
6. When both `roll` (attacker) and `contested_roll` (defender) are present, the roll card displays: `attacker X − defender Y = Z net`. Net display reuses the `proc-roll-net-zero` class from DTR-1 when net ≤ 0.
7. `succ_mod_manual` still applies on top of the contested net: final net = attacker − defender + manual_modifier.
8. Toggling "Contested" off clears `contested`, `contested_char`, `contested_pool_label`, and `contested_roll` from the review and re-saves.
9. No change to feeding, sorcery, or merit roll rendering.
10. E2E: 4 tests:
    - Contested toggle appears in project right panel
    - Toggling on shows character selector and pool input
    - After rolling defence, roll card shows `X − Y = Z net` format
    - Toggling off clears the contested data

## Tasks / Subtasks

- [ ] Task 1: Render the Contested toggle and sub-panel in `_renderProjRightPanel` (AC: 1–5)
  - [ ] After the `proc-proj-succ-panel` block (Success Modifier, ~line 5631), add:
    ```js
    // ── Contested Roll ──
    const isContested    = !!rev.contested;
    const contestedChar  = rev.contested_char  || '';
    const contestedPool  = rev.contested_pool_label || '';
    const contestedRoll  = rev.contested_roll  || null;
    h += `<div class="proc-proj-contested-panel" data-proc-key="${esc(key)}">`;
    h += `<div class="proc-mod-panel-title">Contested Roll</div>`;
    h += `<button class="proc-contested-toggle${isContested ? ' active' : ''}" data-proc-key="${esc(key)}">${isContested ? 'Contested — ON' : 'Mark as Contested'}</button>`;
    if (isContested) {
      // Character selector
      h += `<div class="proc-mod-row" style="margin-top:8px">`;
      h += `<span class="proc-mod-label">Opposing Char</span>`;
      h += `<select class="proc-contested-char-sel" data-proc-key="${esc(key)}">`;
      h += `<option value="">— Select —</option>`;
      for (const c of [...characters].filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)))) {
        const val = sortName(c);
        const lbl = (c.moniker || c.name);
        h += `<option value="${esc(val)}"${val === contestedChar ? ' selected' : ''}>${esc(lbl)}</option>`;
      }
      h += `</select>`;
      h += `</div>`;
      // Pool label input
      h += `<div class="proc-mod-row">`;
      h += `<span class="proc-mod-label">Resistance Pool</span>`;
      h += `<input type="text" class="proc-contested-pool-input" data-proc-key="${esc(key)}" placeholder="e.g. Resolve + BP = 4" value="${esc(contestedPool)}" />`;
      h += `</div>`;
      // Roll defence button (only when pool set)
      if (contestedPool) {
        const defBtnLabel = contestedRoll ? 'Re-roll Defence' : 'Roll Defence';
        h += `<button class="dt-btn proc-contested-roll-btn" data-proc-key="${esc(key)}">${defBtnLabel}</button>`;
        if (contestedRoll) {
          const dStr = _formatDiceString(contestedRoll.dice_string);
          h += `<div class="proc-proj-roll-result">${esc(dStr)} ${contestedRoll.successes} defence success${contestedRoll.successes !== 1 ? 'es' : ''}</div>`;
        }
      }
    }
    h += `</div>`;
    ```

- [ ] Task 2: Extend `_renderRollCard` opts with `contestedRoll` (AC: 6–7)
  - [ ] In `_renderRollCard` opts destructure (line ~5979), add:
    ```js
    contestedRoll   = null,    // ← new: from rev.contested_roll
    ```
  - [ ] In the net calculation from DTR-1 Task 1, replace the `// DTR-2: also subtract` comment with actual logic:
    ```js
    const defSuc = contestedRoll ? (contestedRoll.successes ?? 0) : 0;
    const net    = suc - defSuc + successModifier;
    const modStr = ... // derive from full net offset, not just manual modifier
    ```
  - [ ] Update the result display when contested:
    ```js
    if (contestedRoll || successModifier !== 0) {
      const defPart = contestedRoll ? ` − ${defSuc} def` : '';
      const manPart = successModifier !== 0 ? (successModifier > 0 ? ` +${successModifier}` : ` ${successModifier}`) : '';
      const netCls  = net <= 0 ? ' proc-roll-net-zero' : '';
      const netExc  = net >= 5 ? ' · Exceptional' : '';
      h += `<div class="proc-proj-roll-result${netCls}">${esc(dStr)} ${suc} att${defPart}${manPart} = ${net} net${netExc}</div>`;
    } else {
      h += `<div class="proc-proj-roll-result">${esc(dStr)} ${suc} success${suc !== 1 ? 'es' : ''}${excTag}</div>`;
    }
    ```

- [ ] Task 3: Pass `contestedRoll` from `_renderProjRightPanel` into `_renderRollCard` (AC: 6)
  - [ ] Update the `_renderRollCard` call in `_renderProjRightPanel`:
    ```js
    h += _renderRollCard(key, projRoll, null, {
      btnClass:        'proc-proj-roll-btn',
      btnDataAttrs:    ` data-pool-validated="${esc(poolValidated)}"`,
      canRoll:          showRollBtn,
      noRollMsg:       'Validate pool first',
      successModifier:  succMod,
      contestedRoll:    rev.contested_roll || null,  // ← new
    });
    ```

- [ ] Task 4: Wire event handlers in `renderProcessingMode` (AC: 3–4, 8)
  - [ ] After the travel button wiring block, add:
    ```js
    // ── Contested toggle ──
    container.querySelectorAll('.proc-contested-toggle').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const key   = btn.dataset.procKey;
        const entry = _getQueueEntry(key);
        if (!entry) return;
        const rev   = getEntryReview(entry) || {};
        if (rev.contested) {
          // Turn off — clear all contested fields
          await saveEntryReview(entry, { contested: false, contested_char: '', contested_pool_label: '', contested_roll: null });
        } else {
          await saveEntryReview(entry, { contested: true });
        }
        renderProcessingMode(container);
      });
    });

    // ── Contested char selector ──
    container.querySelectorAll('.proc-contested-char-sel').forEach(sel => {
      sel.addEventListener('change', async e => {
        const key   = sel.dataset.procKey;
        const entry = _getQueueEntry(key);
        if (!entry) return;
        await saveEntryReview(entry, { contested_char: sel.value });
        renderProcessingMode(container);
      });
    });

    // ── Contested pool label input ──
    container.querySelectorAll('.proc-contested-pool-input').forEach(input => {
      input.addEventListener('change', async e => {
        const key   = input.dataset.procKey;
        const entry = _getQueueEntry(key);
        if (!entry) return;
        await saveEntryReview(entry, { contested_pool_label: input.value.trim() });
        renderProcessingMode(container);
      });
    });

    // ── Roll defence button ──
    container.querySelectorAll('.proc-contested-roll-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const key   = btn.dataset.procKey;
        const entry = _getQueueEntry(key);
        if (!entry) return;
        const rev   = getEntryReview(entry) || {};
        const poolLabel = rev.contested_pool_label || '';
        // Extract dice total from rightmost number after '=' in pool label
        const match = poolLabel.match(/=\s*(\d+)\s*$/);
        if (!match) return;
        const poolTotal = parseInt(match[1], 10);
        if (!poolTotal || poolTotal < 1) return;
        const result = await rollPool(poolTotal, false, false, false);
        await saveEntryReview(entry, { contested_roll: result });
        renderProcessingMode(container);
      });
    });
    ```

- [ ] Task 5: CSS for contested panel (AC: 1)
  - [ ] In `public/css/admin-layout.css`, after the travel panel styles, add:
    ```css
    /* ── DTR-2: contested roll panel ───────────────────────────────── */
    .proc-proj-contested-panel {
      padding: 10px 12px;
      background: var(--surf2);
      border: 1px solid var(--bdr);
      border-left: 3px solid var(--crim);
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .proc-contested-toggle {
      padding: 5px 10px;
      background: var(--surf2);
      border: 1px solid var(--bdr);
      border-radius: 4px;
      color: var(--txt2);
      font-size: 12px;
      cursor: pointer;
      font-family: var(--ft);
    }

    .proc-contested-toggle.active {
      background: var(--crim-a25);
      border-color: var(--crim);
      color: var(--result-pend);
      font-weight: 600;
    }

    .proc-contested-pool-input {
      flex: 1;
      padding: 4px 8px;
      background: var(--surf);
      border: 1px solid var(--bdr);
      border-radius: 4px;
      color: var(--txt1);
      font-size: 12px;
      font-family: var(--ft);
    }
    ```

- [ ] Task 6: E2E tests (AC: 10)
  - [ ] Add `test.describe('DTR-2: Contested roll')` block:
    1. Contested toggle is present in project right panel
    2. Clicking toggle shows character selector and pool input
    3. After entering pool and rolling, roll card shows `X att − Y def = Z net` format
    4. Clicking toggle again hides the contested section and clears saved data

## Dev Notes

### Pool total extraction

The "Roll Defence" button extracts the pool total from the rightmost `= N` in the pool label string:
```js
const match = poolLabel.match(/=\s*(\d+)\s*$/);
```
This handles strings like `"Resolve + BP = 4"`, `"Composure 3 = 3"`, `"Resolve + Composure = 5"`.

### `rollPool` signature

From `roller.js`: `rollPool(poolSize, rote, nineAgain, eightAgain)` — returns `{ dice_string, successes, exceptional }`.

### Net formula summary

```
net = roll.successes
    - (rev.contested_roll?.successes ?? 0)
    + (rev.succ_mod_manual ?? 0)
```

### Label display in roll card

When contested only (no manual modifier):
> `[4,2,7,8] 3 att − 1 def = 2 net`

When contested + manual modifier:
> `[4,2,7,8] 3 att − 1 def −1 = 1 net`

### No pool builder — intentional

The resistance pool is entered as a free-text label (e.g. `Resolve + BP = 4`) rather than a pool builder. The ST has already looked up the defending character's stats. Adding a full pool builder for the opposing character would require loading a second character document and adds complexity that isn't warranted for what is essentially a note + dice count.

### Save fields on project review object

| Field | Type | Notes |
|-------|------|-------|
| `contested` | boolean | Toggle state |
| `contested_char` | string | sortName (lowercase) of opposing character |
| `contested_pool_label` | string | Free-text pool description |
| `contested_roll` | object | `{ dice_string, successes, exceptional }` |

All saved via `saveEntryReview(entry, patch)` → `projects_resolved[actionIdx]` merge.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `tests/downtime-processing-dt-fixes.spec.js`
- `specs/stories/dtr.2.contested-roll.story.md`
