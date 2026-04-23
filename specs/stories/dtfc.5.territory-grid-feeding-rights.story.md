---
id: dtfc.5
epic: downtime-form-calibration
group: B
status: done
priority: high
---

# Story dtfc.5: Territory Grid — Feeding Rights Model

As a player filling out my downtime,
I want the territory grid to show only the feeding options I'm actually allowed,
So that I can't accidentally declare poaching in a territory where I have rights, or claim rights I don't have.

---

## Context

The current territory grid shows three options for every territory regardless of the character's actual permissions: Resident / Poacher / Not feeding here. This is incorrect — a character either has feeding rights in a territory (granted by the Regent) or they don't. The grid should reflect this binary.

Additionally, the label "Resident" is wrong. Territory residency is a separate concept from feeding rights. The correct term is "Feeding Rights".

Territory ambience should be shown on each row, with a note that it's indicative — actual feeding ambience is calculated post-DT processing, after all other territory actions resolve.

**⚠️ Breaking change:** The territory grid value `'resident'` changes to `'feeding_rights'`. `downtime-views.js` must be updated in the same commit — it reads `feedTerrs[k] === 'resident'` in multiple places.

---

## Acceptance Criteria

### Form

**Given** a character with feeding rights in The Harbour (i.e. their `_id` is in `territory.feeding_rights` array)  
**When** the territory grid renders  
**Then** The Harbour row shows: "Feeding Rights" radio | "Not feeding here" radio  
**And** "Poaching" is not an option for that row

**Given** a character without feeding rights in The Academy  
**When** the territory grid renders  
**Then** The Academy row shows: "Poaching" radio | "Not feeding here" radio  
**And** "Feeding Rights" is not an option for that row

**Given** any character  
**When** the territory grid renders  
**Then** each territory row shows the territory's current ambience rating (e.g. "Curated", "Settled")  
**And** a note at the top of the section reads: "Ambience shown is current. Actual feeding ambience is calculated after Downtime processing and may shift based on how many Kindred feed in each territory."

**Given** The Barrens (No Territory) row  
**When** the territory grid renders  
**Then** it shows only "Not feeding here" — no feeding rights or poaching options

**Given** the player has saved a previous response with `'feeding_rights'` value  
**When** the form reloads  
**Then** the correct radio button is pre-selected

### Response Key

**Given** the player selects "Feeding Rights" for a territory  
**When** `collectResponses()` runs  
**Then** `responses.feeding_territories` JSON contains `{ the_harbour: 'feeding_rights', ... }`  
**And** the value `'resident'` never appears in the JSON

### ST Processing Panel

**Given** a submission with `feeding_territories` values of `'feeding_rights'` or `'poaching'`  
**When** the ST feeding panel renders  
**Then** feeding rights territories are recognised as the primary feeding territory  
**And** poaching territories are recognised as secondary  
**And** the display labels read "Feeding Rights" and "Poaching" (not "Resident")

**Given** a legacy submission with `feeding_territories` values of `'resident'` or `'poacher'`  
**When** the ST panel renders  
**Then** it falls back gracefully — `'resident'` treated as `'feeding_rights'`, `'poacher'` treated as `'poaching'`

---

## Implementation Notes

### Feeding rights detection

In `renderQuestion` for `territory_grid` (~line 3485 in downtime-form.js), replace the static 3-option row with a conditional 2-option row:

```js
for (const terr of FEEDING_TERRITORIES) {
  if (terr.includes('Barrens')) {
    // Only "Not feeding here"
    ...
    continue;
  }
  const terrKey = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const terrData = TERRITORY_DATA.find(t => t.name === terr);
  const hasFeedingRights = (_territories || []).some(t =>
    t.name === terr && Array.isArray(t.feeding_rights) &&
    t.feeding_rights.some(id => String(id) === String(currentChar._id))
  );

  const option1Val = hasFeedingRights ? 'feeding_rights' : 'poaching';
  const option1Label = hasFeedingRights ? 'Feeding Rights' : 'Poaching';

  // Saved value: map legacy 'resident' → 'feeding_rights', 'poacher' → 'poaching'
  let savedVal = gridVals[terrKey] || 'none';
  if (savedVal === 'resident') savedVal = 'feeding_rights';
  if (savedVal === 'poacher') savedVal = 'poaching';

  const ambience = terrData ? terrData.ambience : '';
  ...
}
```

Add the indicative note above the grid.

### `collectResponses` — no change needed

Values written are whatever the radio button value is (`'feeding_rights'`, `'poaching'`, `'none'`). The old `'resident'` value is no longer written by the form.

### ST Panel update (downtime-views.js)

**Line ~1473:**
```js
// OLD:
const primaryTerr = Object.keys(feedTerrs).find(k => feedTerrs[k] === 'resident')
// NEW:
const primaryTerr = Object.keys(feedTerrs).find(k =>
  feedTerrs[k] === 'feeding_rights' || feedTerrs[k] === 'resident'  // legacy compat
)
```

**Line ~7925:**
```js
// OLD:
for (const status of ['resident', 'poacher']) {
// NEW:
for (const status of ['feeding_rights', 'poaching', 'resident', 'poacher']) {
  // (include legacy values for backwards compat)
```

Update any display labels that output `'resident'` or `'poacher'` to human-readable form to use the new terms.

---

## Files Expected to Change

- `public/js/player/downtime-form.js` — territory grid rendering (feeding rights detection, binary options, ambience display, indicative note)
- `public/js/admin/downtime-views.js` — update `'resident'` checks + legacy fallback; update display labels

## Dev Agent Record
### Agent Model Used
_to be filled_
### Completion Notes
_to be filled_
### File List
_to be filled_
