# Story prax.4a: People's Harpy resolve

## Story

As the ST running Praxis night,
I want to declare a winner (or dismiss the vote) for the People's Harpy tally with one tap,
So that the seat handover, the office-power consequences, and the historical record all land
together, without a separate trip through the Court panel.

## Why this story exists

Full epic context: `specs/epic-prax-praxis-claim-harpy-vote.md` (this story's own row is the
authoritative scope statement). Depends on prax-3 (done — the Harpy tab this story adds a resolve
action to). Independent of prax-0 entirely — Head of State's dual-seat mechanics have no bearing on
a plain Socialite handover. Independent of prax-4b too (that story's own "City Harpy" `seat_label`
rename only touches the OTHER Socialite seat, currently labelled plain "Harpy" — this story's own
target, "People's Harpy", is untouched by it).

### Design-lock (locked 2026-08-29, confirmed by Angelus)

`specs/mockups/prax-4a-harpy-resolve/index.html` — rendered and reviewed before lock. Four states:
the live board with a new "Declare Winner" action per claimant card and a "Dismiss vote" board-level
action; a toast right after resolving; the resolved summary (winner or dismissed) replacing the live
Harpy pool/claimants section once `resolved.harpy` is set; the Praxis tab stays fully live and
untouched throughout (only Harpy is resolved by this story — prax-4b owns Praxis).

**Four things asked at lock, resolved as follows:**

1. **"Declare Winner" wording** — kept as the working label (Angelus: not important, will react to
   it once built).
2. **Dismiss has no confirm modal**, same posture as Declare Winner (confirmed).
3. **Toast**: auto-dismisses after 6 seconds. Nothing else dismisses it early (no click-elsewhere) —
   a mis-tap on the board underneath while the toast is up must not silently swallow it. This
   story's own call, a minor UX default, not asked in detail.
4. **No Undo.** Explicitly dropped (Angelus: "I can always manually change offices. Don't give too
   much control to this situation."). The toast is pure confirmation — a message naming the outgoing
   and incoming holder, no action button. A mistaken resolve is corrected by hand afterwards through
   the existing Court panel (`PUT /api/office_seats/:seatId/holder`, already live), not through a
   dedicated reversal path. **This removes what would otherwise have been the story's single riskiest
   piece** — a real Undo would have needed to precisely reverse `resetManoeuvreRank()`'s own
   destroyed-XP counter to be safe at all, and a half-correct reversal would have been worse than no
   reversal.

### A second decision, made during this story's own scoping, not at the mockup stage

**`resetManoeuvreRank()` is extracted out of `office-seats.js` into a new shared module,
`server/lib/reset-manoeuvre-rank.js`, in THIS story — one story earlier than prax-4b's own epic row
originally anticipated ("Exports `resetManoeuvreRank`... into shared modules... this is the third
caller").** Confirmed with Angelus directly before writing this spec (he chose "extract now" over
duplicating it). Reasoning: the epic doc's own prax-4a row says this story "calls the existing
`PUT /api/office_seats/:seatId/holder` route as-is", but ALSO needs the seat handover and the
`praxis_sessions.harpy.resolved` snapshot in the SAME transaction — and this codebase's own
established convention (confirmed in `office-seats.js`'s own header comments on why it does not
nest-call `PUT /api/characters/:id`, and in how prax-4b's own row is written) is that atomicity
across collections is achieved by writing them directly inside one transaction, never by one route
calling another over HTTP. So this story cannot literally call the existing PUT route — it has to
reimplement the seat-claim steps inline, inside its own transaction, reusing the SAME logic that
route already got right. `resetManoeuvreRank` is real, previously-buggy arithmetic (its own doc
comment: "STAGE ORDER IS LOAD-BEARING... swap these two and the counter silently records 0 destroyed
on every handover, forever, with no error") — not safe to duplicate even temporarily, unlike the
six-line `RouteResponse` class (which this story DOES duplicate locally in `praxis-sessions.js`,
matching that class's own established "safe to copy, not worth lifting for two callers" convention).

## Locked rulings this story must honour (see prax-1/2/3's own stories + the epic doc, do not
re-litigate)

- **Never player-visible.** Same ST-only posture as every other Praxis surface.
- **Target seat**: `office_seats` document with `office_category: 'Socialite'` AND
  `seat_label: "People's Harpy"` (straight apostrophe, matching the real seeded data — confirmed
  live via `SEATS` fixtures already used in `tests/prax-2-claim-board.spec.js` and the badge-lookup
  logic already shipped in `praxis-tab.js`'s own `PEOPLES_HARPY_SEAT_LABEL` constant. Reuse that
  exact constant rather than a second string literal).
- **Manoeuvre ranks reset on this handover**, exactly like every other office handover
  (office-powers.md's ruling, already implemented once in `resetManoeuvreRank` — reused, not
  reinterpreted).
- **Permanent merits survive the handover** (they always do — a seat's own `_id` never changes,
  `office_merit_dots` is untouched by this story, same as the original PUT route never touches it).
- **A character who already holds a different seat cannot be declared winner** — same AC2 refusal
  the existing PUT route already enforces (409, naming the conflicting seat), reimplemented here for
  the same reason.
- **The Praxis tally is completely unaffected.** This story writes only `resolved.harpy` (never
  `resolved.praxis`) and only ever touches the People's Harpy seat. Nothing here reads or writes
  `praxis.claims`/`praxis.support`.

## What this story is NOT

- **Not** Undo, in any form — explicitly dropped at design-lock (see above).
- **Not** the Praxis/Head of State resolve — prax-4b's own story, its own transaction, its own much
  larger mass-clear. This story never touches Enforcer, Administrator, or the seat currently labelled
  plain "Harpy".
- **Not** the "City Harpy" `seat_label` rename — that is prax-4b's own precondition, touching the
  OTHER Socialite seat. This story's target seat_label, "People's Harpy", is unchanged by it.
- **Not** a change to `office_merit_dots`, `office-manoeuvre-rank.js`'s own step route, or any other
  office-purchase surface. Only the seat's `holder_id`, the two characters' `court_category`/
  `court_title`, and the manoeuvre-rank document move.
- **Not** a change to prax-1's `GET`/`POST`/claims/support routes, or to prax-2/prax-3's own client
  code beyond the additions this story's ACs name explicitly (the new resolve/dismiss actions and the
  resolved-summary render branch). The live claim/support flow is untouched for as long as
  `resolved.harpy` stays null.

## Acceptance Criteria

**Extraction (`server/lib/reset-manoeuvre-rank.js`, new)**

1. `resetManoeuvreRank(seatId, category, timestamp, dbSession)` moves out of `office-seats.js`
   verbatim — same signature, same body, same doc comment (the whole comment block explaining the
   destroyed-XP counter and the load-bearing stage order survives the move unedited; it is exactly as
   true in its new home). `office-seats.js` imports it from the new module and its own local copy is
   deleted. **Zero behavioural change** — this is a pure move. Every existing `office-seats.js` test
   that exercises a handover must pass unmodified.

**New route (`server/routes/praxis-sessions.js`)**

2. `POST /api/praxis_sessions/:id/resolve-harpy` — ST-only. Body: `{ claimant_character_id: <24-hex
   string> | null }` (`null` = dismiss, no winner). Absent key is a 400 (same "absent vs explicit
   null are different requests" discipline this file's own `PUT /support` already established for
   `claimant_character_id`).
3. 404 if the board id doesn't exist. 409 if `resolved.harpy` is already non-null — this route can
   run exactly once per board, CAS-enforced: the existing value is read as a baseline OUTSIDE the
   transaction, and the write inside the transaction is filtered on that same baseline still holding,
   mirroring `office-seats.js`'s own baseline-then-filter pattern (a concurrent resolve attempt fails
   cleanly as a 409 rather than double-writing).
4. **Dismiss path** (`claimant_character_id: null`): writes
   `resolved.harpy = { dismissed: true, resolved_at: <ISO> }` on the `praxis_sessions` document.
   No seat write, no character write, no `resetManoeuvreRank` call. Single-document transaction (the
   dismiss path does not need a multi-collection one, but still goes through the same route and the
   same CAS discipline as the resolve path, so a caller cannot distinguish "safe to retry" from
   "already handled" by which branch fired).
5. **Resolve path** (`claimant_character_id` is a real id): 400 if that character does not have a
   currently OPEN claim in `harpy.claims` (cannot declare a winner who was never standing). Inside
   ONE transaction:
   - Look up the People's Harpy seat (`office_category: 'Socialite'`,
     `seat_label: PEOPLES_HARPY_SEAT_LABEL`). 500 with a clear message if it does not exist (a
     seeding gap, not a normal runtime state — this seat is created by `seed-office-seats.mjs` and
     assumed to always exist, same assumption `office-seats.js`'s own handover route makes about
     every seat it is asked to touch).
   - CAS-claim the seat: baseline `holder_id` read outside the transaction, `updateOne` inside it
     filtered on that baseline, `$set: { holder_id: <winner ObjectId> }`. 409 on a lost race
     ("This seat was changed by another handover - please retry"), matching the existing route's own
     wording.
   - If there was a previous holder: clear their `court_category`/`court_title` to `null`, CAS-filtered
     on `court_category: 'Socialite'` (a no-op, not an error, if it had already moved elsewhere by
     another route in between — same benign-mismatch handling the existing route documents).
   - Set the winner's `court_category: 'Socialite'`, `court_title: "People's Harpy"` (an explicit,
     specific title — NOT the generic `category` fallback the existing PUT route defaults to when no
     `court_title` is supplied. This route never collects a custom title from the ST, so it supplies
     the one that actually describes what was just won, rather than leaving a Socialite office-holder
     titled merely "Socialite". A deliberate, minor improvement over the generic default, not a
     literal port of that route's own title-resolution function).
   - `resetManoeuvreRank(String(seat._id), 'Socialite', timestamp, dbSession)`.
   - `resolved.harpy = { winner_character_id: <winner id, 24-hex lower-case string>, final_tally:
     <the harpy headcount at resolve time, computed the SAME way praxis-tab.js's own tallyFor already
     does — count of harpy.support entries pointing at the winner>, resolved_at: <ISO> }`, written
     on the `praxis_sessions` document, in the SAME transaction as the seat/character/manoeuvre
     writes above.
6. Response body (both paths): `{ ok: true, dismissed: <bool>, resolved: <the written resolved.harpy
   object> }`. No seat/character data in the response — the client already holds every character's
   current data and re-fetches the board via its own established `write()` pattern; duplicating name
   resolution server-side would be a second implementation of something `nameFor()` already does
   client-side.
7. `harpy.claims`/`harpy.support` are NOT cleared or mutated by either path. The board keeps its full
   historical claim/support data forever, alongside the frozen `resolved.harpy` snapshot — this story
   adds a read-only summary of it, not a wipe.

**Client (`public/js/admin/praxis-tab.js`)**

8. Each Harpy claimant card gets a new "Declare Winner" action, rendered only when
   `_activeTally === 'harpy'` AND `_board.resolved.harpy === null`. Tapping it calls the new route
   with that claimant's id, then re-fetches and re-renders via the existing `write()` helper (no
   confirm modal — locked at design-lock).
9. A new "Dismiss vote" text action, rendered next to the "Claimants" label, same visibility
   condition as AC8 (Harpy tab active, `resolved.harpy` still null). Tapping it calls the route with
   `claimant_character_id: null`.
10. On either action's success, show a toast (new, simple, message-only — no action button, per the
    locked "no Undo" decision) naming the outcome: resolve reads
    `"<Winner> is now People's Harpy.<newline><Outgoing> vacated."` (the second line omitted entirely
    when there was no previous holder); dismiss reads `"People's Harpy vote dismissed. No winner
    recorded."`. Auto-dismisses after 6 seconds, nothing else dismisses it early (locked at design-lock,
    item 3 above).
11. When `_board.resolved.harpy` is non-null, the Harpy tab's pool strip AND claimants section are
    replaced by a resolved-summary card: for a real winner, the winning name, their final tally, and
    the resolve date; for a dismissal, "No winner declared" and the date. The segmented control and
    the summary row (both tallies' current leaders) stay exactly as prax-3 built them — this AC only
    replaces the LIVE-INTERACTION section of the Harpy tab, not the header or the summary row above
    it. Switching to the Praxis tab shows the full, untouched, still-fully-live board exactly as
    prax-2/3 shipped it.
12. Neither the pool strip nor the sheet ever appears on a resolved Harpy tab — there is nothing left
    to assign once `resolved.harpy` is set. Tapping a claimant's own bottom-sheet trigger (were one
    somehow still visible) must not be reachable; AC11's replacement already prevents this structurally
    by not rendering the pool/claimants markup at all when resolved.

**CSS**

13. New classes for the "Declare Winner" button (`.claim-resolve`), the "Dismiss vote" text action
    (`.dismiss-vote`), the resolved-summary card (`.resolved-summary` plus `.won`/`.abandoned`
    modifiers), and the toast (`.toast`, fixed-position, no undo button — simpler than the locked
    mockup's own undo-toast markup, since AC10 dropped the button). Added to
    `public/css/admin-layout.css` in the SAME `.praxis-board`-scoped block prax-2/3 already built,
    `var(--token)`-only, matching the locked mockup's own colours (the toast's dark background is the
    one deliberate exception to the `.praxis-board`-scoped convention, since — like the mockup itself
    notes — it must be fixed to the viewport, not the board, to survive whatever the board re-renders
    into underneath it while it is showing).

## Tasks / Subtasks

1. Read `office-seats.js`'s `PUT /:seatId/holder` handler in full (already done during this story's
   own scoping — re-read it anyway before writing code, since exact CAS ordering matters) and
   `resetManoeuvreRank`'s own doc comment in full before moving it.
2. Extract `resetManoeuvreRank` to `server/lib/reset-manoeuvre-rank.js` (AC1). Run
   `office-seats.js`'s existing test suite immediately after, before writing anything else, to prove
   the move is behaviour-preserving in isolation.
3. Write the new `POST /:id/resolve-harpy` route (AC2-AC7).
4. Write a new test file, `server/tests/prax-4a-peoples-harpy-resolve.test.js`, covering: the dismiss
   path; the resolve path's full seat/character/manoeuvre-rank writes (including the destroyed-XP
   counter itself — a test pins the exact value, not just that resetManoeuvreRank was called); the
   idempotency 409 on a second resolve attempt; the "claimant not currently standing" 400; the
   already-holds-a-different-seat 409 (AC's own "locked rulings" conflict case); atomicity (an
   injected failure between the seat write and the `resolved.harpy` write, proving neither lands —
   same technique `cm-4a-phase-transition-enforcement.test.js` already uses for its own tracker-wipe
   atomicity probe).
5. Add the client-side actions, toast, and resolved-summary render branch to `praxis-tab.js`
   (AC8-AC12).
6. Write the new CSS (AC13), matching the locked mockup.
7. Extend `tests/prax-2-claim-board.spec.js` again (not fork) with a new `describe` block covering:
   Declare Winner posts the right body and shows the resolved summary; Dismiss does the same for the
   no-winner case; the toast text and its auto-dismiss timing; the Praxis tab staying fully
   interactive after Harpy resolves.
8. Run both suites, plus `office-seats.js`'s own existing tests one more time as a final regression
   check on the extraction, plus a stash A/B against the same admin-shell/CSS-ratchet specs prax-2/3's
   own reviews already established as the right regression set for this area.

## Dev Notes

### Files this story touches

- `server/lib/reset-manoeuvre-rank.js` — NEW (AC1).
- `server/routes/office-seats.js` — one import line added, the local `resetManoeuvreRank` function
  deleted. Nothing else in this file changes.
- `server/routes/praxis-sessions.js` — new route (AC2-AC7). Reuses the file's own existing
  `RouteResponse` class, `col()` accessor, and `broadcastPraxisUpdate` (call it at the end of a
  successful resolve/dismiss, exactly like every other write route in this file already does — this
  story adds a 4th call site, not a new broadcast pattern).
- `public/js/admin/praxis-tab.js` — the client additions (AC8-AC12).
- `public/css/admin-layout.css` — new classes (AC13).
- `server/tests/prax-4a-peoples-harpy-resolve.test.js` — NEW.
- `tests/prax-2-claim-board.spec.js` — extended, not forked.

### Reuse precedents (read before writing new code)

- `server/routes/office-seats.js`'s `PUT /:seatId/holder` — the exact steps this story's resolve
  path reimplements inline: CAS-claim-first ordering, baseline-outside-transaction, clear-departing/
  set-incoming, the AC2-shaped "already holds a different seat" 409. Read the WHOLE route, not just
  the handover branch — the same-holder branch's "repair rather than error" logic doesn't apply here
  (a Harpy resolve is always a genuine handover or nothing at all), but understanding why it exists
  helps avoid reintroducing the staleness bug it was written to fix.
- `server/routes/praxis-sessions.js`'s own existing routes (prax-1) — `RouteResponse`, `normaliseId`,
  the CAS pattern in `POST /:id/claims`'s own duplicate-claim guard, `broadcastPraxisUpdate`'s call
  sites. This story's new route belongs in this file, follows its conventions exactly, and is this
  file's 6th route.
- `public/js/admin/praxis-tab.js`'s own `PEOPLES_HARPY_SEAT_LABEL` constant (already exported... no,
  module-local — reused as the source of truth for the seat_label string on the CLIENT side; the
  SERVER route needs its own copy of the same literal, since nothing currently exports it across the
  client/server boundary and inventing a shared-constants module for one string is not warranted
  here).
- `server/tests/cm-4a-phase-transition-enforcement.test.js`'s own atomicity-probe technique (inject a
  failure partway through a transaction via `vi.mock`, assert neither write landed) — the closest
  existing precedent for this story's own Task 4 atomicity test.

### Testing standards summary

- `cd server && npx vitest run tests/prax-4a-peoples-harpy-resolve.test.js` — needs a local `mongod`
  (real DB, real transaction, same as `office-seats.js`'s own oxp.5 tests and prax-1's own suite).
- Re-run `office-seats.js`'s own existing test file after the extraction (Task 2) — this is not
  optional, it is the direct proof the move was behaviour-preserving.
- `npx playwright test tests/prax-2-claim-board.spec.js` — never run two Playwright invocations
  concurrently (root `CLAUDE.md`).
- No jsdom in this repo — Playwright is the real client-side coverage, per every prior PRAX story's
  own precedent.

## Dev Agent Record

*(filled in during dev-story)*

## Senior Developer Review

*(filled in during the independent review pass)*

## Change Log

- 2026-08-29 — Story created (`/bmad-loop prax-4a`), design-lock done and confirmed by Angelus first
  (`specs/mockups/prax-4a-harpy-resolve/index.html`). Undo dropped entirely at lock (Angelus:
  manual correction via the existing Court panel is enough). `resetManoeuvreRank` extraction timing
  (now, not at prax-4b) confirmed with Angelus directly during scoping, ahead of writing this spec.
  Depends on prax-3 (done). Branch `ms/prax-4a-peoples-harpy-resolve`, cut from
  `ms/prax-3-harpy-board-segmented-control`.
