---
id: dtui.10
epic: dtui
status: ready-for-dev
priority: high
depends_on: [dtui.4, dtui.8, dtui.9]
---

# Story DTUI-10: Ambience Change consolidation

As a player wanting to change a territory's ambience,
I want a single "Ambience Change" action with an Improve/Degrade ticker,
So that direction is a property of the action, not a separate action choice.

---

## Context

Currently the form has two separate action types: `ambience_increase` and `ambience_decrease`. They share the same fields, target scope, and purpose — the only difference is direction. This story merges them into a single `ambience_change` action whose Improve/Degrade direction is set via a `.dt-ticker` within the target zone.

After dtui-9, both `ambience_increase` and `ambience_decrease` have `outcome` in their `ACTION_FIELDS` entries. This story removes both entries entirely and replaces them with `ambience_change`.

The Improve/Degrade direction is stored as `project_N_ambience_dir` (`'improve'` | `'degrade'`). Changing direction triggers a re-render of the pane (identical mechanism to action-type change) so the action description, Approach prompt, and Outcome zone update dynamically.

### Backward compatibility

Saved submissions with `project_N_action === 'ambience_increase'` or `'ambience_decrease'` must continue to render. The pane shows a legacy direction notice and preserves all saved field values. No data migration needed — the ST processes these historically.

---

## Files in scope

- `public/js/tabs/downtime-data.js` — replace `ambience_increase`/`ambience_decrease` entries in `PROJECT_ACTIONS` with a single `ambience_change` entry; update `ACTION_DESCRIPTIONS` and `ACTION_APPROACH_PROMPTS` to use `ambience_change` (direction-aware versions); update `JOINT_ELIGIBLE_ACTIONS` to replace the two entries with `'ambience_change'`
- `public/js/tabs/downtime-form.js` — update `ACTION_FIELDS`; update `renderTargetZone()` (from dtui-8) to add Improve/Degrade ticker inside the ambience_change territory zone; update `renderOutcomeZone()` (from dtui-9) to derive read-only outcome from saved direction; add saved-direction propagation to the pane re-render; add backward-compat legacy notice for saved `ambience_increase`/`ambience_decrease` actions; update `collectResponses()` to collect `project_N_ambience_dir`

---

## Out of scope

- Allies Ambience action — dtui-15 through dtui-18 (Allies parity)
- SPHERE_ACTIONS still retains `ambience_increase`/`ambience_decrease` until dtui-15 ships
- The `SPHERE_ACTION_FIELDS` entries for ambience are untouched here

---

## Acceptance Criteria

### AC1 — Single "Ambience Change" in dropdown

**Given** a player views the Personal Project action-type dropdown,
**When** they browse options,
**Then** "Ambience Change" (singular) appears. "Ambience Change (Increase)" and "Ambience Change (Decrease)" do NOT appear.

### AC2 — Territory chips + Improve/Degrade ticker in target zone

**Given** a player selects "Ambience Change",
**When** the Target zone renders,
**Then** it shows Territory `.dt-chip-grid` (single-select) AND a `.dt-ticker` with Improve / Degrade pills below the chips.

### AC3 — Improve is default direction

**Given** a player selects "Ambience Change" on a new (unsaved) slot,
**When** the Target zone first renders,
**Then** the Improve pill is selected by default.

### AC4 — Direction change updates description, prompt, and outcome

**Given** a player toggles from Improve to Degrade (or vice versa),
**When** the direction ticker changes,
**Then** the action description (`.dt-action-desc`), Approach textarea placeholder, and read-only Outcome text all update to reflect the new direction.

### AC5 — Saved direction persists on reload

**Given** a player chose Degrade and saved,
**When** the form reloads,
**Then** the Degrade pill is selected and the description/prompt/outcome show Degrade copy.

### AC6 — Backward compat for saved increase/decrease actions

**Given** a character's saved form has `project_N_action: 'ambience_increase'` or `'ambience_decrease'` from before this story,
**When** the project pane renders,
**Then** the pane renders correctly: for `ambience_increase` the direction defaults to Improve; for `ambience_decrease` the direction defaults to Degrade. No crash, no empty pane.

---

## Implementation Notes

### PROJECT_ACTIONS (downtime-data.js)

Replace:
```javascript
{ value: 'ambience_increase', label: 'Ambience Change (Increase): Make a Territory delicious' },
{ value: 'ambience_decrease', label: 'Ambience Change (Decrease): Make Territory not delicious' },
```
with:
```javascript
{ value: 'ambience_change', label: 'Ambience Change: Improve or degrade the ambience of a territory' },
```

### ACTION_DESCRIPTIONS (downtime-data.js)

Replace `ambience_increase` and `ambience_decrease` entries with a direction-sensitive lookup. Since descriptions are constants and direction is runtime state, the helper function in `renderOutcomeZone` (and the `.dt-action-desc` render) should derive direction from `saved[project_N_ambience_dir]`. The simplest approach: add two sub-keys in `ACTION_DESCRIPTIONS` for each direction:

```javascript
'ambience_change_improve': 'This project will apply your successes directly towards improving the ambience of the selected territory.',
'ambience_change_degrade': 'This project will apply your successes directly towards degrading the ambience of the selected territory.',
```

In `renderProjectSlots()`, when building the action description for `ambience_change`, resolve the key as:
```javascript
const ambienceDir = saved[`project_${n}_ambience_dir`] || 'improve';
const descKey = actionVal === 'ambience_change' ? `ambience_change_${ambienceDir}` : actionVal;
const actionDesc = ACTION_DESCRIPTIONS[descKey] || '';
```

### ACTION_APPROACH_PROMPTS (downtime-data.js)

Same pattern — use two sub-keys:
```javascript
'ambience_change_improve': 'How do you go about improving the ambience of this territory in narrative terms.',
'ambience_change_degrade': 'How do you go about degrading the ambience of this territory in narrative terms.',
```
Resolved at render time using `ambienceDir` (same logic as above).

### JOINT_ELIGIBLE_ACTIONS (downtime-data.js)

Replace `'ambience_increase'` and `'ambience_decrease'` with `'ambience_change'`.

### ACTION_FIELDS (downtime-form.js)

Replace:
```javascript
'ambience_increase': ['title', 'territory', 'outcome', 'pools', 'description'],
'ambience_decrease': ['title', 'territory', 'outcome', 'pools', 'description'],
```
with:
```javascript
'ambience_change':   ['title', 'target', 'outcome', 'pools', 'description'],
```

Note: `target` (not `territory`) — the territory chips + Improve/Degrade ticker both live inside `renderTargetZone()` for `ambience_change`.

### renderTargetZone() update (downtime-form.js)

In `renderTargetZone()` from dtui-8, `ambience_change` is a territory-only action but needs the direction ticker appended:

```javascript
if (['ambience_change', 'ambience_increase', 'ambience_decrease', 'patrol_scout'].includes(actionVal)) {
  let h = renderTargetTerritoryChips(n, savedTerrId);
  if (actionVal === 'ambience_change') {
    const dir = savedAmbienceDir || 'improve';
    h += `<fieldset class="dt-ticker" style="margin-top:8px">`;
    h += '<legend class="dt-ticker__legend">Direction</legend>';
    for (const d of ['improve', 'degrade']) {
      const label = d[0].toUpperCase() + d.slice(1);
      h += `<label class="dt-ticker__pill"><input type="radio" name="dt-project_${n}_ambience_dir" value="${d}"${dir === d ? ' checked' : ''} data-proj-ambience-dir="${n}"> ${label}</label>`;
    }
    h += '</fieldset>';
  }
  return h;
}
```

`savedAmbienceDir` is `saved[project_N_ambience_dir] || ''` — declare alongside other saved reads at the top of `renderTargetZone`.

### Direction change triggers re-render

Add a delegated change handler for `data-proj-ambience-dir`:
```javascript
// on change: save direction then trigger pane re-render
if (target.dataset.projAmbienceDir !== undefined) {
  const n = parseInt(target.dataset.projAmbienceDir);
  saved[`project_${n}_ambience_dir`] = target.value;
  scheduleSave();
  rerenderProjectSlot(n);  // or whatever the existing pane re-render call is
}
```

The re-render picks up the new direction from `saved` and rebuilds description, prompt, and outcome accordingly.

### collectResponses() update

Add collection for `project_N_ambience_dir`:
```javascript
const ambienceDirEl = document.querySelector(`input[name="dt-project_${n}_ambience_dir"]:checked`);
responses[`project_${n}_ambience_dir`] = ambienceDirEl ? ambienceDirEl.value : '';
```

### Backward compat for legacy ambience actions

In `renderProjectSlots()`, after the action-type `<select>` renders, check:
```javascript
if (actionVal === 'ambience_increase' || actionVal === 'ambience_decrease') {
  // Map legacy action to ambience_change + direction for rendering purposes
  const legacyDir = actionVal === 'ambience_increase' ? 'improve' : 'degrade';
  if (!saved[`project_${n}_ambience_dir`]) {
    saved[`project_${n}_ambience_dir`] = legacyDir;
  }
  // Continue rendering as ambience_change
  actionVal = 'ambience_change';
}
```

This ensures legacy submissions render via the new unified flow without crashing. The action-type dropdown will show a blank selection (since `ambience_increase`/`ambience_decrease` are no longer in the options list) — the player can select "Ambience Change" to migrate.

---

## Files Expected to Change

- `public/js/tabs/downtime-data.js` — update `PROJECT_ACTIONS`, `ACTION_DESCRIPTIONS`, `ACTION_APPROACH_PROMPTS`, `JOINT_ELIGIBLE_ACTIONS`
- `public/js/tabs/downtime-form.js` — update `ACTION_FIELDS`, `renderTargetZone()`, `renderOutcomeZone()`, description/prompt resolution; add ambience direction change handler; update `collectResponses()`; add legacy action normalisation

---

## Definition of Done

- AC1–AC6 verified
- Single "Ambience Change" in dropdown; increase/decrease gone
- Territory chips + Improve/Degrade ticker render together
- Direction change updates description, prompt, outcome without page reload
- Saved direction survives reload
- Legacy `ambience_increase`/`ambience_decrease` submissions render without crash
- `specs/stories/sprint-status.yaml` updated: dtui-10 → review

---

## Compliance

- CC4 — Token discipline: `.dt-ticker` classes only; no bare hex
- CC5 — British English copy: "Improve", "Degrade" (not "Increase"/"Decrease" in labels)
- CC9 — Uses `.dt-ticker` and `.dt-chip-grid` canonical components

---

## Dependencies and Ordering

- **Depends on:** dtui-4 (action block), dtui-8 (renderTargetZone exists), dtui-9 (renderOutcomeZone exists)
- **Unblocks:** dtui-15/16/17/18 (Allies Ambience parity)

---

## Dev Agent Record

### Agent Model Used

(to be filled at implementation time)

### Completion Notes

(to be filled when implemented)

### File List

(to be filled when implemented)

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-10 story drafted; ready-for-dev. |
