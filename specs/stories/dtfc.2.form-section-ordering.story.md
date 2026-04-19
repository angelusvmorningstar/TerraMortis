---
id: dtfc.2
epic: downtime-form-calibration
group: A
status: ready-for-dev
priority: medium
---

# Story dtfc.2: Form Section Ordering

As a player filling out my downtime,
I want the sections to appear in an order that matches game logic,
So that later sections make sense given what I've already declared.

---

## Context

Three section ordering changes:

1. **Territory before Feeding** — a player needs to know where they're feeding before they decide how. Territory ambience informs their pool and vitae projection.
2. **Blood Sorcery before Feeding** — rites can affect feeding rolls (e.g. Willow Song, Sanctify the Flesh). Players should declare rites first.
3. **Regency action into Vamping** — the Regency action is a flavour/narrative declaration, not a mechanical project. It belongs at the end of the form alongside Vamping, as a conditional sub-field.

---

## Acceptance Criteria

### Territory before Feeding

**Given** the form renders  
**When** the player scrolls through sections  
**Then** the Territory section appears above the Feeding section in the DOM  
**And** both sections still render correctly with all their fields

### Blood Sorcery before Feeding

**Given** a character with Cruac or Theban disciplines  
**When** the form renders  
**Then** the Blood Sorcery section appears above the Feeding section  
**And** the Feeding section still renders correctly below it

### Regency action folded into Vamping

**Given** a regent character  
**When** the form renders  
**Then** no standalone "Regency Action" section exists  
**And** the Vamping section contains a conditional sub-field: "As Regent of [territory], what do you want to make known about your domain this month?"  
**And** this sub-field is only visible when `gateValues.is_regent === 'yes'`  
**And** the response is collected under the existing `regency_action` key  

**Given** a non-regent character  
**When** the form renders  
**Then** the Vamping section contains no regency sub-field

### No Regressions

**Given** the player.html Downtime tab  
**When** it renders  
**Then** sections appear in the new order identically to the game app

---

## Implementation Notes

### Section order in renderForm

In `renderForm` (`downtime-form.js` ~line 926), the static section loop currently renders in `DOWNTIME_SECTIONS` order. The new render order should be:

1. Court (gated: attended)
2. Blood Sorcery (gated: has_sorcery) ← moved up
3. Territory
4. Feeding
5. Projects
6. Merit toggles (Spheres / Contacts / Retainers)
7. Acquisitions
8. Equipment ← to be removed in dtfc.11, leave for now
9. Vamping (with Regency sub-field if regent)
10. Admin

The cleanest approach: update `DOWNTIME_SECTIONS` order in `downtime-data.js` to match, OR render sections explicitly by key in `renderForm` rather than iterating the array order.

### Regency removal

Remove `regency` from `DOWNTIME_SECTIONS` as a standalone section.

In the `vamping` section render, after the main vamping textarea, add a conditional block:

```js
if (gateValues.is_regent === 'yes') {
  const terrName = findRegentTerritory(_territories, currentChar)?.territory || 'your territory';
  h += `<div class="qf-field dt-regency-sub">`;
  h += `<label class="qf-label">As Regent of ${esc(terrName)}: what do you want to make known about your domain this month?</label>`;
  h += `<textarea id="dt-regency_action" class="qf-textarea" rows="4">${esc(saved['regency_action'] || '')}</textarea>`;
  h += `</div>`;
}
```

`collectResponses` already reads `responses['regency_action']` from `document.getElementById('dt-regency_action')` — no change needed there.

---

## Files Expected to Change

- `public/js/player/downtime-data.js` — reorder `DOWNTIME_SECTIONS`; remove `regency` entry
- `public/js/player/downtime-form.js` — update `renderForm` section render order; add regency sub-field into vamping render

## Dev Agent Record
### Agent Model Used
_to be filled_
### Completion Notes
_to be filled_
### File List
_to be filled_
