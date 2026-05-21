---
title: 'DT Processing: missing Status action + merit_actions ordering mismatch'
type: 'fix'
issue: 460
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/460
branch: ms/issue-460-dt-processing-status-missing
created: '2026-05-21'
status: review
recommended_model: 'sonnet — two-file ordering fix + one-off data surgery; moderate scope'
context:
  - public/js/admin/downtime-story.js
  - public/js/admin/downtime-views.js
---

## Intent

**Problem:** Reed Justice (DT3) submitted three Status actions — Finance (grow), High
Society (grow), Underworld (investigate). Only Finance and High Society appeared in the
DT Processing panel. Status Underworld was never surfaced for ST resolution, leaving the
DT Story with "— Outcome not yet recorded —" for that row and blocking story sign-off.

**Two bugs compounding each other:**

### Bug A — Index mismatch between `buildMeritActions` and `buildProcessingQueue`

`buildMeritActions` in `downtime-story.js` (line 2130) appends Status actions **last**,
after acquisitions:

```
merit_actions index order (story): spheres → contacts → retainers → acquisitions → Status
```

`buildProcessingQueue` in `downtime-views.js` (line 3199) appends Status actions **into
the spheres array**, before contacts:

```
meritFlatIdx order (processing): spheres+Status → contacts → retainers
```

For Reed's DT3 this means the index the processing panel writes to does not match the
index the story reads from. E.g. `merit_actions_resolved[1]` (written by processing for
Status Finance) is what the story reads for **Contacts (Media)** (because Contacts is
index 1 in `buildMeritActions`). Status Finance in the story reads from a different slot
entirely, causing outcome cross-wiring and "Outcome not yet recorded" for Underworld.

### Bug B — Status Underworld absent from DT3 processing panel (historical)

The issue #344 fix (which added the Status append loop to `buildProcessingQueue`) was
either not yet deployed or partially applied when DT3 was processed. As a result, the ST
had no row to resolve for Reed's Underworld action. The outcome was never written.

**Current code** (with issue #344 in place, loop 1..5) will generate all N Status actions
correctly for future downtimes — Bug B is a data problem in DT3 only. Bug A is ongoing
and causes cross-wired outcomes for all submissions with both sphere/contacts AND Status
actions.

---

## Root cause files

| File | Lines | Role |
|------|-------|------|
| `public/js/admin/downtime-story.js` | 2130–2145 | Status append in `buildMeritActions` — too late in ordering |
| `public/js/admin/downtime-views.js` | 3199–3220 | Status append in `buildProcessingQueue` — canonical ordering |
| Reed's DT3 submission | MongoDB `downtime_submissions` | Has all 3 Status actions in `responses`; `merit_actions_resolved` has mismatched indices |

---

## Tasks

### T1 — Verify Reed's DT3 live data (investigate first)

Before touching code, query the live submission to confirm exact indices and what's
already in `merit_actions_resolved`. Run a Node script or use MongoDB MCP:

```js
// server/scripts/investigate-460-reed-status.js
const sub = await db.collection('downtime_submissions').findOne({
  character_name: /reed justice/i,
  cycle_id: /* DT3 cycle _id */,
});
console.log('responses.status_*:', Object.fromEntries(
  Object.entries(sub.responses || {}).filter(([k]) => k.startsWith('status_'))
));
console.log('merit_actions_resolved length:', (sub.merit_actions_resolved || []).length);
(sub.merit_actions_resolved || []).forEach((r, i) =>
  console.log(`  [${i}]:`, r?.outcome_summary?.slice(0, 60), '| pool_status:', r?.pool_status)
);
```

Record: which index has Finance's outcome, which has High Society's, which is empty or
has the Underworld narrative (if any), and what index the contacts outcome is at.

---

### T2 — Fix `buildMeritActions` ordering in `downtime-story.js`

**File:** `public/js/admin/downtime-story.js`

Move the Status/MCI block (currently lines 2130–2145, after acquisitions) to immediately
after the spheres block and before the contacts block. The target position is after line
2003 (end of the `else` clause for sphere keys) and before line 2005 (start of contacts).

**Before** (Status appended after acquisitions, around line 2130):
```js
  // ── Status / MCI ──
  // Issue #233 — form writes status_${n}_* for Status influence merits and
  // MCI standing merits (downtime-form.js:789-815) but no consumer was
  // normalising them. Appended last so flat indices for spheres / contacts /
  // retainers / acquisitions above are not disturbed. MCI labels route to
  // the 'status' category via the regex in deriveMeritCategory (Task 2).
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

**After** (move to after spheres, before contacts — same content, updated comment):
```js
  // ── Status / MCI ──
  // Issue #460 — must be appended immediately after spheres, matching the order
  // buildProcessingQueue uses (downtime-views.js:3199). Putting Status last (as
  // issue #233 did) creates a flat-index mismatch with merit_actions_resolved:
  // outcomes saved by the processing panel end up at the wrong story indices.
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

  // ── Contacts ──
```

**Delete** the original Status block from its old position (around line 2130) and update
the preceding comment that says "flat indices for ... acquisitions above are not
disturbed" — acquisitions are no longer the last group.

---

### T3 — Verify `buildProcessingQueue` guard condition is correct

**File:** `public/js/admin/downtime-views.js` lines 3203–3206

```js
const meritType = resp[`status_${n}_merit`];
const actionVal = resp[`status_${n}_action`];
if (!meritType || !actionVal) continue;
```

Confirm this is sufficient: the form only writes `status_n_merit` when `status_n_action`
is set (downtime-form.js:819), so a merit-but-no-action case should not arise. No code
change needed here — just verification.

---

### T4 — Data fix for Reed's DT3 Underworld action

After T1's investigation:

**Case A — `merit_actions_resolved[3]` is empty (most likely):**
The ST never resolved Underworld. The ST needs to enter an outcome. Since the story UI
has no inline-resolution path, write a one-off script:

```js
// server/scripts/fix-460-reed-dt3-underworld.js
// Populate merit_actions_resolved[3] for Reed's DT3 submission.
// Run AFTER confirming index 3 is Underworld via T1 investigation.
await db.collection('downtime_submissions').updateOne(
  { _id: new ObjectId('<Reed DT3 sub _id>') },
  { $set: {
    'merit_actions_resolved.3.outcome_summary': '<ST to provide outcome text>',
    'merit_actions_resolved.3.pool_status': 'resolved',
  }}
);
```

Coordinate with the ST to write the Underworld outcome text before running.

**Case B — outcome already exists but at wrong index:**
If T1 finds the Underworld narrative is stored at an unexpected index (e.g. index 4), the
ordering fix in T2 may be sufficient to align the story view. Verify by reloading the
story tab after T2 is deployed.

---

### T5 — Manual verification

After T2 is deployed and T4 data fix is applied:

1. Open the DT Story tab for DT3 → Reed Justice
2. STATUS section should show all three rows with outcomes:
   - Status (Finance): outcome present, no cross-wiring from Contacts
   - Status (High Society): outcome present
   - Status (Underworld): outcome present (not "— Outcome not yet recorded —")
3. CONTACTS section should show Contacts (Media) with correct contacts outcome
4. DT Story sign-off should no longer be blocked by Reed's Underworld row

Smoke-check one other character with both sphere/influence AND Status actions to confirm
no cross-wiring in another submission.

---

## What not to change

- `buildProcessingQueue` in `downtime-views.js` — the Status append ordering there is
  correct and was the canonical reference. Do not move it.
- `deriveMeritCategory` — category routing is fine.
- Player submission form — the `status_n_*` keys are stored correctly; this is a consumer
  issue only.
- Do not regenerate or re-index `merit_actions_resolved` for any submission other than
  Reed's DT3 unless the T1 investigation reveals broader cross-wiring. Minimise blast
  radius.

## Tests

No automated test suite. Verify manually via T5 above.

If writing a regression spec, the key invariant is:

> For a submission with N sphere actions + M Status actions + K contacts, the flat index
> of `merit_actions[j]` (Status action) produced by `buildMeritActions` must equal
> `meritFlatIdx` used in `buildProcessingQueue` for the same submission slot.

A unit test for `buildMeritActions` with a fixture that has 1 sphere + 2 Status + 1
contact should confirm: index 0 = sphere, index 1 = Status 1, index 2 = Status 2,
index 3 = contact.

---

## Dev Agent Record

### Implementation — 2026-05-22

**T1 — Live data confirmed (Case B):**
Reed's DT3 submission (`_id: 69fd4db79005f6883eb1d620`, `cycle_id: 69e955c784bbfc821bed2810`)
has `merit_actions_resolved` with 5 resolved entries written by the processing panel in order:
`[0] Allies Police → [1] Status Finance → [2] Status High Society → [3] Status Underworld → [4] Contacts Media`.
The Underworld outcome IS stored at `[3]` with pool_status `resolved`.
No data write needed — fixing the code ordering in T2 aligns the story's read path to [3].

**T2 — Status block moved in `buildMeritActions` (`downtime-story.js`):**
Moved the Status/MCI loop from after acquisitions (~line 2191) to immediately after the spheres
block (before contacts, ~line 2047). New order: spheres → Status/MCI → contacts → retainers → acquisitions.
Updated JSDoc to reflect new ordering. Updated Status block comment to reference issue #460 and
explain the flat-index invariant. Deleted the old Status block. Parse check passed.

**T3 — Guard confirmed:**
`buildProcessingQueue` in `downtime-views.js` already has `if (!meritType || !actionVal) continue`
(added in fix #454). No change needed.

**T4 — No data fix required:**
Case B confirmed via T1. The code fix in T2 aligns story indices to match the already-written
`merit_actions_resolved` values. Status Underworld outcome at [3] will render correctly once deployed.

**T5 — Manual verification required:**
Open DT Story tab → DT3 → Reed Justice. Confirm:
- Status Finance: "Cannot Grow at this phase, +3 Bonus..." ← reads [1]
- Status High Society: "Cannot Grow at this phase, +3 Bonus..." ← reads [2]
- Status Underworld: "The Underworld is the Sphere with the most people..." ← reads [3]
- Contacts (Media): "The reports come in and it seems like no one is calling in shenanigans" ← reads [4]

### File List
- `public/js/admin/downtime-story.js` — `buildMeritActions`: Status/MCI block moved after spheres, before contacts

### Change Log
- 2026-05-22: fix(#460) — `buildMeritActions` Status ordering aligned with `buildProcessingQueue`; Status/MCI now inserted after spheres, before contacts, matching the flat-index write order. Resolves cross-wired outcomes and missing Underworld row for Reed's DT3.
