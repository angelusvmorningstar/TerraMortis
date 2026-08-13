# Story oxp.5: Handover logic — seat holder change, manoeuvre reset

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an ST,
I want one transactional route that changes who holds an office seat, keeping `office_seats.holder_id`
and `characters.court_category` in step and resetting that seat's manoeuvre ladder to zero,
so that the ruling in `content/rules/office-powers.md` ("permanent merits stay, manoeuvres reset to
zero and the XP spent on them is lost") is a real behaviour of this app rather than a written rule
nothing implements, and so that a handover stops being two independent facts that agree only by
accident.

## Why this story exists

`content/rules/office-powers.md` §"The pool is institutional, but what it buys is not all
institutional" (umbrella root, authoritative, Angelus's ruling 2026-08-11) states the asymmetry this
story implements:

> - **Permanent merits stay** when the office changes hands. Safe Place, Haven, Contacts, Resources
>   and the rest are the office's material infrastructure and survive the holder.
> - **Manoeuvres reset to zero, and the XP spent on them is lost.** Not refunded, not banked, gone.
>   The incoming holder starts the ladder from nothing.

Nothing in this codebase implements the reset. Worse, nothing records that a handover happened at
all. Two separate facts decide who holds an office, and no code links them:

- **`characters.court_category`** — a plain nullable enum on the character document
  (`server/schemas/character.schema.js:78`), edited through the generic `PUT /api/characters/:id`
  route. This is what actually gates behaviour today: `office-actions.js`'s auth check
  (`if (!actor.court_category) return 403`), `office-tab.js`'s `isOwnOffice`, `city-tab.js`, and
  `admin/city-views.js`'s court list all read it.
- **`office_seats.holder_id`** — the seat-identity field oxp.1 introduced and oxp.2's and oxp.11's
  client code now depend on to work out *which seat's* purchase state to show.

They agree right now purely by luck. oxp.1's own Dev Notes flagged the link as "a real future design
question, out of scope here". oxp.11 then hit it as a hard blocker and said so twice, in its own
"Why this story exists" and again in its Dev Agent Record:

> Nothing in this codebase maintains `office_seats.holder_id`. oxp.1's one-off seed script is its only
> writer and oxp.5 is unbuilt, so after a real handover `characters.court_category` is updated through
> the real character route while `holder_id` silently goes stale, and the new holder stops resolving to
> their own seat by holder match. [...] **"oxp.5 must write `holder_id` when a seat changes hands" is
> therefore a hard requirement of oxp.5, not a nicety.**

oxp.11 is this story's hard prerequisite and it has landed: both purchase collections are now keyed by
seat, so resetting one Primogen seat's ladder no longer destroys the other Primogen seat's unrelated
progress. That was the blocker; it is gone.

### Angelus's two scoping rulings (2026-08-13, asked directly — do not re-litigate)

**1. Do not derive `court_category` from `office_seats.holder_id`.** The question put to him was
whether `court_category` should become a fully derived value (a large, risky refactor touching every
read site: `office-actions.js`'s auth gate, `city-tab.js`, `admin/city-views.js`, `office-tab.js`'s
`isOwnOffice`, and more) or whether oxp.5 should build ONE transactional route that keeps the two in
sync atomically and leaves every existing read site alone. **His answer: the smaller option.**
`court_category` stays a real, independently readable field everywhere else; this one route is the
single place a handover happens, and it is what keeps the two facts in step.

**2. Rewire the existing court-slots admin UI to call it.** `admin/city-views.js`'s `saveCourt()` is
the closest thing to a handover UI that exists today, and it does sequential independent
`PUT /api/characters/:id` calls with no reset and no seat awareness whatever. Leaving it alone would
let an ST bypass this entire story by using the familiar existing control. **His answer: yes, rewire
it.** The new route becomes the one correct path; the existing panel becomes its front end rather than
a separate raw-edit mechanism.

### Three findings from this story's own investigation that change the shape of the work

None of these were in the original scoping. Each was confirmed by reading the real code.

**Finding 1 — the reset, as the obvious implementation, would REFUND the destroyed XP.** This is the
most important thing in this story and it is easy to miss.

Office spend is DERIVED, never stored: `officeXpSpentForCategory` in `public/js/data/office-xp.js`
(oxp.2) computes it as the sum of the seat's current merit dots plus its current manoeuvre `rank`.
So the instant a handover sets `rank` back to 0, the derived spend DROPS by the old rank and the
office's balance RISES by exactly the amount the ruling says must be destroyed. The "obvious"
implementation delivers the precise opposite of the rule.

The ruling anticipated this and says so in as many words:

> The running balance is total accrued since creation, minus everything ever spent, **including the
> spend that has since been lost.**

Lost spend cannot be recovered from current state after the fact — it is destroyed by definition, and
nothing else in the system records the rank a seat used to have. **This story is the only place the
information exists, so it must be captured here or it is gone forever.** AC6 therefore accumulates a
cumulative `manoeuvre_xp_destroyed` counter on the seat's `office_manoeuvre_ranks` document, in the
same atomic operation that zeroes the rank.

Wiring that counter INTO the balance arithmetic is deliberately NOT this story (see "What this story
is NOT"): `office-xp.js` has no consumer yet, so no wrong number is on screen today, and changing its
functions would rewrite oxp.2's AC8 from inside this story. Capturing the data now and handing the
arithmetic forward is the same pattern oxp.11 used to hand `holder_id` to this story.

**Finding 2 — `resolveOfficeSeat()` cannot be reused here, for two independent reasons.** The brief
for this story suggested reaching for `server/lib/office-seat-resolve.js`'s existing helper. Reading
it in full shows it is the wrong tool:

- It **rejects any seat whose office has no `OFFICE_DATA` entry with a 400**. That means
  Administrator, until oxp.8 authors its content. The Administrator seat is real and filled (Ivana
  Horvat, since Game 5) and must be handoverable. That refusal is correct for a *purchase* route,
  which cannot validate a merit or a rank without rules, and wrong for a *handover* route, which
  needs no rules at all.
- It does its `findOne` **without a session parameter**, so it cannot participate in this story's
  transaction and would read outside it.

Reuse its exported `SEAT_ID_PATTERN` constant (so the 24-hex shape still exists in exactly one place,
which is that module's own stated reason for existing) and do the seat lookup inline, inside the
session. Do not add a session parameter to `resolveOfficeSeat` and do not relax its `OFFICE_DATA`
check: two live callers depend on that refusal and oxp-3's and oxp-11's tests pin it.

**Finding 3 — `court_title` does not live on `office_seats`, and `seat_label` is not its equivalent.**
Confirmed against `server/schemas/office_seat.schema.js` and `server/schemas/character.schema.js`:

| Field | Lives on | Means |
|---|---|---|
| `court_title` | `characters` | The HOLDER's displayed title ("Primogen", "Harpy"). Moves with the person. |
| `seat_label` | `office_seats` | The SEAT's permanent distinguisher ("Harpy" appointed vs "People's Harpy" popular). Belongs to the seat and outlives every holder. |

They look similar and are not. **This route writes `court_title` on the character and must never
write `seat_label`** — rewriting a seat's own identity label during a handover would destroy the one
thing that tells Socialite's two seats apart. AC8 pins this by test.

### Live data (confirmed by oxp.11's own read-only check, 2026-08-13 — cite, do not re-derive)

- `office_seats`: 7 documents. `_id` and `holder_id` are **real BSON ObjectIds** in storage;
  `created_at` is a string. Only the default `_id_` index.
- All 7 characters with a non-blank `court_category` match exactly one seat by `holder_id`, and no
  seat points at a character without a matching `court_category`. **The two facts are fully consistent
  right now**, which is why this story needs no backfill (see "What this story is NOT").
- `office_manoeuvre_ranks`: 0 documents. Nobody has purchased a manoeuvre rank on any seat, so the
  first real reset this story fires will have nothing to destroy. That keeps the live blast radius of
  this change at zero and it should not be overstated — but the counter still has to be built now,
  because the first purchase could happen at any time and the first handover after it destroys the
  evidence.
- `office_merit_dots`: 2 documents, `{ "Safe Place": 0 }` each. Untouched by this story by design.

## What this story is NOT

- **NOT a change to any `court_category` read site.** `characters.court_category` stays a real,
  independently readable field, and nothing is repointed at `office_seats`: not `office-actions.js`'s
  auth gate, not `city-tab.js`, not `office-tab.js`'s `isOwnOffice`, not the court list in
  `admin/city-views.js`. That was Angelus's explicit ruling 1 above, and it is the whole reason this
  story is small enough to be one story.
- **NOT seat creation or deletion.** `office_seats` documents are still created only by oxp.1's manual
  seed script. This story changes who HOLDS a seat, never which seats exist. This has a real
  consequence for the UI rewire that AC9 handles head-on rather than papering over: the current
  "+ Add slot" / "remove slot" buttons in the court panel implicitly create and destroy holdings, and
  under seat-backed rows there is nothing for them to create. **This is a genuine gap with no home
  yet** — an in-app seat CRUD story does not exist. It is recorded in AC9, in the Dev Notes, and in
  this story's `sprint-status.yaml` entry so it is not lost, but adding a story for it was not in this
  story's brief and is Angelus's call.
- **NOT a backfill of `office_seats.holder_id`** for the seven live seats. They are already consistent
  (see "Live data"). This story changes only what happens on the NEXT handover, going forward.
- **NOT a change to `office_merit_dots` in any direction.** Merits persist by construction, because a
  seat's `_id` never changes (oxp.11's core guarantee). Leaving the collection alone IS the correct
  implementation of "permanent merits stay", not an oversight. AC7 proves it rather than assuming it,
  which matters more now than it did for oxp.4: oxp.4's guarantee was safe because nothing COULD reset
  anything. This story builds the thing that can.
- **NOT a change to `public/js/data/office-xp.js`.** Its `officeSpendKnownByCategory` flag is
  substantively obsolete after oxp.11 but fails safe and has no consumer; oxp.2's AC8 tests pin its
  current behaviour. And the destroyed-XP arithmetic from Finding 1 is handed forward, not wired here.
  See AC6's closing note.
- **NOT a change to `office-tab.js`'s client-side seat resolution.** oxp.11 built `_wirePurchaseState`
  and it needs no edit. It gets strictly better for free: once this route maintains `holder_id`, the
  own-office holder match starts succeeding, `outcome.confirmed` becomes true for real holders, and
  oxp.11's "Could not confirm which of this office's seats is yours" disclosure stops firing for them.
  Do not delete that disclosure — it still covers reference views and any seat this route has not yet
  touched.
- **NOT a richer handover UX.** AC9 rewires the existing court-slots panel and stops there. A
  purpose-built handover screen, a history view, or a seat picker are not in scope (the seat picker is
  oxp.6's, per oxp.11's own handover note).
- **NOT XP-spend-approval routing (oxp.9)**, and NOT any gating of what a holder may buy.
- **NOT `OFFICE_DATA`'s migration off static JS (oxp.10)**, and NOT an AJV schema file for
  `office_manoeuvre_ranks` (it has never had one; the route handlers are its validation surface, per
  oxp.11 AC1).

## Acceptance Criteria

1. **The route.** `PUT /api/office_seats/:seatId/holder`, added to the existing
   `server/routes/office-seats.js` router. **No mount change is needed**: `server/index.js:193`
   already has `app.use('/api/office_seats', requireAuth, noCache(), officeSeatsRouter)` and
   `server/tests/helpers/test-app.js` mounts the same router. The route itself carries
   `requireRole('st')`, leaving the existing `GET /` open to any authenticated user — exactly the
   split `office-merit-dots.js` already uses (open GET, ST-gated PUT). Body:
   `{ holder_id: <24-hex lowercase-normalised string> | null, court_title?: <string | null> }`.
   - `:seatId` must be a 24-hex string, validated with `SEAT_ID_PATTERN` **imported from**
     `server/lib/office-seat-resolve.js` so the pattern still exists in exactly one place. A malformed
     id is a 400 `VALIDATION_ERROR`; a well-formed id with no matching `office_seats` document is a
     404 `NOT_FOUND`.
   - `resolveOfficeSeat()` itself is **deliberately not used**, and `office-seat-resolve.js` is not
     modified. See Finding 2: it 400s any seat whose office has no `OFFICE_DATA` entry, which would
     make the real, filled Administrator seat un-handoverable until oxp.8; and it takes no session, so
     it would read outside this route's transaction. A test asserts a handover of an Administrator
     seat succeeds, so this cannot silently regress into a reuse that reintroduces the refusal.
   - `holder_id` in the body must be `null` or a 24-hex string; anything else (a number, an object, an
     absent key, a non-hex string) is a 400. A non-null `holder_id` must resolve to a real character
     or the request is a 404 naming the character, not the seat.
   - `court_title` is optional, a string or null, trimmed. It is **ignored when `holder_id` is null** —
     a vacant seat has nobody to title. An absent `court_title` on a real handover defaults to the
     seat's `office_category`, matching what `saveCourt()` already does today
     (`const title = titleInput?.value.trim() || cat`).

2. **A target who already holds a DIFFERENT seat is refused, never cascaded.** Inside the transaction
   and before any write, query `office_seats` for any document where `holder_id` equals the target
   character and `_id` is not the seat being assigned. If one exists, abort with **409 CONFLICT** and
   a message naming the conflicting seat (its `office_category`, plus its `seat_label` or a short form
   of its id) and telling the ST to vacate it first.
   - This is not defensiveness, it is the only correct option. `court_category` is a single field, so
     a character can only display one office. Silently assigning someone into a second seat would
     either overwrite their existing `court_category` while leaving the FIRST seat's `holder_id`
     stale — precisely the class of staleness bug oxp.11 just fixed, relocated rather than solved — or
     require this route to silently modify a THIRD document the caller never named.
   - Matches this project's established "refuse rather than guess" posture: oxp.1's seed script
     refuses an unconfirmed date, oxp.11's migration script refuses both the zero-seat and the
     ambiguous multi-seat case.
   - A character whose `court_category` is set but who holds no seat at all is **not** a conflict.
     The seat is authoritative; the route overwrites that stale value. Stated here so it reads as a
     decision rather than an oversight.

3. **One transaction, mirroring `office-actions.js`'s `PUT /:id/accept` exactly.** `getClient()` +
   `client.startSession()` + `session.withTransaction(...)`, with `statusCode`/`body` captured in
   variables scoped OUTSIDE the callback and the response sent after the commit, and
   `await dbSession.endSession()` in a `finally`. Business rejections are thrown as a
   `RouteResponse extends Error` (the same idiom, defined locally in this file or lifted to a shared
   module — either is acceptable, but say which and why): `withTransaction` retries only errors
   MongoDB itself labels transient, so a plain thrown `Error` aborts cleanly with no spurious retry.
   The write sequence inside the callback, in this order:

   1. **Read the seat** by `_id`, `{ session }`. Absent → 404.
   2. **Read the target character** (when `holder_id` is non-null), `{ session }`. Absent → 404.
   3. **AC2's conflict check.** Found → 409.
   4. **Claim the seat FIRST, before any other write**, with a compare-and-swap on its current holder:
      `office_seats.updateOne({ _id: seatOid, holder_id: <current value> }, { $set: { holder_id: <new ObjectId | null> } }, { session })`.
      `matchedCount === 0` → **409 CONFLICT** ("this seat was changed by another handover, please
      retry"). Claiming the record first is the specific lesson `office-actions.js`'s accept route
      records in its own comments: it is what makes the loser of a genuine concurrent race fail
      cleanly instead of proceeding into the later writes.
   5. **Clear the departing holder** (only when there WAS one, and it is not the same character as the
      incoming one): `characters.updateOne({ _id: departingOid, court_category: <this seat's category> }, { $set: { court_category: null, court_title: null, updated_at } }, { session })`.
      A `matchedCount` of 0 here is **benign, not an error** — it means their `court_category` had
      already moved elsewhere by another route, and clearing it unconditionally would wipe a
      legitimate newer assignment. Report it in the response; do not abort.
   6. **Set the incoming holder** (only when `holder_id` is non-null):
      `characters.updateOne({ _id: targetOid }, { $set: { court_category: <seat's category>, court_title, updated_at } }, { session })`.
   7. **AC6's manoeuvre reset**, last.

   `holder_id` is written as a **real `ObjectId`** (or `null`), never a string — live storage is BSON
   ObjectIds (see "Live data"), and a string would silently create the mixed string/ObjectId foreign
   key of `data-map.md` Known Drift Pattern #2, which `office_seat.schema.js`'s 24-hex pattern exists
   to prevent. A test asserts the stored `holder_id` is an ObjectId after a handover.

4. **Same holder is a safe, idempotent no-op for reset purposes.** When the requested `holder_id`
   equals the seat's current `holder_id` (including `null === null`, i.e. re-vacating an already
   vacant seat), this is not a handover:
   - **No manoeuvre reset fires and no XP is destroyed.** Re-saving the court panel must never be able
     to wipe a ladder.
   - A changed `court_title` is still applied to the current holder. Title corrections are a real
     thing an ST does and must not require a fake handover.
   - Responds **200** with the unchanged seat and `handover: false`. Not an error: the court panel
     saves every slot, most of which have not changed, and an ST correcting one title should not get
     four rejections.
   - Detected INSIDE the transaction, after step 1's read, so there is no read-then-decide gap.

5. **Vacating a seat is itself a handover.** `holder_id: null` on a seat that currently has a holder
   destroys that seat's manoeuvre progress exactly as a replacement would. The ruling's wording is
   "on handover" / "when the office changes hands", and a departing holder's investment dies with
   their tenure whether or not a successor is named — the office-powers ruling's own consequence 2
   ("a holder near the end of their tenure has no reason to buy manoeuvres") depends on this being
   true. Do not special-case vacate as reset-exempt.

6. **Manoeuvre reset, and capture of the destroyed XP.** On a real handover (AC4's no-op excluded),
   the seat's `office_manoeuvre_ranks` document is reset in **one atomic aggregation-pipeline
   `updateOne`** with `upsert: false`, inside the same transaction:

   ```js
   office_manoeuvre_ranks.updateOne(
     { _id: seatId },
     [
       { $set: { manoeuvre_xp_destroyed: { $add: [ { $ifNull: ['$manoeuvre_xp_destroyed', 0] }, { $ifNull: ['$rank', 0] } ] } } },
       { $set: { rank: 0, office_category: { $literal: category }, updated_at: <iso> } },
     ],
     { session },
   )
   ```

   - **Stage order is load-bearing.** Pipeline stages run in sequence, so stage 1 reads the ORIGINAL
     `$rank` before stage 2 zeroes it. Swapping them silently records 0 destroyed every time. A test
     must catch that specific inversion.
   - **`$set rank: 0`, not delete-the-document.** Both read identically to clients (`GET /` does
     `out[doc._id] = doc.rank || 0`, and the client treats a missing key as 0), so the choice is about
     what evidence survives. Zeroing keeps `updated_at` and the destroyed counter as a legible record
     that a reset happened; deleting throws away the only trace, including the counter Finding 1 says
     must not be lost.
   - **`upsert: false`, deliberately.** A seat that never purchased a rank has no document, nothing to
     destroy, and needs no document minted saying so. `matchedCount === 0` is a correct, silent
     success, and it keeps the collection's "no document = 0" convention intact rather than filling it
     with meaningless rank-0 rows.
   - `office_category` rides along as a `$literal` (never a bare string, which a pipeline would read
     as a field path), keeping oxp.11's denormalised copy self-healing. Same idiom as
     `office-manoeuvre-rank.js`'s existing step route.
   - **`manoeuvre_xp_destroyed` is cumulative across every handover that seat ever sees**, and the
     rate is 1 XP per rank per the ruling's flat "standard merit rate", so the increment is exactly the
     pre-reset rank.
   - **Handing the arithmetic forward, explicitly.** This story stores the counter and does not
     consume it. `office-xp.js`'s `officeXpSpentForCategory` must eventually add
     `manoeuvre_xp_destroyed` to its total or the balance will over-report by the destroyed amount —
     which is the refund the ruling forbids. Nothing renders that number today, so nothing is wrong on
     screen yet. Record this requirement in the Dev Notes, in a comment on the reset code, and in
     oxp.6's `sprint-status.yaml` entry (oxp.6 or oxp.7 is the first real consumer), in the same way
     oxp.11 recorded `holder_id` into this story rather than leaving it to be rediscovered.

7. **`office_merit_dots` is not touched, and this is proved rather than assumed.** A DB-backed test
   sets merit dots on a seat, performs a real handover through the new route, and asserts the seat's
   `office_merit_dots` document is **byte-identical including `updated_at`** afterwards — comparing
   values alone would pass even if something rewrote the same numbers back. The same test asserts the
   manoeuvre rank DID reset in the same operation, so it proves the two collections diverge under one
   event rather than proving only that nothing happened. This is the direct re-proof of oxp.4's
   guarantee against the first code that could actually break it.

8. **`seat_label` is never written by this route.** A test performs a handover on a seat that has a
   `seat_label` (Socialite's "Harpy" / "People's Harpy" are the real cases) and asserts the label is
   unchanged, and that the route's source contains no write to `seat_label` at all. `court_title` goes
   on the CHARACTER and only there. See Finding 3.

9. **`admin/city-views.js`'s court panel is rewired to seat-backed rows.** The panel's slot rows stop
   being ephemeral category rows and become one row per real seat.
   - `initCityView()` fetches `GET /api/office_seats` once into a module-level array, exactly as it
     already does for `terrDocs` (`renderCity`/`renderCourt` are synchronous and must stay that way).
   - `renderCourt()`'s edit panel renders one `.court-slot-row` per seat, ordered deterministically by
     ascending `created_at` then ascending `_id` — the **same ordering oxp.11's `_fallbackSeat` uses**,
     so the admin panel and the office tab never disagree about which seat is "first". Each row carries
     `data-seat-id`, pre-selects that seat's current holder (or "— Vacant —" when `holder_id` is null),
     and shows the seat's `seat_label` when it has one, or a short form of its id when it does not, so
     Primogen's two identically-titled seats are distinguishable. Reuse existing court-panel classes;
     per `specs/project-context.md`, tokens only, no bare hex, no `rgba()`, no inline `style="..."`.
   - A category with NO seat renders an explicit "no seat exists for this office" line rather than an
     empty selectable row that would write nowhere.
   - `saveCourt()` issues **one `PUT /api/office_seats/:seatId/holder` per row whose selected holder or
     title differs from that seat's current state**, and makes **no `PUT /api/characters/:id` call from
     this path at all**. The new route's single call replaces BOTH halves of the current
     implementation: today's clear-pass (`court_category: null` on whoever dropped out) and assign-pass
     (`court_category: category` on whoever came in) are the same reassignment, and step 5 + step 6 of
     AC3 do both atomically. The two-pass loop goes away.
   - The panel re-fetches seats before re-rendering, since `holder_id` has changed.
   - A 409 from AC2's conflict check is surfaced in the existing `#court-save-status` element with the
     server's message, not swallowed. The existing `catch` already writes `'Failed: ' + err.message`;
     confirm `apiPut` surfaces the server's message body and, if it does not, make the conflict legible
     rather than showing a bare status code.
   - **The "+ Add slot" and "remove slot" buttons are removed from the panel**, replaced by a short
     note that seats are provisioned ST-side and that in-app seat creation is not yet built. This is a
     real reduction in what the panel can do and it is deliberate: those buttons currently "create" a
     holding by writing `court_category` to an extra character, which produces a holder with no seat
     behind them — invisible to oxp.2's XP derivation and to oxp.11's purchase-state resolution, i.e.
     exactly the inconsistent data this story exists to stop. Refusing loudly beats producing broken
     records. Flag it to Angelus in the completion notes; see "What this story is NOT".

10. **Tests, and the one existing assertion that must be restated rather than left to rot.**
    - `server/tests/oxp-2-derived-office-xp-calculation.test.js`'s test **"exposes no write verb — this
      story adds a GET and nothing else"** (around line 670) loops `post`/`put`/`patch`/`delete` over
      `/api/office_seats` and expects 404. It will still PASS mechanically, because the new route is at
      `/:seatId/holder` and a bare `PUT /api/office_seats` still matches nothing. **Do not leave it.**
      Its title and its comment ("Seat creation, handover and deletion are other stories' work — oxp.5
      and beyond") become false the moment this story lands. Restate it as what is actually still
      guaranteed — the collection ROOT has no write verb, and the seat-scoped handover route accepts
      only PUT — and strengthen it with assertions that `POST`/`PATCH`/`DELETE` on
      `/api/office_seats/:seatId/holder` are 404 too. Do not weaken it into vacuity.
    - `server/tests/oxp-4-merit-persistence-handover.test.js`'s `repointSeat` helper carries the
      comment "Nothing in the app writes `holder_id` yet [...] so the test does directly what oxp.5
      will eventually do through a route." That becomes false here. **Update the comment only, do not
      rewire the helper**: oxp.4's suite should keep writing the seat directly, so its
      merits-survive-a-handover proof stays independent of this story's route rather than becoming
      circular. Say that in the comment, so the direct write reads as a deliberate independence choice
      instead of a leftover.
    - New suite `server/tests/oxp-5-handover-logic.test.js` covering: the AC1 failure modes (malformed
      seat id 400, unknown seat 404, bad `holder_id` shapes 400, unknown character 404, non-ST 403);
      AC2's refusal, asserting the conflicting seat is named AND that the third document was left
      untouched; AC3's full write sequence end to end, including that `holder_id` is stored as an
      ObjectId and that a failure part-way leaves NOTHING half-applied; **AC3's concurrency guarantee
      via two simultaneous handovers on the same seat through `Promise.all`, asserting exactly one 200
      and one 409 and that the loser destroyed no XP** (the `oaq-2` / `issue-1143` convention — see
      Testing standards); AC4's no-op (no reset, title still applied, `handover: false`, repeat-safe);
      AC5's vacate-destroys; AC6's reset including a seat with no rank document at all (silent success,
      no document minted) and the cumulative counter across two successive handovers; AC7 and AC8's
      non-interference proofs; and the Administrator handover from AC1.
    - **Prove-discrimination is mandatory** on the gates that carry the story, per this epic's
      established bar. At minimum: invert AC6's two pipeline stages and confirm exactly the
      destroyed-counter tests fail; remove AC2's conflict check and confirm exactly the refusal test
      fails; remove the AC4 same-holder branch and confirm exactly the no-op tests fail.
    - Client work is covered by source-contract assertions over `saveCourt`/`renderCourt`, this
      project's established technique — there is no jsdom, and `city-views.js` has no existing unit
      test (only the indirect data-contract precedent in
      `server/tests/api-territories-regent-save.test.js`). Pin at minimum: `saveCourt` contains no
      `/api/characters/` string at all, it reads `data-seat-id`, and it calls the handover route.
    - Run targeted, never the full suite. The changed area is the new suite, `oxp-2-derived-office-xp-
      calculation`, `oxp-4-merit-persistence-handover`, `oxp-11-office-purchase-seat-keying`,
      `oxp-3-office-manoeuvre-rank`, `office-merit-dots`, and `issue-823-test-db-guard`.

## Tasks / Subtasks

- [ ] Task 1 — Server: the handover route (AC: 1, 2, 3, 8)
  - [ ] Read `server/routes/office-actions.js`'s `PUT /:id/accept` (lines ~266-387) in full first and
        mirror its transaction scaffolding exactly: `getClient()`, `startSession()`,
        `withTransaction`, `RouteResponse extends Error`, status/body captured outside the callback,
        `endSession()` in `finally`, response sent after commit. Its inline comments explain WHY each
        piece is shaped that way; do not reinvent the shape from the driver docs.
  - [ ] Add `PUT /:seatId/holder` to `server/routes/office-seats.js` with `requireRole('st')`. No
        `server/index.js` change and no `test-app.js` mount change — the router is already mounted in
        both.
  - [ ] Import `SEAT_ID_PATTERN` from `server/lib/office-seat-resolve.js`; do NOT call
        `resolveOfficeSeat` and do NOT modify that module (Finding 2 — record the reason in a comment
        so a later "tidy-up" does not reintroduce the Administrator refusal).
  - [ ] Extract the seat serialisation the existing `GET /` does inline (`_id`/`holder_id` to strings,
        `notes` redacted for non-ST) into a small local helper used by both handlers, so the response
        this route returns can be dropped straight into the client's cached seat array.
  - [ ] Write `holder_id` as a real `ObjectId` or `null`. Never a string.
  - [ ] Response body: the updated seat, `handover: <bool>`, `previous_holder_id`, and a
        `manoeuvre_reset` object (or null) reporting the seat id, the rank before the reset and the new
        cumulative destroyed total, so the ST can see what the operation actually did.
- [ ] Task 2 — Server: the reset and the destroyed-XP counter (AC: 5, 6, 7)
  - [ ] Read `server/routes/office-manoeuvre-rank.js`'s `PUT /:seatId/step` first — its
        aggregation-pipeline `findOneAndUpdate` with `$ifNull` and its `$literal` category write are
        the exact idioms to copy, and its comments record why each exists.
  - [ ] Implement AC6's two-stage pipeline update with `upsert: false`, inside the transaction.
  - [ ] Comment the stage-ordering dependency at the call site, in the same explanatory register the
        sibling office routes already use.
  - [ ] Comment the handed-forward arithmetic requirement from Finding 1 (that
        `officeXpSpentForCategory` must eventually add this counter or the balance over-reports),
        citing oxp.5 by name the way this codebase's other office comments cite their stories.
  - [ ] Touch `office_merit_dots` nowhere. Confirm by `git diff` that the file is not in the change set.
- [ ] Task 3 — Client: rewire the court panel (AC: 9)
  - [ ] Read `public/js/admin/city-views.js`'s `initCityView` (line 42), `renderCourt` (line 107),
        `_renderSlot` (line 89), the court event wiring (lines 485-516) and `saveCourt` (line 648) in
        full before editing. The add/remove-slot handlers at 495-516 are the ones AC9 removes.
  - [ ] Fetch seats in `initCityView` into a module-level array beside `terrDocs`; keep `renderCity`
        and `renderCourt` synchronous.
  - [ ] Rework `_renderSlot`/`renderCourt` to seat-backed rows with `data-seat-id`, the deterministic
        `created_at`-then-`_id` ordering, the seat-label-or-short-id disambiguator, and the no-seat
        line.
  - [ ] Rework `saveCourt` to one handover call per changed row, no `/api/characters/` call, seats
        re-fetched before the re-render, 409 surfaced legibly.
  - [ ] Remove the add/remove-slot buttons and handlers; add the short explanatory note.
  - [ ] CSS: reuse existing court-panel classes. Only add to `public/css/admin-layout.css` if a new
        element genuinely has no analogue, and then with tokens only.
- [ ] Task 4 — Tests (AC: 10, and every AC above)
  - [ ] New `server/tests/oxp-5-handover-logic.test.js`, DB-backed blocks via
        `describe.skipIf(!dbAvailable)` with `setupDb`/`teardownDb`/`isDbAvailable` from
        `./helpers/db-setup.js`. Follow `oxp-4-merit-persistence-handover.test.js`'s escaped
        fixture-prefix discipline for character cleanup, and oxp.11's rule for `office_seats`: insert
        seats with known explicit `_id`s and delete exactly those. **Never `deleteMany({})` on
        `office_seats`** — `oxp-1`'s, `oxp-2`'s and `oxp-11`'s suites all share it.
  - [ ] Restate `oxp-2-derived-office-xp-calculation.test.js`'s "exposes no write verb" test per AC10.
  - [ ] Update the now-false comment on `oxp-4-merit-persistence-handover.test.js`'s `repointSeat`
        helper per AC10. Comment only; the helper itself stays a direct write, deliberately.
  - [ ] Prove-discrimination on the three gates AC10 names, each as a single change, run alone,
        reverted and re-confirmed green before the next.
  - [ ] Targeted run over the changed area only.
- [ ] Task 5 — Documentation and the record
  - [ ] Update `D:\Terra Mortis\data-map.md`'s `office_seats` entry and its
        `office_merit_dots`/`office_manoeuvre_rank` compound entry: `holder_id` now has a real writer,
        the residual-staleness risk recorded there is closed, and `office_manoeuvre_ranks` gains the
        `manoeuvre_xp_destroyed` field. (Umbrella root, outside this repo — oxp.11's Task 7 set the
        precedent.)
  - [ ] Record in `sprint-status.yaml`'s **oxp-6** entry that `officeXpSpentForCategory` must add
        `manoeuvre_xp_destroyed` before any balance is rendered (Finding 1's handed-forward
        requirement). Do not edit any other story's line.
  - [ ] Record the seat-creation gap from AC9 in the Dev Notes and in this story's own sprint-status
        entry, and flag it to Angelus in the completion notes as a decision he may want to turn into a
        story.

## Dev Notes

### The ruling this story implements (cite it, do not re-derive)

`content/rules/office-powers.md` (umbrella root, `D:\Terra Mortis\content\rules\office-powers.md`),
Angelus's ruling 2026-08-11, §"The pool is institutional, but what it buys is not all institutional":

- "**Permanent merits stay** when the office changes hands."
- "**Manoeuvres reset to zero, and the XP spent on them is lost.** Not refunded, not banked, gone."
- "The running balance is total accrued since creation, minus everything ever spent, **including the
  spend that has since been lost.**" ← Finding 1's authority.
- §"The model, in full", point 4: "On handover, merits stay with the office; manoeuvres reset and
  their XP is lost."

The ruling's own §"Office creation dates" also confirms the multi-seat reality this route must handle:
"They are two distinct seats, held concurrently, each tracking its own accrued XP and its own merit
and manoeuvre purchases from creation."

### Current state of the files this story touches

**`server/routes/office-seats.js`** (50 lines, oxp.2). One handler, `GET /`, returning every seat with
`_id`/`holder_id` stringified and `notes` redacted to null for non-ST callers. Its header comment says
"There is no write verb here at all: [...] Seat creation and handover belong to other stories (oxp.5
and beyond), and the only writer today is the manual seed script oxp.1 shipped." **That comment is what
this story makes false**; rewrite it rather than leaving it, the same way oxp.11 rewrote oxp.4's
now-wrong comments in `office-merit-dots.js`.

**`server/routes/office-actions.js`** (414 lines). `PUT /:id/accept` at lines 266-387 is the
transaction pattern to copy. Note specifically: `RouteResponse` at line 23 with its comment explaining
that `withTransaction` retries only MongoDB-labelled transient errors; the claim-the-record-first
ordering at lines 296-311 and the review-finding comment above it explaining that claiming late let a
concurrent race reach a later write and crash; `matchedCount === 0` → 409 at 310 and 342; and
status/body captured outside the callback at 358-363 with the response sent at 386.

**`server/routes/office-manoeuvre-rank.js`** (128 lines, oxp.3 + oxp.11). `PUT /:seatId/step`'s
aggregation-pipeline `findOneAndUpdate` (lines 113-124) is the reset's direct idiom: `$ifNull`, the
clamp, and `office_category` written as `{ $literal: category }` with a comment explaining that a bare
string beginning with `$` would be read as a field path. `GET /` establishes the "no document = 0"
convention AC6 relies on (`out[doc._id] = doc.rank || 0`).

**`server/lib/office-seat-resolve.js`** (95 lines, oxp.11). Exports `SEAT_ID_PATTERN` and
`resolveOfficeSeat`. Only the pattern is reused here; see Finding 2 for why the resolver is not.

**`server/schemas/office_seat.schema.js`** (123 lines, oxp.1). `additionalProperties: false`;
`required: ['office_category', 'holder_id', 'created_at']`; `holder_id` is a required-but-nullable
24-hex string in the JSON-serialised form (storage is a real ObjectId); `seat_label` and `notes` are
nullable strings. **No schema change is needed** — this route writes only `holder_id`, an existing
field. Its header comment "Handover (a change of `holder_id`) has no behaviour attached [...] reacting
to a CHANGE is oxp.5's job" is another comment this story makes stale.

**`server/schemas/character.schema.js:77-78`**: `court_title` and `court_category`, both plain nullable
strings, `court_category` enum-constrained to the five offices plus `''`/`null`. No history field, no
"since" timestamp. Unchanged by this story.

**`server/routes/characters.js:536`**: `PUT /api/characters/:id`, `requireRole('st')`, runs
`stripEphemeral` → `validateCharacterPartial` → three normalise/validate middlewares, then
`findOneAndUpdate({ _id: oid }, { $set: updates }, { returnDocument: 'after' })`. This story does not
modify it — the handover route writes the character collection directly inside its own transaction,
which is why the middleware chain is bypassed. That is acceptable because the only fields written are
two plain enum/string fields the partial schema already admits, and running an Express middleware chain
from inside a transaction callback is not something this codebase does anywhere. Say so in a comment;
a reviewer will otherwise reasonably ask why the route was not reused.

**`public/js/admin/city-views.js`** (~700 lines). The court panel:
- `initCityView` (42) is the async loader — `chars`, `terrDocs`, cycles, sessions — then calls the
  synchronous `renderCity` (77). The seats fetch belongs here.
- `_renderSlot` (89) builds one row: a `<select>` of every active character keyed by
  `data-court-category`, a `.court-title-input`, and a remove button for every category except Head of
  State (`const multiOk = cat !== 'Head of State'`).
- `renderCourt` (107) renders slots from `active.filter(c => c.court_category === cat)`, falling back
  to a single empty row (`const slots = holders.length ? holders : [null]`). **There is no seat
  identity anywhere in this markup** — a slot row is keyed only by category and DOM order. This is the
  single biggest reason AC9 is a rework rather than a redirect of two URLs.
- The add/remove handlers (495-516) create and destroy DOM rows.
- `saveCourt` (648) collects `{ charId, category, title }` from every `.court-slot-row`, then runs a
  clear-pass (`PUT /api/characters/:id` with `court_category: null` for every active character with a
  `court_category` who is no longer in any slot) followed by an assign-pass (`PUT /api/characters/:id`
  for every slot whose character's category or title differs). Two independent writes per
  reassignment, no atomicity, no reset, no seat awareness.
- Every character is offered in every category's `<select>`, so **the current UI can already put one
  character in two categories in a single save**, writing both and letting the last one win. That is
  exactly the conflict AC2 now refuses.

**`public/js/tabs/office-tab.js`** (oxp.11). `_wirePurchaseState` (217) fetches `GET /api/office_seats`
once per render pass, matches the viewer's own seat by `String(s.holder_id) === String(char._id)`,
falls back via `_fallbackSeat` (271) on ascending `created_at` then `_id`, and sets
`confirmed = held != null || forCategory.length === 1`. **Unchanged by this story**, and it improves
for free once `holder_id` is maintained. AC9's admin ordering must match `_fallbackSeat`'s.

### Why the destroyed-XP counter is not a "stored derived stat"

This project's standing rule is that derived values are never persisted. `manoeuvre_xp_destroyed` is
not a derived value and storing it does not breach the rule. It is a record of an irreversible
historical EVENT: a rank that existed, was spent on, and no longer exists anywhere in current state.
It cannot be recomputed from anything, at any later time, by any means — which is precisely why the
ruling's own balance sentence ("including the spend that has since been lost") cannot be satisfied
without it. The closest existing precedent is `office_seats.created_at` itself: also stored, also not
derivable, and for the same reason.

### Testing standards summary

- vitest, run from `server/`, targeted only per `specs/project-context.md`. Never the full suite.
- DB-backed blocks use `describe.skipIf(!dbAvailable)` with `setupDb`/`teardownDb`/`isDbAvailable`
  from `./helpers/db-setup.js`, forced onto `tm_suite_test` by the vitest setup file. **A skipped
  suite is not a passing suite** — read the summary line, not the exit code. Most of this story's ACs
  are DB-backed, so a run where they skipped is not evidence anything holds.
- `server/vitest.config.js` sets `fileParallelism: false` and `singleFork: true`, so suites cannot
  interleave. That is what makes shared-collection fixtures workable; it is not licence to
  `deleteMany({})` a collection three other suites use.
- **Transactions work in this test environment, and the reason is worth knowing.** MongoDB
  transactions need a replica set, and a standalone `mongod` rejects them outright ("Transaction
  numbers are only allowed on a replica set member or mongos"). This repo never runs against a
  standalone: `server/db.js` hard-codes `tls: true` and the URI is an Atlas `mongodb+srv://` cluster,
  and `tests/helpers/setup-env.js` redirects only the DATABASE NAME (`MONGODB_DB = 'tm_suite_test'`),
  never the cluster. So `tm_suite_test` is a database on the same Atlas replica set as production and
  transactions are available identically. There is no `mongodb-memory-server` dependency, no local
  mongod, and no replica-set detection helper anywhere in the repo.
  - **`isDbAvailable()` is a CONNECTIVITY skip, not a transaction-support skip.** It just tries
    `setupDb()` and returns false if it throws. If someone ever pointed `MONGODB_URI` at a standalone,
    it would return `true` and this story's tests would fail hard rather than skipping. That is a real
    unguarded assumption in the harness; do not try to fix it here, but say so in the Dev Agent Record
    if it bites.
  - **The existing precedents do not gate on transactions at all.**
    `server/tests/oaq-2-pending-status-actions.test.js` drives the real transactional accept route over
    Supertest with only `describe.skipIf(!dbAvailable)`, and
    `server/tests/otc-2-office-actions-api.test.js` does not even use that. Mirror that posture.
  - Do NOT restructure the route to avoid a transaction because the tests look awkward. Atomicity
    across three collections is the point of the story.
- **Proving the transaction actually holds — the established convention is a `Promise.all` race.**
  `oaq-2-pending-status-actions.test.js` (AC8, ~lines 334-391) fires two concurrent real HTTP accepts
  and asserts `[r1.status, r2.status].filter(s => s === 200).length === 1`;
  `server/tests/issue-1143-office-actions-auth-safety.test.js` runs two 10-iteration race loops (each
  with an explicit `, 20000` timeout) asserting zero double-wins and zero lost updates, and its
  comments are the best statement in this codebase of why a blind `$set` inside a transaction is NOT
  enough on its own. Read both before writing AC3's concurrency coverage. Two simultaneous handovers
  on the SAME seat must produce exactly one 200 and one 409, and the losing side must have destroyed
  no XP.
- **Fixture conventions to follow exactly** (both established, both load-bearing):
  - **Seats**: namespaced, deterministic `_id`s so cleanup can never reach another suite's fixtures.
    `oxp-4` uses `const seatId = n => new ObjectId(\`0f11${'0'.repeat(16)}${String(n).padStart(4,'0')}\`)`
    with the 41-43 range; `oxp-3` uses the same helper with 31-34. **Claim a fresh decade for this
    suite** (51+), and delete strictly by `{ _id: { $in: SEAT_IDS } }`.
  - **Characters**: seed through the real `POST /api/characters` as `stUser()` with a name prefix, and
    clean up with a **pre-escaped** regex built once at module scope
    (`FIXTURE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`), per oxp-4's own review finding. There is
    no shared test-character helper suitable for this: `getTestCharacterIds` reuses whatever already
    exists and seeds bare stubs with no `court_category`, and
    `helpers/apply-derived-merits-snapshot.js` builds in-memory objects that never reach MongoDB.
  - `stUser()` / `playerUser([ids])` from `helpers/test-app.js` are the auth headers; `mockAuth` reads
    `X-Test-User` and JSON-parses it into `req.user`.
- No jsdom in this project. Client behaviour is pinned by source-contract assertions (AC10) or through
  exported pure builders. `city-views.js` has no existing unit test at all; the nearest precedent is
  `server/tests/api-territories-regent-save.test.js`, a server-side data-contract guard written
  specifically for what `city-views.js` writes. That is the right shape for the bulk of AC9's coverage.
- Known pre-existing condition on `main`, neither caused by nor fixed by this story:
  `server/tests/oxp-1-office-seats.test.js` does not load at all (the `#!/usr/bin/env node` shebang in
  `seed-office-seats.mjs` breaks vitest's transform, so 41 tests are silently unrun). Do not report it
  as a regression and do not claim a clean gate without accounting for it. **Do not give any new file
  a shebang.**

### Project Structure Notes

- New: `server/tests/oxp-5-handover-logic.test.js`.
- Modified: `server/routes/office-seats.js` (the new route plus the now-false header comment),
  `public/js/admin/city-views.js`, `server/tests/oxp-2-derived-office-xp-calculation.test.js`,
  `specs/stories/sprint-status.yaml`, and `D:\Terra Mortis\data-map.md` (umbrella root, outside this
  repo).
- Possibly modified: `public/css/admin-layout.css`, only if AC9's seat label or no-seat line genuinely
  has no existing analogue in the court panel's classes. Check first.
- Unchanged, and deliberately so: `server/index.js` and `server/tests/helpers/test-app.js` (the router
  is already mounted in both), `server/lib/office-seat-resolve.js`, `server/schemas/office_seat.
  schema.js`, `server/schemas/character.schema.js`, `server/routes/characters.js`,
  `server/routes/office-merit-dots.js`, `public/js/tabs/office-tab.js`, `public/js/data/office-xp.js`.
- British English throughout. `CLAUDE.md`'s no-em-dash rule scopes to **app-authored strings and
  player-facing prose specifically** — code comments, test descriptions and story documents are
  developer-facing, not app output, and every prior story in this epic uses em-dashes freely in them
  (oxp-1's story alone has 67; oxp-11's overstated this rule and had to be corrected by its own Codex
  review). AC9's admin-facing copy (the no-seat line, the seat-provisioning note) IS app-authored text
  and must follow the rule.

### References

- `content/rules/office-powers.md` (umbrella root) — §"The pool is institutional...", §"The model, in
  full", §"Office creation dates". The authoritative ruling; Finding 1's balance sentence lives here.
- `specs/stories/oxp-1-data-lock-office-seat-schema.md` — the `office_seats` collection, the seven real
  seats, the "seat outlives its holder" principle, and its own Dev Notes flagging the
  `court_category`/`holder_id` link as an open design question this story answers.
- `specs/stories/oxp-2-derived-office-xp-calculation.md` — `office-xp.js`'s derived-spend formula
  (which Finding 1 shows this story's reset would otherwise refund), and AC6/AC7's read-only
  `GET /api/office_seats` route this story adds a write verb beside. Its test file carries the
  assertion AC10 restates.
- `specs/stories/oxp-3-manoeuvre-purchase-graduated-merit.md` — `office_manoeuvre_ranks`' shape, the
  atomic aggregation-pipeline step route AC6's reset copies, and the "no document = 0" convention.
- `specs/stories/oxp-4-merit-purchase-persists-handover.md` — the merits-persist guarantee AC7
  re-proves against the first code that could break it, and its `updated_at`-not-just-values assertion
  discipline, which AC7 reuses.
- `specs/stories/oxp-11-office-purchase-seat-keying.md` — this story's hard prerequisite. Its "Why this
  story exists" and Dev Agent Record both record `holder_id` as a hard requirement of oxp.5;
  `_wirePurchaseState`/`_fallbackSeat`'s ordering is what AC9 must match; its `office_seats` fixture
  discipline is what AC10's tests must follow.
- `server/routes/office-actions.js` — the transaction pattern, in full, including the review-finding
  comments explaining the claim-first ordering.
- `D:\Terra Mortis\data-map.md` — the `office_seats` and `office_merit_dots`/`office_manoeuvre_rank`
  entries, including the residual `holder_id` staleness risk this story closes, and Known Drift
  Pattern #2 (mixed string/ObjectId foreign keys) that AC3's ObjectId requirement guards against.
- `specs/project-context.md` — CSS token discipline, targeted-tests-only.
- 2026-08-13 chat, Angelus's two scoping rulings quoted verbatim in "Why this story exists".

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Senior Developer Review

## Change Log

| Date | Change |
|------|--------|
| 2026-08-13 | Story created. Scope settled directly with Angelus before ACs were written: ONE new transactional route keeping `court_category` and `office_seats.holder_id` in sync rather than deriving `court_category` (the smaller option, leaving every existing read site untouched), and a rewire of `admin/city-views.js`'s existing court-slots panel to call it so an ST cannot bypass the reset through the familiar control. Three findings from this story's own investigation changed the work: (1) the reset, implemented the obvious way, would REFUND the destroyed XP, because oxp.2 derives spend from the current rank — the ruling's own "including the spend that has since been lost" clause requires a cumulative `manoeuvre_xp_destroyed` counter captured at reset time, since the information exists nowhere else and is unrecoverable afterwards; the arithmetic itself is handed forward to oxp.6/oxp.7 rather than wired here; (2) `resolveOfficeSeat()` cannot be reused, because it 400s any seat whose office has no `OFFICE_DATA` entry (which would make the real, filled Administrator seat un-handoverable until oxp.8) and takes no session, so only its `SEAT_ID_PATTERN` is reused; (3) `court_title` lives on the character and `seat_label` on the seat, and they are not equivalents — the route must never write `seat_label`. Investigation also found that `city-views.js`'s court panel has NO seat identity at all (a slot row is keyed only by category and DOM order), making AC9 a rework to seat-backed rows rather than a redirect of two URLs, and that its "+ Add slot" affordance currently produces holders with no seat behind them, so it is removed rather than rewired — leaving in-app seat creation as a real gap with no story home yet, flagged for Angelus. `oxp-2-derived-office-xp-calculation.test.js`'s "exposes no write verb" assertion was found to still pass mechanically while its title and comment become false, so AC10 restates and strengthens it rather than leaving it to rot. |
