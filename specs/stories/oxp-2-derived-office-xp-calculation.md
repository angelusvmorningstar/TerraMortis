# Story oxp.2: Derived office-XP calculation

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the ST team,
I want an office seat's XP balance (earned since creation, minus what has been spent) computed at
render time from real live data, mirroring the existing `xpGame()`/`xpEarned()` pattern rather than
inventing a new one,
so that Epic OXP's remaining UI stories (oxp.6 purchase markers, oxp.7 sheet section) have a real
number to render instead of each reinventing the accrual math, and so the balance is never stored
and therefore never able to drift from the real data it's derived from.

## Why this story exists

`office_seats` (oxp.1, done, merged, seeded live 2026-08-13 — 7 real seats in `tm_suite`) gives every
seat its own `created_at`. `content/rules/office-powers.md` §"Office XP" (umbrella root,
authoritative, Angelus's ruling 2026-08-11) settles the formula: **1 XP per month from creation,
whether or not the seat is held** — a vacant seat still accrues. Purchases are 1 XP per dot flat,
both for fixed merits (`office_merit_dots`, oxp.4) and for the graduated manoeuvre ladder
(`office_manoeuvre_ranks`, oxp.3). This story turns that ruling into a real, tested calculation —
nothing here is a new design decision, it is implementing an already-ruled formula.

**Verifying the exact accrual formula, not guessing it.** The ruling text says an office "begins
earning the month it is created" and separately notes an office created February 2026 "has accrued
roughly seven points by August 2026". That second sentence is a checkable worked example. Counting
inclusive calendar months from the creation month through the current month —
`(nowYear*12 + nowMonth) - (createdYear*12 + createdMonth) + 1` — gives Feb 2026 → Aug 2026 = 7
exactly, matching the ruling's own number. This is **not** a day-difference or a 30-day-bucket
calculation (which would give a different, lower figure for most of any given month); it is a
simple named-month count, day-of-month never enters it. That distinction matters enough to spell out
here because it is easy to implement the "obviously equivalent" day-based version and get every
figure in this collection wrong by up to a month.

**A real structural gap surfaced while scoping this story, ruled on directly by Angelus
(2026-08-13), the same way oxp.1's Finding 2 (two live Primogen seats) was raised and ruled on
before that story's ACs were written.** `office_seats` is seat-keyed (oxp.1) — Primogen and Socialite
each have 2 concurrent seat documents, each with its own `created_at`. But `office_merit_dots` and
`office_manoeuvre_ranks` (oxp.3/oxp.4) are keyed by `office_category` alone — ONE shared document per
category, with no seat or holder reference (this is oxp.1's own documented, deliberately-deferred
known gap: "Socialite's two real seats would collide the moment either gets a real purchase — but
neither has yet"). Live data confirms the collision hasn't happened yet: `office_merit_dots` only has
entries for `Enforcer` and `Head of State` (both single-seat offices), and `office_manoeuvre_ranks` is
completely empty — nobody has purchased a manoeuvre rank at all, for any office, yet.

That means **earned XP is always computable per seat** (it only needs that seat's own `created_at`),
but **spent XP is only attributable per seat for single-seat offices** (Head of State, Enforcer,
Administrator). For Primogen and Socialite, the shared category-level `office_merit_dots`/
`office_manoeuvre_ranks` document cannot currently be split between the two seats sharing that
category — there is no data that says which seat's purchase is which.

**Angelus's ruling on this, direct question asked during story-scoping:** do NOT approximate by
pooling both seats' earned XP into one shared category-level balance (which would have been
internally consistent with how spend already works, but silently papers over the real gap). Instead:
show each seat's own earned XP correctly always; report spend, and therefore the balance, as
**explicitly undeterminable** for any office category with more than one live seat document, rather
than guessing or silently attributing shared spend to one seat. This is more honest about the gap
and accepts that Primogen/Socialite's XP balance is visibly incomplete until `office_merit_dots`/
`office_manoeuvre_ranks` are migrated to seat-keying (still `office_merit_dots`/`office_manoeuvre_
ranks`' own deferred migration — not this story's job to perform, see "What this story is NOT"). The
determinability itself must be a first-class, explicit value this story's functions return — never a
silent 0, never a guess — so that oxp.6/oxp.7 (whichever consumes this first) can render "N/A,
pending seat-level purchase tracking" instead of a number that looks real but isn't.

## What this story is NOT

- NOT a migration of `office_merit_dots`/`office_manoeuvre_ranks` to seat-keying. That is real, known,
  necessary work — recorded here as confirmation that the gap is still live and now has a concrete
  consumer blocked by it (this story) — but it is its own risk surface (two collections, their routes,
  their existing tests, oxp.3/oxp.4's own shipped behaviour) and doing it speculatively inside a
  "derived calculation" story is exactly the oversized-story pattern this project's conventions warn
  against. If Angelus wants it done now instead of deferred further, that should be its own story.
- NOT any UI consumption. This story delivers a route and pure calculation functions with tests
  proving they're correct against real and fixture data — nothing renders them yet. oxp.6 (purchase
  markers) and oxp.7 (sheet section) are the first real consumers and each shapes its own read
  pattern from its own actual requirements, not a display speculatively built here with no consumer.
- NOT spend-approval routing (oxp.9, depends on Epic OAQ). This story only derives a number from
  data that already exists; it does not gate, log, or approve any future spend event.
- NOT handover/reset logic (oxp.5). This story does not add reset-to-zero-on-handover behaviour to
  `office_manoeuvre_ranks`, and does not change what "spent" means when a seat changes hands — it
  reads today's stored dots/rank exactly as they are, whatever put them there.
- NOT a write path of any kind. Every route this story adds is a GET. No new collection, no new
  field written to any existing collection, no schema change.

## Acceptance Criteria

1. A pure function computes the number of calendar months of accrual for a seat, given its
   `created_at` and a caller-supplied "now" (never `Date.now()`/`new Date()` internally — accepted as
   a parameter, so it is deterministic and testable, matching this project's existing calendar-math
   convention in `seed-office-seats.mjs`'s `isRealCalendarDate`). The count is **inclusive of the
   creation month** (a seat created this month has already earned its first point) and is **not**
   day-of-month-sensitive. Verified against the ruling's own worked example: a seat created
   2026-02-21, evaluated "now" as any date in 2026-08, returns exactly 7. A "now" before the creation
   month returns 0, not a negative number.
2. A pure function computes a seat's earned XP as `monthsAccrued * 1` (the flat rate the ruling
   states). Works identically for a vacant seat (`holder_id: null`) — the formula never reads
   `holder_id`, only `created_at`, matching the ruling that XP belongs to the office, not the holder.
3. A pure function computes spent XP for one `office_category`, given that category's
   `office_merit_dots` document (sum of all `dots.*` values) and `office_manoeuvre_ranks` document
   (its `rank` value) — both counted at 1 XP per dot per the ruling's "standard merit rate" applying
   to manoeuvres too. Missing documents (category never purchased into) count as 0, matching the
   existing routes' own "no document = 0" convention (`office-merit-dots.js`/`office-manoeuvre-
   rank.js`'s `GET /` handlers already establish this).
4. Given a set of `office_seats` documents, a function determines, per `office_category`, whether
   spend is attributable to an individual seat: **known** only when exactly one seat document exists
   for that category, **unknown** when two or more do (regardless of whether either is currently
   held — vacancy doesn't change the structural ambiguity). This must be a value the caller can branch
   on, not inferred from spend happening to be 0.
5. A combined per-seat balance function returns `{ earned, spent, left, spendKnown }` for a single
   seat: `earned` and `spent` and `left` are always real numbers; `spendKnown` is `false` exactly when
   AC4 says the seat's category has more than one seat, in which case `spent` and `left` reflect the
   category's shared/ambiguous total (present so nothing crashes on `undefined`) but are documented,
   in both the code comment and this story, as *not attributable to this specific seat* — a caller
   must check `spendKnown` before treating the number as this seat's own balance, not before treating
   it as absent.
6. A new `GET /api/office_seats` route (`server/routes/office-seats.js`, registered in
   `server/index.js` the same way `office_merit_dots`/`office_manoeuvre_rank` already are —
   `requireAuth` + `noCache()`, open read to any authenticated user, no role gate) returns the full
   array of seat documents exactly as stored (no aggregation, no calculation server-side — the
   deriving happens client-side from this data plus the two existing GET routes, mirroring how
   `office-tab.js` already fetches `office_merit_dots`/`office_manoeuvre_rank` and computes client-
   side). `holder_id` and `_id` serialise as strings (ObjectId → string), matching the sibling routes'
   existing JSON-boundary convention.
7. A DB-backed test proves AC6 against real seeded data in `tm_suite_test`: seed a small set of seat
   fixtures (reuse the shape from `oxp-1-office-seats.test.js`'s own fixtures rather than inventing a
   new one), GET the route, confirm the returned array matches exactly, `holder_id` values are strings
   (including a vacant seat's `null` surviving as `null`, not the string `'null'`), and no other
   collection is touched.
8. AC1–AC5's functions are proven against the **real live shape** confirmed during this story's own
   scoping: `Primogen` and `Socialite` each resolve `spendKnown: false` when given the current 7-seat
   fixture set; `Head of State`, `Enforcer`, `Administrator` each resolve `spendKnown: true`.

## Tasks / Subtasks

- [x] Task 1 — Calendar-month accrual + earned XP (AC: 1, 2)
  - [x] New pure-function module `public/js/data/office-xp.js` (sibling to `game-xp.js`, which
        already establishes the fetch-and-cache half of this pattern for character XP — this file is
        the pure-derivation half, mirroring `public/js/editor/xp.js`'s `xpEarned`/`xpGame` shape more
        directly than `game-xp.js`'s own fetch-heavy shape).
  - [x] `officeMonthsAccrued(createdAt, now)` — calendar-month-inclusive count, see AC1. Reuse or
        mirror the ISO-date parsing already established in `seed-office-seats.mjs` rather than adding
        a second date-parsing implementation; this module has no reason to import a server-side
        script, so re-derive the (small) piece it needs — parsing `YYYY-MM` out of an ISO string is a
        few lines, not worth a shared module for.
  - [x] `officeXpEarned(seat, now)` — AC2.
  - [x] Unit tests: the Feb 2026 → Aug 2026 = 7 worked example from the ruling; a same-month case
        (returns 1, not 0); a before-creation "now" (returns 0); a vacant seat earns identically to a
        filled one.

- [x] Task 2 — Spend + determinability (AC: 3, 4, 5)
  - [x] `officeXpSpentForCategory(meritDotsDoc, manoeuvreRankDoc)` — AC3. Sum `dots` object values;
        add `rank` (default 0 for either missing doc).
  - [x] `officeSpendKnownByCategory(allSeats)` — AC4. Returns a `{ [category]: boolean }` map from a
        full `office_seats` array (one pass, `Map`/count-by-category).
  - [x] `officeSeatXp(seat, allSeats, meritDotsDoc, manoeuvreRankDoc, now)` — AC5, the combined
        per-seat result.
  - [x] Unit tests: single-seat category (`spendKnown: true`, real numbers); multi-seat category
        (`spendKnown: false`); missing merit-dots/manoeuvre-rank documents both default to 0 without
        throwing; a category with 0 dots spent and 0 rank purchased still resolves `spendKnown: true`
        for a single-seat office (0 spend is not the same condition as "can't tell whose spend this
        is" — AC4's rule is about seat COUNT, never about the spend VALUE).

- [x] Task 3 — `GET /api/office_seats` route (AC: 6, 7)
  - [x] `server/routes/office-seats.js`, mirroring `office-merit-dots.js`'s `GET /` shape: no role
        gate beyond `requireAuth` (already applied at the `app.use` mount, matching the sibling
        routes), serialise `_id`/`holder_id` to strings.
  - [x] Register in `server/index.js`: import + `app.use('/api/office_seats', requireAuth,
        noCache(), officeSeatsRouter);`, placed alongside the existing two office routes.
  - [x] DB-backed test in the new test file (Task 4), `tm_suite_test` only, per this project's
        standard `describe.skipIf(!dbAvailable)` convention.

- [x] Task 4 — Prove against the real 7-seat shape (AC: 8)
  - [x] New test file `server/tests/oxp-2-derived-office-xp-calculation.test.js`. Reuse the exact
        seat fixture shape from `oxp-1-office-seats.test.js`'s `OFFICE_SEATS`-derived fixtures (do
        not re-invent the seven seats' data — import or mirror the same character-id/category
        pairings so a future reader can trust the two test files describe the same reality).
  - [x] Confirm `Primogen`/`Socialite` → `spendKnown: false`; `Head of State`/`Enforcer`/
        `Administrator` → `spendKnown: true`, against that fixture set.

## Dev Notes

### The ruling this story implements (do not re-derive — cite it)

`content/rules/office-powers.md` §"Office XP" (umbrella root, `D:\Terra Mortis\content\rules\
office-powers.md`), Angelus's ruling 2026-08-11:

- "An office accumulates 1 XP per month. It behaves like character XP, but it is a separate pool
  owned by the office... It never mixes with the holder's personal XP in either direction."
- "A vacant seat accrues from creation. An office begins earning the month it is created and keeps
  earning whether or not anyone holds it."
- "Permanent merits stay when the office changes hands... Manoeuvres reset to zero, and the XP spent
  on them is lost." (This story does not implement the reset — see "What this story is NOT" — it
  only reads whatever is currently stored, which already reflects oxp.3/oxp.4's shipped behaviour.)
- "The build cost is now computable, at the standard merit rate of 1 XP per dot" — table showing a
  5-dot manoeuvre ladder = 5 XP, a 3-merit/3-dot suite = 9 XP, confirming the flat 1:1 rate this
  story's `officeXpSpentForCategory` implements for both merit dots and manoeuvre rank.
- The Feb 2026 → "roughly seven points by August 2026" line is the worked example AC1 is verified
  against — see "Why this story exists" for the exact arithmetic.

### The multi-seat spend gap (ruled on directly this session, 2026-08-13)

See "Why this story exists" for the full reasoning. Restated for the implementer: **never** silently
sum or split a shared `office_merit_dots`/`office_manoeuvre_ranks` document across two seats. The
`spendKnown` flag (AC4/AC5) exists specifically so no caller — this story's own tests, or a future
oxp.6/oxp.7 — can mistake a shared, ambiguous total for a real per-seat figure. If this flag is ever
removed or defaulted to `true` "to simplify", that silently reintroduces the exact bug this story was
scoped around.

### Current state of the files this story touches

- **`public/js/editor/xp.js`** (reference pattern, not touched) — pure functions taking an
  already-available object (`c`, the character) and deriving a number from it with no fetch inside
  the function itself. `xpEarned`/`xpSpent`/`xpLeft` is the exact shape `officeXpEarned`/
  `officeXpSpentForCategory`/(the `left` field of `officeSeatXp`) mirrors.
- **`public/js/data/game-xp.js`** (reference pattern, not touched) — the *fetch-and-cache* half of
  the character-XP pattern (`loadGameXP`, populates `c._gameXP` from `/api/game_sessions`). This
  story's new module is the *pure-derivation* half only (Task 1/2's functions take already-fetched
  data as arguments); it does not add a fetch-and-cache loader, because nothing consumes it yet —
  that wiring is oxp.6/oxp.7's job, shaped by whatever those UIs actually need (a per-office summary?
  a per-seat popover? unknown until they're written).
- **`server/routes/office-merit-dots.js`** — `GET /` returns `{ [category]: { [meritName]: dots } }`,
  a category with no document simply absent from the response (client treats missing as `{}`/0). This
  story's `officeXpSpentForCategory` must handle that same "key absent" shape, not assume every
  category has a document.
- **`server/routes/office-manoeuvre-rank.js`** — `GET /` returns `{ [category]: rank }`, same
  absent-means-0 convention.
- **`server/schemas/office_seat.schema.js`** — the AJV schema oxp.1 shipped: `office_category`
  (enum, 5 values), `holder_id` (nullable 24-hex ObjectId string), `created_at` (ISO date, range-
  bounded pattern), `seat_label` (nullable string), `notes` (nullable string). No `_id` assumptions
  beyond "MongoDB mints it".
- **`server/index.js`** lines ~30-31 (imports) and ~188-189 (`app.use` registrations) — the exact two
  lines this story's Task 3 adds a third pair alongside.

### Live data this story's ACs are checked against (confirmed 2026-08-13, read-only)

- `office_seats`: 7 documents (oxp.1's seed, run live this session) — Head of State (1 seat),
  Primogen (2 seats: Yusuf Kalusicj, René St. Dominique), Enforcer (1 seat), Socialite (2 seats:
  Brandy LaRoux, Carver), Administrator (1 seat).
- `office_merit_dots`: 2 documents — `Enforcer`, `Head of State` only. Confirms the multi-seat
  collision AC8 tests for hasn't actually happened live yet; both existing purchases are on
  single-seat offices, unaffected by the gap.
- `office_manoeuvre_ranks`: 0 documents. Nobody has purchased a manoeuvre rank yet, for any office.

### Testing standards summary

- Vitest, `server/tests/`. DB-backed blocks: `describe.skipIf(!dbAvailable)`,
  `setupDb`/`teardownDb`/`isDbAvailable` from `./helpers/db-setup.js`, forced onto `tm_suite_test` by
  the project's vitest setup file — never live data.
- Pure-function unit tests (Task 1/2) need no DB at all — plain fixture objects in, assert on the
  return shape.
- No jsdom in this project — if any client-side wiring test is needed (it shouldn't be; this story
  has no UI wiring), use the project's established hand-rolled-fake-DOM technique, not a new
  dependency.
- Run targeted: `npx vitest run tests/oxp-2-derived-office-xp-calculation.test.js` (plus wherever
  Task 1/2's pure-function tests land — likely the same file, given they have no DB dependency and
  splitting them out buys nothing at this size).

### Project Structure Notes

- New files: `public/js/data/office-xp.js`, `server/routes/office-seats.js`,
  `server/tests/oxp-2-derived-office-xp-calculation.test.js`.
- Updated files: `server/index.js` (route registration only — two lines, matching the existing
  sibling pattern exactly).
- No schema file changes, no new collection, no migration.

### References

- `content/rules/office-powers.md` §"Office XP" (umbrella root) — the authoritative ruling this
  story implements.
- `specs/stories/oxp-1-data-lock-office-seat-schema.md` — `office_seats` shape, the seat-vs-category
  gap this story's AC4/AC5 works around rather than fixes.
- `specs/stories/oxp-3-manoeuvre-purchase-graduated-merit.md`,
  `specs/stories/oxp-4-merit-purchase-persists-handover.md` — `office_manoeuvre_ranks`/
  `office_merit_dots`' actual shipped shape and their own "no XP bookkeeping yet" scope notes, both
  explicitly naming oxp.2 as the story that would add it.
- `public/js/editor/xp.js`, `public/js/data/game-xp.js` — the two halves of the existing
  character-XP pattern this story's module mirrors.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5[1m]), via bmad-dev-story.

### Debug Log References

- Branch: `ms/oxp-2-derived-office-xp-calculation`, cut from `main` at `828908a0`. **The working tree
  was sitting on `main` when this story started** (the git snapshot in the session header said
  `ms/oxp-1-data-lock-office-seat-schema`, but oxp-1's PR had since merged and the checkout had moved).
  The branch was cut before any further work; the only thing written while on `main` was the
  `in-progress` flip in `sprint-status.yaml`, which came along with the branch.
- Targeted suite: `cd server && npx vitest run tests/oxp-2-derived-office-xp-calculation.test.js`
  → **43 passed / 43, zero skipped** (a local `mongod` was reachable, so the DB-backed AC6/AC7 block
  really ran rather than skipping).
- Office-domain regression (9 files: oxp-2, oxp-3, oxp-4, office-merit-dots, otc-2, otc-3,
  issue-1141 ×2, issue-1143) → **181 passed / 182, 1 failed**, the one failure pre-existing (below).
- Shared-helper regression (`server/tests/helpers/test-app.js` gained a mount, so suites that build
  the test app were re-run): `oaq-2-pending-status-actions`, `api-app-settings`, `api-chapters`,
  `api-characters`, `api-characters-crud` → **96 passed / 96**.
- Test-DB safety re-verified: `tests/issue-823-test-db-guard.test.js` → 7/7. Every DB-touching test in
  this story ran through the vitest harness against `tm_suite_test`. The live `tm_suite` database was
  never connected to and never written to.

#### Two PRE-EXISTING failures on `main`, neither caused by this story

Both were confirmed present at base, and the second was proved so by stashing this story's tracked
changes and re-running. Neither is oxp.2's to fix, and both are worth a decision from Angelus.

1. **`server/tests/oxp-1-office-seats.test.js` does not run at all.** The whole file fails to load with
   a bare `SyntaxError: Invalid or unexpected token` and no location, so all 41 of oxp-1's tests are
   silently unrun. Cause, isolated by bisecting the import list and then by a single-change
   experiment: `server/scripts/seed-office-seats.mjs` opens with a `#!/usr/bin/env node` shebang, and
   vitest's transform of that file chokes on it. Stripping only the shebang from a copy makes the same
   import succeed. The shebang has been there since the file's first commit (`6e7864e5`), so the
   "121/121, zero skipped" figure in oxp-1's own record cannot be reproduced today — most likely a
   vitest version change since (the runner now warns that `test.poolOptions` was removed in Vitest 4).
   **Consequence for this story:** Task 4's fixture is MIRRORED from `OFFICE_SEATS` rather than
   imported from the seed script, value for value with the holder names kept as comments, because
   importing it would have propagated an unrelated failure into this suite. The mirror is flagged in
   the test file's header so nobody "tidies" it back into an import without knowing why.
2. **`server/tests/oxp-4-merit-persistence-handover.test.js`, 1 failure** — the "never references a
   character, a character id, or a holder in either function" source-contract test. Its
   `meritDotsBlock()` slices a span of `public/js/tabs/office-tab.js` between two anchors, and oxp.3's
   merged `_adjustManoeuvreRank` now sits inside that span, carrying a comment with the word "holder"
   in it (office-tab.js line 291). The guarantee oxp-4 actually cares about is intact; the extraction
   window is what broke, when oxp-3 and oxp-4 merged in sequence. Proved pre-existing by
   `git stash push server/index.js server/tests/helpers/test-app.js` and re-running: still 1 failed /
   9 passed with this story's tracked changes removed.

#### Prove-discrimination (single-change mutation, one at a time, each reverted before the next)

Every gate this story leans on was checked by breaking the implementation and confirming the tests
notice — a passing suite is only evidence if it can fail:

| Mutation | Result |
|---|---|
| Drop the inclusive `+ 1` from the month count | **16 failed** / 27 passed |
| Replace calendar-month counting with a 30-day-bucket day difference | **16 failed** / 27 passed |
| Default `spendKnown` to `true` ("to simplify") | **4 failed** / 39 passed |
| Serialise `holder_id` with an unconditional `String()` | **1 failed** / 42 passed (the vacant-seat test, which is the only place a `null` holder exists) |

All four restored, suite re-run clean at 43/43.

### Completion Notes List

- **AC1** — `officeMonthsAccrued(createdAt, now)`. Inclusive named-month count,
  `(toY*12 + toM) - (fromY*12 + fromM) + 1`, clamped at 0. `now` is a required parameter and the
  module never reads the clock (a test asserts the function source contains no `Date.now()` or
  `new Date()`), so every result is deterministic. Strings are parsed by their own characters and
  never through `Date`, so no timezone can pull `'2026-02-01'` back into January; a `Date` argument is
  read with local getters, because a `Date` used as "now" means the reader's wall clock. Pinned
  against the ruling's own worked example (Feb 2026 → Aug 2026 = 7) and against every day of that
  month, which is the assertion a day-based implementation cannot pass.
- **AC1, judgement call worth flagging at review:** an unparseable `created_at` **throws** rather than
  returning 0 or NaN. Not specified by the AC either way. Chosen for consistency with the reasoning
  already written into `office_seat.schema.js` and `seed-office-seats.mjs`, both of which exist
  specifically so a malformed date cannot reach this arithmetic and produce a wrong-but-plausible
  number. A silent 0 here would be the exact failure those two files were hardened against in oxp-1's
  review round.
- **AC2** — `officeXpEarned(seat, now)` = months × `OFFICE_XP_PER_MONTH` (1, named rather than
  inlined). A test asserts the function's source never mentions `holder_id` at all, so vacancy cannot
  affect accrual by construction rather than by assertion.
- **AC3** — `officeXpSpentForCategory(meritDotsDoc, manoeuvreRankDoc)`. Missing documents count as 0,
  matching both sibling GET routes' "category absent from the response" convention — which is not an
  edge case but the majority state today (`office_merit_dots` has 2 documents,
  `office_manoeuvre_ranks` has 0). Accepts both the API response shape (`{ [merit]: dots }` plus a
  bare rank number) and the raw Mongo document shape (`{ dots: {…} }` plus `{ rank: n }`), which are
  unambiguously distinguishable, so no caller has to reshape first. Non-numeric dot values are skipped
  rather than coerced: `Number(null)` is a lie and `Number('three')` poisons the total.
- **AC4** — `officeSpendKnownByCategory(allSeats)` returns `{ [category]: boolean }`, true only at
  exactly one seat. Counts SEATS and never reads `holder_id`: two vacant seats are just as ambiguous
  as two filled ones.
- **AC5** — `officeSeatXp(seat, allSeats, meritDotsDoc, manoeuvreRankDoc, now)` →
  `{ earned, spent, left, spendKnown }`. `earned` is always this seat's own exact figure; `spent`/
  `left` are always real numbers so nothing crashes on `undefined`, but when `spendKnown` is false
  they are the category's shared total and are NOT this seat's. That is stated in the function's own
  doc comment, in the module header, and in the tests, per the story's instruction that removing or
  defaulting the flag silently reintroduces the bug the story was scoped around. `left` is deliberately
  allowed to go negative: both purchase collections are direct ST-set state with no budget check
  anywhere yet (oxp.9 would add one), so an office genuinely can show more purchased than earned, and
  clamping would hide a real data problem behind a plausible 0.
- **AC6** — `GET /api/office_seats`, mounted `requireAuth + noCache()` alongside its two siblings.
  Read-only: there is no POST/PUT/PATCH/DELETE, and a test asserts all four return 404. Returns stored
  documents verbatim with `_id`/`holder_id` stringified; a vacant seat's `null` stays `null`. No
  aggregation and no server-side derivation, so the accrual rule has exactly one implementation and
  one place to test it.
- **AC7** — DB-backed, `tm_suite_test` only, `describe.skipIf(!dbAvailable)`. Asserts the returned
  array matches the seven seeded seats field for field (including an explicit key-set check, so a
  derived field appearing server-side later would fail), that `_id`/`holder_id` are 24-hex strings,
  that a vacant seat's `null` is not the string `'null'`, and that neither purchase collection is
  touched by the read.
- **AC8** — proved against the mirrored live seven-seat set: `Primogen` and `Socialite` both resolve
  `spendKnown: false` on every one of their seats, `Head of State`/`Enforcer`/`Administrator` all
  `true`. A second test reproduces the live purchase state exactly (merit dots for Enforcer and Head
  of State only, no manoeuvre ranks anywhere) and confirms every other office derives 0 spend with a
  full earned balance rather than a blank. A third pins that the two Socialite seats derive DIFFERENT
  earned totals (7 vs 2), which is what would break first if earned XP were ever pooled by category.
- **Not done, deliberately, per "What this story is NOT":** no fetch-and-cache loader (nothing consumes
  these numbers until oxp.6/oxp.7, each of which will shape its own read), no UI, no seat-keying
  migration, no handover reset, no write path, no schema change.

### File List

New:

- `public/js/data/office-xp.js` — the pure derivation module (AC1–AC5).
- `server/routes/office-seats.js` — `GET /api/office_seats`, read-only (AC6).
- `server/tests/oxp-2-derived-office-xp-calculation.test.js` — 43 tests (34 pure, 9 DB-backed).

Modified:

- `server/index.js` — import + `app.use('/api/office_seats', requireAuth, noCache(), …)`, alongside the
  existing two office routes.
- `server/tests/helpers/test-app.js` — the same mount for the supertest harness. Not listed in the
  story's Project Structure Notes, but required: `createTestApp()` is where supertest suites get their
  routes, and both sibling office routes are mounted there the same way.
- `specs/stories/sprint-status.yaml` — status tracking.
- `specs/stories/oxp-2-derived-office-xp-calculation.md` — this record.

## Senior Developer Review

_To be filled in by code-review._

### Findings and disposition

_To be filled in by code-review._

### Regression

_To be filled in by code-review._

## Change Log

| Date | Change |
|------|--------|
| 2026-08-13 | DEV COMPLETE, status → review. New `public/js/data/office-xp.js` (5 pure functions + the named 1 XP/month rate), new read-only `GET /api/office_seats`, new 43-test suite (34 pure, 9 DB-backed against `tm_suite_test`), route registered in `server/index.js` and in the supertest harness. 43/43 passing with zero skipped; office-domain regression 181/182 and shared-helper regression 96/96. All four load-bearing gates prove-discriminated by single-change mutation (inclusive month count, calendar-vs-day accrual, `spendKnown`, vacant-holder serialisation). Two PRE-EXISTING failures found on `main` and proved not to be this story's: `oxp-1-office-seats.test.js` does not load at all (a `#!/usr/bin/env node` shebang in `seed-office-seats.mjs` breaks vitest's transform, so 41 tests are silently unrun — which is why this story's seven-seat fixture is mirrored rather than imported), and `oxp-4-merit-persistence-handover.test.js` has 1 failure (its source-slice now catches oxp.3's merged `_adjustManoeuvreRank`, whose comment says "holder"). Live `tm_suite` never touched. |
| 2026-08-13 | Story created. Scoping investigation found and Angelus ruled directly on a real structural gap (`office_merit_dots`/`office_manoeuvre_ranks` are category-keyed, `office_seats` is seat-keyed, so spend cannot currently be attributed per seat for Primogen/Socialite) before ACs were written — see "Why this story exists". Accrual formula (calendar-month-inclusive count) verified against the ruling's own Feb→Aug 2026 = 7 worked example rather than assumed. Confirmed against live data: `office_merit_dots` has 2 documents (single-seat offices only), `office_manoeuvre_ranks` has 0 — the multi-seat collision this story's `spendKnown` flag guards against is real but not yet live-triggered. |
