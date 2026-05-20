# Story fix.423: Merit Summary — Resources acquisition falsely blocks Mark All Complete

**Story ID:** fix.423
**Epic:** DT Story tab fixes
**Status:** review
**Date:** 2026-05-20
**Issue:** [#423](https://github.com/angelusvmorningstar/TerraMortis/issues/423)
**Branch:** ms/issue-423-acquisition-merit-summary

---

## User Story

As an ST completing DT processing for a character with a Resources acquisition, when all merit actions have been processed, I want the "Mark All Complete" button to be available — so that I am not blocked by a Resources acquisition entry that can never satisfy the `outcome_summary` check in `merit_actions_resolved`.

---

## Background

### Root cause

DT Processing routes Resources acquisitions through a separate resolved-array from all other merit actions:

- **In `downtime-views.js`**, Resources acquisitions are pushed onto the processing queue with `source: 'acquisition'` and `actionIdx: 0`. When the ST validates or skips them, the result is saved to `acquisitions_resolved[0]` — never to `merit_actions_resolved`.
- **In `downtime-story.js`**, `meritSummaryComplete()` (line 1914) reads `merit_actions_resolved[i].outcome_summary` for every non-skipped entry in `merit_actions`. Resources merit entries appear in `merit_actions` (the form parser adds them and `deriveMeritCategory` maps their `merit_type` to `'resources'`), but their processing path never writes `outcome_summary` to `merit_actions_resolved[i]`.
- Result: Resources entries are permanently stuck as "not yet recorded", so `meritSummaryComplete()` always returns `false` when one is present — blocking the completion dot and the "Mark All Complete" gate.

The same wrong check appears in the "still to record" counter at lines 1981–1984 of `renderMeritSummary`.

### The dispatch split (why the arrays diverge)

`downtime-views.js` dispatches resolved-array reads by `entry.source`:

```javascript
if (entry.source === 'merit')       return (sub.merit_actions_resolved || [])[entry.actionIdx] || null;
if (entry.source === 'acquisition') return (sub.acquisitions_resolved  || [])[entry.actionIdx] || null;
```

Resources queue entries have `source: 'acquisition'` and `actionIdx: 0`, so outcomes land in `acquisitions_resolved[0]`. The `merit_actions_resolved[i]` slot for the corresponding `merit_actions` entry is never touched.

### Latent index bug in current `meritSummaryComplete`

The current implementation also has an index-alignment bug: it filters `actions` into `applicable` (preserving elements, not indices), then does `applicable.every((_, i) => resolved[i]...)` where `i` is the filtered-array index rather than the original `merit_actions` index. This produces wrong results if any early entries are skipped. The replacement below uses a for-loop to avoid this entirely.

### Confirmed instance

Carver's DT3 submission. The Resources Acquisitions row shows "Validated" in DT Processing (result in `acquisitions_resolved[0]`), but the Allies & Asset Summary section shows "2 outcomes still to record in DT Processing" and the completion dot stays amber.

---

## Acceptance Criteria

- [ ] For Carver's DT3 submission: Allies & Asset Summary section shows a green dot once the Resources acquisition is Validated in DT Processing
- [ ] "Mark All Complete" is no longer blocked by a Resources acquisition entry whose result is in `acquisitions_resolved`
- [ ] The "X outcomes still to record" counter does not count a Resources acquisition that has `pool_status: 'validated'` or `pool_status: 'skipped'` in `acquisitions_resolved[0]`
- [ ] A Resources entry that has NOT yet been validated still counts as incomplete (counter increments, dot stays amber)
- [ ] All non-resources merit categories (allies, status, retainer, contacts, staff) are unaffected: they still require `outcome_summary` to be set before counting as complete
- [ ] A submission with no Resources merit action still works correctly (no regression)

---

## Implementation

### File: `public/js/admin/downtime-story.js`

#### 1. `meritSummaryComplete` (line 1914)

Replace the current implementation:

```javascript
function meritSummaryComplete(sub) {
  const actions  = sub?.merit_actions || [];
  const resolved = sub?.merit_actions_resolved || [];
  const applicable = actions.filter((_, i) => (resolved[i]?.pool_status || '') !== 'skipped');
  if (!applicable.length) return true;
  return applicable.every((_, i) => !!(resolved[i]?.outcome_summary?.trim()));
}
```

With this corrected version that handles resources entries and fixes the index-alignment bug:

```javascript
function meritSummaryComplete(sub) {
  const actions  = sub?.merit_actions || [];
  const resolved = sub?.merit_actions_resolved || [];
  const acqRes   = sub?.acquisitions_resolved  || [];

  for (let i = 0; i < actions.length; i++) {
    const rev = resolved[i] || {};
    if ((rev.pool_status || '') === 'skipped') continue;
    if (deriveMeritCategory(actions[i].merit_type) === 'resources') {
      const acqStatus = acqRes[0]?.pool_status || '';
      if (acqStatus !== 'validated' && acqStatus !== 'skipped') return false;
      continue;
    }
    if (!rev.outcome_summary?.trim()) return false;
  }
  return true;
}
```

#### 2. Missing-count calculation in `renderMeritSummary` (lines 1981–1984)

Replace:

```javascript
const missing = actions.filter((_, i) => {
  const rev = resolved[i] || {};
  return rev.pool_status !== 'skipped' && !rev.outcome_summary?.trim();
}).length;
```

With:

```javascript
const acqRes  = sub?.acquisitions_resolved || [];
const missing = actions.filter((a, i) => {
  const rev = resolved[i] || {};
  if (rev.pool_status === 'skipped') return false;
  if (deriveMeritCategory(a.merit_type) === 'resources') {
    const acqStatus = acqRes[0]?.pool_status || '';
    return acqStatus !== 'validated' && acqStatus !== 'skipped';
  }
  return !rev.outcome_summary?.trim();
}).length;
```

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-story.js` | Fix `meritSummaryComplete` (line 1914); fix missing-count in `renderMeritSummary` (lines 1981–1984) |

No schema changes. No API changes. No `downtime-views.js` changes.

---

## Dev Notes

- `deriveMeritCategory` is defined at line 1835. It returns `'resources'` for any `merit_type` string matching `/resources?/` (e.g. "Resources 3").
- `acquisitions_resolved[0]` is always the Resources acquisition slot. The queue entry for Resources always uses `actionIdx: 0`. Multi-row acquisition forms still produce one single `acquisitions_resolved[0]` entry.
- `pool_status` values in `acquisitions_resolved[0]` follow the same enum as other resolved entries: `'validated'`, `'skipped'`, or absent/empty for not-yet-processed.
- The display in `renderMeritSummary` (lines 1964–1972) shows "— Outcome not yet recorded —" for resources entries because `outcome_summary` is genuinely absent. Leave this display as-is — it is informational only and is not a blocking gate after this fix.
- Do not cross-write `outcome_summary` into `merit_actions_resolved[i]` from the acquisitions processing path. The arrays intentionally diverge; the fix reads the correct array per category.

---

## Dev Agent Record

**Implementation date:** 2026-05-20
**Implemented by:** Amelia (bmad-agent-dev)

### Completion Notes

- `meritSummaryComplete` replaced with for-loop that checks `acquisitions_resolved[0].pool_status` for `'resources'`-category entries; also fixes latent index-alignment bug in the original `filter+every` pattern.
- Missing-count calculation in `renderMeritSummary` updated with same `acquisitions_resolved` check for resources entries.
- No schema, API, or `downtime-views.js` changes required.
- Syntax check passed (`node --input-type=module --check`).

### File List

- `public/js/admin/downtime-story.js` — modified (`meritSummaryComplete` line 1914; missing-count block line 1991)

### Change Log

- `fix(#423): resources acquisition no longer blocks merit summary completion` — 2026-05-20

---

## Verification

### Manual

1. Open DT Story tab for Carver's DT3 submission.
2. Confirm Resources Acquisitions is already Validated in DT Processing.
3. Confirm Allies & Asset Summary section now shows a green dot (complete).
4. Confirm "Mark All Complete" is available and not blocked.
5. Confirm the "X outcomes still to record" counter shows 0 for Carver (assuming all other merit actions already have `outcome_summary`).

### Regression

6. Open a submission with only allies/status merit actions and no Resources. Confirm completion still requires `outcome_summary` to be set on each entry.
7. Open a submission with a Resources acquisition that is NOT yet validated. Confirm the section still shows incomplete and counts it in the missing total.
