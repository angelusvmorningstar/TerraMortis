# Story fix.400: DT Processing — phantom merit action rows when player submitted no action

**Story ID:** fix.400
**Status:** review
**Date:** 2026-05-19
**Issue:** [#400](https://github.com/angelusvmorningstar/TerraMortis/issues/400)
**Branch:** ms/issue-400-dt-processing-phantom-merit-rows

---

## User Story

As an ST using DT Processing,
I want merit action rows to appear only for merits the player opted into,
so that I don't have to manually soft-delete 30+ phantom entries every downtime cycle.

---

## Background

The DT form (`downtime-form.js`) collects sphere and status merit action data for every
merit slot on the character's sheet, regardless of whether the player toggled the gate
to 'yes' and filled in any action. Specifically, `sphere_${n}_merit` (the merit label)
is unconditionally written for all `n ≤ maxSpheres`, even when `gateValues[merit_${key}]`
is 'no' (player did not opt in).

On the admin side, `downtime-views.js` generates a DT Processing queue row for every
slot where `sphere_${n}_merit` is present. The only guard is `if (!meritType) continue;`
— always true when the character has a sphere merit. Action defaults to `'misc'`.

Result: a character with 6 sphere/status merits who submits no merit actions generates
6 phantom rows in the DT Processing queue. STs have been manually soft-deleting ~32 of
these per cycle using the "Deleted Actions" bin (a persistent workaround of ~15-20 mins
per cycle). The same pattern exists for status merits (`status_${n}_*`).

The fix has two parts:
1. **Form-side gate** — only write `sphere_${n}_merit` / `status_${n}_merit` when the
   player's gate is 'yes'.
2. **Admin-side guard** — skip queue row generation when `sphere_${n}_action` is absent,
   so existing submissions with phantom labels are retroactively suppressed.

---

## Acceptance Criteria

- [x] Given a character has 3 Sphere of Influence merits and the player sets none of
      their gates to 'yes', when the submission is saved, `sphere_1_merit` through
      `sphere_3_merit` are absent from the submission document.
- [x] Given a character has 3 Sphere of Influence merits and the player sets gate 1
      to 'yes' only, when the submission is saved, only `sphere_1_merit` is present.
- [x] Given an existing submission with `sphere_N_merit` present but `sphere_N_action`
      empty, when DT Processing renders the action queue, no row is generated for that slot.
- [x] `_merit_${key}` gate toggle values continue to be written to the submission
      document (form reload and audit trail unaffected).
- [x] No regression: opted-in merit actions with filled action/outcome/description
      continue to appear correctly in DT Processing.

---

## Implementation

### File 1: `public/js/tabs/downtime-form.js`

#### Change A — Gate the sphere merit label write (line 780-781)

Current:
```js
const m = detectedMerits.spheres[n - 1];
if (m) responses[`sphere_${n}_merit`] = meritLabel(m);
```

New:
```js
const m = detectedMerits.spheres[n - 1];
if (m && gateValues[`merit_${meritKey(m)}`] === 'yes') {
  responses[`sphere_${n}_merit`] = meritLabel(m);
}
```

This means: if the player never toggled the section open (gate stayed 'no'), no merit
label is written, and the admin queue builder's `if (!meritType) continue;` guard will
skip this slot entirely for new submissions.

#### Change B — Gate the status merit label write (line 813-814)

Current:
```js
const sm = detectedMerits.status[n - 1];
if (sm) responses[`status_${n}_merit`] = meritLabel(sm);
```

New:
```js
const sm = detectedMerits.status[n - 1];
if (sm && gateValues[`merit_${meritKey(sm)}`] === 'yes') {
  responses[`status_${n}_merit`] = meritLabel(sm);
}
```

**Important:** `_merit_${key}` at line 751 (the gate toggle state written unconditionally
for all spheres/contacts/retainers) must NOT be changed. It is needed for:
- Form reload: restoring the toggle state when a player reopens a draft
- Audit trail: STs can see which merits a player had available, even if not acted on

Only the merit *label* write (which is what triggers row generation on the admin side)
needs to be gated.

---

### File 2: `public/js/admin/downtime-views.js`

Two functions build the `spheres` array from flat response keys. Both must have the
retroactive guard added so existing live submissions with phantom labels are suppressed.

#### Change C — `buildActionQueue()` (line ~3107-3109)

Current:
```js
for (let n = 1; n <= 5; n++) {
  const meritType = resp[`sphere_${n}_merit`];
  if (!meritType) continue;
  spheres = [...spheres, { ... }];
}
```

New — add a second condition to the guard:
```js
for (let n = 1; n <= 5; n++) {
  const meritType = resp[`sphere_${n}_merit`];
  const actionVal = resp[`sphere_${n}_action`];
  if (!meritType || !actionVal) continue;
  spheres = [...spheres, { ... }];
}
```

`actionVal` is empty string when the player never touched the action dropdown. This
retroactively suppresses phantom rows from all existing submissions.

#### Change D — `_gatherMeritAmbience()` (line ~3804-3808)

The same flat-key `spheres` builder exists in this function and MUST receive the same
guard. Both functions share `meritFlatIdx` semantics — if one skips a slot the other
doesn't, the `merit_actions_resolved` flat index alignment breaks.

Current:
```js
for (let n = 1; n <= 5; n++) {
  const meritType = resp[`sphere_${n}_merit`];
  if (!meritType) continue;
  spheres = [...spheres, { ... }];
}
```

New:
```js
for (let n = 1; n <= 5; n++) {
  const meritType = resp[`sphere_${n}_merit`];
  const actionVal = resp[`sphere_${n}_action`];
  if (!meritType || !actionVal) continue;
  spheres = [...spheres, { ... }];
}
```

> **Critical:** The status merit loop (lines ~3149-3179) does NOT have a separate sphere
> builder loop — status merits are appended directly to `spheres` with the same
> `if (!meritType) continue;` guard. Apply the same `|| !actionVal` addition there too
> (the `actionVal` being `resp[status_${n}_action]` for that loop).

#### Change E — Status merit guard in `buildActionQueue()` (line ~3149-3165)

Current:
```js
for (let n = 1; n <= 5; n++) {
  const meritType = resp[`status_${n}_merit`];
  if (!meritType) continue;
  spheres = [...spheres, { ... }];
}
```

New:
```js
for (let n = 1; n <= 5; n++) {
  const meritType = resp[`status_${n}_merit`];
  const actionVal = resp[`status_${n}_action`];
  if (!meritType || !actionVal) continue;
  spheres = [...spheres, { ... }];
}
```

---

## Dev Notes

### meritKey() and gateValues shape

`meritKey(merit)` (line 226) produces: `${merit.name}_${merit.rating}_${area}`.toLowerCase().replace(/[^a-z0-9]+/g, '_')`

`gateValues[merit_${key}]` is set to `'yes'` or `'no'` at line 2573 when the player
toggles a merit section. It defaults to `'no'` (falsy) if never set.

The condition `gateValues[merit_${meritKey(m)}] === 'yes'` is therefore the correct
gate check — strict equality with `'yes'`, not truthiness.

### What `_merit_${key}` is for vs `sphere_${n}_merit`

| Field | Written when | Purpose |
|---|---|---|
| `_merit_${key}` | Always, for all detected merits | Gate toggle state; form reload; audit |
| `sphere_${n}_merit` | **Currently** always; **after fix** only when gate = 'yes' | Triggers queue row on admin side |

Do not conflate them. `_merit_${key}` is a boolean-in-string (`'yes'/'no'`).
`sphere_${n}_merit` is the human-readable merit label string (e.g. `"Allies ●●● (Health)"`).

### meritFlatIdx alignment is critical

`merit_actions_resolved[]` is a flat array on the submission document, indexed by
the order entries are pushed into `spheres` + contacts + retainers during queue
building. If the two functions (`buildActionQueue` and `_gatherMeritAmbience`) don't
skip the same slots, their flat indices will diverge and resolved outcomes will be
attributed to the wrong actions.

The guard `|| !actionVal` must be applied identically in both functions.

### Out of scope

- Contacts (`contact_${n}_*`): already guarded by `if (!req) continue;` on the request
  text — no phantom issue.
- Retainers: `raw.retainer_actions?.actions` — legacy shape; no phantom issue.
- Mentors, staff: not yet wired into the queue builder.
- One-time cleanup of already-soft-deleted rows in the "Deleted Actions" bin: not
  needed — the guard suppresses phantoms at render time; deleted rows are tracked in
  `st_review.deleted_action_keys` and will simply never re-appear.

### Regression risk

The only regression risk is an opted-in submission where the player selected a gate but
left `sphere_${n}_action` at its default empty value (no action chosen). In that case
the admin-side guard would suppress the row. This is correct behaviour — if a player
activated the section but chose no action, there is nothing to process. The form's
action dropdown defaults to blank (not 'misc') for the app-form shape.

---

## Files to Change

| File | Change |
|---|---|
| `public/js/tabs/downtime-form.js` | Lines 780-781: gate sphere merit label write; lines 813-814: gate status merit label write |
| `public/js/admin/downtime-views.js` | Lines ~3107-3109: add `|| !actionVal` guard (sphere, buildActionQueue); lines ~3149-3165: same for status loop; lines ~3804-3808: same guard in `_gatherMeritAmbience` |

No schema changes. No API changes. No CSS changes.

---

## Dev Agent Record

### Files Changed

- `public/js/tabs/downtime-form.js` — Changes A & B: gated `sphere_${n}_merit` and `status_${n}_merit` label writes
- `public/js/admin/downtime-views.js` — Changes C, D & E: added `|| !actionVal` guard to sphere loop in `buildActionQueue`, status loop in `buildActionQueue`, and sphere loop in `_gatherMeritAmbience`
- `server/tests/fix.400.phantom-merit-rows.test.js` — 18 new Vitest tests

### Completion Notes

All 5 changes implemented as specified. Dev merge from origin/dev was required first — `Morningstar` was behind and the status merit loop (Issue #344 / PR #395) was absent on that branch.

Discovery: `_gatherMeritAmbience` did NOT receive the status merit loop from PR #395 (only `buildActionQueue` did). The meritFlatIdx alignment between the two functions is already diverged for status merits — this is a pre-existing issue, not introduced by fix.400. Flagged for follow-up.

18 tests pass, 45 related tests pass, 0 regressions.

---

## Testing

The Vitest suite in `server/tests/` uses the mirror-test pattern (inline the browser-only
logic in a server-side test file). Write a new test file `server/tests/fix.400.phantom-merit-rows.test.js` covering:

- AC1: submission with gate='no' for all spheres → no `sphere_N_merit` keys in responses object
- AC2: submission with gate='yes' for slot 1 only → only `sphere_1_merit` present
- AC3 (admin guard): `spheres` array built from responses where `sphere_N_merit` present
  but `sphere_N_action` absent → entry not pushed to spheres
- AC4: `_merit_${key}` is present regardless of gate value
- AC5: opted-in slot with action filled → entry correctly included in spheres array
