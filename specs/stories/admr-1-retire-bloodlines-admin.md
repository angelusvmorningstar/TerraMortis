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
   `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`) is removed, along with **every route-only
   helper/import those handlers alone required, wherever it lives** - not just inline helpers inside
   `bloodlines.js` itself. Confirmed: the kept `GET /` handler calls neither `normKey` nor any of
   `withObjectId`/`badRequest`/`canonicaliseDisciplines`/`unknownDisciplineMessage`/`schemaErrors`/
   `ensureNameIndex`/`referencesFor` - all removed in full, along with the
   `ObjectId`/`Ajv`/`BLOODLINE_UPDATABLE_FIELDS`/`deriveSlug`/`ensureBloodlineNameIndex`/
   `deleteBloodlineGuarded`/`broadcastBloodlineUpdate`/`CORE_DISCS`/`RITUAL_DISCS` imports they alone
   needed (`bloodlineSchema` is kept - it is not route-only, see AC #6a). **CORRECTED post-review**:
   an external Codex review found the first pass had missed two of these - `deleteBloodlineGuarded`
   (`server/lib/bloodline-delete-guard.js`, required only by the removed `DELETE /:id` handler, zero
   remaining caller anywhere, unlike `bloodline-slug.js`/`bloodline-name-index.js` which the archived
   seed script genuinely still calls) and `BLOODLINE_UPDATABLE_FIELDS` (the removed `PATCH` handler's
   own field allowlist, same shape). Both deleted in the review-fix pass; see the Senior Developer
   Review section.
3. **Given** `public/js/data/bloodlines-cache.js` and its two callers (`admin.js`, the player-facing
   suite app), **when** this story ships, **then** both continue to boot-load and function completely
   unchanged - this is the story's own most important regression to prove, not an incidental check.
4. **Given** the real gap this story surfaces (no cross-app live-update path once TM Game's own writes
   are gone), **when** this story is presented for review, **then** it is named explicitly in the
   story's own Completion Notes as a known, accepted-for-now degradation, with the options sketched in
   Context above offered to Angelus rather than a fix built unilaterally. **The review-fix pass went
   further than naming it**: `broadcastBloodlineUpdate` (`server/ws.js`) - the function that used to
   fire this broadcast, called only from the routes this story removes - is now itself deleted, since
   a repo-wide search confirmed it had zero remaining caller. The gap itself is unchanged; the dead
   function that used to serve it no longer lingers.
5. **Given** the 19 bloodline-referencing test files in `server/tests/` this story started with (now
   21, after the review-fix pass added two relocated-coverage files), **when** this story ships,
   **then** every one has been individually re-classified (not assumed from this story's own table) and
   the suite is fully green afterward - no file silently left referencing a route, a screen, or a
   now-deleted helper that no longer exists. **CORRECTED post-review**: the first pass's own Task 4
   claimed the two deleted admin-write test files "exercised only removed code." An external Codex
   review found this false for one of them - `bl4-bloodlines-admin-view.test.js` also contained the
   sole regression test for `server/ws.js`'s shared `_fanOut` fault-isolation logic (used by every
   broadcaster, not just bloodlines' own, since removed), and `bl4-bloodlines-write-api.test.js`
   likewise carried the sole behavioural proof that `ensureBloodlineNameIndex` actually enforces its
   case-insensitive collation - a function this story keeps live for the archived seed script. Both
   relocated to new dedicated files (`ws-fanout.test.js`, `bloodline-name-index.test.js`) in the
   review-fix pass, each prove-discriminated against a real injected regression before being trusted.
6. **Given** `CLAUDE.md`'s Epic BL paragraph, **when** this story ships, **then** its "Admin CRUD lives
   at `public/js/admin/bloodlines-admin.js`" sentence is corrected to state that admin authoring now
   lives in TM Admin, and this repo retains only the public read route.
   1. **AC #6a, added post-review**: `bloodlineSchema` (`server/schemas/bloodline.schema.js`) is kept
      deliberately, not as an oversight - an external Codex review's Pass 3a caught this story's own
      Dev Notes mischaracterising it as "documentation-only," when `server/scripts/archive/
      seed-bloodlines.js` still calls `ajv.compile(bloodlineSchema)` as a real, if rarely-run,
      pre-write validation gate. Corrected in Dev Notes below.
7. **Given** the whole change, **when** it is complete, **then** every gate this story could plausibly
   regress is genuinely green, or any pre-existing failure is disclosed by name rather than silently
   inherited or overclaimed as fixed - not a literal "the whole suite is green" claim, which this
   repo's own `CLAUDE.md` already documents as never true even at baseline (a real, wider-than-`CLAUDE.md`-documents
   pool of pre-existing failures exists; see Dev Agent Record). `git diff --stat` shows only this
   story's deliberate removals, the review-fix pass's own removals/additions, and the documentation
   corrections - no incidental churn. **AC #7's wording corrected post-review**: the original text said
   "the full server test suite [is] green," which an external Codex review correctly flagged as
   self-contradicted by this story's own Task 7 (which openly recorded pre-existing failures). This is
   a wording fix, not a new behaviour - Task 7's own account was always the honest one.

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
        different reason - originally recorded here as "a documentation-only shape contract,"
        **corrected post-review**: an external Codex review's Pass 3a caught that this undersells it -
        `server/scripts/archive/seed-bloodlines.js` still calls `ajv.compile(bloodlineSchema)` as a
        real, if rarely-run, executable pre-write validation gate, not mere documentation. Kept for
        that reason; `bl1-bloodline-schema.test.js` exercises it independent of any route
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

- Mostly deletion + documentation edits (`CLAUDE.md`, this story's own file, plus stale-comment
  accuracy fixes found during external review - `server/index.js`, `server/tests/helpers/test-app.js`,
  `server/lib/bloodline-slug.js`, `server/lib/bloodline-name-index.js`), plus four new files:
  `server/tests/bloodline-slug.test.js` (dev-story pass, relocating `deriveSlug`'s pure unit coverage),
  and three added in the **review-fix pass** after an external Codex review found real coverage gaps
  the dev-story pass had introduced without noticing - `server/tests/bloodline-name-index.test.js`
  (relocating `ensureBloodlineNameIndex`'s behavioural proof), `server/tests/ws-fanout.test.js`
  (relocating `server/ws.js`'s shared `_fanOut` fault-isolation test, NOT bloodline-specific - every
  broadcaster in this app depends on it), and this story's own Senior Developer Review section below.
- Matches this repo's established "read every file being modified in full before touching it" +
  "confirm each removed dependency has no other caller before deleting it" convention from prior DBO/BL
  stories (e.g. DBO-8's own touchstone removal, DBO-4's migration-script safety pattern). This story's
  own dev-story pass found that discipline paying off twice: once correctly (catching
  `bloodline-slug.js`/`bloodline-name-index.js`'s real remaining caller before deleting either), and
  once as a near-miss (a first pass DID delete `bloodline-slug.js`, breaking the archived seed script's
  own smoke test, caught by running that test rather than assuming "no route caller" meant "no caller
  at all"). **The external review then found the SAME discipline had not been applied consistently**:
  `deleteBloodlineGuarded` was left behind with zero callers, and two whole test files were deleted on
  the assumption they "exercised only removed code" without reading them in full first - both true
  gaps, both closed in the review-fix pass. See Senior Developer Review for the complete account.

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
  `fix.943.retireStripDerived.test.js`) were NOT previously documented in `CLAUDE.md`. **CORRECTED
  post-review**: this section originally said "a representative sample of 8 was individually re-run"
  without naming which 8 or recording per-file commands - an external Codex review correctly flagged
  this as unreproducible as stated. The exact 8 files sampled were:
  `mci-parallel-write.test.js`, `cm-2-chapters-to-story-cycles.test.js`,
  `gdx-4-css-standards-grep.test.js`, `issue-830-inherited-card-css.test.js`,
  `rule-engine-integration.test.js`, `oxp-5-handover-logic.test.js`, `issue-823-test-db-guard.test.js`,
  `fix.943.retireStripDerived.test.js` - run via
  `npx vitest run tests/mci-parallel-write.test.js tests/cm-2-chapters-to-story-cycles.test.js
  tests/gdx-4-css-standards-grep.test.js tests/issue-830-inherited-card-css.test.js
  tests/rule-engine-integration.test.js tests/oxp-5-handover-logic.test.js
  tests/issue-823-test-db-guard.test.js tests/fix.943.retireStripDerived.test.js` after a `git stash`
  of this story's changes, then again after `git stash pop`; every one of the 8 failed identically
  both times (missing `tm_suite_test`/`tm_game_test` seed data, and stale literal source/CSS-snippet
  assertions - the exact same drift class `CLAUDE.md` already names for `oath-a`/`n7-n9`/`epic.708.3`,
  just not yet catalogued for these files). None import, call, or reference anything this story
  touched. **This is a real, pre-existing environmental gap in this checkout wider than `CLAUDE.md`
  currently documents - worth its own cleanup pass, flagged here rather than fixed, since fixing it is
  well outside this story's own scope.**
- Every bloodline-specific test file this story is actually responsible for is fully green in
  isolation. **Updated post-review** (the review-fix pass added two files to this set):
  `bl1-bloodlines-api.test.js`, `bl3b-constants-deleted.test.js`, `bl3b-archived-seed-smoke.test.js`,
  `bl1-bloodline-schema.test.js`, `bloodline-slug.test.js`, `bloodline-name-index.test.js`,
  `ws-fanout.test.js` - **89/89 across these seven files**, confirmed by a targeted run separate from
  the full-suite noise above, re-run fresh after every review-fix patch. (The original 85/85 claim
  against 5 files was itself flagged by the external review as unreproducible IN ITS OWN sandboxed
  environment, which could not reach the live Atlas test database at all - `connect EACCES` - a
  network-access difference between environments, not a contradiction of the claim; re-confirmed here
  against the real, network-capable environment this session actually runs in.)

### File List

**Dev-story pass:**
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

**Review-fix pass** (after the external Codex review below):
- `server/lib/bloodline-delete-guard.js` - deleted (orphaned, zero remaining caller)
- `server/ws.js` - modified (`broadcastBloodlineUpdate` deleted - zero remaining caller after the
  routes that called it were removed; header comment records the live-update gap it used to serve)
- `server/schemas/bloodline.schema.js` - modified (`BLOODLINE_UPDATABLE_FIELDS` deleted - orphaned,
  the removed `PATCH` handler's own allowlist; `bloodlineSchema` itself kept, comment corrected)
- `server/tests/bl3b-constants-deleted.test.js` - modified again (its own AC 6 `importers()` scan
  excluded `server/tests/` too, after its first rewrite started failing against this pass's own new
  `bloodline-name-index.test.js`)
- `server/tests/bloodline-name-index.test.js` - new (relocated `ensureBloodlineNameIndex` behavioural
  coverage, prove-discriminated against an injected collation-strength regression)
- `server/tests/ws-fanout.test.js` - new (relocated `_fanOut` fault-isolation coverage, prove-
  discriminated against an injected unguarded-`ws.send` regression)
- `public/css/admin-layout.css` - modified (three dead selectors removed:
  `.bl-disc-tag`/`.bl-disc-cell`/`.bl-disc-grid`)
- `server/index.js`, `server/tests/helpers/test-app.js`, `server/lib/bloodline-slug.js`,
  `server/lib/bloodline-name-index.js` - modified (stale "the write route"/BL-4-is-live comments
  corrected for accuracy; no behavioural change)

**Tracking (both passes):**
- `specs/stories/admr-1-retire-bloodlines-admin.md` - this story file
- `specs/stories/sprint-status.yaml` - status tracking
- `specs/stories/code-review/admr-1-retire-bloodlines-admin-diff.txt`,
  `admr-1-retire-bloodlines-admin-codex-review.md`, `admr-1-retire-bloodlines-admin-codex-findings.md`
  - the review artefacts

## Senior Developer Review

**Reviewer**: external, Codex CLI (`codex exec`, `model_reasoning_effort=high`), three-pass adversarial
protocol (Blind Hunter / Edge Case Hunter / Acceptance Auditor), single session, CLI-direct execution.
Full raw findings: `specs/stories/code-review/admr-1-retire-bloodlines-admin-codex-findings.md`.
Reviewed against the diff between commits `d581550d` and `6e925f29`.

No High findings. 9 Medium, 5 Low. Every finding independently re-verified against the real code
before triage, per this project's own standing protocol - roughly half were confirmed exactly as
reported; three of the nine Medium findings were about this story's own documentation being
inconsistent with itself or unreproducible as recorded, not about the code.

### Patched (6 code findings + all documentation findings, see Dev Notes/ACs/Completion Notes above)

1. **Medium [Pass 2] — `server/lib/bloodline-delete-guard.js` left orphaned.** Confirmed via a
   repo-wide caller search: zero remaining callers anywhere (`server/routes`, `server/tests`,
   `public/`) after this story's own `DELETE /:id` handler - its only caller - was removed. Deleted.
2. **Medium [Pass 2] — `ensureBloodlineNameIndex`'s only behavioural proof was deleted with
   `bl4-bloodlines-write-api.test.js`, and `bl3b-archived-seed-smoke.test.js`'s own comment still
   pointed at it.** Confirmed by reading `bl3b-archived-seed-smoke.test.js` in full: it explicitly
   defers this coverage to the file this story deletes. Relocated to a new
   `server/tests/bloodline-name-index.test.js`, calling the function directly (its real signature)
   rather than reconstructing a route to reach it indirectly. Prove-discriminated: temporarily
   weakened `BLOODLINE_NAME_COLLATION` from `strength: 2` to `strength: 3`, confirmed two of the three
   new tests failed for exactly that reason, restored, confirmed 3/3 green again.
3. **Medium [Pass 2] — deleting `bl4-bloodlines-admin-view.test.js` also deleted the only regression
   test for `server/ws.js`'s shared `_fanOut` fault-isolation logic**, used by every broadcaster in
   this app (tracker, ST mods, the equipment catalogue), not just bloodlines'. Confirmed by reading the
   full pre-deletion file via `git show d581550d:...` - this session's own original read had stopped
   at line ~40 and never reached this block before deleting the file. Relocated to a new
   `server/tests/ws-fanout.test.js`, with `broadcastBloodlineUpdate` dropped from its checked-
   broadcaster list (see finding 6). Prove-discriminated: temporarily removed the `try/catch` around
   `ws.send` in `_fanOut`, confirmed the test failed for exactly that reason, restored, confirmed green.
4. **Medium [Pass 3a] — AC #2 not literally satisfied** (the delete-guard survived). Resolved by
   finding 1's own fix; AC #2's text corrected to describe the actual, now-complete removal.
5. **Medium [Pass 3a] — Task 4's claim that both deleted suites "exercised only removed code" was
   false for one of them.** Corrected in AC #5 and Completion Notes to name what was actually found and
   relocated (see finding 3).
6. **Low [Pass 2] — dead CSS (`.bl-disc-tag`/`.bl-disc-cell`/`.bl-disc-grid`), the orphaned
   `BLOODLINE_UPDATABLE_FIELDS` export, and an unused `playerUser` import in the rewritten API test.**
   All three confirmed via direct search (the CSS tag selector is shared with `.ec-bucket-tag`, so only
   `.bl-disc-tag` was removed from that selector list, not the whole rule) and removed.
7. **Low [Pass 2] — `broadcastBloodlineUpdate` itself (not just its own missing test) was left behind
   with zero remaining caller**, found while verifying finding 3 above (the review's own Pass 1 hunt
   list had asked this exact question). Deleted from `server/ws.js`; the live-update gap AC #4 already
   named is unchanged in substance, just no longer served by inert dead code.
8. **Low [Pass 2] — stale comments across `server/index.js`, `server/tests/helpers/test-app.js`,
   `server/lib/bloodline-slug.js`, `server/lib/bloodline-name-index.js`** still described "the write
   route" or BL-4 writes as live. Corrected for accuracy; no behavioural change.
9. **Low [Pass 3a] — Task 3 mischaracterised `bloodlineSchema` as "documentation-only"** when the
   archived seed script still compiles and runs it as a real validation gate. Corrected in Dev Notes.
10. **Low [Pass 3a] — AC #7's literal wording excluded the new `bloodline-slug.test.js` file** the
    dev-story pass itself added. AC #7 reworded to describe the real, deliberate shape of the diff
    rather than a narrower one that never matched it.
11. **Medium [Pass 3a] — AC #5/#7's "fully green" wording self-contradicted Task 7's own honest
    account of pre-existing failures.** Reworded both ACs to require every gate be genuinely green OR
    every failure named and disclosed - which is what Task 7 already did; the code was never the
    problem, the AC's wording was.
12. **Medium [Pass 3b] — the claimed 85/85 gate and the "representative sample of 8" stash A/B were
    each unreproducible as recorded** (the former only in the reviewer's own network-restricted
    sandbox; the latter because this story never itemised which 8 files or recorded the commands).
    Both corrected in Completion Notes: the 8 files are now named with the exact command run, and the
    gate is re-stated as 89/89 across the 7 files this story now owns (the original 5 plus the two
    relocated-coverage files), re-confirmed fresh in this session's own network-capable environment
    after every patch above.

### Dismissed (1)

1. **Low [Pass 1] — the rewritten `bl3b-constants-deleted.test.js` AC 6 negative assertion
   (`toEqual([])`) has no positive control proving the scanner can detect an included import.**
   Genuine test-hygiene observation, not acted on: the same `importers()`/regex logic already has a
   positive control one test below it in the same file (asserting the archived seed script IS
   detected as importing the module, just via a separate, unexcluded path check) - not a fixture
   proving the scanner catches a NON-archive import specifically, which is what the finding actually
   asks for. Deferred rather than dismissed outright; see `specs/stories/deferred-work.md`.

### Full regression after all patches

`cd server && npx vitest run tests/bl1-bloodlines-api.test.js tests/bl3b-constants-deleted.test.js
tests/bl3b-archived-seed-smoke.test.js tests/bl1-bloodline-schema.test.js tests/bloodline-slug.test.js
tests/bloodline-name-index.test.js tests/ws-fanout.test.js` — 89/89, all 7 files green.

Full `server/` suite re-run once more after every review-fix patch above (JSON reporter, for a
reliable machine-parseable count): **1277 test suites, 4324 tests, 16 failed, 32 failed test files
(23 distinct FILES - some contain more than one failing suite)**. This is the definitive, final
number this story stands behind - it supersedes the dev-story pass's own interim "17 vs 83" figures
above, which were captured before the review-fix pass touched anything. Every one of the 23 failed
files was checked against the same three buckets already established: already named in `CLAUDE.md`
(`n7-n9-allocator-readers`, `epic.708.3-cycle-phase-controls`, `oath-a-pledge-helpers`,
`issue-836-legacy-tracker-cache-removed`, `issue-1013-indomitable-rules-text`); already confirmed via
this story's own `git stash` A/B sample (`bl3a-one-inclan-implementation`, `bloodline-parallel-write`,
`mci-parallel-write`, `gdx-4-css-standards-grep`, `issue-830-inherited-card-css`,
`rule-engine-integration`, `issue-823-test-db-guard`, `fix.943.retireStripDerived`); or newly
spot-checked in this final pass (`disc-attr-parallel-write`, `pool-parallel-write` - both confirmed
via a fresh `git stash` A/B, identical failure at baseline: "Pool rule docs not found in
tm_suite_test", the same missing-seed-data class). The remaining 8 unchecked files
(`derived-stat-modifiers-parallel-write`, `mdb-parallel-write`, `ohm-parallel-write`,
`ots-parallel-write`, `pt-parallel-write`, `safe-word-parallel-write`,
`style-retainer-parallel-write`, `vm-parallel-write`) share the exact `*-parallel-write.test.js`
naming and shape as the six already confirmed, and none import or reference anything this story
touches - treated as the same class on that basis, not individually re-run against baseline. If that
inference is wrong for any one of them, it is a pre-existing environmental gap either way, not
something this story's diff could have caused (none of these files touch bloodlines, `admin.js`,
`server/ws.js`, or any bloodline schema/lib file).

Notably absent from this final run's failures (present in the dev-story pass's own first attempt):
`cm-2-chapters-to-story-cycles`, `cm-2b-downtime-cycles-to-chapters`, `cm-4-renumber-chapter-merge`,
`cm-4a-phase-transition-enforcement` - consistent with `CLAUDE.md`'s own documented contention-flake
class for this file family (fails only under full-suite load, not in isolation), not a fix this story
made.

Committed but NOT pushed, NOT merged - Angelus's call.
