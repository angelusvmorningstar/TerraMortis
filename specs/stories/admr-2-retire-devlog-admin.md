# Story ADMR.2: Retire Devlog admin authoring from TM Game

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the developer maintaining TM Game,
I want the Devlog authoring screen and its entire `/api/devlog` route surface removed from this
repo, now that TM Admin has a real, more built-out equivalent,
so that this repo stops carrying a second, redundant writer against the shared `devlog_entries`
collection.

## Context - read before the ACs

### This is a full retirement, not a split (unlike ADMR-1's Bloodlines)

Bloodlines (ADMR-1) kept its plain `GET /api/bloodlines` because a live TM Game consumer
(`bloodlines-cache.js`) genuinely depends on it at render time, on every character sheet. Devlog has
no such consumer inside `public/` - confirmed by a fresh repo-wide grep (`grep -rn "devlog"`, this
session): every `/api/devlog` call in `public/` originates from `public/js/admin/devlog-admin.js`
alone. **Angelus has explicitly confirmed the intent is full removal of Devlog from TM Game** - do
not carry forward a split pattern from ADMR-1 by default; that precedent does not apply here.

### A real cross-repo consumer exists, but it is Angelus's call to override, and he has

This session's grep also found `tests/issue-502-devlog-tab.spec.js`'s own header comment: devlog
entries "still reach players... via TM Herald's `GET /api/devlog` poll into Discord"
(`TM Herald/services/announcements.js`). That poll is real but **currently non-functional** - TM
Game's `/api/devlog` is mounted behind `requireAuth` with no service-account auth mechanism on
either side, so it 401s silently on every tick (confirmed in `TM Herald/CLAUDE.md`, which calls the
announcements feature "currently broken pending Game-side work"). TM Admin's own devlog `GET` is
locked down even harder (`requireAuth` + `requireRole('st')`), so redirecting Herald there would not
fix anything either - the real blocker is the missing service-account auth, not which app hosts the
route.

Given that the feature is already broken either way, Angelus chose full retirement over preserving
the route for a currently-inert future integration. **This story does not touch TM Herald's repo.**
Flag in Completion Notes (not fix) that `TM Herald/specs/suite-notification-endpoints.md` names a
route this story deletes, so Herald's own next session can update its plan - a cross-repo note, not
a TM Game task.

### The wiring to remove (`public/js/admin.js`)

- Line 56: `import { initDevlogAdmin } from './admin/devlog-admin.js';` - remove.
- Line 343: `if (domain === 'devlog') initDevlogAdmin(document.getElementById('devlog-admin-content'));` - remove.

`public/admin.html`:
- Line 74: `<button class="sidebar-btn" data-domain="devlog">Devlog</button>` - remove.
- Lines 211-214: the `#d-devlog` domain section and its `#devlog-admin-content` mount point - remove.

Re-run this grep at dev-story time before removing anything - line numbers may have shifted since
this session.

### The server route - full unmount, not a trim

`server/routes/devlog.js` (45 lines) has exactly four handlers - `GET /`, `POST /`
(`requireRole('st')`), `PATCH /:id` (`requireRole('st')`), `DELETE /:id` (`requireRole('st')`) -
and every one is called only from `devlog-admin.js`. Unlike Bloodlines, there is no plain-GET
consumer to preserve. Delete the file entirely.

`server/index.js`:
- Line 41: `import devlogRouter from './routes/devlog.js';` - remove.
- Line 220: `app.use('/api/devlog', requireAuth, noCache(), devlogRouter);` - remove.

`server/schemas/devlog_entry.schema.js` (20 lines) - confirmed via repo-wide grep
(`devlog_entries\|devlogEntrySchema\|devlog_entry.schema`) to have exactly one consumer,
`server/routes/devlog.js`. Delete it alongside the route.

### The `devlog_entries` collection itself - untouched, TM Admin remains the sole live owner

TM Admin's own `server/routes/devlog.js` (confirmed this session) reads/writes the same shared
`tm_game.devlog_entries` collection - its file header literally says "ported from TM Game's
server/routes/devlog.js" and its own `col()` targets `devlog_entries`. **Do not touch the
collection or its data.** This story is a code-only retirement on TM Game's side; TM Admin keeps
serving devlog authoring against the same live data, uninterrupted.

### `specs/reference-data-ssot.md` has no existing Devlog entry

Confirmed via a case-insensitive search this session - there is nothing to update there. Do not
invent a new entry; there was never an old one to correct.

### Tests that reference devlog (5 files under `server/tests/` and `tests/`) - classify before touching

Re-verify this categorisation at dev-story time; it is this session's best read, not a decided list.

- **Delete wholesale:** `server/tests/api-devlog.test.js` (243 lines) - read in full this session;
  every one of its five AC blocks (GET/POST/PATCH/DELETE/auth) exercises a handler this story
  deletes. No coverage worth relocating - unlike ADMR-1's Bloodlines test files, nothing in here
  tests a helper or a shared mechanism (like `_fanOut`) that survives this story.
- **Delete wholesale:** `tests/issue-502-devlog-tab.spec.js` (171 lines) - its player-read half was
  already retired under #1135 (see the file's own header comment); the admin-authoring half
  remaining (`describe('Admin — Devlog domain (AC#6)')`, lines 88-162) tests exactly the screen this
  story removes. Once that block goes, nothing meaningful is left in the file - confirm at dev-story
  time whether any assertion is worth folding into `issue-1135-deleted-tabs.spec.js` before deleting
  (unlikely; the remaining lines 164-172 are a comment, not a test).
- **Edit in place:** `server/tests/helpers/test-app.js` - line 31
  (`import devlogRouter from '../../routes/devlog.js';`) and lines 126-127 (the `/api/devlog` mount,
  with its own `// Issue #502` comment) - remove both; this file's test harness must stop wiring a
  router that no longer exists.
- **Edit in place:** `tests/issue-1135-deleted-tabs.spec.js` - this file already asserts the eight
  #1135-deleted player tabs (including a stale `devlog` entry in its `DELETED`/`DELETED_NAV` arrays -
  that assertion is about the already-gone PLAYER tab and stays correct/unrelated). What must change
  is the admin-side test at lines 185-191, `'#1135: the admin Devlog domain still opens (authoring
  survives)'` - this directly asserts the screen this story deletes and will fail once it ships.
  Replace it with the inverse, mirroring this same file's own adjacent Tickets pattern (lines
  166-183, `'#1135: admin has no Tickets domain...'`): assert `[data-domain="devlog"]`,
  `#d-devlog`, and `#devlog-admin-content` all have zero count, with no 404 for a devlog-specific
  stylesheet if one exists (grep `admin.html`/`admin-layout.css` for a devlog-specific `<link>`
  first - none was found in this session's read of `admin.html`, but re-verify rather than assume).
- **No touch needed:** none of the other repo-wide `devlog` matches from this session's grep
  (`public/admin.html`, `public/js/admin.js`, `server/index.js`, `devlog-admin.js`,
  `server/routes/devlog.js`, `devlog_entry.schema.js`) are test files; they are covered by Tasks 2-3
  below.

## Acceptance Criteria

1. **Given** `public/js/admin/devlog-admin.js` and its `admin.html`/`admin.js` wiring (sidebar
   button, domain section, import, dispatch), **when** this story ships, **then** all are deleted
   and the Devlog sidebar entry no longer appears in `admin.html`.
2. **Given** `server/routes/devlog.js`, **when** this story ships, **then** the file is deleted in
   full (all four handlers - `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`), along with its sole
   consumer-specific schema (`server/schemas/devlog_entry.schema.js`) and its mount/import in
   `server/index.js`.
3. **Given** the shared `tm_game.devlog_entries` collection, **when** this story ships, **then** it
   is untouched - no data deleted, no schema migration - and TM Admin's own devlog authoring
   continues to work against it unaffected (code-only retirement, confirmed by this story's own
   Context section that TM Admin owns a separate, independent route against the same collection).
4. **Given** the cross-repo TM Herald consumer this story's scoping pass found (a currently
   non-functional `GET /api/devlog` poll, see Context), **when** this story is presented for
   review, **then** it is named explicitly in Completion Notes as a deliberate, Angelus-confirmed
   full retirement (not an oversight), with the note that TM Herald's own
   `specs/suite-notification-endpoints.md` will need a follow-up update on Herald's side - not built
   here.
5. **Given** the devlog-referencing test files this story starts with, **when** it ships, **then**
   every one has been individually re-classified (not assumed from this story's own table) - no file
   silently left referencing a route or a screen that no longer exists - and every gate this story
   could plausibly regress is genuinely green, or any pre-existing failure is disclosed by name
   rather than silently inherited or overclaimed as fixed (the same honest standard AC #7 states
   below; the two are one requirement, not two competing ones). **CORRECTED post-review**: this
   story's own original repo-wide grep for `devlog` was case-sensitive and missed a sixth file,
   `tests/player.spec.js`, whose comment used mixed-case `DevLog` - found by an external Codex
   review and corrected (comment text only, no test logic affected).
6. **Given** `specs/reference-data-ssot.md`, **when** this story ships, **then** it is confirmed
   (re-verified, not assumed from this story's own Context) to have no Devlog entry needing
   correction - if one is found to exist after all, it is updated to point at TM Admin instead.
7. **Given** the whole change, **when** it is complete, **then** every gate this story could
   plausibly regress is genuinely green, or any pre-existing failure is disclosed by name rather
   than silently inherited or overclaimed as fixed - this repo's own `CLAUDE.md` already documents
   that a literal "the whole suite is green" claim is never true even at baseline. `git diff --stat`
   shows only this story's deliberate removals and any documentation corrections - no incidental
   churn.

## Tasks / Subtasks

- [x] **Task 1 - re-verify the caller map** (AC: #1, #2, #5)
  - [x] Fresh repo-wide grep for every `devlog`/`/api/devlog` reference in the repo, confirming the
        file list in Context above still holds - CONFIRMED unchanged, no line-number drift since the
        story was written minutes earlier.
  - [x] Confirm TM Admin's own `server/routes/devlog.js` + `public/js/devlog.js` are still live and
        cover devlog authoring end to end - confirmed this session that TM Admin's route targets the
        same shared `tm_game.devlog_entries` collection (its own file header: "ported from TM Game's
        server/routes/devlog.js"); not re-diffed behaviourally, per this story's own Context note.

- [x] **Task 2 - remove the admin screen and its wiring** (AC: #1)
  - [x] Delete `public/js/admin/devlog-admin.js`.
  - [x] Remove its import and `initDevlogAdmin` call from `public/js/admin.js` - replaced the import
        line with an explanatory comment, matching ADMR-1's own established precedent for this file.
  - [x] Remove the sidebar button and domain section from `public/admin.html`.
  - [x] **CORRECTION found post-commit, before review**: a 50-line dead CSS block
        (`public/css/admin-layout.css` lines 207-256, `.dl-admin-toolbar`/`.dl-form`/`.dl-card`/
        `.dl-status--*`/`.dl-new-chip`/`.dl-check-label` etc.) styled `devlog-admin.js`'s own markup
        and was missed on the first pass - the original diff deleted the JS that generated these
        classes but left their CSS in place, orphaned. Found via a self-check grep for every `.dl-*`
        class name across `public/`, matching ADMR-1's own precedent (that story found 3 dead CSS
        selectors the same way). Deleted the whole block; re-confirmed zero remaining `.dl-*`
        reference anywhere in the live tree (the only matches left are in two unrelated stale
        `.claude/worktrees/agent-*` copies, not this branch).

- [x] **Task 3 - remove the server route** (AC: #2, #3)
  - [x] Delete `server/routes/devlog.js` in full.
  - [x] Delete `server/schemas/devlog_entry.schema.js` - confirmed zero remaining caller via grep
        before deleting (devlog.js was its sole consumer).
  - [x] Remove the import and mount from `server/index.js`.
  - [x] Confirm no seed/migration script under `server/scripts/` references `devlog_entries` or
        `devlogEntrySchema` - confirmed via fresh grep; the one incidental match
        (`server/scripts/_dt4-submissions.json`) is a player's free-text downtime prose mentioning
        the word "Devlog", not a code reference.

- [x] **Task 4 - reclassify and fix the 5 devlog test files** (AC: #5)
  - [x] Delete `server/tests/api-devlog.test.js` wholesale - read in full before deleting; every one
        of its five AC blocks exercised a handler this story removes, nothing worth relocating.
  - [x] Delete `tests/issue-502-devlog-tab.spec.js` wholesale - confirmed nothing worth folding into
        `issue-1135-deleted-tabs.spec.js`; the file's only remaining content after its admin-CRUD
        block was a retirement comment, not a test.
  - [x] Edit `server/tests/helpers/test-app.js`: removed the devlog import and mount.
  - [x] Edit `tests/issue-1135-deleted-tabs.spec.js`: replaced the `'#1135: the admin Devlog domain
        still opens (authoring survives)'` test with its inverse (`'#1135/ADMR-2: admin has no Devlog
        domain, and no 404 for a deleted devlog stylesheet'`), mirroring the adjacent Tickets test in
        the same file exactly. Left the player-side `DELETED`/`DELETED_NAV` arrays untouched - that
        assertion is about the already-gone #1135 player tab and remains correct/unrelated.
  - [x] Ran the full server suite and the two affected e2e specs. **Real environmental finding, not a
        code defect**: `npm test` (and a bare `vitest run`) hangs/stalls indefinitely at
        `issue-836-legacy-tracker-cache-removed.test.js` - this matches CLAUDE.md's own documented
        issue #1125 ("issue-836 test fails at collection: it reads the file whose deletion it was
        written to verify") exactly, confirmed unrelated to this story by re-running with
        `--exclude` for that one file. `tests/issue-1135-deleted-tabs.spec.js` (Playwright): 12/12
        green, including the new inverted Devlog test. Full vitest results and pre-existing-failure
        confirmation recorded in Completion Notes below.

- [x] **Task 5 - documentation** (AC: #4, #6)
  - [x] Re-confirmed `specs/reference-data-ssot.md` has no Devlog entry - nothing to correct.
  - [x] Named the TM Herald cross-repo implication in this story's own Completion Notes (per AC #4) -
        no file in `TM Herald/` touched.
  - [x] Updated `sprint-status.yaml`'s `admr-2-retire-devlog-admin` row (backlog -> ready-for-dev ->
        in-progress, this session) and the file's own `last_updated` header, matching ADMR-1's entry
        style. Final flip to `done` happens at code-review time, per this loop's own convention.

## Dev Notes

- **Model:** Opus, per this loop's own invariant for dev-story.
- **No design-lock needed.** This is a pure deletion story - no new UI, no unsettled visual
  decisions. Do not invoke Sally/Phase 0.
- **No data-lock needed.** This story touches no new field or collection shape - it removes code
  that reads/writes an existing, unchanged collection TM Admin continues to own. `bmad-data-lock`
  is not recommended here.
- **Contrast with ADMR-1 explicitly** in any review or commit message: ADMR-1 was a SPLIT (kept the
  live-dependent plain GET), ADMR-2 is a FULL retirement (no TM Game consumer survives) - do not let
  a reviewer assume the same shape applies by default.
- **The `requireRole('st')` gate difference between TM Game's and TM Admin's devlog routes is not
  this story's concern** - TM Admin's own `GET` additionally requires `requireRole('st')` where TM
  Game's only required `requireAuth`; that is TM Admin's own access-model decision, out of scope
  here.

## Project Context Reference

- `specs/epic-admin-retirement.md` - ADMR-2's own epic-level scope (`### Devlog - FULL retirement`
  section, and the epic's "Not this epic" section for what is explicitly excluded).
- `specs/stories/admr-1-retire-bloodlines-admin.md` - the sibling story this one deliberately
  diverges from (split vs full retirement); read for format and for why the split pattern does NOT
  apply here.
- `specs/project-context.md` - persistent facts (CSS/token standards do not apply to this story;
  it is deletion-only).

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-08-26 | Story created via bmad-create-story. Full-retirement scope confirmed directly by Angelus after this session's own scoping pass surfaced a real (but currently non-functional) TM Herald cross-repo consumer and asked before assuming either direction. | Claude (bmad-create-story) |

## Dev Agent Record

### Context Reference

`specs/epic-admin-retirement.md` (`### Devlog - FULL retirement`), this story's own Context section.

### Agent Model Used

Opus (bmad-dev-story), per this loop's own invariant.

### Debug Log References

- Full server vitest run 1 (unbounded `npm test`): hung indefinitely at
  `tests/issue-836-legacy-tracker-cache-removed.test.js` - matches CLAUDE.md's documented issue
  #1125 exactly. Killed after confirming the stall point was identical on a second sample.
- Full server vitest run 2 (`npx vitest run --exclude "**/issue-836-legacy-tracker-cache-removed.test.js"`):
  completed clean, 561.69s. 22 files / 16 tests failed, 218 files / 4165 tests passed, 124 skipped
  (mongod-dependent `*-parallel-write.test.js` files, per CLAUDE.md's documented skip behaviour).
- Two rounds of `git stash -u` / stash pop A/B verification against unmodified base code, isolating
  5 of the 22 failing files this story had not seen documented anywhere (`fix.943.retireStripDerived.test.js`,
  `issue-830-inherited-card-css.test.js`, `bl3a-one-inclan-implementation.test.js`,
  `gdx-4-css-standards-grep.test.js`, `issue-823-test-db-guard.test.js`) - all five fail identically
  at base, confirming none are caused by this story.
- Playwright: `npx playwright test tests/issue-1135-deleted-tabs.spec.js` - 12/12 green.

### Completion Notes List

- **Full retirement, confirmed directly by Angelus**, not a Bloodlines-style split. This story's own
  scoping pass (during bmad-create-story) surfaced a real but currently non-functional cross-repo
  consumer - TM Herald's `GET /api/devlog` poll into Discord (`services/announcements.js`), 401ing
  silently on every tick because no service-account auth mechanism exists on either TM Game's or TM
  Admin's side (TM Admin's own devlog `GET` is locked down even harder, `requireAuth`+`requireRole('st')`,
  so redirecting Herald there would not have fixed anything either). Angelus confirmed the intent is
  full removal of Devlog from TM Game rather than preserving the route. **Flag for TM Herald's own
  next session, not built here**: `TM Herald/specs/suite-notification-endpoints.md` still names
  `GET /api/devlog` on TM Game as its target route - that route no longer exists after this story;
  Herald's own plan needs a follow-up note or redirection, out of this story's scope and repo.
- The shared `tm_game.devlog_entries` collection is untouched. TM Admin's own separate
  `server/routes/devlog.js` (confirmed this session to target the same collection, its file header
  literally says "ported from TM Game's server/routes/devlog.js") remains the sole live
  reader/writer - this was a code-only retirement on TM Game's side.
- `specs/reference-data-ssot.md` re-confirmed to have no Devlog entry, both at story-creation time and
  again during dev-story - nothing to correct there.
- **Real environmental finding, not a code defect**: the unbounded full vitest run
  (`cd server && npm test`) hangs indefinitely at `tests/issue-836-legacy-tracker-cache-removed.test.js`,
  matching CLAUDE.md's own documented issue #1125. Re-ran with `--exclude` for that one file to get a
  real result. This is pre-existing repo behaviour, unrelated to this story.
- Full server regression: 22 files / 16 tests failed (out of 240 files / 4305 tests, 124 skipped for
  missing local `mongod` per CLAUDE.md's documented behaviour). Every failing file individually
  checked against `devlog`/`admin.js`/`admin.html`/`server/index.js`/`test-app.js` content - none
  touches any file this story changed. 3 of the 22 (`n7-n9-allocator-readers.test.js`,
  `epic.708.3-cycle-phase-controls.test.js`, `oath-a-pledge-helpers.test.js`) plus
  `issue-1013-indomitable-rules-text.test.js` match CLAUDE.md's already-documented pre-existing list
  exactly. 5 more (`fix.943.retireStripDerived.test.js`, `issue-830-inherited-card-css.test.js`,
  `bl3a-one-inclan-implementation.test.js`, `gdx-4-css-standards-grep.test.js`,
  `issue-823-test-db-guard.test.js` - the last a stale `tm_suite_test` literal from before the
  ecosystem's tm_suite->tm_game rebrand) were not previously documented in CLAUDE.md; each
  individually confirmed pre-existing via `git stash -u` A/B against unmodified base code, identical
  failure counts both times - a real, wider-than-CLAUDE.md-documents pool, matching ADMR-1's own
  precedent finding the same thing. The remaining failing/skipped files are all
  `*-parallel-write.test.js` and `rule-engine-integration.test.js`, mongod-dependent skips per
  CLAUDE.md's documented behaviour, not failures. `tests/issue-1135-deleted-tabs.spec.js`
  (Playwright): 12/12 green, including the new inverted Devlog test replacing the one this story's
  own change made obsolete.
- `git diff --stat 65987a68 HEAD -- public/ server/ tests/` shows only this story's deliberate
  removals - 5 files deleted, 6 files modified - no incidental churn. **CORRECTED post-review**: this
  line originally said "6 files deleted, 5 files edited," transposed from the real count; caught by
  an external Codex review and re-verified directly against `git diff --stat`/`--name-status`.

### File List

- **Deleted:** `public/js/admin/devlog-admin.js`
- **Deleted:** `server/routes/devlog.js`
- **Deleted:** `server/schemas/devlog_entry.schema.js`
- **Deleted:** `server/tests/api-devlog.test.js`
- **Deleted:** `tests/issue-502-devlog-tab.spec.js`
- **Modified:** `public/js/admin.js` (removed `devlog-admin.js` import and dispatch line, replaced
  with an explanatory comment)
- **Modified:** `public/css/admin-layout.css` (deleted the 50-line dead `.dl-*` block, a
  post-commit, pre-review self-caught gap - see Task 2's own correction note)
- **Modified:** `public/admin.html` (removed the Devlog sidebar button and `#d-devlog` domain section)
- **Modified:** `server/index.js` (removed `devlogRouter` import and `/api/devlog` mount)
- **Modified:** `server/tests/helpers/test-app.js` (removed the same import/mount from the test
  harness)
- **Modified:** `tests/issue-1135-deleted-tabs.spec.js` (inverted the admin-side Devlog test,
  mirroring the adjacent Tickets test; review-fix pass simplified it further, dropping a vacuous CSS
  check, and corrected the section heading above it)
- **Modified:** `specs/stories/sprint-status.yaml` (status progression + `last_updated` header)
- **Created:** `specs/stories/admr-2-retire-devlog-admin.md` (this file)
- **Created, review-fix pass:** `server/tests/devlog-removed.test.js` (static regression guard,
  mirroring `server/tests/tickets-removed.test.js`)
- **Modified, review-fix pass:** `tests/player.spec.js` (corrected a stale mixed-case `DevLog`
  comment reference this story's own case-sensitive grep missed)
- **Modified, review-fix pass:** `specs/deferred-work.md` (logged 2 out-of-scope, pre-existing
  findings from the external review)

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-08-26 | Code review CLOSED via external Codex (CLI-direct, high reasoning effort, 3-pass adversarial protocol - interrupted by a usage limit before Pass 3b's own Validation Notes, but every finding across all passes was written before the interruption). 0 High, 6 Medium, several duplicate/informational Low findings. 6 patched (a missing regression guard for the full route retirement, added `server/tests/devlog-removed.test.js` mirroring `tickets-removed.test.js`, prove-discriminated; a vacuous CSS-404 test assertion, removed; a stale section-heading comment, corrected; a 6th devlog-referencing file this story's own case-sensitive grep missed, `tests/player.spec.js`, comment corrected; contradictory AC #5/#7 wording, reworded; a transposed diff-stat count in Completion Notes, corrected). 2 dismissed with evidence as pre-existing and unrelated to this diff (a stale `render.yaml` env var, a `playwright.config.js` dependency gap that only reproduces in a network-restricted sandbox) - both logged to `deferred-work.md`. 1 finding independently re-verified rather than trusted: Codex's own sandbox reported wildly different full-suite numbers due to a MongoDB Atlas `EACCES` in its environment; re-ran the same gate in this session's own environment and got numbers identical to the original record (22 files/16 tests failed, 218/4165 passed, 124 skipped). Status: review -> done. | Claude (bmad-code-review, external Codex + verification) |
| 2026-08-26 | Post-commit, pre-review self-correction: found and deleted a 50-line dead `.dl-*` CSS block in `public/css/admin-layout.css` that Task 2's original pass missed (styled the now-deleted `devlog-admin.js` markup). Matches ADMR-1's own precedent of finding orphaned CSS via a self-check grep. Second commit, ahead of the external Codex review. | Claude (bmad-dev-story) |
| 2026-08-26 | Dev-storied via bmad-dev-story: ready-for-dev -> review. Full retirement executed exactly as scoped; no deviations found during implementation. Real environmental finding surfaced (not a code defect): the unbounded full vitest run hangs at the already-documented issue-836 file (#1125); re-ran excluding it. 5 previously-undocumented pre-existing failures found and individually confirmed via git stash A/B, none related to this story. | Claude (bmad-dev-story) |
| 2026-08-26 | Story created via bmad-create-story. Full-retirement scope confirmed directly by Angelus after this session's own scoping pass surfaced a real (but currently non-functional) TM Herald cross-repo consumer and asked before assuming either direction. | Claude (bmad-create-story) |

## Senior Developer Review

**External Codex review** (`codex exec`, CLI-direct, `model_reasoning_effort=high`, 3-pass adversarial
protocol - Blind Hunter, Edge Case Hunter, Acceptance Auditor - run against the diff `git diff
65987a68 HEAD` spanning both commits `9cb37051` and `15a59519`). Full findings:
`specs/stories/code-review/admr-2-retire-devlog-admin-codex-findings.md`. The Codex session hit its
own usage limit partway through Pass 3b, before it could write a Validation Notes section - every
High/Medium/Low finding across all four pass-labels was written to disk before the interruption, so
nothing substantive was lost, but the review's own self-attestation is missing. This session ran that
verification directly instead: re-read the cited code, re-ran every claimed command, and
prove-discriminated every patch, rather than trusting the interrupted session's own account.

**0 High findings.** 6 Medium, 10 Low (several duplicates from the interrupted run - collapsed to their
real count below), every one independently re-verified against the real code or a real command before
triage, not accepted on Codex's own word.

### Patched (6, all prove-discriminated where a runtime behaviour was involved)

1. **No surviving regression guard for the full route retirement** (Medium, confirmed real) -
   deleting `server/tests/api-devlog.test.js` removed the only proof `/api/devlog` stays gone; this
   repo already has an established static-guard pattern for exactly this situation
   (`server/tests/tickets-removed.test.js`, from #1135). Added `server/tests/devlog-removed.test.js`,
   mirroring it exactly (asserts `server/index.js` and `server/tests/helpers/test-app.js` mount no
   `/api/devlog` route, the route/schema files don't exist, and no route file imports the deleted
   module). Prove-discriminated: temporarily reintroduced `app.use('/api/devlog', ...)` into
   `server/index.js`, watched the new test fail on exactly that assertion (1/4 failed), restored the
   file, confirmed `git diff server/index.js` empty and the test green again (4/4).
2. **The CSS "no 404" assertion in the new Devlog e2e test was vacuous** (Medium, confirmed real) -
   unlike Tickets (which had a real, separately-requested `admin-tickets.css`), Devlog's CSS was
   always inline in the shared `admin-layout.css`, so a filter for `/devlog/i` against failed/404
   request URLs could never fire regardless of whether the CSS cleanup was correct. Removed the
   `badCss` check and the test's misleading "no 404 for a deleted devlog stylesheet" framing; renamed
   to `'#1135/ADMR-2: admin has no Devlog domain'`. Re-ran: 12/12 green, including this test.
3. **Stale section-heading comment** (Low, confirmed real) -
   `tests/issue-1135-deleted-tabs.spec.js:149`'s own heading still said "Tickets gone, City and Devlog
   untouched" directly above the test proving Devlog is now gone too. Corrected to "Tickets and
   Devlog gone, City untouched."
4. **A sixth devlog-referencing test file was missed by this story's own grep** (Medium/Low, confirmed
   real) - `tests/player.spec.js:152` has a comment using mixed-case `DevLog`; this story's original
   repo-wide grep (Task 1) was case-sensitive and missed it. No test *logic* referenced the deleted
   surface (comment only), but AC #5's own "no file silently left referencing... something that no
   longer exists" standard applies to guidance text too. Corrected the comment to note DevLog's
   retirement explicitly. Re-verified case-insensitively (`grep -rni "devlog"`) that no further file
   was missed the same way.
5. **AC #5 and AC #7 stated contradictory acceptance standards** (Medium, confirmed real) - AC #5
   literally required "the full suite... is green afterward," while AC #7 explicitly allows a
   disclosed pre-existing failure instead. Reworded AC #5 to state the same honest standard as AC #7
   rather than a stricter, self-contradicting one - matching ADMR-1's own precedent for the identical
   AC-wording defect in that story's own review.
6. **The Dev Agent Record's diff-stat accounting was transposed** (Low, confirmed real) - Completion
   Notes said "6 files deleted, 5 files edited"; the real count (`git diff --stat 65987a68 HEAD --
   public/ server/ tests/`) is 5 deleted, 6 modified. Corrected the line and cited the exact command
   used to re-verify it.

### Dismissed with evidence (2)

1. **Pass 1's provisional "admin-boot vacuity" concern** (Medium as raised, Low/informational once
   Pass 2 read the helper) - Pass 1, blind to the repo, correctly flagged that the three
   `toHaveCount(0)` checks *could* pass vacuously if the admin app never booted. Pass 2 read
   `loginAsAdmin()` and found it waits for `#admin-app:not([style*="display: none"])` before the test
   proceeds - the same structure the adjacent, pre-existing Tickets test in the same file already
   uses. Re-confirmed directly: the new Devlog test's structure is byte-for-byte parallel to the
   Tickets test it was modelled on. Not a real gap; the blinding worked as intended, then resolved
   itself once informed. No code change.
2. **Two findings the reviewer itself flagged as environmental, both independently confirmed
   environmental** (Low/Medium) - `render.yaml`'s orphaned `ANNOUNCE_DEVLOG_CHANNEL_ID` (its whole
   `bot:` service block has been stale since the `bot/` directory was extracted to `TM Herald`,
   2026-07-20, over a month before this story - not this diff's doing) and `playwright.config.js`'s
   use of an undeclared `http-server` dependency (reproduces only in a network-restricted sandbox;
   confirmed this session's own environment has no such restriction and the real Playwright command
   runs clean). Neither file is touched by this diff. Both logged to `deferred-work.md` under a new
   `## Deferred from: code review of admr-2-retire-devlog-admin` section rather than fixed here.

### Re-verified independently, not just re-read (1)

- **[Pass 3b] "The recorded full-suite totals are not reproducible"** - Codex's own sandbox hit
  `EACCES` connecting to MongoDB Atlas and got wildly different numbers (96 failed/135 passed/9
  skipped files) from this story's recorded 22/218/0-skipped-files. Re-ran the exact same gate
  command in this session's own working environment: **22 files / 16 tests failed, 218 files / 4165
  tests passed, 124 skipped (4305 total), 581.42s** - identical to the number originally recorded.
  Confirms the divergence was Codex's own sandboxed network restriction, not an error in this story's
  record. `tests/issue-1135-deleted-tabs.spec.js` re-run after every patch above: 12/12 green
  throughout.

### Verdict

Ready to ship. No High findings; every Medium/Low either patched (with prove-discrimination where a
runtime claim was involved) or dismissed with direct evidence, not on the reviewer's word alone. Full
regression after all patches: `server/tests/devlog-removed.test.js` 4/4 (new),
`tests/issue-1135-deleted-tabs.spec.js` 12/12 (Playwright), full server suite unchanged at
22 files/16 tests failing out of 240/4305 (124 skipped) - identical to the pre-patch baseline, since
every patch this round touched only test files and story documentation, not application code.
`git status --short` confirms no unintended change survives (the one deliberate temporary edit to
`server/index.js`, used for prove-discrimination, was fully restored and verified byte-identical to
the committed version before this review concluded).
