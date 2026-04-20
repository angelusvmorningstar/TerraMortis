---
id: fin.4
epic: finance-coordinator
status: ready-for-dev
priority: medium
depends_on: [fin.1, fin.2]
---

# Story FIN-4: Finance Tab — Game App

As a coordinator (or ST),
I want a Finance tab in the game app showing per-game and running totals,
So that I have a single place to view and record the game's financial state.

---

## Context

Replaces the Google Sheet "Finances" tab as the SSOT for game-by-game takings, venue costs, and transfers. The finance tab shows both the current session's breakdown and a running total across all games — the key figure being "how many future games does our budget cover?"

---

## Acceptance Criteria

### Access

**Given** a coordinator or ST is authenticated
**When** the Finance tab renders
**Then** all finance data is visible and editable

### Per-game view

**Given** the coordinator selects a game session from the dropdown
**When** the per-game panel renders
**Then** it shows:
  - Attendee count (derived from attendance records in that session)
  - Takings breakdown: Paid to Lyn total / Cash total / Exiles total / Waived count
  - **Total collected** (sum of all non-waived, non-did-not-attend amounts)
  - Venue cost (editable number field)
  - Transfer to Conan: amount (editable), date (editable), proof URL (editable — renders as a clickable link when set)
  - Balance for this game (total collected − venue cost)
  - Notes (free-text textarea)

### Running totals panel

**Given** finance data exists for multiple sessions
**When** the running totals panel renders
**Then** it shows:
  - **Cumulative budget available** — sum of all per-game balances
  - **Games funded** — floor(cumulative budget ÷ most recent venue cost)
  - These update automatically when any per-game figure changes

### Saving

**Given** the coordinator edits any finance field
**When** they move to the next field or blur
**Then** the change is saved via `PATCH /api/game_sessions/:id` (dot-notation)
**And** running totals recalculate immediately client-side

### Proof URL

**Given** a proof URL is entered (Google Drive link)
**When** the field renders in view mode
**Then** it displays as a clickable "View proof" link opening in a new tab
**And** in edit mode it's a plain text input

---

## Implementation Notes

### New file: `public/js/game/finance-tab.js`

```js
export async function renderFinanceTab(el, allSessions) {
  // Session selector dropdown
  // Per-game breakdown panel (reads from session.attendance for payment totals)
  // Finance fields (venue_cost, transfer_to_conan, notes) — editable
  // Running totals panel — derived client-side
}

function calcRunningTotals(sessions) {
  // Sum balances across all sessions with finance data
  // Return { cumulativeBudget, gamesFunded }
}
```

### Takings breakdown (client-side derived)

The totals per method are derived from `session.attendance[n].payment`:
```js
const breakdown = { paid_to_lyn: 0, cash: 0, exiles: 0, waived: 0 };
for (const entry of session.attendance) {
  const p = entry.payment;
  if (!p || p.method === 'did_not_attend') continue;
  breakdown[p.method] = (breakdown[p.method] || 0) + (p.amount || 0);
}
const total = breakdown.paid_to_lyn + breakdown.cash + breakdown.exiles;
```

### Balance

`balance = total_collected - venue_cost`

If venue_cost is not yet set, show balance as "— Venue cost not recorded".

### Running totals

```js
const cumulativeBudget = sessions.reduce((sum, s) => {
  const collected = deriveTotal(s);
  const cost = s.finances?.venue_cost || 0;
  return sum + (collected - cost);
}, 0);
const latestVenueCost = [...sessions].reverse().find(s => s.finances?.venue_cost)?.finances?.venue_cost || 0;
const gamesFunded = latestVenueCost ? Math.floor(cumulativeBudget / latestVenueCost) : 0;
```

---

## Files Expected to Change

- `public/js/game/finance-tab.js` (new)
- `public/js/app.js`
- `public/css/suite.css`

## Dev Agent Record
### Agent Model Used
### Completion Notes
### File List
