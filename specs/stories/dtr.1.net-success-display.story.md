# Story DTR-1: Net Success Display

Status: done

## Story

As an ST rolling dice for a project action,
I want the roll result to show net successes when I have set a success modifier,
so that the panel reflects what actually happened — not just the raw dice count.

## Acceptance Criteria

1. When `succ_mod_manual` is non-zero on a project action, the roll result line shows raw successes and the net in the form `3 successes − 1 = 2 net`.
2. When the modifier is 0 (or not set), the result line is unchanged from current behaviour — no "net" label appended.
3. Net successes ≤ 0 render with a muted/failure style (`proc-roll-net-zero` class) — same crimson used for ritual failures.
4. Net ≥ 5 appends the Exceptional label to the net display (raw `exceptional` flag on the roll is preserved separately — DTR-2 may override this).
5. No change to any other roll result rendering (feeding, sorcery, merit roll-inline) — only `_renderRollCard` is modified.
6. E2E: 2 tests in `tests/downtime-processing-dt-fixes.spec.js`:
   - Non-zero modifier: roll result shows "net" label and correct value
   - Zero modifier: roll result shows no "net" label

## Tasks / Subtasks

- [ ] Task 1: Add `successModifier` and `contestedRoll` options to `_renderRollCard` opts destructuring (AC: 1–4)
  - [ ] In `_renderRollCard` (line ~5978), extend the opts destructure:
    ```js
    const {
      btnClass        = 'proc-proj-roll-btn',
      btnDataAttrs    = '',
      canRoll         = true,
      noRollMsg       = 'No roll available',
      targetSuccesses = null,
      successModifier = 0,    // ← new: succ_mod_manual from rev
    } = opts;
    ```
  - [ ] In the roll result block (line ~5996–6007), replace the `else` branch (no `targetSuccesses`) with:
    ```js
    } else {
      const net    = suc + successModifier;
      const modStr = successModifier > 0 ? ` +${successModifier}` : successModifier < 0 ? ` ${successModifier}` : '';
      const netCls = (successModifier !== 0 && net <= 0) ? ' proc-roll-net-zero' : '';
      const netExc = (successModifier !== 0 && net >= 5) ? ' · Exceptional' : excTag;
      if (successModifier !== 0) {
        h += `<div class="proc-proj-roll-result${netCls}">${esc(dStr)} ${suc} success${suc !== 1 ? 'es' : ''}${modStr} = ${net} net${netExc}</div>`;
      } else {
        h += `<div class="proc-proj-roll-result">${esc(dStr)} ${suc} success${suc !== 1 ? 'es' : ''}${excTag}</div>`;
      }
    }
    ```

- [ ] Task 2: Pass `successModifier` from `_renderProjRightPanel` into `_renderRollCard` call (AC: 1)
  - [ ] In `_renderProjRightPanel` (~line 5693), update the `_renderRollCard` call:
    ```js
    h += _renderRollCard(key, projRoll, null, {
      btnClass:        'proc-proj-roll-btn',
      btnDataAttrs:    ` data-pool-validated="${esc(poolValidated)}"`,
      canRoll:          showRollBtn,
      noRollMsg:       'Validate pool first',
      successModifier:  succMod,           // ← new
    });
    ```
  - [ ] `succMod` is already computed at line ~5574: `const succMod = rev.succ_mod_manual !== undefined ? rev.succ_mod_manual : 0;`

- [ ] Task 3: Add CSS for `.proc-roll-net-zero` (AC: 3)
  - [ ] In `public/css/admin-layout.css`, after the existing `.proc-proj-roll-result` style, add:
    ```css
    .proc-proj-roll-result.proc-roll-net-zero {
      color: var(--result-pend);
    }
    ```

- [ ] Task 4: E2E tests (AC: 6)
  - [ ] In `tests/downtime-processing-dt-fixes.spec.js`, add a `test.describe('DTR-1: Net success display')` block:
    1. Set `succ_mod_manual: -1` on a project action; after rolling, result shows "net" label with correct value
    2. Set `succ_mod_manual: 0` on a project action; after rolling, result shows no "net" label

## Dev Notes

### What changes

Only `_renderRollCard` and its call site in `_renderProjRightPanel`. No other roll display functions (feeding inline roll, sorcery roll card, merit inline roll) are touched.

### `succMod` is already in scope

In `_renderProjRightPanel`, `succMod` is already computed at line ~5574:
```js
const succMod = rev.succ_mod_manual !== undefined ? rev.succ_mod_manual : 0;
```
It drives the ticker display. It just needs to be forwarded to `_renderRollCard`.

### Exceptional recalculation

Do not mutate `roll.exceptional`. That is the dice engine's raw flag (5+ before modifier). The display exception label should be derived from the net at render time only — `(net >= 5)` — so the raw flag is still visible if the ST wants to audit it.

### DTR-2 extension point

DTR-2 will add a `contestedRoll` option to `_renderRollCard` opts. At that point the net calculation becomes:
```
net = suc - contestedRoll.successes + successModifier
```
Leave a comment `// DTR-2: also subtract contestedRoll.successes when present` in the net calculation line.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `tests/downtime-processing-dt-fixes.spec.js`
- `specs/stories/dtr.1.net-success-display.story.md`
