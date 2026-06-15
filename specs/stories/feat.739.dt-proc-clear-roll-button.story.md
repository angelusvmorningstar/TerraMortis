---
title: 'DT Processing: Clear Roll button to discard stale feeding roll result'
type: 'feature'
issue: 739
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/739
branch: ms/issue-739-dt-proc-clear-roll-button
created: '2026-06-15'
status: done
recommended_model: 'sonnet — three small, contained changes in one file'
context:
  - public/js/admin/downtime-views.js
---

## Intent

Add a "Clear Roll" button to the feeding ROLL card that discards the stored
`feeding_roll` result and returns the card to its pre-rolled state, so the ST
can re-roll at the correct pool size without a page reload.

---

## Root cause / motivation

After issues #729 and #731 fixed pool builder formula drift, a stored roll result
can still reflect a stale pool count. The only current option is a full page
reload. A "Clear Roll" button gives the ST a one-click escape hatch that nulls
the roll result, resets `pool_status` to `'confirmed'`, and re-renders the card
showing "Roll Dice Pool" at the current (correct) pool size.

---

## File locations

| File | Lines | Notes |
|------|-------|-------|
| `public/js/admin/downtime-views.js` | 8017–8109 | `_renderRollCard(key, roll, poolTotal, opts)` |
| `public/js/admin/downtime-views.js` | 8018–8028 | opts destructuring — add `clearBtnHtml` here |
| `public/js/admin/downtime-views.js` | 8077–8078 | Re-roll button render — inject `clearBtnHtml` after this line |
| `public/js/admin/downtime-views.js` | 7770–7784 | Feeding roll card call site in `_renderFeedRightPanel` |
| `public/js/admin/downtime-views.js` | 5519 | `.proc-feed-roll-btn` click handler — add sibling handler nearby |
| `public/js/admin/downtime-views.js` | 5590 | `renderProcessingMode(container)` — the re-render call to follow |

---

## Data shapes

| Field | Path | Effect of clear |
|-------|------|-----------------|
| Roll result | `submission.feeding_roll` | Set to `null` via `updateSubmission` |
| Vitae tally | `submission.feeding_vitae_tally` | Set to `null` via `updateSubmission` |
| Pool status | `feeding_review.pool_status` | Reset to `'confirmed'` via `saveEntryReview` |

---

## T1 — Add `clearBtnHtml` opt to `_renderRollCard`

**File:** `public/js/admin/downtime-views.js`

In the `opts` destructuring at line 8018, add:

```js
clearBtnHtml    = '',    // optional button HTML injected after Re-roll
```

After line 8078 (the Re-roll / Roll Dice Pool button), inject:

```js
if (clearBtnHtml) h += clearBtnHtml;
```

This keeps `_renderRollCard` generic — callers opt in per use-site.

---

## T2 — Pass `clearBtnHtml` in the feeding roll card call

**File:** `public/js/admin/downtime-views.js`  
**Location:** lines 7777–7783 — the `_renderRollCard` call inside `_renderFeedRightPanel`

Add `clearBtnHtml` to the opts:

```js
h += _renderRollCard(key, _feedRollObj, null, {
  btnClass:     'proc-feed-roll-btn',
  btnDataAttrs: ` data-sub-id="${esc(entry.subId)}" data-rote="${_isRote}"`,
  canRoll:      _showRollBtn,
  noRollMsg:    'Confirm pool first',
  showConfirm:  _poolStatus === 'pending',
  clearBtnHtml: _feedRollObj
    ? `<button class="dt-btn proc-feed-clear-roll-btn" data-sub-id="${esc(entry.subId)}" data-proc-key="${esc(key)}">Clear Roll</button>`
    : '',
});
```

The button only renders when a roll result exists (`_feedRollObj` is truthy).

---

## T3 — Wire the `.proc-feed-clear-roll-btn` click handler

**File:** `public/js/admin/downtime-views.js`  
**Location:** Add near the `.proc-feed-roll-btn` handler at line 5519.

```js
container.querySelectorAll('.proc-feed-clear-roll-btn').forEach(btn => {
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    const subId   = btn.dataset.subId;
    const procKey = btn.dataset.procKey;
    const entry   = _getQueueEntry(procKey);
    const sub     = submissions.find(s => s._id === subId);
    await updateSubmission(subId, { feeding_roll: null, feeding_vitae_tally: null });
    if (sub) { sub.feeding_roll = null; sub.feeding_vitae_tally = null; }
    if (entry) await saveEntryReview(entry, { pool_status: 'confirmed' });
    renderProcessingMode(container);
  });
});
```

`renderProcessingMode(container)` is the same re-render call used by the
roll handler (line 5590) — follow that pattern exactly.

---

## T4 — Playwright tests

New spec file: `tests/feat-739-dt-proc-clear-roll-button.spec.js`

Reuse the `setupProcessing` / `openFeedingAction` pattern from
`tests/feat-735-feed-card-terr-pill-and-override-chips.spec.js`.

Two fixtures:
- `SUB_WITH_ROLL` — submission where `feeding_roll` is populated (e.g.
  `{ successes: 1, dice_string: '[1,4,2,3,2,5,1,8]', exceptional: false, pool: 8 }`)
- `SUB_NO_ROLL` — submission where `feeding_roll` is absent / null

Tests:

- **AC-1**: Clear Roll button is visible in `.proc-feed-right` when `feeding_roll`
  is set; class `proc-feed-clear-roll-btn` present.
- **AC-2**: Clear Roll button is NOT present when `feeding_roll` is absent.
- **AC-3**: Clicking Clear Roll sends a PATCH/PUT with `feeding_roll: null`
  (capture via `page.on('request', ...)`).
- **AC-4**: After clicking Clear Roll, `proc-proj-roll-result` div is gone and
  the Roll button shows label "Roll Dice Pool" (pre-rolled state).

---

## Acceptance criteria

- [x] "Clear Roll" button appears in the feeding ROLL card when and only when a roll result exists
- [x] Clicking it PATCHes `feeding_roll: null` and `feeding_vitae_tally: null` via `updateSubmission`
- [x] `pool_status` is reset to `'confirmed'` via `saveEntryReview`
- [x] Card re-renders to pre-rolled state: result line gone, button label "Roll Dice Pool"
- [x] Button uses `dt-btn` class — consistent style with Re-roll sibling
- [x] No regression on project or merit roll cards (`_renderRollCard` change is opt-in via `clearBtnHtml`)

---

## Guardrails

- Only `public/js/admin/downtime-views.js` changes.
- `_renderRollCard` change is purely additive — `clearBtnHtml` defaults to `''` so all
  other call sites (project, merit, contested) are unaffected.
- Do NOT change the `_renderRollCard` signature (positional args `key`, `roll`, `poolTotal`,
  `opts`) — add `clearBtnHtml` inside the `opts` object only.
- Do NOT clear `feeding_review` pool builder state — only the roll result fields.

---

## Dev Agent Record

### Files changed

- `public/js/admin/downtime-views.js` — T1: added `clearBtnHtml` opt to `_renderRollCard`; T2: pass Clear Roll button in feeding call site; T3: wired `.proc-feed-clear-roll-btn` handler
- `tests/feat-739-dt-proc-clear-roll-button.spec.js` — 4 Playwright tests (AC-1 through AC-4)

### Completion notes

`clearBtnHtml` defaults to `''` in `_renderRollCard` so all project/merit/contested call sites
are unaffected. Feeding call site passes the button only when `_feedRollObj` is truthy.
Handler nulls `feeding_roll` and `feeding_vitae_tally`, resets `pool_status` to `'confirmed'`
via `saveEntryReview`, then calls `renderProcessingMode(container)` to re-render. All 4 tests pass.
