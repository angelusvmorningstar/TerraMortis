---
id: dtfp.6
epic: dtfp
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTFP-6: Sorcery target picker harmonisation with extracted shared helper

As a player declaring sorcery rite targets,
I should pick targets from a structured picker (Character / Territory / Other) — the same picker shape used elsewhere on the form for project targets — with the ability to add multiple targets per rite,
So that the ST receives clean structured data instead of free-text I have to disambiguate, and so the form's target-picking behaviour is consistent across project and sorcery sections.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 2 (Player Form Polish):

> **DTF2.6** — Sorcery target picker harmonisation. Extract shared `renderTargetPicker(prefix, opts)` helper from project target logic. Replaces free-text in sorcery section. New `sorcery_N_targets` array of `{type, value}` objects. Multi-target via "+ add target". Legacy `sorcery_N_targets` (string) retained as compat read.

Today's sorcery section (`public/js/tabs/downtime-form.js:2965-2968`) renders `Target/s` as a single free-text input via `renderQuestion`. The project target_flex render (line 2293-2319) implements the 3-way structured picker (Character / Territory / Other) inline. DTFP-6 extracts the structured picker as a shared helper and uses it in the sorcery section, with sorcery supporting multiple target rows per rite.

The new persisted shape for sorcery is an **array** of `{type, value}` objects:

```js
sorcery_N_targets: [
  { type: 'character', value: '<character_id>' },
  { type: 'territory', value: '<territory_id_or_name>' },
  { type: 'other',     value: '<freetext>' },
]
```

Legacy submissions store `sorcery_N_targets` as a single string. The new code reads both shapes:
- If `Array.isArray(saved.sorcery_N_targets)`: use directly.
- If string: treat as a single `{ type: 'other', value: '<the string>' }` entry for read; on next save, the array shape takes over.

The shared helper extraction also lets the project target_flex render use the same code path. Refactor target_flex to call the helper too — same UI, no behaviour change.

### Files in scope

- `public/js/tabs/downtime-form.js`:
  - New `renderTargetPicker(prefix, opts)` helper near the top of the render section (or in a small new module if it grows).
  - Project `target_flex` render (line 2293-2319) refactored to call the helper.
  - Sorcery section render (line 2965-2968) refactored to use the helper, looped per target with "+ add target".
  - Save logic (line 419-428 for project, line 453-454 for sorcery) — sorcery save now reads an array; project save unchanged in shape.
  - "Remove rite" / "Add target" handlers wired.
- `server/schemas/downtime_submission.schema.js` — `responses.sorcery_N_targets` field shape allows either string (legacy) or array of `{type, value}` (new). Likely accepted via `additionalProperties: true`; verify.

### Out of scope

- Changing the project target_flex stored shape. Stays as `{type_radio + value_field}` per slot. (If a future story wants project targets as arrays too, that's separate.)
- Changing what counts as a valid Character / Territory / Other for sorcery. The picker reuses whatever character / territory lists the project target_flex uses today.
- Validation of "this rite requires a target" — not enforced by DTFP-6; ST adjudicates whether the rite makes sense without a target.
- Player-facing display of sorcery targets in the published outcome — that's DT delivery / DT Story content; out of scope.
- Renaming the section, restructuring the sorcery slot UI, or changing rite selection.
- Auto-completion / search inside the picker. The character dropdown remains a plain `<select>`; territory remains a pill grid (matching project target_flex).

---

## Acceptance Criteria

### Shared helper

**Given** `renderTargetPicker(prefix, opts)` exists as a function
**Then** it accepts:
- `prefix` — a string used for ids and field names (e.g. `'project_2_target'`, `'sorcery_3_targets_0'`).
- `opts` — an object with at least `{ savedType, savedValue, allCharacters, includeOptions }`. `includeOptions` defaults to `['character', 'territory', 'other']` but can be subset (e.g. drop `other` for some surfaces).

**Given** the helper renders
**Then** the output structure mirrors the existing project target_flex:
- Three radio options (filtered by `includeOptions`).
- Conditional second-stage control:
  - Character: `<select>` populated from `allCharacters`.
  - Territory: pill grid via the existing `renderTerritoryPills` helper.
  - Other: free-text input.

### Project target_flex refactor

**Given** the existing project target_flex (line 2293-2319)
**Then** it is replaced by a call to `renderTargetPicker('project_${n}_target', { savedType: ..., savedValue: ..., allCharacters, includeOptions: ['character', 'territory', 'other'] })`.
**And** the rendered HTML is **identical** to the current output (same data attributes, same handlers respond unchanged).
**And** existing project target persistence behaviour is preserved.

### Sorcery target picker

**Given** I am a player on the DT form's Sorcery section, viewing rite slot N
**Then** below the rite's tradition/effect display, I see a target picker (or pickers, if I've added multiple).

**Given** my rite has zero targets defined
**Then** one empty picker row renders with no radio selected.

**Given** I select a type (Character / Territory / Other)
**Then** the second-stage control appears for that type.

**Given** I click "**+ add target**" below the picker rows
**Then** a new empty picker row appears below the existing rows.
**And** I can build multiple targets per rite.

**Given** a target picker row has a "Remove" affordance (a small × button)
**When** I click Remove on a row
**Then** that row disappears.
**And** the remaining rows reindex correctly (no gaps in the saved array).

**Given** I save the form
**Then** `responses.sorcery_N_targets` is saved as an **array** of `{type, value}` objects, one per non-empty row.
**And** rows where neither type nor value is set are omitted from the saved array (don't persist empty placeholders).

### Back-compat read

**Given** a legacy submission where `responses.sorcery_3_targets` is a string (e.g. `"Vincent and the Harbour"`)
**When** the form loads that submission
**Then** the picker renders **one row** of type `'other'` with the string as its value (the simplest interpretation; the player can refine if they want to split into multiple structured targets).
**And** if the player saves without changing the row, the new save **converts** the field to an array shape (`[{ type: 'other', value: 'Vincent and the Harbour' }]`).
**And** if the player adds structured targets via "+ add target", the array grows accordingly and the legacy string is no longer in the saved value.

**Given** a legacy submission with an empty / missing `sorcery_N_targets`
**Then** the picker renders one empty row (default state for a rite with no targets yet).

### Persistence and reads downstream

**Given** the saved array shape post-DTFP-6
**Then** any consumer of the field (DT Processing, DT Story, published outcome) renders it as a list of structured targets (a small reader helper may be needed to format `{type, value}` entries for display).

**Given** a consumer that has not been updated
**Then** if they read the field naively as a string, they get an array (which JS will stringify to `[object Object],[object Object]`). The story includes a brief audit of consumers; verify and update as needed.

### Multi-target rendering

**Given** I have three structured targets on rite N
**Then** the picker shows three rows stacked vertically, each with its own type radio + value field + Remove button.
**And** the "+ add target" button is always visible at the bottom.

### Schema

**Given** the schema validation runs
**Then** `responses.sorcery_N_targets` is accepted in either form (string or array of `{type, value}` objects).

---

## Implementation Notes

### Helper signature

```js
function renderTargetPicker(prefix, opts) {
  const { savedType = '', savedValue = '', allCharacters = [], includeOptions = ['character', 'territory', 'other'] } = opts;
  const labelMap = { character: 'Character', territory: 'Territory', other: 'Other' };

  let h = `<div class="dt-target-picker" data-target-prefix="${esc(prefix)}">`;
  h += `<div class="dt-target-flex-radios">`;
  for (const opt of includeOptions) {
    const chk = savedType === opt ? ' checked' : '';
    h += `<label class="dt-flex-radio-label"><input type="radio" name="dt-${esc(prefix)}_type" value="${esc(opt)}"${chk} data-flex-type="${esc(prefix)}"> ${esc(labelMap[opt])}</label>`;
  }
  h += `</div>`;

  if (savedType === 'character') {
    h += `<select id="dt-${esc(prefix)}_value" class="qf-select dt-flex-char-sel">`;
    h += '<option value="">— Select Character —</option>';
    for (const c of allCharacters) {
      const sel = String(c.id) === String(savedValue) ? ' selected' : '';
      h += `<option value="${esc(String(c.id))}"${sel}>${esc(c.name)}</option>`;
    }
    h += `</select>`;
  } else if (savedType === 'territory') {
    h += renderTerritoryPills(`dt-${prefix}_value`, savedValue);
  } else if (savedType === 'other') {
    h += `<input type="text" id="dt-${esc(prefix)}_value" class="qf-input" value="${esc(savedValue)}" placeholder="Describe the target">`;
  }

  h += `</div>`;
  return h;
}
```

The `data-flex-type` attribute is the existing radio-handler hook; preserve it so existing handlers continue to fire.

### Project refactor

Replace lines 2299-2317 with:

```js
h += renderTargetPicker(`project_${n}_target`, {
  savedType,
  savedValue,
  allCharacters,
  includeOptions: ['character', 'territory', 'other'],
});
```

Verify the surrounding label ("What are you investigating?" etc.) still renders externally.

### Sorcery refactor

Replace lines 2965-2968 with:

```js
const rawTargets = saved[`sorcery_${n}_targets`];
const targets = Array.isArray(rawTargets)
  ? rawTargets
  : (rawTargets ? [{ type: 'other', value: String(rawTargets) }] : [{ type: '', value: '' }]);

h += `<div class="dt-sorcery-targets-block" data-sorcery-slot-targets="${n}">`;
h += `<label class="qf-label">Target/s</label>`;
for (let ti = 0; ti < targets.length; ti++) {
  const t = targets[ti];
  h += `<div class="dt-sorcery-target-row" data-target-row-idx="${ti}">`;
  h += renderTargetPicker(`sorcery_${n}_targets_${ti}`, {
    savedType: t.type,
    savedValue: t.value,
    allCharacters,
    includeOptions: ['character', 'territory', 'other'],
  });
  h += `<button type="button" class="dt-sorcery-target-remove-btn" data-sorcery-slot="${n}" data-target-idx="${ti}">×</button>`;
  h += `</div>`;
}
h += `<button type="button" class="dt-sorcery-target-add-btn" data-sorcery-slot="${n}">+ Add target</button>`;
h += `</div>`;
```

### Save logic

In the save flow (around line 453-454), replace the single string write:

```js
// Old:
// responses[`sorcery_${n}_targets`] = targetsEl ? targetsEl.value : '';

// New: collect all rows for this slot
const block = document.querySelector(`[data-sorcery-slot-targets="${n}"]`);
if (block) {
  const rows = block.querySelectorAll('.dt-sorcery-target-row');
  const arr = [];
  rows.forEach((row, ti) => {
    const typeEl = row.querySelector(`input[name="dt-sorcery_${n}_targets_${ti}_type"]:checked`);
    const valEl  = row.querySelector(`#dt-sorcery_${n}_targets_${ti}_value`);
    const type = typeEl?.value || '';
    const value = valEl?.value || '';
    if (type && value) arr.push({ type, value });
  });
  responses[`sorcery_${n}_targets`] = arr;
}
```

Verify the radio name and field id patterns match what `renderTargetPicker` emits.

### Add-target / Remove-target handlers

Two new event-delegation entries in the form's main click listener:

```js
const addTargetBtn = e.target.closest('.dt-sorcery-target-add-btn');
if (addTargetBtn) {
  const n = addTargetBtn.dataset.sorcerySlot;
  // Push an empty target into responses[`sorcery_${n}_targets`] and re-render
  return;
}
const removeTargetBtn = e.target.closest('.dt-sorcery-target-remove-btn');
if (removeTargetBtn) {
  const n = removeTargetBtn.dataset.sorcerySlot;
  const idx = Number(removeTargetBtn.dataset.targetIdx);
  // Splice and re-render
  return;
}
```

### Schema

Open `server/schemas/downtime_submission.schema.js`. The simplest accommodation: the `responses` object already has `additionalProperties: true`, so no schema change is required to accept the new array shape. Verify by attempting a save with the new shape in development; if validation fails, add an explicit accommodation.

### Audit consumers

Grep for `sorcery_${n}_targets` and `sorcery_.*_targets` across `public/js/admin/` and `server/`. Update any consumer that assumes a string to the new array shape (with a fallback to string for legacy reads).

Likely consumers:
- DT Processing sorcery panel render in `downtime-views.js` (around `dts-1` story area).
- DT Story sorcery context generators.

### No tests required

Form + persistence + back-compat. Manual smoke tests:
- New rite, no targets: picker shows one empty row; saving with no row filled writes `[]`.
- Pick Character → save → refresh: row renders correctly.
- Add a second target row, fill Territory → save → refresh: both rows render.
- Remove the first row: second row reindexes; save → array contains one entry.
- Open a legacy DT2 sorcery submission with string targets: row renders as 'other' with the string.
- Save the legacy submission without changes: array shape now persisted.

### Strawman wording

- Section sub-label: **"Target/s"**
- Add button: **"+ Add target"**
- Remove button: **"×"** (Unicode multiplication sign, matches existing "remove" affordances on the form)
- Picker placeholder: same as project target_flex ("Describe the target")

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js`:
  - New `renderTargetPicker(prefix, opts)` helper.
  - Project `target_flex` refactored to call helper.
  - Sorcery section refactored to call helper per target row, with add/remove affordances.
  - Save logic for sorcery rewritten to collect array shape.
  - Event delegation extended for add-target / remove-target.
- `public/js/admin/downtime-views.js`, `public/js/admin/downtime-story.js` — audit and update consumers to read array OR string.
- `server/schemas/downtime_submission.schema.js` — verify or adjust for the new shape.

---

## Definition of Done

- All AC verified.
- Manual smoke tests for new rite (multi-target), legacy rite (string), project target_flex (refactored, no behaviour change).
- Consumers in DT Processing / DT Story render correctly for both shapes.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtfp-6-sorcery-target-picker: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- Independent of every other DTFP / DTSR / CHM / NPCP / DTIL / JDT story.
- The shared helper sets up future stories that need a structured target picker (e.g. JDT-2 lead invitation picker) to call the same helper.
