---
title: 'DT Story: status loop phantom slot guard + MCI category fix'
type: 'fix'
issue: 454
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/454
branch: ms/issue-454-dt-story-status-loop-guard
created: '2026-05-21'
status: review
recommended_model: 'sonnet — two-line fix at two call sites; fast'
context:
  - public/js/admin/downtime-story.js
---

## Intent

**Problem:** Two related bugs in `downtime-story.js` cause phantom and mis-categorised rows
in the DT Story view:

**Bug A — Status loop missing `actionVal` guard (lines 2136–2145):**
The `buildMeritActions` function has four loops; the sphere loop was fixed by issue #452 to
skip slots where the player set a merit type but left `action` empty ("No Action Taken").
The status loop (handling Status influence merits and MCI) has the identical missing guard.
When a player selects an MCI or Status merit in the DT form and then changes their mind
back to "No Action Taken", `status_N_merit` remains in `responses` but `status_N_action`
is empty. The current loop skips only on `!mt` — it does not check `actionVal` — so it
pushes a phantom action with `action_type: 'misc'`. This phantom row then renders in the
DT Story merit summary and shows "No outcome recorded", blocking sign-off.

**Bug B — `deriveMeritCategory` regex mismatch for MCI (line 2158):**
`deriveMeritCategory` is called to route merit actions to the correct section header
("INFLUENCE", "STATUS", etc.). The regex `/mystery cult initiate/` does not match the
real merit label stored in responses: `"Mystery Cult Initiation ●●●●●"`. The substring
`"initiate"` is not present in `"initiation"` — they diverge at position 8. As a result,
MCI actions fall through to the generic `return 'misc'` path and render under "INFLUENCE"
instead of "STATUS".

**Confirmed root cause via MongoDB inspection of DT3 Brandy LaRoux submission
(`_id: 69ff11e7de8056d135a7557b`):**
- `responses.status_1_merit: "Mystery Cult Initiation ●●●●●"` — present
- `responses.status_1_action: ""` — empty (player changed mind after setting)
- Phantom row appeared in DT Story under "INFLUENCE" instead of "STATUS"

**Reference implementation in `downtime-views.js:3203–3206`** already has both correct
patterns — the status loop there has the `actionVal` guard and `if (!meritType || !actionVal) continue`.

## Tasks

### T1 — Status loop `actionVal` guard (`downtime-story.js:2136–2145`)

Current (broken):
```js
for (let n = 1; n <= 5; n++) {
  const mt = resp[`status_${n}_merit`];
  if (!mt) continue;
  actions.push({
    merit_type:      mt,
    action_type:     resp[`status_${n}_action`]      || 'misc',
    desired_outcome: resp[`status_${n}_outcome`]     || '',
    description:     resp[`status_${n}_description`] || '',
  });
}
```

Fixed — mirror the sphere loop pattern from fix #452 and `downtime-views.js:3203–3206`:
```js
for (let n = 1; n <= 5; n++) {
  const mt        = resp[`status_${n}_merit`];
  const actionVal = resp[`status_${n}_action`];
  if (!mt || !actionVal) continue;
  actions.push({
    merit_type:      mt,
    action_type:     actionVal,
    desired_outcome: resp[`status_${n}_outcome`]     || '',
    description:     resp[`status_${n}_description`] || '',
  });
}
```

Drop the `|| 'misc'` fallback — an `action_type` of `'misc'` on a phantom slot was the
visible symptom; validated `actionVal` is always non-empty here so the fallback is dead code.

### T2 — Fix `deriveMeritCategory` MCI regex (`downtime-story.js:2158`)

Current (broken):
```js
if (/mystery cult initiate/.test(s))   return 'status';  // #233 — MCI grouped with Status
```

Fixed — truncate stem to match both "initiate" and "initiation":
```js
if (/mystery cult initiat/.test(s))    return 'status';  // #233 — MCI grouped with Status
```

The string `"Mystery Cult Initiation"` lowercased is `"mystery cult initiation"`. The
substring `"initiate"` does not appear in it; `"initiat"` (7 chars) does and will also
match any future variant spelling.

### T3 — Playwright spec

File: `tests/fix-454-dt-story-status-loop-guard.spec.js`

Use the `fake-test-token` + full API mock pattern established in
`tests/fix-429-dt-story-skip-deleted-actions.spec.js`. Build the `setup()` helper the same
way (mock all six API routes, navigate to `/admin.html`, click through to Story tab,
click first pill, wait for `.dt-story-char-content`).

**Submission fixtures:**

```js
// Status merit present, action empty — the phantom slot that must be suppressed
const SUB_STATUS_PHANTOM = {
  ...baseSub('sub-454-phantom'),
  responses: {
    sphere_1_merit: 'Allies 2 (Police)',
    sphere_1_action: 'misc',
    sphere_1_outcome: 'Police allies active',
    status_1_merit: 'Mystery Cult Initiation ●●●●●',
    status_1_action: '',           // player changed mind — action empty
  },
  _raw: {
    sphere_actions: [{ action_type: 'misc', desired_outcome: 'Police allies' }],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Police allies active' },
  ],
};

// MCI with a real action — must appear in the STATUS section (not INFLUENCE)
const SUB_MCI_ACTIVE = {
  ...baseSub('sub-454-mci-active'),
  responses: {
    status_1_merit: 'Mystery Cult Initiation ●●●●●',
    status_1_action: 'misc',
    status_1_outcome: 'Deepened cult ties',
  },
  _raw: {
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Cult ties reinforced' },
  ],
};

// Status merit with real action — must appear in STATUS section
const SUB_STATUS_ACTIVE = {
  ...baseSub('sub-454-status-active'),
  responses: {
    status_1_merit: 'Status 2 (Invictus)',
    status_1_action: 'misc',
    status_1_outcome: 'Maintain standing',
  },
  _raw: {
    sphere_actions: [],
    contact_actions: { requests: [] },
    retainer_actions: { actions: [] },
  },
  merit_actions_resolved: [
    { pool_status: 'confirmed', outcome_summary: 'Maintained Invictus standing' },
  ],
};
```

**Tests (AC-1 through AC-4):**

- **AC-1:** `SUB_STATUS_PHANTOM` → `merit_summary` section contains allies outcome ("Police allies active"), does NOT contain MCI merit label ("Mystery Cult Initiation"), pill is green (only one active action, already resolved)
- **AC-2:** `SUB_MCI_ACTIVE` → `merit_summary` section present, outcome ("Cult ties reinforced") appears, section does NOT contain "INFLUENCE" header text or fall-through "misc" category; MCI action is present (non-null section)
- **AC-3:** `SUB_STATUS_ACTIVE` → `merit_summary` section contains status outcome, status action not suppressed
- **AC-4 (regression):** Submission with no status loop fields at all → existing sphere-path actions unaffected

**Note on checking section header:** `getMeritSectionHtml` helper returns inner HTML of
`.dt-story-section[data-section="merit_summary"]`. Check for presence/absence of specific
outcome strings rather than trying to inspect heading text — the section heading is
rendered inside the same element and can vary.

## Acceptance Criteria

- [ ] AC-1: A status merit slot with `status_N_merit` set but `status_N_action` empty does not produce a phantom row in the merit summary
- [ ] AC-2: An MCI action with a real `status_N_action` renders in the merit summary (slot is not suppressed)
- [ ] AC-3: An active Status or MCI action routes to the correct merit summary section (not mis-categorised under a generic heading)
- [ ] AC-4: Submissions with no status-loop fields produce identical output to before (regression guard)

## Dev Notes

**Precedent — fix #452 (sphere loop, merged to dev):**
The sphere flat-response loop at `downtime-story.js:1993–2004` was fixed in the same
session that discovered this bug. The pattern is identical:
```js
const actionVal = resp[`sphere_${n}_action`];
if (!mt || !actionVal) continue;
// use actionVal directly, not resp[...] || 'misc'
```

**Why `|| 'misc'` must go:**
`action_type` is used by rendering code to determine display labels (e.g. "Accumulate",
"Maintain"). If `action_type` is `'misc'` from the fallback on a phantom slot, the row
renders as valid action "No specific type". After the guard, `actionVal` is guaranteed
non-empty so the fallback is unreachable dead code.

**`deriveMeritCategory` is intentionally duplicated:**
The comment at line 2152 notes `Mirrors _parseMeritType in downtime-views.js — duplicated
per NFR-DS-01`. Do not refactor to a shared helper; change only the regex on line 2158.

**Why `initiat` not `initiation`:**
`"initiat"` is the longest common prefix of `"initiate"` and `"initiation"`. Using the
full word `"initiation"` would break if any future merge label ever uses the "initiate"
spelling. The 7-char stem is the safe minimum.

**`downtime-views.js` reference (already correct):**
`downtime-views.js:3203–3206` shows the fixed pattern verbatim:
```js
for (let n = 1; n <= 5; n++) {
  const meritType = resp[`status_${n}_merit`];
  const actionVal = resp[`status_${n}_action`];
  if (!meritType || !actionVal) continue;   // guard present
  ...
}
```

**Test fixture note — `buildMeritActions` always overwrites:**
`buildMeritActions` is called at load time (line 172) and always rebuilds `merit_actions`
from `responses` + `_raw.sphere_actions`. Do not set `merit_actions` directly on
fixtures — use `responses.sphere_N_*`, `responses.status_N_*`, and `_raw.sphere_actions`.
This was the key lesson from the fix-452 QA pass where pre-built `merit_actions` on
fixtures were silently overwritten.

## Dev Agent Record

_To be completed by the implementing agent._

### Tasks Completed

- [x] T1 — Status loop `actionVal` guard
- [x] T2 — `deriveMeritCategory` MCI regex
- [x] T3 — Playwright spec (4 tests: AC-1 through AC-4)

### Notes

T1: Changed lines 2136–2145 of downtime-story.js. Extracted `actionVal`, added `if (!mt || !actionVal) continue`, replaced `resp[...] || 'misc'` with direct `actionVal`.

T2: Changed line 2158 — `/mystery cult initiate/` → `/mystery cult initiat/`. Stem `"initiat"` matches both "Initiate" and "Initiation"; the 7-char prefix is the longest common prefix of the two spellings.

T3: `tests/fix-454-dt-story-status-loop-guard.spec.js` — 4 tests, 4/4 passing in 32.8s.
