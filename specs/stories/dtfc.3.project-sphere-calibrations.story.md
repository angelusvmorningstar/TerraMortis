---
id: dtfc.3
epic: downtime-form-calibration
group: A
status: done
priority: high
depends_on: [dtfc.2]
---

# Story dtfc.3: Project and Sphere Field Calibrations

As a player filling out my Projects and Spheres of Influence,
I want each action type to show only the relevant fields with smart targeting,
So that I'm prompted to give the ST exactly the information they need — no more, no less.

---

## Context

Multiple calibrations across the Projects and Spheres sections:

- Project actions need action-type-aware target pickers (character vs territory vs free-text)
- Pool pre-loading (auto-filling Attr/Skill on action selection) is removed — players select their own pool
- Investigate needs a mandatory "lead" field
- Sphere Allies actions: description removed from most; targeting tightened; Acquisition removed
- New sections: Status (auto-detect Broad/Narrow/MCI) and Retainer actions
- New project action type: Maintenance (gated on Professional Training or MCI)

---

## Acceptance Criteria

### Project Targeting

**Given** a project slot with action type `ambience_increase` or `ambience_decrease`  
**When** the player views the slot  
**Then** a territory dropdown appears (from `TERRITORY_DATA`)  
**And** no character picker is shown

**Given** a project slot with action type `attack`  
**When** the player views the slot  
**Then** a character picker appears (same cast picker modal, single-select)  
**And** collaborators are allowed; observer option is not shown for Attack

**Given** a project slot with action type `hide_protect`  
**When** the player views the slot  
**Then** a target picker shows the player's own merits/assets (from `currentChar.merits`, filtered to influence/general/standing categories)  
**And** the player selects one merit or asset to protect

**Given** a project slot with action type `investigate`  
**When** the player views the slot  
**Then** a flexible target picker appears: radio options for Character / Territory / Other (free-text)  
**And** a mandatory field "What is your lead on this investigation?" is present  
**And** the lead field must be non-empty for the slot to show as complete

### No Pool Pre-loading

**Given** any project slot  
**When** the player selects an action type  
**Then** the Attr, Skill, and Discipline selectors are blank — no defaults are pre-filled  
**And** the player must make explicit selections

### Feed Action

**Given** a project slot with action type `feed`  
**When** the player views the slot  
**Then** the slot shows "Committed to feeding rote — see Feeding section" as read-only content  
**And** the slot cannot be independently configured (it mirrors the rote commitment from the Feeding section)

### Sphere Allies Calibrations

**Given** an Allies sphere slot with action type `ambience_increase` or `ambience_decrease`  
**When** the player views it  
**Then** a territory picker is shown  
**And** no description field is present

**Given** an Allies sphere slot with action type `attack`  
**When** the player views it  
**Then** a character picker is shown  
**And** no description field

**Given** an Allies sphere slot with action type `block`  
**When** the player views it  
**Then** a character picker for the target player is shown  
**And** a free-text field: "Which merit are you targeting?" (no list — player guesses)  
**And** no description field

**Given** an Allies sphere slot with action type `hide_protect`  
**When** the player views it  
**Then** a picker for the player's own merits/assets is shown  
**And** no description field

**Given** an Allies sphere slot with action type `investigate`  
**When** the player views it  
**Then** same flexible targeting (Character / Territory / Other) + mandatory lead field as project investigate  
**And** no description field

**Given** an Allies sphere slot with action type `support`  
**When** the player views it  
**Then** a dropdown of the player's existing active projects (from project slots with a non-empty action) is shown  
**And** no description field

**Given** an Allies sphere slot with action type `grow` or `misc`  
**When** the player views it  
**Then** a description field is present (unchanged)

**Given** the Allies sphere action type selector  
**When** the player opens the dropdown  
**Then** `Acquisition` is not listed as an option

### Status Section

**Given** a character with Broad Status, Narrow Status, or MCI merits  
**When** the form renders  
**Then** a Status section appears after Allies, using the same tabbed model  
**And** one tab is generated per detected Status merit (Broad Status, Narrow Status per type, MCI)  
**And** each tab has an action type selector with an appropriate action list (TBD in implementation — use same sphere action list as starting point)

**Given** a character with no Status merits  
**When** the form renders  
**Then** no Status section is shown

### Retainer Actions Section

**Given** a character with one or more Retainer merits  
**When** the form renders  
**Then** a Retainer actions section appears, one tab per Retainer  
**And** each tab shows the retainer name/rating and a task description field  
**And** response keys: `retainer_N_type`, `retainer_N_task` (existing keys — no change)

**Given** a character with no Retainer merits  
**When** the form renders  
**Then** no Retainer actions section is shown

### Maintenance Action

**Given** a character with Professional Training or MCI  
**When** the player views the project action type selector  
**Then** "Maintenance" appears as an option

**Given** a project slot with action type `maintenance`  
**When** the player views it  
**Then** only a description textarea is shown — no pool, no target, no cast  
**And** `project_N_action` = `'maintenance'`

**Given** a character without Professional Training or MCI  
**When** the player views the project action type selector  
**Then** "Maintenance" does not appear

---

## Implementation Notes

### Target picker pattern

Add a `renderTargetPicker(n, actionType, saved)` helper that returns the appropriate HTML:
- `'territory'` → `<select>` from `TERRITORY_DATA`
- `'character'` → the existing cast picker button (single-select variant)
- `'flex'` → three radio buttons (Character / Territory / Other) + conditional character/territory/text input below
- `'own_merit'` → `<select>` built from `currentChar.merits` filtered to general/influence/standing
- `'project_support'` → `<select>` from active project slots (slots 1–4 with non-empty action, excluding self)
- `'block_merit'` → character picker + free-text "merit name" field

Response keys for target:
- `project_N_target_type` ('character' | 'territory' | 'other' | 'merit' | 'project_support')
- `project_N_target_value` (character _id, territory id, free text, or merit key)

For sphere actions: `sphere_N_target_type`, `sphere_N_target_value`.

### Removing pool pre-loading

In `ACTION_POOL_DEFAULTS` (downtime-form.js ~line 109), this object exists but is only applied "when both attr and skill are unset (first selection)". Remove the application logic — do not delete the object in case it's useful for display hints later.

### Status detection

In `detectMerits()`, add:
```js
detectedMerits.status = deduplicateMerits(merits.filter(m =>
  m.category === 'influence' && m.name === 'Status'
)).concat(
  merits.filter(m => m.category === 'standing' && m.name === 'MCI')
);
```

Broad vs Narrow Status: all Status merits with no qualifier are Broad. Status merits with a qualifier (e.g. "LHL") are Narrow. Render label accordingly.

### Maintenance gate

In `renderProjectSlots`, filter `PROJECT_ACTIONS` list:
```js
const hasMaintenance = (currentChar.merits || []).some(m =>
  m.name === 'Professional Training' || m.name === 'MCI'
);
const availableActions = PROJECT_ACTIONS.filter(opt =>
  opt.value !== 'maintenance' || hasMaintenance
);
```

Add `'maintenance'` to `PROJECT_ACTIONS` in `downtime-data.js` with label "Maintenance".
Add `ACTION_FIELDS['maintenance'] = ['description']`.

### ACTION_FIELDS updates

- `'feed'`: change `['summary']` → lock display only (no fields)
- `'attack'` in projects: add `'target_char'` to fields list
- `'hide_protect'`: add `'target_own_merit'`
- `'investigate'`: add `'target_flex'`, `'investigate_lead'`

In `SPHERE_ACTION_FIELDS`:
- Remove `'description'` from: `ambience_increase`, `ambience_decrease`, `attack`, `block`, `hide_protect`, `investigate`, `support`
- Add appropriate target field per action
- Remove `'acquisition'` from `SPHERE_ACTIONS` list in `downtime-data.js`

---

## Files Expected to Change

- `public/js/player/downtime-form.js` — target pickers, field rendering per action, maintenance gate, status/retainer sections, remove pool pre-load
- `public/js/player/downtime-data.js` — `PROJECT_ACTIONS` (add maintenance), `SPHERE_ACTIONS` (remove acquisition), `ACTION_FIELDS`, `SPHERE_ACTION_FIELDS`
- `public/css/components.css` — target picker styles, maintenance action styles

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
ACTION_FIELDS updated: feed → locked message only, attack/investigate/hide_protect get target pickers, maintenance added (gated on Prof Training or MCI). SPHERE_ACTION_FIELDS: description removed from ambience/attack/block/hide_protect/investigate/support; acquisition removed from SPHERE_ACTIONS and the field map. Pool pre-loading defaults removed from renderDicePool. renderSphereFields helper extracted (shared by Allies and Status panes). Status section added to renderMeritToggles with auto-detection of Broad/Narrow/MCI. detectedMerits.status added; spheres now Allies-only. Status/flex-type/status-action change handlers wired in. collectResponses updated for new target_type/target_value/investigate_lead/status fields.
### File List
- public/js/player/downtime-data.js
- public/js/player/downtime-form.js
- public/css/components.css
