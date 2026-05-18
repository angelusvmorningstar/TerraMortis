---
title: "DT Processing: Status and Retainer actions missing from queue"
issue: 344
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/344
branch: ms/issue-344-dt-processing-retainer-status
status: review
---

# Story fix.55: DT Processing — Status and Retainer Actions Missing from Queue

## Status: review

## Story

**As an** ST processing downtimes,
**I want** Status and Retainer merit actions to appear in the processing queue,
**so that** I can review and roll those actions the same way I do Allies actions.

---

## Background

The DT form has three separate merit-action sections that write to three distinct sets of response keys:

| Section | Form keys written | Queue builder reads |
|---------|-------------------|---------------------|
| Sphere (Allies) | `sphere_${n}_merit`, `sphere_${n}_action`, etc. | ✅ flat-key fallback loop (~line 3107) |
| Status | `status_${n}_merit`, `status_${n}_action`, etc. | ❌ **no reader** |
| Retainer | `retainer_${n}_merit`, `retainer_${n}_type`, `retainer_${n}_task` | ❌ reads `raw.retainer_actions?.actions` which is always `[]` for app-form submissions |

This is the same class of bug that affected Mentor and Staff actions — both were invisible until issue #198/202 added flat-key fallback loops for them (~lines 3302–3343 in `downtime-views.js`). Status and Retainer simply never got the same treatment.

---

## Acceptance Criteria

- [ ] AC1: Given a submission with one or more Status merit actions (n ≥ 1), when the ST opens the processing queue, then each Status action appears as a queue row in the `status` phase section (phase 9).
- [ ] AC2: Given a submission with one or more Retainer actions (`retainer_${n}_task` or `retainer_${n}_type` present), when the ST opens the processing queue, then each Retainer action appears as a queue row in the `resources_retainers` phase section (phase 12), consistent with how Mentor actions are displayed.
- [ ] AC3: Ally (sphere) actions, Mentor actions, Staff actions, and Contact actions continue to appear correctly — no regression.
- [ ] AC4: The dice pool auto-calculation (`dots × 2 + 2`) is applied to Status rows (same as Allies and Retainers via `_computeMeritPoolSize`).
- [ ] AC5: The `meritCategory` on Status entries is `'status'` and on Retainer entries is `'retainer'`, so existing phase routing logic, panel rendering, and `isAlliesAction` territory-pills flag all work without further changes.

---

## Root Cause

`buildProcessingQueue()` in `public/js/admin/downtime-views.js` (~line 3103) has this pattern for Allies:

```js
let spheres = raw.sphere_actions || [];
if (!spheres.length) {
  // Flat-key fallback for app-form submissions
  for (let n = 1; n <= 5; n++) {
    const meritType = resp[`sphere_${n}_merit`];
    if (!meritType) continue;
    spheres = [...spheres, { merit_type: meritType, action_type: resp[`sphere_${n}_action`] || 'misc', ... }];
  }
}
```

There is **no equivalent block for Status**, and the Retainer block reads from `raw.retainer_actions?.actions` (always `[]` for the app form):

```js
const retainers = raw.retainer_actions?.actions || [];
// ← no flat-key fallback here
```

---

## Fix: Add Two Flat-Key Fallback Loops

All changes are in `buildProcessingQueue()` in `public/js/admin/downtime-views.js`.

### 1 — Status flat-key fallback (insert after the existing `spheres` block, before the `contacts` block)

The form writes up to 5 status slots. Each slot has:
- `resp[\`status_${n}_merit\`]` — merit label string (e.g. `"Status 3 (City)"`)
- `resp[\`status_${n}_action\`]` — action type string
- `resp[\`status_${n}_outcome\`]` — desired outcome
- `resp[\`status_${n}_description\`]` — description
- `resp[\`status_${n}_territory\`]` — territory slug
- `resp[\`status_${n}_target_type\`]`, `resp[\`status_${n}_target_value\`]`, `resp[\`status_${n}_target_other\`]` — target picker
- `resp[\`status_${n}_investigate_lead\`]` — investigate lead

Inject these as extra entries into the existing `spheres` array (so `meritFlatIdx` accounting stays correct and the `_parseMeritType` category detection returns `'status'` automatically):

```js
// Flat-key fallback for Status merit actions (app-form submissions)
// Status slots write status_${n}_* keys — not sphere_${n}_* — so they
// are never picked up by the sphere fallback above.
for (let n = 1; n <= 5; n++) {
  const meritType = resp[`status_${n}_merit`];
  if (!meritType) continue;
  spheres = [...spheres, {
    merit_type:       meritType,
    action_type:      resp[`status_${n}_action`]        || 'misc',
    desired_outcome:  resp[`status_${n}_outcome`]       || '',
    description:      resp[`status_${n}_description`]   || '',
    territory:        resp[`status_${n}_territory`]     || '',
    target_type:      resp[`status_${n}_target_type`]   || '',
    target_value:     resp[`status_${n}_target_value`]  || '',
    target_other:     resp[`status_${n}_target_other`]  || '',
    investigate_lead: resp[`status_${n}_investigate_lead`] || '',
    primary_pool:     null,
    cast:             '',
  }];
}
```

By appending to `spheres`, these entries flow through the existing `spheres.forEach` loop where `_parseMeritType(action.merit_type)` will correctly return `category: 'status'`, triggering `phaseNum = 9` and `isAlliesAction = true` (for territory pills).

**Important**: Run this loop **only when `raw.sphere_actions` was empty** (i.e., inside the same `if (!spheres.length)` guard or after the sphere fallback), OR run it unconditionally after sphere collection — but ensure it does not double-count a submission that stores both `raw.sphere_actions` and flat keys. Safe approach: append to `spheres` unconditionally after the sphere fallback block, skipping any n where a sphere slot already occupies that flat index (or simply always append — `_parseMeritType` will set category correctly regardless).

The simplest correct approach: run this loop **outside** the `if (!spheres.length)` guard, after it, always appending. App-form submissions never populate `raw.sphere_actions`, so there is no double-count risk.

### 2 — Retainer flat-key fallback (after the existing mentor/staff loops, ~line 3343)

Mirror the Mentor pattern exactly. The form writes per-retainer:
- `resp[\`retainer_${n}_merit\`]` — merit label (e.g. `"Retainer"` or `"Attaché (Butler)"`)
- `resp[\`retainer_${n}_type\`]` — target/type text
- `resp[\`retainer_${n}_task\`]` — task description

Compose a description combining type + task (same pattern as `_composeDirectedDesc` used for mentor/staff):

```js
for (let n = 1; n <= 10; n++) {
  const task    = resp[`retainer_${n}_task`];
  const type    = resp[`retainer_${n}_type`];
  const meritLb = resp[`retainer_${n}_merit`];
  if (!task && !type) continue;
  queue.push({
    key: `${sub._id}:merit:${meritFlatIdx}`,
    subId: sub._id,
    charName,
    phase: PHASE_NUM_TO_LABEL[12],
    phaseNum: 12,
    actionType: 'resources_retainers',
    label: meritLb ? `${meritLb}: Directed Action` : 'Retainer: Directed Action',
    description: _composeDirectedDesc(meritLb, type || '', task || ''),
    source: 'merit',
    meritCategory: 'retainer',
    actionIdx: meritFlatIdx,
    poolPlayer: '',
  });
  meritFlatIdx++;
}
```

This goes after the existing staff loop (~line 3343) and before the `// ── Acquisitions ──` comment.

**Guard**: The existing `const retainers = raw.retainer_actions?.actions || []` plus `retainers.forEach` loop at ~line 3267 handles legacy/CSV-imported submissions. This new loop handles app-form submissions. A submission won't have both — so no double-count risk.

---

## Key File

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | `buildProcessingQueue()` — add Status flat-key append + Retainer flat-key loop |

No other files need to change. Rendering, phase routing, and panel logic already handle `category: 'status'` and `category: 'retainer'` correctly.

---

## Dev Notes

### Where to insert

- **Status block**: After the sphere flat-key fallback `for (let n = 1; n <= 5; n++) { ... spheres = [...spheres, {...}] }` block ends (i.e., after the closing `}` of that `if (!spheres.length)` block), before `let contacts = ...`.
- **Retainer block**: After the staff flat-key loop (last `}` before the `// ── Acquisitions ──` comment).

### Why Status goes into `spheres` not a separate array

`meritFlatIdx` is a single sequential counter across spheres → contacts → retainers. It maps to `merit_actions_resolved[meritFlatIdx]` for ST overrides. Appending status entries to `spheres` preserves this indexing automatically. If Status were pushed directly to `queue` outside the `spheres.forEach`, `meritFlatIdx` would be out of sync and ST overrides would apply to the wrong action.

### `isAlliesAction` on status entries

`isAlliesAction = meritCategory === 'allies' || meritCategory === 'status'` (line 3174). Since `_parseMeritType` on a `status_N_merit` string (e.g. `"Status 3 (City)"`) returns `category: 'status'`, territory pills will render correctly for these entries automatically.

### Retainer `_composeDirectedDesc` availability

`_composeDirectedDesc` is defined at ~line 3298, before the mentor loop. The new retainer loop sits after the staff loop (~line 3343), so it is within scope.

### Reference patterns

| Pattern | Lines (approx) |
|---------|---------------|
| Sphere flat-key fallback | 3106–3138 |
| Retainer direct array read | 3149 |
| `spheres.forEach` → queue push | 3154–3247 |
| Contacts flat-key fallback | 3140–3148 |
| Mentor flat-key loop | 3302–3322 |
| Staff flat-key loop | 3323–3343 |

---

## Verification

1. Open a submission from a character with Status merits and at least one Status action filled in.
2. Open DT Processing — confirm the Status action row appears in the queue under the "Status" section.
3. Expand the row — confirm the pool builder shows `(dots × 2) + 2` dice, merit chip shows `STATUS`, territory pills render.
4. Open a submission from a character with a Retainer and a task filled in.
5. Confirm a "Retainer: Directed Action" row appears in the queue under the "Retainers" section.
6. Confirm existing Ally, Mentor, Staff, and Contact rows are unaffected.

---

## Files Modified

- `public/js/admin/downtime-views.js`

## Dev Agent Record

### Completion Notes

Implemented two flat-key fallback loops in `buildProcessingQueue()`:

1. **Status loop** (~line 3149): Reads `status_${n}_merit/action/outcome/description/territory/target_type/target_value/target_other/investigate_lead` (n=1..5) and appends each populated slot to the existing `spheres` array. Entries flow through the `spheres.forEach` loop unchanged — `_parseMeritType` returns `category:'status'`, triggering phase 9, `isAlliesAction:true`, and pool auto-calc via `_computeMeritPoolSize`.

2. **Retainer loop** (~line 3365): Reads `retainer_${n}_type/task/merit` (n=1..10) and pushes directly to `queue` (phase 12, `resources_retainers`), mirroring the existing Mentor pattern. `_composeDirectedDesc` composes the label from merit label + type + task.

Parse check passed. No rendering changes required — all phase routing, panel rendering, and territory-pills logic already handled both categories correctly.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-18 | 1.0 | Initial story — root cause identified; fix specified | Bob (bmad-agent-sm) |
| 2026-05-18 | 1.1 | Implemented — two flat-key loops added to buildProcessingQueue() | Dev agent |
