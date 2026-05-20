# Story fix.366: DT Story — fix territory field name mismatch in patrol and ambience context builders

**Story ID:** fix.366
**Epic:** DT Story tab fixes
**Status:** review
**Date:** 2026-05-18
**Issue:** [#366](https://github.com/angelusvmorningstar/TerraMortis/issues/366)
**Branch:** ms/issue-366-territory-unknown-field-mismatch

---

## User Story

As an ST using the DT Story tab, when I click "Copy Context" on a Patrol/Scout or Ambience Increase project card, I want the territory field in the generated prompt to show the actual territory the player targeted — not "Unknown" — so that the prompt includes the correct territorial context for writing the narrative.

---

## Background

### Root cause — field name mismatch between DT form and context builders

The modern DT form (dt-form.18+) writes patrol territory to `project_${slot}_target_terr` and ambience territory to `project_${slot}_ambience_target`. Both context builders read only `project_${slot}_territory`, which is the older general field that the modern form no longer populates.

**`buildPatrolContext` (line ~685):**
```js
const terrRaw = sub.responses?.[`project_${slot}_territory`] || '';
// Always empty for DT3 patrol actions — form writes to `project_${slot}_target_terr`
```

**`buildProjectContext` — ambience branch (line ~497):**
```js
const terrRaw = sub.responses?.[`project_${slot}_territory`] || '';
// Always empty for DT3 ambience actions — form writes to `project_${slot}_ambience_target`
```

**`buildPatrolContext` "other actions in territory" loop (line ~760):**
```js
if (resolveTerrId(s.responses?.[`project_${sl}_territory`] || '') !== terrId) return;
// Misses patrol actions from other characters who used the new field name
```

### Confirmed DT3 instances

Reed Justice's DT3 submission has:
- `responses.project_3_territory: ""` (empty)
- `responses.project_3_target_terr: "harbour"` (patrol target — correct value)
- `responses.project_2_ambience_target: "harbour"` (ambience target — correct value)

Every DT3 patrol and ambience context prompt shows `Territory: Unknown` because the builder reads the empty `_territory` field instead of the action-specific field.

### Field name catalogue

| Action type | Form field written | Builder reads |
|---|---|---|
| Patrol / Scout | `project_${slot}_target_terr` | `project_${slot}_territory` ← wrong |
| Ambience Increase/Decrease | `project_${slot}_ambience_target` | `project_${slot}_territory` ← wrong |
| All others (generic) | `project_${slot}_territory` | `project_${slot}_territory` ← correct |

### Fix strategy

Apply a targeted fallback for each action type. Avoid reading all three possible field names unconditionally — the fallback logic must be action-type-aware to avoid pulling in the wrong territory for a non-ambience action that happens to have a value in `_ambience_target`.

---

## Acceptance Criteria

- [x] Copy Context on a Patrol card shows the correct territory (matching the player's `project_${slot}_target_terr` value)
- [x] Copy Context on an Ambience Increase or Decrease card shows the correct territory (matching `project_${slot}_ambience_target`)
- [x] The "other actions in territory" section in the Patrol prompt correctly counts other characters whose patrol territory matches
- [x] Generic project actions (investigate, support, misc) continue to read `project_${slot}_territory` unchanged

---

## Implementation

### `public/js/admin/downtime-story.js`

#### 1. `buildPatrolContext` — patrol territory fallback (line ~685)

```js
// Before (line 685):
const terrRaw = sub.responses?.[`project_${slot}_territory`] || '';

// After:
const terrRaw =
  sub.responses?.[`project_${slot}_target_terr`] ||   // modern DT form field for patrol
  sub.responses?.[`project_${slot}_territory`]   ||   // legacy / generic fallback
  '';
```

#### 2. `buildProjectContext` — ambience territory fallback (line ~497)

The `terrRaw` variable is read at line 497 before the action type is known. The action type is determined from `rev.action_type_override || rev.action_type || sub.responses?.[`project_${slot}_action`]`. Read the action type first, then choose the territory field:

```js
// Before (lines 493-503):
const terrRaw = sub.responses?.[`project_${slot}_territory`] || '';
// ...action type derived from rev below...

// After — move actionType derivation before terrRaw:
const actionType = rev.action_type_override || rev.action_type
  || sub.responses?.[`project_${slot}_action`] || '';

const isAmbience = actionType === 'ambience_increase' || actionType === 'ambience_decrease';
const terrRaw = isAmbience
  ? (sub.responses?.[`project_${slot}_ambience_target`] || sub.responses?.[`project_${slot}_territory`] || '')
  : (sub.responses?.[`project_${slot}_territory`] || '');
```

Note: the `actionType` variable is also derived later in `buildProjectContext` at line 502 from the same expression. After this change, remove the duplicate derivation below and use the hoisted one.

#### 3. `buildPatrolContext` — "other actions" loop territory (line ~760)

```js
// Before (line 760):
if (resolveTerrId(s.responses?.[`project_${sl}_territory`] || '') !== terrId) return;

// After:
const otherActionType = r.action_type_override || r.action_type || '';
const otherIsPatrol   = otherActionType === 'patrol_scout' || otherActionType === 'support';
const otherIsAmbience = otherActionType === 'ambience_increase' || otherActionType === 'ambience_decrease';
const otherTerrRaw = otherIsPatrol
  ? (s.responses?.[`project_${sl}_target_terr`]    || s.responses?.[`project_${sl}_territory`] || '')
  : otherIsAmbience
    ? (s.responses?.[`project_${sl}_ambience_target`] || s.responses?.[`project_${sl}_territory`] || '')
    : (s.responses?.[`project_${sl}_territory`] || '');
if (resolveTerrId(otherTerrRaw) !== terrId) return;
```

The same loop also appears in `buildProjectContext` (line ~567 — "Other actions in this territory") and uses the same field name. Apply the same fix there.

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-story.js` | Fix `terrRaw` in `buildPatrolContext`; fix `terrRaw` in `buildProjectContext` with action-type-aware ambience fallback; fix "other actions" loops in both builders |

No schema changes. No API changes. No CSS changes.

---

## Dev Notes

- `resolveTerrId` normalises the raw territory string to a slug — the fix only affects what string is passed to it, not how it works.
- For the `buildProjectContext` refactor: the `actionType` variable currently appears twice in the function (once from a complex expression, once as a simpler read). After the fix, the single early derivation is authoritative. Confirm the variable is not shadowed anywhere else in the function body.
- The `renderProjectCard` function (line ~1318) reads `territory` directly from `sub.responses` for display in the card meta row — this is a display-only field and is not affected by this fix. Fixing the card display is out of scope for this story.

---

## Dev Agent Record

**Date:** 2026-05-20

### Completion Notes

Fix implemented in commit `55a0cf4`. `buildPatrolContext` (line 876): reads `_target_terr` || `_territory`. `buildProjectContext` (lines 622–631): `actionType` hoisted before `terrRaw`; ambience reads `_ambience_target` || `_territory`, others read `_territory`. "Other actions" loops in both builders (lines 752–756, 974–980): same three-way field selection by action type. Covered by 2 Playwright tests in `tests/issue-363-367-dt-story-copy-context.spec.js` — patrol shows "The Harbour" from `_target_terr`; ambience shows "The Harbour" from `_ambience_target`.

---

## File List

- `public/js/admin/downtime-story.js` (modified)
- `tests/issue-363-367-dt-story-copy-context.spec.js` (added)

---

## Change Log

- 2026-05-18: fix(#366): action-type-aware territory field reads in buildPatrolContext and buildProjectContext
- 2026-05-20: test: Playwright tests for patrol and ambience territory resolution
