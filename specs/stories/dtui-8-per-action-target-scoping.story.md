---
id: dtui.8
epic: dtui
status: ready-for-dev
priority: high
depends_on: [dtui.4, dtui.2]
---

# Story DTUI-8: Per-action Target selector scoping

As a player picking an action,
I want only the targeting options that make sense for that action to appear,
So that I can't accidentally pick an invalid target.

---

## Context

The current form has three separate target field types in `ACTION_FIELDS`:
- `target_char` — checkbox grid of all characters (used by Attack, rendered around lines 2905-2925)
- `target_flex` — radio (Character/Territory/Other) + sub-widget per choice (Investigate; uses `renderTargetPicker()` at line 4320)
- `target_own_merit` — dropdown of own merits (Hide/Protect, rendered around lines 2927-2941)

This story replaces these with a unified **Target zone** using the new `.dt-chip-grid` component from dtui-2. Each action type gets the correct target variant. Target selector is always in the main block body (never suppressed by isJoint — that suppression was removed by dtui-5).

### Target scoping rules per action (from UX spec FR18)

| Action | Target type | Widget |
|---|---|---|
| `ambience_increase` | Territory only | Territory `.dt-chip-grid` (single-select) |
| `ambience_decrease` | Territory only | Territory `.dt-chip-grid` (single-select) |
| `attack` | Character or Other | Character/Other radio + Character `.dt-chip-grid` (single-select) OR Other freetext |
| `hide_protect` | Character or Other | Character/Other radio + Character `.dt-chip-grid` (single-select) OR Other freetext |
| `investigate` | Character / Territory / Other | Three-way radio + Character `.dt-chip-grid` (single-select) / Territory `.dt-chip-grid` (single-select) / Other freetext |
| `patrol_scout` | Territory only | Territory `.dt-chip-grid` (single-select) |
| `xp_spend` | None | Target zone hidden |
| `misc` | Character / Territory / Other | Same as Investigate |
| `maintenance` | Own merits — chip array | `.dt-chip-grid` of own maintenance merits (dtui-11 handles this specifically) |
| `support` | None (removed by dtui-4) | — |

Note: Attack and Hide/Protect originally used different target pickers. Both now use the same Character-or-Other chip model.

### Territory data

Characters are available as `_allChars` (loaded at form init). Territories are available from `TERRITORY_DATA` (imported from `downtime-data.js`).

---

## Files in scope

- `public/js/tabs/downtime-form.js` — replace `target_char`, `target_flex`, `target_own_merit` render blocks with a unified `target` render; update `ACTION_FIELDS` to use `'target'` field key for all actions that had target fields

---

## Out of scope

- Maintenance chip array — dtui-11 (maintenance uses a specialised variant of the target zone)
- Ambience Improve/Degrade ticker — dtui-10 (the ticker is added to the Ambience target zone during that consolidation story)
- Allies target scoping — dtui-16
- The investigation lead field (`investigate_lead`) — stays as-is alongside the target zone for Investigate

---

## Acceptance Criteria

### AC1 — Attack and Hide/Protect: Character or Other chip model

**Given** a player selects "Attack" or "Hide/Protect",
**When** the Target zone renders,
**Then** it shows a Character/Other radio toggle. Selecting "Character" shows a `.dt-chip-grid` (single-select) of all characters. Selecting "Other" shows a freetext field.

### AC2 — Investigate and Misc: three-way radio

**Given** a player selects "Investigate" or "Misc",
**When** the Target zone renders,
**Then** it shows a Character/Territory/Other radio toggle. Each option shows the appropriate widget (Character `.dt-chip-grid` single-select / Territory `.dt-chip-grid` single-select / Other freetext).

### AC3 — Ambience and Patrol/Scout: Territory chips only

**Given** a player selects "Ambience Change (Increase/Decrease)" or "Patrol/Scout",
**When** the Target zone renders,
**Then** it shows Territory `.dt-chip-grid` (single-select) only. No Character or Other radio toggle.

### AC4 — XP Spend and Maintenance: no target zone

**Given** a player selects "XP Spend" or "Maintenance",
**When** the Target zone renders,
**Then** the Target zone is absent entirely. (Maintenance target is handled separately by dtui-11.)

### AC5 — Character chips show all characters, no attendance filtering

**Given** a Character `.dt-chip-grid` renders for any action,
**When** chips populate,
**Then** all active characters from `_allChars` appear. No attendance-based grey-out here (attendance grey-out is Court section only, per dtui-20).

### AC6 — Saved target values preserved

**Given** a player had a character chip selected for an Attack action,
**When** the form reloads from saved data,
**Then** the same character chip is shown as selected.

---

## Implementation Notes

### Unified target field key

Update `ACTION_FIELDS` to replace `target_char`, `target_flex`, `target_own_merit` with a single `'target'` key where a target is shown:

```javascript
const ACTION_FIELDS = {
  '': [],
  'feed': [],
  'xp_spend': ['xp_picker'],
  'ambience_increase': ['title', 'territory', 'pools', 'description'],  // territory stays separate; outcome added by dtui-9
  'ambience_decrease': ['title', 'territory', 'pools', 'description'],
  'attack':            ['title', 'outcome', 'target', 'pools', 'description'],  // outcome before target (spec zone order)
  'investigate':       ['title', 'outcome', 'target', 'investigate_lead', 'pools', 'description'],
  'hide_protect':      ['title', 'outcome', 'target', 'pools', 'description'],
  'patrol_scout':      ['title', 'outcome', 'target', 'pools', 'description'],  // patrol uses territory target
  'misc':              ['title', 'outcome', 'target', 'pools', 'description'],
  'maintenance':       ['description'],  // maintenance_target handled by dtui-11
};
```

Note on field order: the spec zone order (dtui-4) places Outcome zone BEFORE Target zone. ACTION_FIELDS iteration order must match. In `renderProjectSlots()`, ensure the `renderOutcomeZone()` call (dtui-9) is placed before `renderTargetZone()` in the if-block sequence.

Note: `ambience_increase`/`ambience_decrease` keep `territory` as a separate field because territory display (with ambience mod info) has additional context. The Ambience Improve/Degrade ticker is added by dtui-10.

### New target render function

Add a helper function `renderTargetZone(n, actionVal, saved, chars)` that returns HTML based on action type:

```javascript
function renderTargetZone(n, actionVal, saved, chars) {
  const savedType   = saved[`project_${n}_target_type`] || '';
  const savedCharId = saved[`project_${n}_target_value`] || '';
  const savedTerrId = saved[`project_${n}_target_terr`] || '';
  const savedOther  = saved[`project_${n}_target_other`] || '';

  // Territory-only actions
  if (['ambience_increase', 'ambience_decrease', 'patrol_scout'].includes(actionVal)) {
    return renderTargetTerritoryChips(n, savedTerrId);
  }

  // Character-or-Other actions (Attack, Hide/Protect)
  if (['attack', 'hide_protect'].includes(actionVal)) {
    return renderTargetCharOrOther(n, savedType, savedCharId, savedOther, chars, false);
  }

  // Three-way actions (Investigate, Misc)
  if (['investigate', 'misc'].includes(actionVal)) {
    return renderTargetCharOrOther(n, savedType, savedCharId, savedOther, chars, true);
  }

  return '';
}
```

The sub-renderers (`renderTargetTerritoryChips`, `renderTargetCharOrOther`) generate the chip-grid HTML using `.dt-chip-grid`/`.dt-chip` classes from dtui-2.

### Saved field keys

For backward compatibility, the existing `project_N_target_value` key (previously used by `target_char` for character IDs) is repurposed as the character target value. New keys:
- `project_N_target_type` — `'character'` / `'territory'` / `'other'` (new; replaces implicit type from old field key)
- `project_N_target_value` — selected character `_id` (existing key reused)
- `project_N_target_terr` — selected territory id (new; replaces old `territory` field for territory targeting)
- `project_N_target_other` — freetext for Other (new)

Old data with `project_N_target_value` set to a character ID will still display correctly when `savedType` defaults to `'character'`.

### Character chip interaction

Territory and character chips use `data-project-target-char` and `data-project-target-terr` attributes on chip buttons. A delegated click handler (add to the existing `downtime-form.js` event delegation) toggles `.dt-chip--selected` and writes to the saved state, then calls `scheduleSave()`.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — update `ACTION_FIELDS`; add `renderTargetZone()` helper and two sub-renderers; remove old `target_char`, `target_flex`, `target_own_merit` render blocks; add chip click event handlers

---

## Definition of Done

- AC1–AC6 verified
- All target types render correctly with `.dt-chip-grid`
- Territory chips and character chips are single-select
- Saved target values load and display as pre-selected chips
- Old `target_value` character IDs preserved on load
- No regression in Investigate lead field
- `specs/stories/sprint-status.yaml` updated: dtui-8 → review

---

## Compliance

- CC1 — Effective rating discipline: character eligibility not filtered here (Court section handles attendance; this is universal target scoping)
- CC2 — Filter-to-context: target zone hidden for XP Spend, hidden for Maintenance (dtui-11 replaces it)
- CC3 — Greyed-with-reason: disabled chips (if any) show tooltip
- CC4 — Token discipline: chip classes from dtui-2 CSS; no bare hex
- CC9 — Uses `.dt-chip-grid`/`.dt-chip` canonical components (dtui-2)

---

## Dependencies and Ordering

- **Depends on:** dtui-2 (`.dt-chip-grid` CSS), dtui-4 (ACTION_FIELDS structure), dtui-5 (target not suppressed by isJoint)
- **Unblocks:** dtui-11 (Maintenance chip array extends this pattern), dtui-16 (Allies target scoping)

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
| 2026-04-29 | DTUI-8 story drafted; ready-for-dev. |
