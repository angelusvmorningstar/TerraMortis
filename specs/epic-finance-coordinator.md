# Epic FIN: Finance & Coordinator Access

## Goal

Make the TM Suite the single source of truth for game finances, replacing the spreadsheet. Introduce a `coordinator` role for Lyn (and future non-ST admins) with scoped access to attendance check-in and financial records — no access to ST storytelling tools.

## Why

Currently there is no official SSOT for finances. Game-by-game takings, venue costs, transfers, and running budgets are tracked in a Google Sheet maintained informally. The app already holds attendance data but not payment data. Lyn handles door check-in and collects fees — she needs a tablet-friendly tool for this, not admin.html.

## Context: Finance Model

Observed from the reference spreadsheet (Terra Mortis Character Master v3.0, Finances tab):

**Per game, per player:**
- Payment method: `paid_to_lyn` / `cash` / `exiles` / `waived` / `did_not_attend`
- Amount (standard $15; Waived = $0)
- Payer note (e.g. "paid via Symon" for edge cases)

**Per game summary:**
- Date, attendee count (derived from attendance records)
- Total collected (sum of all payments)
- Venue cost (variable per game — $150 Game 2, $180 Game 3)
- Transfer to Conan: amount, date, proof URL (Google Drive link)
- Balance carried forward

**Running totals (cumulative):**
- Terra Mortis budget available (cumulative surplus)
- Games funded (budget ÷ average venue cost)

**Payment methods observed:**
- `paid_to_lyn` — electronic payment (PayID) directly to Lyn
- `cash` — paid cash at door
- `exiles` — paid directly to Exiles club (bypasses Lyn; tracked separately)
- `waived` — fee waived (STs and staff)
- `did_not_attend` — no payment; absent

**Edge cases:**
- Payment received by a third party (e.g. Jamie paid Symon, not Lyn)
- Marni and Archer paid Exiles directly — counted in total but not in Lyn's hands
- Proof of transfer stored as a URL to Google Drive screenshot

## Coordinator Role

A `coordinator` is a non-ST trusted admin (initially: Lyn). They can:
- Record attendance and payment at the door (game app, tablet)
- View and update the finance summary for any game session

They cannot:
- Access any character data beyond player names
- Access downtime processing, DT story, city management
- Edit character records or game mechanics

Lyn's Discord ID is already in the system — her role just needs updating from `player` to `coordinator` in the players collection.

---

## Stories

### FIN-1: Coordinator Role

**As an** ST,
**I want** to assign a `coordinator` role to a player account,
**so that** Lyn and future non-ST admins can access financial and check-in tools without ST privileges.

**Key tasks:**
- Add `coordinator` to the allowed role values in the `players` collection schema
- Update Lyn's player record: `role: 'coordinator'`
- Add `coordinator` to the role middleware — `isCoordinator` check alongside `isST`
- Gate: game app routes that require `st || coordinator` (check-in, finance tabs)
- Gate: admin.html routes remain `st` only — coordinator cannot access admin.html
- Auth callback: coordinator role → redirect to game app (`index.html`), not admin

**Files:** `server/middleware/auth.js`, `server/routes/players.js`, `server/schemas/player.schema.js`, `public/js/app.js`

---

### FIN-2: Game Session Finance Schema

**As an** ST or coordinator,
**I want** payment and finance data stored against each game session,
**so that** the app becomes the single source of truth replacing the spreadsheet.

**Key tasks:**
- Add `finances` object to the `game_sessions` schema:
  ```js
  finances: {
    venue_cost: Number,
    transfer_to_conan: { amount: Number, date: String, proof_url: String },
    notes: String,
  }
  ```
- Add `payment` object to each attendance entry within `game_sessions`:
  ```js
  payment: {
    method: 'paid_to_lyn' | 'cash' | 'exiles' | 'waived' | 'did_not_attend',
    amount: Number,
    note: String,   // for edge cases (e.g. "paid via Symon")
  }
  ```
- No migration needed for historical data — fields are additive and optional
- Expose `finances` in the `GET /api/game_sessions` response (ST + coordinator auth)

**Files:** `server/schemas/game_session.schema.js`, `server/routes/game_sessions.js`

---

### FIN-3: Check-In Tab — Game App

**As a** coordinator (or ST) at the door,
**I want** a tablet-friendly check-in view in the game app,
**so that** I can mark attendance and record payment for each player as they arrive.

**Key tasks:**
- Add a Check-In tab to the game app (repurpose or replace the existing Sign-In tab)
- Visible to `st || coordinator` roles only; hidden otherwise
- Renders the player list for the **current active game session**
- Per player row:
  - Player name + character name
  - Attended toggle (checkbox)
  - Payment method selector: Did Not Attend / Paid to Lyn / Cash / Exiles / Waived
  - Amount field (pre-filled $15; editable)
  - Optional note field (collapsed by default)
- Row is greyed out when "Did Not Attend" is selected
- Running total shown at the bottom: N attended, $X collected
- Saves via `PATCH /api/game_sessions/:id` on each change (no explicit save button)
- Works without a page reload as players arrive

**Files:** `public/js/game/checkin-tab.js` (new), `public/js/app.js`, `public/css/suite.css`

---

### FIN-4: Finance Tab — Game App

**As a** coordinator (or ST),
**I want** a Finance tab in the game app showing per-game and running totals,
**so that** I have a single place to view and record the game's financial state.

**Key tasks:**
- Add Finance tab to game app; visible to `st || coordinator` only
- **Per-game view** (current session selected by a simple dropdown):
  - Attendee count (derived from attendance records)
  - Takings breakdown by method: Paid to Lyn / Cash / Exiles / Waived totals
  - Total collected
  - Venue cost (editable field, ST/coordinator only)
  - Transfer to Conan: amount, date, proof URL (link opens in new tab)
  - Balance for this game
- **Running totals panel:**
  - Cumulative budget available (sum of all balances across games)
  - Games funded (budget ÷ most recent venue cost, rounded down)
- All finance fields save via `PATCH /api/game_sessions/:id`
- Proof URL is a plain text field — coordinator pastes the Google Drive link

**Files:** `public/js/game/finance-tab.js` (new), `public/js/app.js`, `public/css/suite.css`

---

## Dependencies

```
FIN-1 → FIN-2 → FIN-3
                FIN-4
```

FIN-1 (coordinator role) must ship before FIN-3/4 (coordinator access to tabs).
FIN-2 (schema) must ship before FIN-3/4 (data storage).
FIN-3 and FIN-4 are independent of each other and can be built in parallel.

## Data Seed

Game 2 and Game 3 finance data is available from Lyn's records. Once FIN-2 is shipped, a one-time data entry session (not a migration script) is appropriate to populate historical records.

## Out of Scope

- Automated reconciliation or bank import
- PDF/CSV export of finance records (can be added later via the existing DP export pattern)
- Multi-currency or tax calculations
- Integration with Exiles club accounting (the `exiles` method is a tracking label only)
