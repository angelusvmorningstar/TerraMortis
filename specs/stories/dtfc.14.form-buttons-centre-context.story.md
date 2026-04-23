---
id: dtfc.14
epic: downtime-form-calibration
group: A
status: done
priority: medium
---

# Story dtfc.14: Form Buttons — Centre Layout and Context-Aware Labels

As a player viewing my downtime form,
I want the Save and Submit buttons to be centred and labelled to match my current submission state,
So that I always know what action I'm taking.

---

## Context

The Save Draft / Submit Downtime buttons are currently left-aligned (inside `.qf-actions`) and always show the same labels regardless of submission state. Two problems:

1. **Layout** — buttons should be centred on the form.
2. **Labels** — the submit button text should reflect the current state:
   - No submission yet or status is `draft`: "Submit Downtime"
   - Submission already submitted (`status === 'submitted'`): "Update Submission"

The "View Results" state (when a published outcome is available) is already handled by `renderDowntimeResults()` which replaces the form entirely — no button change needed there.

---

## Acceptance Criteria

### Centred layout

**Given** the player is viewing the downtime form  
**When** the form renders  
**Then** the Save Draft and Submit buttons are horizontally centred within the form container  
**And** this applies in both `player.html` and `index.html` (game app) contexts

### Context-aware submit label — draft state

**Given** the player has no submission, or their submission has `status === 'draft'`  
**When** the form renders  
**Then** the submit button reads "Submit Downtime"

### Context-aware submit label — submitted state

**Given** the player already has a submission with `status === 'submitted'`  
**When** the form renders  
**Then** the submit button reads "Update Submission"  
**And** the save button still reads "Save Draft"

### No behaviour change

**Then** clicking Save Draft still calls `saveDraft()` regardless of label  
**And** clicking the submit button still calls `submitForm()` regardless of label  
**And** no new state tracking is introduced — the label derives from `responseDoc?.status`

---

## Implementation Notes

### CSS — centre the buttons

**`public/css/components.css`** — find `.qf-actions` rule and add `justify-content: center`:

```css
.qf-actions {
  display: flex;
  justify-content: center;   /* ADD THIS */
  gap: 0.75rem;
  margin-top: 1.5rem;
}
```

If `.qf-actions` is not already `display: flex`, add that too.

### JS — context-aware label

**`public/js/player/downtime-form.js`** — button render near end of `renderForm()` (~line 1120):

```js
const submitLabel = responseDoc?.status === 'submitted' ? 'Update Submission' : 'Submit Downtime';

h += '<div class="qf-actions">';
h += '<button class="qf-btn qf-btn-save" id="dt-btn-save">Save Draft</button>';
h += `<button class="qf-btn qf-btn-submit" id="dt-btn-submit">${esc(submitLabel)}</button>`;
h += '</div>';
```

`responseDoc` is the module-level variable holding the current submission document (set during `loadForm`). It is in scope at render time.

### Do not touch

- `saveDraft()` and `submitForm()` click handlers — wired by ID, unaffected by label change
- The cast picker confirm button (also uses `qf-btn-save` class but has its own ID `dt-cast-confirm`) — different element, unaffected

---

## Files Expected to Change

- `public/css/components.css` — `.qf-actions` flex centring
- `public/js/player/downtime-form.js` — button render block, context-aware submit label

## Dev Agent Record
### Agent Model Used
### Completion Notes
### File List
