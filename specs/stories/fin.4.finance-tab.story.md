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
  - Takings breakdown by method: Cash / PayID / PayPal totals; Exiles + Waived as counts (no $)
  - **Total collected** (sum of cash + payid + paypal amounts)
  - **Expenses list** — each line item editable: category (free text), amount, optional date/proof URL/note; an "Add expense" button appends a new line
  - **Transfers list** — each transfer editable: to (whom), amount, optional date, proof URL; an "Add transfer" button appends a new line
  - Balance for this game: `total collected − sum(expenses) − sum(transfers)`
  - Notes (free-text textarea)

### Running totals panel

**Given** finance data exists for multiple sessions
**When** the running totals panel renders
**Then** it shows:
  - **Cumulative budget available** — sum of all per-game balances (collected − expenses − transfers)
  - **Typical venue cost** — most recent session expense with `category === 'venue'` (fallback: largest recent expense)
  - **Games funded** — `floor(cumulative budget ÷ typical venue cost)`
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

Per-method totals are derived from `session.attendance[n].payment`:
```js
function derivePayments(session) {
  const byMethod = { cash: 0, payid: 0, paypal: 0, exiles: 0 };
  const counts  = { cash: 0, payid: 0, paypal: 0, exiles: 0, waived: 0, did_not_attend: 0 };
  for (const entry of session.attendance || []) {
    const p = entry.payment;
    if (!p || !p.method) continue;
    counts[p.method] = (counts[p.method] || 0) + 1;
    if (byMethod[p.method] !== undefined) byMethod[p.method] += (p.amount || 0);
  }
  const collected = byMethod.cash + byMethod.payid + byMethod.paypal;  // exiles is offset, not real $
  return { byMethod, counts, collected };
}
```

### Balance

```js
function deriveBalance(session) {
  const { collected } = derivePayments(session);
  const fin = session.finances || {};
  const expenseTotal = (fin.expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
  const transferTotal = (fin.transfers || []).reduce((s, t) => s + (t.amount || 0), 0);
  return collected - expenseTotal - transferTotal;
}
```

### Running totals

```js
const cumulativeBudget = sessions.reduce((sum, s) => sum + deriveBalance(s), 0);

// Typical venue cost — prefer most recent 'venue' expense, fall back to largest recent expense
function typicalVenueCost(sessions) {
  for (const s of [...sessions].reverse()) {
    const venue = (s.finances?.expenses || []).find(e => e.category === 'venue');
    if (venue?.amount) return venue.amount;
  }
  return 0;
}
const gamesFunded = typicalVenueCost(sessions)
  ? Math.floor(cumulativeBudget / typicalVenueCost(sessions))
  : 0;
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
