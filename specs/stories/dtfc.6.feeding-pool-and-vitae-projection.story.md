---
id: dtfc.6
epic: downtime-form-calibration
group: B
status: done
priority: high
depends_on: [dtfc.2]
---

# Story dtfc.6: Feeding — Pool Auto-load and Net Vitae Projection

As a player choosing how to feed,
I want the form to show me the mechanically correct pool for my chosen method and give me a projected vitae outcome,
So that I can make an informed decision without building pools from scratch or guessing at monthly vitae.

---

## Context

Two improvements to the Feeding section:

**1. Constrained pool auto-load:** The current form lets players combine any attribute + skill + discipline, producing mechanically incoherent pools that the ST then has to correct. Each feeding method has valid attr/skill options defined in `FEED_METHODS`. The form should auto-select the character's best valid options and constrain choices to those options.

**2. Net vitae projection:** "Starting Vitae before feeding" currently shows vitae max and is meaningless — feeding is a monthly approximation, not a snapshot from last game. Replace it with a projection showing the net vitae outcome based on territory ambience, pool size, and known monthly costs. This mirrors what the ST's feeding roll calculator shows.

---

## Acceptance Criteria

### Pool Auto-load

**Given** the player selects a feeding method (e.g. Seduction)  
**When** the method card is selected  
**Then** the best Attribute from that method's valid list is auto-selected (highest dots + bonus for the character)  
**And** the best Skill from that method's valid list is auto-selected  
**And** these are shown in labelled read-only display fields, not free dropdowns  
**And** the player sees the full pool breakdown: `N Attr + N Skill [+ N FeedingGrounds] [+ spec bonus if applicable]`

**Given** the selected method has disciplines the character has dots in  
**When** the discipline dropdown renders  
**Then** only those disciplines are shown  
**And** the default is "None" (player must actively choose a discipline)

**Given** the character has a relevant skill specialisation  
**When** the pool breakdown renders  
**Then** the spec chips are shown, and selecting one adds the spec bonus to the displayed total  
**And** 9-Again flag is noted if the character has that skill's 9-again

**Given** the player selects "Other" as the method  
**When** the form renders  
**Then** free-text Attr / Skill / Discipline selectors appear (same as current custom fields)

**Given** the method is selected but the character has no valid attrs/skills for it  
**When** the form renders  
**Then** the breakdown shows 0 for the missing component without erroring

### Net Vitae Projection

**Given** the player has selected a feeding territory in the Territory section  
**When** the Feeding section renders  
**Then** a "Vitae Projection" panel shows:
  - **Vitae Max** (from BP)
  - **Monthly costs**: ghoul retainer dots (sum), Cruac rite levels declared, Mandragora Garden cost
  - **Ambience modifier**: from the character's primary feeding territory (the one marked feeding_rights or poaching, taken as the highest ambience)
  - **Net Vitae after feeding**: Vitae Max − monthly costs + ambience mod (floored at 0, capped at Vitae Max)

**Given** the player has not yet selected a territory  
**When** the Feeding section renders  
**Then** the vitae projection shows a placeholder: "Select a feeding territory above to see your projection"

**Given** the character has no monthly costs and no territory  
**When** the Feeding section renders  
**Then** the projection shows Vitae Max only

**Note:** The projection is informational only. The ST's feeding roll result determines actual vitae gain. This is an approximation assuming an average roll outcome.

---

## Implementation Notes

### Pool auto-load

In `renderQuestion` feeding_method case, the pool breakdown already exists and correctly finds the best Attr and Skill. The change is:
- Replace the free-text `select` dropdowns for attr/skill with display-only text showing the auto-selected values
- Add a small "change" mechanism if needed (for now, auto-select is the only option — player can use Other method for full custom)
- Keep the discipline `<select>` as a user choice (defaulting to None)

The best attr/skill auto-selection logic already exists in lines ~3202-3211. This just changes the UI from dropdown to display.

### Vitae Projection panel

Add a new panel rendered at the bottom of the feeding section, after the description textarea. It requires:

1. **Monthly costs**: read from `currentChar`:
   - Ghoul retainers: sum of `(c.merits || []).filter(m => m.name === 'Retainer')` ratings — but only Retainers with `type === 'ghoul'` or similar flag. If no type distinction: sum all retainer dots.
   - Cruac/Theban costs: from `gateValues.has_sorcery` and declared rites in Blood Sorcery section. Can read from `responseDoc.responses` sorcery slots if already filled.
   - Mandragora Garden: `(c.merits || []).find(m => m.name === 'Mandragora Garden')?.rating || 0`

2. **Ambience modifier**: from the territory the player has selected as their primary feeding territory. Read the territory key from `responseDoc.responses.feeding_territories` (or live DOM if not saved). Find the matching territory in `TERRITORY_DATA` for its `ambienceMod` value.

3. **Net**: `Math.max(0, Math.min(vitaeMax, vitaeMax - monthlyCosts + ambienceMod))`

The panel updates live as the player changes territory selection (wire `change` event on feeding territory radio buttons to re-render the projection panel).

---

## Files Expected to Change

- `public/js/player/downtime-form.js` — feeding method pool display (read-only auto-select); vitae projection panel; live update on territory change
- `public/css/components.css` — vitae projection panel styles (`.dt-vitae-projection`, `.dt-vitae-row`, etc.)

## Dev Agent Record
### Agent Model Used
_to be filled_
### Completion Notes
_to be filled_
### File List
_to be filled_
