---
id: dt-form.30
task: 30
issue: 85
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/85
branch: morningstar-issue-85-hide-equipment-section
epic: epic-dt-form-mvp-redesign
status: review
priority: low
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Audit-baseline)
---

# Story dt-form.30 — Equipment section hidden for this DT cycle

As an ST shipping the redesigned DT form,
I should not see the Equipment section in the form for this cycle (neither MINIMAL nor ADVANCED),
So that players are not asked questions about equipment that the cycle's mechanics don't yet consume.

## Context

ADR-003 §Audit-baseline marks Equipment as: *"Hidden for this DT cycle per task #30."*

This is a hide, not a remove. The section's render path is gated off via a `hidden: true` flag on the DOWNTIME_SECTIONS entry. Data already in `responses.equipment_*` keys is preserved across saves. Flipping `hidden` back to `false` re-enables the section without code archaeology.

## Files in Scope

- `public/js/tabs/downtime-data.js` — add `hidden: true` to the Equipment entry in `DOWNTIME_SECTIONS`
- `public/js/tabs/downtime-form.js` — two changes: (1) `renderEquipmentSection` bail-out; (2) collect block guard

## Files NOT in Scope

- Existing `equipment_*` values in MongoDB — preserved as-is; form just stops surfacing them
- `server/schemas/downtime_submission.schema.js` — no change; schema still accepts equipment fields
- Any equipment-related helpers not in these two files

## Acceptance Criteria

**Given** a player opens the DT form (MINIMAL or ADVANCED mode)
**When** the form renders
**Then** the Equipment section is not visible — no heading, no fields, no chrome

**Given** a legacy submission with `equipment_*` fields populated is loaded
**When** the form renders and the player saves (without touching equipment)
**Then** the equipment fields are preserved in the saved responses (not overwritten with empty strings)

**Given** `hidden: true` is set on the Equipment DOWNTIME_SECTIONS entry
**When** a developer wants to re-enable Equipment for a future cycle
**Then** setting `hidden: false` (or removing the flag) restores the section without any other code change

## Implementation Notes

### How the data-preservation invariant works

`collectResponses()` opens with (line 348):
```javascript
const _prior = responseDoc?.responses || {};
const responses = { ..._prior };
```
This spreads all previously-saved responses (including any `equipment_*` keys) as the base. If the equipment collect block is skipped, those keys are never overwritten — they survive the save as-is.

The equipment collect block (lines 949–960) is inside `if (!_isMinimal)`. In MINIMAL mode it's already skipped and prior values survive. In ADVANCED mode (when `!_isMinimal` is true) we must also skip it when hidden — otherwise `getElementById` returns null, `equipSlotCount` defaults to 1, and the block writes empty strings that overwrite prior data.

### Change 1 — Add `hidden: true` to Equipment entry (`downtime-data.js` lines 333–340)

```javascript
// BEFORE
{
  key: 'equipment',
  title: 'Equipment: Items and Gear',
  gate: null,
  intro: 'List any items, weapons, or equipment...',
  questions: [],
},

// AFTER
{
  key: 'equipment',
  title: 'Equipment: Items and Gear',
  gate: null,
  hidden: true,  // dt-form.30: hidden for this DT cycle; set false to re-enable
  intro: 'List any items, weapons, or equipment...',
  questions: [],
},
```

### Change 2 — `renderEquipmentSection` hidden bail-out (`downtime-form.js` line 4927–4928)

```javascript
// BEFORE
function renderEquipmentSection(saved) {
  const section = DOWNTIME_SECTIONS.find(s => s.key === 'equipment');
  if (!section) return '';

// AFTER
function renderEquipmentSection(saved) {
  const section = DOWNTIME_SECTIONS.find(s => s.key === 'equipment');
  if (!section || section.hidden) return '';  // dt-form.30: hidden for this cycle
```

### Change 3 — Equipment collect block guard (`downtime-form.js` lines 949–960)

Inside the `if (!_isMinimal)` block, wrap the equipment collection:

```javascript
// BEFORE
  // Collect equipment slots
  const equipCountEl = document.getElementById('dt-equipment-slot-count');
  const equipSlotCount = equipCountEl ? parseInt(equipCountEl.value, 10) || 1 : 1;
  responses['equipment_slot_count'] = String(equipSlotCount);
  for (let n = 1; n <= equipSlotCount; n++) {
    const nameEl = document.getElementById(`dt-equipment_${n}_name`);
    const qtyEl = document.getElementById(`dt-equipment_${n}_qty`);
    const notesEl = document.getElementById(`dt-equipment_${n}_notes`);
    responses[`equipment_${n}_name`] = nameEl ? nameEl.value : '';
    responses[`equipment_${n}_qty`] = qtyEl ? qtyEl.value : '';
    responses[`equipment_${n}_notes`] = notesEl ? notesEl.value : '';
  }

// AFTER
  // Collect equipment slots (skipped when hidden — prior values preserved via _prior spread)
  if (!DOWNTIME_SECTIONS.find(s => s.key === 'equipment')?.hidden) {
    const equipCountEl = document.getElementById('dt-equipment-slot-count');
    const equipSlotCount = equipCountEl ? parseInt(equipCountEl.value, 10) || 1 : 1;
    responses['equipment_slot_count'] = String(equipSlotCount);
    for (let n = 1; n <= equipSlotCount; n++) {
      const nameEl = document.getElementById(`dt-equipment_${n}_name`);
      const qtyEl = document.getElementById(`dt-equipment_${n}_qty`);
      const notesEl = document.getElementById(`dt-equipment_${n}_notes`);
      responses[`equipment_${n}_name`] = nameEl ? nameEl.value : '';
      responses[`equipment_${n}_qty`] = qtyEl ? qtyEl.value : '';
      responses[`equipment_${n}_notes`] = notesEl ? notesEl.value : '';
    }
  }
```

### What NOT to change

- The `if (section.key === 'equipment') continue;` skip at line 2152 in the main loop — already correct, leave it
- The `renderEquipmentRow` function — unchanged, still used if section is ever re-enabled
- The server schema — equipment fields are still valid; the form just stops writing them when hidden

## Test Plan

- Static review: `hidden: true` in downtime-data.js; `section.hidden` bail in `renderEquipmentSection`; collect block wrapped in hidden check
- Browser smoke:
  1. Open form as any character (MINIMAL and ADVANCED). Confirm no Equipment heading or fields appear.
  2. Load a submission that has `equipment_1_name` populated. Save it. Confirm the field persists in the response (via network tab or re-load).

## Definition of Done

- [x] `hidden: true` added to Equipment entry in `DOWNTIME_SECTIONS` (downtime-data.js)
- [x] `renderEquipmentSection` returns `''` when `section.hidden` is true
- [x] Equipment collect block in `collectResponses()` skipped when hidden
- [x] Equipment section absent in both MINIMAL and ADVANCED renders
- [x] Legacy equipment data preserved on save (prior spread + skip collect)
- [ ] PR opened into `dev`

## Dev Agent Record

**Agent:** Claude (Morningstar)
**Date:** 2026-05-07

### File List

**Modified**
- `public/js/tabs/downtime-data.js`
- `public/js/tabs/downtime-form.js`

**Added**
- `tests/dt-form-30-equipment-hide.spec.js`

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-07 | James (story) | Story enriched from Draft to ready-for-dev. 3 precise changes across 2 files. Key invariant: _prior spread preserves equipment data; collect block must be skipped (not just rendered-empty) in ADVANCED mode when hidden. |
| 2026-05-07 | Claude (Morningstar) | Implemented: hidden: true on Equipment DOWNTIME_SECTIONS entry; renderEquipmentSection bail; collect block guard. 3 Playwright tests added and passing. |
