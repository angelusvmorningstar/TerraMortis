---
id: dtui.9
epic: dtui
status: review
priority: high
depends_on: [dtui.4, dtui.5, dtui.1]
---

# Story DTUI-9: Per-action Desired Outcome treatments

As a player setting the goal of my action,
I want the Desired Outcome zone to fit the action — prefilled when determined, ticker when finite, freetext only when narrative,
So that I'm not writing what the system already knows.

---

## Context

The current form renders a plain `<input type="text">` labelled "Desired Outcome" for every action that has `outcome` in its `ACTION_FIELDS` entry (Attack, Investigate, Hide/Protect, Patrol/Scout, Misc). The field key `project_N_outcome` is already used and collected via `collectResponses()` at line 427–432.

This story replaces that generic render block with a unified `renderOutcomeZone(n, actionVal, saved)` helper that returns the correct UI per action:

| Action | Outcome zone |
|---|---|
| `ambience_increase` | Read-only: *"Improve the ambience of the targeted territory."* |
| `ambience_decrease` | Read-only: *"Degrade the ambience of the targeted territory."* |
| `attack` | `.dt-ticker` — three pills: Destroy / Degrade / Disrupt |
| `hide_protect` | Read-only: *"Attempt to protect the asset from attacks this downtime."* |
| `investigate` | Read-only: *"Uncover a secret or mystery about the target."* |
| `patrol_scout` | Read-only: *"Observe the territory closely for intrusive or adversarial activity."* |
| `misc` | Freetext input with prompt: *"State the goal of this project, aiming to achieve one clear thing."* |
| `xp_spend`, `maintenance` | Outcome zone hidden (not in ACTION_FIELDS for these) |

Note: `ambience_increase` and `ambience_decrease` currently have no `outcome` entry in `ACTION_FIELDS` — this story adds `'outcome'` to both. dtui-10 later consolidates both into a single `ambience_change` action; that story removes these two entries entirely.

---

## Files in scope

- `public/js/tabs/downtime-form.js` — update `ACTION_FIELDS` to add `outcome` to `ambience_increase`/`ambience_decrease`; add `renderOutcomeZone()` helper; replace generic outcome render block (~line 2976) with call to `renderOutcomeZone()`; update `collectResponses()` to read Attack outcome from checked radio

---

## Out of scope

- Sphere/Allies outcome zone — dtui-15/16 (Allies parity)
- Ambience Change consolidation (merging increase/decrease) — dtui-10
- Desired outcome zone positioning — zone order is fixed by dtui-4 (`outcome` zone always before target zone in ACTION_FIELDS iteration; dtui-5 already placed Solo/Joint at the bottom)

---

## Acceptance Criteria

### AC1 — Ambience read-only outcome

**Given** a player selects "Ambience Change (Increase)" or "Ambience Change (Decrease)",
**When** the Outcome zone renders,
**Then** it shows a read-only text line: "Improve the ambience of the targeted territory." or "Degrade the ambience of the targeted territory." respectively. No editable input.

### AC2 — Attack: Destroy/Degrade/Disrupt ticker

**Given** a player selects "Attack",
**When** the Outcome zone renders,
**Then** it shows a `.dt-ticker` fieldset labelled "Desired Outcome" with three pills: Destroy, Degrade, Disrupt. Destroy is pre-selected by default.

### AC3 — Attack ticker value persists

**Given** a player selected "Disrupt" for an Attack action and saved,
**When** the form reloads from saved data,
**Then** the Disrupt pill is shown as selected.

### AC4 — Read-only outcomes for Hide/Protect, Investigate, Patrol/Scout

**Given** a player selects "Hide/Protect", "Investigate", or "Patrol/Scout",
**When** the Outcome zone renders,
**Then** it shows the corresponding read-only text per the table above. No editable input.

### AC5 — Misc: freetext with updated prompt

**Given** a player selects "Misc",
**When** the Outcome zone renders,
**Then** it shows a text input labelled "Desired Outcome" with placeholder "State the goal of this project, aiming to achieve one clear thing."

### AC6 — XP Spend and Maintenance: no outcome zone

**Given** a player selects "XP Spend" or "Maintenance",
**When** the pane renders,
**Then** no Desired Outcome zone is present.

---

## Implementation Notes

### Update ACTION_FIELDS

Add `'outcome'` to `ambience_increase` and `ambience_decrease` entries, keeping outcome before territory (spec zone order — Outcome before Target):

```javascript
'ambience_increase': ['title', 'outcome', 'territory', 'pools', 'description'],
'ambience_decrease': ['title', 'outcome', 'territory', 'pools', 'description'],
```

### New `renderOutcomeZone()` helper

Add near the other render helpers:

```javascript
function renderOutcomeZone(n, actionVal, saved) {
  const savedOutcome = saved[`project_${n}_outcome`] || '';

  const READONLY = {
    'ambience_increase': 'Improve the ambience of the targeted territory.',
    'ambience_decrease': 'Degrade the ambience of the targeted territory.',
    'hide_protect':      'Attempt to protect the asset from attacks this downtime.',
    'investigate':       'Uncover a secret or mystery about the target.',
    'patrol_scout':      'Observe the territory closely for intrusive or adversarial activity.',
  };

  if (READONLY[actionVal]) {
    return `<div class="qf-field"><p class="dt-outcome-readonly qf-desc">${esc(READONLY[actionVal])}</p></div>`;
  }

  if (actionVal === 'attack') {
    const pills = ['destroy', 'degrade', 'disrupt'];
    const sel = savedOutcome || 'destroy';
    let h = `<fieldset class="dt-ticker" id="dt-project_${n}_outcome_group">`;
    h += '<legend class="dt-ticker__legend">Desired Outcome</legend>';
    for (const p of pills) {
      const label = p[0].toUpperCase() + p.slice(1);
      h += `<label class="dt-ticker__pill"><input type="radio" name="dt-project_${n}_outcome" value="${p}"${sel === p ? ' checked' : ''} data-proj-outcome="${n}"> ${label}</label>`;
    }
    h += '</fieldset>';
    return h;
  }

  if (actionVal === 'misc') {
    return `<div class="qf-field">` +
      `<label class="qf-label" for="dt-project_${n}_outcome">Desired Outcome</label>` +
      `<input type="text" id="dt-project_${n}_outcome" class="qf-input" data-proj-outcome="${n}" ` +
      `placeholder="${esc('State the goal of this project, aiming to achieve one clear thing.')}" ` +
      `value="${esc(savedOutcome)}">` +
      `</div>`;
  }

  return '';
}
```

### Replace generic outcome render in renderProjectSlots()

Find the `outcome` field render (approximately line 2976):
```javascript
if (fields.includes('outcome')) {
  h += renderQuestion({
    key: `project_${n}_outcome`, label: 'Desired Outcome',
    type: 'text', required: false,
    desc: 'Each Project must aim to achieve ONE clear thing.',
    ...
  }, ...);
}
```

Replace with:
```javascript
if (fields.includes('outcome')) {
  h += renderOutcomeZone(n, actionVal, saved);
}
```

### Update collectResponses() for radio outcome

The existing `collectResponses()` at line 427–432 uses `document.getElementById(`dt-project_${n}_outcome`)` which won't find the Attack radio group (no single element with that id). Add a radio fallback:

```javascript
const outcomeEl = document.getElementById(`dt-project_${n}_outcome`);
const outcomeRadio = document.querySelector(`input[name="dt-project_${n}_outcome"]:checked`);
responses[`project_${n}_outcome`] = outcomeEl ? outcomeEl.value : (outcomeRadio ? outcomeRadio.value : '');
```

### Event handling for Attack ticker

Radio buttons under `data-proj-outcome="${n}"` need to trigger save on change. The existing delegated handler for `[data-project-solo-joint]` (and similar data attributes) fires `scheduleSave()` on change. Add a handler for `data-proj-outcome` in the same delegation block.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — update `ACTION_FIELDS`; add `renderOutcomeZone()`; replace outcome render block; update `collectResponses()`; add `data-proj-outcome` change handler

---

## Definition of Done

- AC1–AC6 verified
- Attack outcome ticker saves and loads correctly
- Misc freetext saves and loads correctly
- Read-only outcomes are not stored (no data written for them)
- `specs/stories/sprint-status.yaml` updated: dtui-9 → review

---

## Compliance

- CC4 — Token discipline: ticker uses `.dt-ticker` / `.dt-ticker__legend` / `.dt-ticker__pill` from dtui-1 CSS; no bare hex
- CC5 — British English, no em-dashes in all copy
- CC9 — Uses `.dt-ticker` canonical component (dtui-1)

---

## Dependencies and Ordering

- **Depends on:** dtui-4 (action block shell), dtui-5 (Solo/Joint moved), dtui-1 (`.dt-ticker` CSS)
- **Unblocks:** dtui-10 (Ambience consolidation extends this pattern)
- Can be implemented concurrently with dtui-6, dtui-7, dtui-8 once dtui-4 is in

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

- Added `'outcome'` to `ambience_increase`/`ambience_decrease` in `ACTION_FIELDS` (before `territory`).
- Added `renderOutcomeZone()` helper: READONLY map for 5 action types; `.dt-ticker` with 3 pills (Destroy/Degrade/Disrupt) for attack (defaults to 'destroy'); freetext input for misc; returns '' for unhandled actions.
- Replaced generic `renderQuestion` outcome block in `renderProjectSlots()` with `renderOutcomeZone(n, actionVal, saved)` call.
- Updated `collectResponses()`: radio fallback (`input[name="dt-project_${n}_outcome"]:checked`) when no element with id `dt-project_${n}_outcome` exists (attack uses radio group).
- Added `data-proj-outcome` change handler in delegated change listener — calls `scheduleSave()`.

### File List

- `public/js/tabs/downtime-form.js`

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-9 story drafted; ready-for-dev. |
| 2026-04-29 | DTUI-9 implemented: renderOutcomeZone + ACTION_FIELDS update + collectResponses radio fallback. |
