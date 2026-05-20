# Story fix.392: Merit DT actions — desired_outcome not mapped for Contacts and Retainers

**Story ID:** fix.392
**Epic:** DT Story tab fixes
**Status:** review
**Date:** 2026-05-19
**Issue:** [#392](https://github.com/angelusvmorningstar/TerraMortis/issues/392)
**Branch:** ms/issue-392-merit-dt-desired-outcome

---

## User Story

As an ST reviewing the Allies & Asset Summary panel for a player's DT report, I want Contact and Retainer actions to display the player's actual request/task type as the desired outcome — so that I can immediately see what each asset was tasked with, without opening the processing queue.

---

## Background

### The pipeline

`buildMeritActions()` (`downtime-story.js:1949`) assembles the `merit_actions` array that is stored on the submission document and later read by `renderMeritSummary()` to produce the Allies & Asset Summary panel.

Each entry in `merit_actions` has three display-relevant fields:
- `merit_type` — the merit label (e.g. "Contacts ●●● (Crime)")
- `desired_outcome` — shown in the "Desired outcome" column of the summary table
- `description` — shown in AI context builder prompts (`buildProjectContext` etc.) and individual action detail cards

`renderMeritSummary()` (`downtime-story.js:2202`) reads `a.desired_outcome` and maps it to `entry.desiredOutcome`. The display at line 2243 shows "— No desired outcome stated —" when `entry.desiredOutcome` is falsy.

### Root cause — two hardcoded empty strings

**Contacts (lines 1982-1993):**

```js
// Legacy path
contactRaw.forEach(c => actions.push({
  merit_type: 'Contacts', action_type: 'misc', desired_outcome: '',   // ← EMPTY
  description: c.detail || c.description || '',
}));

// App-form path
const meritLbl = resp[`contact_${n}_merit`] || 'Contacts';
actions.push({ merit_type: meritLbl, action_type: 'misc', desired_outcome: '', description: req }); // ← EMPTY
```

The app-form stores the player's information request in `contact_${n}_request` (the "What specific information are you requesting?" textarea) and supporting context in `contact_${n}_info`. The request IS the desired outcome, but it is currently written to `description` and `desired_outcome` is left empty.

**Retainers (lines 1998-2009):**

```js
// Legacy path
retainerRaw.forEach(r => actions.push({
  merit_type: 'Retainer', action_type: 'misc', desired_outcome: '',   // ← EMPTY
  description: r.task || r.description || '',
}));

// App-form path
const task = resp[`retainer_${n}_task`];
actions.push({ merit_type: 'Retainer', action_type: 'misc', desired_outcome: '', description: task }); // ← EMPTY
```

The app-form stores task type in `retainer_${n}_type` (e.g. "Procure") and the task description in `retainer_${n}_task`. Task Type is the natural desired outcome for a retainer action. Additionally, the retainer's name (`retainer_${n}_merit`, e.g. "Nicole - EA") is not read — `merit_type` is hardcoded to `'Retainer'` — so the label column always shows "Retainer" rather than "Nicole - EA".

### Resources — separate, lower-priority issue

The Resources block (lines 2020-2052) sets `desired_outcome: merits` where `merits` is a `row.merits.join(', ')` of raw form key strings (e.g. `"Resources|, Retainer|Nicole - EA"`). This is correct field-mapping but the values are raw keys, not prettified labels. This is tracked as a secondary concern and is out of scope for this story.

### What is NOT broken

- Spheres / Influence: `desired_outcome: resp[sphere_${n}_outcome]` — correct.
- Status / MCI: `desired_outcome: resp[status_${n}_outcome]` — correct.
- Skill Acquisitions: `desired_outcome: merits` — correct (same pattern as Resources).
- Processing queue: reads the right fields independently; not affected.
- Player form capture: submits the correct keys; not affected.
- Schema: `contactSlotProps()` / `retainerSlotProps()` definitions are correct.

---

## Acceptance Criteria

- [ ] A Contact action with a filled "What specific information are you requesting?" textarea shows that text in the "Desired outcome" column of the Allies & Asset Summary (not "— No desired outcome stated —").
- [ ] A Retainer action with a filled Task Type field shows the Task Type in the "Desired outcome" column. The Task Description appears in the action detail / context builder as before.
- [ ] The Retainer row label in the summary table shows the retainer's name (e.g. "Nicole - EA") rather than the generic "Retainer".
- [ ] Legacy CSV-imported submissions (using `raw.contact_actions.requests[]` / `raw.retainer_actions.actions[]` array shape) continue to render without errors.
- [ ] No regression: Spheres/Influence, Status/MCI, Skill Acquisitions continue to display correctly.

---

## Implementation

### File: `public/js/admin/downtime-story.js`

#### Contacts block (lines ~1979-1994)

```js
// ── Contacts ──
const contactRaw = raw.contact_actions?.requests || [];
if (contactRaw.length) {
  // Legacy CSV shape: c.detail / c.description contains the information request
  contactRaw.forEach(c => actions.push({
    merit_type:      'Contacts',
    action_type:     'misc',
    desired_outcome: c.detail || c.description || '',   // the request IS the desired outcome
    description:     '',
  }));
} else {
  for (let n = 1; n <= 5; n++) {
    const req = resp[`contact_${n}_request`];
    if (!req) continue;
    const meritLbl = resp[`contact_${n}_merit`] || 'Contacts';
    const info     = resp[`contact_${n}_info`]  || '';   // supporting context for AI prompt
    actions.push({
      merit_type:      meritLbl,
      action_type:     'misc',
      desired_outcome: req,    // was ''
      description:     info,   // was req — now carries supporting info for context builders
    });
  }
}
```

**Note on `contact_${n}_info`:** The Supporting Info one-liner (e.g. "See DT Action 1 - Carver v Predator") maps to `description` so it surfaces in AI context builder prompts (`buildProjectContext` etc.) via the `if (action.description) lines.push('Description: ...')` path at line 2434. It does not appear in the summary table, which only displays `desiredOutcome` and `outcome`. This is intentional — the summary table shows the goal, the context builders show the full picture.

#### Retainers block (lines ~1996-2009)

```js
// ── Retainers ──
const retainerRaw = raw.retainer_actions?.actions || [];
if (retainerRaw.length) {
  // Legacy CSV shape: task/description contains the full task text
  retainerRaw.forEach(r => actions.push({
    merit_type:      r.merit || 'Retainer',
    action_type:     'misc',
    desired_outcome: r.type || r.task_type || '',   // task type if present; blank if legacy
    description:     r.task || r.description || '',
  }));
} else {
  for (let n = 1; n <= 4; n++) {
    const task    = resp[`retainer_${n}_task`];
    const type    = resp[`retainer_${n}_type`] || '';
    const meritLb = resp[`retainer_${n}_merit`] || 'Retainer';
    if (!task && !type) continue;
    actions.push({
      merit_type:      meritLb,   // was hardcoded 'Retainer'
      action_type:     'misc',
      desired_outcome: type,      // was ''
      description:     task || '',
    });
  }
}
```

**Note on legacy `retainerRaw` shape:** The legacy CSV array elements are plain strings or simple objects. If they have no `type`/`task_type` field, `desired_outcome` will be `''` — which is the same as today. No regression.

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-story.js` | Contacts block: map `desired_outcome` ← `req` / `c.detail`; map `description` ← `info`. Retainers block: map `desired_outcome` ← `type`; map `merit_type` ← `meritLb`; add `retainer_${n}_merit` read. |

No schema changes. No API changes. No CSS changes. No form changes.

---

## Dev Agent Record

**Implemented:** 2026-05-19

**Completion Notes:**

- Contacts app-form path: `desired_outcome` now maps to `contact_${n}_request` (the player's information request). `description` now maps to `contact_${n}_info` (the supporting context one-liner).
- Contacts legacy path: `desired_outcome` now maps to `c.detail || c.description` (the request text). `description` set to `''` since legacy shape has no separate info field.
- Retainers app-form path: `desired_outcome` now maps to `retainer_${n}_type` (Task Type, e.g. "Procure"). `merit_type` now maps to `retainer_${n}_merit` (retainer name, e.g. "Nicole - EA"). `description` remains `retainer_${n}_task`. Skip condition widened to `!task && !type` so retainers with only a type and no task description are not silently dropped.
- Retainers legacy path: `merit_type` reads `r.merit || 'Retainer'`; `desired_outcome` reads `r.type || r.task_type || ''` (graceful fallback to empty for old data that has no type field).
- Spheres, Status/MCI, Resources, Skill Acquisitions: untouched.

**Files Changed:**

| File | Change |
|---|---|
| `public/js/admin/downtime-story.js` | Contacts + Retainers blocks in `buildMeritActions()` — field mapping corrected |

**Change Log:**

- 2026-05-19: fix.392 — Map `desired_outcome` from player input for Contact and Retainer merit actions; surface retainer name as merit label.

---

## Dev Notes

- `desired_outcome` (snake_case) is the field stored in `sub.merit_actions[]`. `desiredOutcome` (camelCase) is the local variable in `renderMeritSummary()` at line 2218. They are the same data, different contexts — do not confuse them.
- `description` is used in AI context builder prompts (lines 2431-2434) and individual action detail cards (line 2590). After this change, Contacts `description` will be the Supporting Info one-liner rather than the request text. The request text moves to `desired_outcome`, which ALSO appears in context builders at line 2433. Net result: ST context prompts improve — they now show both the goal ("Desired Outcome: I reference Carver using his Church contacts...") and the context ("Description: See DT Action 1 - Carver v Predator").
- The processing queue (`downtime-views.js:3375-3398`) reads `retainer_${n}_type`, `retainer_${n}_task`, `retainer_${n}_merit` directly from `resp` — it is already doing the right thing and is not affected by this change.
- Verify with DT3 Carver submission: two Contacts should display the request text; Nicole - EA retainer should display "Procure" as desired outcome and show "Nicole - EA" as the label.
- Resources desired_outcome prettification (raw key display "Resources|, Retainer|Nicole - EA") is a separate issue — do not touch in this story.
