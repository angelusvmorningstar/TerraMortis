---
title: 'DT Story: Resources acquisition completion check ignores merit_actions_resolved'
type: 'fix'
issue: 456
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/456
branch: ms/issue-456-dt-story-resources-acq-pending
created: '2026-05-21'
status: review
recommended_model: 'sonnet — three-line fix at three call sites; fast'
context:
  - public/js/admin/downtime-story.js
---

## Intent

**Problem:** A Resources Acquisitions action validated in DT Processing still shows as
pending in DT Story, blocking sign-off.

**Confirmed case:** Carver (DT3) — Resources Acquisitions action, Validation Status =
Validated, ST note written. DT Story pill remains pending; section shows "N outcomes
still to record in DT Processing."

**Root cause — wrong resolved array in completion check:**

`meritSummaryComplete` has special handling for `'resources'` category actions. Instead
of reading `merit_actions_resolved[i].pool_status` (the array DT Processing actually
writes to), it reads `acquisitions_resolved[0]?.pool_status`. DT Processing writes the
validation status to `merit_actions_resolved` only — `acquisitions_resolved` is empty
for most submissions. So the resources check always sees `acqStatus = ''`, which is
neither `'validated'` nor `'skipped'`, and returns `false` (pending) regardless of the
actual validation state.

The same hardcoded-index bug (`acqRes[0]`) exists in the `renderMeritSummary` missing
count filter (lines 2314-2316), producing the "N outcomes still to record" message
incorrectly.

A third display bug: `renderMeritSummary` row rendering (line 2274) shows
`rev.outcome_summary?.trim()` for every row, but acquisitions never populate
`outcome_summary` — their narrative is in `merit_actions_resolved[i].notes_thread`.
So even after the completion fix, the row shows "— Outcome not yet recorded —"
instead of the ST note.

**Reference:** `meritSummaryComplete` already has the pattern correct for all other
merit categories: it checks `resolved[i]?.pool_status` (i.e. `merit_actions_resolved[i]`)
for `'skipped'` at line 2240. Resources just needs the same check for `'validated'`.

## Tasks

### T1 — Fix `meritSummaryComplete` resources check (lines 2241–2244)

Current (broken — reads `acquisitions_resolved[0]` which is empty):
```js
if (deriveMeritCategory(actions[i].merit_type) === 'resources') {
  const acqStatus = acqRes[0]?.pool_status || '';
  if (acqStatus !== 'validated' && acqStatus !== 'skipped') return false;
  continue;
}
```

Fixed — check `merit_actions_resolved[i].pool_status` first, fall back to
`acquisitions_resolved[0]` for any legacy submissions that do populate it:
```js
if (deriveMeritCategory(actions[i].merit_type) === 'resources') {
  const revStatus = resolved[i]?.pool_status || '';
  if (revStatus === 'validated' || revStatus === 'skipped') continue;
  const acqStatus = acqRes[0]?.pool_status || '';
  if (acqStatus !== 'validated' && acqStatus !== 'skipped') return false;
  continue;
}
```

### T2 — Fix `renderMeritSummary` missing count (lines 2314–2316)

Same fix pattern — `acqRes[0]` → check `resolved[i]` first:

Current:
```js
if (deriveMeritCategory(a.merit_type) === 'resources') {
  const acqStatus = acqRes[0]?.pool_status || '';
  return acqStatus !== 'validated' && acqStatus !== 'skipped';
}
```

Fixed:
```js
if (deriveMeritCategory(a.merit_type) === 'resources') {
  const revStatus = resolved[i]?.pool_status || '';
  if (revStatus === 'validated' || revStatus === 'skipped') return false;
  const acqStatus = acqRes[0]?.pool_status || '';
  return acqStatus !== 'validated' && acqStatus !== 'skipped';
}
```

Note: inside the `.filter()` callback at line 2311, `i` is the second parameter of the
`actions.filter((a, i) => ...)` call — it is in scope here.

### T3 — Fix `renderMeritSummary` row outcome display (line 2274)

Acquisitions never populate `outcome_summary` on `merit_actions_resolved[i]`. The ST
note lives in `rev.notes_thread` (an array of `{ author_name, text }` objects).

Current (line 2274):
```js
outcome: rev.outcome_summary?.trim() || '',
```

Fixed — for resources, use the latest notes_thread entry as the outcome text:
```js
outcome: (cat === 'resources' && Array.isArray(rev.notes_thread) && rev.notes_thread.length)
  ? rev.notes_thread[rev.notes_thread.length - 1]?.text?.trim() || ''
  : rev.outcome_summary?.trim() || '',
```

`cat` is derived two lines above at line 2268: `const cat = deriveMeritCategory(a.merit_type);`.
The expression is already in scope at line 2274.

### T4 — Playwright spec

File: `tests/fix-456-dt-story-resources-acq-complete.spec.js`

Use the `fake-test-token` + full API mock pattern from
`tests/fix-454-dt-story-status-loop-guard.spec.js`.

**Key fixture shape:** `buildMeritActions` builds resources acquisition actions from
`resp['acq_resource_rows']` (JSON array) or the `raw.acquisitions.resource_acquisitions`
blob. The simplest fixture uses the blob path (`_raw.acquisitions.resource_acquisitions`
+ `responses.resources_acquisitions`). The `merit_actions_resolved` array must be sized
to cover the action's index (the acquisition is appended after any sphere/contact/
retainer actions, so its index depends on how many other actions precede it).

For a submission with NO sphere/contact/retainer/status/skill actions, the resources
acquisition will be `merit_actions[0]` → `merit_actions_resolved[0]`.

**Fixtures:**

```js
// AC-1 + AC-3: validated acquisition
const SUB_VALIDATED_ACQ = {
  ...baseSub('sub-456-validated'),
  responses: {
    resources_acquisitions: 'Older audio equipment for the studio',
  },
  _raw: {
    sphere_actions:   [],
    contact_actions:  { requests: [] },
    retainer_actions: { actions: [] },
    acquisitions: {
      resource_acquisitions: 'Older audio equipment for the studio',
    },
  },
  merit_actions_resolved: [
    {
      pool_status:   'validated',
      notes_thread:  [{ author_name: 'Von Vagabond', text: 'Nicole finds stunning equipment.' }],
    },
  ],
  acquisitions_resolved: [],   // intentionally empty — mirrors real Carver data
};

// AC-2: pending acquisition (not yet validated)
const SUB_PENDING_ACQ = {
  ...baseSub('sub-456-pending'),
  responses: {
    resources_acquisitions: 'Rare antique clock',
  },
  _raw: {
    sphere_actions:   [],
    contact_actions:  { requests: [] },
    retainer_actions: { actions: [] },
    acquisitions: { resource_acquisitions: 'Rare antique clock' },
  },
  merit_actions_resolved: [
    { pool_status: 'pending' },
  ],
  acquisitions_resolved: [],
};

// AC-4 regression: validated acquisition alongside a standard sphere merit action
const SUB_MIXED = {
  ...baseSub('sub-456-mixed'),
  responses: {
    sphere_1_merit:   'Allies 2 (Police)',
    sphere_1_action:  'misc',
    sphere_1_outcome: 'Police allies maintained',
    resources_acquisitions: 'Studio amplifier',
  },
  _raw: {
    sphere_actions: [{ action_type: 'misc', desired_outcome: 'Police network' }],
    contact_actions:  { requests: [] },
    retainer_actions: { actions: [] },
    acquisitions: { resource_acquisitions: 'Studio amplifier' },
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Police allies maintained' },  // allies at index 0
    { pool_status: 'validated', notes_thread: [{ author_name: 'ST', text: 'Amplifier acquired.' }] }, // acq at index 1
  ],
  acquisitions_resolved: [],
};
```

**Tests:**

- **AC-1:** `SUB_VALIDATED_ACQ` → `merit_summary` section present, pill green (meritSummaryComplete returns true)
- **AC-2:** `SUB_PENDING_ACQ` → `merit_summary` section present, pill NOT green
- **AC-3:** `SUB_VALIDATED_ACQ` → row outcome contains ST note text ("Nicole finds stunning equipment")
- **AC-4:** `SUB_MIXED` → pill green (both allies + acquisition complete)

## Acceptance Criteria

- [ ] AC-1: A Resources Acquisitions action with `merit_actions_resolved[n].pool_status === 'validated'` shows the merit_summary section as complete and does not block sign-off
- [ ] AC-2: A Resources Acquisitions action with `pool_status !== 'validated'` (e.g. `'pending'`) still correctly shows as incomplete
- [ ] AC-3: The row in the merit summary ledger shows the ST notes_thread text as the outcome for a validated acquisition (not "— Outcome not yet recorded —")
- [ ] AC-4: A mixed submission (validated acquisition + resolved sphere merit) is fully complete and pill is green

## Dev Notes

**Why `acquisitions_resolved` is empty:**
DT Processing saves validation data to `merit_actions_resolved[i]`, not to
`acquisitions_resolved`. The `acquisitions_resolved` array is populated by a separate
acquisition-result tracking mechanism that may not be in use or may be unpopulated for
pre-fix submissions. The T1/T2 fix treats `merit_actions_resolved[i].pool_status` as
the primary authority (consistent with every other merit type) and keeps
`acquisitions_resolved[0]` as a legacy fallback.

**`resolved[i]` in the T2 filter:** The `.filter((a, i) => ...)` callback at line 2311
has both `a` (action) and `i` (index) in scope. `resolved` is `sub?.merit_actions_resolved || []`
defined at line 2259. `resolved[i]` is safe to use here.

**`notes_thread` shape:** `merit_actions_resolved[i].notes_thread` is an array of
`{ author_name: string, text: string }` objects. The last entry is the most recent note.
Use `rev.notes_thread[rev.notes_thread.length - 1]?.text` to get the latest. If
`notes_thread` is absent or empty, fall back to `''` (the row will show
"— Outcome not yet recorded —", which is correct for a validated-but-uncommented acq).

**No changes needed to `getApplicableSections`:** The `hasCategory` predicate checks
`merit_actions_resolved[i].pool_status !== 'skipped'`. For a validated acquisition,
`'validated' !== 'skipped'` → `true` → section is shown. This is correct.

**No changes needed to `buildMeritActions`:** The acquisitions section correctly reads
`acq_resource_rows` JSON or the blob fallback, and pushes actions with
`merit_type: 'Resources'` / `action_type: 'acquisition'`.

**Precedent pattern (fix #452, #454):** Same three-step approach: investigate root
cause from exact line numbers, two-line fix at each site, Playwright spec to cover
AC-1 through AC-4.

## Dev Agent Record

### Tasks Completed

- [x] T1 — `meritSummaryComplete` resources check
- [x] T2 — `renderMeritSummary` missing count
- [x] T3 — `renderMeritSummary` row outcome display
- [x] T4 — Playwright spec (4 tests: AC-1 through AC-4)

### Notes

T1/T2: `resolved[i]?.pool_status` is now checked first (primary authority, matching every other merit category); `acqRes[0]` kept as legacy fallback. T3: resources rows use `notes_thread[-1].text` as outcome since `outcome_summary` is never set for acquisitions. All 4 Playwright tests pass.
