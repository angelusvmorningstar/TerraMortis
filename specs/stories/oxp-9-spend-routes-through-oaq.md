# Story oxp.9: Office XP spend routes through the ST Approval Queue

Status: review

## Story

As the officeholder of a Court Position seat,
I want to request a purchase from my office's own XP pool (one merit dot, or the next manoeuvre rank)
and have it appear in the ST's existing Approval Queue for sign-off,
so that I can actually spend the pool my seat has been accruing since creation without an ST having to
click the steppers on my behalf, while every point spent still passes an ST's eye and can never exceed
what the seat has earned.

## Why this story exists

Two facts, both verified directly against the current code this session rather than taken from the
epic's one-line summary:

1. **There is no spend path for a holder at all today.** `PUT /api/office_merit_dots/:seatId` and
   `PUT /api/office_manoeuvre_rank/:seatId(/step)` are both `requireRole('st')`
   (`server/routes/office-merit-dots.js:49`, `server/routes/office-manoeuvre-rank.js:56,109`), and the
   only client callers are the `+`/`-` steppers `office-tab.js` renders behind its own `_isST()` gate
   (`public/js/tabs/office-tab.js:538-557, 674-681`). Both route files say so in their own
   minimal-scope comments: "direct ST-set purchase state, not Epic OXP's full accrual/spend economy…
   no approval-queue routing". `content/rules/office-powers.md` §"The model, in full" point 2 rules
   that **"the holder spends that XP on the office's own purchase list"** and point 3 that **"the
   holder decides the split"** — neither is possible in the app as it stands. This story is what makes
   the holder the spender, and Epic OAQ's queue is the mechanism that keeps ST oversight while doing
   it (`specs/epic-oaq-office-approval-queue.md:36-38`, Angelus: "ALL XP has to be approved").
2. **There is no budget check anywhere.** Neither PUT route reads the seat's balance before writing,
   so an ST can already set a seat over budget, and `officeSeatXp().left` is documented as allowed to
   go negative for exactly that reason (`public/js/data/office-xp.js:277-278`: "Both purchase
   collections are direct ST-set state with no budget check (oxp.9 would add one)"). oxp.6's
   affordability markers (`manoeuvreDotReasons` / `meritDotReasons`) are **advisory `title` text on
   hollow dots only** — they do not disable a stepper and never reach the server.

The infrastructure to extend already exists and has already been widened once. `contested_roll_requests`
carries `request_type`-discriminated pending records: `contested_roll` (the original shape),
`status_action` (oaq.2), and `humanity_check` (gdx.12). **gdx.12 is the precedent this story mirrors**
— it added a third discriminator with its own schema, its own route file and its own accept/decline
routes, reused `office-actions.js`'s single `GET /pending` by widening one `$in`, and added a sibling
row renderer to `public/js/suite/office-approvals.js`, whose own header comment names Epic OXP's XP-spend
approvals as the anticipated next type ("a second pending-item type (Epic OXP's XP-spend approvals) can
add its own label later without restructuring this module", `office-approvals.js:43-46`). Do not design
new pending-item infrastructure; follow gdx.12 line for line.

## The scope decision on the budget check — read this before anything else

`office-xp.js`'s comment leaves two separable features hiding under one story id: **(a)** routing the
spend action through ST approval, and **(b)** adding a budget check. **This story does both, with a
deliberate, stated boundary between them:**

- **(a) is delivered in full.** A holder-initiated purchase becomes a pending
  `request_type: 'office_purchase'` record. **The purchase write happens only on ST accept** — nothing
  is written to `office_merit_dots` / `office_manoeuvre_ranks` at submission time, and a decline writes
  nothing at all. This matches oaq.2's own explicit resolution of the same question ("budget spends on
  approval, never on submission").
- **(b) is delivered on the approval path only.** The new accept route computes the seat's balance
  server-side (`officeSeatXp`, reused as-is) against freshly-read purchase documents inside the same
  transaction, and refuses the purchase with `403 FORBIDDEN` if `left < 1`. Submission carries a
  courtesy pre-check of the same rule, re-checked authoritatively at accept — the exact
  submit-then-recheck shape `office-actions.js` already uses for a Status Action's precondition
  (`computeNewStatus`, called at both POST and accept, `office-actions.js:45-51`).
- **(b) is deliberately NOT retro-fitted to the existing ST-only PUT routes**, and `left` is
  deliberately still allowed to go negative. Three reasons, all concrete: the down-steppers are a
  *correction/undo* path, not spend, and have no approval to give; STs still need to seed and correct
  historical purchase state that predates this economy (a seat can legitimately already be over
  budget today); and `_balanceLineHtml`'s "N over budget" rendering (`office-tab.js:136-141`) only
  works because a negative `left` is representable. Hard-gating those routes would break all three
  and is not what "all XP spend requires ST approval" asks for — an ST setting state directly *is* an
  ST-approved action, with the approver and the actor being the same person. This is a recorded
  decision, not an oversight: if Angelus wants full ceremony on ST-initiated purchases too, that is a
  follow-up story, not a silent addition here.

Net effect: after this story there are two write paths — the holder's, which is queued and
budget-enforced, and the ST's direct set, which is unqueued and unenforced by design. Neither is
"unmoderated spend": the second one is the moderator's own hand.

## What this story is NOT

- **NOT a change to the existing ST steppers or to either PUT route's behaviour.**
  `PUT /api/office_merit_dots/:seatId`, `PUT /api/office_manoeuvre_rank/:seatId` and
  `PUT /api/office_manoeuvre_rank/:seatId/step` keep their current semantics, auth, validation and
  response shapes exactly. They are not deprecated, not gated, not given a budget check. The Office
  tab's `_isST()` stepper block is untouched.
- **NOT a change to Status Actions' or Humanity Checks' resolution logic.** `office-actions.js`'s
  `_findPending`/`_conflictBody`/accept/decline and `humanity-check.js`'s accept/decline are read for
  precedent and otherwise untouched. The **one** line this story changes in `office-actions.js` is its
  shared `GET /pending` filter (a read, adding a third `$in` member) — exactly the change gdx.12 made
  for its own type. Do not try to generalise or reuse `_findPending`/`_conflictBody`: they hardcode
  `request_type: 'status_action'`, and gdx.12's own Dev Notes explicitly rule that out.
- **NOT a change to `office-xp.js`'s derived-balance maths.** `officeMonthsAccrued`, `officeXpEarned`,
  `officeXpSpentForCategory`, `officeSpendKnownByCategory` and `officeSeatXp` are **imported and
  called**, never edited. `left` still goes negative; nothing is clamped. The only edit permitted in
  that file is the stale comment on lines 277-278 saying oxp.9 "would add" a budget check (AC9) — a
  documentation correction, not a behaviour change.
- **NOT a batch or multi-dot purchase.** One request buys exactly one dot: one merit dot, or the next
  manoeuvre rank. `office-powers.md` §"Manoeuvres are a graduated merit" rules manoeuvres are bought
  "one dot at a time… in fixed rank order", and one-dot-per-request is what makes the accept-time
  budget check a single, unambiguous `left >= 1` question. A holder wanting three dots submits three
  requests, sequentially (see AC3's one-pending-per-seat rule).
- **NOT a refund, reversal or "un-purchase" request type.** Declining a pending request writes nothing,
  because nothing was written on submission. Undoing an *already applied* purchase stays the ST's
  down-stepper, unqueued, as today.
- **NOT handover behaviour.** oxp.5 owns `PUT /api/office_seats/:seatId/holder`, the manoeuvre reset
  and `manoeuvre_xp_destroyed`. A pending purchase request against a seat that changes hands mid-queue
  is handled only by the accept route re-reading the seat live and re-checking the requester against
  the current `holder_id` (AC5) — no new handover logic, no cascade that voids pending requests.
- **NOT the Administrator's content (oxp.8).** `resolveOfficeSeat` already 400s for a seat whose
  office has no `OFFICE_DATA` entry, and Administrator still has none. That behaviour is inherited
  unchanged: an Administrator purchase request is refused at submission with the existing message.
- **NOT a seat picker, and NOT a change to seat resolution.** `_wirePurchaseState`'s existing
  seat-resolution logic and `resolveHeldSeat` are read, not rewritten. A holder may only request
  against a seat the **server** confirms they hold (`office_seats.holder_id`), which is stricter than
  the client's `outcome.confirmed` and is the authoritative check.
- **NOT a game-phase gate on submission.** Status Actions carry otc.2's `currentCycleInGamePhase` gate
  because they are live-table actions; office XP accrues per calendar month and a purchase is not a
  table action. Adding a phase gate here would be new scope nobody asked for.
- **NOT personal character XP.** `public/js/editor/xp.js`, `xp_ledger`, `attr_creation`/`skill_creation`
  and every other personal-XP surface are untouched. `office-powers.md` is explicit that the two pools
  never mix in either direction.
- **NOT a WebSocket push.** The Approval Queue's existing 10-second poll surfaces a new pending row;
  the Office tab refetches on its own render pass. No `broadcast*` frame is added.
- **NOT retiring `spendKnown`.** It stays exactly as documented in `office-xp.js` (still `false` for a
  multi-seat category, still consumer-less). Its retirement belongs to whichever story decides what to
  render in its place.
- **NOT a MongoDB collection-level validator on `contested_roll_requests`.** gdx.12 verified by grep
  that none exists and that a new `request_type` value therefore needs no migration; re-confirm rather
  than assume, but do not add one.

## Acceptance Criteria

1. **New request-body schema.** `server/schemas/office_purchase_request.schema.js` (new), mirroring
   `humanity_check_request.schema.js`'s shape — `type: 'object'`, `additionalProperties: false`, and
   **it must carry a `title`** (e.g. `'TM Office Purchase Request'`). The `title` is load-bearing, not
   decoration: `server/middleware/validate.js` caches compiled Ajv validators keyed by `schema.title`,
   and a title-less schema compiles under cache key `undefined` and silently collides with
   `office_action.schema.js` (which is still title-less). gdx.12 lost real debugging time to exactly
   this and logged it to `specs/deferred-work.md`; do not repeat it. Required properties:
   - `seat_id`: `{ type: 'string', pattern: '^[0-9a-fA-F]{24}$' }`
   - `purchase_kind`: `{ type: 'string', enum: ['merit', 'manoeuvre'] }`
   - `merit`: `{ type: ['string', 'null'] }`, optional — required in the route (not the schema) when
     `purchase_kind === 'merit'`, and rejected as `400` when supplied for a `manoeuvre` request.

2. **New route file** `server/routes/office-purchase.js`, mounted in **both** `server/index.js` and
   `server/tests/helpers/test-app.js` at `/api/office_purchase_requests` with
   `requireAuth, noCache()`, alongside the other `contested_roll_requests`-family mounts (follow the
   `humanity_check_requests` mount lines verbatim). It writes to the `contested_roll_requests`
   collection with `request_type: 'office_purchase'`, and to `office_merit_dots` /
   `office_manoeuvre_ranks` **only** from the accept route.

3. **`POST /api/office_purchase_requests`** — submit a purchase for review. Behaviour, in order:
   - `validate(officePurchaseRequestSchema)`.
   - `resolveOfficeSeat(seat_id)` (`server/lib/office-seat-resolve.js`, reused as-is) — its existing
     400/404/400 failure bodies pass straight through, which is what preserves the Administrator
     refusal named in "What this story is NOT".
   - **Authorisation:** allowed if `isStRole(req.user)` **or** `req.user.character_ids` (stringified)
     includes `String(seat.holder_id)`. Anything else is `403 FORBIDDEN`. Note this is a *seat-holder*
     check, not `characters.court_category` — `office_seats.holder_id` is the identity field
     (`server/schemas/office_seat.schema.js`), it is kept current by oxp.5's handover route, and a
     vacant seat (`holder_id: null`) therefore has no holder who can submit (ST only).
   - **Purchase validity:** for `merit`, the merit name must be in `officeEntry.merits` and the seat's
     current dots for it must be `< MERIT_DOT_CAPS[merit] || 5` (same cap source
     `office-merit-dots.js` already uses). For `manoeuvre`, the seat's current rank must be
     `< officeEntry.manoeuvres.length`. Otherwise `400 VALIDATION_ERROR` naming which limit was hit.
   - **Courtesy affordability pre-check:** compute the seat's balance with
     `officeSeatXp(seat, allSeats, meritDotsDoc, manoeuvreRankDoc, new Date())` and reject with
     `403 FORBIDDEN` ("Not enough office XP") if `left < 1`. This is explicitly *not* the authoritative
     check (AC5 is) — it exists so an obviously-unaffordable request never reaches the ST's queue,
     mirroring `office-actions.js`'s own submit-time precondition courtesy rejection.
   - **Dedupe:** `409 CONFLICT` if any `request_type: 'office_purchase'`, `status: 'pending'` record
     already exists **for the same `seat_id`** (regardless of kind or merit). One in-flight request per
     seat is what keeps the accept-time budget check from being defeated by queueing five requests
     against one point of XP. A plain `findOne` pre-check is sufficient — this is one holder tapping
     their own button, not a multi-actor budget race (same reasoning gdx.12's AC2 recorded, and the
     accept route's own re-check is the real guard either way).
   - **Inserted document:**
     ```js
     {
       request_type: 'office_purchase',
       status: 'pending',
       outcome: null,
       seat_id,                       // normalised lower-case 24-hex, from resolveOfficeSeat
       office_category: category,     // denormalised for display, never authoritative (same posture
       seat_label: seat.seat_label ?? null,   // as office_category on the purchase collections)
       purchase_kind,
       merit: purchase_kind === 'merit' ? merit : null,
       requested_by_character_id,     // the caller's matching character, or null for an ST submitting
       requested_by_character_name,   // moniker || name, same fallback office-actions.js uses
       created_at, updated_at,
     }
     ```
     Responds `201` with the created document.

4. **`GET /api/office_purchase_requests?seat_id=<24-hex>`** — the pending request(s) for one seat, so
   the Office tab can show "awaiting ST approval" after a reload instead of offering a button that
   would 409. `seat_id` is **required** and must be `typeof === 'string'` before use — a repeated query
   key (`?seat_id=a&seat_id=b`) arrives as an array under Express 5's default `'simple'` parser and is
   the genuinely reachable non-string vector here (bracket-notation injection is not; see
   `project-express5-query-parser` and gdx.12's own review finding). Returns `400` otherwise. Auth
   matches AC3's: ST, or a holder of that seat; anyone else gets `403`. Returns only
   `status: 'pending'` records for that seat, `created_at: 1`.

5. **`PUT /api/office_purchase_requests/:id/accept`** — ST-only (`requireRole('st')`), and the **only**
   place in this story where a purchase is written. Runs inside a single MongoDB transaction
   (`getClient().startSession()` + `withTransaction`), mirroring `office-actions.js`'s accept route —
   this route makes two writes (claim the pending record, apply the purchase) and a failure between
   them would otherwise leave an approved-but-unapplied purchase with no way to detect it. Order and
   content:
   - Resolve the pending record: `404` if no `office_purchase` record with that `_id`, `409` if its
     `status !== 'pending'` (write this route's own `_findPending` equivalent, literal to
     `request_type: 'office_purchase'` — do not import `office-actions.js`'s).
   - **Claim the pending record first**, before any other write:
     `updateOne({ _id, status: 'pending' }, { $set: { status: 'resolved', … } })`, and treat
     `matchedCount === 0` as `409`. This is the ordering `office-actions.js` adopted after a real
     concurrent-accept race reached its later writes on both sides; the loser must never reach the
     purchase write.
   - **Re-read live, inside the transaction:** the seat (`office_seats`), all seats, and both purchase
     documents for this seat. Re-run AC3's purchase-validity checks against *current* state (cap, rank
     ceiling) — a `409 CONFLICT` if the ST's own stepper moved the same value since submission.
   - **Re-check the requester still holds the seat** if `requested_by_character_id` is non-null:
     `403 FORBIDDEN` if `String(seat.holder_id) !== requested_by_character_id`. Same reasoning
     `office-actions.js` re-checks `actor.court_category` at accept: losing the seat between
     submission and approval is a real, narrow case that must not silently apply.
   - **Authoritative budget check:** `officeSeatXp(...).left >= 1`, else `403 FORBIDDEN` with a message
     naming the shortfall. This is (b) from the scope decision, and it is the only enforcement point.
   - **Apply the purchase.** For `merit`: `$set { ['dots.' + merit]: current + 1, office_category,
     updated_at }` on `office_merit_dots`, `upsert: true` — the same document shape, cap validation and
     denormalised `office_category` write `office-merit-dots.js` already performs. For `manoeuvre`:
     apply `+1` via the **same aggregation-pipeline clamped update**
     `office-manoeuvre-rank.js`'s `/step` route uses (`$min`/`$max`/`$ifNull` + `$literal` on the
     category), not a read-then-write of `rank + 1` — the pipeline form exists precisely because the
     read-then-write form silently lost overlapping steps.
   - **Record the outcome** on the pending record:
     `outcome: { purchase_kind, merit, from, to, xp_cost: 1, earned, spent_before, left_after }`, plus
     `resolved_by: req.user.username`. `from`/`to` are the dot count or rank before and after.
   - Responds `200` with the resolved request document.

6. **`PUT /api/office_purchase_requests/:id/decline`** — ST-only. Sets `status: 'declined'`,
   `declined_by: req.user.username`, `updated_at`; `409` on `matchedCount === 0`. **No write to either
   purchase collection, no XP consumed** — nothing was spent on submission, so a decline is a pure
   state change (identical posture to `office-actions.js`'s decline).

7. **The shared pending feed and the two deny-list guards are widened for the new type.**
   - `server/routes/office-actions.js`'s `GET /pending` filter becomes
     `request_type: { $in: ['status_action', 'humanity_check', 'office_purchase'] }`. Still
     `requireRole('st')`, still `sort({ created_at: 1 })`. **No second GET endpoint** — the Approval
     Queue client calls this one route only.
   - `server/routes/contested-rolls.js`'s two **deny-list** guards must gain `'office_purchase'`:
     `_findChallenge` (line ~480) and `PUT /:id/void` (line ~458), both currently
     `$nin: ['status_action', 'humanity_check']`. Without this an ST could void a pending office
     purchase into a status neither route family recognises, permanently orphaning it — the exact bug
     that guard was added for. **`GET /mine` (line ~83) needs no change**: crd.1 already converted it
     to a positive allow-list (`$in: [null, 'contested_roll']`) which excludes any new type
     automatically. Verify this rather than widening it by reflex.

8. **Approval Queue rendering** (`public/js/suite/office-approvals.js`). Add a sibling
   `_renderOfficePurchaseRow(r)` and branch on `request_type` in `_renderBody`'s `.map()` — **do not
   restructure `_renderRow`**, which must stay byte-identical for `status_action` rows (the same
   invariant gdx.12's AC8 established and tested). Reuse the existing poll, `_fetchGen` generation
   guard, `busyIds`, `errorById` and single delegated click listener unchanged; no new listener is
   needed (unlike gdx.12, this row type has no in-row input to persist across polls).
   - Row content: the seat (`office_category` plus `seat_label` where present), the requesting
     character's name through `redactCharName` (same redaction the existing rows use), a `.dtl-badge`
     reading the purchase (e.g. "Merit: Contacts" / "Manoeuvre rank 3"), and the timestamp — enough
     for the ST to judge without leaving the tab.
   - `_resolve()` gains a third endpoint branch: `office_purchase` →
     `/api/office_purchase_requests`. Keep the existing shape (a `row` missing from
     `state.rows` still short-circuits to `_refetchAndRender()` rather than guessing an endpoint —
     that guard was itself a review finding, do not regress it). Accept sends an empty body.
   - Update the module's header comment and the scaffold's sub-line ("Pending Status Actions and
     Humanity Checks awaiting sign-off") to name the third type.

9. **Office tab: a holder-facing request affordance** (`public/js/tabs/office-tab.js`). The existing
   `_isST()` stepper block is untouched; this is a *separate* control rendered for a **confirmed
   own-office holder** only — i.e. gated on `isOwnOffice && outcome.confirmed`, the same gate
   `showReasons`/`showBalance` already use, so an unconfirmed multi-seat fallback view never offers a
   button that would act on someone else's seat.
   - Merit rows gain a "Request dot" control (per merit, hidden at cap); the manoeuvre mount gains a
     single "Request rank N" control (hidden at full rank). Both are disabled with an
     "Awaiting ST approval" label when AC4's fetch reports a pending request for this seat, and
     disabled when `balance.left < 1` — with the shortfall reason `meritDotReasons`/
     `manoeuvreDotReasons` already computes reused as the `title`, not a second copy of that logic.
   - Submission uses the already-imported `apiPost` (`office-tab.js:3`) and reports through the
     canonical `toast()` from `../suite/toast.js` — gdx.12 evaluated the alternatives and settled on
     canonical `toast()` for exactly this kind of submit confirmation. Do **not** reuse
     `.office-action-msg` (`office-tab.js:245`): that element belongs to the Head-of-State Status
     Action block and is not rendered in the purchase sections.
   - After a successful submit, refresh through the existing `_refreshPurchaseState(el, outcome, data,
     isOwnOffice, gen)` path and honour the `el._officeManoeuvreGen` render-generation guard exactly as
     `_adjustMeritDots`/`_adjustManoeuvreRank` already do — a late response must never paint one
     office's state into another's markup. AC4's pending-request read joins the existing
     `Promise.allSettled` pair in `_refreshPurchaseState` (making it three), with its own independent
     failure flag: a failed pending-request fetch must degrade the button to disabled-with-unknown, not
     blank the merit or manoeuvre sections.
   - **Nothing new is disclosed to a reference viewer.** The whole affordance sits inside the existing
     holder-or-ST gates; a non-holder, non-ST viewer's DOM must still carry no purchase state at all
     (the boundary otc.3 set and oxp.6 re-verified after a real live leak).

10. **`public/js/data/office-xp.js`'s stale comment is corrected** (lines 277-278 and the mirroring
    note in `office-tab.js`'s `_balanceLineHtml`, lines 129-135). They currently say "no budget check
    (oxp.9 would add one)". After this story the accurate statement is: the ST's direct-set routes
    still have no budget check and `left` is still allowed to go negative *by design*; the budget check
    added by oxp.9 lives on the approval path only. **Comment text only — not one line of the maths,
    the signature, or the return shape changes.**

11. **Existing behaviour is provably unaffected.** `status_action` and `humanity_check` rows render and
    resolve identically (assert `_renderRow`'s own function body carries none of this story's new
    vocabulary — the static-analysis technique gdx.12's AC8 patch established for this exact module).
    Player-vs-player challenges still submit/accept/decline/void. Both existing purchase PUT routes
    behave identically, verified by re-running `oxp-3-office-manoeuvre-rank.test.js`,
    `oxp-4-merit-purchase-persistence-handover.test.js`, `oxp-6-*`, `oaq-2-pending-status-actions.test.js`,
    `oaq-3-approval-queue.test.js` and `gdx-12-humanity-check-oaq-submit-approve.test.js` green.

## Tasks / Subtasks

- [x] Task 1 (AC1, AC2) — `server/schemas/office_purchase_request.schema.js` (new, **with a `title`**);
      `server/routes/office-purchase.js` (new); mount in `server/index.js` **and**
      `server/tests/helpers/test-app.js`. Confirm by grep, before writing, that
      `contested_roll_requests` still has no collection-level `$jsonSchema` validator anywhere in
      `server/` (gdx.12 verified this; re-verify rather than inherit the claim).
      DONE. Re-verified by grep: the only `$jsonSchema` hits under `server/` are a MongoDB driver
      docstring and two comments that say a validator does NOT exist — no collection validator is
      registered anywhere, so a fourth `request_type` value needs no migration. The schema carries
      `title: 'TM Office Purchase Request'`, and a test asserts no other schema in
      `server/schemas/` claims that title.
- [x] Task 2 (AC3, AC4) — `POST /` and `GET /?seat_id=`: auth via `office_seats.holder_id`, purchase
      validity against `OFFICE_DATA`/`MERIT_DOT_CAPS`, courtesy affordability pre-check, one-pending-
      per-seat dedupe, document shape. Tests red first.
      DONE, red first (the suite failed to even import before the schema existed; 27 tests green
      after). Both routes reuse `resolveOfficeSeat` as-is, so the Administrator refusal and the
      lower-case seat-id normalisation are inherited rather than re-implemented.
- [x] Task 3 (AC5, AC6) — `PUT /:id/accept` (transactional: claim-then-apply, live re-reads,
      requester-still-holds-seat re-check, authoritative budget check, merit `$set` / manoeuvre
      clamped pipeline, outcome record) and `PUT /:id/decline`.
      DONE. Ordering is reads → validate → CLAIM (the first write, with the outcome, exactly
      office-actions.js's shape) → apply. Prove-discriminated twice: (a) moving the claim below the
      purchase write made the ordering test fail, restored green; (b) disabling the accept-time
      budget check made the authoritative-budget test fail, restored green.
- [x] Task 4 (AC7) — one-line `$in` widening in `office-actions.js`'s `GET /pending`; both `$nin`
      deny-list widenings in `contested-rolls.js`; confirm `GET /mine`'s allow-list needs no change.
      Prove-discriminated: each guard's regression test must fail before the widening and pass after.
      DONE, and this was genuinely red-then-green: exactly 4 tests failed before the three widenings
      (GET /pending, void, _findChallenge via accept, _findChallenge via decline) and all passed
      after. **The story's `GET /mine` claim is confirmed, not assumed**: its own test was written to
      fail if the allow-list were wrong, and it passed BEFORE any change, against a deliberately
      hostile fixture (an `office_purchase` document carrying `target_character_id`).
- [x] Task 5 (AC8) — `public/js/suite/office-approvals.js`: `_renderOfficePurchaseRow`, `_renderBody`
      branch, third `_resolve()` endpoint branch, header/scaffold comment updates.
      DONE. `_renderBody`'s new arm is written so gdx.12's own literal dispatch expression survives
      byte-identical (its suite asserts on that string). No new listener: the existing delegated
      click handler covers this row type, since it has no in-row input.
- [x] Task 6 (AC9) — `public/js/tabs/office-tab.js`: holder request controls on merit rows and the
      manoeuvre mount, pending-state read folded into `_refreshPurchaseState`'s `allSettled`,
      `apiPost` submit + canonical `toast()`, generation guard honoured. New `.oaq-*`/`.office-*`
      classes go in `public/css/suite.css` — **tokens only, no bare hex, no inline `style=""`**
      (`specs/project-context.md`).
      DONE. `_requestControlHtml` and `_submitPurchaseRequest` are placed BELOW `_wireManoeuvreRank`
      on purpose, so oxp.4's two source-span structural guards ("no write API reachable from the
      seat-resolution block", "no occupant reference inside the merit-dots block") stay literally
      true rather than being weakened.
- [x] Task 7 (AC10) — comment corrections in `public/js/data/office-xp.js` and `office-tab.js`'s
      `_balanceLineHtml`. No logic change; diff must show comment lines only.
      DONE. Both now state the real post-oxp.9 position: the budget check exists on the approval
      path only, the ST's direct-set routes stay unchecked, and `left` is still allowed to go
      negative by design. Not one line of maths, signature or return shape changed in either.
- [x] Task 8 (AC11) — `server/tests/oxp-9-spend-routes-through-oaq.test.js` (new): submit auth matrix
      (holder / non-holder / ST / vacant seat), purchase-validity rejections, dedupe 409, accept
      applying exactly one dot to the right collection, accept refusing on `left < 1`, accept 409 on
      an already-resolved record and on state moved by an ST stepper in between, decline writing
      nothing, the three widened guards, and the `_renderRow`-untouched static check. Prove-
      discriminated per this project's convention (revert → red → restore → green) for every fix.
      Then re-run the six existing suites named in AC11.
      DONE — 75 tests, all green, including two genuine CONCURRENT accept tests (two simultaneous
      PUTs on the same record resolve to exactly one 200, one 409, and exactly one dot applied).
      See the Dev Agent Record for the regression numbers and for the one AC11 naming correction
      (`oxp-6-*` names no suite that exists).
- [x] Task 9 — Manual/live verification: submit as a real holder, see the row appear in the Approval
      Queue alongside a `status_action` row if one exists, accept it, confirm the dot lands on the
      correct seat's document and the balance line moves by exactly 1; decline a second one and
      confirm nothing changed. Use the `local-test-token` bypass technique
      (memory `feedback-local-browser-verification-technique.md`); serve TM Game on an alternative
      port rather than fighting TM Admin's dev supervisor on 8080, and run the API with plain
      `node server/index.js`, not `npm run dev`. Disclose anything not actually eyeballed rather than
      claiming coverage.
      DONE, with two disclosed limitations — full detail in the Dev Agent Record's
      "Live verification: what was and was not eyeballed" section. Driven end to end through the
      real running app (frontend on port 8081, API via plain `node index.js` on 3000) against
      **`tm_game_test`, deliberately, not live `tm_game`** — no live data was written at any point.

## Dev Notes

- **Verified this session, cite rather than re-derive:**
  - Both purchase PUT routes are `requireRole('st')`; there is no player/holder write path of any kind
    today. `GET /api/office_merit_dots` and `GET /api/office_manoeuvre_rank` are open to any
    authenticated user (reference info), and both return `{ [seatId]: … }` maps with a missing key
    meaning zero.
  - `office_manoeuvre_ranks`' per-seat value is `{ rank, manoeuvre_xp_destroyed }` (oxp.6's AC1 shape
    change), **not** a bare integer. `officeXpSpentForCategory` folds `manoeuvre_xp_destroyed` into
    spend on its raw-document branch only. Pass the raw document, not a bare number, or a handover's
    destroyed XP silently reappears as a refund.
  - `officeSeatXp(seat, allSeats, meritDotsDoc, manoeuvreRankDoc, now)` requires **all** seats to
    compute `spendKnown`, and forces `spendKnown: false` if `seat` is not found in `allSeats`. This
    story never reads `spendKnown` — only `earned`/`spent`/`left` — but must still pass a complete
    `allSeats` so the function is called correctly.
  - `resolveOfficeSeat` normalises the seat id to lower case before use, and that normalised form is
    the document key on both purchase collections. Store the **normalised** id on the pending record,
    or a later accept can mint a second purchase document for the same seat.
  - `server/index.js` already builds a partial unique index on `office_actions` (issue #1143). This
    story adds **no** index. If a dev believes one is needed for the dedupe, re-read AC3's reasoning
    first — gdx.12's identical instinct was reviewed and dismissed as spec-sanctioned.
  - A server route importing from `public/js/data/…` is an established, tested pattern here
    (`humanity-check.js` imports `accessors.js`; `office-actions.js` imports `city-status-calc.js` and
    `helpers.js`; both purchase routes import `office-data.js`). `office-xp.js` is pure, clock-free and
    DOM-free by design — it takes `now` as a required argument — so it imports cleanly server-side.
- **Reuse, do not reinvent:** `resolveOfficeSeat`, `MERIT_DOT_CAPS`, `OFFICE_DATA`, `officeSeatXp`,
  `manoeuvreDotReasons`/`meritDotReasons`, `office-approvals.js`'s poll/`_fetchGen`/delegated listener,
  `office-tab.js`'s `el._officeManoeuvreGen` guard, `redactCharName`/`redactPlayer`, `toast()`.
- **Race-safety precedents that already cost this codebase a review round each** — inherit them, do
  not re-learn them: claim the pending record *before* any dependent write (office-actions accept);
  send a relative step through the server's clamped aggregation pipeline rather than a client-computed
  absolute (office-manoeuvre-rank `/step`); guard every post-await DOM write with the render
  generation (office-tab, office-approvals); never let a failed fetch render as an empty/all-clear
  state (office-approvals `fetchFailed`).
- **Tests:** vitest suites live in `server/tests/`; several need a local `mongod` and **skip rather
  than fail** without one — read the summary line, not the exit code. The accept route's transaction
  needs a replica-set-capable mongod, the same as `oaq-2-pending-status-actions.test.js`'s existing
  accept tests; if the local environment cannot run those, say so explicitly rather than quietly
  dropping the transaction from the design.

### Project Structure Notes

- **Server — new:** `server/schemas/office_purchase_request.schema.js`,
  `server/routes/office-purchase.js`, `server/tests/oxp-9-spend-routes-through-oaq.test.js`.
- **Server — edited:** `server/index.js` (one mount line), `server/tests/helpers/test-app.js` (one
  mount line), `server/routes/office-actions.js` (one `$in` in `GET /pending`),
  `server/routes/contested-rolls.js` (two `$nin` guards). **Not edited:**
  `server/routes/office-merit-dots.js`, `server/routes/office-manoeuvre-rank.js`,
  `server/routes/office-seats.js`, `server/routes/humanity-check.js`, `server/schemas/*` beyond the
  new file.
- **Client — edited:** `public/js/tabs/office-tab.js` (holder request controls + pending read + submit),
  `public/js/suite/office-approvals.js` (row renderer, `_resolve` branch, comments),
  `public/js/data/office-xp.js` (comment only), `public/css/suite.css` (new classes). **Not edited:**
  `public/js/editor/xp.js`, `public/js/editor/sheet.js`, `public/js/data/office-seat-resolve.js`,
  `public/js/game/humanity-check.js`, `public/js/tabs/office-data.js`.
- No conflict with other in-flight work: oxp-8 is content authoring (not app code) and oxp-10
  (`OFFICE_DATA` → Mongo) is backlog and unstoried; this story reads `OFFICE_DATA` through the same
  existing import path either would later change in one place.

### References

- `specs/epic-oxp-office-xp-economy.md` (oxp.9 row; "All spend requires ST approval — no unmoderated
  spend path") and `specs/epic-oaq-office-approval-queue.md:36-38` (the sequencing note that named this
  story's mechanism).
- `content/rules/office-powers.md` §"Office XP", §"The model, in full", §"Manoeuvres are a graduated
  merit" — **authoritative; cite, do not re-derive.**
- `specs/stories/gdx-12-humanity-check-oaq-submit-approve.md` — the closest precedent, read in full
  during story creation. Its "Epic OAQ's real submit/approve pattern" section, its AC2/AC3/AC5, and its
  review findings on endpoint misrouting and query-param typing all apply directly here.
- `specs/stories/oxp-6-office-tab-purchase-markers.md` — its "NOT oxp.9's spend-approval routing" and
  "NOT a new write path" carve-outs are the negative space this story fills.
- `specs/stories/oaq-2-pending-status-actions-accept-decline.md` — the budget-spends-on-approval
  decision this story follows.
- Read in full during story creation: `server/routes/office-actions.js`, `server/routes/humanity-check.js`,
  `server/routes/office-merit-dots.js`, `server/routes/office-manoeuvre-rank.js`,
  `server/lib/office-seat-resolve.js`, `public/js/suite/office-approvals.js`,
  `public/js/data/office-xp.js`, `public/js/tabs/office-tab.js`.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context), running as the dev-story subagent of this project's BMAD-style loop.

### Completion Notes List

**What was built.** All nine tasks. Server: a new `office_purchase` request type in the existing
`contested_roll_requests` collection, with its own titled request-body schema and its own route file
carrying POST / GET / accept / decline. The purchase write happens only on ST accept, inside one
transaction, in the order the story specified: read live, re-validate, re-check the requester still
holds the seat, authoritative `officeSeatXp().left >= 1`, claim the pending record (the first write,
carrying the outcome), apply the purchase. Merit purchases go through the same `$set` plus
denormalised `office_category` plus `upsert` shape `office-merit-dots.js` uses; manoeuvre purchases go
through the SAME clamped aggregation pipeline `office-manoeuvre-rank.js`'s `/step` route uses, never
a read-then-write absolute. Client: a third row type in the Approval Queue, and a holder-facing
"Request dot" / "Request rank N" affordance on the Office tab, gated on a confirmed own-office view.

**Prove-discrimination performed** (this project's revert, red, restore, green convention):

- The three widened guards (Task 4) were genuinely red first: exactly 4 tests failed before the
  widenings and passed after, with no other test's result changing.
- The accept-time budget check: replacing `if (balance.left < 1)` with `if (false)` made the
  authoritative-budget test fail; restored, green.
- The claim-first ordering: mechanically moving the claim block below the purchase write made the
  ordering test fail; restored, green. **Honest note on what that proves**: the two *behavioural*
  concurrent-accept tests still passed with the claim moved, because MongoDB's own transactional
  write-conflict retry already serialises two accepts on the same document. The claim-first ordering
  is therefore defence in depth here rather than the sole guard, and the static ordering test is what
  actually pins it. Recorded rather than glossed, because the story presents it as a race fix.

**One AC11 naming correction, not a scope change.** AC11 names `oxp-6-*` among the suites to re-run.
No such suite exists: `ls server/tests | grep oxp` returns oxp-1, oxp-2, oxp-3, oxp-4, oxp-5 (x2),
oxp-7 (x2) and oxp-11, and oxp.6's own behaviour (`manoeuvreDotReasons` / `meritDotReasons` / the
balance line) is covered by `issue-1141-office-tab-render.test.js` and
`oxp-2-derived-office-xp-calculation.test.js`. Both were run in its place. AC11 also names
`oxp-4-merit-purchase-persistence-handover.test.js`; the real filename is
`oxp-4-merit-persistence-handover.test.js` (no "purchase"). That file was run.

**One existing test assertion updated, deliberately and minimally.**
`oxp-4-merit-persistence-handover.test.js` pins `_wireMeritDots`'s exact parameter list as a
structural guard against a character reference entering it. AC9 legitimately widens that signature by
`requestState` (`{ canRequest, hasPending, unknown }`, three booleans, no character reference), so
the pinned literal was updated and the reason recorded in the test's own comment. Same shape of
update gdx.12 made to two `oaq-3-approval-queue.test.js` assertions for the same reason. The other
two oxp-4 guards that this story initially tripped were fixed **in the source, not the test**: the
new helpers were moved out of the guarded source spans, and one comment was reworded, so both
guarantees remain literally true. That is the important part of this note: only one of three
regressions was a test that genuinely needed updating.

**Full regression.**

| Suite | Result |
|---|---|
| `oxp-9-spend-routes-through-oaq` (new) | 75 passed |
| `oxp-3-office-manoeuvre-rank` | passed |
| `oxp-4-merit-persistence-handover` | passed |
| `oxp-2-derived-office-xp-calculation` (oxp.6 stand-in) | passed |
| `issue-1141-office-tab-render` (oxp.6 stand-in) | passed |
| `oaq-2-pending-status-actions` | passed |
| `oaq-3-approval-queue` | passed |
| `gdx-12-humanity-check-oaq-submit-approve` | passed |
| **Total, one run, 8 files** | **321 passed, 0 failed, 0 skipped** |

A wider sweep of every other suite touching a changed file (crd-1/2/3a/3b/4a,
issue-1141-office-data-sync, issue-1143-office-actions-auth-safety, office-merit-dots,
otc-2-office-actions-api, otc-3-office-nav-unconditional, oxp-1, oxp-5 x2, oxp-7 x2, oxp-11) ran
**419 passed, 0 failed**.

`0 skipped` is stated deliberately, per this repo's own warning that a skipped DB-backed suite is not
a passing one: a real MongoDB was reachable for every run above, so the accept route's transaction
was genuinely exercised rather than skipped.

**One intermittent failure investigated, not caused by this change.**
`crd-2-pending-queue.test.js`'s "no other client module still references it" failed on two of four
batch runs and passed on the other two, and passes 57/57 in isolation. It is a **timeout**, not an
assertion failure (7061ms and 11183ms against vitest's 5000ms default), on a test that walks the
whole of `public/js` from disk. Verified not caused by this story three ways: `git stash -u` A/B (the
same batch at base passes too), the assertion's own search terms (`challenge-notification.js`,
`startChallengePoller`, `stopChallengePoller`) appear **nowhere** in `public/js` at all so the
assertion is trivially satisfiable, and none of this story's diff adds them. Matches the contention
flake class this repo's own `CLAUDE.md` already documents.

### Live verification: what was and was not eyeballed

Driven through the real running app: frontend on **port 8081** (not 8080, TM Admin's dev supervisor
squats that), API via plain **`node index.js`** (not `npm run dev`, which crash-loops in watch mode
here), `local-test-token` bypass, Chrome automation.

**Pointed at `tm_game_test`, not live `tm_game`, deliberately.** gdx.12's live pass wrote real
documents to production and needed explicit clean-up afterwards; this story's accept route WRITES A
PURCHASE, so verifying against live data would have altered a real seat's purchase state. A seeded
seat and holder in the test database gave the same end-to-end coverage with no live write. Those
fixtures were deleted afterwards (confirmed: 0 `office_purchase` documents remain in `tm_game_test`).

Actually eyeballed and confirmed:

- The Office tab's Manoeuvres section rendering the balance line and an enabled **REQUEST RANK 1**
  control beside the ST's existing steppers; the Merit Suite rendering a **REQUEST DOT** control per
  merit, correctly absent on a merit already at its cap.
- Clicking REQUEST DOT: the toast "Request submitted. Awaiting ST approval." and **every** request
  control on the seat flipping to a disabled "AWAITING ST APPROVAL" (the one-pending-per-seat rule
  visible in the UI), with the ST steppers deliberately still enabled beside it.
- The Approval Queue rendering the new row (`Storyteller > Head of State`, badge `MERIT: STAFF`,
  timestamp, Accept/Decline) under the updated sub-line naming all three pending types.
- Accepting from the queue: the row disappears, and back on the Office tab the dot has landed on the
  right merit and the balance line moved by **exactly 1** (`1 of 7 ... 6 remaining` became
  `2 of 7 ... 5 remaining`).
- Declining from the queue: `office_manoeuvre_ranks` still `{}` and `office_merit_dots` unchanged, so
  a decline really does write nothing.
- The unaffordable state: with the seat spent to `7 of 7 ... 0 remaining`, every request control
  disabled and carrying oxp.6's own reason as its `title` ("Not enough office XP (1 short)"), the
  reuse AC9 asked for, confirmed live rather than only in a unit test.
- No new disclosure to a non-own-office view: an ST browsing another character's office shows the
  pre-existing dots, steppers and balance but **zero** request controls, and zero inline `style`
  attributes anywhere in the tab.
- Zero console errors across the whole pass.

**Not eyeballed, disclosed rather than claimed:**

1. **The player-holder authorisation branch was not exercised live.** The `local-test-token` bypass
   hardcodes `role: 'st'` and `character_ids: []` (`server/middleware/auth.js`), so every request
   submitted in the browser took the route's ST branch and recorded `requested_by_character_id: null`
   (hence the queue row reading "Storyteller"). The holder branch, the non-holder 403, the
   vacant-seat 403, and the requester-no-longer-holds-the-seat 403 at accept are covered only by the
   Supertest suite, which drives them through the real routes with a real player user. The
   CLIENT-side holder gate (`isOwnOffice && outcome.confirmed`) WAS genuinely exercised, since it
   keys off the loaded character rather than the auth role.
2. **No `status_action` row co-rendered beside an office_purchase row live.** The same caveat gdx.12
   recorded for its own type, for the same reason (no pending Status Action existed to sit next to
   it). `_renderRow`'s body is instead pinned by a static test asserting it carries none of this
   story's vocabulary, and `oaq-3`'s 24 assertions on its markup all passed.
3. A player-role pass was attempted and abandoned: with `role: 'player'` the app's character picker
   disappears and the Office tab rendered blank, because the bypass user has no `character_ids` for
   the app to resolve a character from. That is an artefact of the bypass, not of this story (no
   console error was raised), but it means the player-role rendering path was not verified.

### Deviations from the story's spec

1. **The Approval Queue badge for a manoeuvre reads "Next manoeuvre rank", not "Manoeuvre rank 3".**
   AC8 gives "Manoeuvre rank 3" as an example, but AC3 fixes the pending document's shape and it
   carries no rank field: the rank is only read live inside the accept transaction, precisely so the
   ST's own stepper moving it in between is caught as a 409. Rendering a number here would have meant
   either adding a field AC3 does not have, or printing a figure that could be stale by the time it
   is read. The badge says what is true of the request itself.
2. **`merit: null` is treated as "not supplied" on a manoeuvre request**, rather than rejected. AC3
   says a merit supplied on a manoeuvre request is a 400; the schema itself permits `null`, so a
   client that always sends the key is not punished for it. A non-null merit on a manoeuvre request
   is a 400 as specified.
3. **`GET /` uses `resolveOfficeSeat`**, which means a read against an Administrator seat returns the
   inherited 400 rather than an empty list. Consistent with POST and accept, and unreachable from the
   Office tab (Administrator has no `OFFICE_DATA` entry, so the tab returns before any purchase-state
   fetch).
4. The two AC11 suite-name corrections and the one updated oxp-4 assertion, both described above.

### File List

**Created**

- `server/schemas/office_purchase_request.schema.js`
- `server/routes/office-purchase.js`
- `server/tests/oxp-9-spend-routes-through-oaq.test.js` (75 tests)

**Edited, server**

- `server/index.js` - import plus one mount at `/api/office_purchase_requests`
- `server/tests/helpers/test-app.js` - import plus the same mount for the test app
- `server/routes/office-actions.js` - `GET /pending` filter widened to
  `$in: ['status_action', 'humanity_check', 'office_purchase']`
- `server/routes/contested-rolls.js` - both `$nin` deny-list guards (`_findChallenge`,
  `PUT /:id/void`) widened to include `'office_purchase'`. `GET /mine` deliberately unchanged.
- `server/tests/oxp-4-merit-persistence-handover.test.js` - one pinned signature literal updated (see
  Completion Notes)

**Edited, client**

- `public/js/tabs/office-tab.js` - `toast` import; pending-request read folded into
  `_refreshPurchaseState`'s `allSettled` as a third entry with its own failure flag; `canRequest`
  gate; `_requestControlHtml` and `_submitPurchaseRequest`; request controls on merit rows and the
  manoeuvre mount; AC10 comment correction in `_balanceLineHtml`
- `public/js/suite/office-approvals.js` - `_renderOfficePurchaseRow`, `_renderBody` branch, third
  `_resolve()` endpoint branch, header and scaffold sub-line updates
- `public/js/data/office-xp.js` - AC10 comment correction only
- `public/css/suite.css` - `.office-request-btn` plus two flex-wrap rules, tokens only

**Not edited, per the story's own exclusions:** `server/routes/office-merit-dots.js`,
`server/routes/office-manoeuvre-rank.js`, `server/routes/office-seats.js`,
`server/routes/humanity-check.js`, `public/js/editor/xp.js`, `public/js/editor/sheet.js`,
`public/js/data/office-seat-resolve.js`, `public/js/game/humanity-check.js`,
`public/js/tabs/office-data.js`.
