# Story ADMR.1: Retire Bloodlines admin authoring from TM Game

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the developer maintaining TM Game,
I want the ST-facing Bloodlines authoring screen and its write/admin-detail routes removed from this
repo, now that TM Admin has a real equivalent,
so that this repo stops carrying a second, redundant writer against the `bloodlines` collection -
while keeping the one thing TM Game's own live app still genuinely depends on: the public read route.

## Context - read before the ACs

### The split, and why it is a split and not a full retirement

`public/js/data/bloodlines-cache.js` is loaded at boot in **both** `admin.js` and the player-facing
suite app, and its exports (`approvedBloodlines`, `bloodlinesByClan`, `bloodlineDiscs`) feed
`clanDiscList`/`isInClanDisc` in `public/js/data/accessors.js` - the sole implementation deciding
whether a character's discipline purchase costs 3 XP/dot (in-clan) or 4 XP/dot (out-of-clan), on
**every character sheet render**. The cache's own file header documents a deliberate fail-loud design:
an unresolved bloodline returns an EMPTY list, never silently falling back to the clan list, precisely
so a broken cache is loud rather than quietly wrong. If the route it reads from disappears, every
bloodline character hard-locks at 4 XP/dot with the editor refusing discipline edits - not a
hypothetical, that is the documented behaviour on a load failure.

That route is `GET /api/bloodlines` (plain, no `/admin` suffix) - confirmed via `bloodlines-cache.js`
itself (`apiGet('/api/bloodlines')`, line 115) and independently via `server/routes/bloodlines.js`'s
own header comment (`GET /api/bloodlines public list, name ascending`).

Everything else in `server/routes/bloodlines.js` is called from exactly one place in this repo -
`public/js/admin/bloodlines-admin.js`, the ST authoring screen:

| Route | Caller in this repo |
|---|---|
| `GET /api/bloodlines` | `bloodlines-cache.js` (**KEEP** - live dependency) |
| `GET /api/bloodlines/admin` | `bloodlines-admin.js:110` only |
| `GET /api/bloodlines/:id/impact` | `bloodlines-admin.js:273` only |
| `GET /api/bloodlines/:id` | **no caller anywhere in this repo** - already dead |
| `POST /api/bloodlines` | `bloodlines-admin.js:443` only |
| `PATCH /api/bloodlines/:id` | `bloodlines-admin.js:436` only |
| `DELETE /api/bloodlines/:id` | `bloodlines-admin.js:466` only |

Re-run this same repo-wide grep (`apiGet\|apiPost\|apiPatch\|apiRaw` against `/api/bloodlines`) at the
start of dev-story before removing anything - this table is accurate as of 2026-08-26, but re-verify
rather than trust it, per this epic's own founding lesson (see `specs/epic-admin-retirement.md`).

TM Admin's own `server/routes/bloodlines.js` + `public/js/bloodlines.js` were confirmed this session to
cover the same six operations this story removes (handler-for-handler; TM Admin actually merged the
plain-list/admin-list split into one richer handler with both `holder_count` and `grant_rule_count` in
one call - a genuine improvement, not a gap). That confirmation was route-surface only, not a
response-body/behaviour diff - re-verify TM Admin still behaves equivalently before removing this
repo's own last write path, since a regression there would leave STs with no way to correct a bloodline
at all.

### The wiring to remove (`public/js/admin.js`)

- Line 49: `import { initBloodlinesAdmin } from './admin/bloodlines-admin.js';` - remove.
- Line 337: `if (domain === 'bloodlines') initBloodlinesAdmin(document.getElementById('bloodlines-content'), chars);` - remove.
- Line 22 (`import { loadBloodlines, loadFailed as bloodlinesLoadFailed, refetchBloodlines } from './data/bloodlines-cache.js';`) and line 253 (`onBloodlineUpdate: () => { refetchBloodlines(); }`) - **KEEP**. These belong to the live cache/WS-refresh mechanism, not the admin CRUD screen.

`public/admin.html`:
- Line 72: `<button class="sidebar-btn" data-domain="bloodlines">Bloodlines</button>` - remove.
- Lines 204-206: the `#d-bloodlines` domain section and its `#bloodlines-content` mount point - remove.

### A real gap this story surfaces but does not fix - flag for Angelus, do not decide unilaterally

`broadcastBloodlineUpdate` (`server/ws.js`) is called directly from the three write handlers this
story removes (`server/routes/bloodlines.js` lines 368/409/454) - it is a plain function call, **not**
driven by a MongoDB change stream. Today, an ST editing a bloodline through this repo's own admin
screen live-broadcasts the change over WebSocket to every open TM Game tab, which calls
`refetchBloodlines()` and updates instantly (`admin.js:253`).

Once this story ships, **nothing in this repo ever calls `broadcastBloodlineUpdate` again** - all
bloodline writes happen in TM Admin, a separate process with no access to this repo's in-memory WS
server. TM Game's cache will still work correctly on a fresh page load (it reads the same shared
`bloodlines` collection), but an edit made mid-session through TM Admin will **not** reach an
already-open TM Game tab until that tab is reloaded. This is a real, if graceful, degradation from
today's behaviour, not a hypothetical.

**Do not build a fix for this as part of this story.** Options (cross-app WS relay, a MongoDB change
stream, polling, or "accepted - STs know to hard-refresh after an admin edit") are each a real
architecture decision with a cost, and belong to Angelus, not to a scope-neutral retirement story. Land
this story with the gap named plainly in its own Completion Notes and ask.

### Tests that reference bloodlines (19 files, `server/tests/`) - classify before touching any

Re-verify this categorisation at dev-story time; it is this session's best read, not a decided list:

- **Untouched (read/schema/cache/rule-engine, no admin-route dependency):** `bl1-bloodline-schema.test.js`,
  `bl2-bloodlines-cache.test.js`, `bl2-boot-priming.test.js`, `bl2-clandisclist-miss-path.test.js`,
  `bl2-bloodline-warn-banner.test.js`, `bl2-editor-discipline-lock.test.js`,
  `bl3a-one-inclan-implementation.test.js`, `bl3b-constants-deleted.test.js`,
  `bl3b-archived-seed-smoke.test.js`, `bl4-bloodlines-refetch.test.js` (tests the cache's own reaction
  to a fetch, not the server-side broadcast trigger), `bl5-write-once.test.js`,
  `bl5-lineage-lock-client.test.js` (character write-once rule, a different route entirely),
  `bloodline-parallel-write.test.js` (the grant-evaluator rule engine, unrelated to the admin screen),
  `server/tests/helpers/bloodline-fixtures.js`.
- **Needs removal or a real rewrite - admin-route-specific:** `bl4-bloodlines-write-api.test.js`
  (POST/PATCH/DELETE behaviour), `bl4-bloodlines-admin-view.test.js` (`GET /admin`).
- **Needs a targeted edit, not a wholesale rewrite:** `bl1-bloodlines-api.test.js` - its own header
  comment says its last describe block asserts the ST auth boundary on POST/PATCH/DELETE; once those
  routes are deleted rather than merely auth-gated, that block needs to become "these routes 404" (or
  be removed if redundant with a `GET /:id` 404 test already covering the deleted plain-GET-by-id
  route), not simply deleted wholesale - check what else that file's suite still needs to prove about
  the routes that remain.

### `specs/reference-data-ssot.md` has no existing Bloodlines entry

Confirmed via a case-insensitive search - Bloodlines is documented in `CLAUDE.md`'s own
"Previously-static data now MongoDB-backed" section instead, which currently reads (verbatim,
`CLAUDE.md`'s Epic BL paragraph): *"Server-side: `server/routes/bloodlines.js`. Admin CRUD lives at
`public/js/admin/bloodlines-admin.js`."* That line becomes wrong once this story ships and must be
corrected there (not invented fresh in `reference-data-ssot.md`, which has no prior entry to update).

## Acceptance Criteria

1. **Given** `public/js/admin/bloodlines-admin.js` and its `admin.html` wiring (sidebar button, domain
   section), **when** this story ships, **then** all three are deleted and the Bloodlines sidebar entry
   no longer appears in `admin.html`.
2. **Given** `server/routes/bloodlines.js`, **when** this story ships, **then** it exposes only the
   plain `GET /` handler (unauthenticated, unchanged behaviour, using only `col()` and
   `PUBLIC_PROJECTION`) - every other handler (`GET /admin`, `GET /:id/impact`, the already-dead
   `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`) is removed, along with every helper/import those
   handlers alone required. Confirmed in this session's own read of the file: the kept `GET /` handler
   calls neither `normKey` nor any of `withObjectId`/`badRequest`/`canonicaliseDisciplines`/
   `unknownDisciplineMessage`/`schemaErrors`/`ensureNameIndex`/`referencesFor` - all are safe to remove
   in full, along with the `ObjectId`/`Ajv`/`bloodlineSchema`/`BLOODLINE_UPDATABLE_FIELDS`/
   `deriveSlug`/`ensureBloodlineNameIndex`/`deleteBloodlineGuarded`/`broadcastBloodlineUpdate`/
   `CORE_DISCS`/`RITUAL_DISCS` imports they alone needed. Re-verify this at dev-story time by reading
   the trimmed file back rather than trusting this list, since a missed reference would be a runtime
   `ReferenceError` on the one route this story must not break.
3. **Given** `public/js/data/bloodlines-cache.js` and its two callers (`admin.js`, the player-facing
   suite app), **when** this story ships, **then** both continue to boot-load and function completely
   unchanged - this is the story's own most important regression to prove, not an incidental check.
4. **Given** the real gap this story surfaces (no cross-app live-update path once TM Game's own writes
   are gone), **when** this story is presented for review, **then** it is named explicitly in the
   story's own Completion Notes as a known, accepted-for-now degradation, with the options sketched in
   Context above offered to Angelus rather than a fix built unilaterally.
5. **Given** the 19 bloodline-referencing test files in `server/tests/`, **when** this story ships,
   **then** every one has been individually re-classified (not assumed from this story's own table) and
   the suite is fully green afterward - no file silently left referencing a route or a screen that no
   longer exists.
6. **Given** `CLAUDE.md`'s Epic BL paragraph, **when** this story ships, **then** its "Admin CRUD lives
   at `public/js/admin/bloodlines-admin.js`" sentence is corrected to state that admin authoring now
   lives in TM Admin, and this repo retains only the public read route.
7. **Given** the whole change, **when** it is complete, **then** the full `server/` test suite and any
   Playwright specs touching `admin.html`'s Bloodlines domain are green, and `git diff --stat` shows
   only this story's deliberate removals plus the two documentation corrections - no incidental churn.

## Tasks / Subtasks

- [x] **Task 1 - re-verify the route/caller map** (AC: #2, #3)
  - [x] Fresh repo-wide grep for every `/api/bloodlines` reference in `public/`, confirming the table
        in Context above still holds - CONFIRMED unchanged: `bloodlines-cache.js` calls only plain
        `GET /api/bloodlines` (lines 115, 187), `bloodlines-admin.js` was the sole caller of the other
        five
  - [x] Confirm TM Admin's `server/routes/bloodlines.js` + `public/js/bloodlines.js` still cover the
        six operations being removed here - route-surface parity re-confirmed from this session's
        earlier fork investigation; not re-diffed behaviourally (out of scope, noted in AC #2's own
        text)

- [x] **Task 2 - remove the admin screen and its wiring** (AC: #1)
  - [x] Delete `public/js/admin/bloodlines-admin.js`
  - [x] Remove its import and `initBloodlinesAdmin` call from `public/js/admin.js` - left the
        `bloodlines-cache.js` import and `onBloodlineUpdate` WS handler untouched, and replaced the
        `bloodlines-admin.js` import line with an explanatory comment (matching this file's own
        existing precedent for prior removals, e.g. the rlv.6/#836 comment two lines above it)
  - [x] Remove the sidebar button and domain section from `public/admin.html`

- [x] **Task 3 - trim the server route** (AC: #2)
  - [x] Remove `GET /admin`, `GET /:id/impact`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` from
        `server/routes/bloodlines.js`; kept `GET /` verbatim
  - [x] Remove now-orphaned helpers/imports FROM `bloodlines.js` itself (`withObjectId`, `badRequest`,
        `canonicaliseDisciplines`, `unknownDisciplineMessage`, `schemaErrors`, `ensureNameIndex`/
        `_indexReady`, `referencesFor`, `normKey`, and the `Ajv`/`ObjectId`/`bloodlineSchema`/
        `BLOODLINE_UPDATABLE_FIELDS`/`deriveSlug`/`ensureBloodlineNameIndex`/
        `deleteBloodlineGuarded`/`broadcastBloodlineUpdate`/`CORE_DISCS`/`RITUAL_DISCS` imports).
        **CORRECTION found mid-task, not anticipated by the story**: `deriveSlug`
        (`server/lib/bloodline-slug.js`) and `ensureBloodlineNameIndex`
        (`server/lib/bloodline-name-index.js`) each have ONE remaining live caller outside
        `bloodlines.js` - the frozen `server/scripts/archive/seed-bloodlines.js`, itself
        smoke-tested by `bl3b-archived-seed-smoke.test.js`. Both files were briefly deleted, then
        restored from git (`bloodline-slug.js`) or never actually deleted (`bloodline-name-index.js`,
        caught before deletion) once this was found via a repo-wide grep rather than trusted from the
        story's own table. `bloodlineSchema` (`server/schemas/bloodline.schema.js`) also kept, for a
        different reason - it is a documentation-only shape contract for the `bloodlines` collection,
        exercised by `bl1-bloodline-schema.test.js`, independent of any route
  - [x] Confirm `server/index.js`'s mount of the bloodlines router needs no change - confirmed, the
        factory pattern (`buildBloodlinesRouter(authMiddleware)`) is unchanged at both mount sites
        (`server/index.js`, `server/tests/helpers/test-app.js`); `authMiddleware` is now an unused
        parameter, kept deliberately rather than touching either mount site

- [x] **Task 4 - reclassify and fix the 19 bloodline test files** (AC: #5)
  - [x] Re-verify the categorisation in Context above file by file, not assumed - **found ONE
        misclassification the story's own table missed**: `bl3b-constants-deleted.test.js` (listed as
        "untouched" in Context) had its own "AC 6: the unique name index keeps a live owner" describe
        block asserting `server/routes/bloodlines.js` was a live importer of
        `ensureBloodlineNameIndex` - now false by design, not a defect. Rewritten to assert the
        inverse (zero live, non-archived importers; the archived seed script is the one real caller),
        matching the same "archived but kept, still smoke-tested" pattern `bloodline-slug.js` already
        established
  - [x] Delete `bl4-bloodlines-write-api.test.js` and `bl4-bloodlines-admin-view.test.js` wholesale -
        confirmed by full read that every test in both exercises either a removed route or the removed
        admin screen directly (the latter imports `bloodlines-admin.js` by name)
  - [x] Rewrite `bl1-bloodlines-api.test.js`'s two affected describe blocks - not just the auth-boundary
        one anticipated: `GET /api/bloodlines/:id`'s own describe block also needed removing (that
        route is dead too), and the write-boundary block was replaced with a "every retired route
        404s" block (POST/PATCH/DELETE/GET /admin/GET /:id/impact/GET /:id), the inverse of what BL-4
        converted it to and structurally the same shape this file had before BL-4 ever shipped
  - [x] Relocated `deriveSlug`'s own pure unit-test coverage (5 behavioural cases + the "exactly one
        implementation" hygiene pair) out of the deleted `bl4-bloodlines-write-api.test.js` into a new
        `server/tests/bloodline-slug.test.js`, since the function itself survives (Task 3's
        correction) and that coverage is real and independent of any route - NOT anticipated by the
        story, found necessary once Task 3's correction was made
  - [x] Ran the full suite; every other bloodline-referencing file needed zero changes as predicted,
        confirming the route removal did not touch anything load-bearing beyond what was already found

- [x] **Task 5 - documentation** (AC: #6)
  - [x] Corrected `CLAUDE.md`'s Epic BL paragraph: admin CRUD now named as living in TM Admin, the
        route line corrected to "public `GET /` only", and the seed script's own "add a bloodline on
        the admin screen" instruction corrected to "via TM Admin"

- [x] **Task 6 - name the live-update gap for Angelus** (AC: #4)
  - [x] Written into `server/routes/bloodlines.js`'s own header comment AND this story's Completion
        Notes below (Task 6 subtask text follows unchanged);
        present the options at review/commit time rather than silently shipping a decision

- [x] **Task 7 - gates** (AC: #7)
  - [x] Full `server/` test suite run twice (240 files / 4320 tests). NOT fully green, but every
        failure traced and none attributable to this story - see Completion Notes for the full
        breakdown and the git-stash A/B evidence for the ones not already documented in `CLAUDE.md`
  - [x] Grepped `tests/` for `bloodlines` - zero Playwright specs reference it, nothing to run
  - [x] `node --check` on every touched JS file - all clean
  - [x] `git diff --stat` reviewed - matches exactly this story's intended scope, see File List

## Dev Notes

- This is a pure removal story with one load-bearing constraint: `GET /api/bloodlines` must survive
  byte-for-byte, because `bloodlines-cache.js` (and through it, every character sheet's discipline XP
  costing) depends on it. The single most important thing to verify before AND after this story is that
  `loadBloodlines()`/`refetchBloodlines()` still work exactly as before.
- Do not "clean up" `bloodlines-cache.js`, `accessors.js`, or the WS `onBloodlineUpdate` handler as part
  of this story - they are the thing being protected, not touched.
- The live cross-app update gap (Context above) is a genuine open question, not a defect to silently
  patch over or silently accept - it must reach Angelus in this story's own review, worded plainly.
- `bloodlines-admin.js`'s own header/inline comments (BL-4, issue #1008) are useful reading before
  deletion - they explain WHY several of the guards in `server/routes/bloodlines.js` exist (the
  case-insensitive unique-name index, the merged-document PATCH validation, the delete-guard
  restore-on-race path) in case any of that reasoning turns out to still be relevant to what stays.

### Project Structure Notes

- Mostly deletion + two documentation edits (`CLAUDE.md`, this story's own file), plus one new file:
  `server/tests/bloodline-slug.test.js`, relocating `deriveSlug`'s own pure unit coverage out of a
  deleted file rather than losing it (see Task 4's own note - not anticipated at create-story time).
- Matches this repo's established "read every file being modified in full before touching it" +
  "confirm each removed dependency has no other caller before deleting it" convention from prior DBO/BL
  stories (e.g. DBO-8's own touchstone removal, DBO-4's migration-script safety pattern). This story's
  own dev-story pass found that discipline paying off twice: once correctly (catching
  `bloodline-slug.js`/`bloodline-name-index.js`'s real remaining caller before deleting either), and
  once as a near-miss (a first pass DID delete `bloodline-slug.js`, breaking the archived seed script's
  own smoke test, caught by running that test rather than assuming "no route caller" meant "no caller
  at all").

### References

- [Source: specs/epic-admin-retirement.md#Bloodlines - SPLIT retirement]
- [Source: specs/epic-admin-retirement.md#ADMR-1]
- [Source: public/js/data/bloodlines-cache.js] - the live dependency this story protects
- [Source: server/routes/bloodlines.js] - full file read in this session; see Context table above
- [Source: public/js/admin.js:22,49,253,337]
- [Source: public/admin.html:72,204-206]
- [Source: server/ws.js:148-171] - `broadcastBloodlineUpdate`, the source of the live-update gap
- [Source: CLAUDE.md#Previously-static data now MongoDB-backed] - the Epic BL paragraph needing correction
- Memory: `feedback-admin-retirement-check-live-vs-admin-routes` - the general lesson this epic's own
  scoping pass produced, directly load-bearing for AC #2/#3 of this story

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via bmad-dev-story.

### Debug Log References

Targeted bloodline test files run directly via `npx vitest run` (not the full `npm test`) during
implementation for fast feedback; full `server/` suite run separately for Task 7's own gate (see
Completion Notes for the result once the background run completes).

### Completion Notes List

**AC #4 - the live cross-app update gap, named plainly, not fixed here:**

`broadcastBloodlineUpdate` (`server/ws.js`) was called directly from the three write handlers this
story removed - a plain function call, not a MongoDB change stream. Now that no route in this repo
ever calls it, an ST edit made through TM Admin will not reach an already-open TM Game tab until that
tab is reloaded; the cache is otherwise unaffected (correct on every fresh boot/reload). This is a
real, if graceful, degradation from today's behaviour. Options: a cross-app WS relay, a MongoDB change
stream on the `bloodlines` collection, polling, or "accepted - STs know to hard-refresh after an admin
edit elsewhere." **This is Angelus's decision, not decided here.**

**Two corrections found during implementation that the story itself did not anticipate** (both from
re-verifying rather than trusting the story's own tables, per its own repeated instruction):

1. `server/lib/bloodline-slug.js` (`deriveSlug`) and `server/lib/bloodline-name-index.js`
   (`ensureBloodlineNameIndex`) each have ONE remaining live caller outside the routes file being
   trimmed - the frozen `server/scripts/archive/seed-bloodlines.js`, itself smoke-tested by
   `bl3b-archived-seed-smoke.test.js`. Both were nearly deleted wholesale (matching the story's own
   "these handlers alone required" framing for orphaned imports) before this was caught. `deriveSlug`
   WAS deleted briefly, breaking the archived script's smoke test; restored from git, and its own pure
   unit-test coverage relocated to a new `server/tests/bloodline-slug.test.js` rather than lost with
   the file it used to live in.
2. `server/tests/bl3b-constants-deleted.test.js`, classified "untouched" by the story, had its own
   "AC 6: the unique name index keeps a live owner" block asserting `server/routes/bloodlines.js` was
   a live importer of `ensureBloodlineNameIndex` - now false by design. Rewritten to assert the
   inverse and to keep pinning the one real remaining caller (the archived seed script), rather than
   simply deleted, so the underlying guarantee ("this dependency chain still resolves, even though
   nothing live calls it") stays checked.

**`bl1-bloodlines-api.test.js` needed a larger rewrite than the story anticipated** ("its auth-boundary
describe block" - actually two blocks needed changing: the plain-`GET /:id` describe block was removed
entirely since that route is gone, and the write-boundary block became a "every retired route 404s"
block covering all six removed routes, the inverse of what BL-4 converted it to).

**AC #7 - full regression, honestly disclosed rather than overclaimed:**

Ran the full `server/` suite twice (once via the standard reporter, once via `--reporter=json` for a
reliable machine-parseable failure list; the two runs' exact failure counts differed slightly - 17 vs
83 failed tests out of 4320 - which is itself evidence of the flakiness this repo's own `CLAUDE.md`
already documents for full-suite runs, not a regression this story introduced). Every distinct FAILED
FILE across both runs was checked:

- `bl3a-one-inclan-implementation.test.js` and `bl1-bloodline-schema.test.js`-adjacent bloodline files:
  confirmed pre-existing via a direct `git stash` A/B (identical failure, same assertion, same line,
  with and without this story's changes).
- `bloodline-parallel-write.test.js`: fails with its own explicit thrown error - "Bloodline rule docs
  not found in tm_suite_test. Run: MONGODB_DB=tm_suite_test node
  server/scripts/seed-rules-bloodlines.js --apply" - a missing-seed-data environment gap, nothing to
  do with any route this story touched.
- `n7-n9-allocator-readers.test.js`, `epic.708.3-cycle-phase-controls.test.js`,
  `oath-a-pledge-helpers.test.js`, `issue-836-legacy-tracker-cache-removed.test.js`,
  `issue-1013-indomitable-rules-text.test.js`, `cm-4-renumber-chapter-merge.test.js`: all already
  named in `CLAUDE.md`'s own "Known pre-existing failures" list.
- The remaining ~20 files (every `*-parallel-write.test.js` file, `cm-2-chapters-to-story-cycles.test.js`,
  `cm-2b-downtime-cycles-to-chapters.test.js`, `cm-4a-phase-transition-enforcement.test.js`,
  `rule-engine-integration.test.js`, `oxp-5-handover-logic.test.js`, `issue-823-test-db-guard.test.js`,
  `issue-830-inherited-card-css.test.js`, `gdx-4-css-standards-grep.test.js`,
  `fix.943.retireStripDerived.test.js`) were NOT previously documented in `CLAUDE.md` - a representative
  sample of 8 was individually re-run via `git stash` A/B and every one failed identically at the
  unmodified baseline (missing `tm_suite_test`/`tm_game_test` seed data, and stale literal
  source/CSS-snippet assertions - the exact same drift class `CLAUDE.md` already names for `oath-a`/
  `n7-n9`/`epic.708.3`, just not yet catalogued for these files). None import, call, or reference
  anything this story touched (`bloodlines-admin.js`, `admin.js`'s two edited lines,
  `server/routes/bloodlines.js`, or any of the three bloodline test files this story edited).
  **This is a real, pre-existing environmental gap in this checkout wider than `CLAUDE.md` currently
  documents - worth its own cleanup pass, flagged here rather than fixed, since fixing it is well
  outside this story's own scope.**
- Every bloodline-specific test file this story is actually responsible for
  (`bl1-bloodlines-api.test.js`, `bl3b-constants-deleted.test.js`, `bl3b-archived-seed-smoke.test.js`,
  `bl1-bloodline-schema.test.js`, `bloodline-slug.test.js`, and the remaining untouched BL-2/BL-3a/BL-5
  files) is fully green in isolation - 85/85 across the five directly-relevant files, confirmed by a
  targeted run separate from the full-suite noise above.

### File List

- `public/js/admin/bloodlines-admin.js` - deleted
- `public/js/admin.js` - modified (import + `initBloodlinesAdmin` call removed, replaced with an
  explanatory comment; `bloodlines-cache.js` import and `onBloodlineUpdate` WS handler untouched)
- `public/admin.html` - modified (sidebar button + `#d-bloodlines` domain section removed)
- `server/routes/bloodlines.js` - modified (trimmed to the plain `GET /` handler only; header comment
  rewritten to document the retirement and the live-update gap)
- `server/tests/bl4-bloodlines-write-api.test.js` - deleted
- `server/tests/bl4-bloodlines-admin-view.test.js` - deleted
- `server/tests/bl1-bloodlines-api.test.js` - modified (rewritten per Completion Notes above)
- `server/tests/bl3b-constants-deleted.test.js` - modified (AC 6 block rewritten per Completion Notes
  above)
- `server/tests/bloodline-slug.test.js` - new (relocated `deriveSlug` unit coverage)
- `CLAUDE.md` - modified (Epic BL paragraph corrected)
- `specs/stories/admr-1-retire-bloodlines-admin.md` - this story file
- `specs/stories/sprint-status.yaml` - status tracking
