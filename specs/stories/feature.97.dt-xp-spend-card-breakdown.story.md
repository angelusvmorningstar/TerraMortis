---
issue: 315
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/315
branch: morningstar-issue-315-dt-xp-spend-breakdown
status: review
---

# Story feature.97: DT Processing — XP Spend card structured breakdown

## Status: review

## Story

**As an** ST processing a player's XP Spend downtime action,
**I want** the action card to show me each requested purchase with its cost, the player's budget, and what they'd have left,
**so that** I can review and approve XP spends without navigating away to the player's submitted form.

---

## Background

The DT Processing view in ST Admin renders each action as a card. For XP Spend actions, the card currently shows a flat summary string built by joining raw item identifiers:

```
XP Spend  merit: Haven|grad|0|3 (1 dot) — discipline: Auspex — skill: Socialise — skill: Investigation
```

This string is unreadable: raw merit keys (`Haven|grad|0|3`), no XP costs, no dot transitions, no budget context. To understand the actual request the ST must open the player's submission form in a separate tab.

The player's submission form already displays all of this information (see issue #315 screenshots):
- Category, trait name, current→target transition, per-item XP cost
- Slot total, cycle budget, XP remaining

This feature brings that same information into the ST-facing processing card as a structured read-only table.

---

## Acceptance Criteria

1. The XP Spend action card in DT Processing displays each spend item as a structured row: **category label**, **trait name** (human-readable, not raw merit key), **current→target transition**, and **XP cost** for that item.
2. A totals section below the rows shows: **Total XP requested**, **Cycle budget (XP available)**, **XP remaining** (budget − total).
3. If the spend exceeds the budget (edge case — player-side validation should prevent it, but display it correctly if it occurs), the remaining figure is rendered in a warning colour (red / `--crim`).
4. Data is sourced from the stored `xp_spend` data in the submission (`project_${n}_xp_rows`) — no re-parsing of the flat summary string, no character data lookups at ST render time.
5. XP cost per row is read from a `xpCost` field stored on each row at player-submission time. Existing submissions without `xpCost` gracefully fall back to displaying the row without a cost figure (not an error).
6. Cycle budget is read from a `xp_budget_snapshot` field stored in responses at player-submission time. If absent (legacy submissions), the totals section is omitted rather than showing a wrong number.
7. Human-readable trait names are derived from the `item` field: merit items strip the `|grad|...|...` suffix and display only the name portion.
8. ST does not need to navigate away from the processing view to see any of this.

---

## Tasks / Subtasks

### Task 1: [x] Extend `xp_rows` to store `xpCost` per row

**File:** `public/js/tabs/downtime-form.js`

At line ~648 where rows are pushed for `project_${n}_xp_rows`:

```javascript
// BEFORE
if (category) rows.push({ category, item, dotsBuying });

// AFTER
if (category) {
  const xpCost = getRowCost({ category, item, dotsBuying });
  rows.push({ category, item, dotsBuying, xpCost });
}
```

`getRowCost` is already defined in the same file (line 4216) and already has access to `currentChar` via `isClanDisc` for correct clan vs out-of-clan discipline pricing. No new logic needed.

### Task 2: [x] Store `xp_budget_snapshot` at submission time

**File:** `public/js/tabs/downtime-form.js`

In `collectResponses()` (the function that builds the full responses object before saving/submitting), after the xp_rows loop has run, store the current XP budget:

```javascript
// After xp_rows are built — store budget snapshot for ST view
const hasXpSpend = [1, 2, 3, 4].some(n => responses[`project_${n}_action`] === 'xp_spend');
if (hasXpSpend) {
  responses.xp_budget_snapshot = xpLeft(currentChar);
}
```

`xpLeft(currentChar)` is already called nearby for validation (line 1151). This snapshot captures the player's budget at the moment of submission so the ST view is not dependent on character state at processing time.

### Task 3: [x] Allow new fields through server schema

**File:** `server/schemas/downtime_submission.schema.js`

Add one new top-level field:

```javascript
xp_budget_snapshot: { type: 'number', optional: true },
```

The `xpCost` field is embedded inside the JSON string value of `project_${n}_xp_rows` and is schema-transparent (no schema change needed for it).

### Task 4: [x] Pass xp_rows and budget snapshot through the queue entry

**File:** `public/js/admin/downtime-views.js`

In `buildProcessingQueue()`, at the xp_spend block (lines ~2980–3003), parse the xp_rows and attach to the queue entry:

```javascript
let _xpRows = [];
let _xpBudgetSnapshot = null;

if (effectiveActionType === 'xp_spend') {
  const _rj = resp[`project_${slot}_xp_rows`] || '';
  if (_rj) {
    try { _xpRows = JSON.parse(_rj).filter(r => r && (r.category || r.item)); } catch { /* fall through */ }
  }
  const snap = resp.xp_budget_snapshot;
  if (typeof snap === 'number') _xpBudgetSnapshot = snap;
  // Legacy flat string fallback (keep for submissions without xp_rows)
  if (!_xpRows.length) { /* existing single-row fallback, unchanged */ }
}
```

Add to the queue entry object:
```javascript
projXpRows:           _xpRows,
projXpBudgetSnapshot: _xpBudgetSnapshot,
```

Keep `projXpBreakdown` on the entry as a legacy fallback for submissions pre-dating this feature.

### Task 5: [x] Render structured breakdown in the action card

**File:** `public/js/admin/downtime-views.js`

At line ~7705, replace the flat string line:
```javascript
if (entry.projXpBreakdown) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">XP Spend</span> ${esc(entry.projXpBreakdown)}</div>`;
```

With a conditional that renders a table when structured data is available, or falls back to the flat string:

```javascript
if (entry.projXpRows && entry.projXpRows.length) {
  h += _renderXpSpendBreakdown(entry.projXpRows, entry.projXpBudgetSnapshot);
} else if (entry.projXpBreakdown) {
  h += `<div class="proc-proj-field"><span class="proc-feed-lbl">XP Spend</span> ${esc(entry.projXpBreakdown)}</div>`;
}
```

### Task 6: [x] Implement `_renderXpSpendBreakdown(rows, budget)`

**File:** `public/js/admin/downtime-views.js`

Add a new private helper function. Place it near other `_render*` helpers in the file.

**Row display rules:**

- `category`: use `ACTION_TYPE_LABELS` or a local label map to convert `'discipline'` → `'Discipline'`, `'merit'` → `'Merit'`, etc.
- `item` (trait name): for merits, strip the pipe-delimited suffix. `'Haven|grad|0|3'` → `'Haven'`. For everything else, use as-is.
- Transition: for rows with `dotsBuying`, show `(+${dotsBuying} dot${dotsBuying === 1 ? '' : 's'})`. If the item encodes current dots (merit `|grad|currentDots|max`), show `(${currentDots} → ${currentDots + dotsBuying})` instead.
- Cost: if `row.xpCost` is present and > 0, show `${row.xpCost} XP`. If absent (legacy row), show nothing.

**Totals section:**

```
Total XP:   <sum of row.xpCost for rows that have it>  XP
Budget:     <budget> XP available          (omit entire totals block if budget === null)
Remaining:  <budget - total> XP            (red if negative)
```

**Markup sketch** (use existing `proc-proj-field`, `proc-feed-lbl` classes; add `proc-xp-table` for the list):

```html
<div class="proc-proj-field proc-xp-breakdown">
  <span class="proc-feed-lbl">XP Spend</span>
  <table class="proc-xp-table">
    <tbody>
      <tr><td class="proc-xp-cat">Merit</td><td class="proc-xp-trait">Haven (0 → 1)</td><td class="proc-xp-cost">1 XP</td></tr>
      <tr><td class="proc-xp-cat">Discipline</td><td class="proc-xp-trait">Auspex (1 → 2)</td><td class="proc-xp-cost">3 XP</td></tr>
      <tr><td class="proc-xp-cat">Skill</td><td class="proc-xp-trait">Socialise (2 → 3)</td><td class="proc-xp-cost">2 XP</td></tr>
      <tr><td class="proc-xp-cat">Skill</td><td class="proc-xp-trait">Investigation (3 → 4)</td><td class="proc-xp-cost">2 XP</td></tr>
    </tbody>
    <tfoot class="proc-xp-totals">
      <tr><td colspan="2">Total</td><td>8 XP</td></tr>
      <tr><td colspan="2">Budget</td><td>13 XP available</td></tr>
      <tr><td colspan="2">Remaining</td><td>5 XP</td></tr>  <!-- red if negative -->
    </tfoot>
  </table>
</div>
```

### Task 7: [x] CSS for the breakdown table

**File:** `public/css/admin-dt-processing.css` (or the active DT processing stylesheet — confirm location)

Add minimal styles scoped to `.proc-xp-table`:

```css
.proc-xp-breakdown { align-items: flex-start; }
.proc-xp-table { border-collapse: collapse; margin-top: 4px; font-size: 0.85em; }
.proc-xp-table td { padding: 2px 8px 2px 0; vertical-align: top; }
.proc-xp-cat { color: var(--muted, #999); text-transform: capitalize; min-width: 80px; }
.proc-xp-cost { text-align: right; padding-left: 12px; }
.proc-xp-totals { border-top: 1px solid var(--border, #444); font-weight: 600; }
.proc-xp-totals .proc-xp-remaining--over { color: var(--crim, #8B0000); }
```

### Task 8: Manual verification

- [ ] Load DT Processing for Alice Vunder's XP Spend action (or any recent submission with xp_spend)
- [ ] Verify: structured table appears with category, trait name, transition, cost per row
- [ ] Verify: totals row shows total XP, budget, remaining
- [ ] Verify: a submission without `xp_budget_snapshot` (legacy) shows the table rows but omits the budget/remaining totals (no broken display)
- [ ] Verify: a submission without `xp_rows` at all (very old) falls back to the flat string (no regression)
- [ ] Submit a new XP Spend draft, save, and verify `xpCost` is present on each row in the saved responses (inspect via browser network tab or MongoDB)

---

## Dev Notes

### Data flow summary

```
Player form (downtime-form.js)
  collectResponses()
    → project_N_xp_rows = JSON.stringify([{ category, item, dotsBuying, xpCost }])   ← NEW: xpCost added
    → xp_budget_snapshot = xpLeft(currentChar)                                        ← NEW: budget stored

Server (downtime_submission.schema.js)
    → xp_budget_snapshot: { type: 'number', optional: true }                          ← NEW: schema field

ST Admin (downtime-views.js)
  buildProcessingQueue()
    → entry.projXpRows = parsed _xp_rows array
    → entry.projXpBudgetSnapshot = resp.xp_budget_snapshot
  _renderProjectDetails()
    → _renderXpSpendBreakdown(entry.projXpRows, entry.projXpBudgetSnapshot)
```

### Why store costs at submit time, not recompute at render time

`getXpCost('discipline', item)` calls `isClanDisc(item)` which uses `currentChar.clan` to determine 3 vs 4 XP. On the ST side, the character object would need to be loaded and passed into the rendering function. This is feasible (characters are available in `buildProcessingQueue`) but fragile: if the character's clan changes between submission and processing, the displayed cost would differ from what the player committed to. Storing `xpCost` at submission time preserves what the player understood they were spending.

### Merit item field format

Merit items stored in `xp_rows.item` follow the `MERITS_DB` key format: `name|type|value|max`. Examples:
- `Haven|grad|0|3` — graduated merit, name is `Haven`
- `Resources|flat|3|0` — flat merit, name is `Resources`

To extract the display name: `item.split('|')[0]`.

For the dot transition on graduated merits: current dots = `parseInt(item.split('|')[2])`, target = `currentDots + dotsBuying`.

### Existing XP Review Step (lines ~4048–4166)

There is an existing "XP Review Step" section in the downtime-views.js — this is a separate ST workflow step (a checklist-style approval flow), distinct from the per-action card in the processing queue. This story only touches the **action card** in the processing queue, not the XP Review Step. Do not conflate them.

### Legacy fallback required

Submissions from DT2 (before this feature) have `project_N_xp_rows` rows without `xpCost`, and no `xp_budget_snapshot`. The card must degrade gracefully:
- Rows without `xpCost`: show category + trait + transition, omit cost column value (or show `—`)
- No `xp_budget_snapshot`: omit the totals footer entirely

---

## Files to Touch

| File | Change |
|------|--------|
| `public/js/tabs/downtime-form.js` | Add `xpCost` to each row; store `xp_budget_snapshot` in responses |
| `server/schemas/downtime_submission.schema.js` | Add `xp_budget_snapshot` field |
| `public/js/admin/downtime-views.js` | Parse rows + budget into queue entry; replace flat render with `_renderXpSpendBreakdown` |
| `public/css/admin-dt-processing.css` (or equivalent) | Add `.proc-xp-table` styles |

---

## Dev Agent Record

### Completion Notes

Implemented 2026-05-15. Four files changed, no new dependencies.

- `downtime-form.js:648` — `xpCost: getRowCost(...)` added inline to each row push. `getRowCost` is defined in the same file and uses `currentChar.clan` via `isClanDisc()` for correct clan/outclan discipline pricing.
- `downtime-form.js:1031` — `xp_budget_snapshot = xpLeft(currentChar)` written into responses inside the `_hasAnyXpRows` guard, so it only appears on submissions that actually have XP spend rows.
- `downtime_submission.schema.js:373` — `xp_budget_snapshot: { type: 'number', nullable: true }` added after `xp_spend`.
- `downtime-views.js:2980` — `_projXpRows` and `_projXpBudgetSnapshot` parsed and stored on queue entries alongside existing `_projXpBreakdown` (kept as legacy fallback).
- `downtime-views.js:7413` — `_renderXpSpendBreakdown(rows, budget)` helper added. Handles: human-readable category labels, merit name extraction (`item.split('|')[0]`), graduated merit dot transitions (`cur → cur + dotsBuying`), missing `xpCost` on legacy rows (cell left blank), missing `budget` (totals footer omitted).
- `downtime-views.js:7776` — Flat string render replaced with structured call; falls back to flat string for submissions without `projXpRows`.
- `admin-layout.css:5783` — `.proc-xp-table`, `.proc-xp-cat`, `.proc-xp-trait`, `.proc-xp-cost`, `.proc-xp-totals`, `.proc-xp-remaining--over` styles added.

### File List

- `public/js/tabs/downtime-form.js`
- `server/schemas/downtime_submission.schema.js`
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `specs/stories/feature.97.dt-xp-spend-card-breakdown.story.md`

### Change Log

- 2026-05-15: Implemented feature.97 — XP Spend card structured breakdown in DT Processing

---

## References

- Issue #315: https://github.com/angelusvmorningstar/TerraMortis/issues/315
- `public/js/admin/downtime-views.js:2970–3003` — current xp_rows composition
- `public/js/admin/downtime-views.js:7705` — current flat string render point
- `public/js/tabs/downtime-form.js:648` — where rows are pushed (add xpCost here)
- `public/js/tabs/downtime-form.js:4216–4225` — `getRowCost()` function
- `public/js/tabs/downtime-form.js:1148–1155` — existing budget validation (model for snapshot write)
- `server/schemas/downtime_submission.schema.js:100–113` — existing xp_rows schema entry
- `public/js/editor/xp.js` — `xpLeft()`, `xpEarned()`, `xpSpent()` functions
