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

Implemented 2026-08-30 (`/bmad-epic-loop prax`, Opus subagent, orchestrator-supervised).

**Files touched** (matches Dev Notes exactly, no surprises): `server/lib/reset-manoeuvre-rank.js`
(new, 130 lines), `server/routes/office-seats.js` (+7/-102), `server/routes/praxis-sessions.js`
(+324/-7), `public/js/admin/praxis-tab.js` (+247/-1), `public/css/admin-layout.css` (+86),
`server/tests/prax-4a-peoples-harpy-resolve.test.js` (new, 39 tests), `tests/prax-2-claim-board.spec.js`
(extended, +11 tests).

**Deviations from the spec's literal text** (all reviewed, all correct):
- Toast markup carries both `praxis-toast` and the locked `toast` class name, but the stylesheet
  selects `.praxis-toast` only — the same "keep the locked name in markup, scope the selector"
  compromise prax.2's own block already made for `.sheet`/`.claim-card`, applied consistently.
- Dismiss button reads "Dismiss vote (no winner)" (the mockup's own copy), a superset of AC9's
  shorter paraphrase, not a contradiction of it.
- Two additions beyond the AC list, both matching the precedent route's own established behaviour:
  a 404 when the declared winner has no `characters` document (prevents handing the seat to an id
  whose `court_category` write would silently match nothing), and skipping the departing-holder clear
  when the departing holder IS the winner (an incumbent re-elected — removes a load-bearing write
  ordering rather than relying on it).
- `refreshSeats()` added client-side after a successful resolve (not in the ACs) — without it the
  Praxis tab's "vacates on win" badge would keep naming the OUTGOING holder for the rest of the
  session. Deliberately re-fetches `/api/office_seats` only, not `/api/characters` (AC8's own
  no-second-characters-fetch rule).
- Two mockup CSS values had no real token behind them and were resolved through `theme.css` rather
  than reproduced ad hoc: `--green3-a15` → `--green4-a15` (same alpha, theme-aware), and the toast's
  `rgba(0,0,0,.25)` shadow → `--overlay` (already used by prax.2's own sheet shadow).

**Test results** (independently re-run by the orchestrator, not trusted from the subagent's own
report):
- `prax-4a-peoples-harpy-resolve.test.js`, run in isolation (its own header documents why — a shared
  natural-key collision with `oxp.5`'s fixtures): **39/39 passed**.
- `oxp-5-handover-logic.test.js` + `oxp-1-office-seats.test.js`, `oxp-4-merit-persistence-handover.test.js`,
  `oxp-11-office-purchase-seat-keying.test.js`, `oxp-3-office-manoeuvre-rank.test.js` — the
  `resetManoeuvreRank` extraction's own regression set: **95/96 + 82/82 passed**. The one failure
  (`oxp-1`'s "does not duplicate a seat when several applies overlap in flight", expects 7 got 8) is
  **pre-existing at base** — `git stash` A/B confirmed identical failure with none of this story's
  changes present, in isolation (not a parallel-run contention artefact).
- `tests/prax-2-claim-board.spec.js` (Playwright): **37/37 passed** (26 pre-existing prax.2/prax.3 +
  11 new prax.4a).
- `gdx-4-css-standards-grep.test.js`: 30/31, the one failure is the already-documented
  `main`-level `suite.css` pre-existing issue (root `CLAUDE.md`'s own known-failures list) — asserts
  on a file this story never touches.
- `issue-830-inherited-card-css.test.js`: 2/4, both failures pre-existing (asserts `font-size: 10|11px`
  on rules an earlier, unrelated story converted to `rem`) — not on `CLAUDE.md`'s list yet, confirmed
  unrelated to this story's own CSS (different selectors entirely).
- Visual verification: a throwaway Playwright screenshot script (not committed) rendered the live
  Harpy tab (Declare Winner per card, Dismiss vote text action), the confirmation toast, and the
  resolved-summary card, all against the real admin shell and real theme tokens. Matches the locked
  mockup. Not re-verified in dark mode (the throwaway script's theme-toggle guess was wrong — wrong
  localStorage key — not worth a second pass given every colour in AC13's CSS block resolves through
  a `theme.css` token confirmed present in both the light and dark blocks).

## Senior Developer Review

Independently re-verified 2026-08-30 by the orchestrator (inline 3-lens pass: Blind Hunter, Edge Case
Hunter, Acceptance Auditor). All 13 ACs checked against the actual diff, not the subagent's own
self-report. `resetManoeuvreRank`'s extraction confirmed byte-identical against `office-seats.js`'s
prior version (diffed directly). Every CSS token in AC13's new block confirmed to exist in
`theme.css`. The route's own CAS/transaction discipline cross-read line-by-line against
`office-seats.js`'s own `PUT /:seatId/holder` (the precedent it reimplements) and found faithful,
including the subtler point that a stale outer-scope `baselineHolderId` can never desync from the
in-transaction `currentHolderId` without MongoDB itself raising a write-conflict retry first.

**No High or blocking Medium findings.** Two items triaged as DEFER (not patched — both are genuine,
neither is urgent, and fixing either would mean touching files this story's own "What this story is
NOT" section explicitly scoped out):

1. **(Medium) prax-1's `POST /:id/claims`, `DELETE /:id/claims/:characterId` and `PUT /:id/support`
   have no guard against `resolved.<tally>` being non-null.** A stale ST browser tab (or a direct API
   call) can still open/withdraw a Harpy claim or reassign Harpy support after `resolved.harpy` is
   set. The frozen snapshot itself (`winner_character_id`/`final_tally`) is untouched by this — only
   the live `harpy.claims`/`harpy.support` arrays underneath it can drift after the fact, which cuts
   against the "frozen historical record, kept forever" framing this story's own code comments use
   throughout. Low real-world likelihood (needs two concurrent ST sessions, one stale) on an ST-only
   surface. Deferred to `deferred-work.md` for prax-4b's own awareness (same file, natural companion
   fix if ever picked up).
2. **(Low) `resetManoeuvreRank` fires unconditionally on the resolve path, including when the
   declared winner is the SITTING holder being re-elected** — unlike the original `PUT /holder`
   route, which treats a same-holder request as NOT a handover and skips the reset entirely. This is
   what AC5's literal text specifies, and the test suite confirms it does exactly that (`'the SITTING
   People's Harpy re-winning is NOT a conflict'` — tests the handover succeeds, does not assert on the
   rank). Whether a genuine re-election is a fresh "tenure" (reset makes sense) or a continuation
   (reset is a hidden Angelus-hasn't-decided-on-it surprise) is a real game-rules judgement call the
   design-lock never addressed. Implemented per the AC as written; flagged rather than silently
   decided either way.

Both deferred items logged to `specs/deferred-work.md`. Status: **done**.

## Change Log

- 2026-08-29 — Story created (`/bmad-loop prax-4a`), design-lock done and confirmed by Angelus first
  (`specs/mockups/prax-4a-harpy-resolve/index.html`). Undo dropped entirely at lock (Angelus:
  manual correction via the existing Court panel is enough). `resetManoeuvreRank` extraction timing
  (now, not at prax-4b) confirmed with Angelus directly during scoping, ahead of writing this spec.
  Depends on prax-3 (done). Branch `ms/prax-4a-peoples-harpy-resolve`, cut from
  `ms/prax-3-harpy-board-segmented-control`.
