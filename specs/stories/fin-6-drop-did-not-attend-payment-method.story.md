---
id: fin.6
epic: fin
status: ready-for-dev
priority: medium
depends_on: []
---

# Story FIN-6: Drop "Did Not Attend" from the payment-method dropdown

As a coordinator on the Check-In tab,
I should not see "Did Not Attend" listed as a payment method,
So that the dropdown reflects only how money was actually moved (or not) and the redundancy with the attendance checkbox is removed.

---

## Context

Today the Check-In tab's payment-method dropdown lists seven values, the last of which is **"Did Not Attend"**. That item duplicates the meaning of the attendance checkbox in the same row — the checkbox is the canonical signal that a player wasn't there. Having a payment method that means "wasn't here" forces the coordinator to keep two unrelated controls in sync, makes the dropdown longer than it needs to be, and pollutes finance reports that group by payment method.

The dropdown lives in `public/js/game/signin-tab.js:19-27` (`PAYMENT_METHODS`). The schema enum that backs it is in `server/schemas/game_session.schema.js:51-52` (`payment.method`).

This story removes the option from the dropdown and tightens the schema enum. It also removes the now-dead supporting code: the `did_not_attend` member of `ZERO_AMOUNT_METHODS` (line 29), the `isDNA` row class (line 153), and the `.si-dna` CSS class wherever it lives. A small one-off migration normalises any legacy attendance row whose stored `payment.method` is `'did_not_attend'`.

### Files in scope

- `public/js/game/signin-tab.js` — `PAYMENT_METHODS` array, `ZERO_AMOUNT_METHODS` set, `isDNA` row-class branch.
- `public/js/game/payment-helpers.js` — verify whether `readPayment` / `paymentLabel` reference `did_not_attend`; if so, remove or downgrade to a back-compat read.
- `public/js/game/finance-tab.js` — verify the finance-tab grouping/filtering for `did_not_attend`; if it filters or labels that bucket separately, fold it into the existing "no-payment / unrecorded" branch.
- `server/schemas/game_session.schema.js` — remove `'did_not_attend'` from the `payment.method` enum (line 52).
- `public/css/` — verify any `.si-dna` class reference; remove if present.
- `server/scripts/backfill-payment-method-dna.js` — new one-off script that resets `payment.method = ''` and `payment.amount = 0` for any historical attendance row that holds `'did_not_attend'`. Idempotent.

### Out of scope

- The "session rate model" refactor — separate story (FIN-7). This story keeps the existing per-row `payment.amount` shape intact.
- The Player A/B placeholder fix — separate story (FIN-5).
- Changing the visual treatment of unattended rows (the attendance checkbox is the single source; if we want a "ghost" style for `attended === false`, do it under the existing checkbox, not under the dropdown).
- Renaming or restructuring any other payment method (`exiles`, `waived`, etc. all stay).

---

## Acceptance Criteria

### Dropdown

**Given** I open a row's payment-method dropdown
**Then** the options are exactly: `— Not recorded`, `Cash`, `PayID`, `PayPal`, `Exiles (offset)`, `Waived`. Six items, no `Did Not Attend`.

### Schema

**Given** the `payment.method` enum in `server/schemas/game_session.schema.js`
**Then** the array reads `['cash', 'payid', 'paypal', 'exiles', 'waived', '']`. The string `'did_not_attend'` is no longer accepted.

### Legacy data

**Given** an attendance row in any historical `game_sessions` document with `payment.method === 'did_not_attend'` (or the legacy `payment_method` mirror)
**When** the backfill script runs
**Then** that row is updated to `payment.method = ''`, `payment.amount = 0`, `payment_method = ''`.
**And** the row's `attended` boolean is **not** modified (preserve whatever the source said about attendance).
**And** the script logs how many rows were updated, per session.
**And** running the script a second time updates zero rows.

**Given** a write through `PUT /api/game_sessions/:id` that submits `payment.method = 'did_not_attend'` post-migration
**Then** the schema validator rejects the write with the existing validation-error response shape (the API surfaces a 400, the client receives a structured error). No need for new error copy.

### Renderer cleanup

**Given** the row's `currentMethod` is computed
**Then** there is no `isDNA` branch in `signin-tab.js`.
**And** there is no `.si-dna` class on the rendered row regardless of payment method.

**Given** a payment-method change handler
**Then** the `ZERO_AMOUNT_METHODS` set contains exactly `['exiles', 'waived', '']` — the `did_not_attend` member is gone.

### Finance tab no-regression

**Given** the FIN-4 finance tab grouping/total
**Then** removing the option does not break any sum, grouping, or label.

---

## Implementation Notes

### signin-tab.js

```js
// before
const PAYMENT_METHODS = [
  { value: '',               label: '— Not recorded' },
  { value: 'cash',           label: 'Cash' },
  { value: 'payid',          label: 'PayID' },
  { value: 'paypal',         label: 'PayPal' },
  { value: 'exiles',         label: 'Exiles (offset)' },
  { value: 'waived',         label: 'Waived' },
  { value: 'did_not_attend', label: 'Did Not Attend' },
];
const ZERO_AMOUNT_METHODS = new Set(['exiles', 'waived', 'did_not_attend', '']);

// after
const PAYMENT_METHODS = [
  { value: '',       label: '— Not recorded' },
  { value: 'cash',   label: 'Cash' },
  { value: 'payid',  label: 'PayID' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'exiles', label: 'Exiles (offset)' },
  { value: 'waived', label: 'Waived' },
];
const ZERO_AMOUNT_METHODS = new Set(['exiles', 'waived', '']);
```

Then at line 153:
```js
// remove
const isDNA = currentMethod === 'did_not_attend';
// and the ${isDNA ? ' si-dna' : ''} insertion in the row className.
```

Search for any other `did_not_attend` reference in `signin-tab.js` and remove.

### payment-helpers.js + finance-tab.js audit

Open both files; grep for `did_not_attend`. If `readPayment` or any label-mapper references it, fold it into the empty-string / unrecorded branch (DNA semantics collapse to "no payment recorded"). If `finance-tab.js` filters or buckets separately, merge into the existing "no-payment" group.

### Schema

```js
// server/schemas/game_session.schema.js, line 52
// before
enum: ['cash', 'payid', 'paypal', 'exiles', 'waived', 'did_not_attend', ''],
// after
enum: ['cash', 'payid', 'paypal', 'exiles', 'waived', ''],
```

### Backfill script

```js
// server/scripts/backfill-payment-method-dna.js
import 'dotenv/config';
import { MongoClient } from 'mongodb';

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'tm_suite');
  try {
    const sessions = await db.collection('game_sessions').find({}).toArray();
    let totalRows = 0;
    for (const s of sessions) {
      let touched = 0;
      const next = (s.attendance || []).map(a => {
        const m  = a.payment?.method;
        const lm = a.payment_method;
        if (m !== 'did_not_attend' && lm !== 'did_not_attend') return a;
        touched++;
        return {
          ...a,
          payment: { ...(a.payment || {}), method: '', amount: 0 },
          payment_method: '',
        };
      });
      if (touched > 0) {
        await db.collection('game_sessions').updateOne({ _id: s._id }, { $set: { attendance: next } });
        totalRows += touched;
      }
      console.log(`${s.title || s.session_date}: touched=${touched}`);
    }
    console.log(`Total rows updated: ${totalRows}`);
  } finally { await client.close(); }
}
run().catch(e => { console.error(e); process.exit(1); });
```

User runs it themselves per memory `feedback_imports.md`. Do not invoke from the app.

### Tests

The schema change should be covered by an existing fin-coordinator or game-sessions test if one asserts the enum shape. Re-run `npx vitest run tests/api-fin-coordinator.test.js tests/api-game-sessions-delete.test.js` and confirm green; if any test seeded `did_not_attend`, update it to a real method or `''` and re-run.

---

## Files Expected to Change

- `public/js/game/signin-tab.js` — `PAYMENT_METHODS`, `ZERO_AMOUNT_METHODS`, `isDNA` removal.
- `public/js/game/payment-helpers.js` — fold any `did_not_attend` label/branch into unrecorded.
- `public/js/game/finance-tab.js` — same audit for grouping/labels.
- `server/schemas/game_session.schema.js` — enum tightened.
- `public/css/` — remove `.si-dna` class if present.
- `server/scripts/backfill-payment-method-dna.js` — new one-off script.
- (If any test seeded `did_not_attend`) the relevant test file.

No API route changes.

---

## Definition of Done

- All AC verified.
- Manual smoke as coordinator: dropdown shows six items in the order above; flipping a row's attendance off does not require a second action.
- Schema test suite green.
- Backfill script ran (user invokes); second run shows zero updates.
- Finance tab unchanged in behaviour.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `fin-6-drop-did-not-attend-payment-method: ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- Independent of FIN-5 (player-name resolution) and FIN-7 (session-rate model). Can ship in any order.
- Cheapest of the three; recommended to ship in parallel with FIN-5.
