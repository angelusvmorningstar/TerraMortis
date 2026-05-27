---
issue: 479
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/479
branch: ms/issue-479-dt-influence-budget-cap
---

# fix.479 — DT form: influence spend does not enforce budget cap

**Status:** ready-for-dev

## Story

As a player filling in my downtime form,
I want the influence spend steppers to prevent me from going over my budget,
so that I cannot accidentally submit an over-budget allocation.

## Acceptance Criteria

- **AC1** — When `remaining = 0`, the `+` button on any territory with a non-negative value is disabled
- **AC2** — When `remaining = 0`, the `−` button on any territory with a non-positive value is disabled
- **AC3** — A character cannot reach a state where `Σ|influence_spend values| > budget` via the steppers
- **AC4** — Buttons that would FREE budget (reduce absolute value toward zero) remain enabled when remaining = 0
- **AC5** — The remaining counter display is consistent with actual spend at all times
- **AC6** — Existing valid submissions (within budget) render and function normally

## Tasks / Subtasks

- [x] T1 — Disable over-budget stepper buttons at render time
  - [x] T1.1 — In the `influence_grid` render block (`downtime-form.js` ~line 6761–6763), add `disabled` attribute to `+`/`−` buttons that would cause overspend
  - [x] T1.2 — In the click handler (`downtime-form.js` ~line 3221–3235), update button disabled states after each stepper click (or trigger a re-render of just the budget+buttons)
  - [x] T1.3 — Parse-check via pre-commit hook
- [x] T2 — Playwright tests for AC1–AC6
  - [x] T2.1 — Create `tests/fix-479-dt-influence-budget-cap.spec.js`
  - [x] T2.2 — Run tests and verify all pass

## Dev Notes

### What the code does today

**Render path** (`influence_grid` case, ~line 6727–6769):
- Reads saved `influence_spend` JSON from `responseDoc.responses`
- Computes `remaining = budget − Σ|values|` for the counter display
- Renders `+` and `−` buttons with `data-inf-terr` and `data-inf-dir` attributes — but **no `disabled` attribute**, ever

**Click path** (~line 3198–3248, inside the delegated `click` listener):
- Reads the current DOM value from `#inf-val-${tk}`
- Computes `newVal = currentVal + dir`
- Recomputes `totalSpent` as `Σ Math.abs` across all territories (including the prospective newVal)
- **Has an early-return guard**: `if (totalSpent > budget) return;` (line 3219)
- If allowed: updates DOM value and the budget counter in-place, calls `scheduleSave()`

**The gap:** The early-return guard silently blocks the click but gives no visual feedback — the button appears enabled and clickable. There is also no submit-time validation, so over-budget data already in the DB (like Wan Yelong's DT3 submission) can be loaded and re-submitted as-is.

### Disable rule

A button should be `disabled` when pressing it would INCREASE the absolute value of any territory and `remaining <= 0`:

```
+ button disabled when: currentVal >= 0 AND remaining <= 0
  (pressing + on a non-negative value increases absolute spend)

− button disabled when: currentVal <= 0 AND remaining <= 0
  (pressing − on a non-positive value increases absolute spend)
```

Buttons that move a value toward zero (reducing absolute spend) must always remain enabled — a character who overspent historically must be able to reduce their allocation.

### The correct render-time fix

In the `influence_grid` render loop (around line 6750), compute per-territory disabled state before building the button HTML:

```js
for (const terr of INFLUENCE_TERRITORIES) {
  const tk = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const val = infVals[tk] || 0;
  // ...existing label logic...

  const minusDisabled = val <= 0 && remaining <= 0 ? ' disabled' : '';
  const plusDisabled  = val >= 0 && remaining <= 0 ? ' disabled' : '';

  h += `<button type="button" class="dt-inf-btn"${minusDisabled} data-inf-terr="${tk}" data-inf-dir="-1">−</button>`;
  h += `<span class="dt-inf-val" id="inf-val-${tk}">${val}</span>`;
  h += `<button type="button" class="dt-inf-btn"${plusDisabled} data-inf-terr="${tk}" data-inf-dir="1">+</button>`;
}
```

### The correct click-time update

After a successful stepper click updates the DOM counter, also update the disabled state of all 10 buttons (5 territories × 2 directions) to match the new remaining value. The cleanest approach is to call a helper that re-evaluates all buttons:

```js
// After updating the budget display (line ~3238):
function refreshInfluenceButtonStates(budget, newTotalSpent) {
  const newRemaining = budget - newTotalSpent;
  for (const terr of INFLUENCE_TERRITORIES) {
    const otherTk = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const otherEl = document.getElementById(`inf-val-${otherTk}`);
    const v = otherEl ? parseInt(otherEl.textContent, 10) || 0 : 0;
    const minusBtn = document.querySelector(`[data-inf-terr="${otherTk}"][data-inf-dir="-1"]`);
    const plusBtn  = document.querySelector(`[data-inf-terr="${otherTk}"][data-inf-dir="1"]`);
    if (minusBtn) minusBtn.disabled = v <= 0 && newRemaining <= 0;
    if (plusBtn)  plusBtn.disabled  = v >= 0 && newRemaining <= 0;
  }
}
```

Call this at the end of the click handler (after `scheduleSave()`).

### File to modify

`public/js/tabs/downtime-form.js` — two locations:

1. **Render** (~line 6761–6763): add conditional `disabled` attributes (T1.1)
2. **Click handler** (~line 3238–3248): add `refreshInfluenceButtonStates` call after updating budget display (T1.2)

Do NOT change:
- `getInfluenceBudget()` — correct as-is
- The existing `if (totalSpent > budget) return;` guard — keep it as a safety net
- The `collectResponses()` / save path — no submit-time validation needed (the stepper guard is sufficient)
- Any other section of the form

### CSS

The `dt-inf-btn` class is already styled. Disabled state should be handled by the browser's native `:disabled` styling. No new CSS needed unless the disabled appearance is invisible — check visually after implementation.

### Test approach

Reuse the sandbox pattern from `tests/fix-475-feeding-vitae-pipeline.spec.js` and `tests/fix-477-vitae-tally-status-filter.spec.js`:
- Open `renderDowntimeTab` in a sandbox div
- Expand the "Territory and Influence" section
- Use a character with known influence budget (e.g., 2 influence total)

Test scenarios:
- **AC1/AC2**: Character with budget 2, spend 2 on one territory → both `+` (on non-negative) and `−` (on non-positive) buttons across all territories disabled
- **AC3**: Attempt stepper click that would go over budget → value unchanged, button visually disabled
- **AC4**: Character at budget cap with a positive value → `−` button still enabled (reduces toward zero)
- **AC5**: Counter always matches Σ|values| correctly
- **AC6**: Character with 0 influence spend → all steppers enabled, normal operation

Character: use `calcTotalInfluence` result — simplest is a character with exactly 1 Resources dot (= 1 influence). Or hardcode a character with a known influence merit.

### Relationship to existing enforcement

The click-time `if (totalSpent > budget) return;` guard (line 3219) is correct and must be preserved. This story adds the **visual layer** on top: buttons reflect their state rather than silently blocking. The guard remains as a defence-in-depth backstop.

### Known over-budget data

Wan Yelong's DT3 submission is already in the DB at -4 Academy / +6 Harbour = 10 absolute against budget 8. This is an ST data-correction task, out of scope for this story. The form will correctly load and display the -2 remaining state; the steppers will correctly disable further overspend.

## Dev Agent Record

### Debug Log

- T2.2: Tests initially failed with `waitFor` timeout because the territory section only renders in `advanced` mode (`_formMode` returns `'minimal'` by default). Fixed by adding `_mode: 'advanced'` to `buildSub` responses and replacing `waitForTimeout(400)` with `waitForSelector('#dt-btn-submit')` as the render-complete signal.

### Completion Notes

- T1.1: Added `minusDis`/`plusDis` computed attributes to the `influence_grid` render loop in `downtime-form.js`. `+` disabled when `val >= 0 && remaining <= 0`; `−` disabled when `val <= 0 && remaining <= 0`.
- T1.2: Added a post-click refresh loop after the budget counter update that re-evaluates all 10 stepper buttons (5 territories × 2 directions) against the new remaining value.
- T2: 5 Playwright tests cover AC1–AC6. All 5 pass (5/5, 11s).

## File List

- `public/js/tabs/downtime-form.js` — T1.1 render-time disabled attributes; T1.2 click-handler button refresh loop
- `tests/fix-479-dt-influence-budget-cap.spec.js` — T2 Playwright tests (AC1–AC6)
- `specs/stories/fix.479.dt-influence-budget-cap.story.md` — this file

## Change Log

- 2026-05-22: Story created from issue #479
- 2026-05-22: Implementation complete — T1 + T2 done, all tests pass
