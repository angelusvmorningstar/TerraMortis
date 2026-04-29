---
id: dtui.33
epic: dtui
status: review
priority: medium
depends_on: [dtui.1, dtui.8]
---

# Story DTUI-33: Target type selector — `.dt-ticker` pill styling

As a player choosing how to scope my action's target,
I want the Character / Other / Territory type selector to look like the pill buttons used everywhere else,
So that the form uses one consistent gesture for "pick one of a few options."

---

## Context

The UX spec (FR: "Ticker grammar. Pill-style tickers replace radios and checkboxes everywhere a player picks from a small fixed set of options") requires all small-option selectors to use `.dt-ticker`. The project action block now has `.dt-ticker` for:

- Solo / Joint mode (dtui-5)
- Attack outcome Destroy / Degrade / Disrupt (dtui-9)
- Ambience direction Improve / Degrade (dtui-10)

The **target type selector** (Character / Other for Attack & Hide/Protect; Character / Territory / Other for Investigate & Misc) still uses the old `dt-flex-radio-label` / `dt-target-type-radios` pattern. This story replaces it with `.dt-ticker` to complete the vocabulary unification.

---

## Files in scope

- `public/js/tabs/downtime-form.js` — update `renderTargetCharOrOther()` only: replace `dt-target-type-radios` div + `dt-flex-radio-label` labels with `.dt-ticker` fieldset + `.dt-ticker__pill` labels

---

## Out of scope

- `renderTargetPicker()` (Sphere/Allies target picker at ~line 4299) — uses `dt-flex-radio-label` for a different widget; untouched here (dtui-16 handles Allies target scoping)
- CSS changes — `.dt-ticker` CSS already exists from dtui-1; `.dt-flex-radio-label` stays in CSS (still used by `renderTargetPicker`)
- JS event handler changes — the existing `data-flex-type` delegated change handler already fires the re-render; no handler changes needed

---

## Acceptance Criteria

### AC1 — Attack and Hide/Protect: two-pill ticker

**Given** a player selects "Attack" or "Hide/Protect",
**When** the Target zone renders,
**Then** the type selector shows a `.dt-ticker` fieldset with two pills: Character | Other. No bare radio buttons visible.

### AC2 — Investigate and Misc: three-pill ticker

**Given** a player selects "Investigate" or "Misc",
**When** the Target zone renders,
**Then** the type selector shows a `.dt-ticker` fieldset with three pills: Character | Territory | Other.

### AC3 — Selected pill matches saved state

**Given** a player previously selected "Territory" for an Investigate action and saved,
**When** the form reloads,
**Then** the Territory pill is shown in the active (selected) state.

### AC4 — Switching pills triggers sub-widget re-render

**Given** a player selects "Other" from the type ticker,
**When** the pill selection changes,
**Then** the sub-widget below updates (character chips → Other freetext) identically to the current radio behaviour. No regression in re-render logic.

### AC5 — Default selection preserved

**Given** a new (unsaved) Attack or Hide/Protect slot,
**When** the Target zone first renders,
**Then** the Character pill is pre-selected by default (same as current default).

---

## Implementation Notes

### Change is HTML-only in `renderTargetCharOrOther()`

`renderTargetCharOrOther` is at ~line 4480 in `public/js/tabs/downtime-form.js`. The only change is to the type-radio block at the top of the function.

**Current:**
```javascript
let h = '<div class="dt-target-type-radios">';
for (const opt of options) {
  const chk = effectiveType === opt ? ' checked' : '';
  h += `<label class="dt-flex-radio-label"><input type="radio" name="dt-project_${n}_target_type" value="${esc(opt)}"${chk} data-flex-type="project_${n}_target"> ${esc(labelMap[opt])}</label>`;
}
h += '</div>';
```

**Replace with:**
```javascript
h += `<fieldset class="dt-ticker">`;
h += '<legend class="dt-ticker__legend">Target Type</legend>';
for (const opt of options) {
  const chk = effectiveType === opt ? ' checked' : '';
  h += `<label class="dt-ticker__pill"><input type="radio" name="dt-project_${n}_target_type" value="${esc(opt)}"${chk} data-flex-type="project_${n}_target"> ${esc(labelMap[opt])}</label>`;
}
h += '</fieldset>';
```

**`data-flex-type` is mandatory** — the existing delegated `change` handler checks `e.target.closest('[data-flex-type]')` and calls `collectResponses()` + `renderForm()`. Removing or renaming this attribute will break sub-widget re-rendering silently.

### What NOT to change

- The sub-widget rendering below (`if (effectiveType === 'character')` etc.) — unchanged.
- The hidden inputs (`id="dt-project_${n}_target_value"` etc.) — unchanged; `collectResponses()` reads from these.
- `renderTargetPicker()` at ~line 4296 — this is the Sphere/Allies widget; it also uses `dt-flex-radio-label` but is a separate function and is out of scope.
- `dt-flex-radio-label` and `dt-target-type-radios` CSS rules — do not remove; `dt-flex-radio-label` is still used by `renderTargetPicker`.

### `.dt-ticker` HTML structure (established pattern)

Matching the Attack outcome ticker from dtui-9:
```html
<fieldset class="dt-ticker">
  <legend class="dt-ticker__legend">Target Type</legend>
  <label class="dt-ticker__pill"><input type="radio" name="..." value="character" checked data-flex-type="..."> Character</label>
  <label class="dt-ticker__pill"><input type="radio" name="..." value="other" data-flex-type="..."> Other</label>
</fieldset>
```

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — ~5 lines changed inside `renderTargetCharOrOther()`

---

## Definition of Done

- AC1–AC5 verified
- Attack, Hide/Protect, Investigate, Misc all show `.dt-ticker` pill type selector
- Sub-widget re-renders correctly on pill selection change
- Saved type selection pre-selects correct pill on reload
- No regression in Sphere/Allies target picker (`renderTargetPicker`)
- `specs/stories/sprint-status.yaml` updated: dtui-33 → review

---

## Compliance

- CC4 — Token discipline: `.dt-ticker`/`.dt-ticker__pill`/`.dt-ticker__legend` from dtui-1 CSS; no bare hex
- CC9 — Uses `.dt-ticker` canonical component (dtui-1)

---

## Dependencies and Ordering

- **Depends on:** dtui-1 (`.dt-ticker` CSS), dtui-8 (`renderTargetCharOrOther` function)
- Wave 2 addition — can be implemented any time after dtui-8 ships

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

- Replaced `<div class="dt-target-type-radios">` + `<label class="dt-flex-radio-label">` block in `renderTargetCharOrOther()` with `<fieldset class="dt-ticker">` + `<legend class="dt-ticker__legend">Target Type</legend>` + `<label class="dt-ticker__pill">`.
- `data-flex-type="project_${n}_target"` preserved on all radio inputs — existing delegated change handler continues to fire `collectResponses()` + `renderForm()` on selection change.
- `renderTargetPicker()` (~line 4299, Sphere/Allies section) is a separate function; it still uses `dt-flex-radio-label` and is untouched per out-of-scope note.
- No JS logic changes; no CSS additions; no event handler changes.

### File List

- `public/js/tabs/downtime-form.js`

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-33 story drafted; ready-for-dev. |
| 2026-04-29 | DTUI-33 implemented: target type selector upgraded to .dt-ticker pill styling. |
