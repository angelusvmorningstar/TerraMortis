# Story oxp.4: Merit purchase — persists across handover

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an ST,
I want confidence, proven by a real test rather than by reading the code and hoping, that an
office's purchased merit dots survive a change of officeholder,
so that "institutional merits persist across handover" — the epic's own design promise — is a
verified fact about this codebase, not an assumption nobody has actually checked.

## Why this story exists

`specs/epic-oxp-office-xp-economy.md` (dev branch only — `git show
dev:specs/epic-oxp-office-xp-economy.md`) names two purchase categories with opposite handover
behaviour: "Merits — persist across handover (institutional infrastructure)" vs "Manoeuvres —
bought as a graduated merit in fixed rank order, reset to zero on handover, spent XP lost." oxp.3
just shipped the manoeuvre side as a minimal ST-set stopgap (no reset logic — that's explicitly
oxp.5's job, still backlog). This story is oxp.4, the merit side's own slot in
`specs/stories/sprint-status.yaml`.

**The investigation this story is built on:** office merit dots already have a shipped tracker —
PR #1147 (`office-merit-dots`, 2026-08-12), `server/routes/office-merit-dots.js` +
`office-tab.js`'s `_wireMeritDots`/`_adjustMeritDots`. Reading it end to end (both the route and
the `office_merit_dots` collection's actual key shape) shows the storage is keyed **purely by
office category** (`_id: category`, e.g. `_id: 'Enforcer'`) with **no character or holder reference
anywhere** — not in the schema, not in the read path, not in the write path. `character.schema.js`
confirms the other half: `court_category` is a plain nullable enum string on the character
document, with no history field, no "since" timestamp, and (confirmed by a codebase-wide grep) **no
handover-detection trigger of any kind exists anywhere in this project.**

The honest conclusion, verified by reading the real code rather than assumed from the epic's prose:
**merit persistence across handover is already true today, by construction, as an accidental
consequence of how PR #1147 was keyed** — not because anyone built persistence logic, but because
nothing was ever built that COULD reset it. There is no new mechanism to write. What's missing is
proof: a test that actually exercises a simulated handover (character A holds the office with dots
set → `court_category` changes away from A → the dots are still there, unchanged, under that
category → character B's `court_category` becomes that category → B sees the same dots B never
purchased). Right now nothing in this codebase demonstrates that chain; it is true by inspection,
not by verification.

## What this story is NOT

- NOT new persistence mechanism. There is nothing to build for the "merits survive handover"
  requirement itself — it already holds. Do not add a holder-tracking field, a snapshot-on-handover
  routine, or any other new plumbing to "make" persistence happen; that would be solving an already-
  solved problem and risks introducing the very holder-coupling that currently doesn't exist and
  isn't needed.
- NOT manoeuvre-rank reset-on-handover (oxp.5, still backlog, still unbuilt). oxp.3's manoeuvre rank
  ALSO currently persists across a handover with no reset — which is a mismatch with the epic's
  target design for manoeuvres specifically (merits are supposed to persist, manoeuvres are supposed
  to reset), but fixing that mismatch is explicitly oxp.5's job, not this story's. Do not add reset
  logic to either collection here.
- NOT the pre-existing lost-update race in `_adjustMeritDots`/`office-merit-dots.js`'s stepper
  (logged in `specs/deferred-work.md` → "Deferred from: code review of
  oxp-3-manoeuvre-purchase-graduated-merit" — the exact same read-compute-write race oxp.3's own
  manoeuvre stepper had before its review round fixed it with an atomic `PUT /:category/step`).
  **Deliberate scope call:** persistence-across-handover and concurrent-write-safety are orthogonal
  correctness properties — one is about data surviving an unrelated field changing elsewhere, the
  other is about two simultaneous writers not clobbering each other. Conflating them would blur this
  story's actual claim. Leave the race exactly where it's already logged, with its fix shape already
  spelled out there (mirror oxp.3's own patch) — pick it up as its own small story if/when wanted.
- NOT Epic OXP's full accrual/spend economy (oxp.1 data-lock, oxp.2 derived XP calc — both still
  backlog). This story does not touch XP bookkeeping, spend cost, or OAQ approval routing, for the
  same reason oxp.3 didn't: there is no XP spend event here to gate.
- NOT a UI/copy change to the Merit Suite section unless Task 2's investigation (below) finds a
  real, demonstrable confusion risk. Do not add "institutional / persists across handover" framing
  copy speculatively — check first whether a new holder seeing pre-existing dots is actually
  ambiguous in the current UI, given there is no XP-spend framing anywhere near it yet to make
  "already purchased" look like "you spent XP on this."

## Acceptance Criteria

1. A new server-side test proves, end to end through the real route (not just by reading the
   schema), that `office_merit_dots` data set for a given office category is unaffected by any
   change to a character's `court_category` field. Concretely: PUT dots for a category while
   character A's `court_category` is that category; change A's `court_category` to something else
   (or null) via whatever this project's normal character-update path is; GET the category's dots
   again and confirm they are byte-identical to what was set, with no code path having touched them.
2. The same test (or a sibling one) demonstrates the "new holder inherits" half explicitly: after
   the change in AC1, set a DIFFERENT character B's `court_category` to the same office category,
   and confirm the office's merit dots (fetched via `GET /api/office_merit_dots`) are unchanged and
   visible to B exactly as they were to A — because the data was never keyed to either character in
   the first place.
3. A client-side wiring test (mirroring the existing `_wireMeritDots` test-file pattern) confirms
   `office-tab.js` never passes a character id, `char` object, or any holder-specific identifier
   into either the `GET /api/office_merit_dots` fetch or the `PUT /api/office_merit_dots/:category`
   call — only the office `category` string. This is the structural guarantee that makes AC1/AC2
   true and it should be pinned by a test, not left as an inference from today's source reading.
4. The story's own investigation (already done during story-writing, see "Why this story exists")
   is carried into the story's Dev Notes and, in a short form appropriate for a future reader, into
   a comment in `server/routes/office-merit-dots.js` near the collection's `_id: category` keying,
   noting explicitly that this is what makes merit persistence-across-handover hold, so a future
   change to key this collection by character (which would seem like a reasonable refactor in
   isolation) doesn't silently break the epic's own institutional-persistence design intent without
   whoever makes that change realising it.
5. No code change to `_adjustMeritDots`, `office-merit-dots.js`'s `PUT /:category` route, or any
   handover/reset mechanism. This story's diff should be small: new tests plus one explanatory code
   comment. If the investigation in Task 2 (UI clarity check) finds a genuine need for a copy
   change, that's the one exception — keep it small and cite the specific confusion it fixes.

## Tasks / Subtasks

- [x] Task 1 — Server-side persistence proof (AC: 1, 2)
  - [x] New test file `server/tests/oxp-4-merit-persistence-handover.test.js`, DB-backed
        (`describe.skipIf(!dbAvailable)`, mirroring `office-merit-dots.test.js`'s own setup/teardown
        pattern — `setupDb`/`teardownDb`/`isDbAvailable` from `./helpers/db-setup.js`).
  - [x] Find this project's real character-update path for `court_category` (check
        `server/routes/characters.js` or wherever `PUT /api/characters/:id` lives — do not assume,
        read the actual route and its schema validation before writing the test against it).
  - [x] AC1's test: create/seed two minimal test characters (or reuse this project's existing
        character test-fixture helper if one exists — check `server/tests/helpers/` first). Set
        merit dots for a category via the real `PUT /api/office_merit_dots/:category` route (ST
        auth). Change character A's `court_category` away from that category via the real character
        update route. Re-fetch `GET /api/office_merit_dots` and assert the category's dots are
        exactly what was set, untouched.
  - [x] AC2's test: continue from AC1's state (or a fresh equivalent) — set character B's
        `court_category` to the same category A vacated. Re-fetch the dots again, confirm still
        unchanged and correctly attributed to that category regardless of which character
        (including a character who never touched the PUT route at all) currently holds it.
- [x] Task 2 — Client wiring proof + UI clarity check (AC: 3, and the UI-copy exception under "What
      this story is NOT")
  - [x] Extend or add to the existing merit-dots client-wiring test block (see
        `office-merit-dots.test.js`'s own "client wiring" describe, or `office-tab.js`'s
        `_wireMeritDots`/`_adjustMeritDots` source directly) with a source-contract assertion that
        neither function's fetch/PUT call sites ever interpolate a character id or `char.*`
        property into the URL or body — only `category` and `merit`/`dots`.
  - [x] Read the Merit Suite section's actual rendered output (`office-tab.js`'s
        `office-merit-list`/`office-merit-row` markup) as a genuinely new holder would first see it.
        Judge honestly: does seeing non-zero dots on an office you just started holding read as
        confusing, alarming, or unexplained, given there is no XP-spend UI anywhere near it yet to
        make it look like YOUR spend? If genuinely yes, propose and make the smallest possible copy
        addition (a one-line note, not a redesign) and say exactly what confusion it resolves. If
        no — and the honest expectation, given the investigation above, is that the answer is
        "no, it just looks like the office's existing merit suite, which is what it is" — say so
        explicitly in the Dev Agent Record rather than inventing a change to look busy.
- [x] Task 3 — Documentation (AC: 4)
  - [x] Add a short comment in `server/routes/office-merit-dots.js`, near the `_id: category`
        keying in both the GET handler's `out[doc._id] = ...` line and the PUT handler's
        `findOneAndUpdate({ _id: category }, ...)` — explaining that this category-only key (no
        character reference) is precisely
        what makes merit persistence-across-handover (epic-oxp's own design requirement) hold
        automatically, and that keying this collection by character instead would silently break
        that guarantee. Keep it to 2-4 lines, cite this story by name (`oxp.4`) the way this
        codebase's other inline comments cite story/issue numbers.
  - [x] In the story's own Dev Notes (this file), record the investigation finding in full so a
        future reader of `sprint-status.yaml`'s oxp.4 entry understands WHY this story's diff is
        small — it confirms a design requirement was already met, it doesn't build one.

## Dev Notes

### The investigation (do not re-derive — this is already verified, cite it)

Confirmed directly against the real code during story-writing, 2026-08-13:

- `server/routes/office-merit-dots.js`: `GET /` does `for (const doc of docs) out[doc._id] =
  doc.dots || {}` — `doc._id` IS the office category string. `PUT /:category` does
  `col().findOneAndUpdate({ _id: category }, { $set: { [\`dots.${merit}\`]: n, ... } }, { upsert:
  true, ... })`. Neither handler reads, writes, or references any character id, `req.user`'s
  identity beyond the `requireRole('st')` gate, or any holder field. The **only** key is the office
  category string itself.
- `server/schemas/character.schema.js:78`: `court_category: { type: ['string', 'null'], enum: [...]
  }` — a plain nullable enum, no companion `court_category_since` timestamp, no history array, no
  audit trail of prior holders.
- Project-wide grep (`handover`, `holder_since`, `seat_holder`, `officeholder`) turned up **zero**
  matches outside documentation/spec prose — there is no handover-detection code anywhere in this
  codebase to hook into, and this story does not need one, because the persistence guarantee this
  story exists to verify does not depend on detecting a handover at all — it depends on there being
  no character-keyed state to invalidate in the first place.
- Conclusion: `office_merit_dots`' category-only keying is what makes "merits persist across
  handover" true, and it was true from PR #1147 onward, not something oxp.4 needs to build. This
  story's job is proof and documentation, not new mechanism — see Acceptance Criteria above, which
  are written to test an EXISTING guarantee, not specify a new one.

### Current state of the files this story touches

**`server/routes/office-merit-dots.js`**: see the investigation above — this file is read-only for
this story except for Task 3's explanatory comment. Do not change its logic.

**`public/js/tabs/office-tab.js`**: `_wireMeritDots` (fetches `GET /api/office_merit_dots`, filters
client-side to `dotsByCategory[category]`) and `_adjustMeritDots` (re-fetches fresh, computes
`next` client-side, `PUT`s the absolute value — this is the OLD read-compute-write shape, NOT
oxp.3's later atomic-step fix; that fix was applied only to the sibling manoeuvre-rank code and is
explicitly out of this story's scope per "What this story is NOT"). Both are read-only for this
story except for Task 2's source-contract test addition.

**`server/tests/office-merit-dots.test.js`**: existing test file, the direct structural precedent
for Task 1's new file — read its `setupDb`/`teardownDb`/`isDbAvailable` pattern and its "client
wiring" describe block (source-text contract assertions) before writing anything new.

**Character update route**: NOT YET IDENTIFIED as of story-writing — Task 1's first subtask is to
find it for real (likely `server/routes/characters.js`, `PUT /api/characters/:id` or similar) rather
than the story author guessing its shape. Read it before writing against it.

### Testing standards summary

- vitest, `cd server && npx vitest run tests/oxp-4-merit-persistence-handover.test.js` plus whichever
  existing merit-dots test file gets the Task 2 addition. Targeted only, per
  `specs/project-context.md` — do not run the full suite for this change.
- DB-backed tests need a local `mongod`; without one they skip rather than fail
  (`describe.skipIf(!dbAvailable)`) — a skipped suite is not evidence AC1/AC2 hold, read the summary
  line for a real pass count before considering this story done.

### Project Structure Notes

- New file: `server/tests/oxp-4-merit-persistence-handover.test.js`.
- Modified: `server/routes/office-merit-dots.js` (comment only), possibly
  `server/tests/office-merit-dots.test.js` or `office-tab.js`'s existing client-wiring test location
  for Task 2's source-contract addition (confirm the right home during implementation), and possibly
  `public/js/tabs/office-tab.js` itself ONLY if Task 2's UI-clarity check finds a real need — treat
  that as the exception, not the default.
- British English, no em-dashes, in any new prose (comments, test descriptions).

### References

- [Source: server/routes/office-merit-dots.js] — the file whose category-only keying this story
  exists to verify and document.
- [Source: server/schemas/character.schema.js#L78] — `court_category`'s plain-enum shape, confirming
  no holder-history mechanism exists to interact with.
- [Source: server/tests/office-merit-dots.test.js] — direct structural precedent for Task 1's new
  test file and Task 2's client-wiring assertions.
- [Source: specs/stories/oxp-3-manoeuvre-purchase-graduated-merit.md] — sibling story; its own
  Senior Developer Review documents the atomic-step fix this story deliberately does NOT bring to
  merit-dots (see "What this story is NOT").
- [Source: specs/deferred-work.md → "Deferred from: code review of
  oxp-3-manoeuvre-purchase-graduated-merit"] — the pre-existing merit-dots lost-update race this
  story deliberately leaves alone.
- [Source: specs/epic-oxp-office-xp-economy.md] (dev branch only — `git show
  dev:specs/epic-oxp-office-xp-economy.md`) — parent epic; oxp.4's one-line scope statement
  ("Institutional; survives a change of holder, unlike manoeuvres") that this story verifies.
- [Source: specs/project-context.md] — targeted-tests-only discipline, no-em-dash rule.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (1M context), via the `bmad-dev-story` workflow.

### Debug Log References

- **The character-update route, found rather than assumed** (Task 1's first subtask). It is
  `PUT /api/characters/:id` in `server/routes/characters.js:451`, ST-only
  (`requireRole('st')`), running `stripEphemeral` then `validateCharacterPartial` then three
  normalise/validate middlewares, and finishing with
  `col().findOneAndUpdate({ _id: oid }, { $set: updates }, { returnDocument: 'after' })`. It
  destructures `_id` and `willpower` out of the body and `$set`s everything else, so a body of
  `{ court_category: 'Enforcer' }` is a genuine partial update, not a whole-document replace.
  `court_category` passes `characterPartialSchema` because the partial schema is the full schema
  with `required` stripped, and the enum on line 78 already admits `null` and `''`. The tests use
  this route, not a raw collection write, so AC1's "via whatever this project's normal
  character-update path is" is satisfied against the real middleware stack. Characters are created
  through the equally real `POST /api/characters` (ST-only, full `validateCharacter`, `required:
  ['name']`, `additionalProperties: false`).
- **Red phase, done properly for a proof story.** This story's ACs describe a guarantee that already
  holds, so the tests were green on their first run (10/10). Green-on-first-run proves nothing about
  whether the assertions are live, so both halves were mutation-tested before being accepted:
  - Server half: temporarily added
    `if (hasOwnProperty(updates,'court_category')) await getCollection('office_merit_dots').deleteMany({})`
    to `PUT /api/characters/:id`, i.e. the exact holder-coupling this story exists to rule out.
    Result: **3 failed / 7 passed**: the three handover-chain tests (AC1, AC2, and the
    unrelated-second-category test) all fired, and nothing else did. Reverted; `git diff` on
    `server/routes/characters.js` confirmed empty afterwards.
  - Client half: temporarily added a sixth `char` parameter to `_adjustMeritDots`'s signature.
    Result: **2 failed / 8 passed**: the "never references a character" and "takes no character
    argument" contracts both fired. Reverted; `git diff` on `public/js/tabs/office-tab.js` confirmed
    empty afterwards.
  Without those two runs the 10/10 would have been indistinguishable from ten assertions that can
  never fail.
- **The DB was genuinely available, not silently skipped.** The five `describe.skipIf(!dbAvailable)`
  tests reported as *passed*, not skipped, in every run (10 total = 5 DB-backed + 5 source-contract).
  Per the story's own testing-standards note, a skipped suite would not have been evidence for
  AC1/AC2; this one is.
- **Concurrency check on the shared test database.** `office-merit-dots.test.js` does
  `deleteMany({})` on `office_merit_dots` in its own `beforeEach`, which would have raced this new
  file had the two run in parallel. Checked `server/vitest.config.js` before writing: it sets
  `fileParallelism: false` and `singleFork: true`, so files run serially in one process and the two
  suites cannot interleave. Confirmed empirically by running both files in one invocation: 28/28.
- **Fixture isolation.** This suite's `beforeEach`/`afterAll` delete only characters whose name
  starts with `OXP4 Handover `, never the whole `characters` collection, so it cannot strip fixtures
  other suites seeded into `tm_suite_test` (`getTestCharacterIds`'s `_test_seeded` stubs in
  particular).

### Completion Notes List

- **All 5 ACs satisfied. Final targeted run: 38/38 across 3 files, 0 failed, 0 skipped**
  (`oxp-4-merit-persistence-handover.test.js` 10/10, `office-merit-dots.test.js` 18/18,
  `issue-1141-office-tab-render.test.js` 10/10). The third file was run because it is the only other
  suite touching `office_merit_dots`; per the targeted-tests-only rule the full suite was not run.
- **This story built no mechanism, as instructed.** The diff is one new test file plus two
  explanatory comments in an existing route. No holder-tracking field, no snapshot-on-handover
  routine, no reset logic, and no change whatever to `_adjustMeritDots` or to
  `office-merit-dots.js`'s `PUT /:category` logic. AC5's "small diff" constraint holds: the only
  edits to non-test source are comment lines.
- **The investigation the story was built on was re-confirmed, not taken on trust**, since it is the
  entire load-bearing claim. `office-merit-dots.js` reads `out[doc._id] = doc.dots || {}` and writes
  `findOneAndUpdate({ _id: category }, ...)`; `character.schema.js:78` is a bare nullable enum with
  no companion history or timestamp field; and the hard-delete cascade in `characters.js:757`
  sweeps `downtime_submissions`, `ordeal_submissions`, `histories`, `questionnaire_responses`,
  `tracker_state`, `game_sessions`, `players` and `npcs` but not `office_merit_dots`. That last
  point was not in the story's own investigation and is now pinned by its own test: deleting the
  holder character outright leaves the office's merit suite intact.
- **Two tests beyond the literal ACs, both cheap and both closing a real hole:**
  (a) the stored document's key set is asserted to be exactly `['_id','dots','updated_at']` with
  `_id === 'Enforcer'`, and its JSON serialisation asserted to contain neither the holder's id nor
  the strings `character`/`holder`. This pins the *mechanism*, so a future refactor that adds a
  `held_by` field fails here rather than passing quietly until someone runs a handover;
  (b) the hard-delete case above, which is the sharpest version of "a change of holder".
- **AC1 is asserted on `updated_at`, not just on the dot values.** Comparing the returned map alone
  would pass even if some code path rewrote the identical values back. Comparing the whole stored
  document including its `updated_at` string is the strongest available evidence that nothing wrote
  to it at all, which is what "with no code path having touched them" actually claims.
- **AC2's "visible to B" is tested from B's own auth context**, not only from the ST's. The final
  fetch in that test uses `playerUser([holderB])`, exercising the route's deliberately public read
  gate, so the assertion is "B can see dots B never purchased" rather than "an ST can see them and
  we assume B could too".
- **Task 2's UI-clarity verdict: no copy change needed, and adding one now would be actively
  wrong.** Read the rendered Merit Suite as a new holder would meet it: `office-tab.js:92-95` emits
  a `Merit Suite` section heading and rows of `office-merit-chip` (merit name) plus
  `office-merit-dots` (`●●●○○`), with the `cs-step-btn` stepper only for ST/dev. There is no cost,
  no XP figure, no "purchased", no "you", and no ownership language anywhere in it. It sits as the
  fourth office-level block after Asset, Status Power and Manoeuvres, all of which are plainly
  properties of the office rather than of whoever currently holds it, and the whole panel is
  category-framed: the header shows the office role, a picker lets you browse any of the five
  offices, and browsing another office even prints "Reference view. Showing what this office grants,
  not your own." (line 42). In that frame, non-zero dots on an office you have just taken read as
  the office's existing kit, which is exactly what they are.
  Beyond "no confusion to fix", there is a positive reason not to add the epic's
  "institutional / persists across handover" framing yet: oxp.5 has not shipped, so manoeuvre rank
  currently persists across handover too. Labelling only the Merit Suite as persistent would assert
  a contrast the running app does not yet have, and would quietly become a lie in the other
  direction on the day oxp.5 lands and manoeuvres start resetting. The right moment for that copy is
  oxp.5 or oxp.6, when the two behaviours actually differ and the difference is worth explaining.
- **Task 2's client-wiring test was placed in the new file rather than appended to
  `office-merit-dots.test.js`'s existing "client wiring" describe.** The story permitted either. It
  lives with AC1/AC2 because it is the client half of the *same* argument: the server tests show
  nothing reaches the collection from the character side, and these show nothing reaches it from the
  client side either. A future reader who opens the oxp.4 file gets the whole proof in one place
  instead of half of it. The existing describe in `office-merit-dots.test.js` is untouched.
- **The source-contract block is sliced on function boundaries, not on line endings.** It cuts from
  `async function _wireMeritDots` to `async function _wireHosActions`, which is CRLF-safe (oxp.3's
  own record documents a test bug from slicing on `'\n}\n'` in this same file), and asserts the
  slice contains both function names first so the contracts cannot silently pass against an empty
  string if those functions are ever renamed or reordered.
- **No deviations from the Task breakdown.** Nothing in "What this story is NOT" was touched: the
  pre-existing lost-update race in `_adjustMeritDots` is left exactly where `specs/deferred-work.md`
  logged it, oxp.5's reset logic remains unbuilt, and no XP bookkeeping was added.

### File List

- `server/tests/oxp-4-merit-persistence-handover.test.js`: **NEW**. 10 tests. Five DB-backed
  (`describe.skipIf(!dbAvailable)`): AC1's vacate-the-office case asserting the whole stored document
  including `updated_at` is unchanged; AC2's full handover with a second character inheriting dots
  they never purchased, verified from that character's own player auth context; an unrelated-second-
  category control; a key-shape assertion pinning `_id: category` with no holder reference in the
  document at all; and the hard-delete-the-holder case. Five source-contract tests over
  `_wireMeritDots`/`_adjustMeritDots`: no query string on the GET, category-only URL and
  `{ merit, dots }`-only body on the PUT, no `char`/`character_id`/`holder`/`_id` token anywhere in
  either function, and both signatures pinned.
- `server/routes/office-merit-dots.js`: MODIFIED, **comments only, no logic change**. Four lines
  above the GET handler's `out[doc._id] = ...` explaining that `doc._id` IS the office category and
  that this is what makes handover-persistence hold, pointing at the new test file; four lines above
  the PUT handler's `findOneAndUpdate({ _id: category }, ...)` warning that re-keying this collection
  by character would look like a reasonable refactor in isolation and would silently break the
  guarantee. Both cite `oxp.4` by name, matching this file's existing story-citing comment style.
- `specs/stories/oxp-4-merit-purchase-persists-handover.md`: MODIFIED. Task checkboxes, this Dev
  Agent Record, `Status: ready-for-dev` → `review`.
- `specs/stories/sprint-status.yaml`: MODIFIED. `oxp-4-merit-purchase-persists-handover`
  `ready-for-dev` → `review` with a dev-complete note appended to its existing comment;
  `last_updated` refreshed. The stale `oxp-3` line and its inline note were deliberately left
  untouched.

**Touched and reverted during the red phase, not part of this story's diff:**
`server/routes/characters.js` and `public/js/tabs/office-tab.js` both carried a temporary sabotage
to prove the assertions discriminate (see Debug Log). Both were restored and verified clean with
`git diff` before the final test run.

## Senior Developer Review

**Reviewer**: Codex (external), 3-pass single-session (Blind Hunter → Edge Case Hunter → Acceptance
Auditor), `model_reasoning_effort=high`, 2026-08-13. Findings written to
`specs/stories/code-review/oxp-4-codex-findings.md`; prompt at
`specs/stories/code-review/oxp-4-codex-review.md`; diff scoped to source/tooling only (comment-only
route change plus the new test file), base commit `ddf059f8`.

**Outcome**: 0 High, 1 Medium (environmental, independently disproven), 2 Low (1 accepted
limitation, 1 patched) → **Approved**.

### Findings and disposition

| # | Pass | Severity | Finding | Disposition |
|---|------|----------|---------|--------------|
| 1 | 3b | Medium | Codex's own environment hit `EACCES` connecting to a remote Mongo address (`159.143.141.178:27017`), so all five DB-backed OXP-4 tests and 13 sibling DB tests skipped in its run, leaving its reported "38/38" gate and both mutation-testing reproductions unverifiable from inside its own sandbox | **Dismissed, disproven with a fresh independent run**: re-ran the exact gate on this machine immediately after the review — 38/38, 0 skipped, matching the Dev Agent Record's original claim exactly. Same transient-Mongo-reachability class already recorded for otc-2/oaq-2/oxp-3; both readings are accurate for their own environment, not reconciled further. Codex's client-side mutation (adding a `char` parameter to `_adjustMeritDots`) DID run in its sandbox, since that half needs no DB, and reproduced the exact 2-test failure the Dev Agent Record claims — so the one mutation Codex could actually check confirms the record rather than contradicting it. |
| 2 | 1 | Low | The "never references a character" client-wiring test is name-pattern-based (checks for `char`/`_id`/`holder`-shaped tokens), not semantic — a future implementation could smuggle a character reference in under an unanticipated name (`selectedActor`, `el.dataset.characterId`) and stay green | **Accepted as a standing limitation, not patched.** This project has no DOM/browser test harness (documented repeatedly across other stories' own reviews, e.g. otc-3's, oaq-3's), so every client-wiring test in this codebase is a static source-contract check by construction, not genuine behavioural proof. Codex's own Pass 2 independently confirmed the *current* code has no such leak by hand-reading both functions in full. Tightening the regex further would raise the bar marginally while still being gameable by a sufficiently motivated future rename; the real backstop for this class of regression is AC1/AC2's server-side tests, which prove the guarantee end to end regardless of what the client does. |
| 3 | 1 | Low | `FIXTURE_PREFIX` was interpolated into a MongoDB `$regex` with no escaping — harmless today (the constant has no regex metacharacters) but latent: an edit to the prefix string could silently change `beforeEach`/`afterAll`'s matching semantics | **Patched.** Added `FIXTURE_PREFIX_RE`, a regex-escaped version of the constant computed once at module scope, and switched both `deleteMany` calls to use it. Two-line fix, zero behaviour change for the current value — re-ran the gate after, still 38/38. |

### Regression

38/38 across 3 files (`oxp-4-merit-persistence-handover.test.js` 10/10,
`office-merit-dots.test.js` 18/18, `issue-1141-office-tab-render.test.js` 10/10), 0 skipped,
independently confirmed twice: once immediately after the review (pre-patch) and once after the
Low #3 patch above. No unresolved High/Medium.

### Change Log

| Date | Change |
|------|--------|
| 2026-08-13 | Story implemented, all 5 ACs, 38/38 regression, both server- and client-side guarantees mutation-tested. |
| 2026-08-13 | Codex external review (3-pass): 1 Medium (environmental, dismissed with a fresh clean run), 2 Low (1 accepted as a standing this-project-has-no-DOM-harness limitation, 1 patched — escaped the fixture-cleanup regex). 38/38 after patch. |
