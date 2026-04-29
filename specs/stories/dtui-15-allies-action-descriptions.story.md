---
id: dtui.15
epic: dtui
status: review
priority: high
depends_on: [dtui.4, dtui.6, dtui.3]
---

# Story DTUI-15: Allies action descriptions parity (no Approach field)

As a player configuring an Allies merit-based action,
I want Allies actions to show the same per-action descriptions as Personal Projects (without an Approach field),
So that I learn the action types once and they work the same across contexts.

---

## Context

The Allies merit-based action blocks are rendered in `renderMeritToggles()` (line ~4695) under the "Spheres of Influence" section. Each Allies merit tab renders a `<select id="dt-sphere_N_action">` dropdown populated from `SPHERE_ACTIONS` (downtime-data.js line ~46).

**Current state of `SPHERE_ACTIONS`:**
```javascript
['', 'ambience_increase', 'ambience_decrease', 'attack', 'block',
 'hide_protect', 'investigate', 'patrol_scout', 'rumour', 'support', 'grow', 'misc']
```

**Changes required to `SPHERE_ACTIONS`:**
1. Remove `'support'` — no longer selectable by player (Support is delivered via the Joint hub chip in dtui-14)
2. Remove `'rumour'` — removed per FR25
3. There is **no separate `'scout'`** in the current array (FR25 references "Scout" but `patrol_scout` is retained — treat as spec artifact; no change needed for scout)
4. Add `'maintenance'` — Allies can declare Maintenance per FR26 (treat the same as Personal Projects maintenance; dtui-16 handles its target zone)

**Current state of `SPHERE_ACTION_FIELDS`:**
```javascript
{
  '': [],
  'ambience_increase': ['territory', 'outcome'],
  'ambience_decrease': ['territory', 'outcome'],
  'attack': ['target_char', 'outcome'],
  'block': ['target_char', 'block_merit', 'outcome'],
  'hide_protect': ['target_own_merit', 'outcome'],
  'investigate': ['target_flex', 'investigate_lead', 'outcome'],
  'patrol_scout': ['territory', 'outcome', 'description'],
  'rumour': ['outcome', 'description'],
  'support': ['project_support', 'outcome'],
  'grow': ['outcome', 'description'],
  'misc': ['outcome', 'description'],
}
```

**Changes required to `SPHERE_ACTION_FIELDS`:**
1. Remove `'rumour'` and `'support'` entries
2. Add `'maintenance': ['maintenance_target']` (dtui-16 will implement `renderSphereFields()` maintenance branch)
3. Remove `'description'` from all entries — Allies blocks have no Approach textarea (FR26)

**`.dt-action-desc` for sphere actions:**
The sphere action block currently renders a `<select>` but no `.dt-action-desc` below it. This story adds the same `ACTION_DESCRIPTIONS` copy (from dtui-3/dtui-6) below the dropdown for each sphere action type. Use the same pattern: render a `div.dt-action-desc` with `aria-live="polite"` after the action `<select>`.

**No Approach textarea:**
`renderSphereFields()` renders a `description` field when `fields.includes('description')`. By removing `'description'` from all `SPHERE_ACTION_FIELDS` entries, the Approach textarea is suppressed automatically in all Allies blocks.

**Note on `ambience_increase` / `ambience_decrease`:** dtui-10 consolidated these into `ambience_change` for *project* slots. For sphere (Allies) actions, the existing `ambience_increase` / `ambience_decrease` split remains — dtui-17 handles the eligibility gate, and it builds on the existing sphere Ambience implementation. Do **not** consolidate sphere ambience in this story — that is dtui-16/17 scope.

---

## Files in scope

- `public/js/tabs/downtime-data.js` — update `SPHERE_ACTIONS` (remove rumour/support, add maintenance); update `SPHERE_ACTION_FIELDS` (remove rumour/support entries, add maintenance, remove `description` from all entries)
- `public/js/tabs/downtime-form.js` — in the sphere tab-pane render loop (~line 4748), add `.dt-action-desc` below the `<select>` using `ACTION_DESCRIPTIONS`; confirm `renderSphereFields()` omits description field with updated `SPHERE_ACTION_FIELDS`

---

## Out of scope

- Allies target zone changes (dtui-16)
- Allies Ambience eligibility gate (dtui-17)
- Allies Grow XP treatment (dtui-19)
- `ambience_increase` / `ambience_decrease` consolidation for sphere slots — left for dtui-17

---

## Acceptance Criteria

### AC1 — Allies dropdown excludes Support and Rumour

**Given** the Allies action-type dropdown renders,
**When** the player browses options,
**Then** the dropdown does NOT include "Support" or "Rumour" options.

### AC2 — Allies dropdown includes Maintenance

**Given** the Allies action-type dropdown renders,
**When** the player browses options,
**Then** "Maintenance" appears as a selectable option.

### AC3 — Action description appears below dropdown

**Given** a player picks an Allies action type,
**When** the action block re-renders,
**Then** a `.dt-action-desc` element appears below the `<select>` showing the same copy as Personal Projects (e.g. Attack copy from dtui-6).

### AC4 — No Approach textarea in any Allies block

**Given** an Allies action block renders any action type,
**When** zones surface,
**Then** no "Approach" / "Description" textarea is rendered (the `description` field is absent from all SPHERE_ACTION_FIELDS entries).

### AC5 — Existing saved data for removed actions degrades gracefully

**Given** a character has an existing submission with `sphere_1_action = 'support'` or `sphere_1_action = 'rumour'`,
**When** the Allies dropdown renders,
**Then** the dropdown shows the empty `— No Action Taken —` option (the saved value is no longer a valid option; do not error; clear to empty on re-save).

---

## Implementation Notes

### Updated `SPHERE_ACTIONS` (downtime-data.js)

```javascript
export const SPHERE_ACTIONS = [
  { value: '', label: '— No Action Taken —' },
  { value: 'ambience_increase', label: 'Ambience Change (Increase): Make a Territory delicious' },
  { value: 'ambience_decrease', label: 'Ambience Change (Decrease): Make Territory not delicious' },
  { value: 'attack', label: 'Attack: Attempt to destroy merits, holdings, projects, or NPCs' },
  { value: 'block', label: 'Block: Prevent someone else from using a specific Social Merit' },
  { value: 'hide_protect', label: 'Hide/Protect: Attempt to secure actions, merits, holdings, or projects' },
  { value: 'investigate', label: 'Investigate: Begin or further an investigation' },
  { value: 'patrol_scout', label: 'Patrol/Scout: Attempt to monitor a given Territory or area' },
  { value: 'grow', label: 'Grow: Attempt to acquire Allies or Status 4 or 5' },
  { value: 'misc', label: 'Misc: For things that don\'t fit in other categories' },
  { value: 'maintenance', label: 'Maintenance: Upkeep of professional or cult relationships' },
];
```

### Updated `SPHERE_ACTION_FIELDS` (downtime-data.js)

Remove `description` from every entry; remove `rumour` and `support`; add `maintenance`:

```javascript
const SPHERE_ACTION_FIELDS = {
  '': [],
  'ambience_increase':  ['territory', 'outcome'],
  'ambience_decrease':  ['territory', 'outcome'],
  'attack':             ['target_char', 'outcome'],
  'block':              ['target_char', 'block_merit', 'outcome'],
  'hide_protect':       ['target_own_merit', 'outcome'],
  'investigate':        ['target_flex', 'investigate_lead', 'outcome'],
  'patrol_scout':       ['territory', 'outcome'],
  'grow':               ['outcome'],
  'misc':               ['outcome'],
  'maintenance':        ['maintenance_target'],  // dtui-16 implements renderSphereFields maintenance branch
};
```

### Adding `.dt-action-desc` to sphere blocks

In the sphere tab-pane render loop (line ~4748), after the action-type `<select>` closing div, add:

```javascript
// Action description (dtui-15: same copy as project blocks)
if (actionVal && ACTION_DESCRIPTIONS[actionVal]) {
  h += `<div class="dt-action-desc" aria-live="polite">${esc(ACTION_DESCRIPTIONS[actionVal])}</div>`;
}
```

`ACTION_DESCRIPTIONS` is already exported from downtime-data.js (line ~33) and imported in downtime-form.js. The keys in `ACTION_DESCRIPTIONS` use project action names (`'attack'`, `'investigate'`, etc.). For sphere actions, the keys match directly except for ambience variants — map:
- `'ambience_increase'` → `ACTION_DESCRIPTIONS['ambience_change_improve']`
- `'ambience_decrease'` → `ACTION_DESCRIPTIONS['ambience_change_degrade']`

Add this mapping inline or as a small helper:

```javascript
function sphereActionDescKey(val) {
  if (val === 'ambience_increase') return 'ambience_change_improve';
  if (val === 'ambience_decrease') return 'ambience_change_degrade';
  return val;
}
```

### Back-compat for saved values that no longer exist in dropdown

The `<select>` renders the saved value via `actionVal === opt.value ? ' selected' : ''`. If `actionVal` is `'support'` or `'rumour'` (legacy saved value not in new SPHERE_ACTIONS), no option matches — the select falls to the first option (`''`). This is correct behaviour; the player must re-select. No special handling needed.

---

## Files Expected to Change

- `public/js/tabs/downtime-data.js` — update `SPHERE_ACTIONS`; update `SPHERE_ACTION_FIELDS`
- `public/js/tabs/downtime-form.js` — add `.dt-action-desc` render in sphere tab-pane loop; import `sphereActionDescKey` helper if extracted

---

## Definition of Done

- AC1–AC5 verified
- Support and Rumour absent from Allies dropdown
- Maintenance present in Allies dropdown
- `.dt-action-desc` renders for each Allies action type with correct copy
- No Approach textarea in any Allies block
- Legacy `support`/`rumour` saved values degrade gracefully to empty selection
- `specs/stories/sprint-status.yaml` updated: dtui-15 → review

---

## Compliance

- CC4 — Token discipline: no bare hex in CSS; action desc uses existing `.dt-action-desc` class
- CC5 — British English, no em-dashes: confirm all Allies action labels and descriptions
- CC9 — Uses `.dt-action-desc` canonical component (dtui-3); SPHERE_ACTIONS update follows established pattern

---

## Dependencies and Ordering

- **Depends on:** dtui-4 (action block shell), dtui-6 (ACTION_DESCRIPTIONS established), dtui-3 (`.dt-action-desc` component)
- **Unblocks:** dtui-16 (Allies target scoping), dtui-17 (Allies Ambience gate), dtui-19 (Allies Grow)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

`SPHERE_ACTIONS` updated in `downtime-data.js`: 'support' and 'rumour' removed; 'maintenance' added. `SPHERE_ACTION_FIELDS` updated in `downtime-form.js`: 'rumour' and 'support' entries removed; 'description' removed from all remaining entries; 'maintenance': ['maintenance_target'] added. `sphereActionDescKey()` helper maps ambience_increase/decrease to the `_improve`/`_degrade` ACTION_DESCRIPTIONS keys. `.dt-action-desc` block added to sphere pane render loop after the select. `ACTION_DESCRIPTIONS` was already imported. The `o.value !== 'grow'` filter on the sphere dropdown is left for dtui-19.

### File List

- `public/js/tabs/downtime-data.js`
- `public/js/tabs/downtime-form.js`

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-15 story drafted; ready-for-dev. |
| 2026-04-29 | DTUI-15 implemented; status → review. |
