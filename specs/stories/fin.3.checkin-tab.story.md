---
id: fin.3
epic: finance-coordinator
status: ready-for-dev
priority: high
depends_on: [fin.1, fin.2]
---

# Story FIN-3: Check-In Tab — Game App

As a coordinator (or ST) at the door,
I want a tablet-friendly check-in view in the game app,
So that I can mark attendance and record payment for each player as they arrive.

---

## Context

Lyn runs door check-in at the start of each game. She marks players as they arrive, records whether they paid and how (cash, PayID to her, via Exiles, waived). This replaces her current process of doing this in the Google Sheet.

The game app already has a Sign-In tab — this story repurposes or replaces it with the full check-in tool. It must work on an iPad, be fast to update, and auto-save without requiring an explicit save button.

---

## Acceptance Criteria

### Access

**Given** a coordinator or ST is authenticated in the game app
**When** the nav renders
**Then** the Check-In tab is visible
**And** players without coordinator or ST role do not see the tab

### Player list

**Given** the ST has opened a game session (game phase is active)
**When** the coordinator opens Check-In
**Then** all registered players are listed alphabetically by player name
**And** each row shows: player name, character name, attended toggle, payment method, amount, note (collapsed)

### Recording attendance + payment

**Given** a player arrives
**When** the coordinator taps their row
**Then** the attended toggle turns on
**And** the payment method selector becomes active (default: Paid to Lyn)

**Given** the coordinator selects "Did Not Attend"
**When** the row renders
**Then** it is visually greyed out and the payment fields are disabled

**Given** the coordinator selects a payment method and amount
**When** they move to the next player
**Then** the record is saved automatically (no save button needed)
**And** a brief visual confirmation (row flash or checkmark) confirms the save

### Running total

**Given** any player has been marked as attended with a payment recorded
**When** the footer renders
**Then** it shows: "N attended · $X collected" updating live as records change

### Auto-save

**Given** the coordinator changes any field
**When** the field loses focus or a toggle changes
**Then** a `PATCH /api/game_sessions/:id` request fires with just the changed attendance entry
**And** no full page reload occurs

---

## Implementation Notes

### New file: `public/js/game/checkin-tab.js`

```js
export async function renderCheckinTab(el, sessionId) {
  // Load current game session (includes attendance + payment fields)
  // Render alphabetical player list
  // Wire change events → PATCH /api/game_sessions/:id
}
```

Payment methods dropdown options:
```
— Not yet recorded —
Paid to Lyn (PayID)
Cash
Exiles (paid directly)
Waived
Did Not Attend
```

### Tablet layout

- Large touch targets (min 44px row height)
- Payment method as a `<select>` (native mobile selector — no custom dropdowns)
- Amount as a numeric input, pre-filled 15, cleared to 0 on Waived/Did Not Attend
- Note field: collapsed by default, revealed by a small expand button

### Wire in `public/js/app.js`

Add Check-In tab to the nav section gated by `role === 'st' || role === 'coordinator'`. Load `checkin-tab.js` lazily when the tab is first selected.

---

## Files Expected to Change

- `public/js/game/checkin-tab.js` (new)
- `public/js/app.js`
- `public/css/suite.css`

## Dev Agent Record
### Agent Model Used
### Completion Notes
### File List
