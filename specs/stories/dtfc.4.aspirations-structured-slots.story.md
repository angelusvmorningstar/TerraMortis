---
id: dtfc.4
epic: downtime-form-calibration
group: B
status: ready-for-dev
priority: high
---

# Story dtfc.4: Aspirations — Structured Slots

As a player filling out my downtime,
I want to declare each of my aspirations with a type and description in separate fields,
So that my STs can immediately see which are short, medium, or long term without parsing a block of text.

---

## Context

Aspirations are a mechanical element in VtR 2e — characters have Short, Medium, and Long term aspirations that earn Beats when resolved. The current form has a single textarea, meaning STs have to parse free-text blobs. This story replaces it with three structured slots.

**⚠️ Breaking change:** The `aspirations` response key format changes. `downtime-views.js` must be updated in the same commit. See ST Panel Update section below.

---

## Acceptance Criteria

### Form

**Given** the Court section is visible  
**When** the player views the Aspirations field  
**Then** three aspiration slots are shown, each with:
  - A dropdown: Short / Medium / Long
  - A short text input field (single line, not textarea)

**Given** the player fills in 2 of 3 slots  
**When** responses are collected  
**Then** `responses.aspiration_1_type`, `responses.aspiration_1_text`, `responses.aspiration_2_type`, `responses.aspiration_2_text` are populated  
**And** `responses.aspiration_3_type` and `responses.aspiration_3_text` are empty strings  
**And** the old `responses.aspirations` key is not written

**Given** the player loads a previously saved submission  
**When** the form renders  
**Then** saved aspiration values restore correctly into the typed slots

### ST Processing Panel

**Given** a submission with the new structured aspiration keys  
**When** the ST processing panel renders that submission's Court section  
**Then** aspirations display as three labelled lines: "Short: [text]", "Medium: [text]" etc.  
**And** empty slots are omitted

**Given** a legacy submission with the old `aspirations` text blob key  
**When** the ST processing panel renders it  
**Then** the panel falls back gracefully — displays the raw text under an "Aspirations" label  
**And** does not error or show `[object Object]`

---

## Implementation Notes

### Form change

In `downtime-data.js`, replace the `aspirations` question in the `court` section:

```js
// OLD:
{ key: 'aspirations', label: 'Aspirations', type: 'textarea', ... }

// NEW: three question objects
{ key: 'aspiration_1_type', type: 'hidden' }, // not rendered by question renderer
{ key: 'aspiration_1_text', type: 'hidden' },
// etc.
```

Actually, the cleaner approach: keep `aspirations` as the section question key for routing purposes, but use a new `type: 'aspiration_slots'` and handle it in `renderQuestion`:

```js
case 'aspiration_slots': {
  const slots = [1, 2, 3];
  h += '<div class="dt-aspiration-slots">';
  for (const n of slots) {
    const savedType = saved[`aspiration_${n}_type`] || '';
    const savedText = saved[`aspiration_${n}_text`] || '';
    h += `<div class="dt-aspiration-slot">`;
    h += `<select id="dt-aspiration_${n}_type" class="qf-select dt-aspiration-type">`;
    h += `<option value="">— Type —</option>`;
    for (const t of ['Short', 'Medium', 'Long']) {
      h += `<option value="${t}"${savedType === t ? ' selected' : ''}>${t}</option>`;
    }
    h += `</select>`;
    h += `<input type="text" id="dt-aspiration_${n}_text" class="qf-input dt-aspiration-text"
      value="${esc(savedText)}" placeholder="Aspiration ${n}">`;
    h += `</div>`;
  }
  h += '</div>';
  break;
}
```

In `collectResponses`, add after the static section loop:
```js
for (let n = 1; n <= 3; n++) {
  const typeEl = document.getElementById(`dt-aspiration_${n}_type`);
  const textEl = document.getElementById(`dt-aspiration_${n}_text`);
  responses[`aspiration_${n}_type`] = typeEl ? typeEl.value : '';
  responses[`aspiration_${n}_text`] = textEl ? textEl.value : '';
}
```

Remove `aspirations` from the static question collection loop (it uses the new `aspiration_slots` type which is handled above).

### ST Panel update (downtime-views.js)

Two locations render `aspirations` in the Court section:

**Location 1 (~line 1014-1021):**
```js
const courtKeys = ['travel', 'game_recount', 'rp_shoutout', 'correspondence', 'aspirations'];
```
Replace aspirations display logic:
```js
// After the courtKeys loop, add:
const aspLines = [1,2,3].map(n => {
  const t = r[`aspiration_${n}_type`]; const v = r[`aspiration_${n}_text`];
  return (t && v) ? `${t}: ${v}` : null;
}).filter(Boolean);
if (aspLines.length) {
  h += `<div class="dt-court-field"><span class="dt-court-lbl">Aspirations</span>
    <span class="dt-court-val">${aspLines.map(esc).join('<br>')}</span></div>`;
} else if (r['aspirations']) {
  // Legacy fallback
  h += `<div class="dt-court-field"><span class="dt-court-lbl">Aspirations</span>
    <span class="dt-court-val">${esc(r['aspirations'])}</span></div>`;
}
```

**Location 2 (~line 2276-2279):**
Same pattern — remove `aspirations` from `COURT_KEYS`, add structured + legacy fallback display.

---

## Files Expected to Change

- `public/js/player/downtime-form.js` — new `aspiration_slots` render case; collectResponses update
- `public/js/player/downtime-data.js` — change `aspirations` question type to `aspiration_slots`
- `public/js/admin/downtime-views.js` — structured display + legacy fallback for both court render locations
- `public/css/components.css` — `.dt-aspiration-slots`, `.dt-aspiration-slot`, `.dt-aspiration-type`, `.dt-aspiration-text`

## Dev Agent Record
### Agent Model Used
_to be filled_
### Completion Notes
_to be filled_
### File List
_to be filled_
