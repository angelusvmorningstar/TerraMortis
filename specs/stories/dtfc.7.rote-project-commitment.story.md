---
id: dtfc.7
epic: downtime-form-calibration
group: B
status: ready-for-dev
priority: medium
depends_on: [dtfc.6]
---

# Story dtfc.7: Rote Feeding — Project Commitment UI

As a player who wants to use a Project action for rote feeding,
I want to explicitly commit one of my project slots to feeding rote and configure it inline,
So that the ST knows exactly which slot is dedicated and the commitment is clearly represented.

---

## Context

Rote quality on a feeding roll requires spending a Project action. The current implementation has a toggle that auto-wires Project 1 — but it's not clear to the player, and it doesn't let them choose which slot.

The new design:
- Player toggles "Spend a Project on feeding rote"
- Player picks which slot (1–4) to commit
- The slot configuration (method, pool summary, description) is done inline in the Feeding section
- The chosen slot in the Projects section is locked and shows "Committed to Feeding (Rote)" as read-only

---

## Acceptance Criteria

### Toggle

**Given** the Feeding section is visible  
**When** the player views the section  
**Then** a toggle/checkbox appears: "Commit a Project action for Rote quality on this hunt"

**Given** the player activates the rote toggle  
**When** they view the slot picker  
**Then** a selector appears: "Project slot to commit" with options 1, 2, 3, 4  
**And** slots already committed to other purposes are excluded from the selector

### Inline Rote Configuration

**Given** the player has activated rote and chosen a slot  
**When** they view the Feeding section  
**Then** a sub-panel appears with:
  - The feeding method (read from the main feeding method selection — same method)
  - Pool summary (same as the main pool breakdown)
  - A description textarea: "Describe your dedicated feeding effort this month"
  
**And** no separate pool configuration is needed — the rote uses the same pool as the primary feed

### Project Slot Locking

**Given** the player has committed slot 2 to feeding rote  
**When** they view the Projects section, tab 2  
**Then** the slot shows: "Committed to Feeding (Rote)" as a read-only status  
**And** the action type selector is disabled  
**And** the description shows the text entered in the rote sub-panel

**Given** the player deactivates the rote toggle  
**When** the Projects section updates  
**Then** the previously locked slot is unlocked and returns to normal configuration  
**And** any previously entered rote description is cleared from that slot

### Response Keys

**Given** rote is committed to slot 2  
**When** `collectResponses` runs  
**Then** `responses._feed_rote` = `'yes'`  
**And** `responses._feed_rote_slot` = `'2'`  
**And** `responses.project_2_action` = `'feed'`  
**And** `responses.project_2_description` contains the rote description text

---

## Implementation Notes

### New state variable

Add `let feedRoteSlot = 1;` alongside existing `let feedRoteAction = false;`.

Restore from saved: `feedRoteSlot = parseInt(responseDoc.responses['_feed_rote_slot'] || '1', 10)`.

### Toggle and slot picker HTML

Add after the feeding description textarea:

```html
<div class="dt-rote-toggle-wrap">
  <label class="qf-label">
    <input type="checkbox" id="dt-feed-rote-toggle" {checked}>
    Commit a Project action for Rote quality on this hunt
  </label>
  <!-- Show slot picker only when checked -->
  <div id="dt-rote-slot-picker" class="dt-rote-slot-picker {hidden if unchecked}">
    <label class="qf-label">Project slot to commit:</label>
    <select id="dt-rote-slot-sel" class="qf-select">
      <option value="1">Project 1</option>
      ...
    </select>
    <div class="dt-rote-description">
      <label class="qf-label">Describe your dedicated feeding effort:</label>
      <textarea id="dt-rote-description" class="qf-textarea" rows="3">{saved}</textarea>
    </div>
  </div>
</div>
```

### Project slot locked state in renderProjectSlots

```js
const isRoteLocked = feedRoteAction && n === feedRoteSlot;
if (isRoteLocked) {
  h += `<div class="dt-proj-rote-locked">
    <span class="dt-proj-rote-badge">Committed to Feeding (Rote)</span>
    <p class="dt-proj-rote-desc">${esc(saved[`project_${n}_description`] || '')}</p>
  </div>`;
  h += `<input type="hidden" id="dt-project_${n}_action" value="feed">`;
  continue; // skip normal field rendering for this pane
}
```

### collectResponses additions

```js
responses['_feed_rote_slot'] = feedRoteAction ? String(feedRoteSlot) : '';
const roteDescEl = document.getElementById('dt-rote-description');
if (feedRoteAction && roteDescEl) {
  responses[`project_${feedRoteSlot}_action`] = 'feed';
  responses[`project_${feedRoteSlot}_description`] = roteDescEl.value;
}
```

### Event wiring

Wire `change` on `#dt-feed-rote-toggle` to: update `feedRoteAction`, collect+save responses, re-render form.
Wire `change` on `#dt-rote-slot-sel` to: update `feedRoteSlot`, collect+save, re-render.

---

## Files Expected to Change

- `public/js/player/downtime-form.js` — rote toggle HTML, slot picker, project slot lock display, collectResponses, event wiring, state vars
- `public/css/components.css` — `.dt-rote-toggle-wrap`, `.dt-rote-slot-picker`, `.dt-proj-rote-locked`, `.dt-proj-rote-badge`

## Dev Agent Record
### Agent Model Used
_to be filled_
### Completion Notes
_to be filled_
### File List
_to be filled_
