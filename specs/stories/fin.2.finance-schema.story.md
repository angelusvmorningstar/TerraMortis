---
id: fin.2
epic: finance-coordinator
status: review
priority: high
depends_on: [fin.1]
---

# Story FIN-2: Game Session Finance Schema

As an ST or coordinator,
I want payment and finance data stored against each game session,
So that the app becomes the single source of truth replacing the spreadsheet.

---

## Context

Currently `game_sessions` stores attendance (attended, costuming, downtime, extra XP) per player but has no payment or finance data. This story adds:

1. Per-player payment fields on attendance entries (method + amount + note)
2. A `finances` object on the session root with **line-item expenses** and **transfers** (not fixed fields)

**Reference for the model:** `data/Terra Mortis Character Master (v3.0).xlsx` Finances tab. The spreadsheet tracks:
- Per-player payments split by method (Cash, PayID, PayPal, Exiles offset)
- Per-game expense line items (venue, office supplies, bags, etc.) with `Expected vs Diff` reconciliation
- Cash-outs to Conan (the current venue-payer)

Line-item expenses reflect real usage — fixed `venue_cost` / `transfer_to_conan` fields would lock out future categories and miscellaneous expenses.

No data migration needed — all fields are additive and optional. Historical sessions without finance data simply show empty/zero values.

---

## Acceptance Criteria

**Per-player payment fields**

**Given** an attendance entry in `game_sessions`
**When** FIN-3 (check-in) records a payment
**Then** `attendance[n].payment.method` is one of: `cash`, `payid`, `paypal`, `exiles`, `waived`, `did_not_attend`, `''` (unset)
**And** `attendance[n].payment.amount` is a number (default 15; 0 for waived/did_not_attend/exiles)
**And** `attendance[n].payment.note` is an optional string for edge cases

**Session-level expenses (line items)**

**Given** an ST or coordinator records a game expense
**When** the record is saved
**Then** `finances.expenses` is an array where each entry has: `category` (free string, e.g. `venue`, `office`, `bags`), `amount` (number), and optional `date`, `proof_url`, `note`

**Session-level transfers**

**Given** the coordinator transfers a game's collected cash to the venue-payer (e.g. Conan)
**When** the record is saved
**Then** `finances.transfers` is an array where each entry has: `to` (string), `amount` (number), and optional `date`, `proof_url`

**Derived values (not stored)**

**Given** the finance tab renders a session
**When** FIN-4 displays totals
**Then** method totals (Cash / PayID / PayPal / Exiles), expected collection, and diff are computed at render time from `attendance[].payment` — NOT stored on the schema

**API exposure**

**Given** an authenticated ST or coordinator
**When** `GET /api/game_sessions` is called
**Then** `finances` and `attendance[n].payment` fields are included in the response
**And** unauthenticated or `player` role requests do not receive these fields

---

## Implementation Notes

### Schema changes

**`server/schemas/game_session.schema.js`** — add to each attendance entry:

```js
payment: {
  type: 'object',
  properties: {
    method: {
      type: 'string',
      enum: ['cash', 'payid', 'paypal', 'exiles', 'waived', 'did_not_attend', ''],
    },
    amount: { type: 'number', minimum: 0 },
    note:   { type: ['string', 'null'] },
  },
},
```

Add to the session root:

```js
finances: {
  type: 'object',
  properties: {
    expenses: {
      type: 'array',
      items: {
        type: 'object',
        required: ['category', 'amount'],
        properties: {
          category:  { type: 'string' },            // e.g. 'venue', 'office', 'bags'
          amount:    { type: 'number' },            // positive = expense, could allow negative for refunds
          date:      { type: ['string', 'null'] },  // ISO date
          proof_url: { type: ['string', 'null'] },  // Google Drive or receipt link
          note:      { type: ['string', 'null'] },
        },
      },
    },
    transfers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['to', 'amount'],
        properties: {
          to:        { type: 'string' },            // 'conan' or whoever handles venue payment
          amount:    { type: 'number' },
          date:      { type: ['string', 'null'] },
          proof_url: { type: ['string', 'null'] },
        },
      },
    },
    notes: { type: ['string', 'null'] },
  },
},
```

### Derived totals (FIN-4 concern, not stored)

At render time, FIN-4 will compute:
```js
function financeDerived(session) {
  const att = session.attendance || [];
  const fin = session.finances || {};
  const byMethod = { cash: 0, payid: 0, paypal: 0, exiles: 0 };
  let attendedCount = 0;
  for (const a of att) {
    if (a.attended && a.payment?.method && a.payment?.amount != null) {
      byMethod[a.payment.method] = (byMethod[a.payment.method] || 0) + a.payment.amount;
    }
    if (a.attended) attendedCount++;
  }
  const collectedTotal = Object.values(byMethod).reduce((s, v) => s + v, 0);
  const expectedTotal = attendedCount * 15;
  const expenseTotal = (fin.expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
  const transferTotal = (fin.transfers || []).reduce((s, t) => s + (t.amount || 0), 0);
  return { byMethod, collectedTotal, expectedTotal, diff: collectedTotal - expectedTotal, expenseTotal, transferTotal };
}
```

### API

**`server/routes/game_sessions.js`** — the existing `PATCH /api/game_sessions/:id` endpoint handles dot-notation field updates. No new endpoints required — FIN-3 and FIN-4 will use existing PATCH for all saves.

Confirm the `isCoordinator` middleware (from FIN-1) is applied to `GET` and `PATCH` routes alongside the existing `isST` check.

---

## Files Expected to Change

- `server/schemas/game_session.schema.js`
- `server/routes/game_sessions.js` (auth middleware only, no logic change)

## Dev Agent Record
### Agent Model Used
claude-opus-4-7

### Completion Notes

- `game_session.schema.js`: added `payment` object on attendance entries (method enum + amount + note). Legacy `paid`/`payment_method` fields retained for back-compat
- `game_session.schema.js`: added root `finances` object with `expenses[]` + `transfers[]` arrays and `notes`
- `server/index.js`: `/api/game_sessions` auth widened from `requireRole('st')` to `requireRole('coordinator')` — ST/dev still pass via coordinator-includes-ST logic from fin.1
- No data migration required — additive and optional

### File List

- `server/schemas/game_session.schema.js`
- `server/index.js`

### Change Log

- 2026-04-23: Implemented fin.2 — finance schema + game_sessions auth widening
