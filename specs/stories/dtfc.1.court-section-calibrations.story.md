---
id: dtfc.1
epic: downtime-form-calibration
group: A
status: ready-for-dev
priority: high
---

# Story dtfc.1: Court Section Calibrations

As a player filling out my downtime,
I want the Court section to ask only questions that are useful for ST processing,
So that I'm not filling out redundant or unclear fields.

---

## Context

Three calibrations to the Court section based on design review:

1. **Shoutout picks** — replace 3 dropdown selects with a checkbox grid showing all non-retired characters. Same response key and format.
2. **Remove trust/harm** — these two questions add friction without informing ST processing meaningfully.
3. **Contacts prompt** — tighten the label/description to steer players toward specific information requests rather than broad queries.

---

## Acceptance Criteria

### Shoutout Picks

**Given** the Court section is visible  
**When** the player views the shoutout field  
**Then** all non-retired characters are displayed as labelled checkboxes (not dropdowns)  
**And** the player can check up to 3 names  
**And** checking a 4th disables or prevents further selection  
**And** `responses.rp_shoutout` is a valid JSON array of character `_id` strings (same format as before)

### Trust and Harm Removal

**Given** the Court section is visible  
**When** the player views the section  
**Then** neither "Who does your character trust" nor "Who is your character trying to harm" questions are present  
**And** `DOWNTIME_SECTIONS` court questions array no longer includes `trust` or `harm`

**Given** an existing submission with `trust` and `harm` values  
**When** the ST processing panel renders that submission  
**Then** the panel does not error — it simply omits those fields (empty string is graceful)

### Contacts Prompt

**Given** the player opens the Contacts section  
**When** they view the contact request fields  
**Then** the label/description steers toward a specific ask: a named person, a specific event, a piece of information — not broad queries  
**And** no key or structural changes — label text only

---

## Implementation Notes

### Shoutout checkbox grid

Replace the `shoutout_picks` case in `renderQuestion` (downtime-form.js ~line 3158). Instead of 3 `<select>` elements:

```html
<div class="dt-shoutout-grid">
  <!-- one checkbox per non-retired character -->
  <label class="dt-shoutout-item">
    <input type="checkbox" class="dt-shoutout-cb" value="{char._id}"
      data-shoutout-check {checked if already selected}>
    {displayName(char)}
  </label>
</div>
```

Max-3 enforcement: wire a `change` event that disables unchecked boxes when 3 are selected. Uncheck to re-enable.

`collectResponses` for `shoutout_picks`: replace the `[data-shoutout-slot]` select query with:
```js
const picks = [];
document.querySelectorAll('.dt-shoutout-cb:checked').forEach(cb => picks.push(cb.value));
responses[q.key] = JSON.stringify(picks);
```

Characters list: use `allCharacters` (already populated from `/api/characters/names`). Filter out `currentChar._id`. Characters who attended the last game should be visually highlighted (class `dt-shoutout-att`) but all non-retired characters are visible.

### Trust and Harm removal

In `downtime-data.js`, remove the `trust` and `harm` question objects from the `court` section questions array.

In `downtime-views.js`:
- Line ~1014: remove `'trust'` and `'harm'` from `courtKeys` array
- Line ~2276: remove from `COURT_KEYS`
- Line ~2279: remove from `COURT_LABELS`

### Contacts prompt

In `downtime-form.js` or `downtime-data.js` — wherever the contacts section label/desc is defined — update to:

> **What specific information are you requesting?**  
> Name a person, event, or piece of information your contact would plausibly know. Vague requests ("anything useful about X") will be resolved at ST discretion.

---

## Files Expected to Change

- `public/js/player/downtime-form.js` — shoutout rendering + collectResponses
- `public/js/player/downtime-data.js` — remove trust/harm questions; contacts prompt text
- `public/js/admin/downtime-views.js` — remove trust/harm from COURT_KEYS/COURT_LABELS
- `public/css/components.css` — add `.dt-shoutout-grid`, `.dt-shoutout-item`, `.dt-shoutout-cb`, `.dt-shoutout-att` styles

## Dev Agent Record
### Agent Model Used
_to be filled_
### Completion Notes
_to be filled_
### File List
_to be filled_
