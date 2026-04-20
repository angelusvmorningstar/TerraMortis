---
id: dtfc.12
epic: downtime-form-calibration
group: A
status: ready-for-dev
priority: medium
---

# Story dtfc.12: Remove Feed from Project Action Dropdown

As a player filling out my downtime,
I want the Projects section to only show actions I can meaningfully choose,
So that I'm not confused by a Feed option that is already handled by the rote toggle.

---

## Context

The "Feed: Dedicate extra time to feeding" option currently appears in the project action dropdown. However:

- Feed as a project action only makes sense as a **rote commitment** — dedicating a project slot to improve the hunt.
- The rote toggle in the Feeding section already handles this automatically: when rote is enabled, the player picks a project slot, and that slot is locked to the `feed` action via a hidden input and a locked badge ("Committed to Feeding (Rote)").
- A player who selects `feed` manually from the dropdown gets empty fields (`ACTION_FIELDS['feed'] = []`) — no useful UI.
- Removing `feed` from the visible dropdown eliminates confusion without breaking the rote mechanism.

---

## Acceptance Criteria

### Feed removed from dropdown

**Given** the player opens the Projects section  
**When** they view the Action Type dropdown for any slot  
**Then** "Feed: Dedicate extra time to feeding" is not listed as an option

### Rote locking still works

**Given** the player enables the rote toggle in the Feeding section  
**When** they select a project slot  
**Then** that slot is still locked to the `feed` action (hidden input, locked badge) as before  
**And** the slot cannot be changed to another action while rote is committed  
**And** disabling rote unlocks the slot back to "No Action"

### No regression on existing submissions

**Given** an existing submission where `project_N_action === 'feed'` (from a prior rote selection)  
**When** the form loads that submission  
**Then** the slot still renders the rote-locked state correctly (badge + hidden input)  
**And** no error is thrown for the saved `feed` value

---

## Implementation Notes

### What to change

**`public/js/player/downtime-data.js`**

Remove the `feed` entry from `PROJECT_ACTIONS`:

```js
// Remove this line:
{ value: 'feed', label: 'Feed: Dedicate extra time to feeding' },
```

**`public/js/player/downtime-form.js`**

No change needed to the dropdown render — removing from `PROJECT_ACTIONS` is sufficient.

The rote locking path (`feedRoteAction && n === feedRoteSlot`, ~line 1978) writes `value="feed"` directly into a hidden `<input>` and skips the dropdown entirely. This is unaffected by the dropdown options list.

### What NOT to change

- `ACTION_FIELDS['feed']` — keep the entry (it is still needed when `isRoteLocked` renders the hidden feed input and the collect logic reads the action value)
- The rote toggle logic in the Feeding section
- `collectResponses` feed key handling

---

## Files Expected to Change

- `public/js/player/downtime-data.js` — remove `feed` from `PROJECT_ACTIONS`

## Dev Agent Record
### Agent Model Used
### Completion Notes
### File List
