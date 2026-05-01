---
id: dtui.34
epic: dtui
status: review
priority: medium
depends_on: [dtui.8, dtui.10, dtui.33]
---

# Story DTUI-34: Action block UI polish — labels, spacing, placeholder copy

As a player filling out the downtime form,
I want the action block to feel uncluttered — no redundant labels, proper spacing, and prompts inside input boxes where they belong,
So that the form reads clearly and the visual hierarchy is clean.

---

## Context

Five small polish items surfaced from visual review of the Wave 2 action block implementation. All are CSS or copy changes in `downtime-form.js` and `downtime-form.css`. No logic changes.

**Item 1 — "Direction" legend on Ambience ticker (line 4456)**
The Improve/Degrade fieldset has `<legend class="dt-ticker__legend">Direction</legend>`. This label adds noise — the two pill options ("Improve" / "Degrade") are self-explanatory. Remove the legend.

**Item 2 — "Target Type" legend on target ticker (line 4484)**
`renderTargetCharOrOther()` opens with `<legend class="dt-ticker__legend">Target Type</legend>` inside the ticker fieldset. The parent zone is already labelled "Target" (line 4449). The sub-label is redundant. Remove the legend.

**Item 3 — No gap between Target Type ticker and "Describe the target" input (line 4503)**
When "Other" is selected in the target ticker, the `qf-input` for freetext renders immediately after the closing `</fieldset>` of the ticker with no margin. Add top spacing so the two elements breathe.

**Item 4 — "A short name for this project." as helper text (lines 2933–2937)**
`renderQuestion()` is called with `desc: 'A short name for this project.'` for the Project Title field. This renders as a `<p class="qf-desc">` paragraph between the label and the input box. It should instead be the input's `placeholder`. Remove the `desc`; add `placeholder: 'A short name for this project.'` to the call; update `renderQuestion()` to pass `q.placeholder` through to the input element for `type: 'text'`.

**Item 5 — General helper-text-to-placeholder audit**
`renderQuestion()` renders `q.desc` as a `<p class="qf-desc">` for all question types, but several `desc` values are purely "what to type" prompts that belong as `placeholder` text inside the input. Audit all `renderQuestion()` calls and convert prompt-style descs to `placeholder`; keep genuine context/constraint descs as helper text.

**Distinction:**
- Placeholder copy: "A short name for this project.", "Describe the target", "State the goal of this project, aiming to achieve one clear thing.", "Describe your approach in narrative terms."
- Keep as helper text: "Provide a specific starting point, source, or known fact.", "Name your best guess — you may not know exactly what they have.", "You can't investigate someone out of thin air."

---

## Files in scope

- `public/js/tabs/downtime-form.js` — remove Direction legend (line 4456); remove Target Type legend (line 4484); update Project Title `renderQuestion()` call (lines 2933–2937); update `renderQuestion()` to support `q.placeholder`; audit and convert prompt descs to placeholder across all `renderQuestion()` call sites in the project slot render
- `public/css/downtime-form.css` — add top margin between `.dt-ticker` and immediately-following `.qf-input` in the target zone

---

## Out of scope

- Territory pill visual redesign (separate design decision — noted but not in this story)
- Any changes outside the project action block and project title field
- `renderSphereFields()` / `renderMeritToggles()` — not in scope for this polish pass

---

## Acceptance Criteria

### AC1 — No "Direction" label above Improve/Degrade ticker

**Given** a player selects Ambience Change,
**When** the target zone renders,
**Then** the Improve/Degrade ticker has no "Direction" label or legend above it; only the pill buttons are visible.

### AC2 — No "Target Type" label above Character/Other/Territory ticker

**Given** a player selects an action with a target ticker (Attack, Hide/Protect, Investigate, Misc),
**When** the target zone renders,
**Then** the ticker fieldset has no "Target Type" legend; the "Target" section label above remains.

### AC3 — Visible spacing between target ticker and "Describe the target" input

**Given** a player selects "Other" in the target type ticker,
**When** the freetext input appears,
**Then** there is a clear visible gap (≥ 8px) between the bottom of the ticker and the top of the input.

### AC4 — Project Title prompt is placeholder text inside the input

**Given** an action block renders the Project Title field,
**When** the field is empty,
**Then** the input box shows "A short name for this project." as grey placeholder text; no separate italic helper text line appears below the label.

**When** the field has a saved value,
**Then** the placeholder is hidden and the saved text fills the input (standard placeholder behaviour).

### AC5 — Prompt-style descs converted to placeholder across project slot fields

**Given** a player views a project action block,
**When** they scan the form fields,
**Then** any `qf-desc` paragraph that was purely a typing prompt is absent; those prompts appear as placeholder text inside the corresponding input or textarea.

---

## Implementation Notes

### Item 1 — Remove Direction legend

`renderTargetZone()` (~line 4453–4461). Change:
```javascript
h += `<fieldset class="dt-ticker" style="margin-top:8px">`;
h += '<legend class="dt-ticker__legend">Direction</legend>';
```
To:
```javascript
h += `<fieldset class="dt-ticker" data-ambience-dir-ticker="${n}" style="margin-top:8px">`;
```
(Drop the `<legend>` line entirely. The `aria-label` on the fieldset covers screen reader announcement — add `aria-label="Direction"` to the fieldset to preserve accessibility.)

### Item 2 — Remove Target Type legend

`renderTargetCharOrOther()` (line 4483–4484). Change:
```javascript
let h = `<fieldset class="dt-ticker">`;
h += '<legend class="dt-ticker__legend">Target Type</legend>';
```
To:
```javascript
let h = `<fieldset class="dt-ticker" aria-label="Target type">`;
```
(Drop legend; use `aria-label` so screen readers still announce the group purpose.)

### Item 3 — Spacing between ticker and Other input

Two options — prefer CSS over inline style:

**Option A — CSS class on the input container:**
In `renderTargetCharOrOther()` (line 4502–4504), wrap the Other input:
```javascript
} else if (effectiveType === 'other') {
  h += `<div class="dt-target-other-input">`;
  h += `<input type="text" id="dt-project_${n}_target_other" class="qf-input" value="${esc(savedOther)}" placeholder="Describe the target">`;
  h += `</div>`;
```

In `downtime-form.css`:
```css
.dt-target-other-input {
  margin-top: 8px;
}
```

**Option B — inline `style="margin-top:8px"` on the input** (simpler, acceptable for a one-off):
```javascript
h += `<input type="text" ... style="margin-top:8px" placeholder="Describe the target">`;
```

Prefer Option A (keeps CSS in CSS).

Note: the placeholder `"Describe the target"` is already present at line 4503 — no change needed there. The spacing is the only fix.

### Item 4 — Project Title: desc → placeholder

**renderQuestion() update** (line 5069–5071): add placeholder support for `type: 'text'` and `type: 'textarea'`:

```javascript
case 'text':
  h += `<input type="text" id="dt-${q.key}" class="qf-input" value="${esc(value)}"${q.placeholder ? ` placeholder="${esc(q.placeholder)}"` : ''}>`;
  break;

case 'textarea':
  h += `<textarea id="dt-${q.key}" class="qf-textarea" rows="${q.rows || 4}"${q.placeholder ? ` placeholder="${esc(q.placeholder)}"` : ''}>${esc(value)}</textarea>`;
  break;
```

**Project Title call site** (lines 2933–2937): change:
```javascript
h += renderQuestion({
  key: `project_${n}_title`, label: 'Project Title',
  type: 'text', required: false,
  desc: 'A short name for this project.',
}, saved[`project_${n}_title`] || '');
```
To:
```javascript
h += renderQuestion({
  key: `project_${n}_title`, label: 'Project Title',
  type: 'text', required: false,
  placeholder: 'A short name for this project.',
}, saved[`project_${n}_title`] || '');
```

### Item 5 — Prompt desc audit (project slot block only)

Search for `renderQuestion` calls in `renderProjectSlots()` and classify each `desc`:

| Field | Current desc | Action |
|-------|-------------|--------|
| Project Title | "A short name for this project." | → `placeholder` (Item 4) |
| Desired Outcome (Misc) | "State the goal of this project, aiming to achieve one clear thing." | → `placeholder` |
| Approach / description | Uses `ACTION_APPROACH_PROMPTS` as `placeholder` already (line 2990) | Already correct — no change |
| investigate_lead | "Provide a specific starting point, source, or known fact." | Keep as `desc` — it is a constraint, not a prompt |

For the Misc Desired Outcome field (line ~2961 — verify exact line), change:
```javascript
renderQuestion({
  key: `project_${n}_outcome`, label: 'Desired Outcome',
  type: 'text', required: false,
  desc: 'State the goal of this project, aiming to achieve one clear thing.',
}, ...)
```
To:
```javascript
renderQuestion({
  key: `project_${n}_outcome`, label: 'Desired Outcome',
  type: 'text', required: false,
  placeholder: 'State the goal of this project, aiming to achieve one clear thing.',
}, ...)
```

Verify line numbers at implementation time — use search rather than assuming exact offsets.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js`:
  - Remove Direction legend (~line 4456); add `aria-label="Direction"` to fieldset
  - Remove Target Type legend (~line 4484); add `aria-label="Target type"` to fieldset
  - Update `renderQuestion()` to support `q.placeholder` for text and textarea types (~line 5069–5074)
  - Update Project Title call site (~line 2933): `desc` → `placeholder`
  - Update Misc Desired Outcome call site: `desc` → `placeholder` (verify line)
- `public/css/downtime-form.css`:
  - Add `.dt-target-other-input { margin-top: 8px; }` (or equivalent spacing rule)

---

## Definition of Done

- AC1–AC5 verified in browser
- No "Direction" label visible above Improve/Degrade ticker
- No "Target Type" label visible above target type ticker
- Clear spacing between target ticker and "Describe the target" input
- Project Title field: placeholder inside input, no helper text line
- Misc Desired Outcome field: placeholder inside input, no helper text line
- Screen reader check: fieldsets announce their purpose via `aria-label`
- `specs/stories/sprint-status.yaml` updated: dtui-34 → review

---

## Compliance

- CC4 — Token discipline: spacing via CSS class, not bare hex colours
- CC5 — British English, no em-dashes: placeholder copy matches existing style
- CC6 — Accessibility: `aria-label` replaces removed `<legend>` elements; no loss of screen reader context
- CC9 — `renderQuestion()` extended minimally; no new components introduced

---

## Dependencies and Ordering

- **Depends on:** dtui-8 (`renderTargetZone()` / `renderTargetCharOrOther()` established), dtui-10 (Ambience direction ticker established), dtui-33 (target type ticker established)
- **Unblocks:** nothing — standalone polish story

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

All five ACs implemented. Misc Desired Outcome (line 4426) was already using `placeholder` — no change needed there. `investigate_lead` descs kept as helper text per spec (constraint copy, not prompt copy).

### File List

- `public/js/tabs/downtime-form.js`
- `public/css/components.css`

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-34 story drafted; ready-for-dev. |
| 2026-04-29 | DTUI-34 implemented; status → review. |
