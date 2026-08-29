# Story prax.4b: Head of State resolve

## Story

As the ST running Praxis night,
I want to declare a Praxis winner (or dismiss the vote) with a clear confirmation of everyone it
affects, so that the seat mass-clear, the winner's own office consequences, and the historical
record all land together atomically, without a separate trip through the Court panel per vacated
seat.

## Why this story exists

Full epic context: `specs/epic-prax-praxis-claim-harpy-vote.md` (this story's own row is the
authoritative scope statement, though see the corrections below against what prax-0/1/2/3/4a
actually shipped). Depends on prax-2 (done — the Praxis claim board this story adds a resolve
action to) AND prax-0 (done — `deriveCourtCategory`/`mayHoldBothOffices`, the machinery that lets a
Head of State keep a held Primogen seat). Independent of prax-4a entirely, except that both routes
live in the same file and reuse the same shared helpers it already introduced.

### Design-lock (locked 2026-08-30, confirmed by Angelus)

`specs/mockups/prax-4b-head-of-state-resolve/index.html` — rendered and reviewed before lock. Seven
states: the live board with a new (crimson, not gold) "Declare Winner" action per claimant card and
a "Dismiss vote" board-level action; the confirm modal naming every office vacated by the
resolution; the same modal when the winner holds one of the three mass-cleared offices themselves;
the same modal when nothing is currently held in any of the three; a stale-confirm-list variant; the
post-resolve toast; the resolved-summary card on the Praxis tab.

**Five things asked at lock, resolved as follows:**

1. **Praxis DOES get a Dismiss vote action**, mirroring Harpy's own (prax-4a). No confirm modal for
   dismiss — same low-stakes posture as Harpy's dismiss. The epic doc's own prax-4b row never
   mentioned a dismiss path; this closes that gap rather than leaving Head of State unable to go
   unclaimed for a cycle the way People's Harpy can.
2. **If the winner themselves currently holds Enforcer, Administrator or City Harpy**, their own
   seat is vacated by the same mass-clear and they appear in the confirm list like anyone else (with
   a small "· his own" / "· her own" suffix for legibility, not a separate note row). Not folded into
   the Primogen/People's-Harpy note-row treatment, and not refused as impossible.
3. **"Declare Winner" wording kept as-is** (not important, will react to it once built — same call as
   prax-4a's own item 1).
4. **The post-resolve toast is KEPT**, message-only, no Undo button — matching prax-4a's own
   already-locked shape exactly. The epic doc's "no undo-toast follow-up" phrase means no Undo
   button, not no toast at all.
5. **A stale confirm list (the CAS baseline moved between opening the modal and tapping Confirm
   Resolve) refreshes in place and allows an immediate retry** — no hard stop back to the live board.

## Two corrections against the epic doc's own prax-4b row, found while writing this spec

The epic doc was written 2026-08-29, before prax-1/prax-4a's actual file shape existed. Two of its
instructions are now stale against what actually shipped:

1. **RouteResponse does NOT need extracting.** The epic doc's row says to extract it "into a shared
   module too... this is the third caller." That reasoning was `office-seats.js`'s own comment
   ("lifting it would touch `office-actions.js`... a shared module is the right call the first time
   a THIRD route needs it") — but this story's own new route lives in `praxis-sessions.js`, the SAME
   FILE prax-1/prax-4a already gave its own `RouteResponse` copy. This story's route is that file's
   **seventh** route (after `POST /`, `GET /:id`, `GET /?chapter_id=`, `POST /:id/claims`,
   `DELETE /:id/claims/:characterId`, `PUT /:id/support`, `POST /:id/resolve-harpy`), reusing the
   copy already there — not a new file needing its own copy, and not a third DISTINCT caller in the
   sense the comment meant. Confirmed via `grep -n "class RouteResponse" server/routes/*.js`: there
   are already **five** independent local copies in this codebase (`chapters.js`, `office-actions.js`,
   `office-purchase.js`, `office-seats.js`, `praxis-sessions.js`) and none has ever been lifted — this
   repo's real, established convention is "duplicate this six-line class locally, always," not "lift
   at three." **Not extracted in this story.**
2. **`resetManoeuvreRank` does NOT need extracting either.** prax-4a already did this (one story
   earlier than the epic doc anticipated, confirmed with Angelus during that story's own scoping) —
   `server/lib/reset-manoeuvre-rank.js` already exists, and `praxis-sessions.js` already imports it.
   This story's own resolve-praxis route imports and calls the SAME shared function prax-4a's
   resolve-harpy route already uses. **Nothing new to build here.**

## Locked rulings this story must honour (see prax-0/1/2/3/4a's own stories + the epic doc, do not
re-litigate)

- **Never player-visible.** Same ST-only posture as every other Praxis surface.
- **Mass-clear scope**: every seat matching `office_category IN ('Enforcer', 'Administrator') OR
  (office_category = 'Socialite' AND seat_label = 'City Harpy')`, filtered to seats with a non-null
  `holder_id` at execute time. Computed via a live query INSIDE the transaction, immediately before
  the writes — never trust the confirm-list's own snapshot as the write target, only as the CAS
  baseline it is diffed against.
- **The "City Harpy" `seat_label` rename is THIS story's own precondition** (not a separate story).
  Today's seed data (`server/scripts/seed-office-seats.mjs`'s `OFFICE_SEATS` literal, confirmed by
  reading the file) has Brandy LaRoux holding the Socialite seat labelled plain `'Harpy'` and Carver
  holding `"People's Harpy"`. The mass-clear query needs `seat_label = 'City Harpy'` to exist and be
  unambiguous, so this story renames the FIRST of those two (plain `'Harpy'` → `'City Harpy'`),
  leaving `"People's Harpy"` (prax-4a's own target, unchanged) alone. Two artefacts, both required:
  the seed script's own `OFFICE_SEATS` literal (source of truth for a fresh seed) AND a one-off
  migration script for the LIVE document, since the seed script's own upsert is
  `$setOnInsert`-only and will not retroactively touch an existing document (confirmed by reading
  the script). Per this repo's own live-data discipline (`CLAUDE.md`, and every prior migration
  script in this codebase — `seed-bloodlines.js`, `migrate-office-purchases-to-seats.mjs`), the
  migration script is **dry-run by default, `--apply` opt-in, and Angelus runs it himself** — this
  story does NOT touch live Mongo directly.
- **Winner's own prior seat, two named cases**: Primogen → `holder_id` untouched, only
  `characters.court_category`/`court_title` overwritten via `deriveCourtCategory`
  (`server/lib/court-category.js`, prax-0) to reflect Head of State kept alongside Primogen.
  People's Harpy → vacated as an explicit step in the SAME transaction (that seat is never part of
  the Enforcer/Administrator/City-Harpy mass-clear query, so it needs its own line, not a query
  match). A THIRD case this story's own design-lock resolved (item 2 above): if the winner holds
  Enforcer, Administrator or City Harpy themselves, that seat IS one of the mass-clear query's own
  matches and is cleared exactly like anyone else's — no special-casing beyond the confirm list's
  own display treatment.
- **Manoeuvre ranks reset on every seat this resolution actually vacates** (office-powers.md's
  ruling, `resetManoeuvreRank`, reused not reinterpreted) — every mass-cleared seat, same as any
  other office handover. Prax-4a's own deferred finding (a real, open game-rules question about
  whether a re-elected SAME holder should reset) does not arise here in the same shape, because this
  route mass-CLEARS other people's seats; it never re-declares an existing holder as their own
  seat's winner the way Harpy's single-seat resolve can. The one place it could arise — the winner
  holding one of the three mass-cleared seats themselves and thereby "re-winning" nothing (they are
  simply vacated, not re-confirmed) — resets cleanly under the existing rule, no ambiguity.
- **Permanent merits survive every handover** (they always do — a seat's own `_id` never changes,
  `office_merit_dots` is untouched by this story, same invariant every prior office story preserves).
- **The Praxis tally's own confirm-then-execute flow is a genuine departure from Harpy's**
  (prax-4a: no modal at all) — Winston's own CAS design, confirmed at design-lock: the confirm list
  the ST reviewed IS the execute-time baseline, re-verified inside the transaction, aborting with a
  fresh list on mismatch rather than silently clearing whatever now matches.

## What this story is NOT

- **Not** a change to prax-4a's own `POST /:id/resolve-harpy` route, or to the Harpy tab's own
  actions/toast/resolved-summary. The two tallies stay fully independent — this story's mass-clear
  never touches `harpy.claims`/`harpy.support`/`resolved.harpy`, and prax-4a's own route is untouched
  code.
- **Not** a fix for prax-4a's own two deferred findings (`specs/deferred-work.md`,
  2026-08-30 entries) — the `resolved.<tally>` guard gap on prax-1's claim/support routes, and the
  sitting-holder-re-election manoeuvre-reset question. Both remain open; this story does not close
  either, though the FIRST is a natural companion fix a future pass could bundle with this story's own
  new route if picked up together (out of scope here — this story is already the epic's biggest).
- **Not** an Undo of any kind — never proposed for this story at any point (unlike prax-4a, where it
  was proposed and then explicitly dropped). A mass-clear is never pretended to be undoable.
- **Not** a change to `office_merit_dots`, `office-manoeuvre-rank.js`'s own step route, or any other
  office-purchase surface.
- **Not** a change to Territory Regent — untouched by Praxis (the epic doc's own locked game rule:
  Primogen and Territory Regent both survive Praxis changes untouched).
- **Not** the RouteResponse or resetManoeuvreRank extractions the epic doc's own row anticipated —
  see the two corrections above. Neither is built here because neither is needed.

## Acceptance Criteria

**Precondition migration script (new)**

1. `server/scripts/rename-city-harpy-seat.mjs` — dry-run by default, `--apply` opt-in, mirroring
   `seed-bloodlines.js`/`migrate-office-purchases-to-seats.mjs`'s own conventions (report what WOULD
   change, require `--apply` to write, idempotent — a second run against an already-renamed document
   is a clean no-op, not an error). Targets the single live `office_seats` document matching
   `{ office_category: 'Socialite', seat_label: 'Harpy' }` (the plain, appointed one — NEVER
   `"People's Harpy"`) and sets `seat_label: 'City Harpy'`. Refuses (does not guess) if zero or more
   than one document matches that filter at run time. NOT run against live Mongo by this story —
   Angelus's own action, per this repo's live-migration discipline.
2. `server/scripts/seed-office-seats.mjs`'s own `OFFICE_SEATS` literal updated: the plain `'Harpy'`
   entry's `seat_label` becomes `'City Harpy'`. `"People's Harpy"` entry unchanged. This is the
   source of truth for a FRESH seed only (its own upsert is `$setOnInsert`-only, confirmed by reading
   the script) — it does not retroactively fix the live document, which is AC1's own job.

**New route (`server/routes/praxis-sessions.js`, this file's 7th route — reuses its own existing
`RouteResponse`, `resetManoeuvreRank` import, `broadcastPraxisUpdate`; no new shared-module
extraction needed, see the corrections above)**

3. `POST /api/praxis_sessions/:id/resolve-praxis` — ST-only. Body:
   `{ claimant_character_id: <24-hex string> | null, confirmed_vacate_seat_ids: <array of 24-hex
   strings> }` (`null` claimant = dismiss, no winner; `confirmed_vacate_seat_ids` absent on a
   dismiss). Same absent-vs-explicit-null discipline `PUT /support` and `resolve-harpy` already
   establish for `claimant_character_id`.
4. 404 if the board id doesn't exist. 409 if `resolved.praxis` is already non-null — CAS-enforced
   exactly like `resolve-harpy`'s own AC3 (baseline read outside the transaction, write filtered on
   that baseline still holding).
5. **Dismiss path** (`claimant_character_id: null`): writes
   `resolved.praxis = { dismissed: true, resolved_at: <ISO> }`. No seat write, no character write, no
   manoeuvre reset, no mass-clear query run at all. Single-document transaction, same CAS discipline
   as the resolve path (a caller cannot distinguish "safe to retry" from "already handled" by which
   branch fired).
6. **Resolve path** (`claimant_character_id` is a real id): 400 if that character does not have a
   currently OPEN claim in `praxis.claims`. Inside ONE transaction:
   - Re-run the mass-clear query LIVE, inside the transaction: every `office_seats` document matching
     `office_category IN ('Enforcer', 'Administrator') OR (office_category = 'Socialite' AND
     seat_label = 'City Harpy')` with a non-null `holder_id`. This is the execute-time truth, never
     trusted from the request body.
   - **Compare the live query's result against `confirmed_vacate_seat_ids`** (the seat ids the ST's
     own confirm modal showed them, sent back on the request). Any mismatch — a seat now missing that
     was in the confirmed set, or a seat now present that was not — aborts with a 409 naming the
     CURRENT live list (not the stale one), so the client can re-render the modal with fresh data
     rather than the ST retrying blind. No partial clear ever happens on a mismatch.
   - Winner's character document must exist — 404, named as a CHARACTER 404 not a seat one (same
     reasoning `resolve-harpy`'s own AC5 documents).
   - For EVERY seat in the confirmed (and re-verified) vacate set: clear `holder_id` to null on the
     seat, and clear the departing character's `court_category`/`court_title` to null, CAS-filtered on
     that character's `court_category` still matching the seat's own `office_category` (the same
     benign-mismatch tolerance `resolve-harpy`'s own AC5 documents — a matchedCount of 0 here is not
     an error), then call `resetManoeuvreRank(seatId, seat.office_category, timestamp, dbSession)` for
     that seat. Applies uniformly whether the departing holder is a third party OR the winner
     themselves (the winner-holds-one-of-the-three case from design-lock item 2) — no special-casing
     inside the write, only in what the confirm-list DISPLAYED beforehand.
   - **People's Harpy**, if the winner currently holds it: vacate it as an explicit extra step in the
     SAME transaction (clear `holder_id`, clear the character's own People's-Harpy-specific
     `court_category`/`court_title` — but ONLY if it is still their current `court_category`; the
     benign-mismatch CAS tolerance applies here too), plus its own `resetManoeuvreRank` call. This
     seat is never a member of the mass-clear query's own match set, so it needs its own explicit
     branch, gated on `winner.court_category === 'Socialite' AND` the People's-Harpy seat's own
     `holder_id === winnerOid` (read inside the transaction, not assumed from the confirm list).
   - Set the winner's own headline via `deriveCourtCategory`/`deriveCourtHeadlineForHolder`
     (`server/lib/court-category.js`, prax-0) — Head of State, kept alongside Primogen if they hold
     it, per prax-0's own precedence order and `mayHoldBothOffices` exclusivity matrix. Reuses prax-0's
     own function; this story does not reimplement headline derivation.
   - `resolved.praxis = { winner_character_id: <winner id>, final_tally: <the Praxis City-Status sum
     at resolve time, computed the same way `praxis-tab.js`'s own `tallyFor` does for the Praxis
     tally>, vacated_seat_ids: <the confirmed, re-verified array, frozen>, resolved_at: <ISO> }`,
     written in the SAME transaction as every write above.
7. Response body (both paths): `{ ok: true, dismissed: <bool>, resolved: <the written resolved.praxis
   object> }`. No seat/character data in the response, same reasoning `resolve-harpy`'s own AC6
   documents (the client already holds every character's current data; refetches drive the render).
8. `praxis.claims`/`praxis.support` are NOT cleared or mutated by either path — same permanent-history
   posture `resolve-harpy`'s own AC7 establishes for the Harpy side.
9. **New WS frame** on a successful RESOLVE (not dismiss — nothing outside the Praxis board needs to
   know about a dismissal): a new `broadcastPraxisResolved(sessionId, { affected_seat_ids,
   affected_character_ids, resolved_office: 'Head of State' })` in `server/ws.js`, mirroring
   `broadcastPraxisUpdate`'s own ST/dev-only `_fanOutRoles` shape but carrying this richer payload —
   genuinely new shape for this codebase (every existing broadcaster names at most one entity;
   `affected_seat_ids`/`affected_character_ids` are BOTH arrays, since a mass-clear affects several of
   each at once). Fired in addition to (not instead of) the existing `broadcastPraxisUpdate` call —
   the Praxis board itself still needs its own plain refetch signal too.

**Client (`public/js/admin/praxis-tab.js`)**

10. Each Praxis claimant card gets a new "Declare Winner" action (`.claim-resolve.praxis` — crimson,
    not prax-4a's Harpy gold, per design-lock), rendered only when `_activeTally === 'praxis'` AND
    `_board.resolved.praxis === null`. Tapping it does NOT resolve immediately — it opens the confirm
    modal (AC12), unlike prax-4a's own Harpy action.
11. A new "Dismiss vote" text action on the Praxis tally, same placement/visibility condition and same
    immediate-no-modal behaviour as prax-4a's own Harpy dismiss (design-lock item 1) — calls the route
    directly with `claimant_character_id: null`, no `confirmed_vacate_seat_ids` needed on this path.
12. **The confirm modal** (new markup, new module-local state — this story's own centrepiece). Opened
    by AC10's Declare Winner tap. Fetches (or reuses already-loaded) `office_seats` to compute the
    same mass-clear match set the server will re-verify (`office_category IN ('Enforcer',
    'Administrator') OR (office_category='Socialite' AND seat_label='City Harpy')`, non-null
    `holder_id`), and shows:
    - Headline: `"<Winner> will become Head of State"`.
    - A vacate list, one row per matched seat, `Name — Office` (the winner's own name included with a
      `· his own`/`· her own` suffix if they are one of the matched holders — design-lock item 2), or
      an explicit "Nobody — Enforcer, Administrator and City Harpy are all currently vacant." line
      when the match set is empty (never a bare empty list).
    - A note row for "Keeps [their] own Primogen seat" if the winner holds Primogen, shown only then.
    - A note row for "Own People's Harpy seat vacated" if the winner holds People's Harpy, shown only
      then.
    - Cancel (closes, no request sent) and Confirm Resolve (posts the route with
      `confirmed_vacate_seat_ids` set to the exact seat ids the modal displayed).
13. **The stale-confirm-list recovery** (design-lock item 5): a 409 from AC6's own mismatch check
    re-opens the SAME modal with the fresh vacate list re-rendered from the error response (or a
    fresh `office_seats` refetch), not a hard close back to the live board. The ST reviews the
    updated list and can tap Confirm Resolve again immediately.
14. On a successful resolve or dismiss, show the same message-only toast component prax-4a's
    `showToast` already provides (reused, not reimplemented) — resolve reads `"<Winner> is now Head
    of State.<newline><n> office(s) vacated."` (the second line naming a count, not every name — a
    mass-clear can affect several people, unlike Harpy's own single-name second line; omitted
    entirely when the vacate list was empty); dismiss reads `"Praxis vote dismissed. No winner
    recorded."` matching Harpy's own dismiss-toast wording pattern.
15. When `_board.resolved.praxis` is non-null, the Praxis tab's pool strip AND claimants section are
    replaced by a resolved-summary card — same component prax-4a's own `renderResolvedSummary`
    already provides (reused, given a `'praxis'` tally instead of `'harpy'`), for a real winner:
    winning name, final tally, resolve date; for a dismissal: "No winner declared", the date. The
    segmented control and summary row stay exactly as prax-2/3 built them. Switching to the Harpy tab
    shows whatever state IT is independently in (live or resolved by prax-4a) — the two tallies never
    influence each other's render.
16. **New WS listener wiring**: `office-tab.js` and `city-tab.js` gain `initWS`-style dispatch for the
    new `praxis_resolved` frame type (AC9) — neither is wired to `initWS` at all today (confirmed by
    reading both files). On receipt, each refetches its own domain's data (office seats /
    characters) rather than attempting a partial in-place patch, same refetch-not-patch contract
    every other broadcast frame in this codebase already uses.

**CSS**

17. New classes for the crimson "Declare Winner" variant (`.claim-resolve.praxis`), the confirm modal
    (`.confirm-modal-overlay`, `.confirm-modal-box`, and its named child classes), and the
    stale-list warning treatment — matching the locked mockup's own colours (`var(--accent)` /
    `var(--accent-a8)` / `var(--accent-a15)` for the crimson emphasis, `var(--warn-orange)` /
    `var(--warn-a8)` for the stale-list warning, `var(--overlay)` for the modal's own backdrop — never
    a bare `rgba()`, matching prax-4a's own AC13 discipline exactly). Added to `admin-layout.css` in
    the same `.praxis-board`-scoped block prax-2/3/4a already built, with the confirm-modal overlay as
    the one deliberate fixed-to-viewport exception (same reasoning prax-4a's own toast already
    established for that exception).

## Tasks / Subtasks

1. Read `server/routes/praxis-sessions.js` in full (already 6 routes deep after prax-4a; this story's
   route is its 7th — re-read the existing `resolve-harpy` route immediately above where the new one
   will sit, since the CAS/transaction shape is the direct template) and `server/lib/court-category.js`
   in full (prax-0's `deriveCourtCategory`/`deriveCourtHeadlineForHolder`, precedence order,
   `mayHoldBothOffices`) before writing anything.
2. Write `server/scripts/rename-city-harpy-seat.mjs` (AC1) and the `seed-office-seats.mjs` literal
   edit (AC2). Run neither against live Mongo — dry-run only, confirm the script's own reporting
   output is correct against a local test database.
3. Write the new `POST /:id/resolve-praxis` route (AC3-AC9).
4. Write a new test file, `server/tests/prax-4b-head-of-state-resolve.test.js`, covering (at minimum,
   matching prax-4a's own test file's own coverage shape): the dismiss path; the resolve path's full
   mass-clear write (multiple seats, multiple characters, each one's own manoeuvre reset — pin the
   destroyed-XP counter the same way prax-4a's own suite does, not just that the reset fired); the
   confirmed-vacate-set mismatch 409 (inject a change between the confirm-list read and the request,
   prove the write aborts and the 409 names the FRESH list); the empty-vacate-set case (nobody
   currently holds any of the three); the winner-holds-one-of-the-three case (their own seat is
   cleared, their own manoeuvre rank resets, no special-casing bug); the Primogen-kept case
   (`deriveCourtCategory` called correctly, seat `holder_id` untouched); the People's-Harpy-vacated
   case (explicit branch, not accidentally caught by the mass-clear query); the idempotency 409 on a
   second resolve attempt; atomicity (an injected failure partway through the multi-seat write,
   proving NONE of it lands — reuse prax-4a's own `vi.mock('../db.js', ...)` technique, injected at a
   point AFTER at least one seat has been cleared, to prove a partial mass-clear never survives).
5. Add `broadcastPraxisResolved` to `server/ws.js` (AC9).
6. Add the client actions, confirm modal, stale-list recovery, toast reuse, and resolved-summary reuse
   to `praxis-tab.js` (AC10-AC15).
7. Wire `initWS` dispatch for `praxis_resolved` into `office-tab.js` and `city-tab.js` (AC16).
8. Write the new CSS (AC17), matching the locked mockup.
9. Extend `tests/prax-2-claim-board.spec.js` again (not fork, same convention prax-3/prax-4a already
   established) with a new `describe` block covering: Declare Winner opens the modal without
   resolving; the modal's own vacate-list rendering (populated, empty, winner-holds-one-of-three);
   Confirm Resolve posts the right body and shows the resolved summary; a simulated stale-list 409
   re-renders the modal with fresh data rather than closing it; Dismiss vote behaves like Harpy's own;
   the Harpy tab stays completely unaffected by a Praxis resolve.
10. Run every affected suite, plus `office-seats.js`'s own tests and prax-4a's own suite one more time
    as a final regression check (this story's route lives beside `resolve-harpy` in the same file —
    confirm neither route's own tests regressed the other), plus a stash A/B against the same
    admin-shell/CSS-ratchet specs prax-2/3/4a's own reviews already established as the right
    regression set for this area.

## Dev Notes

### Files this story touches

- `server/scripts/rename-city-harpy-seat.mjs` — NEW (AC1).
- `server/scripts/seed-office-seats.mjs` — one literal edit, `seat_label: 'Harpy'` →
  `seat_label: 'City Harpy'` on Brandy LaRoux's entry only (AC2).
- `server/routes/praxis-sessions.js` — new route, this file's 7th (AC3-AC9). Reuses this file's own
  existing `RouteResponse`, `col()`, `normaliseId`, `parseTally`, `broadcastPraxisUpdate`, and the
  already-imported `resetManoeuvreRank` (prax-4a). New import: `deriveCourtCategory` /
  `deriveCourtHeadlineForHolder` from `server/lib/court-category.js` (prax-0).
- `server/ws.js` — new `broadcastPraxisResolved` function (AC9), following
  `broadcastPraxisUpdate`'s own `_fanOutRoles(..., ['st', 'dev'])` shape.
- `public/js/admin/praxis-tab.js` — the client additions (AC10-AC15). Reuses prax-4a's own
  `showToast`, `renderResolvedSummary`, `resolvedFor`, `canResolveHarpy`-shaped gating logic
  (parameterised to the Praxis tally, not copy-pasted).
- `public/js/admin/office-tab.js` — new `initWS` wiring (AC16). Not on `initWS` at all today.
- `public/js/admin/city-tab.js` — new `initWS` wiring (AC16). Not on `initWS` at all today.
- `public/css/admin-layout.css` — new classes (AC17).
- `server/tests/prax-4b-head-of-state-resolve.test.js` — NEW.
- `tests/prax-2-claim-board.spec.js` — extended, not forked.

### Reuse precedents (read before writing new code)

- `server/routes/praxis-sessions.js`'s own `POST /:id/resolve-harpy` (prax-4a, immediately above
  where this route will sit) — the closest possible template: CAS baseline read outside the
  transaction, dismiss-vs-resolve branching, `resetManoeuvreRank` call placement, the frozen
  `resolved.<tally>` snapshot written in the same transaction as every other write, the response
  shape. This story's route is structurally "resolve-harpy, but the write set is a live query instead
  of one fixed seat, and there is a client-side confirm round-trip before the request is even sent."
- `server/lib/court-category.js` (prax-0) — `deriveCourtCategory`'s precedence order (Head of State
  > Primogen > Administrator > Socialite > Enforcer) and `deriveCourtHeadlineForHolder`'s own
  session-scoped signature. This story is the FIRST real caller of this module outside prax-0's own
  `office-seats.js` PUT route — read prax-0's own story
  (`specs/stories/prax-0-court-office-identity-fix.md`) for the full reasoning behind the precedence
  order and the dual-seat-title convention before calling it here.
- `server/scripts/seed-bloodlines.js` and `server/scripts/migrate-office-purchases-to-seats.mjs` —
  the dry-run-by-default / `--apply` opt-in / refuse-rather-than-guess migration-script convention
  this story's own `rename-city-harpy-seat.mjs` follows for AC1.
- `server/tests/prax-4a-peoples-harpy-resolve.test.js`'s own atomicity-probe technique (`vi.mock`
  injection on `office_manoeuvre_ranks`'s `findOneAndUpdate`, asserting neither write landed) — this
  story's own Task 4 atomicity test needs the SAME technique but injected after at least one seat in
  a multi-seat mass-clear has already been cleared, to prove a genuinely PARTIAL mass-clear can never
  survive (a stronger claim than prax-4a's own single-seat atomicity test needed to make).
- `public/js/admin/praxis-tab.js`'s own `showToast`/`renderResolvedSummary`/`resolvedFor` (prax-4a) —
  reused directly, parameterised to `'praxis'`, not duplicated. This story adds the confirm-modal
  component that prax-4a's own simpler Harpy flow never needed, and nothing else new to the toast/
  summary layer.
- `public/js/admin/roll-feed.js`'s and `public/js/admin/st-mods-panel.js`'s own `initWS` wiring
  patterns — the two existing precedents in this codebase for a domain tab listening for its own WS
  frame type, referenced for AC16's own `office-tab.js`/`city-tab.js` wiring shape.

### Testing standards summary

- `cd server && npx vitest run tests/prax-4b-head-of-state-resolve.test.js` — needs a local `mongod`
  (real DB, real transactions, same as every other office/praxis suite).
- Re-run `server/tests/prax-4a-peoples-harpy-resolve.test.js` and `office-seats.js`'s own suites after
  this story's changes — this story's route lives in the same shared file and imports the same shared
  helpers as both; regression-proof, not assumed.
- `npx playwright test tests/prax-2-claim-board.spec.js` — never run two Playwright invocations
  concurrently (root `CLAUDE.md`).
- No jsdom in this repo — Playwright is the real client-side coverage, per every prior PRAX story's
  own precedent.

## Dev Agent Record

*(filled in during dev-story)*

## Senior Developer Review

*(filled in during the independent review pass)*

## Change Log

- 2026-08-30 — Story created (`/bmad-epic-loop prax`), design-lock done and confirmed by Angelus
  first (`specs/mockups/prax-4b-head-of-state-resolve/index.html`). Five design-lock decisions:
  Praxis gains its own Dismiss vote (the epic doc never mentioned one); the winner's own held
  mass-cleared seat is listed in the confirm modal like anyone else's, not hidden; "Declare Winner"
  wording kept as-is; the post-resolve toast is kept (message-only); a stale confirm list refreshes
  in place rather than hard-stopping. Two corrections found against the epic doc's own row while
  writing this spec: neither `RouteResponse` nor `resetManoeuvreRank` needs extracting — the former
  because this repo already has five independent local copies and has never lifted at three, the
  latter because prax-4a already extracted it one story earlier than the epic doc anticipated.
  Depends on prax-2 (done) and prax-0 (done — cherry-picked onto this branch, `d9d89ed1`, from
  `ms/prax-0-court-office-identity-fix`'s own `c6ba5ea2`). Branch
  `ms/prax-4b-head-of-state-resolve`, cut from `ms/prax-4a-peoples-harpy-resolve`.
