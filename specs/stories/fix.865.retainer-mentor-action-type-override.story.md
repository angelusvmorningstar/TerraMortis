# fix.865 — DT processing: retainer/mentor action-type selection reverts (override ignored)

```yaml
issue: 865
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/865
branch: piatra/issue-865-retainer-mentor-action-type-override
status: draft
type: bug
```

## Story

As an ST resolving a Retainer or Mentor directed action in DT Processing, I want the
action-type dropdown selection to persist across re-renders and reloads, so that I can
classify these actions (Support, Patrol/Scout, Investigate, etc.) and have the chosen
type drive the merit matrix lookup.

## Background

The retainer/mentor queue-build blocks hardcode `actionType: 'resources_retainers'`
and never read `action_type_override` from `merit_actions_resolved`. Because
`'resources_retainers'` is not a key in `ACTION_TYPE_LABELS`, the action-type
`<select>` has no matching `<option>` and the browser falls back to displaying its
first option — "Ambience Increase" — regardless of what the ST previously selected.

The recat-select `change` handler (`:5008-5016`) does save `action_type_override`
to `merit_actions_resolved[entry.actionIdx]` correctly. But each subsequent
`renderProcessingMode` re-runs the queue-build, re-hardcoding `'resources_retainers'`,
so the selection is lost on every re-render.

The sphere/allies/status loop already applies the override correctly at line 3315:

```js
// downtime-views.js:3314-3315
const meritResolved = (sub.merit_actions_resolved || [])[meritFlatIdx] || {};
const actionType = meritResolved.action_type_override || originalActionType;
```

The three retainer/mentor blocks simply lack this read.

There are **three** affected blocks (the issue body identified two; the third was
added by #344 for app-form submissions):

| Block | Line | Label |
|---|---|---|
| A | 3415 | `retainers.forEach` — CSV import path |
| B | 3450 | `for n = 1..10` — mentor (app-form) |
| C | 3495 | `for n = 1..10` — retainer (app-form, added by #344) |

The recat-select handler also reads `entry.originalActionType` to decide whether to
null the override (`newType === entry.originalActionType ? null : newType`, line 5012).
The retainer/mentor blocks do not currently push `originalActionType` into the queue
entry, so clearing an override after the fact would never null it. Each block must
also push `originalActionType`.

**SM-resolved open question:** when no override is set, default to `''` (empty
string) and render a `— Select action type —` placeholder option as the first
option in the `<select>`. This makes unclassified state explicit rather than
defaulting to the misleading "Ambience Increase" fallback.

## Acceptance criteria

- [ ] **AC1** — Selecting a different action type on a Retainer directed action
  (CSV-import block) persists: survives re-render and page reload without reverting
  to "Ambience Increase".
- [ ] **AC2** — Same for a Mentor directed action (app-form block).
- [ ] **AC3** — Same for a Retainer directed action submitted via the app form
  (the `retainer_${n}_task` block added by #344).
- [ ] **AC4** — When no override is set, the action-type `<select>` shows
  `— Select action type —` as the selected option (not "Ambience Increase").
- [ ] **AC5** — After an ST selects an action type, the entry's phase and merit
  matrix lookup use the chosen type (same behaviour as the sphere/allies path).
- [ ] **AC6** — Sphere/allies/status/contacts/staff action paths are unaffected.
- [ ] **AC7** — Clearing an override (re-selecting `''`) correctly nulls
  `action_type_override` in the saved review.

---

## Dev Notes

### Files

- `public/js/admin/downtime-views.js` — only file that changes.

### Pattern to mirror (sphere loop, already correct)

```js
// downtime-views.js:3313-3315
const meritResolved = (sub.merit_actions_resolved || [])[meritFlatIdx] || {};
const actionType = meritResolved.action_type_override || originalActionType;
```

### Block A — retainers.forEach, CSV import path (lines 3415-3430)

Replace the hardcoded `actionType: 'resources_retainers'` with the override-aware
pattern. Also push `originalActionType` so the recat handler can compare correctly.

```js
// BEFORE (line 3422):
actionType: 'resources_retainers',

// AFTER — insert before queue.push:
const _retResolved_A = (sub.merit_actions_resolved || [])[meritFlatIdx] || {};
const _retOrigType_A = 'resources_retainers';
const _retActionType_A = _retResolved_A.action_type_override || _retOrigType_A;

// In the queue.push object:
actionType: _retActionType_A,
originalActionType: _retOrigType_A,
```

### Block B — mentor for-loop (lines 3450-3470)

Same pattern. The existing `actionType: 'resources_retainers'` on line 3461 becomes:

```js
const _mentResolved = (sub.merit_actions_resolved || [])[meritFlatIdx] || {};
const _mentOrigType = 'resources_retainers';
const _mentActionType = _mentResolved.action_type_override || _mentOrigType;

// In queue.push:
actionType: _mentActionType,
originalActionType: _mentOrigType,
```

### Block C — retainer for-loop, app-form path (lines 3495-3514)

Same pattern. The existing `actionType: 'resources_retainers'` on line 3506 becomes:

```js
const _retResolved_C = (sub.merit_actions_resolved || [])[meritFlatIdx] || {};
const _retOrigType_C = 'resources_retainers';
const _retActionType_C = _retResolved_C.action_type_override || _retOrigType_C;

// In queue.push:
actionType: _retActionType_C,
originalActionType: _retOrigType_C,
```

### Placeholder option (AC4) — action-type `<select>` render

Location: `_renderActionTypeRow`, lines 8537-8541.

When `actionType` is `''` (no override set for a retainer/mentor block), the
existing `for...of Object.entries(ACTION_TYPE_LABELS)` loop will produce no
`selected` match and the browser will auto-select the first option. Add a
placeholder as the first option, unconditionally — it is harmless for all other
action types since any real type will match and become selected:

```js
// BEFORE (line 8537):
h += `<select class="proc-recat-select" data-proc-key="${esc(key)}">`;
for (const [val, lbl] of Object.entries(ACTION_TYPE_LABELS)) {
  h += `<option value="${esc(val)}"${actionType === val ? ' selected' : ''}>${esc(lbl)}</option>`;
}
h += `</select>`;

// AFTER:
h += `<select class="proc-recat-select" data-proc-key="${esc(key)}">`;
h += `<option value=""${!actionType ? ' selected' : ''}>— Select action type —</option>`;
for (const [val, lbl] of Object.entries(ACTION_TYPE_LABELS)) {
  h += `<option value="${esc(val)}"${actionType === val ? ' selected' : ''}>${esc(lbl)}</option>`;
}
h += `</select>`;
```

The recat handler already saves `action_type_override: null` when
`newType === entry.originalActionType` (line 5012). With the placeholder,
when the ST selects `''`, `newType` will be `''` which does not equal
`'resources_retainers'` — so the handler would save `action_type_override: ''`
(a falsy string, but not null). The handler should treat `''` the same as
selecting the original type, nulling the override. Update the guard at line 5012:

```js
// BEFORE:
const patch = { action_type_override: newType === entry.originalActionType ? null : newType };

// AFTER:
const patch = { action_type_override: (!newType || newType === entry.originalActionType) ? null : newType };
```

This ensures selecting `''` (or clearing back to the original type) both null the
stored override cleanly.

### Phase assignment for retainer/mentor entries

Blocks A, B, and C currently hardcode `phaseNum: PHASE_MISC`. Once `actionType`
is dynamic, the phase should be derived from the selected type (same as the sphere
loop at lines 3316-3327). Apply `PHASE_ORDER[actionType] ?? PHASE_MISC`:

```js
phase: PHASE_NUM_TO_LABEL[PHASE_ORDER[_retActionType_A] ?? PHASE_MISC],
phaseNum: PHASE_ORDER[_retActionType_A] ?? PHASE_MISC,
```

Do this for all three blocks. Do not change the contacts/staff phase assignments.

### What NOT to change

- The sphere/allies/status/contacts/staff blocks — already correct, out of scope.
- `downtime-constants.js` — no new labels, no new entries in `ACTION_TYPE_LABELS`.
- Server routes, MongoDB schema — no changes.
- `originalActionType` field name — must be consistent with line 5012 and line 8546
  (`entry.originalActionType`) which are already wired.

### Label for retainer/mentor entries

The sphere block builds its label from `ACTION_TYPE_LABELS[actionType]` at line
3375. The retainer/mentor blocks use fixed string labels (`'Retainer: Directed
Action'`, `'Mentor: Directed Action'`). Leave the fixed labels — they already
identify the source clearly. No change needed to the label field.

---

## Testing

`server/tests/fix.865.retainer-mentor-override.test.js` — static-analysis against
`public/js/admin/downtime-views.js`.

**Anchors to use (grep for these literal strings to position each block):**

- Block A: `'retainers.forEach'` or the label `'Retainer: Directed Action'` on
  line 3423 (use `src.indexOf("label: 'Retainer: Directed Action'")` — this
  string is unique to Block A).
- Block B: `'Mentor: Directed Action'` (unique to Block B).
- Block C: `` 'retainer_${n}_task' `` as the loop discriminator, or the label
  template string `` '${meritLb}: Directed Action' `` (line 3507 area, unique to
  Block C).
- Recat handler: `'Clear override if ST selects the original player-submitted type'`
  comment on line 5011.
- `_renderActionTypeRow`: `'proc-recat-row'` (line 8532).

**AC tests to implement:**

```
AC-T1 — Block A (retainers.forEach) contains action_type_override read
AC-T2 — Block B (mentor for-loop) contains action_type_override read
AC-T3 — Block C (app-form retainer for-loop) contains action_type_override read
AC-T4 — Block A pushes originalActionType into the queue entry
AC-T5 — Block B pushes originalActionType into the queue entry
AC-T6 — Block C pushes originalActionType into the queue entry
AC-T7 — No bare actionType: 'resources_retainers' (without an override read in the
         same block) survives in any of the three blocks
AC-T8 — _renderActionTypeRow emits the placeholder option
         '<option value="">— Select action type —</option>'
AC-T9 — Recat handler patch line guards on !newType as well as originalActionType
         match (i.e., the null-coerce condition)
```

Test implementation approach: `fs.readFileSync` the source, use
`src.indexOf(anchorString)` to bound each block, then `src.indexOf(needle, blockStart)`
within that range. Follow the pattern in
`server/tests/fix.797.dt-proc-confirm-outcome-revert.test.js`.

---

_Story created by SM from GitHub issue #865. Branch: `piatra/issue-865-retainer-mentor-action-type-override`_
