---
title: 'DT Processing: allies sphere actions absent from queue and filter'
type: 'fix'
issue: 713
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/713
branch: ms/issue-713-dt-allies-actions-missing
created: '2026-06-12'
status: review
recommended_model: 'sonnet — two-file targeted fix, moderate scope'
context:
  - public/js/tabs/downtime-form.js
  - public/js/admin/downtime-views.js
---

## Intent

**Problem:** In DT4 processing, no Allies merit action cards appear in the ST processing
queue. The Allies Source filter returns zero results and the unfiltered queue shows nothing
for sphere actions.

**Root cause confirmed via live data (2026-06-12):**

Querying DT4 submissions in `tm_suite.downtime_submissions` shows every affected submission
has `sphere_N_action` set but `sphere_N_merit` is entirely absent.

**Two bugs compounding each other:**

---

### Bug A — Form never writes `sphere_N_merit` (primary cause)

`collectResponses()` in `downtime-form.js:848` gates the `sphere_N_merit` write on:

```js
if (m && gateValues[`merit_${meritKey(m)}`] === 'yes') {
  responses[`sphere_${n}_merit`] = meritLabel(m);
}
```

This gate was originally set by a `data-merit-toggle` radio button (rendered by
`renderMeritToggle()`) that asked "use this Downtime? Yes/No" per merit. The **tabbed
sphere UI** (`renderMeritToggles` > Allies section, around line 6202) replaced that
individual toggle with a tabbed pane interface — the "Yes/No" radio is gone. With no
toggle rendered, `gateValues[merit_${key}]` is never 'yes', so `sphere_N_merit` is never
written.

Status actions (lines 882–887) already use the correct pattern:
```js
if (sm && responses[`status_${n}_action`]) {
  responses[`status_${n}_merit`] = meritLabel(sm);
}
```

Allies must match this: write the merit label whenever the player has picked an action,
not when a removed gate toggle says 'yes'.

---

### Bug B — Processing guard skips entries with missing merit label

`buildProcessingQueue()` in `downtime-views.js:3192–3196`:

```js
// Guard: require both merit label AND a non-empty action so existing submissions
// with phantom labels (player never toggled gate) are retroactively suppressed.
for (let n = 1; n <= 5; n++) {
  const meritType = resp[`sphere_${n}_merit`];
  const actionVal = resp[`sphere_${n}_action`];
  if (!meritType || !actionVal) continue;
```

The guard comment says "phantom labels" — its original intent was to suppress old
submissions where the player opened the gate without picking an action. For DT4, the
opposite is true: `actionVal` is set but `meritType` is absent. All sphere entries
are suppressed.

**Fix B**: extend the fallback so that when `actionVal` is set but `meritType` is absent,
we derive the label from the character's N-th Allies merit in `charMap`. This handles all
existing DT4 submissions without a data backfill script.

---

## Root cause files

| File | Lines | Role |
|------|-------|------|
| `public/js/tabs/downtime-form.js` | 845–850 | `collectResponses()` sphere merit write — gated on removed toggle |
| `public/js/admin/downtime-views.js` | 3189–3196 | `buildProcessingQueue()` fallback guard — skips missing merit label |

---

## Tasks

### T1 — Fix form: write `sphere_N_merit` when action is set ✅

**File:** `public/js/tabs/downtime-form.js`, lines 845–850

**Before:**
```js
// Merit label — only written when player opted in (gate = 'yes').
// Absent label means admin queue builder skips this slot entirely.
const m = detectedMerits.spheres[n - 1];
if (m && gateValues[`merit_${meritKey(m)}`] === 'yes') {
  responses[`sphere_${n}_merit`] = meritLabel(m);
}
```

**After:**
```js
// Merit label — written whenever the player has picked an action.
// Issue #713: old form had a merit-toggle gate ('yes'/'no') that set gateValues;
// the tabbed sphere UI removed that toggle, so gate is never 'yes'. Match the
// Status pattern (line ~885): write when action is set.
const m = detectedMerits.spheres[n - 1];
if (m && responses[`sphere_${n}_action`]) {
  responses[`sphere_${n}_merit`] = meritLabel(m);
}
```

---

### T2 — Fix processing: derive merit label from character when missing ✅

**File:** `public/js/admin/downtime-views.js`, lines 3187–3225

The fallback loop currently requires `sphere_N_merit`. Extend it to derive the label from
character data when it is absent but `sphere_N_action` is present.

**Before (lines 3189–3196):**
```js
if (!spheres.length) {
  // Guard: require both merit label AND a non-empty action so existing submissions
  // with phantom labels (player never toggled gate) are retroactively suppressed.
  for (let n = 1; n <= 5; n++) {
    const meritType = resp[`sphere_${n}_merit`];
    const actionVal = resp[`sphere_${n}_action`];
    if (!meritType || !actionVal) continue;
```

**After:**
```js
if (!spheres.length) {
  // Guard: require a non-empty action. Merit label may be absent for submissions
  // made with the tabbed sphere UI (issue #713); derive from character data in that case.
  for (let n = 1; n <= 5; n++) {
    let meritType = resp[`sphere_${n}_merit`];
    const actionVal = resp[`sphere_${n}_action`];
    if (!actionVal) continue;
    if (!meritType) {
      // Derive: find character's N-th Allies merit (same order as form's detectedMerits.spheres)
      const sphereChar = _subChar || charMap.get((sub.character_name || '').toLowerCase().trim());
      const alliesMerits = (sphereChar?.merits || [])
        .filter(m => m.category === 'influence' && m.name === 'Allies');
      const am = alliesMerits[n - 1];
      if (am) {
        const dots = (am.rating || am.dots || 0) + (am.bonus || 0);
        const area = am.area || am.qualifier || '';
        meritType = area ? `Allies ${'●'.repeat(dots)} (${area})` : `Allies ${'●'.repeat(dots)}`;
      }
    }
    if (!meritType) continue;
```

The remainder of the existing object literal (`merit_type: meritType`, etc.) is unchanged.
Only the label derivation and guard are modified.

---

### T3 — Verify with live DT4 data

After both fixes are deployed to dev:

1. Open the ST DT processing panel for DT4
2. Allies action cards should appear in the unfiltered queue for all characters who
   submitted a sphere action (Henry St. John, Wan Yelong, Ludica Lachramore confirmed
   as affected in T1 investigation)
3. Click the Allies Source filter — should return only Allies action cards
4. Cards should display correct merit label, dots, qualifier, territory, and action type
5. No regression: Status, Contacts, Retainer actions still visible

---

## What not to change

- The Status append loop in `buildProcessingQueue` (lines 3246–3263) — correct as-is
- `_parseMeritType()` — regex detection is correct
- `_entrySourceType()` and filter wiring — correct
- Server-side schemas — `sphere_N_merit` schema field already exists
  (`downtime_submission.schema.js:144`)
- No data backfill script needed — T2's processing fix handles all existing DT4
  submissions at render time without touching MongoDB

---

## Tests

No automated test suite. Verify manually via T3 above.

The key invariant to check:
> For a DT4 submission where `sphere_N_action` is set, `buildProcessingQueue` must
> produce a queue entry with `meritCategory === 'allies'` and `isAlliesAction === true`,
> regardless of whether `sphere_N_merit` is present in the submission document.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

**T1 — Form fix (`downtime-form.js:845–852`):**
Changed gate condition from `gateValues[merit_${meritKey(m)}] === 'yes'` to
`responses[sphere_N_action]`. The old gate was set by a `data-merit-toggle` radio button
rendered by `renderMeritToggle()`; the tabbed sphere UI removed that toggle, so the gate
was never 'yes', so `sphere_N_merit` was never written. New condition mirrors the Status
pattern at line ~885.

**T2 — Processing fix (`downtime-views.js:3189–3209`):**
Changed `const meritType` → `let meritType`; changed guard from `!meritType || !actionVal`
to `!actionVal`; added derivation block that, when `meritType` is absent, walks the
character's Allies merits (filtered from `charMap`/`_subChar`) by slot index and
constructs the label as `"Allies ●●● (Area)"`. Falls back to `continue` only if the
character has no N-th Allies merit. Handles all existing DT4 submissions without a data
backfill.

Both files parse clean.

### File List

- `public/js/tabs/downtime-form.js` — `collectResponses()`: sphere merit gate replaced
- `public/js/admin/downtime-views.js` — `buildProcessingQueue()`: fallback guard extended with merit label derivation

### Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-12 | 1.0 | Initial draft | Claude (SM) |
| 2026-06-12 | 1.1 | fix(#713) — sphere merit label now written on action set; processing derives label from character data for existing submissions | claude-sonnet-4-6 |
