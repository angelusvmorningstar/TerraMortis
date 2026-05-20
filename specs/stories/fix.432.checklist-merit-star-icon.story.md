---
title: 'Submission Checklist: A/S/R/C cells never show ★ — pool_status mismatch'
type: 'fix'
issue: 432
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/432
branch: ms/issue-432-checklist-merit-star-icon
created: '2026-05-20'
status: review
recommended_model: 'haiku — two-line fix inside one branch of one function; no design decisions'
context:
  - public/js/admin/downtime-views.js
---

## Intent

**Problem:** The Submission Checklist (DT Processing panel header) never shows ★ ("ready for story") for non-personal-project action columns (A1–A5 Allies, S1–S3 Status, R1–R3 Retainers, C1–C5 Contacts). After the ST confirms a merit action pool or resolves an outcome, those cells either stay at O (not touched) or flip to X (skipped). They never reach ★.

**Root cause — two-part mismatch in `_chkState` (`downtime-views.js:9549–9562`):**

1. **Status vocabulary divergence.** The ★ check `ps === 'validated'` was written for the projects path. Projects set `pool_status: 'validated'` when the pool is confirmed. Merit actions set `pool_status: 'confirmed'` (line 4704), then `'rolled'`, then `'resolved'`/`'no_effect'`. Merit actions never reach `'validated'` — so the ★ branch is dead code for them.

2. **`_CHK_TERMINAL_STATUSES` sweeps too wide.** The set includes `'resolved'` and `'no_effect'`. For projects these are legitimately "done and skipped" states. For merit actions, `'resolved'` and `'no_effect'` mean the outcome has been assigned — the action is *ready for narrative*, not skipped. Because the terminal check runs first (line 9559), resolved merit actions return `'no_action'` (X) instead of `'confirmed'` (★).

**Net effect observed during DT3:**
- Pool confirmed (`'confirmed'`) → O (falls through to `return 'unsighted'`)
- Outcome assigned (`'resolved'`, `'no_effect'`) → X (caught by `_CHK_TERMINAL_STATUSES`)
- All four merit column groups (A/S/R/C) affected

**Fix:** Replace the two-line merit slot logic with a set of explicit status checks specific to the merit vocabulary. Do not touch `_CHK_TERMINAL_STATUSES` or any other branch.

## Current Code (lines 9549–9562)

```js
if (alliesM || statusM || retainersM || contactsM) {
  const resolved = sub.merit_actions_resolved || [];
  const map      = _buildMeritSlotMap(sub);
  let gIdx;
  if (alliesM)    gIdx = map.allies[parseInt(alliesM[1]) - 1];
  else if (statusM)    gIdx = map.status[parseInt(statusM[1]) - 1];
  else if (retainersM) gIdx = map.retainers[parseInt(retainersM[1]) - 1];
  else                 gIdx = map.contacts[parseInt(contactsM[1]) - 1];
  if (gIdx !== undefined) {
    const ps = resolved[gIdx]?.pool_status;
    if (_CHK_TERMINAL_STATUSES.has(ps)) return 'no_action';  // ← catches 'resolved'/'no_effect' (wrong)
    if (ps === 'validated')             return 'confirmed';   // ← never fires for merit actions
  }
}
```

## Fixed Code

```js
if (alliesM || statusM || retainersM || contactsM) {
  const resolved = sub.merit_actions_resolved || [];
  const map      = _buildMeritSlotMap(sub);
  let gIdx;
  if (alliesM)         gIdx = map.allies[parseInt(alliesM[1]) - 1];
  else if (statusM)    gIdx = map.status[parseInt(statusM[1]) - 1];
  else if (retainersM) gIdx = map.retainers[parseInt(retainersM[1]) - 1];
  else                 gIdx = map.contacts[parseInt(contactsM[1]) - 1];
  if (gIdx !== undefined) {
    const ps = resolved[gIdx]?.pool_status;
    if (ps === 'skipped' || ps === 'no_action' || ps === 'no_roll' || ps === 'maintenance') return 'no_action';
    if (ps === 'confirmed' || ps === 'rolled' || ps === 'resolved' || ps === 'no_effect')   return 'confirmed';
  }
}
```

**What changed:** The two generic checks (`_CHK_TERMINAL_STATUSES.has(ps)` and `ps === 'validated'`) are replaced by two merit-specific checks using the actual status vocabulary that `saveEntryReview` writes for merit actions.

## Resources Path (verify separately)

The Resources column (lines 9564–9569) uses `sub.st_review?.actions?.['acq:resources']?.pool_status` and also checks `ps === 'validated'`. During implementation, check what pool_status values the resources acquisition path writes (search for `'acq:resources'` in the pool confirm/roll/outcome handlers). If resources also uses `'confirmed'` instead of `'validated'`, apply the same two-line replacement there. If resources genuinely uses `'validated'`, leave that path unchanged.

## Boundaries & Constraints

**Always:**
- Fix only the merit slot branch (lines 9549–9562).
- Verify and fix (or explicitly leave unchanged) the Resources path (lines 9564–9569).
- Do not modify `_CHK_TERMINAL_STATUSES` — it is used by the projects path which correctly uses `'validated'`.
- Do not touch the Travel, Feeding, or Projects branches.
- Do not add a call to `renderSubmissionChecklist()` after `saveEntryReview` — that is out of scope.

**Never:**
- Remove `'skipped'`, `'no_action'`, `'no_roll'`, `'maintenance'` from the X mapping — these are legitimately skipped states for merit actions too.
- Change the `'rolled'` mapping — the issue spec says ★ includes `'rolled'` (dice rolled, outcome pending is "in progress" enough to signal the ST has touched this slot).
- Touch `_buildMeritSlotMap` or `_getSubMeritActions` — the slot map logic is out of scope (the "orphaned content" theory can be investigated as a follow-up if ACs don't fully resolve all O cells).

## Pool Status Vocabulary Reference

| pool_status    | Written by             | Merit meaning                           | Checklist → |
|----------------|------------------------|-----------------------------------------|-------------|
| `pending`      | initial state          | Not yet touched by ST                   | O           |
| `confirmed`    | pool confirm button    | Pool expression validated, not rolled   | ★ (fix)     |
| `rolled`       | dice roll handler      | Dice rolled, outcome not yet assigned   | ★ (fix)     |
| `resolved`     | outcome assign handler | Outcome determined, narrative next      | ★ (fix)     |
| `no_effect`    | outcome assign handler | No effect on narrative                  | ★ (fix)     |
| `skipped`      | skip button            | ST explicitly skipped this slot         | X           |
| `no_action`    | skip button            | No valid action (e.g. wrong merit type) | X           |
| `no_roll`      | no-roll button         | Action confirmed but no roll needed     | X           |
| `maintenance`  | maintenance marker     | Maintenance action slot                 | X           |

## Tasks

- [x] **T1 — Fix merit slot branch** (`downtime-views.js:9559–9560`)
  - Replace `if (_CHK_TERMINAL_STATUSES.has(ps)) return 'no_action';` and `if (ps === 'validated') return 'confirmed';`
  - With: `if (ps === 'skipped' || ps === 'no_action' || ps === 'no_roll' || ps === 'maintenance') return 'no_action';`
  - And: `if (ps === 'confirmed' || ps === 'rolled' || ps === 'resolved' || ps === 'no_effect') return 'confirmed';`

- [x] **T2 — Verify and fix Resources path** (`downtime-views.js:9564–9569`)
  - Search for `'acq:resources'` pool_status writes to find what vocabulary resources uses
  - If resources uses `'confirmed'`, apply the same two-line fix there
  - If resources uses `'validated'`, leave unchanged and note in Dev Agent Record

- [x] **T3 — Parse-check**
  - `node --input-type=module --eval "import fs from 'fs'; const src = fs.readFileSync('public/js/admin/downtime-story.js','utf8'); new Function(src); console.log('parse OK');" 2>&1` — adapt path to `downtime-views.js`
  - Confirm `parse OK`

- [x] **T4 — Manual smoke test**
  Open DT Processing for DT3. Find a character with at least one confirmed/resolved Ally, Status, Retainer, or Contact action. Confirm the checklist cell now shows ★ instead of O or X. Confirm P1–P4, Travel, and Feeding columns unchanged.

## Files to Change

- `public/js/admin/downtime-views.js` — two lines inside `_chkState`, and optionally the Resources path

## Dev Agent Record

### Completion Notes

**T1 — Merit slot branch fixed.** Replaced the two generic checks (`_CHK_TERMINAL_STATUSES.has(ps)` and `ps === 'validated'`) with merit-specific vocabulary at `downtime-views.js:9559–9560`. The four confirmed-to-★ statuses are `confirmed`, `rolled`, `resolved`, `no_effect`. The four skip-to-X statuses are `skipped`, `no_action`, `no_roll`, `maintenance`. `_CHK_TERMINAL_STATUSES` and all other branches left unchanged.

**T2 — Resources path updated with same vocabulary.** Resources acquisition uses `saveEntryReview` with `source: 'acquisition'`, which writes `pool_status: 'confirmed'` via the shared pool confirm button. The vocabulary fix (`'confirmed'` → ★) at lines 9567–9568 is therefore correct. **Data-path note for follow-up:** The checklist reads from `sub.st_review?.actions?.['acq:resources']?.pool_status`, but `saveEntryReview` for the acquisition source writes to `sub.acquisitions_resolved[0]`. This means the Resources column checklist currently reads from an unpopulated path and will remain O/unsighted regardless of the vocabulary fix until a follow-up story redirects the read to `sub.acquisitions_resolved?.[0]?.pool_status`.

**T3 — Parse-check passed** using strip-and-Function approach (ES module imports stripped, no syntax errors).

**T4 — Manual smoke test** deferred to ST in-browser confirmation. Check DT3, open a character with a confirmed/resolved Ally, Status, Retainer, or Contact action, and verify the checklist cell now shows ★.

### Debug Log

- Resources path: `st_review?.actions?.['acq:resources']` is never written by current `saveEntryReview` (acquisition source writes to `acquisitions_resolved`). Resources ★ icon requires a follow-up data-path fix.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-20 | 1.0 | Story authored from code inspection and issue #432 | Claude (SM) |
| 2026-05-20 | 1.1 | Implemented T1+T2 vocabulary fix in _chkState; parse-check passed | Claude (Dev) |
