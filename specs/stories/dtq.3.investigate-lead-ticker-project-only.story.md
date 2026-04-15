# Story DTQ.3: Investigation Lead Ticker on Project Actions Only

Status: review

## Story

As an ST processing downtimes,
I want the Lead / No Lead toggle and Target Secrecy selector to appear on project-based investigate actions,
so that I can correctly calculate investigation outcomes for rolled dice-pool actions while keeping the merit investigate panel uncluttered.

## Acceptance Criteria

1. A project action with `actionType === 'investigate'` shows a Target Secrecy selector and Lead / No Lead toggle in the right panel.
2. A merit action with `actionType === 'investigate'` does **not** show the Lead / No Lead toggle or Target Secrecy selector.
3. `inv_has_lead` and `inv_secrecy` values on project investigate entries are saved to `projects_resolved[actionIdx]` via `saveEntryReview` (existing save path — no changes needed there).
4. The existing lead ticker on merit investigate (currently rendered in `_renderMeritRightPanel`) is removed.
5. All other project right-panel behaviour is unchanged (dice pool, success modifier, rote, validation status, roll card).
6. All other merit right-panel behaviour is unchanged (action mode, effect, automatic successes for non-investigate types).

## Tasks / Subtasks

- [x] Task 1: Remove lead/secrecy from `_renderMeritRightPanel` (AC: 2, 4, 6)
  - [x] In `public/js/admin/downtime-views.js`, in `_renderMeritRightPanel()`:
    - Remove the `invSecrecy`, `invHasLead`, `invRow`, `innateMod`, `noLeadMod` variable declarations at lines ~5213–5217
    - Remove the `totalPool` calculation that used those vars (line ~5218) — or adjust it to remove the `innateMod + noLeadMod` terms
    - Remove the Target Secrecy selector block (inside `if (actionType === 'investigate')`, lines ~5286–5298)
    - Remove the Lead toggle block (lines ~5299–5308)
    - Remove the "Net successes" row that referenced `netSucc` (line ~5310–5311)
    - Keep the `eqMod` ticker and Base successes row

- [x] Task 2: Add lead/secrecy to `_renderProjRightPanel` (AC: 1, 3, 5)
  - [x] In `_renderProjRightPanel()`, after the existing "Dice Pool Modifiers" panel and before "Success Modifier":
    - Add a guard: `if (entry.actionType === 'investigate') { ... }`
    - Inside the guard, read from `rev`: `invSecrecy = rev.inv_secrecy || ''`, `invHasLead = rev.inv_has_lead` (true/false/undefined)
    - Look up `invRow` from `INVESTIGATION_MATRIX` using `invSecrecy`
    - Render a panel block containing:
      - Target Secrecy `<select class="proc-recat-select proc-inv-secrecy-sel" data-proc-key="...">` with `INVESTIGATION_MATRIX` options
      - Lead toggle row with `.proc-inv-lead-btns` / `.proc-inv-lead-btn` (same markup as currently in merit panel)
    - Render an innate-mod display row when a secrecy row is selected (shows the secrecy modifier as a note)

- [x] Task 3: Verify correct placement (AC: 1–6)
  - [x] E2E: project investigate action shows lead/secrecy panel
  - [x] E2E: merit investigate action does NOT show `.proc-inv-lead-btns`

## Dev Notes

### Lead Ticker in Merit Panel — Current Code

`_renderMeritRightPanel()` (lines 5197+):
- Line 5213: `const invSecrecy = actionType === 'investigate' ? (rev.inv_secrecy || '') : '';`
- Line 5214: `const invHasLead = actionType === 'investigate' ? rev.inv_has_lead : undefined;`
- Line 5215: `const invRow     = invSecrecy ? (INVESTIGATION_MATRIX.find(...) || null) : null;`
- Line 5216: `const innateMod  = invRow ? invRow.innate : 0;`
- Line 5217: `const noLeadMod  = invRow && invHasLead === false ? invRow.noLead : 0;`
- Line 5218: `const totalPool  = basePool != null ? basePool + eqMod + innateMod + noLeadMod : null;`

Inside `if (isRolled) { if (actionType === 'investigate') { ... } }` (lines 5284–5312):
- Lines 5286–5298: Target Secrecy selector
- Lines 5299–5308: Lead / No Lead toggle
- Lines 5310–5311: "Net successes" row using `netSucc = autoSucc + eqMod + innateMod + noLeadMod`

After removing: the `if (actionType === 'investigate')` inner block renders only the equipment ticker. The "Net successes" row should also be removed (it relied on `innateMod + noLeadMod`). Replace with just `autoSucc + eqMod` net — or remove "Net successes" entirely from merit panel for investigate since the secrecy context is gone.

### Lead Ticker in Project Panel — Target Location

`_renderProjRightPanel()` (lines 5428+):
- After the closing `</div>` of `proc-feed-mod-panel` (line 5450), before the `proc-proj-succ-panel` (line 5452)
- The investigate block should render a self-contained panel, e.g.:

```js
if (entry.actionType === 'investigate') {
  const invSecrecy = rev.inv_secrecy || '';
  const invHasLead = rev.inv_has_lead; // true | false | undefined
  const invRow     = invSecrecy ? (INVESTIGATION_MATRIX.find(r => r.type === invSecrecy) || null) : null;
  const innateMod  = invRow ? invRow.innate : 0;
  const noLeadMod  = invRow && invHasLead === false ? invRow.noLead : 0;
  const innateStr  = innateMod > 0 ? `+${innateMod}` : innateMod < 0 ? String(innateMod) : '';
  const innateCls  = innateMod > 0 ? ' proc-mod-pos' : innateMod < 0 ? ' proc-mod-neg' : ' proc-mod-muted';
  const noLeadStr  = noLeadMod < 0 ? String(noLeadMod) : '';

  h += `<div class="proc-feed-mod-panel" data-proc-key="${esc(key)}">`;
  h += `<div class="proc-mod-panel-title">Investigation</div>`;
  // Target Secrecy
  h += `<div class="proc-mod-row">`;
  h += `<span class="proc-mod-label">Target Secrecy</span>`;
  h += `<select class="proc-recat-select proc-inv-secrecy-sel" data-proc-key="${esc(key)}">`;
  h += `<option value="">\u2014 Not set \u2014</option>`;
  for (const r of INVESTIGATION_MATRIX) {
    h += `<option value="${esc(r.type)}"${r.type === invSecrecy ? ' selected' : ''}>${esc(r.type)}</option>`;
  }
  h += `</select>`;
  if (innateStr) h += `<span class="proc-mod-val${innateCls}">${innateStr}</span>`;
  h += `</div>`;
  // Lead toggle
  h += `<div class="proc-mod-row">`;
  h += `<span class="proc-mod-label">Lead</span>`;
  h += `<div class="proc-inv-lead-btns">`;
  h += `<button class="proc-inv-lead-btn${invHasLead === true ? ' active' : ''}" data-proc-key="${esc(key)}" data-lead="true">Lead</button>`;
  h += `<button class="proc-inv-lead-btn${invHasLead === false ? ' active' : ''}" data-proc-key="${esc(key)}" data-lead="false">No Lead</button>`;
  h += `</div>`;
  if (noLeadStr) h += `<span class="proc-mod-val proc-mod-neg">${noLeadStr}</span>`;
  h += `</div>`;
  h += `</div>`; // proc-feed-mod-panel
}
```

### Event Listener

The `.proc-inv-lead-btn` click handler (lines 4001–4013) uses `btn.dataset.procKey` and `saveEntryReview(entry, { inv_has_lead: next })`. Since `entry.source === 'project'` saves to `projects_resolved[actionIdx]`, this already works correctly for project entries. No changes needed.

The `.proc-inv-secrecy-sel` change handler should also already fire for both merit and project panels — confirm by searching for the event listener wired to `.proc-inv-secrecy-sel`.

### References

- `_renderMeritRightPanel`: `downtime-views.js` line 5197
- `_renderProjRightPanel`: `downtime-views.js` line 5428
- Lead button event listener: lines 4001–4013
- `INVESTIGATION_MATRIX`: search for `INVESTIGATION_MATRIX` constant

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Removed `invSecrecy`, `invHasLead`, `invRow`, `innateMod`, `noLeadMod` variables and the entire `if (actionType === 'investigate')` block (Target Secrecy selector, Lead toggle, Net successes row) from `_renderMeritRightPanel`. `totalPool` simplified to `basePool + eqMod`.
- Added `if (entry.actionType === 'investigate')` panel block in `_renderProjRightPanel` between Dice Pool Modifiers and Success Modifier. Block reads `inv_secrecy` / `inv_has_lead` from `rev`, looks up `INVESTIGATION_MATRIX`, renders Target Secrecy selector + Lead/No Lead toggle with innate/noLead mod display. Save path via `.proc-inv-secrecy-sel` and `.proc-inv-lead-btn` handlers unchanged — `source: 'project'` saves to `projects_resolved[actionIdx]` as before.
- Updated two DT-Fix-23 tests that previously asserted merit panel *has* the controls; inverted to confirm they are absent (matching new AC-2/4). All 42 tests pass.

### File List

- `public/js/admin/downtime-views.js`
- `tests/downtime-processing-dt-fixes.spec.js`
- `specs/stories/dtq.3.investigate-lead-ticker-project-only.story.md`
