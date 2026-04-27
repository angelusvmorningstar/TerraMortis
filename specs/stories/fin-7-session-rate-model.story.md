---
id: fin.7
epic: fin
status: ready-for-dev
priority: medium
depends_on: []
---

# Story FIN-7: Session-rate model — single rate per session, not per row

As a coordinator on the Check-In tab,
I should set the rate for the night once at the top of the panel, and have every paid row inherit it automatically,
So that I am not entering "$15" thirty times per game and the door fee is authored in exactly one place.

---

## Context

Today the Check-In tab carries a per-row `<input type="number" class="si-pay-amt">` (`public/js/game/signin-tab.js:167`) and a hard-coded `DEFAULT_AMOUNT = 15` (line 28) that seeds new rows. The amount lives at `attendance[i].payment.amount` per row. In practice the rate is the same for every player at every game, so the per-row input is busywork: thirty rows times one amount equals thirty edits.

The desired model is simpler. Each session carries a single `session_rate` (default `15`, settable per session). Any row whose `payment.method` is a paid method (`cash`, `payid`, `paypal`) has its effective amount equal to `session_rate`. Zero-amount methods (`exiles`, `waived`, `''`) stay at `0`. There is no per-row override, no `<input>` for amount, and the schema's `payment.amount` becomes a denormalised mirror of `session_rate` (still written, for finance-report consumers that read amount directly).

The rate input lives on the Check-In tab itself — a single field in the header, near the existing eminence/ascendancy block. The Next Session panel is *not* the right home: the rate is something the coordinator should set/confirm at door time, not the ST during prep.

### Files in scope

- `server/schemas/game_session.schema.js` — add `session_rate` (number, ≥0, optional).
- `public/js/game/signin-tab.js` — remove the per-row amount `<input>`; remove `DEFAULT_AMOUNT`; add a single rate-input control to the panel header; on payment-method change, write `payment.amount = session_rate` for paid methods, `0` for zero methods.
- `public/js/game/payment-helpers.js` — `readPayment(att)` already exists; consider whether to extend it with a `(att, session)` overload that returns `session.session_rate` when amount is missing. Probably yes; if no, document why.
- `public/js/game/finance-tab.js` — read `session.session_rate` for any per-row sum where the row's `payment.amount` is missing; otherwise read `payment.amount` (the denormalised mirror).
- `public/css/` — minor: input styling for the new rate field; no new tokens.
- `server/scripts/backfill-session-rate.js` — new one-off script. Sets `session_rate = 15` on every existing session that doesn't already have it. Idempotent.

### Out of scope

- Removing `payment.amount` from the schema — kept as a denormalised mirror. Removing it would require a coordinated audit of every reader (finance reports, exports, history views).
- Per-player discounts, free guests, or "pay what you want" semantics. The model is one rate, no overrides. If we ever need exceptions, the right shape is a per-row `payment.note` (already in schema) plus an explicit zero-amount method like `comp` — defer to a future story.
- Coordinator-tier permission tightening on the rate field. The Check-In tab is already coordinator-only via `requireRole('coordinator')` at the route level (FIN-1); the rate input inherits that gate.
- The Player A/B placeholder fix (FIN-5) and the `did_not_attend` cleanup (FIN-6).
- Any change to the `cash` / `payid` / `paypal` / `exiles` / `waived` / `''` enum values (FIN-6 territory).

---

## Acceptance Criteria

### Schema

**Given** the JSON schema in `server/schemas/game_session.schema.js`
**Then** it declares `session_rate: { type: 'number', minimum: 0 }`.
**And** `session_rate` is optional (not in `required`).
**And** existing sessions without `session_rate` validate fine.

### Header rate control

**Given** I am a coordinator on the Check-In tab
**When** the panel renders
**Then** there is a single labelled input near the panel header (e.g. `<label>Session rate ($) <input type="number"></label>`) reflecting the session's `session_rate` value, defaulting to `15` if the field is missing on the session document.

**Given** I edit the rate input and blur (or hit Enter)
**Then** the new value is autosaved to the session document via the existing `PUT /api/game_sessions/:id` patch route.
**And** every paid row's displayed amount updates immediately to the new rate.
**And** zero-amount rows stay at `0`.

**Given** the rate input is set to a non-numeric or negative value
**Then** the input is rejected client-side and the previous value is restored. (Schema enforces `minimum: 0` server-side as a backstop.)

### Per-row behaviour

**Given** a row's payment-method dropdown is set to a paid method (`cash`, `payid`, `paypal`)
**Then** the row no longer renders a per-row `<input>` for amount.
**And** the row's `payment.amount` is written to the document equal to the current `session.session_rate`.
**And** the row displays the rate value somewhere readable (a small label or a column showing `$15`); the value is read-only at the row level.

**Given** a row's payment-method dropdown is set to a zero method (`exiles`, `waived`, `''`)
**Then** the row's `payment.amount` is `0`.
**And** the row does not display a dollar value (or displays `$0` if visual symmetry is preferred — final wording at implementation).

**Given** I change a row's payment method from `''` to `cash`
**Then** the row's `payment.amount` is set to `session.session_rate` at write time.
**And** the change is autosaved with the existing `scheduleAutosave` debounce (no behaviour change to the autosave itself).

**Given** the session's `session_rate` changes mid-night (rate edited in the header)
**Then** every existing paid row's `payment.amount` is updated to the new rate on next autosave (or immediately if the rate change handler triggers a row sweep — implementer's choice; document which).

### Footer total

**Given** the existing footer "$X collected" total at line 180
**Then** it still reflects the sum of paid rows' amounts.
**And** since paid rows' amounts equal `session_rate`, the total equals `paid_row_count * session_rate`.

### Backfill

**Given** the backfill script runs against `game_sessions`
**Then** every document missing `session_rate` gets `session_rate: 15` written.
**And** existing per-row `payment.amount` values are **not** modified (preserve historical record).
**And** the script is idempotent.

### No regression

**Given** the eminence/ascendancy header, attendance checkbox, payment dropdown (post-FIN-6), player-name resolution (post-FIN-5), and Finance tab grouping
**Then** none of those break.

---

## Implementation Notes

### Schema

```js
// server/schemas/game_session.schema.js, inside `properties` block, near
// the existing top-level fields (game_number / chapter_number / etc.):
session_rate: { type: 'number', minimum: 0 },
```

Optional, no `required` change. `additionalProperties: true` already covers it but the explicit declaration is self-documenting.

### Header rate control

Add to the panel header, near `.si-eminence-block`:

```html
<div class="si-rate-block">
  <label class="si-rate-label">Session rate ($)
    <input type="number" id="si-session-rate" class="si-rate-input" min="0" step="1">
  </label>
</div>
```

In `initSignIn` after `_session` loads:

```js
const rateInput = document.getElementById('si-session-rate');
rateInput.value = _session.session_rate ?? 15;
rateInput.addEventListener('change', async () => {
  const v = parseFloat(rateInput.value);
  if (!Number.isFinite(v) || v < 0) {
    rateInput.value = _session.session_rate ?? 15;
    return;
  }
  _session.session_rate = v;
  // Recompute every paid row's amount to match
  for (const a of (_session.attendance || [])) {
    const m = a.payment?.method;
    if (m === 'cash' || m === 'payid' || m === 'paypal') {
      a.payment = { ...(a.payment || {}), method: m, amount: v };
    }
  }
  scheduleAutosave();
  render();
});
```

### Row write logic

Replace the existing `sel.addEventListener('change', ...)` body so that paid methods read the rate from `_session.session_rate`:

```js
const PAID = new Set(['cash', 'payid', 'paypal']);
sel.addEventListener('change', () => {
  const idx = parseInt(sel.dataset.idx);
  const entry = _session.attendance[idx];
  if (!entry) return;
  const method = sel.value;
  const amount = PAID.has(method) ? (_session.session_rate ?? 15) : 0;
  entry.payment = { ...(entry.payment || {}), method, amount };
  entry.payment_method = method;
  scheduleAutosave();
  render();
});
```

The `<input class="si-pay-amt">` and its handler are removed entirely. The display of the amount becomes a small read-only label inside the row, e.g. `<span class="si-pay-amt-display">$${amount}</span>`.

### Finance tab + payment-helpers

`readPayment(att)` currently returns `{method, amount}` from the row alone. After FIN-7, the amount is canonically `session.session_rate` for paid rows. Two options:

1. Keep `readPayment(att)` reading from the row's `payment.amount` — works because we write the denormalised mirror on every method change. Finance tab keeps its current shape. **Recommended.**
2. Extend signature to `readPayment(att, session)` and resolve via session at read time. Cleaner long-term, but every call site needs the session passed in — bigger refactor.

(1) keeps the change small. The trade-off: if a future story ever stops writing `payment.amount`, the finance tab breaks. Document the dependency in `payment-helpers.js`.

### Backfill script

```js
// server/scripts/backfill-session-rate.js
import 'dotenv/config';
import { MongoClient } from 'mongodb';

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'tm_suite');
  try {
    const result = await db.collection('game_sessions').updateMany(
      { session_rate: { $exists: false } },
      { $set: { session_rate: 15 } }
    );
    console.log(`Sessions updated: ${result.modifiedCount}`);
  } finally { await client.close(); }
}
run().catch(e => { console.error(e); process.exit(1); });
```

User runs it themselves per memory `feedback_imports.md`.

### Testing

Re-run `tests/api-fin-coordinator.test.js` and `tests/api-game-sessions-delete.test.js`. If any seeded an attendance row with a specific `payment.amount` other than `15`, the test still passes because the schema is permissive — but the new render path will overwrite that amount on any method change. Update affected tests if they assert on `payment.amount` after a method change.

---

## Files Expected to Change

- `server/schemas/game_session.schema.js` — declare `session_rate`.
- `public/js/game/signin-tab.js` — header rate input + handler; row amount input removed; method-change handler reads from `_session.session_rate`; remove `DEFAULT_AMOUNT`.
- `public/js/game/payment-helpers.js` — document the denormalised-amount dependency in a comment; no signature change.
- `public/js/game/finance-tab.js` — verify it still reads `payment.amount` correctly; no logic change expected.
- `public/css/` — minor input styling for `.si-rate-input` / `.si-rate-block`.
- `server/scripts/backfill-session-rate.js` — new one-off script.
- (If any test asserts on per-row `payment.amount` after a method change) the relevant test file.

No API route changes.

---

## Definition of Done

- All AC verified.
- Manual smoke as coordinator: open Check-In, see `$15` in the rate field; flip three rows to `cash`, `payid`, `paypal`; each writes `payment.amount = 15`; change rate to `$20`, paid rows update; the per-row amount input is gone.
- Backfill script ran (user invokes); idempotent.
- Schema test suite green; any updated tests pass.
- Finance tab total still correct.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `fin-7-session-rate-model: ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- Independent of FIN-5 (player-name resolution) and FIN-7 (session-rate model). Can ship in any order, but recommended **last** of the three because it touches the most surface (schema, header UI, row UI, helper, finance-tab read path) and benefits from FIN-5/FIN-6 having landed first so review focus is on this story alone.
