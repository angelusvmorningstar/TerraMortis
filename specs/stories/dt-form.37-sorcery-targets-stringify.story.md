---
id: dt-form.37
task: 37
issue: 117
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/117
branch: morningstar-issue-117-sorcery-targets-stringify
epic: epic-dt-form-mvp-redesign
status: review
priority: high
depends_on: ['dt-form.34']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md
---

# Story dt-form.37 — Fix: sorcery_N_targets must be sent as JSON string, not raw array

As a Blood Sorcery player filling in the downtime form,
I should be able to save or submit my downtime with a sorcery target filled in,
So that the form does not silently fail with a schema validation error at the API boundary.

## Context

GH #117 was filed after Cyrus's downtime save failed with:

```
Save failed: Request body failed schema validation (1 error)
api.js:27 API POST /api/downtime_submissions validation errors:
[{ 'path': '/responses/sorcery_1_targets', 'message': 'must be string' }]
```

### Root Cause

The DTFP-6 redesign (story dt-form.27 / PR before this one) replaced the plain text target input with a structured multi-row picker. `collectResponses()` now builds an array of `{type, value}` objects:

```javascript
// downtime-form.js line 708–716
const arr = [];
targetsBlock.querySelectorAll('.dt-sorcery-target-row').forEach((row, ti) => {
  const typeEl = row.querySelector(`input[name="dt-sorcery_${n}_targets_${ti}_type"]:checked`);
  const valEl  = row.querySelector(`#dt-sorcery_${n}_targets_${ti}_value`);
  const type = typeEl ? typeEl.value : '';
  const value = valEl ? (valEl.value || '').trim() : '';
  if (type) arr.push({ type, value });
});
responses[`sorcery_${n}_targets`] = arr;  // BUG: raw array sent, server expects string
```

The server schema at `server/schemas/downtime_submission.schema.js:151` declares:

```javascript
[`sorcery_${n}_targets`]: { type: 'string' },  // Target description
```

Sending a raw JS array for a `type: 'string'` field fails validation. The schema is correct — other complex fields in the form (`_feed_blood_types`, `feeding_territories`) are serialised with `JSON.stringify` before dispatch. The sorcery targets field was never serialised.

### Companion Bug — Render Path

The render path at lines 4578–4581 also needs fixing. Once the field round-trips through the server as a JSON string, the current logic mishandles it:

```javascript
// downtime-form.js lines 4578–4581 (current)
const rawTargets = saved[`sorcery_${n}_targets`];
const targets = Array.isArray(rawTargets)
  ? rawTargets
  : (rawTargets ? [{ type: 'other', value: String(rawTargets) }] : [{ type: '', value: '' }]);
```

After a successful save, `rawTargets` is the JSON string `'[{"type":"other","value":"Cyrus Ashford"}]'`. The `Array.isArray` check is false; the fallback wraps the entire JSON string as a single legacy `other` target — mangling the structured data.

### Files in Scope

- `public/js/tabs/downtime-form.js` — two changes:
  1. Line 716: `JSON.stringify(arr)` before assignment
  2. Lines 4578–4581: add a JSON.parse branch for the server-returned string

### Files NOT in Scope

- `server/schemas/downtime_submission.schema.js` — `type: 'string'` is correct; no change
- The "preserve prior value" path at lines 719–720 — correctly passes through whatever shape `responseDoc` holds; no change needed
- Any other story's code

## Acceptance Criteria

**Given** a Blood Sorcery character fills in at least one target row (type + value) and clicks Save / Submit
**When** `collectResponses()` runs
**Then** `responses['sorcery_1_targets']` is a JSON string, not an array, and the API call succeeds without schema validation errors

**Given** a saved submission with sorcery targets is loaded back from the server
**When** `renderForm()` runs and populates the sorcery section
**Then** the target picker is pre-populated with the original type and value from the saved JSON string — not replaced by a single mangled `other` row containing the raw JSON

**Given** a legacy submission where `sorcery_N_targets` is a plain (non-JSON) string
**When** `renderForm()` renders it
**Then** it falls back to a single `other` target row showing the legacy string value — unchanged from current behaviour

**Given** an in-memory draft (mode toggle before first server save) where `sorcery_N_targets` is already a raw array in `responseDoc.responses`
**When** `renderForm()` renders it
**Then** the picker is populated correctly (the `Array.isArray` branch still works)

## Implementation Notes

### Change 1 — Stringify on collect (`downtime-form.js` line 716)

```javascript
// BEFORE
responses[`sorcery_${n}_targets`] = arr;

// AFTER
responses[`sorcery_${n}_targets`] = JSON.stringify(arr);
```

That is the single-character root-cause fix.

### Change 2 — JSON.parse branch on render (`downtime-form.js` lines 4578–4581)

Replace the existing two-branch ternary with an explicit if/else that handles the server-returned JSON string:

```javascript
// BEFORE (lines 4578–4581)
const rawTargets = saved[`sorcery_${n}_targets`];
const targets = Array.isArray(rawTargets)
  ? rawTargets
  : (rawTargets ? [{ type: 'other', value: String(rawTargets) }] : [{ type: '', value: '' }]);

// AFTER
const rawTargets = saved[`sorcery_${n}_targets`];
let targets;
if (Array.isArray(rawTargets)) {
  targets = rawTargets;
} else if (rawTargets && rawTargets.startsWith('[')) {
  try { targets = JSON.parse(rawTargets); } catch { targets = [{ type: '', value: '' }]; }
} else if (rawTargets) {
  targets = [{ type: 'other', value: String(rawTargets) }];
} else {
  targets = [{ type: '', value: '' }];
}
```

### What NOT to Change

- `server/schemas/downtime_submission.schema.js` — `type: 'string'` is the contract; the client conforms to it
- The preserve-prior-value path at lines 719–720 — correctly passes the string through for inactive slots
- The `sorcery_N_rite` and `sorcery_N_notes` fields — already strings, no change
- Anything else in `collectResponses()` or the sorcery render helpers

## Test Plan

- Static review: line 716 shows `JSON.stringify(arr)`, lines 4578–4581 show the new if/else with `startsWith('[')` + `JSON.parse`
- Browser smoke (required before PR):
  1. Open form as Cyrus or any Blood Sorcery character. Switch to ADVANCED. Select a rite. Add a target (type + value). Click Save — confirm status shows "Saved HH:MM" without a schema validation error in the console.
  2. Hard-refresh the page. Confirm the target picker repopulates with the correct type and value (not a mangled JSON blob in the value field).
  3. Open form as a non-sorcery character — confirm no regressions (form saves normally).

## Definition of Done

- [x] `downtime-form.js` line 716: `JSON.stringify(arr)` used
- [x] `downtime-form.js` lines 4578–4581: JSON.parse branch added; `Array.isArray` branch preserved; legacy string fallback preserved
- [x] Smoke test 1: save with sorcery target succeeds (no schema validation error)
- [x] Smoke test 2: target picker repopulates correctly after hard refresh
- [x] Smoke test 3: non-sorcery character form save unaffected (regression check)
- [ ] PR opened into `dev`

## Dev Agent Record

**Agent:** Claude Sonnet 4.6 (James)
**Date:** 2026-05-07

### File List

**Modified**
- `public/js/tabs/downtime-form.js` — line 716: `JSON.stringify(arr)`; lines 4578–4588: JSON.parse branch for server-returned targets

**New**
- `tests/dt-form-37-sorcery-targets-stringify.spec.js` — 5 Playwright tests (collect-side string check × 2, render-side parse check × 3)
- `specs/stories/dt-form.37-sorcery-targets-stringify.story.md` — this file

### Completion Notes

Two changes in `downtime-form.js`. (1) Line 716: wrapped the collected `arr` in `JSON.stringify` before assigning to `responses['sorcery_N_targets']` — the server schema expects `type: 'string'`, not an array. (2) Lines 4578–4588: replaced the two-branch ternary with an explicit if/else that handles three shapes: in-memory array (pre-save draft), JSON string from server (post-fix shape), legacy plain string (migration path), and absent/empty (blank placeholder).

Key test-setup lesson: the form's GET to `/api/downtime_submissions` includes query params (`?cycle_id=…`). Playwright glob patterns (`**/api/downtime_submissions`) are anchored and don't match the query-string variant; the mock must use a regex (`/\/api\/downtime_submissions/`) to capture the request. Also: all `qf-section` divs start with `class="collapsed"` — sections must be expanded (click `.qf-section-title`) before interacting with interior elements. The rite select only renders when `category: 'rite'` is present on `c.powers[]` entries.

All 5 E2E tests pass. Collect-side tests confirm the POST body contains a JSON string. Render-side tests confirm the picker repopulates correctly from JSON string, legacy plain string, and absent targets.

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-07 | James (story) | Story created from GH #117. Root cause identified: DTFP-6 structured target array never JSON.stringify'd; render path also mishandles round-tripped JSON string. Status → ready. |
| 2026-05-07 | James (dev) | Implemented both fixes; wrote 5 E2E tests; all pass. Status → review. |
