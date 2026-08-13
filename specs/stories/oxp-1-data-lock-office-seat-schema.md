# Story oxp.1: Data-lock — office/seat schema

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the ST team,
I want a real seat-keyed data model for office/seat data, seeded with the actual current holders and
their real creation dates,
so that Epic OXP's remaining stories (oxp.2 derived XP, oxp.5 handover, oxp.6 purchase markers,
oxp.7 sheet section) have a stable foundation to build on, instead of continuing to infer seat
identity from `court_category` alone — which cannot currently distinguish two people holding the
same office at once.

## Why this story exists, and what changed before it was written

This is Epic OXP's own designated "data-lock" story. Per this project's convention (`bmad-data-lock`
skill), the data-lock investigation ran as a real pass against live `tm_suite` MongoDB data
**before** this story was written, not as an assumption folded into the spec after the fact. Full
findings are in `data-map.md` (umbrella root, `D:\Terra Mortis\data-map.md`); this section carries
forward only what shapes the story.

**Finding 1 — `game_sessions` is not uniquely keyed by `game_number`.** Live data has 5 documents
each for `game_number: 3` and `game_number: 4` — 1 real, 4 junk placeholders. For game 3 the real
document is the OLDEST of the five, not the newest. See `data-map.md` Known Drift Pattern #17.

**Finding 2 — seat multiplicity is not confined to Socialite. Ruled by Angelus, 2026-08-13.** The
epic (`specs/epic-oxp-office-xp-economy.md`, dev branch only) states only Socialite has two
concurrent seats. Live data showed Primogen ALSO currently has two simultaneous holders — Yusuf
Kalusicj and René St. Dominique, both `court_title: 'Primogen'` (identical, unlike Socialite's two
distinct titles: "Harpy" / "People's Harpy"). Raised directly to Angelus during the data-lock; his
ruling: **"you can have more than one Primogen"** — this is real, not a data-hygiene bug. The epic's
"only Socialite has two seats" framing is therefore itself corrected: **any office can have N
concurrent seats**, not just Socialite. This story's schema must key seats generically, never
special-case one office name.

**Finding 3 — the seat-collision risk oxp.3/oxp.4 waved off is now proven live, not hypothetical.**
`office_merit_dots`/`office_manoeuvre_rank` (shipped by oxp-3/oxp-4) are keyed purely by office
category. Socialite's two real seats (Brandy LaRoux / Carver) would silently share the single
`_id: 'Socialite'` document the instant either gets a real merit or manoeuvre-rank purchase — there
is no way today to tell whose purchase is whose. **Deliberate scope decision for this story: do NOT
migrate those two collections now.** Neither Socialite holder has actually triggered the collision
yet (`office_merit_dots` currently holds Enforcer and Head of State only — single-seat offices,
unaffected). Migrating two collections nobody has hit a real bug in yet, speculatively, is exactly
the kind of unscoped work this project's stories consistently avoid. Record the gap explicitly (see
Task 4) and revisit if/when an ST actually tries to set dots for a specific Socialite (or other
multi-seat) holder.

**Finding 4 — `OFFICE_DATA` is still a static JS module**, three live import sites. The epic's own
oxp.1 text bundles "migrate OFFICE_DATA off static JS" into this story. **This story splits that out
into a new follow-up, `oxp-10-office-data-mongo-migration`** (added to `sprint-status.yaml` as
`backlog` by this story's own creation). Reasoning: this is a separate, mechanical migration
(move a static object into Mongo, build read/write plumbing, repoint three import sites) with its
own risk surface, unrelated to the seat-schema/creation-date problem this story actually needs to
solve. Bundling both into one story risks exactly the oversized-story pattern this project's own
conventions warn against (see `specs/project-context.md`, and compare to how issue-1143 was
deliberately spun out of otc.2's review as its own story rather than absorbed).

## What this story is NOT

- NOT Epic OXP's derived-XP calculation (oxp.2) — this story stores creation dates and seat
  identity; deriving "months since creation minus spend" from them is oxp.2's job.
- NOT handover logic (oxp.5) — this story does not add reset-on-handover behaviour for anything.
  `office_seats` records who holds a seat NOW; detecting and reacting to a CHANGE of holder is out
  of scope here.
- NOT a migration of `office_merit_dots`/`office_manoeuvre_rank` to seat-keying (Finding 3 above) —
  explicitly deferred, not silently dropped.
- NOT `OFFICE_DATA`'s migration off static JS (Finding 4 above) — split to `oxp-10`.
- NOT a new API route or any UI consumption of `office_seats`. This story delivers the collection,
  its schema, and a seed migration proving the corrected real data is right — nothing reads it yet.
  The first story that actually needs to READ `office_seats` (most likely oxp.2) builds whatever
  route it needs then, shaped by its own real requirements rather than a route built speculatively
  here with no consumer.
- NOT a resolution of exactly when René St. Dominique's Primogen seat was created. The epic's
  existing six known dates cover one Primogen seat only. This story's seed script must be built so
  Angelus can supply the second Primogen seat's real creation date when the script is actually run —
  do not guess or default it (e.g. to Game 1's date, which may or may not be correct — nobody has
  confirmed it).

## Acceptance Criteria

1. A new MongoDB collection, `office_seats`, has an AJV schema file
   (`server/schemas/office_seat.schema.js`, mirroring this project's existing schema-file
   conventions — see `server/schemas/office_action.schema.js` for the shape/style to match) defining
   one document per SEAT: `{ office_category, holder_id (nullable ObjectId ref to characters._id),
   created_at (ISO date string), seat_label (nullable string, for a case like Socialite's two seats
   needing a human-readable distinguisher beyond office_category alone — e.g. "Appointed Harpy" /
   "Popular Harpy"), notes (nullable string, free text) }`. `office_category` is validated against
   the five values `character.schema.js`'s `court_category` enum carries, minus its blank/null
   "holds no office" members. `character.schema.js` is the authority for this enum, specifically and
   only: `OFFICE_DATA` (`public/js/tabs/office-data.js`) defines just FOUR offices and has no
   Administrator key, because Administrator's manoeuvre and merit content is oxp.8 and unwritten. The
   two sources are therefore not interchangeable, and the seat enum must not follow the content
   module, since the Administrator seat is real and filled. No field assumes exactly one seat per office —
   the schema must support an arbitrary number of documents sharing the same `office_category`.
2. The collection does NOT key on `character.court_category` as its own identity — a seat's identity
   is its own document `_id` (a real MongoDB ObjectId), independent of who currently holds it or
   what that holder's `court_category` string says. `holder_id` is the seat's current pointer to a
   character, nullable (a seat can be vacant), and typed consistently as an ObjectId (never a mixed
   string/ObjectId — Known Drift Pattern #2 in `data-map.md` applies directly here).
3. A migration/seed script (`server/scripts/seed-office-seats.mjs` or equivalent, matching this
   project's existing `server/scripts/` naming conventions) creates one `office_seats` document for
   each of the seven real, currently-held seats confirmed live during this story's own data-lock:
   Head of State (Eve Lockridge), Primogen × 2 (Yusuf Kalusicj, René St. Dominique — see the "What
   this story is NOT" note on René's creation date), Enforcer (Einar Solveig), Socialite × 2 (Brandy
   LaRoux "Harpy", Carver "People's Harpy"), Administrator (Ivana Horvat). Each seat's `holder_id`
   points at the real character ObjectId. The script must be idempotent (safe to re-run without
   duplicating documents — upsert on a natural key such as `{office_category, holder_id}`, or check
   for an existing seat before inserting) and must NOT run automatically on server boot or in test
   setup; it is a deliberate, manually-invoked ST-side operation, the same posture as this project's
   other one-off `server/scripts/` migration scripts.
4. A test file (`server/tests/oxp-1-office-seats.test.js`) proves: the schema accepts a valid seat
   document and rejects an invalid `office_category`; a vacant seat (`holder_id: null`) is valid;
   two documents with the same `office_category` but different `holder_id` are both valid
   simultaneously (the structural proof that N-per-office is really supported, not just claimed);
   and — if practical against a real or seeded test-DB state — that the seed script's expected seven
   documents exist with the right `office_category`/`holder_id` pairing after running it. DB-backed
   tests follow this project's `describe.skipIf(!dbAvailable)` convention.
5. This story's Dev Notes record, explicitly and in the story's own words (not just a citation), the
   three deliberate scope exclusions from Finding 3, Finding 4, and the René-date gap — so a future
   reader of `sprint-status.yaml`'s oxp.1 entry understands these are decisions, not oversights.
6. `sprint-status.yaml` gains a new entry, `oxp-10-office-data-mongo-migration: backlog`, with a
   comment explaining it was split out of oxp.1 during this story's own creation and why (Finding 4).

## Tasks / Subtasks

- [x] Task 1 — Schema file (AC: 1, 2)
  - [x] Read `server/schemas/office_action.schema.js` and one or two sibling schema files in full
        first, to match this project's exact AJV conventions (strict mode, `additionalProperties`
        posture, how ObjectId-typed fields are declared) before writing a new one from scratch.
  - [x] `server/schemas/office_seat.schema.js`: `office_category` (enum, same five values as
        `character.schema.js:78`'s `court_category`, minus the blank/null options — a seat document
        should never itself be "no office"), `holder_id` (nullable ObjectId-pattern string or
        whatever this project's established ObjectId-field convention is — check how
        `downtime_submission.schema.js` or a similar file with a character-reference field
        represents it, per Known Drift Pattern #2's guard), `created_at` (ISO date string,
        required), `seat_label` (nullable string), `notes` (nullable string).
- [x] Task 2 — Seed script (AC: 3)
  - [x] Read 2-3 existing `server/scripts/*.mjs` migration scripts first for this project's
        established connection/idempotency/logging conventions (check for a shared DB-connect
        helper before writing a new one).
  - [x] Hardcode the seven real seats' `office_category`/`holder_id` pairs using the character
        ObjectIds already confirmed live during this story's data-lock (recorded in `data-map.md`'s
        `characters.court_category` entry and this story's own Dev Notes below) — do not re-query
        to rediscover them, they're already verified.
  - [x] Six of the seven creation dates are the epic's own already-known values (see Dev Notes'
        table). The seventh — René St. Dominique's Primogen seat — has NO confirmed date. The script
        must take it as a required parameter/prompt/constant-to-fill-in rather than defaulting it
        silently; document in the script's own header comment that this value needs confirming with
        Angelus before the script is actually run against production data.
  - [x] Idempotent: upsert or existence-check on `{office_category, holder_id}` before inserting.
  - [x] Not run automatically anywhere (no boot hook, no test-setup hook) — a manual, ST-invoked
        script only.
- [x] Task 3 — Tests (AC: 4)
  - [x] `server/tests/oxp-1-office-seats.test.js`: schema validation tests (valid seat, invalid
        `office_category`, vacant seat, two same-category seats coexisting) using this project's
        established AJV-test pattern (check a sibling schema's own test file, e.g. one testing
        `office_action.schema.js` or `office_merit_dots`, for the exact assertion style).
  - [x] If a DB-backed integration test is practical without depending on the seed script having
        actually been run in this test environment (seed real fixture data directly in the test's
        own `beforeEach`/`beforeAll`, do not assume the migration script ran), add one proving two
        documents can coexist with the same `office_category` in a real MongoDB collection, not just
        against the AJV schema in isolation.
- [x] Task 4 — Documentation of scope decisions (AC: 5)
  - [x] In this story's own Dev Notes (already drafted below — extend if implementation surfaces
        anything new), record: why `office_merit_dots`/`office_manoeuvre_rank` are NOT migrated here
        (Finding 3), why `OFFICE_DATA`'s static-JS migration is split to `oxp-10` (Finding 4), and
        that René's Primogen seat creation date is an open data question for whoever actually runs
        the seed script, not a design gap in the schema itself.
- [x] Task 5 — Sprint status (AC: 6)
  - [x] Add `oxp-10-office-data-mongo-migration: backlog` to `specs/stories/sprint-status.yaml`
        under the Epic OXP block, with a comment explaining the split (cite this story by name).
        **Already satisfied before dev started** — the entry was written by this story's own
        creation pass (line 983), exactly as AC6 describes. Verified present with the required
        comment; not re-touched.

## Dev Notes

### The seven real seats, confirmed live 2026-08-13 (do not re-query — cite this table)

| Office category | Holder | Character `_id` | Seat label | Creation date |
|---|---|---|---|---|
| Head of State | Eve Lockridge | `69d73ea49162ece35897a488` | — | 2026-02-21 (Game 1, epic-known) |
| Primogen | Yusuf Kalusicj | `69d720427fdd1b1f9498b0d4` | — | 2026-02-21 (Game 1, epic-known) |
| Primogen | René St. Dominique | `69d73ea49162ece35897a496` | — | 2026-02-21 (Game 1, confirmed by Angelus 2026-08-13 — see Change Log) |
| Enforcer | Einar Solveig | `69d73ea49162ece35897a487` | — | 2026-02-21 (Game 1, epic-known) |
| Socialite | Brandy LaRoux | `69d73ea49162ece35897a47e` | "Harpy" (appointed) | 2026-02-21 (Game 1, epic-known) |
| Socialite | Carver | `69d73ea49162ece35897a47f` | "People's Harpy" (popular) | 2026-07-18 (Game 6, epic-known) |
| Administrator | Ivana Horvat | `69d73ea49162ece35897a48b` | — | 2026-06-20 (Game 5, epic-known) |

Confirmed by live `find`/`aggregate` against `tm_suite.characters` grouped by `court_category`
during this story's own data-lock pass, 2026-08-13. The six epic-known dates are cited from
`specs/epic-oxp-office-xp-economy.md`'s own "Office creation dates" table (dev branch only); this
story did not re-verify each one individually against `game_sessions` given Finding 1's data-quality
caveat — if a future story needs to re-derive them from `game_sessions` directly rather than trust
the epic's citation, budget real time for the discriminator logic Finding 1 describes, and expect to
need to skip four junk documents per affected `game_number`.

### Current state of relevant files

**`character.schema.js:78`**: `court_category` is a plain nullable enum string — no seat-instance
concept, confirmed both by direct schema reading and by oxp.4's own independent investigation (its
story file). This story's `office_seats` collection is additive — it does not replace or modify
`court_category` in any way; a character's `court_category` and their `office_seats` document(s) are
two separate, currently-unlinked facts that happen to usually agree. (Whether they should be
formally linked — e.g. `court_category` derived FROM holding a seat, rather than an independent
field two write paths could disagree about — is a real future design question, out of scope here;
noting it so it isn't lost.)

**`server/routes/office-merit-dots.js`, `server/routes/office-manoeuvre-rank.js`**: both keyed by
`office_category` string only (`_id: category`). Untouched by this story (Finding 3). Their own
comments already cite `oxp.4`'s handover-persistence reasoning; a future story that DOES migrate
them to seat-keying should read both files' existing comments first, since they document the exact
current keying this story's `office_seats` collection does not yet connect to.

**`public/js/tabs/office-data.js`**: unchanged by this story (Finding 4, split to `oxp-10`).

### Deliberate scope exclusions (AC5) — decisions, not oversights

Three things a reader of `sprint-status.yaml`'s oxp.1 entry might reasonably expect to find in this
story's diff, and deliberately will not. Each was decided before implementation, and none is a
"ran out of time".

**1. `office_merit_dots` and `office_manoeuvre_rank` are NOT migrated to seat-keying.** Both
collections key on the office category string alone (`_id: 'Socialite'`), which oxp.3 and oxp.4 both
justified at the time on the grounds that there was no seat-ambiguity problem to solve. That
reasoning is now demonstrably wrong: Socialite has two live seats, so the moment either Brandy
LaRoux or Carver gets a real merit or manoeuvre-rank purchase, the two of them silently share one
document and there is no way to tell whose purchase is whose. It has not happened yet.
`office_merit_dots` currently holds Enforcer and Head of State only, both single-seat offices, and
`office_manoeuvre_rank` is in the same position. Migrating two collections that nobody has hit a
real bug in, speculatively, ahead of any consumer that would use the new keying, is precisely the
unscoped work this project's stories avoid. The gap is recorded here rather than fixed; revisit it
when an ST actually tries to set dots or a rank for one specific holder of a multi-seat office. The
new `office_seats` collection is not wired to either of them in any direction.

**2. `OFFICE_DATA`'s static-JS-to-MongoDB migration is split out to `oxp-10`.** The epic's own
oxp.1 text bundled it in here. It is a distinct, mechanical migration (lift a static object out of
`public/js/tabs/office-data.js` into a collection, build the read/write plumbing, repoint three live
import sites) whose risk surface is entirely unrelated to the seat-identity problem this story
exists to solve. `specs/stories/sprint-status.yaml` line 983 carries the new `oxp-10` entry and the
reason. `public/js/tabs/office-data.js` is untouched by this story's diff.

One thing implementation surfaced that the story's own drafting did not: `OFFICE_DATA` defines only
**four** offices, not five. Administrator has no manoeuvre or merit content yet (that is oxp.8), so
the module has no key for it, while `character.schema.js`'s `court_category` enum does. The
Administrator seat is real and filled (Ivana Horvat, since Game 5) and had to be seeded, so
`office_seat.schema.js`'s category enum follows `character.schema.js`, not `OFFICE_DATA`. AC1's
phrasing treats the two as interchangeable sources for "the same five values"; they are not, and
`oxp-10` will need to reconcile that when it moves `OFFICE_DATA` into Mongo. A test in
`oxp-1-office-seats.test.js` asserts the enum stays in lockstep with `court_category` specifically,
so a future edit to either one fails loudly.

**3. Rene St. Dominique's Primogen seat creation date is still unknown, by design.** This is an open
DATA question for whoever runs the seed script, not a design gap in the schema, which stores
whatever date it is given. The epic's six known dates cover one Primogen seat, and which of the two
live Primogen it describes has never been established. The seed script therefore refuses to build
its documents at all unless the date arrives via `--rene-created-at=YYYY-MM-DD` or the
`RENE_PRIMOGEN_SEAT_CREATED_AT` constant, and rejects a non-ISO value rather than storing rubbish.
It is not defaulted to Game 1's `2026-02-21`; that would look right and could be silently wrong, and
oxp.2's months-since-creation arithmetic would then produce a wrong XP figure in a place nobody
thinks to check. Three tests cover the refusal, and a mutation run confirmed that softening it into
a default breaks exactly those tests and nothing else.

### Testing standards summary

- vitest, `cd server && npx vitest run tests/oxp-1-office-seats.test.js`. Targeted only, per
  `specs/project-context.md`.
- DB-backed tests skip rather than fail without a local `mongod`
  (`describe.skipIf(!dbAvailable)`) — a skip is not evidence AC4 holds, read the summary line.

### Project Structure Notes

- New files: `server/schemas/office_seat.schema.js`, `server/scripts/seed-office-seats.mjs`,
  `server/tests/oxp-1-office-seats.test.js`.
- Modified: `specs/stories/sprint-status.yaml` (new `oxp-10` entry).
- No route file, no client-side file — see "What this story is NOT".

### References

- [Source: data-map.md] (umbrella root) — Known Drift Pattern #17 (`game_sessions` duplication), the
  `game_sessions`/`characters.court_category`/`office_merit_dots`+`office_manoeuvre_rank`/
  `OFFICE_DATA` TM Suite entries this story's findings are drawn from.
- [Source: specs/epic-oxp-office-xp-economy.md] (dev branch only) — the six originally-known
  creation dates, and the epic's own (now-corrected) "only Socialite has two seats" framing.
- [Source: specs/stories/oxp-3-manoeuvre-purchase-graduated-merit.md,
  oxp-4-merit-purchase-persists-handover.md] — sibling stories whose category-keyed collections this
  story's Finding 3 examines but deliberately does not touch.
- [Source: server/schemas/character.schema.js#L78] — `court_category`'s shape, unaffected by this
  story.
- [Source: 2026-08-13 chat, Angelus's ruling on the Primogen seat question] — "you can have more
  than one Primogen," the direct source of Finding 2 and this story's N-seats-per-office schema
  requirement.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context), via the `bmad-dev-story` workflow.

### Debug Log References

- **Red first, and for the right reason.** The test file was written and run before either source
  file existed: `Cannot find module '../schemas/office_seat.schema.js'`, 0 tests collected. That is
  a genuine absence, not a harness fault. After the schema and script landed, 41/41 green.

- **The DB-backed blocks genuinely executed, they did not skip.** Ran with `--reporter=verbose` and
  confirmed all nine `describe.skipIf(!dbAvailable)` tests as `✓` with real timings, preceded by
  `MongoDB connected successfully`. The story's own testing note warns that a skip is not evidence
  AC4 holds, so this was checked rather than inferred from a green exit code.

- **Prove-discrimination (mutation testing) on the four gates that carry the ACs.** Each mutation was
  a single change, run alone, then reverted and re-confirmed green:
  - Disabled the idempotency existence check (`if (existing)` → `if (false)`) → **exactly 2**
    failures, both idempotency tests ("a second apply inserts nothing", "re-inserts only the seat
    that is missing"). Nothing else moved.
  - Dropped the `holder_id` 24-hex pattern → **exactly 3** failures, all three Drift-Pattern-#2
    tests (free-text holder, uppercase hex, truncated ObjectId).
  - Softened the Rene-date refusal into a silent `|| '2026-02-21'` default → **exactly 2** failures,
    both refusal tests, including the DB-backed one proving the collection stays empty.
  - Removed the `office_category` enum → **exactly 2** failures ("rejects an office_category that is
    not one of the five", "rejects the blank office_category"). Note the null-category test survived
    this mutation, correctly: it is `type: 'string'` doing that work, not the enum.
  Without this step, every one of these tests would have been passing only because the modules did
  not exist during the red phase, which proves nothing about the gates themselves.

- **The live database was never connected to or written to at any point.** No `node
  scripts/seed-office-seats.mjs` invocation was made from any shell. The script's logic reached a
  database only through vitest, which forces `MONGODB_DB=tm_suite_test` in
  `tests/helpers/setup-env.js` and re-asserts it in `db.js`'s `assertTestDbSafety`. The character
  ObjectIds and creation dates came from the story's own Dev Notes table, as instructed, with no
  confirming query against `tm_suite`.

- **New files verified free of NUL bytes** (`file` reports plain text on all three; the schema and
  script are pure ASCII) and free of em-dashes, per this project's standing rules.

### Completion Notes List

- **All 6 ACs satisfied.** AC6 was already satisfied before dev began: the
  `oxp-10-office-data-mongo-migration: backlog` entry with its split-out rationale was written by
  this story's own creation pass and sits at `sprint-status.yaml` line 983. Verified present and
  deliberately not re-touched, since re-writing it would have risked clobbering a concurrent
  session's edit to the same file.

- **Final targeted result: 112 passed / 112 across 6 files, zero skipped.** The gate, run from
  `server/`:

  ```
  npx vitest run tests/oxp-1-office-seats.test.js tests/office-merit-dots.test.js \
    tests/issue-1141-office-data-sync.test.js tests/otc-2-office-actions-api.test.js \
    tests/issue-1143-office-actions-auth-safety.test.js tests/issue-823-test-db-guard.test.js
  ```

  41 of those are new. The five neighbours are the existing office-family suites plus the test-DB
  isolation guard; this story's diff is purely additive (two new source files, one new test file) so
  there was no regression surface beyond confirming the new `office_seats` collection name collides
  with nothing and the DB guard still holds.

- **The N-seats-per-office claim is proved structurally and in real MongoDB, not just asserted.**
  THREE schema tests validate two same-category documents as a pair, and a fourth asserts the
  compiled schema carries no cap, uniqueness or per-office count keyword at all. Three DB-backed
  tests insert same-category documents into a real collection and confirm two distinct `_id`
  values, two distinct `holder_id` values, and that every stored document still validates.
  (Both of those precisions came out of the Codex review round: the paired-validation tests
  originally recompiled on the same Ajv instance, which returns the *cached* function rather than a
  second validator, and only one of the three DB tests re-validated its stored documents. Both are
  fixed — separate Ajv instances, and all three DB tests now re-validate. See the Senior Developer
  Review.) Both multi-seat offices are covered, not only Socialite. **Primogen is the harder of the
  two** and is tested as such: unlike
  Socialite's "Harpy" / "People's Harpy", both Primogen carry the identical `court_title`, so
  `seat_label` is null on both and nothing but the document identity separates them. A schema that
  passed the Socialite case by leaning on the label would fail the Primogen one.

- **Nothing in the schema special-cases an office.** There is a test asserting the compiled schema
  contains no `maxItems`/`uniqueItems`/`maxProperties` and that `seat_label` carries no enum, so a
  future edit that quietly caps an office's seat count fails. The schema header carries an explicit
  "if you are about to add a unique index on `office_category`, read the story first" warning, since
  that is the single most plausible way a later maintainer undoes this story.

- **`holder_id` is required-but-nullable, deliberately.** A vacant seat is an explicit `null`, never
  an absent key. An absent key would be indistinguishable from "not yet migrated" to a future
  reader, and would also let a mixed string/ObjectId foreign key creep back in through the gap.
  Two tests cover this pair of behaviours.

- **`created_at` is patterned rather than left as a bare string, a small deliberate deviation from
  the sibling convention.** `downtime_submission.schema.js` uses `{ type: 'string' }` with an ISO
  comment because this repo's AJV has no `ajv-formats` and `format: 'date-time'` would throw at
  compile time. That constraint is real and is respected, but a bare string was rejected here on the
  grounds that these dates feed oxp.2's months-since-creation arithmetic: `'21 February 2026'`
  parses to `NaN` there and yields a silently wrong XP figure rather than a loud failure. The
  pattern is deliberately permissive about time (`'2026-02-21'` and `'2026-02-21T09:30:00.000Z'`
  both pass) and strict about the leading `YYYY-MM-DD`, whose month and day are RANGE-BOUNDED
  (`0[1-9]|1[0-2]` and `0[1-9]|[12]\d|3[01]`). The first shipped version used bare `\d{2}` for both
  and so accepted `'2026-99-99'` — a value that matches the shape and then parses to Invalid Date,
  i.e. exactly the failure the pattern exists to prevent. Codex caught it; see the Senior Developer
  Review for the fix and the residual gap the seed script closes.

- **The seed script takes its collection as an argument.** `seedOfficeSeats(collection, opts)` never
  resolves a collection itself; only `main()` does, and `main()` runs only under the direct-invoke
  guard (`import.meta.url === pathToFileURL(process.argv[1]).href`, the `backfill-free-grants.js`
  pattern). That is what lets the tests exercise the real seeding logic end to end while making it
  structurally impossible for an import to reach live Atlas.

- **Idempotency is an atomic `$setOnInsert` upsert on `{office_category, holder_id}`.** AC3 permits
  either an upsert or an existence check; this shipped as an existence check and was changed to an
  upsert during the Codex review round, because a `findOne`-then-`insertOne` pair is only
  *sequentially* idempotent. Four overlapping calls against an empty collection produced 13 to 19
  documents instead of 7, reproducibly, and there is no unique index on the natural key to catch
  that afterwards. `$setOnInsert` keeps the property the existence check was chosen for in the first
  place: an existing seat is left completely alone, including any `notes` or `seat_label` an ST has
  hand-edited since seeding, because on the match branch the update writes nothing at all. A test
  covers that ST-edit-survives-re-run case, another covers the partial-state case (delete one seat,
  re-run, one insert, the other six keep their original `_id`s so seat identity stays stable), and a
  third runs four concurrent seeds and asserts exactly seven documents.

- **Dry-run is the default and `--apply` is required to write**, matching
  `seed-rules-pool-grants.js` and `backfill-free-grants.js`. Since the script resolves its
  connection through `../db.js`, running it bare from `server/` with `server/.env` in place targets
  live Atlas; the dry-run default is what makes that survivable, and the script's header says so
  in as many words.

- **`OFFICE_DATA` has four offices, not five.** Surfaced during implementation; recorded in full
  under "Deliberate scope exclusions" above, with the consequence for `oxp-10`. The category enum
  follows `character.schema.js`, and a test asserts that parity holds so either side drifting fails
  loudly.

- **No route, no client file, no `OFFICE_DATA` change, no `office_merit_dots`/`office_manoeuvre_rank`
  change** — the story's "What this story is NOT" list, honoured exactly. Nothing reads
  `office_seats` yet. No index was created on the collection either: a unique index on
  `{office_category, holder_id}` would be the obvious next hardening, but it belongs with the first
  story that actually reads the collection and can say what the query shape needs to be.

### File List

- `server/schemas/office_seat.schema.js` — **NEW**. Draft-07 AJV schema for the `office_seats`
  collection. Exports `officeSeatSchema` and `OFFICE_CATEGORY_ENUM` (the five `court_category`
  values minus the `''`/`null` "no office" members). `additionalProperties: false`;
  `required: ['office_category', 'holder_id', 'created_at']`; `holder_id` is a nullable 24-hex
  ObjectId-pattern string; `created_at` is a pattern-checked ISO date; `seat_label` and `notes` are
  nullable strings. Header documents the N-seats-per-office invariant, the Primogen ruling, the
  additive-to-`court_category` posture, and the two deferred collections.

- `server/scripts/seed-office-seats.mjs` — **NEW**. Manual, ST-invoked one-off seed for the seven
  real seats. Exports `OFFICE_SEATS` (the table, with holder names alongside the ObjectIds for human
  review), `RENE_PRIMOGEN_SEAT_CREATED_AT` (null, by design), `buildSeatDocs`, `seedOfficeSeats` and
  `main`. Dry-run by default, `--apply` to write, `--rene-created-at=YYYY-MM-DD` for the one
  unconfirmed date. Atomically idempotent by `{office_category, holder_id}` (a single `updateOne`
  upsert with `$setOnInsert`). `main()` validates its arguments before calling `connectDb()`, so a
  zero-flag invocation fails without contacting the cluster. Auto-runs only
  under the direct-invoke guard, so importing it executes nothing. Not referenced by any boot hook
  or test-setup hook. Header opens with a stop-block flagging Rene St. Dominique's unconfirmed
  Primogen-seat creation date, why it must not be defaulted to Game 1, and that it must be confirmed
  with Angelus before the script is ever run for real.

- `server/tests/oxp-1-office-seats.test.js` — **NEW**. 50 tests (41 at dev-complete, 9 added by the
  review round): 39 schema/script-logic tests with no DB, and 11 DB-backed
  (`describe.skipIf(!dbAvailable)`) against `tm_suite_test`. Covers AC1's
  valid/invalid/vacant/N-per-office cases and the `court_category` enum parity, AC2's
  required-but-nullable ObjectId typing, AC3's seven pairings, the six verbatim dates, the
  Rene-date refusal and the idempotency behaviours, and AC4's real-collection coexistence proof.
  The review round added calendar-validity coverage at both layers, a four-way concurrent-seed
  test, and two `main()` tests that mock `../db.js` to prove it validates before connecting.
  Calls the seed script's exported functions directly; never shells out to it.

- `specs/stories/oxp-1-data-lock-office-seat-schema.md` — MODIFIED. Task checkboxes; new "Deliberate
  scope exclusions (AC5)" subsection under Dev Notes; this Dev Agent Record; Change Log;
  `Status: ready-for-dev` → `review`.

- `specs/stories/sprint-status.yaml` — MODIFIED. `oxp-1-data-lock-office-seat-schema`
  `ready-for-dev` → `review`, existing comment preserved with a dev-complete note appended;
  `last_updated` refreshed. The `oxp-10-office-data-mongo-migration` line and every other line left
  untouched.

**Not modified, and deliberately so:** `server/routes/office-merit-dots.js`,
`server/routes/office-manoeuvre-rank.js`, `public/js/tabs/office-data.js`,
`server/schemas/character.schema.js`, `server/index.js`, `server/tests/helpers/test-app.js`. No
route was added, so there is no mount surface to register.

**Pre-existing dirty working tree, unrelated to this story:** the branch was handed over with a
number of modified and untracked files already present (`public/css/admin-layout.css`,
`public/js/admin/equipment-catalogue-admin.js`, `server/schemas/equipment_catalogue.schema.js`,
various `server/scripts/_acad-*` scratch files and others). None was touched by this work; the
five files above are the whole of this story's diff.

## Senior Developer Review

**Reviewer**: Codex (external), 3-pass single-session (Blind Hunter → Edge Case Hunter → Acceptance
Auditor), `model_reasoning_effort=high`, 2026-08-13. Findings written to
`specs/stories/code-review/oxp-1-codex-findings.md`; diff scoped to the three new source/test files,
base commit `ddf059f8`. Patches applied and verified in a follow-up session on the same day, on the
same branch.

**Outcome**: 1 High (patched), 1 Medium (patched), 5 Low (2 patched, 2 record corrections, 1
acknowledged as a limit of review rather than a defect) → **Approved after patching**.

Codex's High finding was independently reproduced before being trusted, rather than taken on the
reviewer's word:

```
node -e "console.log(/^\d{4}-\d{2}-\d{2}([T ][0-9:.+\-Z]+)?$/.test('2026-99-99'), new Date('2026-99-99').toString())"
// -> true, 'Invalid Date'
```

### Findings and disposition

| # | Pass | Severity | Finding | Disposition |
|---|------|----------|---------|--------------|
| 1 | 1 | **High** | The ISO-date guard in both `office_seat.schema.js` and `seed-office-seats.mjs` used bare `\d{2}` for month and day, so it accepted calendar-impossible values (`2026-99-99`) and malformed timestamps (`2026-02-21T+++`). Both produce `Invalid Date`, i.e. precisely the silent-NaN outcome the pattern's own comment says it exists to prevent, and `created_at` feeds oxp.2's months-since-creation XP arithmetic. | **Patched, at both layers.** Schema: month bounded to `0[1-9]\|1[0-2]`, day to `0[1-9]\|[12]\d\|3[01]`, so `2026-99-99` is now caught at the schema level with no JS Date object involved. Seed script: the same bounded pattern, plus a new `isRealCalendarDate` check that must also pass before any document is built. `Date.parse` alone is not sufficient; see "What the fix had to be stronger than Codex proposed" below. |
| 2 | 1 | **Medium** | `seedOfficeSeats` was only *sequentially* idempotent: `findOne` then, conditionally, `insertOne`, with a gap between the two round-trips. Two overlapping runs can both find a seat missing and both insert it, and there is no unique index on the natural key to catch it afterwards. | **Patched, and the race was reproduced first.** The write is now one atomic `updateOne` upsert on `{office_category, holder_id}` with `$setOnInsert`, checking `upsertedCount` to distinguish a real insert from a no-op. `$setOnInsert` composes correctly with the existing "never clobber an ST's hand-edited notes" behaviour, because on the match branch it writes nothing at all; that test still passes untouched. The return shape (`{planned, alreadyPresent, missing, inserted, rows}`) is preserved, including the `_id` on a present row. Dry run keeps its plain existence check, since a read-only path has nothing to make atomic. |
| 3 | 1 | Low | `main()` called `connectDb()` before the Rene-date validation, so a zero-flag invocation contacted live Atlas purely in order to throw a moment later. | **Patched.** `main()` now calls `buildSeatDocs({ reneCreatedAt: reneArg })` before `connectDb()`. No behaviour change for a valid invocation; the definitely-failing path no longer opens a connection. `seedOfficeSeats` still builds the documents itself, deliberately: it is the callable API and must not depend on `main` having pre-validated for it. |
| 4 | 1 / 3b | Low | The N-seats-per-office tests' "second validator" precaution did not create a second validator: `ajv.compile(officeSeatSchema)` on the same Ajv instance and the same schema object returns the *cached* function. | **Patched, in favour of making the record true rather than softening it.** A `freshValidator()` helper now returns a validator compiled on a genuinely separate `new Ajv(...)` instance, and one test asserts the two functions are not identical. Confirmed by mutation: the tests were run against the strengthened form and against the cached form. |
| 5 | 1 / 3b | Low | Of the three DB-backed coexistence tests, only the Primogen pair was stringified and re-validated against the schema, so the Dev Agent Record's "every stored document still validates" claim was broader than the evidence. Separately, the record said "four schema tests validate two same-category documents" when the fourth is a no-cap keyword scan. | **Tests strengthened AND the record corrected**, since strengthening was the cheaper half. A shared `asJsonDoc()` helper handles the JSON boundary (including a vacant seat's `null` holder, which must not become the string `'null'`), and all three DB tests now re-validate every stored document. The Dev Agent Record's "four schema tests" bullet is corrected to three-plus-a-keyword-scan. |
| 6 | 3a | Low | AC1's literal wording claimed `OFFICE_DATA` and `character.schema.js` share "the same five values". They do not: `OFFICE_DATA` has four and lacks Administrator, so literal full-AC conformance could not truthfully be claimed. | **Record corrected, no code change: the implementation was already right.** AC1 now states that the enum follows `character.schema.js` specifically, and says in the AC itself why `OFFICE_DATA` is not an interchangeable source (Administrator's content is oxp.8 and unwritten, while the Administrator seat is real and filled). The Dev Notes already explained this; the AC now agrees with them. |
| 7 | 3b | Low | The recorded "112/112, zero skipped" gate and two DB-dependent mutation counts were not reproducible in Codex's sandbox: Mongo was unreachable there (`MongoServerSelectionError: connect EACCES 159.143.141.178:27017`), so its own run was 62 passed / 50 skipped, 2 suites failed at setup. | **Environmental, and the historical claim independently confirmed rather than dismissed.** The gate was re-run on this machine as part of this review round, with Mongo reachable: **121 passed / 121, 6 files, zero skipped**. That is 112 plus the 9 tests this review round added, so the Dev Agent Record's original 112/112 figure reproduces exactly. This is the same transient-Mongo-reachability pattern already recorded in otc-2, oaq-2, oxp-3 and oxp-4's own review sections; both readings are accurate for their own environment. Codex was right not to report its numbers as the current gate, and right not to assert the historical claim was false. |
| 8 | 3b | Low | Codex noted that the Dev Agent Record's "the live database was never connected to" claim is not verifiable from repository state alone, since no immutable connection log exists. | **Correct, and no action needed: this is the reviewer marking the limit of its own attestation, not a defect.** Considered and accepted. What *is* verifiable is recorded under "Data-safety verification" below. |

Two Pass-1 Low findings are not in the table because they were superseded rather than dispositioned
separately: the "stored-document round-trip only validates a hand-stringified surrogate" observation
is the same JSON-boundary point as #5, and is now handled by the shared `asJsonDoc()` helper across
all three DB tests. It remains true that no consumer establishes that boundary yet, because nothing
reads `office_seats` at all; the first story that does (most likely oxp.2) is where the boundary
becomes real.

### What the fix had to be stronger than Codex proposed

Codex's suggested remedy for #1 was a `Date.parse`/`Invalid Date` check. That is necessary but not
sufficient, and finding out why changed the patch:

- `Date.parse('2026-02-30')` does **not** return NaN in V8. The strict ISO parse fails, the legacy
  fallback parser takes over, and the value silently rolls forward to 2 March. A `Date.parse` guard
  alone would have waved that through, and oxp.2 would then compute months-since-creation from a
  date nobody ever entered, which is quieter than the bug being fixed, not louder.
- No regex can express "the 30th does not exist in February" either, so bounding the day to `31`
  leaves `2026-02-30`, `2027-02-29` and `2026-04-31` all matching.

So `isRealCalendarDate` does both: a UTC round-trip on the leading `YYYY-MM-DD` (which catches the
rolled-forward cases the parser hides) and `Date.parse` on the whole string (which catches a
malformed time tail such as `2026-02-21T+++` that the permissive time pattern lets through). The
schema keeps the bounded regex and now documents the residual Feb-30 gap explicitly as accepted,
because the schema is a shape guard and the one write path that exists today closes the gap
completely.

### Prove-discrimination

Each patch was reverted alone, one at a time, and the suite re-run; then restored and re-run.
File hashes were checked after every restore.

| Reverted | Result | Restored |
|---|---|---|
| `isRealCalendarDate` check in `buildSeatDocs` (`if (false && ...)`) | **exactly 2 failures**, both calendar tests ("rejects a pattern-shaped override that is not a real calendar date", "also refuses a calendar-impossible date before connecting"). Nothing else moved. | 50/50 |
| Schema `isoDate` pattern back to unbounded `\d{2}` | **exactly 1 failure**, "rejects a calendar-impossible created_at that still has the YYYY-MM-DD shape" | 50/50 |
| Seed script's own `ISO_DATE` back to unbounded `\d{2}` | **exactly 1 failure**, "rejects a calendar-impossible override on shape alone" (the value now throws the calendar error rather than the ISO-shape one) | 50/50 |
| Atomic upsert back to the exact original find-then-insert loop | **5 of 5 runs failed**, 13 to 19 documents where 7 were expected | 5 of 5 runs green |
| `main()` reordered to `connectDb()` before validation | **exactly 2 failures**, both `main()` tests | 50/50 |

The concurrency test needed strengthening to be a real gate rather than a coin flip. With **two**
overlapping callers the old shape duplicated on roughly one run in three, which proves the bug
exists but is too flaky to gate on. With **four** it duplicated on 5 runs out of 5, while the atomic
upsert held at exactly 7 documents on 6 consecutive runs (and never once over-reported). The test
can only fail when a race actually occurs, so it is safe in the green direction.

### Regression

**121 passed / 121 across 6 files, zero skipped.** The exact gate, run from `server/` after all
patches:

```
npx vitest run tests/oxp-1-office-seats.test.js tests/office-merit-dots.test.js \
  tests/issue-1141-office-data-sync.test.js tests/otc-2-office-actions-api.test.js \
  tests/issue-1143-office-actions-auth-safety.test.js tests/issue-823-test-db-guard.test.js
```

50 of those are oxp.1's own (41 at dev-complete, 9 added by this round). All DB-backed blocks
genuinely executed rather than skipping. No unresolved High or Medium.

### Data-safety verification

- **`server/scripts/seed-office-seats.mjs` was never executed as a shell command in this review
  round, with or without flags**, and Codex's own attestation says the same of its session. The only
  code that ran it ran its *exported functions*, from vitest, against an injected `tm_suite_test`
  collection.
- **The test-DB guarantee was re-verified rather than assumed**, by reading the chain rather than
  trusting the comment: `server/vitest.config.js` installs `tests/helpers/setup-env.js` as
  `setupFiles`, which unconditionally assigns `process.env.MONGODB_DB = 'tm_suite_test'`;
  `db.js`'s `connectDb` resolves that value and calls `assertTestDbSafety(dbName, !!process.env.VITEST)`,
  which throws under vitest for any name not ending `_test`, *before* the `MongoClient` is
  constructed; and `db-setup.js`'s `setupDb` re-checks `getDb().databaseName` afterwards to catch an
  already-open connection. Three independent gates, one of them post-connection.
- **No MongoDB connection was made outside that harness.** No `.env` file was opened, no query or
  write was issued directly, and the MongoDB MCP tools were not used. The two `main()` tests reach
  `main()` with `../db.js` mocked, so even that path touched no driver.
- **The live `tm_suite` database was not read from or written to at any point in this review round.**

### Change Log

| Date | Change |
|------|--------|
| 2026-08-13 | Story implemented, all 6 ACs. New `office_seats` AJV schema (seat-keyed, N seats per office, nullable ObjectId `holder_id`, ISO `created_at`) plus a manual, dry-run-by-default, idempotent seed script for the seven real live seats, with Rene St. Dominique's unconfirmed creation date required rather than defaulted. No route, no UI, no migration of the two category-keyed office collections. 112/112 across 6 files, zero skipped; four gates prove-discriminated by mutation. The live `tm_suite` database was never connected to or written to. |
| 2026-08-13 | Codex external review (3-pass): 1 High, 1 Medium, 5 Low. Patched the High (calendar-invalid dates accepted at both the schema pattern and the seed script, the latter needing a UTC round-trip because V8's `Date.parse` silently rolls `2026-02-30` forward rather than failing), the Medium (find-then-insert replaced with an atomic `$setOnInsert` upsert, after reproducing 13-19 documents from 4 concurrent seeds where 7 were expected), and two Low (genuinely independent AJV validators; `main()` validates before connecting). Two Low were record corrections: AC1's false `OFFICE_DATA`/`character.schema.js` parity claim, and the Dev Agent Record's overstated N-seat test evidence, the latter closed by strengthening the tests to match. Codex's unreproducible-gate finding was environmental; the gate re-ran clean here at 121/121, confirming the original 112/112 exactly. 9 new tests, all five patches prove-discriminated by single-change revert. Neither reviewer nor patcher ever executed the seed script or touched live `tm_suite`. |
| 2026-08-13 | **René St. Dominique's Primogen seat creation date confirmed by Angelus: 2026-02-21 (Game 1), the same as every other Game-1 office including Yusuf Kalusicj's Primogen seat.** Both live Primogen seats have existed since Game 1; neither is "the original" and neither is "a later addition". Separately, Angelus noted Yusuf Kalusicj has only been the HOLDER of his own Primogen seat since Game 5 — a real handover happened on that seat before oxp.5 exists to log one, but this collection has no holder-history field, so the prior (unnamed) Game 1-4 holder is not represented here; that is expected, not a gap. This confirms the seat-vs-holder distinction the schema is built around, not a change to it. Only documentation changed: the seed script's header comment and this story's seat table. `RENE_PRIMOGEN_SEAT_CREATED_AT` stays `null` in source and the CLI-flag/constant refusal mechanism is untouched — the confirmed value (`--rene-created-at=2026-02-21`) is supplied by the operator at run time, per the script's existing design, not hardcoded. The seed script has still never been run for real; running it against live `tm_suite` is still Angelus's action, not an agent's. |
