# Story fix.547: Admin attendance Paid field never set by check-in tab

## Status: review

## Issue
[#547](https://github.com/angelusvmorningstar/TerraMortis/issues/547) — Admin attendance: Paid column never set by check-in tab

## Branch
`ms/issue-547-attendance-paid-field-fix`

---

## Story

**As a** coordinator reviewing game finances in the admin Attendance tab,
**I want** the "Paid" column to reflect what was entered in the Check-In tab,
**so that** I don't have to re-enter payment status for every player after check-in.

---

## Background

The check-in tab (`signin-tab.js`) and admin Attendance tab (`attendance.js`) read/write the same `game_sessions.attendance[]` entries in MongoDB, but use different fields for "paid" status:

| Field | Written by | Read by | Current state |
|---|---|---|---|
| `entry.payment` `{ method, amount }` | check-in | check-in (`readPayment()`) | ✅ written correctly |
| `entry.payment_method` | check-in + admin | admin dropdown | ✅ written by both |
| `entry.paid` (boolean) | admin checkbox only | admin `totalPaid` count | ❌ never written by check-in |

The check-in tab determines paid status at **render time** using `PAID_METHODS.has(method)` — it correctly shows `$15` for Cash/PayID/PayPal and `$0` for Waived/Exiles. But it never persists that determination as `entry.paid = true`. The admin Attendance tab filters `att.filter(a => a.paid)` to count paid entries, so it always shows 0/N for sessions managed via check-in (except the 1 person who had `paid: true` set manually).

### `exiles` decision (confirmed in issue)
`exiles` is an offset/credit, not a payment. `paid: false` for exiles is correct. Do not change.

### Scope note — admin payment dropdown mismatch (out of scope for this story)
`attendance.js` uses title-case option labels (`'Cash'`, `'PayID (Symon)'`) while check-in writes lowercase fin.2 enum values (`'cash'`, `'payid'`). This causes the admin dropdown to show blank for check-in entries — a separate issue. Do NOT fix here.

---

## Acceptance Criteria

- [ ] `signin-tab.js` payment method change handler sets `entry.paid = PAID_METHODS.has(method)` on every payment method change (true for cash/payid/paypal, false for everything else)
- [ ] Admin Attendance "Paid: N/26" count matches the number of Cash/PayID/PayPal entries in check-in for the same session
- [ ] Waived entries leave `entry.paid = false`
- [ ] Exiles entries leave `entry.paid = false`
- [ ] Existing Game 4 records are backfilled: `paid = true` for all entries where `payment.method` is `cash`, `payid`, or `paypal`

---

## Scope

**In scope**: One-line fix in `signin-tab.js`; backfill script for Game 4.

**Out of scope**: Admin dropdown label/enum mismatch; retroactive payment for Games 1–3 (no payment data); any change to `attendance.js`.

---

## Dev Notes

### Change 1 — `public/js/game/signin-tab.js`

In `wireEvents()`, the payment select handler currently ends with:

```js
entry.payment = { ...(entry.payment || {}), method, amount };
entry.payment_method = method;
scheduleAutosave();
render();
```

Add `entry.paid` between `payment_method` and `scheduleAutosave()`:

```js
entry.payment = { ...(entry.payment || {}), method, amount };
entry.payment_method = method;
entry.paid = PAID_METHODS.has(method);   // ← add this line
scheduleAutosave();
render();
```

`PAID_METHODS` is already defined at the top of the file:
```js
const PAID_METHODS = new Set(['cash', 'payid', 'paypal']);
```

`waived` and `exiles` are not in `PAID_METHODS`, so they correctly produce `false`. The empty string `''` also correctly produces `false`.

**That is the complete frontend change.** Do not touch anything else in `signin-tab.js`.

### Change 2 — Backfill script

**`server/scripts/backfill-game4-paid.js`** — dry-run by default, `--apply` to execute.

```
Game 4 session _id: 69e998779061c095792fd40c
```

The script must:
1. Load the Game 4 session document
2. For each attendance entry:
   - If `entry.payment?.method` is `'cash'`, `'payid'`, or `'paypal'` → set `paid = true`
   - Otherwise → set `paid = false` (explicitly, to fix any legacy inconsistency)
3. Save the updated session via `updateOne` with `$set: { attendance: updatedAttendance }`
4. Print a summary: how many set to true, how many to false

Dry-run output format:
```
[DRY RUN] Game 4 (69e998779061c095792fd40c) — 26 entries
  Would set paid=true:  N entries (cash/payid/paypal)
  Would set paid=false: N entries (waived/exiles/unrecorded)
Run with --apply to execute.
```

Apply output format:
```
[APPLY] Game 4 (69e998779061c095792fd40c)
  paid=true:  N entries
  paid=false: N entries
Done.
```

Pattern: follow `server/scripts/cleanup-sessions-and-cycles.js` exactly (MongoClient, ObjectId, DRY_RUN flag, `process.env.MONGO_URI || process.env.MONGODB_URI`, `DB_NAME = 'tm_suite'`).

Run from `server/` directory:
```
node --env-file=../.env scripts/backfill-game4-paid.js
node --env-file=../.env scripts/backfill-game4-paid.js --apply
```

User runs `--apply` themselves — do not auto-execute.

### What NOT to change

- `public/js/admin/attendance.js` — no changes (out of scope)
- `public/js/game/payment-helpers.js` — no changes
- `PAID_METHODS` constant in `signin-tab.js` — no changes
- The `readPayment()` call sites — no changes
- Any server routes

---

## Dev Agent Record

### File List
- `public/js/game/signin-tab.js` — modified (one line added to payment select handler)
- `server/scripts/backfill-game4-paid.js` — new backfill script

### Change Log
- 2026-06-02: Added `entry.paid = PAID_METHODS.has(method)` to wireEvents() payment select handler in `signin-tab.js`. Added `backfill-game4-paid.js` to backfill Game 4 records. Dry-run confirms 22 paid=true, 4 paid=false across 26 entries.

### Completion Notes
Frontend fix is one line. The `PAID_METHODS` set (`cash`, `payid`, `paypal`) drives both the amount display (existing) and the new `paid` boolean (added). Waived and exiles correctly produce `paid: false`. Backfill script dry-run verified against live Game 4 data — user must run `--apply` themselves.
