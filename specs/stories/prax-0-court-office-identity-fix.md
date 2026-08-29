# Story prax.0: Court-office identity fix (multi-seat correctness)

## Story

As the ST running Praxis night,
I want a character to be able to legitimately hold **two** court office seats at once (Head of State
+ Primogen) with `characters.court_category`/`court_title` always reflecting the correct headline,
So that Epic PRAX's own resolve stories (prax-4b in particular) have a safe foundation to build on,
instead of inheriting a system that hard-forbids the exact case Praxis creates.

## Why this story exists

Full epic context: `specs/epic-prax-praxis-claim-harpy-vote.md` (this story's own row is the
authoritative scope statement — this file expands it into ACs/tasks, it does not re-derive it).

`characters.court_category` (a single field) and `office_seats.holder_id` are, in the words of
`office_seat.schema.js`'s own header comment, "two independent facts that agree only by luck." The
whole office system today assumes a character holds at most one seat, ever — enforced by a hard 409
in `server/routes/office-seats.js`'s `PUT /:seatId/holder` (the AC2 conflict check). Praxis's own
game rule (a Praxis winner who already holds Primogen KEEPS it — their headline flips to "Head of
State" while the Primogen seat's `holder_id` stays theirs, mechanically) breaks that assumption. This
story is the root-cause fix, sequenced first among the PRAX stories that need it, so the eventual
prax-4b resolve route has real, correct multi-seat plumbing to call rather than working around a
system that still thinks one holder = one office.

### Angelus's rulings (locked, do not re-litigate)

- **No schema change.** `court_category`/`court_title` stay single stored fields on the character
  document. A `held_seats` array was explicitly rejected (denormalises data `office_seats.holder_id`
  already gives live). Live-deriving `court_category` on every read was explicitly rejected too — it
  re-treads Angelus's own 2026-08-13 ruling (cited in `office-seats.js`'s own comments: "do NOT
  derive `court_category` from the seat... build one transactional route that keeps the two in step
  atomically and leave every existing read site alone"). This story keeps that ruling intact: the fix
  is **which write computes the value**, at the one route that already owns writing it, not a
  data-shape change and not a new read-time derivation touching every hot-path reader.
- **No migration/backfill.** Live `tm_game` confirmed clean today (7 seats, 7 characters, zero
  drift) — this closes a *prospective* risk, not an existing mess.
- **Office exclusivity has exactly one carved-out exception**: Head of State and Primogen may be held
  by the same character simultaneously. Every other pairing (including two seats within the same
  category, e.g. two Primogen seats for one person, which is meaningless) remains mutually exclusive,
  unchanged from today's behaviour.
- **The `calcEffectiveCityStatus` multi-office summing bug is real but has zero live-data impact
  today** (no character currently holds two seats) — it is fixed here because prax-4b's whole premise
  depends on it being correct once a dual-holder exists, not because it is an active bug in play
  right now.

## What this story is NOT

- **Not** a change to `office_merit_dots` or the "permanent merits stay on handover" rule — untouched,
  merits persist by construction (a seat's `_id` never changes).
- **Not** a rewrite of `office-seats.js`'s core one-seat-per-*conflicting*-category invariant — this
  story sits alongside it (additive: replaces "any second seat is a conflict" with a real matrix),
  doesn't rewrite what oxp.5 already shipped and tested.
- **Not** a second Office Merits section for a dual-seat holder's non-headline office.
  `editor/sheet.js`'s `shRenderOfficeMerits`/`patchOfficeMerits` still render exactly one section, for
  the character's headline `court_category` — matching `office-tab.js`'s own single-category-first
  browsing UX. Seeing a *second* office's merit suite is already possible today via `office-tab.js`'s
  existing category picker; a dedicated second sheet section is a future story if ever wanted, not
  this one.
- **Not** a fix to every `calcCityStatus`/`calcEffectiveCityStatus` call site. Display-only surfaces
  (`status-tab.js`, `suite/status.js`, `suite/sheet.js`, `csv-format.js`, `export-character.js`,
  `contested-rolls.js`) keep calling the shared function with its existing 2-argument shape and get
  the *single-office* answer, unchanged. Only the two call sites that gate the real Status Action XP
  budget (`public/js/tabs/office-tab.js`'s HoS budget preview, `server/routes/office-actions.js`'s
  authoritative budget check) are updated to pass the full held-office list. This is a deliberate,
  named gap (see Dev Notes), not an oversight — closing it everywhere is a larger, lower-priority
  follow-up with zero live impact today.
- **Not** touching Primogen or Territory Regent resolution logic, or anything about how seats are
  created/deleted — out of scope for the whole epic, not just this story.

## Acceptance Criteria

**Exclusivity matrix (`server/schemas/office_seat.schema.js`)**

1. A named, exported exclusivity structure sits next to `OFFICE_CATEGORY_ENUM`, encoding exactly one
   compatible pairing — Head of State + Primogen — and treating every other pairing (including a
   category with itself) as mutually exclusive for one holder. Exported so `office-seats.js`'s AC2
   conflict check can import it instead of reasoning inline.
2. `office-seats.js`'s AC2 conflict check (`PUT /:seatId/holder`, the "target already holds a
   different seat" 409) uses this matrix: assigning a character who already holds Primogen into a
   vacant Head of State seat succeeds (no 409); assigning a character who already holds Head of State
   into a vacant Enforcer/Administrator/Socialite seat still 409s, unchanged; assigning a character
   who already holds Primogen into a vacant Enforcer/Administrator/Socialite seat still 409s,
   unchanged; assigning into a second seat of the SAME category still 409s, unchanged.

**`deriveCourtCategory` (new `server/lib/court-category.js`)**

3. A shared, exported function computes a character's correct `{court_category, court_title}` from
   the full set of seats they currently hold (queried by `holder_id`, inside the caller's session),
   using a fixed precedence order: Head of State > Primogen > Administrator > Socialite > Enforcer.
   Holding zero seats derives `{court_category: null, court_title: null}`.
4. `office-seats.js`'s `PUT /:seatId/holder` calls this at all three points that currently reason
   from one seat in isolation, replacing local one-seat-knowledge writes:
   - **AC4 same-holder repair branch** (lines ~289-311 today): repairs `court_category` to the
     holder's TRUE derived category across every seat they hold, not just this one seat's category.
   - **Departing-holder clear** (lines ~403-411 today): after the seat claim (step 4) has already
     moved `holder_id` off the departing holder, re-derive their headline from their REMAINING seats
     instead of unconditionally nulling both fields. A holder who is vacating Enforcer while still
     holding Primogen ends up with `court_category: 'Primogen'`, not `null`.
   - **Incoming-holder set** (lines ~425-431 today): after the claim, re-derive the incoming holder's
     headline from EVERY seat they now hold (including this new one). `court_title` follows the
     precedence winner only: if the newly-assigned seat IS the derived winner, `court_title` uses the
     request's `resolvedTitle` (existing behaviour, unchanged for every single-seat case live today);
     if the newly-assigned seat is NOT the winner (the holder already holds something more senior),
     `court_category`/`court_title` are left as whatever `deriveCourtCategory` says their existing
     senior seat already produces — the new junior seat's title is never written over a senior one.
5. Every existing single-seat assertion in `server/tests/oxp-5-handover-logic.test.js` (AC2, AC4, and
   every other pinned case) keeps passing UNCHANGED — `deriveCourtCategory` must produce identical
   output to the old one-seat logic whenever a holder has exactly one seat, which is every case that
   suite exercises today.
6. New test coverage (in the same suite or a dedicated one) exercises the Head-of-State-plus-Primogen
   dual-hold case specifically: granting Head of State to a sitting Primogen holder leaves the
   Primogen seat's `holder_id` untouched and flips `court_category` to `'Head of State'`; vacating
   that same character's Head of State seat afterwards leaves them with `court_category: 'Primogen'`,
   not `null`.

**`court_title` gets identical treatment** — folded into ACs 3-6 above; not a separate code path.

**City Status multi-office summing (`public/js/data/city-status-calc.js` + two call sites)**

7. `calcEffectiveCityStatus(c, regentAmbience, heldOfficeCategories?)` gains a third, OPTIONAL
   parameter: an array of office categories. When provided and non-empty, the title-status bonus is
   the SUM of `titleStatusBonusFor` over every category in the array (deduplicated). When omitted (or
   empty), behaviour is byte-for-byte identical to today — falls back to the single
   `c?.court_category`. Every existing 2-argument call site (`status-tab.js`, `suite/status.js`,
   `suite/sheet.js`, `csv-format.js`, `export-character.js`, `contested-rolls.js`,
   `accessors.js`'s `calcCityStatus` wrapper) is UNCHANGED and continues to compile and behave
   exactly as before — this is a strictly additive signature change. `server/tests/otc-2-city-status-calc.test.js`'s
   existing assertions keep passing unmodified.
8. `server/routes/office-actions.js`'s Status Action budget check (~line 321, `calcEffectiveCityStatus(actor, regentAmbience)`)
   is updated to query `office_seats` for every seat where `holder_id === actor._id` (inside the same
   transaction/session already open there) and pass the resulting category list as the third
   argument, so a dual-office holder's real budget sums both titles' bonuses.
9. `public/js/tabs/office-tab.js`'s own client-side HoS budget preview (~line 900,
   `calcCityStatus(char)`) is updated the same way, using the `seats` array that function's own
   surrounding code already fetches — no new network call. `accessors.js`'s `calcCityStatus(c, heldOfficeCategories?)`
   gains the matching optional third parameter (pass-through to `calcEffectiveCityStatus`); every
   OTHER call site of `calcCityStatus` keeps calling it with one argument and is unaffected.

**`resolveHeldSeat` category parameter (`public/js/data/office-seat-resolve.js`)**

10. `resolveHeldSeat(char, seats, category?)` gains an optional third parameter. When supplied, seats
    are filtered against that category instead of `char.court_category`. When omitted, behaviour is
    identical to today (`char.court_category` is the implicit default) — a strictly additive
    signature change.
11. `office-tab.js`'s `_wirePurchaseState` calls `resolveHeldSeat(char, seats, category)`
    UNCONDITIONALLY (the `category` being whichever office tab is currently being viewed), not
    gated behind the pre-fetch `isOwnOffice` flag as it is today. The result feeds a corrected
    "confirmed own office" determination used for the REST of that function (and the
    `_refreshPurchaseState` call it makes) — so a dual-seat holder browsing their OWN second office
    (whose category differs from their headline `court_category`) still sees their real purchase
    controls (merit dot steppers, manoeuvre affordability, request buttons), instead of being
    silently treated as a reference-only viewer of their own seat. The synchronous first-paint
    title/reference-banner (computed before seats are fetched, from the cheap headline comparison)
    may still lag by one render for this specific edge case — that is acceptable; losing purchase
    CONTROLS is the bug being fixed, not banner copy.
12. `editor/sheet.js`'s `patchOfficeMerits` call to `resolveHeldSeat` is updated to the new signature
    (passes `c.court_category` explicitly, or omits the third argument — either is acceptable since
    it is the default). No behavioural change required at this call site beyond compiling cleanly
    against the new signature; it continues to render exactly one Office Merits section, for the
    holder's headline office (see "What this story is NOT").

**Documentation**

13. `character.schema.js`'s `court_category` field gains a short comment pointing at
    `deriveCourtCategory` and stating plainly that a Head-of-State-via-kept-Primogen character's
    headline and one of their held seats will legitimately, permanently disagree by design — this is
    intentional, not drift, so a future reader doesn't "fix" it.

## Tasks / Subtasks

1. Add the exclusivity structure to `office_seat.schema.js` (AC1) and wire it into `office-seats.js`'s
   AC2 conflict check (AC2).
2. Write `server/lib/court-category.js`'s `deriveCourtCategory` (AC3), unit-testable in isolation
   (accepts an already-fetched seat array OR queries `office_seats` itself given a session — pick
   whichever keeps the three `office-seats.js` call sites simplest; if it queries itself, it must
   accept the transaction's `session` so it reads inside the same transaction, not a stale outer view).
3. Rewire `office-seats.js`'s three write points to call it (AC4), preserving every existing pinned
   test (AC5) and adding the dual-hold coverage (AC6).
4. Extend `calcEffectiveCityStatus`'s signature (AC7) and update the two named call sites (AC8, AC9),
   including the `calcCityStatus` wrapper's matching optional parameter.
5. Extend `resolveHeldSeat`'s signature (AC10) and update `office-tab.js` (AC11) and `sheet.js` (AC12).
6. Add the two documentation comments (AC13).
7. Run the full affected suite (see Testing standards below) and the em-dash/British-English sweep on
   any new prose this story adds.

## Dev Notes

### Files this story touches

- `server/schemas/office_seat.schema.js` — add exclusivity export (AC1).
- `server/routes/office-seats.js` — AC2 conflict check + three write points (AC2, AC4).
- `server/lib/court-category.js` — NEW file (AC3).
- `public/js/data/city-status-calc.js` — `calcEffectiveCityStatus` signature (AC7).
- `server/routes/office-actions.js` — budget call site (AC8).
- `public/js/tabs/office-tab.js` — HoS budget call site (AC9) AND `_wirePurchaseState`'s
  `resolveHeldSeat` call / own-office determination (AC11).
- `public/js/data/accessors.js` — `calcCityStatus` wrapper (AC9).
- `public/js/data/office-seat-resolve.js` — `resolveHeldSeat` signature (AC10).
- `public/js/editor/sheet.js` — `patchOfficeMerits`'s `resolveHeldSeat` call (AC12).
- `server/schemas/character.schema.js` — doc comment (AC13).

### Precedence order (repeat consistently everywhere it appears)

`Head of State > Primogen > Administrator > Socialite > Enforcer` — this is the SAME order
`office_seat.schema.js`'s existing `OFFICE_CATEGORY_ENUM` already lists them in. Reuse that ordering
rather than inventing a second literal array that could drift from it.

### Why `court_title` in AC4's incoming-holder branch has a "only if this seat is the winner" rule

Without it, granting a JUNIOR seat to someone who already holds a SENIOR one would silently overwrite
their senior title with the junior seat's (or the request's) title — e.g. a sitting Head of State
being additionally granted Primogen would have their `court_title` clobbered to "Primogen" (or
whatever the request's `court_title` says) even though their headline correctly stays "Head of
State" via `deriveCourtCategory`. `court_category` and `court_title` must describe the SAME seat.

### The known, named gap (AC7-9's scope boundary)

Fixing every `calcCityStatus` display call site to sum across held offices is real future work once a
character actually holds two seats and someone notices their City Status page under-reports relative
to their real budget. Recorded here rather than silently left for someone to rediscover:
`status-tab.js`, `suite/status.js`, `suite/sheet.js`, `csv-format.js`, `export-character.js`, and
`contested-rolls.js`'s City-Status-difference check all still read single-office only after this
story. None of this is user-visible today because no character holds two seats.

### Testing standards summary

- `cd server && npx vitest run tests/oxp-5-handover-logic.test.js tests/otc-2-city-status-calc.test.js tests/otc-2-office-actions-api.test.js tests/oxp-4-merit-persistence-handover.test.js tests/oxp-7-sheet-office-merits-section.test.js tests/crd-4a-defensive-status-choice.test.js`
  — the full set of existing suites this story's changes touch. Needs a local `mongod`; a suite that
  SKIPS is not a suite that PASSED (see root `CLAUDE.md`).
- Add new coverage for `deriveCourtCategory` (dual-hold precedence, AC6) and the exclusivity matrix
  (AC2) — extend `oxp-5-handover-logic.test.js` (it already owns this route's test fixtures and seat
  ID range) rather than duplicating its setup in a new file.
- No Playwright coverage is expected — this story has no new UI surface, only corrected logic behind
  existing UI (`office-tab.js`'s existing Playwright coverage, if any, should be spot-checked for the
  `isOwnOffice`/`resolveHeldSeat` change but a new dual-seat character does not exist in any e2e
  fixture, so a NEW e2e test is not required here).

## Dev Agent Record

All 13 ACs implemented. Files touched exactly as the Dev Notes listed, plus one shared helper in
`office-tab.js` that the story did not anticipate (see below).

### Implementation notes

- **AC1/AC2** — `COMPATIBLE_OFFICE_PAIRS` + `mayHoldBothOffices(a, b)` in `office_seat.schema.js`,
  order-insensitive and false for a category against itself. `office-seats.js`'s conflict check
  changed from `findOne` (any other seat) to `find().toArray()` filtered through the matrix, so a
  compatible seat is skipped and any other second seat still 409s with the identical payload.
- **AC3** — `server/lib/court-category.js` exports a PURE `deriveCourtCategory(seatsHeld, opts)`
  (unit-testable with no database) plus `deriveCourtHeadlineForHolder(holderId, session, opts)`, the
  querying wrapper. `COURT_CATEGORY_PRECEDENCE` is `OFFICE_CATEGORY_ENUM` itself, re-exported rather
  than restated, so the two cannot drift.
- **AC4** — all three write points call the wrapper inside the transaction's own session. The
  incoming-holder branch keeps the character document read at step 2 (`targetChar`) so the
  "only if this seat is the winner" title rule can see the holder's existing category/title without
  a duplicate read.
- **AC7-AC9** — `calcEffectiveCityStatus`'s third parameter is optional and the omitted path is
  byte-for-byte the old expression. `accessors.js`'s `calcCityStatus` gained the matching
  pass-through. `office-actions.js` reads the actor's seats inside `dbSession`.
- **AC10-AC12** — `resolveHeldSeat` gained an optional `category`. `office-tab.js` now calls it
  UNCONDITIONALLY with the category on screen and derives `ownOffice` from the result, which is what
  `_refreshPurchaseState` and the seat note are gated on.

### Deviation from the story text (one, deliberate)

AC9 says office-tab.js's budget preview should use "the `seats` array that function's own surrounding
code already fetches, no new network call". `_wireHosActions` does NOT in fact fetch seats: only
`_wirePurchaseState` did, and the two are launched independently from the same render. Rather than
add a second `GET /api/office_seats`, a small `_seatsForRender(el, gen)` helper memoises the one
fetch against the render generation and both functions share it. This honours AC9's actual intent
(no new network call) and additionally guarantees the two read one consistent snapshot.

### Noted for a future reader (spec inconsistency, no code impact)

AC4's departing-holder example ("vacating Enforcer while still holding Primogen ends up with
`court_category: 'Primogen'`") is unreachable under AC1's own matrix, which permits Head of State
plus Primogen and nothing else. The implementation is generic (it derives from whatever seats
remain, whatever their categories), so it would behave as AC4 describes if the matrix were ever
widened. The tests pin the reachable equivalent instead: vacating the SENIOR seat of a
Head-of-State-plus-Primogen holder leaves them on `'Primogen'`.

### Testing

`cd server && npx vitest run tests/oxp-5-handover-logic.test.js tests/otc-2-city-status-calc.test.js
tests/otc-2-office-actions-api.test.js tests/oxp-4-merit-persistence-handover.test.js
tests/oxp-7-sheet-office-merits-section.test.js tests/crd-4a-defensive-status-choice.test.js`
→ **6 files passed, 140 tests passed, 0 skipped** against a live local `mongod`.

A wider 15-suite office/status sweep was also run as a safety net: 14 passed, and
`oxp-1-office-seats.test.js`'s "does not duplicate a seat when several applies overlap in flight"
failed on a whole-collection `countDocuments({})` that any concurrently-running suite's seat
fixtures break. Confirmed PRE-EXISTING by `git stash` A/B against unmodified base code (base failed
identically, and worse: 9 seats vs 7, against 8 vs 7 with this story's changes present). It passes
clean in isolation. Same Atlas-contention/shared-fixture flake class this repo's `CLAUDE.md` already
documents; not caused by prax.0 and not in this story's stated suite list.

## Senior Developer Review

Independent pass by the orchestrator (not the implementing subagent) — every changed-file diff read
line-by-line against all 13 ACs, plus a full independent re-run of the stated suite. Not a rubber
stamp of the Dev Agent Record above.

**Re-verified test results, independently:** `6 files passed, 140 tests passed, 0 skipped` against a
live local `mongod`, matching the subagent's own report exactly. Confirmed via `--reporter=verbose`
that all 21 `prax.0`-named tests genuinely executed (not silently skipped by a `describe.skipIf`),
covering the exclusivity matrix, `deriveCourtCategory` precedence, the dual-hold grant, and every
dual-hold vacate/replace/re-save edge case. Parse-checked all 10 changed JS files individually — all
OK. Em-dash sweep on every added line across all nine touched files, plus the new
`server/lib/court-category.js` and the story file itself — clean.

**Correctness review, by file:**
- `office_seat.schema.js` (AC1) — `mayHoldBothOffices` is order-insensitive and correctly excludes a
  category against itself. Frozen structure, matches the design exactly.
- `server/lib/court-category.js` (AC3) — traced the title-resolution branch by hand for all three
  call shapes (winner-with-supplied-title, winner-with-no-title-change, non-winner). The "title
  follows the winner only" rule is implemented correctly: a junior seat can never overwrite a senior
  title.
- `office-seats.js` (AC2, AC4) — traced all three write points against the transaction's own ordering
  (claim-first, then derive). Confirmed `deriveCourtHeadlineForHolder` is called AFTER the seat claim
  in every case, so it always reads the post-claim world, both for the incoming holder (their new seat
  is already visible) and the departing holder (their old seat is already gone from their own query).
  No new race window versus oxp.5's existing CAS discipline — the baseline-holder filter on the claim
  itself is untouched.
- `city-status-calc.js` / `accessors.js` / `office-actions.js` (AC7-AC9) — confirmed the omitted-third-
  argument path is byte-identical to the pre-story expression by reading the diff, not just trusting
  the docstring. `actorObjectId` confirmed genuinely in scope at the budget-check line (`grep`-verified
  separately from the subagent's own claim).
- `office-seat-resolve.js` / `office-tab.js` / `sheet.js` (AC10-AC12) — confirmed the specific edge
  case this fix targets: because Head of State is always the MORE senior category, a dual-holder's
  headline is always `'Head of State'` whenever they hold it, so the pre-existing
  `category === 'Head of State' && isOwnOffice` gate on `_wireHosActions` was ALREADY correct and
  needed no change — the actual bug (lost purchase controls) only ever applied to the JUNIOR office
  tab, which is exactly what the `ownOffice`/`resolveHeldSeat(char, seats, category)` fix addresses.
  Checked this by hand rather than assuming the diff's own scope was complete.
- `character.schema.js` (AC13) — comment present, accurate, matches `deriveCourtCategory`'s real
  behaviour.

**On the subagent's two self-flagged items:** both independently re-derived and confirmed accurate —
the AC4 spec-inconsistency really is unreachable under AC1's matrix (harmless), and the departing-
holder title-reset really is the only non-fabricating option (`court_title` never stored a junior
seat's own title anywhere, since it always described whichever seat was the headline at the time).
Neither is a defect; both are correctly left as documented, not "fixed" into something worse.

**Verdict: no unresolved High or Medium findings. Approved as `done`.**

## Change Log

- 2026-08-29 — Story created (orchestrator, `/bmad-epic-loop PRAX`), branch `ms/prax-0-court-office-identity-fix` off `main`.
- 2026-08-29 — Dev-storied by an Opus subagent, paused once mid-task for an unrelated urgent
  interrupt (WIP protected via `git stash`, resumed cleanly), all 13 ACs implemented.
- 2026-08-29 — Independently re-verified by the orchestrator (full suite re-run + line-by-line diff
  review against every AC) and marked `done`. Committed locally; push/merge held pending explicit
  instruction.

- 2026-08-29 — Story created (orchestrator, `/bmad-epic-loop PRAX`), branch `ms/prax-0-court-office-identity-fix` off `main`.
