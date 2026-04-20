---
id: fin.2
epic: finance-coordinator
status: ready-for-dev
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
1. Per-player payment fields to attendance entries
2. A `finances` object on the session for game-level totals and transfers

No data migration needed — all fields are additive and optional. Historical sessions without finance data simply show empty/zero values.

---

## Acceptance Criteria

**Per-player payment fields**

**Given** an attendance entry in `game_sessions`
**When** FIN-3 (check-in) records a payment
**Then** `attendance[n].payment.method` is one of: `paid_to_lyn`, `cash`, `exiles`, `waived`, `did_not_attend`
**And** `attendance[n].payment.amount` is a number (default 15, 0 for waived/did_not_attend)
**And** `attendance[n].payment.note` is an optional string for edge cases

**Game-level finance fields**

**Given** an ST or coordinator updates game finances
**When** the record is saved
**Then** `finances.venue_cost` stores the venue cost as a number
**And** `finances.transfer_to_conan.amount`, `.date`, `.proof_url` store transfer details
**And** `finances.notes` stores any free-text notes

**API exposure**

**Given** an authenticated ST or coordinator
**When** `GET /api/game_sessions` is called
**Then** `finances` and `attendance[n].payment` fields are included in the response
**And** unauthenticated or `player` role requests do not receive these fields

---

## Implementation Notes

### Schema changes

**`server/schemas/game_session.schema.js`** — add to the attendance entry object:

```js
payment: {
  type: 'object',
  properties: {
    method: {
      type: 'string',
      enum: ['paid_to_lyn', 'cash', 'exiles', 'waived', 'did_not_attend', ''],
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
    venue_cost: { type: 'number', minimum: 0 },
    transfer_to_conan: {
      type: 'object',
      properties: {
        amount:    { type: 'number' },
        date:      { type: ['string', 'null'] },
        proof_url: { type: ['string', 'null'] },
      },
    },
    notes: { type: ['string', 'null'] },
  },
},
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
### Completion Notes
### File List
