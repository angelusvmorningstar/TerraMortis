---
id: dtfc.13
epic: downtime-form-calibration
group: A
status: done
priority: medium
---

# Story dtfc.13: Merit Section Headers — Clear Identity for Allies, Status, Retainers, Contacts

As a player filling out my downtime,
I want each merit-based section to have a clear, distinct heading,
So that I know immediately which section covers which type of merit.

---

## Context

The downtime form auto-detects four categories of social merits and renders them as separate sections. Currently the section titles are:

| Section | Current title |
|---------|--------------|
| Allies merits | "Spheres of Influence" |
| Status merits (Broad/Narrow/MCI) | "Status: Social Standing" |
| Contacts merits | "Contacts: Requests for Information" |
| Retainer merits | "Retainers" (section title inside `renderMeritToggles`) |

The request is to make these clearly labelled by their game-mechanics name. "Spheres of Influence" is an internal descriptor — players know these as **Allies**. The other three sections are already correctly named.

Additionally, Equipment is being moved to its own tab (deferred as dtfc.11) — this story does **not** implement that move.

---

## Acceptance Criteria

### Allies section heading

**Given** the player has at least one Allies merit  
**When** the Allies section renders  
**Then** the section header reads "Allies: Spheres of Influence" (not just "Spheres of Influence")  
**And** the intro text still explains the tabbed action model

### Status section heading

**Given** the player has at least one Status or MCI merit  
**When** the Status section renders  
**Then** the section header reads "Status: Social Standing" (unchanged — already correct)

### Contacts section heading

**Given** the player has at least one Contacts merit  
**When** the Contacts section renders  
**Then** the section header reads "Contacts: Requests for Information" (unchanged — already correct)

### Retainers section heading

**Given** the player has at least one Retainer merit  
**When** the Retainers section renders  
**Then** the section header reads "Retainers: Tasking and Deployment" (currently just "Retainers")

### No structural changes

**Then** tab behaviour, field rendering, and response key format are all unchanged  
**And** no other section titles are modified

---

## Implementation Notes

### What to change

**`public/js/player/downtime-form.js`** — inside `renderMeritToggles()`

1. Allies section header (~line 3229):
   ```js
   // Change:
   h += '<h4 class="qf-section-title">Spheres of Influence<span class="qf-section-tick">✔</span></h4>';
   // To:
   h += '<h4 class="qf-section-title">Allies: Spheres of Influence<span class="qf-section-tick">✔</span></h4>';
   ```

2. Retainers section header (find `data-section-key="retainers"` in `renderMeritToggles`):
   ```js
   // Change:
   h += '<h4 class="qf-section-title">Retainers<span class="qf-section-tick">✔</span></h4>';
   // To:
   h += '<h4 class="qf-section-title">Retainers: Tasking and Deployment<span class="qf-section-tick">✔</span></h4>';
   ```

Status and Contacts titles are already correct — do not touch them.

---

## Files Expected to Change

- `public/js/player/downtime-form.js` — two `h4` title strings in `renderMeritToggles()`

## Dev Agent Record
### Agent Model Used
### Completion Notes
### File List
