# Story oxp.11: Office purchase collections, migrated to seat-keying

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the ST team,
I want `office_merit_dots` and `office_manoeuvre_ranks` keyed by the SEAT a purchase belongs to
rather than by the office category it sits under,
so that Primogen's two live seats (and Socialite's two) can hold independent purchase state, and so
oxp.5's handover reset can wipe one seat's manoeuvre progress without destroying the other seat's
unrelated progress in the same office.

## Why this story exists

`office_seats` (oxp.1, seeded live 2026-08-13) is seat-keyed: a seat's identity is its own MongoDB
`_id`, and `holder_id` is only its current pointer at a character. Seven seats exist, and two office
categories carry two concurrent seats each: Primogen (Yusuf Kalusicj, René St. Dominique) and
Socialite (Brandy LaRoux "Harpy", Carver "People's Harpy").

`office_merit_dots` (PR #1147) and `office_manoeuvre_ranks` (oxp.3) are keyed by office category
alone, `_id: 'Primogen'`. ONE document per category. There is therefore no way today to record that
Yusuf's Primogen seat has bought Contacts 3 while René's has bought nothing, or that Brandy's
Socialite seat has climbed the manoeuvre ladder and Carver's has not.

**This gap has been flagged and deliberately deferred three times, and each deferral gave the same
reason.** oxp.1's Finding 3 recorded it and declined to fix it. oxp.3's "What this story is NOT"
declined it. oxp.4 declined it again. All three leaned on the same fact: neither multi-seat office
had actually had a real purchase yet, so migrating two collections nobody had hit a bug in would
have been speculative work. That fact was re-checked live for this story on 2026-08-13 and is still
true (see "Live data" below).

**What changed is that a WRITE path now needs the distinction.** The gap became a hard blocker while
scoping oxp.5 (handover/reset logic). oxp.5 must reset a seat's manoeuvre rank to zero when that seat
changes hands. Under category-keying there is exactly one `office_manoeuvre_ranks` document for
Primogen, so resetting on one seat's handover would also wipe the other seat's unrelated progress.
oxp.2, a read-only consumer, could punt gracefully on this by returning an explicit
`spendKnown: false` flag and rendering "not attributable". A write path cannot punt the same way: it
would either destroy real state or refuse to operate at all for two of the five offices.

**Angelus's ruling, asked directly during oxp.5's scoping (2026-08-13).** The question put to him was
whether Primogen and Socialite should simply be excluded from auto-reset, or whether the collections
should actually be migrated. His answer: "then so something like code them as Primogen 1 and
Primogen 2, treat each of them as a unique seat that wipes independently." That settles it as a full
seat-keying migration, not a carve-out, not an exclusion list. This story does that migration once,
properly, ahead of oxp.5, rather than deferring it a fourth time into a story that cannot absorb it.

### The architectural reason this is safe (verified, not assumed)

oxp.4 proved by test that office merit dots survive a change of officeholder, and its proof rests on
one property: `office_merit_dots` carries no character reference at all, so nothing about a holder
change can reach it.

Re-keying by seat `_id` PRESERVES that property rather than breaking it. A seat's `_id` is minted
once by MongoDB and never changes; a handover changes only `holder_id`, which lives on the
`office_seats` document and is never copied into either purchase collection. So the same seat
resolves to the same purchase document before and after a handover, exactly as the category string
does today, while now also distinguishing Primogen's two seats from each other. AC9 re-proves this
end to end under the new keying rather than asserting it by inspection, which is the same posture
oxp.4 itself took.

**One genuinely new dependency this introduces, and it must not be glossed over.** The SERVER side
gains no holder coupling. The CLIENT side does: `office-tab.js` must now work out WHICH seat the
viewer's office corresponds to, and the only available signal is `office_seats.holder_id` matching
`char._id`. Nothing in this codebase currently maintains `holder_id`. The one-off seed script oxp.1
shipped is its only writer, and oxp.5 (which would update it on a handover) is unbuilt. So after a
real handover, `characters.court_category` will be updated through the real character-update route
while `office_seats.holder_id` will silently go stale, and the new holder will not resolve to their
own seat by holder match.

For a single-seat office that costs nothing: there is only one candidate seat, so the deterministic
fallback (AC6) lands on the correct one anyway. For a multi-seat office it could land on the wrong
seat, which is why AC6 requires the resolved seat to be named on screen whenever the category has
more than one, instead of silently picking one. **This makes "oxp.5 must write `holder_id` when a
seat changes hands" a hard requirement of oxp.5, not an optional nicety.** Record it there.

### Live data, confirmed by direct read-only query 2026-08-13 (do not re-derive, cite this)

| Collection | Live state |
|---|---|
| `office_seats` | 7 documents. `_id` and `holder_id` are real BSON ObjectIds; `created_at` is a string. Only the default `_id_` index. |
| `office_merit_dots` | 2 documents: `_id: 'Enforcer'` and `_id: 'Head of State'`. Both single-seat offices. |
| `office_manoeuvre_ranks` | 0 documents. Nothing to migrate at all. |

Both `office_merit_dots` documents contain exactly `{ "Safe Place": 0 }`. **There is no non-zero
purchase data anywhere in either collection.** `data-map.md` reads the two documents as manual
verification residue from PR #1147 rather than ST-entered game data, given the all-zero shape and the
timestamps. That is not a licence to drop them: they are Angelus's data, the migration preserves
their content verbatim, and the migration script's report must show what it moved. It does mean the
real risk of data loss in this migration is near zero, and the story should not claim otherwise.

Cross-check performed at the same time: all 7 characters with a non-blank `court_category` match
exactly one seat by `holder_id`, and no seat points at a character without a matching
`court_category`. `office_seats` and `characters.court_category` are fully consistent right now, so
the client resolution AC5 describes will succeed for every real holder on the day this ships.

## What this story is NOT

- **NOT a new seat-picker UI.** An ST or dev browsing Primogen as reference, holding no Primogen seat
  themselves, has no way to choose which of the two seats to look at. That is real UI work and it
  belongs to oxp.6 (purchase markers), which has not been built even for today's category-only model.
  This story ships the deterministic fallback plus an on-screen disclosure of which seat is being
  shown (AC6), named as a deliberate limitation, not a silent guess.
- **NOT handover or reset logic.** oxp.5 owns that. This story is oxp.5's hard prerequisite and
  changes no behaviour on a change of holder.
- **NOT a change to `office_seats` itself.** oxp.1's schema, its seed script and its `GET
  /api/office_seats` route are read-only inputs here. No new field, no new index, no schema edit.
- **NOT spend-approval routing (oxp.9), and NOT any XP bookkeeping.** Both collections stay direct
  ST-set purchase state. Nothing in this story gates, costs or approves a purchase.
- **NOT a change to `office-xp.js`'s logic.** Its `spendKnown` flag exists precisely because of the
  gap this story closes, and it is now obsolete in substance, but it fails SAFE (an over-cautious
  `false`), it has no consumer, and changing it would invalidate oxp.2's own AC8 tests. AC10 updates
  its documentation only and hands the retirement to the first real consumer.
- **NOT the pre-existing lost-update race in `_adjustMeritDots` / `office-merit-dots.js`'s `PUT`**,
  logged in `specs/deferred-work.md` under oxp.3's review. This story rewrites that route's keying
  and it is tempting to fold the fix in while the file is open. Do not. It is an orthogonal
  correctness property (concurrent writers, not seat identity), conflating them would blur what this
  migration's tests actually prove, and it already has its fix shape written down (mirror oxp.3's
  atomic `PUT /:seatId/step`). Leave it exactly where it is logged.
- **NOT an AJV schema file for either collection.** Neither has ever had one; the route handlers are
  their only validation surface, and adding two new schema files here would widen the diff without
  serving any AC. Deliberate, recorded in AC1 so a reviewer does not read it as an omission.
- **NOT `OFFICE_DATA`'s migration off static JS** (oxp.10, backlog). Both routes keep importing it.

## Acceptance Criteria

1. **Document shape.** A document in `office_merit_dots` / `office_manoeuvre_ranks` is keyed by the
   SEAT it belongs to: `_id` is that seat's own `office_seats._id` rendered as a 24-hex lowercase
   string, matching this project's existing `_id`-as-string convention for these two collections
   (they have always used a plain string `_id`, never an ObjectId). Each document additionally
   carries `office_category`, a DENORMALISED copy written from the seat on every write. The category
   is never the key, never authoritative, and never trusted over the seat: if the two ever disagree,
   the `office_seats` document wins. It exists so that (a) a `GET` response and a human reading the
   collection can tell what a bare seat id refers to without a join, and (b) an orphaned document
   whose seat has been deleted stays legible. Value fields are unchanged: `dots: { [merit]: n }` and
   `rank: n`, plus `updated_at`. No AJV schema file is added for either collection (see "What this
   story is NOT").

2. **`office_merit_dots` routes are seat-keyed.**
   - `GET /api/office_merit_dots` returns `{ [seatId]: { [merit]: dots } }`. Only the KEY changes,
     from category string to seat id string; the value shape is byte-identical to today, and a seat
     with no document is still simply absent (the client still treats missing as 0). Read stays open
     to any authenticated user.
   - `PUT /api/office_merit_dots/:seatId`, body `{ merit, dots }`, stays `requireRole('st')`. It
     resolves the seat before validating anything else: a `seatId` that is not a 24-hex string is a
     400 `VALIDATION_ERROR`; a well-formed id with no matching `office_seats` document is a **404**;
     a seat whose `office_category` has no `OFFICE_DATA` entry (Administrator today, until oxp.8) is
     a 400, preserving the existing behaviour that story's tests already pin. Merit-name and
     per-merit-cap validation is otherwise unchanged, still driven by `OFFICE_DATA[category]` and
     `MERIT_DOT_CAPS`, with the category now derived from the seat rather than taken from the URL.
     The write sets `office_category` alongside the dot value on every write, so the denormalised
     copy is self-healing and cannot drift.

3. **`office_manoeuvre_rank` routes are seat-keyed**, by the same rules as AC2, across all three of
   its verbs: `GET /` returns `{ [seatId]: rank }`; `PUT /:seatId` (absolute set) and
   `PUT /:seatId/step` (the atomic relative step oxp.3's review added) both take a seat id. The step
   route keeps its aggregation-pipeline `findOneAndUpdate` and its `[0, manoeuvres.length]` clamp
   exactly as they are: the cap is still read from the resolved seat's own office's `manoeuvres`
   array and never hardcoded, and the atomicity oxp.3's review round established must not be lost in
   the re-keying. The `$set` of `office_category` must compose with the pipeline update without
   breaking the upsert path.

4. **A one-time, manual, ST-invoked migration script** (`server/scripts/migrate-office-purchases-to-seats.mjs`)
   rewrites every existing category-keyed document to seat-keying, following
   `server/scripts/seed-office-seats.mjs`'s conventions exactly: dry-run by default with `--apply`
   required to write, idempotent, takes its collections as arguments rather than resolving them
   itself, auto-runs only under the direct-invoke guard so importing it executes nothing, and is
   wired into no boot hook and no test setup. For each category-keyed document it looks up
   `office_seats` by `office_category`:
   - exactly one seat: rewrite the document under `_id: String(seat._id)`, preserving `dots` / `rank`
     and `updated_at` **verbatim**, and adding `office_category`;
   - zero seats: REFUSE that document, report it, and leave it untouched;
   - two or more seats: REFUSE that document, report it as needing a human decision, and leave it
     untouched. Never pick one. Nothing in the live data hits this branch today (both live documents
     are single-seat offices) and it must stay a refusal rather than becoming a guess.

   Because MongoDB `_id` is immutable, the rewrite is insert-then-delete, in that order, so an
   interrupted run leaves both documents rather than neither, and a re-run recognises the seat-keyed
   document as already present and clears the stale category-keyed one. A document already keyed by a
   real seat id is recognised as migrated and skipped. Re-running after `--apply` reports zero
   migrated. `office_manoeuvre_ranks` is empty live, so the script must handle "nothing to migrate"
   as a clean, reported outcome rather than an error. **The script is Angelus's to run against live
   `tm_suite`, never an agent's.**

5. **Client resolution for the viewer's own office.** `office-tab.js` resolves a seat id before
   fetching or writing purchase state. `GET /api/office_seats` (oxp.2's read-only route) is fetched
   ONCE per render pass, not once per wiring function, and the resolved seat id is passed into both
   `_wireMeritDots` and `_wireManoeuvreRank`. When `isOwnOffice` is true, the seat is the one whose
   `office_category` matches the viewed category AND whose `holder_id` equals `String(char._id)`.

6. **Client fallback, disclosure, and the no-seat state.** When no seat matches by holder (a
   reference view, or a stale `holder_id` after an untracked handover), the tab falls back to the
   first seat for that category in a deterministic, stable order: ascending `created_at`, then
   ascending `_id` as the tie-break. Additionally:
   - Whenever the viewed category has MORE than one seat, the tab shows a short, non-interactive
     note naming which seat's purchase state is on screen (its `seat_label` if it has one, otherwise
     a short form of its seat id), reusing an existing class rather than inventing styling. This is
     the minimum honesty requirement of the fallback: without it, an ST with a stepper can silently
     edit the wrong Primogen's dots. It is a label, not a picker; choosing a different seat is
     oxp.6's job.
   - The note is only rendered where purchase state is actually rendered, so oxp.3's AC2 boundary
     holds unchanged: a non-ST browsing another office's manoeuvres still fetches no rank and still
     gets no purchase state in its DOM.
   - When the category has NO seat at all, purchase state cannot be read or written. Both mounts show
     an explicit message saying so rather than rendering a plausible row of zeros, and no PUT is
     attempted. This is a real state today for any office whose seats have not been seeded.

7. **The four existing test suites that assert category-keying are reworked, not supplemented.**
   All four genuinely change; none can be left as-is with new tests bolted alongside:
   - `server/tests/office-merit-dots.test.js` (every GET/PUT path and every `findOne({_id:'Enforcer'})`),
   - `server/tests/oxp-3-office-manoeuvre-rank.test.js` (same, plus the step route and its two
     concurrency tests, plus the source-contract block asserting the client's URL shapes),
   - `server/tests/oxp-4-merit-persistence-handover.test.js`. **Not named in the original scoping;
     found during this story's own analysis.** It PUTs to `/api/office_merit_dots/Enforcer`
     throughout, asserts `_id: 'Enforcer'`, asserts the stored document's key set, and carries a
     source-contract block asserting `_wireMeritDots`/`_adjustMeritDots` contain no `char` / `_id` /
     `holder` token at all, which AC5's resolution work interacts with directly.
   - `server/tests/issue-1141-office-tab-render.test.js` (its fake-DOM async-wiring block stubs
     `fetch` for `/api/office_manoeuvre_rank` and must now also serve `/api/office_seats`).

   DB-backed suites that now need `office_seats` fixtures must insert seats with known explicit
   `_id`s and delete exactly those, following oxp.4's escaped-fixture-prefix discipline. They must
   NOT `deleteMany({})` the shared `office_seats` collection, which oxp.1's and oxp.2's suites also
   use.

8. **The independence proof, and it is the point of the whole story.** A DB-backed test sets a
   purchase against Primogen seat A and a DIFFERENT purchase against Primogen seat B, and proves
   they are two separate documents that do not disturb one another: distinct `_id`s, both present in
   one `GET` response under their own seat ids, each carrying its own value, and neither write
   changing the other's stored document (compare `updated_at` too, not only the values, so a write
   that rewrote identical numbers back would still be caught). Proved for BOTH purchase collections
   and for Socialite as well as Primogen. **Primogen is the harder of the two and must be covered:**
   both Primogen seats carry an identical `court_title` and a null `seat_label`, so nothing but the
   document identity separates them, which is exactly the case a category-keyed implementation
   cannot express. This is the direct repro of the bug the migration exists to fix, the mirror image
   of oxp.4's own real-simulated-handover proof.

9. **oxp.4's handover-persistence guarantee is re-proved under the new keying**, not assumed to have
   survived. A DB-backed test sets dots on a seat, then performs a real handover on that seat
   (the holder character's `court_category` moves away through the real `PUT /api/characters/:id`
   route, and `office_seats.holder_id` is repointed at a second character), then re-reads and
   confirms the same seat's document is byte-identical including `updated_at`, and is visible to the
   new holder from their own auth context. A companion assertion pins the mechanism: the stored
   purchase document contains no character id and no `holder` field anywhere in its serialised form,
   the seat id being a seat's identity and not a person's.

10. **`public/js/data/office-xp.js` documentation is brought back into line, with no logic change.**
    `officeSpendKnownByCategory` and `officeSeatXp` both carry doc comments stating that spend cannot
    be attributed per seat because the purchase collections are category-keyed. That is no longer
    true. Update those comments to record that oxp.11 closed the gap, that a caller should now pass
    the SEAT's own purchase documents (which is the only shape that exists after this story), and
    that the `spendKnown` flag is retained only because it fails safe and because retiring it belongs
    with the first real consumer, oxp.6 or oxp.7. **Do not change the functions' behaviour**:
    oxp.2's AC8 tests assert Primogen and Socialite resolve `spendKnown: false`, and flipping that
    here would rewrite another story's ACs from inside this one.

## Tasks / Subtasks

- [x] Task 1 — Server: `office_merit_dots` re-keyed (AC: 1, 2)
  - [x] Read `server/routes/office-merit-dots.js` in full first, including oxp.4's two explanatory
        comments about `_id: category`. Those comments are now WRONG as written and must be rewritten
        rather than deleted: the guarantee they describe still holds, but for a different reason
        (a seat's `_id` is immutable and holder-independent), and a future reader must not be left
        with a comment that contradicts the code. Cite oxp.4 and oxp.11 both.
  - [x] Add seat resolution: a small shared helper that takes a `seatId` string, validates the
        24-hex shape, loads the `office_seats` document, and returns `{ seat, category }` or the
        appropriate failure. Both route files need it; decide during implementation whether it lives
        in a shared module or is duplicated (two short copies may be honest here, but do not
        duplicate the ObjectId-validation regex in three places).
  - [x] `GET /` keys the response by `doc._id` as before; the only change is what `_id` now means.
        Confirm the handler needs no other edit.
  - [x] `PUT /:seatId`: resolve seat, derive category, validate merit/cap against `OFFICE_DATA` and
        `MERIT_DOT_CAPS` as today, then `findOneAndUpdate({ _id: seatId }, { $set: { [dots.merit],
        office_category, updated_at } }, { upsert: true })`.
- [x] Task 2 — Server: `office_manoeuvre_rank` re-keyed (AC: 1, 3)
  - [x] Same resolution and the same three failure codes across `GET /`, `PUT /:seatId` and
        `PUT /:seatId/step`.
  - [x] The step route's aggregation-pipeline update must keep `$ifNull` / `$add` / `$max 0` /
        `$min max` and its `upsert: true` intact. Add the `office_category` write as a further
        pipeline stage or fold it into the existing second `$set`. Re-run oxp.3's two concurrency
        tests (reworked per Task 5) and confirm they still discriminate: a lost update must still
        fail them.
  - [x] Keep the stricter-than-the-sibling input validation oxp.3 shipped (no coercion of
        `null`/`''`/`[]`/booleans into a valid-looking 0).
- [x] Task 3 — Migration script (AC: 4)
  - [x] Read `server/scripts/seed-office-seats.mjs` in full first and mirror its structure: header
        stop-block, exported pure planning function, exported apply function taking collections as
        arguments, `main()` validating before `connectDb()`, direct-invoke guard via
        `pathToFileURL(process.argv[1])`.
  - [x] Plan phase (pure, no writes): classify every document in both collections as
        `already-seat-keyed` / `will-migrate` / `refused-no-seat` / `refused-ambiguous`.
  - [x] Apply phase: insert the seat-keyed document first, then delete the category-keyed one. If
        the seat-keyed `_id` already exists, do not overwrite it; treat it as already migrated and
        delete only the stale category document. Report every action.
  - [x] **Do NOT add a `#!/usr/bin/env node` shebang.** oxp.2 established that vitest's transform
        chokes on the one in `seed-office-seats.mjs`, which is why all 41 of oxp.1's tests currently
        fail to load at all. A new script that any test imports must not repeat it.
  - [x] Header must state plainly that running it bare from `server/` targets live Atlas, that
        dry-run is what makes that survivable, and that running it for real is Angelus's action.
- [x] Task 4 — Client wiring (AC: 5, 6)
  - [x] Read `public/js/tabs/office-tab.js` in full first. Note the render-generation guard
        (`el._officeManoeuvreGen`) oxp.3's review added, and preserve its semantics exactly: the
        generation is captured before the first `await` and re-checked before every DOM write. The
        new seat fetch happens BEFORE the existing purchase fetches, so it is now the first await and
        must be inside the guard.
  - [x] Introduce one async entry point that fetches `GET /api/office_seats` once, resolves the seat
        (AC5, then AC6's fallback), and then drives `_wireMeritDots` and `_wireManoeuvreRank` with
        the resolved seat id. Do not have each of them fetch seats independently.
  - [x] Handle the three outcomes explicitly: resolved-by-holder, resolved-by-fallback (with the
        disclosure note when the category has more than one seat), and no-seat-at-all (explicit
        message, no fetch, no PUT).
  - [x] `_adjustMeritDots` and `_adjustManoeuvreRank` take the seat id instead of the category. Keep
        `_adjustManoeuvreRank` sending only the signed delta to the step route; do not reintroduce a
        client-side read-compute-write.
  - [x] CSS: reuse existing classes (`.office-reference-banner` is the closest existing idiom for a
        short informational line in this tab, `.dtl-empty` for the empty/failed states). Per
        `specs/project-context.md`: tokens only, no bare hex, no `rgba()`, no inline `style="..."`.
        Existing tests assert `office-tab.js` contains no `style="` at all; keep that true.
- [x] Task 5 — Rework the four existing suites (AC: 7)
  - [x] `office-merit-dots.test.js`: seat fixtures in `beforeEach`, every URL and every `findOne` by
        seat id. Keep the negative cases (403 for a player, per-merit caps, non-integer, negative,
        back-to-zero) and add the two new failure modes: malformed seat id (400) and unknown seat
        (404).
  - [x] `oxp-3-office-manoeuvre-rank.test.js`: same, across all three verbs. The
        Administrator-has-no-`manoeuvres`-array case must now be expressed as "a seat whose category
        has no `OFFICE_DATA` entry", still a 400.
  - [x] `oxp-4-merit-persistence-handover.test.js`: rework to AC9's shape. Its source-contract block
        needs the most care. The correct restatement is: no character id ever reaches the
        `office_merit_dots` API, and no `holder_id` is ever stored in a purchase document, while the
        client legitimately reads `office_seats.holder_id` to choose a seat. Do not weaken the
        contract into vacuity to make it pass; restate what is actually still guaranteed and pin
        that. Note this file already carries one PRE-EXISTING failure on `main` (its source slice now
        catches oxp.3's merged `_adjustManoeuvreRank`, whose comment contains the word "holder") that
        this rework will naturally have to resolve or explicitly re-scope.
  - [x] `issue-1141-office-tab-render.test.js`: extend the fake-`fetch` stubs to serve
        `/api/office_seats`, and add coverage for the fallback disclosure and the no-seat state.
- [x] Task 6 — New tests (AC: 8, 9) and the migration script's own tests (AC: 4)
  - [x] New `server/tests/oxp-11-office-purchase-seat-keying.test.js`: AC8's independence proof for
        both collections and both multi-seat offices, AC9's handover proof, and the migration
        script's behaviour exercised through its exported functions against `tm_suite_test` (never
        by shelling out): single-seat rewrite preserving content verbatim, ambiguous refusal,
        no-seat refusal, idempotent re-run, and the interrupted-run recovery path.
  - [x] Prove-discrimination is mandatory on the load-bearing gates, per this epic's established bar:
        at minimum, break the seat resolution so every seat id maps to the category and confirm AC8's
        independence tests are what fail; and revert the migration's ambiguity refusal into a
        "pick the first seat" and confirm exactly the refusal test fails.
  - [x] Targeted run only. The changed area is: the two new/reworked route suites, the two reworked
        client/handover suites, the new oxp.11 suite, plus `oxp-2-derived-office-xp-calculation.test.js`
        (AC10 touches that module's comments) and `issue-823-test-db-guard.test.js`.
- [x] Task 7 — Documentation (AC: 10, and the record)
  - [x] `public/js/data/office-xp.js`: comment-only update per AC10.
  - [x] Update `D:\Terra Mortis\data-map.md`'s
        "`office_merit_dots` / `office_manoeuvre_rank` (compound)" entry: the shape has changed, the
        seat-collision risk it records is closed, and the migration it anticipated has happened.
  - [x] Record in this story's Dev Notes the residual `holder_id` staleness dependency (see "Why
        this story exists") so oxp.5 inherits it as a stated requirement rather than rediscovering it.

## Dev Notes

### Files this story touches, and their current state

**`server/routes/office-merit-dots.js`** (66 lines). `GET /` builds `out[doc._id] = doc.dots || {}`.
`PUT /:category` validates `OFFICE_DATA[category]`, then the merit name against
`officeEntry.merits`, then the value against `MERIT_DOT_CAPS[merit] || 5`, then
`findOneAndUpdate({ _id: category }, { $set: { ['dots.'+merit]: n, updated_at } }, { upsert: true })`.
Carries two oxp.4 comments about the category-only key, which Task 1 must rewrite rather than delete.

**`server/routes/office-manoeuvre-rank.js`** (110 lines). Three verbs. `PUT /:category/step` is an
aggregation-pipeline `findOneAndUpdate` with `$ifNull` / `$add` / `$max` / `$min` and `upsert: true`,
added by oxp.3's review round to close a real lost-update race that was reproduced (four concurrent
steps landing on 3 instead of 4). That atomicity is load-bearing and has its own tests; do not
regress it while re-keying.

**`public/js/tabs/office-tab.js`** (481 lines). `renderOfficeTab(el, char, chars, viewCategory)`
derives `category` and `isOwnOffice` from `char.court_category`, renders synchronously, then calls
`_wireCategoryPicker`, `_wireMeritDots(el, category, data.merits)`,
`_wireManoeuvreRank(el, category, data.manoeuvres, isOwnOffice)` and, for Head of State own-office
only, `_wireHosActions`. `char._id` is already used in this file (`_wireHosActions` does
`String(char._id)`), so it is reliably available. Note that `_wireMeritDots` is NOT gated on
`isOwnOffice` at all: merit dots render for every viewer in every view, so AC6's disclosure note
applies to reference viewers of merit dots too, whereas `_wireManoeuvreRank` returns early for a
non-ST reference viewer and shows them nothing.

**`server/routes/office-seats.js`** (oxp.2, read-only). `GET /` returns every seat with `_id` and
`holder_id` stringified and `notes` redacted to null for non-ST callers. This is the client's seat
source; it needs no change. Its `holder_id` string is directly comparable to `String(char._id)`.

**`server/index.js`** lines 30-32 (imports) and 189-193 (mounts), and
`server/tests/helpers/test-app.js` lines 35-38 / 125-129, both already mount all three office routes.
No mount changes are needed by this story, since no route is added or removed, only re-keyed.

### The known limitation this story ships deliberately

An ST or dev browsing a multi-seat office they do not hold sees ONE of its seats' purchase state,
chosen by the deterministic fallback, and can edit it with the stepper. AC6's disclosure note is what
makes that survivable rather than dangerous: the ST can at least see which seat they are editing. It
is not a fix. **oxp.6 (purchase markers) is where a real seat picker belongs**, and it will need one
for its own reasons anyway. Record the limitation in oxp.6's sprint-status entry when this lands.

### Testing standards summary

- vitest, run from `server/`, targeted only per `specs/project-context.md`. Never the full suite for
  this change.
- DB-backed blocks use `describe.skipIf(!dbAvailable)` with `setupDb`/`teardownDb`/`isDbAvailable`
  from `./helpers/db-setup.js`, forced onto `tm_suite_test` by the vitest setup file. **A skipped
  suite is not a passing suite**: read the summary line, not the exit code. AC8 and AC9 are both
  DB-backed, so a run where they skipped is not evidence they hold.
- `server/vitest.config.js` sets `fileParallelism: false` and `singleFork: true`, so suites cannot
  interleave. That is what makes shared-collection fixtures workable, but it is not licence to
  `deleteMany({})` a collection three other suites use.
- This project has no jsdom. Client behaviour is tested either through the exported pure builders
  (`manoeuvreListHtml`, `manoeuvreRankHtml`) or through the hand-rolled fake DOM already established
  in `issue-1141-office-tab-render.test.js`'s `oxp.3: async rank wiring` block. Use those; do not add
  a DOM dependency.
- Known pre-existing conditions on `main`, neither caused by nor fixed by this story:
  `server/tests/oxp-1-office-seats.test.js` does not load at all (the shebang in
  `seed-office-seats.mjs` breaks vitest's transform, so 41 tests are silently unrun), and
  `oxp-4-merit-persistence-handover.test.js` has one failing source-slice test. Do not report either
  as a regression, and do not claim a clean gate without accounting for them.

### Project Structure Notes

- New: `server/scripts/migrate-office-purchases-to-seats.mjs`,
  `server/tests/oxp-11-office-purchase-seat-keying.test.js`.
- Modified: `server/routes/office-merit-dots.js`, `server/routes/office-manoeuvre-rank.js`,
  `public/js/tabs/office-tab.js`, `public/js/data/office-xp.js` (comments only),
  `server/tests/office-merit-dots.test.js`, `server/tests/oxp-3-office-manoeuvre-rank.test.js`,
  `server/tests/oxp-4-merit-persistence-handover.test.js`,
  `server/tests/issue-1141-office-tab-render.test.js`, `specs/stories/sprint-status.yaml`, and
  `D:\Terra Mortis\data-map.md` (umbrella root, outside this repo).
- Possibly modified: `public/css/suite.css`, only if AC6's disclosure note genuinely cannot reuse an
  existing class. Check `.office-reference-banner` and `.dtl-empty` first.
- Unchanged: `server/schemas/office_seat.schema.js`, `server/scripts/seed-office-seats.mjs`,
  `server/routes/office-seats.js`, `public/js/tabs/office-data.js`, `server/index.js`,
  `server/tests/helpers/test-app.js`.
- British English, no em-dashes, in any new comment or test description.

### References

- `specs/stories/oxp-1-data-lock-office-seat-schema.md` — Finding 3 is this story's direct ancestor:
  it named this exact migration and deferred it, with reasons that were correct at the time. Its
  seven-seat table and the seat-outlives-its-holder design principle are the foundation AC1 keys on.
- `specs/stories/oxp-2-derived-office-xp-calculation.md` — "Why this story exists" states the gap
  precisely and records Angelus's ruling to report spend as undeterminable rather than approximate
  it. AC10 updates the code that ruling produced.
- `specs/stories/oxp-3-manoeuvre-purchase-graduated-merit.md` — `office_manoeuvre_ranks`' shape, the
  atomic step route, the render-generation guard, and the AC2 reference-view boundary that must
  survive this story unchanged.
- `specs/stories/oxp-4-merit-purchase-persists-handover.md` — the persistence guarantee AC9
  re-proves, its investigation of the category-only key, and its own test file that this story must
  rework.
- `server/schemas/office_seat.schema.js` — the seat document's shape and its explicit warning not to
  add a unique index on `office_category`.
- `D:\Terra Mortis\data-map.md` — the `office_merit_dots` / `office_manoeuvre_rank` compound entry,
  which already records this migration as "a small live-data migration, not a green field", and the
  `characters.court_category` entry recording Angelus's "you can have more than one Primogen" ruling.
- `specs/deferred-work.md` — the merit-dots lost-update race, deliberately untouched here.
- `specs/project-context.md` — CSS token discipline, targeted-tests-only.
- 2026-08-13 chat, Angelus's ruling: "then so something like code them as Primogen 1 and Primogen 2,
  treat each of them as a unique seat that wipes independently", and his scope call for this story
  specifically: "backend plus minimal client wiring only".

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (`claude-opus-5[1m]`), via the BMAD `bmad-dev-story` workflow, 2026-08-13.

### Debug Log References

- Baseline before any change, the four affected suites: **88 passed / 1 failed (89)**. The one
  failure was the pre-existing `oxp-4-merit-persistence-handover.test.js` source-slice test, exactly
  as the Dev Notes predicted. `mongod` was genuinely available, so no DB-backed block skipped.
- `tests/office-merit-dots.test.js` after the seat-keyed rewrite, before the route change:
  **9 failed / 15 passed** (RED). After the route change: **24 passed**.
- `tests/oxp-3-office-manoeuvre-rank.test.js` after the route change: **41 passed**.
- `tests/oxp-11-...test.js` before the migration script existed: suite failed to load on the missing
  import (RED). After: **12 passed**, then **20 passed** once AC8 and AC9 were added.
- `tests/issue-1141-office-tab-render.test.js`: **33 passed**.
- `tests/oxp-4-merit-persistence-handover.test.js`: **12 passed**, including the test that was
  failing at base.
- Final targeted run over the whole changed area (`office-merit-dots`, `oxp-3`, `oxp-4`,
  `issue-1141-office-tab-render`, `oxp-11`, `oxp-2-derived-office-xp-calculation`,
  `issue-823-test-db-guard`, `oxp-1-office-seats`): **187 tests passed, 0 failed**, across 7 passing
  files. The eighth file, `oxp-1-office-seats.test.js`, still fails to LOAD ("SyntaxError: Invalid or
  unexpected token") on the `#!/usr/bin/env node` shebang in `seed-office-seats.mjs`. That is the
  documented pre-existing breakage on `main`; `git status` confirms this story did not touch that
  script.
- Adjacent suites that import the same modules, run separately as a regression check:
  `feature.691.hos-city-status-power`, `issue-1141-office-data-sync`, `oaq-2-pending-status-actions`
  -> **72 passed**.

**Prove-discrimination, both load-bearing gates, by single-change mutation and revert:**

1. Seat resolution collapsed back to the category (`{ _id: seatId }` -> `{ _id: category }` in
   `office-merit-dots.js`): **exactly 4 tests failed, all of them AC8/AC9 independence tests** and
   nothing else. Reverted.
2. The migration's ambiguity refusal turned into "pick the first seat": **exactly 1 test failed**,
   the refusal test, and nothing else. Reverted.

### Completion Notes List

**What was built.**

- Both purchase collections are keyed by seat. `_id` is the seat's own `office_seats._id` as a
  24-hex lowercase string, keeping the plain-string `_id` convention these two collections have
  always used. Each document carries a denormalised `office_category`, rewritten on every write so it
  is self-healing, never the key, and never authoritative (the seat wins). Value fields are
  untouched.
- `server/lib/office-seat-resolve.js` is new and is the single place the 24-hex pattern exists. Both
  routes call it, so neither can drift into accepting an id shape the other rejects. It returns
  `{ seatId, seat, category, officeEntry }` or a `{ error: { status, body } }` the caller passes
  straight through: 400 malformed, 404 unknown seat, 400 seat whose office has no `OFFICE_DATA` entry
  (Administrator, until oxp.8). Resolution happens before any body validation, so a caller with two
  problems learns about the one the server could not even look up. An upper-case id is accepted and
  normalised to lower case, so it cannot mint a second document for a seat that already has one.
- The manoeuvre step route keeps its atomic aggregation-pipeline `findOneAndUpdate`, its `$ifNull` /
  `$add` / `$max 0` / `$min max` clamp and its `upsert: true` exactly as oxp.3's review left them.
  The seat lookup reads `office_seats`, not this collection, so nothing about the rank is read before
  it is written. `office_category` rides in the existing second `$set` as a `$literal`, so a future
  office name beginning with `$` could never be read as a field path.
- `office-tab.js` gained `_wirePurchaseState`, one async entry point that fetches
  `GET /api/office_seats` ONCE per render pass and drives both wiring functions with the seat it
  resolved. The render-generation counter is now captured there, before what is now the first await
  in the chain, and passed down, so oxp.3's guard semantics are preserved rather than bypassed.
  `_adjustMeritDots` gained the same post-write generation re-check `_adjustManoeuvreRank` already
  had, which fell out of the refactor rather than being added for its own sake.
- Three client outcomes are handled explicitly: resolved by holder, resolved by the deterministic
  fallback (ascending `created_at`, then ascending `_id`), and no seat at all. The fallback discloses
  which seat is on screen whenever the category has more than one, reusing `.office-reference-banner`
  and `.dtl-empty`. No CSS change was needed and no inline style was introduced. The disclosure is
  written only where purchase state is actually rendered, so oxp.3's AC2 boundary holds: a non-ST
  browsing another office's manoeuvres still fetches nothing and still gets an empty mount.
- The migration script is dry-run by default, idempotent, insert-then-delete, takes its collections
  as arguments, and auto-runs only under the direct-invoke guard. It REFUSES both the zero-seat and
  the two-or-more-seat cases and reports them rather than guessing. **It has NOT been run against
  live `tm_suite`. That is Angelus's action; the live data is untouched by this story.**

**The named trap was avoided.** The new script has no `#!/usr/bin/env node` shebang. Verified by
byte inspection (the file begins `/**`) and, more usefully, by the fact that
`oxp-11-office-purchase-seat-keying.test.js` imports it and loads cleanly, while
`oxp-1-office-seats.test.js` still does not.

**How `oxp-4-merit-persistence-handover.test.js` was restated rather than weakened.** Its
source-contract block previously asserted that the merit-dot functions contain no `char`, `_id` or
`holder` token at all. Two things about that needed care. First, its slice ran from `_wireMeritDots`
to `_wireHosActions`, which swept in `_wireManoeuvreRank` and `_adjustManoeuvreRank` and caught the
word "holder" in oxp.3's merged comment. That is the pre-existing failure on `main`, and it was a
drifted end anchor, not a real finding: the block's own docstring already said "excluding
neighbours". The anchor now ends at `_wireManoeuvreRank`, with a test asserting the slice contains
neither neighbour, so the fix cannot silently un-fix itself. Second, the contract itself genuinely
changed, and is now stated as what is actually still guaranteed: no character id ever reaches the
`office_merit_dots` API (neither function takes, reads or sends one), and no `holder_id` is ever
stored in a purchase document (proved server-side against the serialised form). The new dependency
is pinned rather than denied: a test asserts that every real read of `s.holder_id` in the whole file
lies inside `_wirePurchaseState`, that the holder match is reduced to a seat id before anything else
sees it, and that the resolution block calls no write API at all. The `\b_id\b` assertion was
dropped because it is now false by design, and keeping it would have meant obfuscating the seat id.

**AC9 is proved in two places, deliberately, and they are not duplicates.**
`oxp-4-merit-persistence-handover.test.js` proves the single-seat chain end to end with a full
handover: `court_category` moved through the real `PUT /api/characters/:id` route AND
`office_seats.holder_id` repointed at a second character, then the document re-read byte-identical
including `updated_at`, then read again from the new holder's own auth context. The new oxp-11 suite
proves the case that only exists because of this story: a handover on ONE of Primogen's two seats,
leaving both seats' documents untouched.

**AC8's `updated_at` comparisons are real.** Two writes in the same millisecond would share a
timestamp and quietly weaken every "the other seat did not change" assertion, so the tests tick a few
milliseconds between writes and then assert the two timestamps genuinely differ.

**The residual `holder_id` staleness dependency, recorded here so oxp.5 inherits it as a stated
requirement.** Nothing in this codebase maintains `office_seats.holder_id`. oxp.1's one-off seed
script is its only writer and oxp.5 is unbuilt, so after a real handover `characters.court_category`
is updated through the real character route while `holder_id` silently goes stale, and the new holder
stops resolving to their own seat by holder match. For a single-seat office that costs nothing, since
the fallback lands on the only candidate. For Primogen or Socialite it can land on the WRONG seat,
which AC6's disclosure note makes visible but does not fix. **"oxp.5 must write `holder_id` when a
seat changes hands" is therefore a hard requirement of oxp.5, not a nicety**, and it has been written
into oxp.5's `sprint-status.yaml` entry. oxp.6's entry likewise now carries the seat-picker
limitation this story ships deliberately.

**Deliberately not done**, per "What this story is NOT": the pre-existing lost-update race in
`_adjustMeritDots` / the merit-dots `PUT` is untouched and stays exactly where it is logged in
`specs/deferred-work.md`; `office-xp.js`'s `spendKnown` behaviour is unchanged (comments only, AC10);
no AJV schema file was added for either collection; `OFFICE_DATA` stays static JS (oxp.10); and no
seat-picker UI was built (oxp.6).

### File List

**New**

- `server/lib/office-seat-resolve.js`
- `server/scripts/migrate-office-purchases-to-seats.mjs`
- `server/tests/oxp-11-office-purchase-seat-keying.test.js`

**Modified**

- `server/routes/office-merit-dots.js`
- `server/routes/office-manoeuvre-rank.js`
- `public/js/tabs/office-tab.js`
- `public/js/data/office-xp.js` (comments only)
- `server/tests/office-merit-dots.test.js`
- `server/tests/oxp-3-office-manoeuvre-rank.test.js`
- `server/tests/oxp-4-merit-persistence-handover.test.js`
- `server/tests/issue-1141-office-tab-render.test.js`
- `specs/stories/sprint-status.yaml`
- `specs/stories/oxp-11-office-purchase-seat-keying.md`
- `D:\Terra Mortis\data-map.md` (umbrella root, outside this repo)

**Unchanged, as the story required**: `server/schemas/office_seat.schema.js`,
`server/scripts/seed-office-seats.mjs`, `server/routes/office-seats.js`,
`public/js/tabs/office-data.js`, `server/index.js`, `server/tests/helpers/test-app.js`,
`public/css/suite.css` (AC6's note reuses `.office-reference-banner` and `.dtl-empty`, so no new
class was needed).

## Senior Developer Review

## Change Log

| Date | Change |
|------|--------|
| 2026-08-13 | Implemented, status `ready-for-dev` -> `review`. All 10 ACs satisfied, all 34 subtasks complete. Both purchase collections re-keyed to seat, one shared resolver added at `server/lib/office-seat-resolve.js`, migration script written (dry-run default, refuses rather than guesses, NOT yet run against live `tm_suite`), client resolves one seat per render pass with a deterministic fallback and an on-screen disclosure for multi-seat offices. Four suites reworked, one added. 187 tests passed / 0 failed across the changed area, with `mongod` available so the DB-backed independence and handover proofs genuinely ran. Both load-bearing gates prove-discriminated by single-change mutation and revert. The pre-existing `oxp-1-office-seats.test.js` load failure is unchanged and untouched. The residual `holder_id` staleness dependency is recorded in the Dev Agent Record and written into oxp.5's sprint-status entry as a hard requirement; oxp.6's entry now carries the seat-picker limitation. |
| 2026-08-13 | Story created. Scope settled directly with Angelus before ACs were written: full seat-keying migration rather than a multi-seat carve-out, and backend plus minimal client wiring only (no new seat-picker UI, which stays oxp.6's). Live data re-confirmed read-only: `office_merit_dots` still holds only `Enforcer` and `Head of State`, both single-seat and both containing exactly `{ "Safe Place": 0 }`; `office_manoeuvre_ranks` is still empty; all 7 seats still match a character by `holder_id`. The "seat-keying preserves oxp.4's handover guarantee" reasoning was checked and holds server-side, but analysis surfaced a genuinely new client-side dependency on `office_seats.holder_id`, which nothing currently maintains, making "oxp.5 must write `holder_id` on a handover" a stated requirement of oxp.5 and motivating AC6's fallback disclosure. Analysis also found a fourth affected test suite the original scoping did not name: `oxp-4-merit-persistence-handover.test.js`. |
