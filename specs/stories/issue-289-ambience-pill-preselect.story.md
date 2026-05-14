---
title: "DT Processing: ambience action territory pill pre-selects from player submission"
issue: 289
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/289
branch: morningstar-issue-289-ambience-pill-preselect
status: review
type: bug
---

## Story

As an ST processing downtime ambience actions, I want the territory pill row to pre-highlight the player's submitted target territory when I first open the action panel, so I don't have to manually cross-reference the Details panel to identify which territory they intended.

## Background

In DT Processing Step 5 (Ambience Increase / Decrease), when the ST opens an ambience action panel the territory pill row starts with no pill highlighted. The player's submitted territory is already visible in the read-only Details panel (e.g. "TERRITORY: northshore") but is never wired to the interactive pill row.

This is the direct parallel of issue #285 (feeding territory pill pre-population) which fixed the same gap for Step 3 Feeding. The ambience fix is simpler: ambience is single-select (one territory per action), not multi-select.

The root cause is a one-liner at `public/js/admin/downtime-views.js` ~line 7482:

```js
const _ambiTid = _ambiSub?.st_review?.territory_overrides?.[_ambiCtx] || '';
```

When no ST override is saved, `_ambiTid` is always `''`, so the em-dash pill is always active.

## Acceptance criteria

- [ ] Given an Ambience Increase action where the player submitted `northshore` as their target territory and no ST override exists, when the ST opens the action panel, the N.Shore pill is highlighted
- [ ] Given the same action where the ST has already saved a territory override, the saved override takes precedence (no regression)
- [ ] Given an Ambience Decrease action with a player-submitted territory, the same pre-selection applies
- [ ] Clicking a pill to confirm saves correctly (no regression to existing click handler)

---

## Dev notes

### Overview

**Single file, single targeted change. No new functions, no new imports, no DB writes.**

File: `public/js/admin/downtime-views.js`  
Function: `renderActionPanel()` — starts at line **7555**

| Change | Lines | Description |
|--------|-------|-------------|
| 1 | ~7478–7484 | Pre-select ambience territory pill from player's submission when no ST override exists |

---

### Change 1 — Ambience territory pill pre-selection (~line 7478)

**Current code:**
```js
} else if (actionType === 'ambience_increase' || actionType === 'ambience_decrease') {
  if (!isMerit) {
    const _ambiSub = submissions.find(s => s._id === entry.subId);
    const _ambiCtx = String(entry.actionIdx);
    const _ambiTid = _ambiSub?.st_review?.territory_overrides?.[_ambiCtx] || '';
    h += _renderInlineTerrPills(entry.subId, _ambiCtx, _ambiTid);
  }
  // merit ambience: territory handled via isAlliesAction pills below
```

**Target code:**
```js
} else if (actionType === 'ambience_increase' || actionType === 'ambience_decrease') {
  if (!isMerit) {
    const _ambiSub = submissions.find(s => s._id === entry.subId);
    const _ambiCtx = String(entry.actionIdx);
    const _stOvrTid = _ambiSub?.st_review?.territory_overrides?.[_ambiCtx];
    let _ambiTid;
    if (_stOvrTid) {
      _ambiTid = _stOvrTid;
    } else {
      // No ST override — pre-select from player's submitted territory (visual only)
      const _slot = entry.projSlot;
      const _resp = _ambiSub?.responses || {};
      const _raw = _resp[`project_${_slot}_ambience_target`] || _resp[`project_${_slot}_territory`] || '';
      _ambiTid = resolveTerrId(_raw) || '';
    }
    h += _renderInlineTerrPills(entry.subId, _ambiCtx, _ambiTid);
  }
  // merit ambience: territory handled via isAlliesAction pills below
```

**Key facts the dev must know:**

- **`entry.actionIdx` vs `entry.projSlot`** — this is the resolved answer to the issue's open question. `entry.actionIdx` is the flat index in the processing queue (`idx` in `buildProcessingQueue`), used as the override key context. `entry.projSlot` is the form submission slot number (1, 2, 3…) that maps to `project_${n}_ambience_target` in `responses`. You must use `entry.projSlot` for the form key lookup, NOT `entry.actionIdx`. Both fields are set on project-source entries at lines 3016–3017.

- **`_renderInlineTerrPills` signature**: `(subId, terrContext, currentTerrId, feedingSet = null)`. For single-select (ambience), pass the territory ID as the 3rd argument (`currentTerrId`). The 4th `feedingSet` parameter is only used for feeding multi-select. A pill renders `active` when `currentTerrId === t.id`.

- **`resolveTerrId(raw)`** (line 3577) converts any slug or display-name variant to the canonical territory ID used by the pills (`'academy'`, `'harbour'`, `'dockyards'`, `'northshore'`, `'secondcity'`). Returns `null` for Barrens or unrecognised input. The `|| ''` fallback converts `null` to `''`, which makes the em-dash pill active — correct "nothing selected" behaviour.

- **Why `_resp[project_${_slot}_ambience_target`] first**: Issue #196 / dt-form.25 established `_ambience_target` as the canonical key for ambience actions. The legacy `_territory` key is still carried as fallback for pre-redesign drafts. Same pattern used at line 3700 in `_gatherProjectAmbience`.

- **No DB write** — this is display-only, exactly like #285 Change 1. The existing click handler (line 4626) always initialises from `st_review.territory_overrides[context]` when saving. When the ST clicks a pill on a pre-selected (unsaved) row, the click handler saves that territory to the override. First click saves correctly.

- **Em-dash clear behaviour**: when an ST clicks the em-dash pill on a previously overridden row, the click handler deletes the key from `territory_overrides` and sets DB to `null` (line 4630–4631). On next render, `_stOvrTid` will be `undefined`, falling through to the player suggestion again. This is the same behaviour as the feeding pill. Acceptable — player suggestion is informational.

- **Merit ambience**: left unchanged. The `if (!isMerit)` guard at line 7479 is preserved. Merit ambience actions already handle territory via the `isAlliesAction` pills rendered below.

---

### What NOT to change

- `_renderInlineTerrPills` function — no changes needed.
- The territory pill click handler (lines 4586–4640) — no changes; it already handles single-select save/clear correctly.
- `renderFeedingDetail()` — separate display panel, do not touch.
- Any other ambience-related rendering (`_gatherProjectAmbience`, Step 5 ambience panel, merit ambience pills) — all out of scope.
- `downtime-constants.js`, `downtime-story.js`, or any other file — only `downtime-views.js` changes.

---

### Scope clarification: visual hint only

The pre-selection does NOT trigger the ambience lookup / score update. Same constraint as #285. The ambience recalculation is triggered only when the ST clicks a pill to confirm (saving an override). Pre-selection from player data is a display hint; the ST still confirms by clicking.

---

### Test file

Create `tests/issue-289-ambience-pill-preselect.spec.js` mirroring `tests/issue-285-feeding-pool-prepopulate.spec.js` structure.

**Required test scenarios:**

| Test | AC | Scenario |
|------|-----|----------|
| 1 | AC1 | Ambience Increase, submitted `northshore`, no ST override → N.Shore pill active on open |
| 2 | AC2 | Ambience Increase, ST override `academy` saved → Academy pill active (player submitted northshore) |
| 3 | AC3 | Ambience Decrease, submitted `harbour`, no ST override → Harbour pill active on open |
| 4 | AC4 | Click unselected pill → saves override, pill stays active on re-render |
| 5 | regression | Non-ambience project action (e.g. `patrol`) → no change to its pill behaviour |

**Test data shape** (project submission fragment):

```js
// Submission with ambience_increase action in slot 1, territory northshore
const SUBMISSION_NO_OVR = {
  _id: 'sub-289-a',
  responses: {
    project_1_action_type: 'ambience_increase',
    project_1_ambience_target: 'northshore',
  },
  _raw: {
    projects: [{ action: 'ambience_increase', desired_outcome: 'Increase ambience', territory: 'northshore' }],
  },
  st_review: { territory_overrides: {} },
  // ...rest of submission shape from SUBMISSION_NO_POOL in 285 spec as template
};

// Entry as built by buildProcessingQueue
const ENTRY_AMBI = {
  key: 'sub-289-a:proj:0',
  subId: 'sub-289-a',
  source: 'project',
  actionType: 'ambience_increase',
  actionIdx: 0,   // queue index
  projSlot: 1,    // form slot — this is what drives the responses key lookup
};
```

**What to assert** (in-browser Playwright):
- With `SUBMISSION_NO_OVR` loaded: the `proc-terr-pill[data-terr-id="northshore"]` has class `active`.
- The em-dash pill (`data-terr-id=""`) does NOT have class `active`.
- With ST override `{ '0': 'academy' }` set: the academy pill is active, northshore pill is not.

---

### Verification checklist (manual)

1. Open Step 5 for a character who submitted an Ambience Increase targeting N. Shore with no ST save. The N.Shore pill should be highlighted on open.
2. Save a territory override by clicking a different pill (e.g. Harbour). Collapse and re-open the panel. The Harbour pill should now be active (saved override takes precedence).
3. Click the em-dash pill to clear the override. Collapse and re-open. The player suggestion (N.Shore) should re-appear.
4. Open Step 5 for a character with an Ambience Decrease. Same pre-selection behaviour.
5. Open a non-ambience project action panel (e.g. Patrol). Confirm no change in its territory pill behaviour.
6. No console errors on any of the above.

---

## Dev agent record

### Files changed

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | 1 change: ambience pill pre-selection fallback (~line 7482) |
| `tests/issue-289-ambience-pill-preselect.spec.js` | NEW — 8 Playwright E2E tests (all passing) |
| `specs/stories/issue-289-ambience-pill-preselect.story.md` | THIS FILE |
| `specs/stories/sprint-status.yaml` | Status entry added |

### Completion notes

Changed ~line 7482 in `renderActionPanel()`. The one-liner `_ambiTid = st_review?.territory_overrides?.[_ambiCtx] || ''` was expanded to a conditional: if an ST override exists, use it; otherwise read `project_${entry.projSlot}_ambience_target` (or legacy `_territory`) from `_ambiSub.responses` and pass through `resolveTerrId()` to get the canonical territory ID.

Key resolution: `entry.actionIdx` (queue index, used as the override key context) is not the same as `entry.projSlot` (form slot number, 1-indexed). The form response key uses `projSlot`; the override key uses `actionIdx`. The story's open question was confirmed during implementation.

All 4 ACs satisfied. 8 Playwright tests pass (first run after nav fix: `data-phase="projects"` not `"ambience"` — the DTUX ribbon uses high-level phase tabs, not the internal `PHASE_NUM_TO_LABEL` keys).
