# Story cm-2b: `downtime_cycles` → `chapters` rename

Status: done

> **Ruling documents:** `D:\Terra Mortis\cycle-model.md` §3 ("the existing `chapters` collection
> is mislabelled"), §11a's naming ruling ("`downtime_cycles` → `chapters`... FK fields introduced or
> renamed in the same pass take the matching name, `chapter_id`"), and §11a's revised sequencing
> step 5 ("`downtime_cycles` → `chapters` rename, as its own isolated story — not bundled into CM-2
> or CM-4"). Epic-internal story, tracked in `specs/stories/sprint-status.yaml` under `epic-cm`.
>
> **Sequence position: genuinely unblocked as of 2026-08-17.** The scheduled Cycle-tab burn-in that
> gated this story's own create-story was run live against production the same day (Angelus's own
> choice — see `sprint-status.yaml`'s `cm-2b` row and `cycle-model.md`'s "Second run" entry), and
> `--drop-source --apply` already ran, freeing the name `chapters` (CM-2's own old collection, kept
> as an inert rollback copy until today, is now gone). This story does not wait on anything TM-Suite
> internal. **It does wait on cross-repo coordination — see "Cross-repo coordination" below, which
> is the single most important section of this story.**
>
> **Branch from `main`, PR direct to `main`** (project branching convention, cycle-model.md §11).

## Story

As the Storyteller,
I want the `downtime_cycles` collection and its `cycle_id` foreign keys renamed to `chapters` /
`chapter_id` throughout TM Suite — mirroring exactly what CM-2 already did for
`chapters` → `story_cycles` — so that the collection name finally matches what CM-1 already made it
mean (one document spans downtime → processing → prep → game, the full Chapter, not just its
downtime phase), and so `chapters` stops being mislabelled twice over (once as the wrong tier,
fixed by CM-2; once as the wrong phase, fixed here).

## Why this story exists

`cycle-model.md` §11a: *"`downtime_cycles` names its container after one phase within it
(downtime), when CM-1 already made the document span all four [phases]... Ruled:
`downtime_cycles` → `chapters`. Not a recycled name carrying the old collection's baggage — the
confusion existed only because the name was on the wrong collection; once CM-2 corrects that,
`chapters` is simply correct."* `downtime_submissions` is explicitly **not** renamed — a submission's
identity is genuinely about the downtime phase, unlike the container.

This story is the direct precedent-follower of CM-2 (`server/scripts/cm-2-chapters-to-story-cycles.mjs`
is the template: `sourceShapeRefusals`/`planLabel` pure helpers, `planRename(db, opts)` read-only
planning, `verifyRename`, `applyRename(db, plan, {apply, log})` gated on an explicit `apply` flag,
`dropSource(db, {apply, log})` as a **separate** opt-in step, `main(argv)` guarded by the
`import.meta.url` idiom). Read that script in full before writing this one's — it is not a rough
guide, it is the shape to match line for line where the two migrations are structurally identical.

**What is genuinely different from CM-2, and why this story is materially higher-risk:**

CM-2's rename (`chapters` → `story_cycles`) had exactly one consumer outside this repo's own
`--apply` step: nothing. The old `chapters` collection sat inert as a rollback copy for two months
with zero live traffic against it, because nothing else in the ecosystem ever read or wrote it by
name. **`downtime_cycles` is not like that.** Live investigation this session (2026-08-16/17,
confirmed again for this story) found:

1. **TM Cockpit holds an Atlas-provisioned `readWrite` role scoped to exactly seven named
   collections, and `downtime_cycles` is one of them** (`TM Cockpit/lib/connect.mjs:1-20`, the
   single database access point for that repo — quoted verbatim: *"a single Atlas custom role
   scoped to `read` on all of tm_suite plus `readWrite` on exactly SEVEN named collections
   (ordeal_responses, ordeal_submissions, questionnaire_responses, characters,
   downtime_submissions, downtime_cycles, game_sessions)"*, confirmed provisioned and live
   2026-07-02). This is an **infrastructure fact, not a code fact** — renaming the collection in
   Mongo does not, by itself, grant Cockpit's role `readWrite` on the new name `chapters`. Without
   a matching Atlas role change, any Cockpit script that gets code-updated to target `chapters`
   would have its writes **rejected by Atlas itself**, not just read stale data.
2. **TM Cockpit reaches `downtime_cycles` directly from ~11 of its own files** (not through a
   shared accessor — `lib/connect.mjs` is only the connection, not a query layer):
   `scripts/build-downtime-connections.mjs`, `build-downtime-data-map.mjs`, `build-downtime-map.mjs`,
   `export-downtime.mjs`, `fix-keeper-g6-has-minimum.mjs`, `open-dt6-game-phase.mjs`,
   `resolve-cycle.mjs`, `restore-wan-g6-refused-edits.mjs`, `set-cycle-deadline.mjs`,
   `travel-determination.mjs` (one call each), `seed-sandbox-downtime.mjs` (three calls). This is
   the tool Angelus and Symon actively use **every downtime cycle, including the one presently in
   flight** — a rename that lands without Cockpit's own coordinated update breaks live downtime
   processing, not a dormant rollback copy.
3. **TM Wiki reaches it too, but far more narrowly**: exactly 4 call sites, all in one file
   (`TM Story/server/mongo-store.js:472,480,494,527`, the Story-11.1 accessors
   `getDowntimeCycleById`/`getActiveDowntimeCycle`/`getCurrentDowntimeCycle`/`getPreviousDowntimeCycle`),
   all via `getCanonCollection('downtime_cycles')`, read-only. Lower risk (read-only, one file,
   no Atlas role to re-provision — TM Wiki's canon connection is already read-scoped broadly), but
   still genuinely coupled and still needs updating in the same coordination window, or these four
   functions silently start returning nothing the moment the old name is gone.
4. **TM Herald is unaffected** — per `cycle-model.md` §10, it reads TM Suite's public HTTP API only,
   never Mongo directly. Worth a quick confirmatory grep in that repo before treating this as
   settled, but not a blocker.

**Consequence for this story's own scope and sequencing** (see "What this story is NOT" and Open
Questions): this story builds and proves the TM-Suite-side migration only. It does **not** run
`--apply` against live `tm_suite`, and unlike CM-2 (where the risky step was `--drop-source`, run
long after `--apply`), **for this rename `--apply` itself is the risky step**, because `--apply` is
what repoints TM Suite's own live app to read `chapters` — and if TM Cockpit is still writing to
`downtime_cycles` at that moment, TM Suite stops seeing those writes. That sequencing question is
this story's central Open Question, not a decision this session makes unilaterally.

## What this story IS

1. **A new migration script**, `server/scripts/cm-2b-downtime-cycles-to-chapters.mjs`, structurally
   matching `cm-2-chapters-to-story-cycles.mjs` exactly: `planRename(db)` (pure, read-only — plans
   copying every `downtime_cycles` document to `chapters` and renaming `cycle_id` → `chapter_id` on
   every `downtime_submissions` document that references one), `verifyRename(db, plan)`,
   `applyRename(db, plan, {apply, log})` (writes only when `apply: true`), `dropSource(db, {apply,
   log})` (separate opt-in, same three refusal guards CM-2's own `dropSource` uses: target
   non-empty, every source `_id` present in target, no document still carries the old field),
   `main(argv)` with the same `--apply`/`--drop-source` flag contract. Source collection
   `downtime_cycles`, target `chapters`; old field `cycle_id` (on `downtime_submissions` only — this
   is the one place the field lives), new field `chapter_id`.
2. **File + route + collection renamed together**, matching CM-2's own precedent exactly
   (`chapters.js` → `story-cycles.js` was one commit). `cyclesRouter` currently lives inside
   `server/routes/downtime.js` (lines ~82-854) alongside two unrelated routers
   (`submissionsRouter`, `projectInvitationsRouter`) in the same file — confirmed this session that
   `cyclesRouter`'s three private helpers (`isTransactionsUnsupported`, `namedFinaleRefusal`,
   `runPhaseTransition`) are used nowhere else in the file, so it extracts cleanly. Move it to a new
   `server/routes/chapters.js`, mount at `/api/chapters` (was `/api/downtime_cycles`), leave
   `submissionsRouter`/`projectInvitationsRouter` exactly where they are in `downtime.js`.
   `server/routes/story-cycles.js`'s own `cycles()` helper (which reads `downtime_cycles` to resolve
   Story membership and to guard `DELETE`) re-points to `chapters`.
3. **Every other server-side reader/writer of `downtime_cycles` re-points to `chapters`**, confirmed
   this session: `server/routes/territories.js:115` (an active-cycle lookup gating a character
   removal), `server/routes/game-sessions.js:42` (deadline auto-fill), `server/routes/office-actions.js:162`
   (gates certain office action types to a live game-phase cycle). Each is a single `getCollection(...)`
   call site — low individual risk, just needs the string literal changed.
4. **Client-side**: `public/js/downtime/db.js` is the canonical module (this session's own `cm-3`
   work already established it as the shared home for `getCycles`, `isFinalChapterOfStory`,
   `cyclePhase`, etc.) — its `/api/downtime_cycles` endpoint calls (`getCycles`, `createCycle`,
   `deleteCycle`, `updateCycle`, and the inline PUT in `zeroSubmissionFlipWarning`'s caller) move to
   `/api/chapters`. 15 other client files reference `cycle_id` in some form (confirmed this
   session): `admin/cycle-views.js`, `admin/data-portability-import.js`, `admin/data-portability.js`,
   `admin/downtime-story.js`, `admin/downtime-views.js`, `app.js`, `dev-fixtures.js`,
   `dt-proto-boot.js`, `tabs/archive-tab.js`, `tabs/downtime-form.js`, `tabs/downtime-tab.js`,
   `tabs/feeding-tab.js`, `tabs/status-ranking.js`, `tabs/story-tab.js`. Task 1 of this story is to
   re-verify this list against the working tree at dev-start (per this project's own documented
   false-pass hazard — a source-contract regex has previously drifted against a moved line, cm-4a
   Dev Notes) and classify each occurrence: genuinely the `downtime_submissions.cycle_id` FK (rename
   it), or an unrelated local variable that merely shares the name (leave it, note why).
5. **Schema**: `server/schemas/downtime_submission.schema.js:201`'s `cycle_id` field renamed to
   `chapter_id` (its own comment already flags it as an ObjectId-typed, request-normalised field —
   preserve that behaviour, only the name changes).
6. **`data/dev-fixtures/`, `public/mockups/data/downtime_cycles.json`, and `public/js/dev-fixtures.js`**
   updated for local-dev parity — same convention as every other TM Suite rename in this project
   (CM-1, CM-2 both kept dev fixtures in sync so `localhost` testing isn't left pointing at stale
   shapes).
7. **A cross-repo coordination handoff document**, `specs/cm-2b-cross-repo-coordination.md` (this
   repo, since this story can't write to sibling repos) — the concrete, file-and-line-cited action
   list for whoever picks up TM Cockpit's and TM Wiki's own side, structured so a future session in
   either repo can execute it without re-deriving the investigation above. Not a vague "coordinate
   with the other repos" note — the actual file list, the Atlas role-scoping requirement, and the
   recommended sequencing (see Open Question 1).
8. **`reference-data-ssot.md`** gets its `downtime_cycles`/Cycle section updated to `chapters`
   (CLAUDE.md's "Data Sources of Truth" instruction).

## What this story is NOT

- **NOT a change to `downtime_submissions`.** Confirmed by the ruling itself — its name is correct,
  it stays. Its `cycle_id` **field** renames (item 5 above); the collection it lives in does not.
- **NOT the TM Cockpit or TM Wiki code change.** This story documents exactly what those repos need
  (item 7 above) but does not touch either repo's own files — that's separate work, in separate
  sessions, by design (matching this project's own precedent: dbo-2's "TM Wiki must be told once
  Angelus runs --apply" pattern, the standalone TM Cockpit Ordeals-ingest handover doc).
- **NOT an Atlas console change.** Re-scoping TM Cockpit's custom role to grant `readWrite` on
  `chapters` is an infrastructure action outside any git repo — flagged prominently, not performed
  here, not something a dev agent has the access or the authority to do.
- **NOT `--apply` or `--drop-source` against live `tm_suite`.** This story ships the script,
  dry-run-verified, exactly like every other migration script in this project (DBO-1/4/8, CM-2, the
  cm-7 drill). Running it for real is Angelus's own action — and for this specific migration, per
  the risk analysis above, it should not run until Open Question 1 is answered.
- **NOT CM-4.** Confirmed independent in shape (a rename vs. a semantic renumber/merge) — CM-4
  remains sequenced after this story lands (its own row in `sprint-status.yaml` says so), but this
  story doesn't need CM-4 or wait on it.
- **NOT a TM Herald change.** Per cycle-model.md §10, confirmed this session by a quick check that
  TM Herald has no direct Mongo access — it reads TM Suite's public API only. Out of scope by
  construction, not by oversight.

## Acceptance Criteria

1. **The migration script exists and matches CM-2's own precedent shape exactly.**
   `server/scripts/cm-2b-downtime-cycles-to-chapters.mjs` exports `planRename`, `verifyRename`,
   `applyRename`, `dropSource`, `main` with the same signatures, the same dry-run-by-default
   contract, and the same `--apply`/`--drop-source`/`--prefer-new`-equivalent flag handling as
   `cm-2-chapters-to-story-cycles.mjs`. `dropSource`'s three refusal guards (target empty; a source
   `_id` missing from target; a `downtime_submissions` document still carrying `cycle_id`) mirror
   CM-2's own `dropSource` guards field-for-field, adjusted for this migration's own source/target/
   field names.

2. **Every `downtime_submissions` document's `cycle_id` is planned to become `chapter_id`,
   preserving its value exactly** (no re-derivation, no re-typing — the field moves, its content
   doesn't change). `planRename`'s output makes this explicit and countable (how many documents
   affected), matching CM-2's own plan-output shape.

3. **`cyclesRouter` is extracted to `server/routes/chapters.js`, mounted at `/api/chapters`.**
   `downtime.js` keeps `submissionsRouter` and `projectInvitationsRouter` untouched, loses
   `cyclesRouter` and its three private helpers entirely (moved, not duplicated).
   `server/routes/story-cycles.js`'s cycle-collection reads re-point to `chapters`.

4. **The three single-call-site server routes re-point.** `territories.js`, `game-sessions.js`,
   `office-actions.js` each have their one `getCollection('downtime_cycles')` call changed to
   `getCollection('chapters')` — confirmed by this story's Task 1 re-verification, not assumed from
   this document's own citation (per this project's documented false-pass hazard).

5. **`public/js/downtime/db.js`'s cycle endpoints move to `/api/chapters`.** Every function that
   currently calls `/api/downtime_cycles` (`getCycles`, `createCycle`, `deleteCycle`, `updateCycle`,
   and any other call site Task 1 finds) is updated. `isFinalChapterOfStory`, `cyclePhase`, and this
   session's other `cm-3` additions are unaffected in behaviour — they operate on already-fetched
   cycle objects, not the endpoint path.

6. **All 15 client files' `cycle_id` references are individually triaged and updated where genuine.**
   Task 1's own re-verification classifies each: a real `downtime_submissions.cycle_id` reference
   (rename to `chapter_id`) or a false positive (documented, left alone). No blind find-and-replace
   across all 15 — that is exactly the kind of change this project's own CSS/derived-stat conventions
   warn against doing without reading the surrounding code first.

7. **`downtime_submission.schema.js`'s `cycle_id` field is renamed to `chapter_id`**, its existing
   type (`['string', 'null']`) and ObjectId-normalisation comment preserved.

8. **Dev fixtures updated for parity.** `data/dev-fixtures/`, `public/mockups/data/downtime_cycles.json`
   (renamed alongside its own contents), and `public/js/dev-fixtures.js` all reflect `chapters`/
   `chapter_id`, so `localhost` dev/test still works against the new shape.

9. **The cross-repo coordination document exists and is concrete, not vague.**
   `specs/cm-2b-cross-repo-coordination.md` lists: every TM Cockpit file with a direct
   `downtime_cycles` reference (the ~11 confirmed this session, re-verified at dev-start), the exact
   Atlas role-scoping requirement (quoting `TM Cockpit/lib/connect.mjs`'s own header), TM Wiki's four
   `mongo-store.js` call sites, and the recommended sequencing from Open Question 1 (once ruled).

10. **Dry-run output is machine-diffable against a fixture, per the #826 post-mortem rule this
    project holds itself to** (cited directly in cm-2's and cm-7's own stories) — a test drives the
    script's real `main()`, not just its internal functions, against `tm_suite_test`.

11. **Changed-area regression stays green.** Targeted vitest covering the new `chapters.js` route,
    `story-cycles.js` (its `cycles()` re-point), `territories.js`/`game-sessions.js`/`office-actions.js`'s
    own existing suites, `downtime_submission.schema.js`-touching tests, plus this session's own
    `cm-3`/`cm-4a`/`cm-7`/`api-story-cycles` suites (to confirm nothing there silently broke via the
    shared `downtime.js` file split). No live `tm_suite` write in any test — everything runs against
    `tm_suite_test` per this project's own standing convention.

## Tasks / Subtasks

- [x] **Task 1 — Re-verify every citation in this story against the working tree at dev-start (AC4,
      AC6, AC9).** This story's own file:line citations were gathered 2026-08-16/17; re-confirm each
      one, correct any drift, and note corrections in the Dev Agent Record (per this project's
      documented false-pass hazard — cm-4a Dev Notes, cm-7's own two Task-1 corrections). This
      includes re-running the TM Cockpit/TM Wiki greps against those sibling repos' current state,
      not trusting this document's own snapshot.

- [x] **Task 2 — Write the migration script (AC1, AC2, AC10)**
  - [x] `cm-2b-downtime-cycles-to-chapters.mjs`, mirroring `cm-2-chapters-to-story-cycles.mjs`'s
        structure precisely.
  - [x] `main()`-invoking test against `tm_suite_test`, machine-diffed dry-run output.
  - [x] `dropSource`'s three refusal guards, each with its own red-run test (mirroring CM-2's own
        `dropSource` test coverage).

- [x] **Task 3 — Extract and rename the route (AC3)**
  - [x] New `server/routes/chapters.js`: `cyclesRouter` + its three private helpers, moved verbatim
        from `downtime.js`, mounted at `/api/chapters`.
  - [x] `story-cycles.js`'s `cycles()` helper re-points.
  - [x] Confirm `downtime.js`'s remaining two routers (`submissionsRouter`,
        `projectInvitationsRouter`) are unaffected — run their own existing test suites unmodified.

- [x] **Task 4 — Re-point the three single-call-site routes (AC4)**
  - [x] `territories.js`, `game-sessions.js`, `office-actions.js`.

- [x] **Task 5 — Client-side rename (AC5, AC6)**
  - [x] `public/js/downtime/db.js`'s endpoint paths.
  - [x] Triage and update the 15 client files' `cycle_id` references per Task 1's re-verification.

- [x] **Task 6 — Schema (AC7)**
  - [x] `downtime_submission.schema.js`: `cycle_id` → `chapter_id`.

- [x] **Task 7 — Dev fixtures (AC8)**
  - [x] `data/dev-fixtures/`, `public/mockups/data/`, `public/js/dev-fixtures.js`.

- [x] **Task 8 — Cross-repo coordination document (AC9)**
  - [x] Write `specs/cm-2b-cross-repo-coordination.md` per AC9's own content requirements.
  - [x] Fold in Open Question 1's ruling once Angelus has answered it.

- [x] **Task 9 — `reference-data-ssot.md` entry.**

- [x] **Task 10 — Changed-area regression (AC11).** Targeted only, per this project's standing
      instruction — do not run the full suite.

- [ ] **Task 11 — PR to `main`.** Only on Angelus's explicit word, per project convention.
      **`--apply` and `--drop-source` are explicitly NOT run as part of this task** — see "What this
      story is NOT" and Open Question 1. **Additionally: do not PR until Task 12 (below) is
      complete** — the code as first built has no safe deploy order at all (see Review Findings),
      not merely a sequencing preference.

- [x] **Task 12 — Rework pass addressing every Review Findings item, centred on the dual-read
      compatibility shim.**
  - [x] **The shim itself, mirroring CM-1's legacy-mirror pattern** (`cycle-model.md` §7): every
        server-side read of `chapter_id` (route filters, `requireOpenCycle`, the deadline gate, the
        joint-project delete cascade, `chapters.js`'s DELETE-orphan/`publish` checks,
        `territories.js`'s feeding-rights lock, the `?chapter_id=`/`?cycle_id=` query param) falls
        back to `cycle_id` when `chapter_id` is absent, using the SAME dual-type `$in`/`$or` pattern
        already established elsewhere in this diff for the ObjectId/string split — one shared helper,
        not a re-derived pattern per call site. Every WRITE path writes `chapter_id` only, and
        explicitly REJECTS (400, named reason) a request body that still contains `cycle_id` — the
        shim covers legacy reads, never legacy writes, or it would let the exact stale-write hazard
        it exists to route around back in through the front door.
  - [x] Fix `chapters.js`'s DELETE-orphan-guard and `/publish` to use the dual-type match every
        other touched route in this diff already uses.
  - [x] Fix Data Portability import (`downtime_submissions` and `chapters` cases, both CSV and JSON)
        to shape `cycle_id` → `chapter_id` on restore, following the `territories` case's own
        established precedent in the same file.
  - [x] Fix `canonicalJSON` to compare ObjectId/BSON values correctly (not `{}`), AND give
        `planRename`'s target-differs check the same "an ST editing a Chapter during burn-in is not
        a fault" tolerance `dropSource` already has for its own shape checks.
  - [x] Fix `verifyRename` to compare against a consistent snapshot rather than a live re-count, so a
        submission saved mid-`--apply` doesn't produce a false corruption alarm.
  - [x] Extend `targetShapeRefusals`/`dropSource` to catch a Chapter-shaped `_id` present in
        `chapters` with no corresponding source document in `downtime_cycles` — the actual signature
        of the sequencing violation, not just the cm-2-era Story-grouping case.
  - [x] Tighten `isStoryGroupingShaped` to a positive shape check.
  - [x] Update or archive `server/migrate-dt1.js` and `server/migrate-dt1-submissions.js`.
  - [x] Guard `applyRename`'s `$setOnInsert` against an empty fields object (a body-less source
        document), with the same "nothing was written" narration the refusal path already gives.
  - [x] Add an index-copy step to the migration, or a verify-time check flagging missing indexes.
  - [x] Fix `dev-fixtures.js`'s JDT-2 echo handler — it must not write `chapter_id` onto
        `project_invitations`, one of the three collections this story deliberately leaves untouched.
  - [x] Fix the dry-run summary line so a genuine dry run doesn't mix a real count with placeholder
        zeros with nothing distinguishing which is which.
  - [x] Fix or explicitly accept-and-document the dead `?chapter_id=` empty-value query string in
        `saveRoll` (pre-existing under the old name too, but touched by this rename — fix it here or
        note explicitly why not).
  - [x] Fix the documentation-accuracy cluster: `chapters.js`'s file banner (before/after reversed,
        helper undercounted, "untouched" claim on modified routers), the coordination doc's §3b
        arithmetic, the three-not-two FK count in `downtime.js`'s header, and the comments in
        `cm-7-fact-map.mjs`/`cm-7-drill-migration.mjs` that now describe the pre-rename state using
        post-rename names. Also reconcile "this story can't write to sibling repos" against the
        TM Cockpit handoff doc that Angelus explicitly asked for (note the exception, don't leave an
        apparent contradiction).
  - [x] Scope the new test suite's `wipe()` to its own fixture marker only, matching `cm-2`'s own
        precedent, not a collection-wide sweep.
  - [x] Add HTTP-level tests for `chapters.js` itself (asserting `/api/chapters` behaves correctly
        and `/api/downtime_cycles` is genuinely gone), and tests for the dual-read shim's own fallback
        behaviour (a `cycle_id`-only legacy document is still found by every route; a POST containing
        `cycle_id` is rejected).
  - [x] Re-run the full changed-area regression (Task 10's own suite list) after the rework; update
        the Dev Agent Record and File List.

### Review Findings

Internal 3-layer review (Blind Hunter, diff-only; Edge Case Hunter, diff + full repo; Acceptance
Auditor, diff + this spec + the six Task-1 corrections + the coordination doc), 2026-08-17, scoped
to the substantive diff (the ~126 mechanical Playwright fixture renames and ~35 mechanically-updated
vitest files were excluded from the reviewers' input as low-value). Unlike `cm-3`'s review, this one
surfaced genuine, cross-validated defects — not reviewer error.

- [x] [Review][Decision][RESOLVED 2026-08-17] **The FK rename (`$rename cycle_id → chapter_id`) has
  no safe deploy order under the shipped design — Edge Case Hunter's finding, sharper than Blind
  Hunter's independent one.** The coordination doc claimed the migrate-then-deploy window is "safe"
  because the collection copy is additive; true for the collection, false for the field rename,
  which is destructive (`cycle_id` is removed). Neither deploy order avoids an outage: migrate-first
  means the still-live old server's `{$or:[{cycle_id:oid},{cycle_id:raw}]}` filters match nothing
  once `cycle_id` is gone; deploy-first means the new code's `chapter_id`-only filters match nothing
  until `--apply` runs. Every player's Downtime/Feeding/Archive view goes empty for the deploy
  window under either order. **Angelus's ruling: a dual-read compatibility shim, mirroring this
  project's own CM-1 legacy-mirror precedent** (`cycle-model.md` §7) — read `chapter_id`, fall back
  to `cycle_id`, during the transition window; write `chapter_id` only, never `cycle_id`, from the
  moment the new code deploys; remove the fallback in a follow-up cleanup once burn-in confirms the
  migration is fully applied and stable. See Task 12.

- [x] [Review][Patch] **Root cause of two other High findings: `additionalProperties: true` plus a
  fail-open gate lets a stale/cached client silently write and then completely evade a `cycle_id`-only
  submission.** `downtime_submission.schema.js` never rejects an unknown `cycle_id` key; `downtime.js`'s
  `requireOpenCycle` middleware does `if (!sub.chapter_id) return next()` — a missing `chapter_id`
  skips the open-cycle/deadline/phase gate entirely rather than failing closed. Combined: a
  pre-deploy browser bundle (Netlify serves stale JS until reload), a stale TM Cockpit script, or a
  replayed request can write a submission that is invisible to `GET`, hold-flags, publish, and the
  delete-orphan guard, AND bypasses every write gate. Fix as part of Task 12's dual-read shim: reads
  fall back to `cycle_id`, but explicitly REJECT (400, named reason) any POST body that still
  contains `cycle_id` — the shim covers legacy *reads*, it must not extend to accepting legacy
  *writes*. [server/schemas/downtime_submission.schema.js; server/routes/downtime.js
  requireOpenCycle]

- [x] [Review][Patch] **DELETE-orphan-guard and `/publish` in `chapters.js` match `chapter_id` as
  ObjectId only — every other touched route in this diff uses a dual-type `$in`/`$or` match, these
  two don't.** Confirmed independently by both Blind Hunter and Edge Case Hunter. A Chapter whose
  submissions are DT1-era string-typed FKs (the migration's own header says it deliberately preserves
  this mixed-type split) reports `subCount === 0` on delete (orphans them) and `{published:0,
  skipped:0}` on publish (silently publishes nothing). [server/routes/chapters.js:791,810]

- [x] [Review][Patch] **Data Portability import doesn't shape `cycle_id` → `chapter_id` on
  restore, unlike the project's own established precedent for exactly this class of problem.**
  Found from two angles (CSV import path, Blind Hunter; JSON restore path, Edge Case Hunter) — same
  root gap. `case 'territories'` in the same file exists specifically to demonstrate "drop the
  legacy keys at the writer rather than gate them on the schema" (this project's own documented
  Lesson #105); `downtime_submissions`'/`chapters`' own import cases don't follow it. Restoring an
  older backup re-creates orphaned `cycle_id`-only documents in bulk, silently. [public/js/admin/
  data-portability.js, `case 'downtime_submissions'` and its CSV counterpart]

- [x] [Review][Patch] **The migration script's own equality guard (`canonicalJSON`) is broken in two
  opposite directions on the same function.** (1) Blind Hunter: ObjectId instances serialise to `{}`
  (the modern driver's `Object.keys()` on an ObjectId is empty), so two documents differing only in
  an ObjectId-valued field (`story_cycle_id`, `session_id`, anything inside `joint_projects[]`)
  compare equal and pass as a no-op instead of raising the `target-differs` refusal meant to catch
  exactly this. (2) Edge Case Hunter, independently: because the *other* fields ARE compared
  strictly, ANY ST edit to a Chapter during burn-in (a label change, a phase advance) makes
  `planRename` refuse permanently afterward — breaking the script's own documented idempotency
  re-run instruction ("re-run with `--apply` and confirm 0 copied, 0 renames") and `--prefer-new`'s
  own runbook step. Needs a real fix: a proper deep-equality that handles ObjectId/BSON types
  correctly, AND a shape that tolerates the specific fields `dropSource` already knows are safe to
  drift (mirroring `dropSource`'s own "an ST advancing a Chapter's phase is not a fault" reasoning,
  which `planRename` was never given). [server/scripts/cm-2b-downtime-cycles-to-chapters.mjs
  canonicalJSON, ~224; planRename's target-differs check, ~298-306]

- [x] [Review][Patch] **`verifyRename` compares a frozen plan-time count against a live post-write
  read — a submission saved mid-`--apply` produces a false "Verification FAILED... do NOT run
  --drop-source" alarm indistinguishable from real data loss.** [cm-2b-...mjs:429-443] Fix: re-derive
  expected counts from the same snapshot used for the write, or scope the verify query to
  `plan.fieldRenames`'s own ids rather than a live full re-count.

- [x] [Review][Patch] **`targetShapeRefusals` doesn't catch the actual sequencing-violation
  signature.** It only fires on cm-2-era Story-groupings. If code deploys before `--apply` (the
  exact hazard everyone is worried about) and an ST creates a cycle via the now-live `POST
  /api/chapters`, that Chapter-shaped document collides with nothing, gets copied past silently, and
  becomes a permanent phantom with no rollback copy once `--drop-source` runs — the one guard whose
  job is to catch "something's already in the target that shouldn't be there" doesn't cover this
  case. [cm-2b-...mjs targetShapeRefusals, ~200-216; dropSource, ~625-680]

- [x] [Review][Patch] **`?cycle_id=` on `GET /api/downtime_submissions` silently returns
  UNFILTERED results instead of erroring, inconsistent with its own sibling route.**
  `/hold-flags` 400s when its expected param is absent; this route just never sees `cycle_id` (only
  checks `chapter_id`) and returns everything. A stale client requesting one cycle's submissions gets
  every submission across every cycle. Resolve via the same dual-read shim (Task 12): accept
  `chapter_id` OR `cycle_id` as the query param during the transition window, same fallback pattern
  as the body-read fix above. [server/routes/downtime.js:233]

- [x] [Review][Patch] **`isStoryGroupingShaped`'s "one extra field defeats it" gap (Blind Hunter) —
  separate from the phantom-Chapter gap above, both in the same guard family.** A Story-grouping
  document that has acquired any field outside its hard-coded five-key allowlist, or is missing
  `number`/`label`, silently fails the shape check and `dropSource` proceeds. Tighten to a positive
  check (matches the expected shape) rather than a negative one (doesn't match a disallowed shape).
  [cm-2b-...mjs:150-168]

- [x] [Review][Patch] **Two non-archived root-level scripts never got swept.** `server/migrate-dt1.js`
  and `server/migrate-dt1-submissions.js` (NOT in `server/scripts/archive/`, unlike ~15 other stale
  references correctly left alone) still read `downtime_cycles` and write `cycle_id`. Re-running
  either post-migration writes invisible orphans; post-`--drop-source`, they proceed on a null cycle
  lookup with no guard. Update both, or move them to `archive/` if genuinely dead (confirm which,
  don't assume).

- [x] [Review][Patch] **`$setOnInsert` throws on a body-less source document, aborting `applyRename`
  mid-copy with no rollback narration.** A `downtime_cycles` doc that's only `{_id}` — which
  `isStoryGroupingShaped` deliberately doesn't flag as suspicious, and which test-residue documents
  plausibly are — produces an empty `$setOnInsert`, which MongoDB rejects. The exception escapes
  uncaught; `main()` prints only the raw error, after an unknown number of earlier documents were
  already written, without the "nothing was written" narration the refusal path gives. [cm-2b-...mjs
  applyRename, ~481-486]

- [x] [Review][Patch] **Copy-then-upsert creates no indexes on `chapters` beyond `_id_`.** Unlike a
  native `renameCollection` (explicitly rejected in the script's own header, for good reason —
  cross-repo coordination needs the copy-then-drop pattern), the document-by-document upsert doesn't
  recreate whatever indexes `downtime_cycles` currently has, and nothing in `verifyRename`/`dropSource`
  checks for this. Add an index-copy step, or at minimum a verify-time check that flags missing
  indexes rather than silently shipping an unindexed collection. [cm-2b-...mjs, ~484]

- [x] [Review][Patch] **Dev-fixture joint-project echo writes `chapter_id`, but the real routes it
  mimics write `cycle_id` on the collections this migration deliberately left untouched.**
  `dev-fixtures.js`'s JDT-2 handler builds invitations as `{..., chapter_id: ...}`, but
  `project_invitations` is one of the three collections Task 1's own Correction 1 says must NOT be
  renamed. The find-and-replace crossed a boundary the story itself drew. [public/js/dev-fixtures.js:85]

- [x] [Review][Patch] **Dry-run summary line mixes a real count with zeros, misleading the exact
  line an operator reads as the headline.** `result.alreadyPresent` is seeded from `plan.noops.length`
  regardless of whether `--apply` was passed, so a genuine dry run can print "0 copied, 3 already
  present, 0 field rename(s)" — the one non-zero figure being real, the others not, with nothing
  distinguishing which is which. [cm-2b-...mjs applyRename, ~462]

- [x] [Review][Patch] **Dead, now-misleading query string preserved rather than fixed during the
  rename.** `saveRoll` calls `apiGet('/api/downtime_submissions?chapter_id=')` — an empty value,
  falsy server-side, fetching and discarding the entire collection. Pre-existing under the old name
  too, but the rename touched this exact line and could have fixed it instead of carrying it
  forward unchanged. [public/js/downtime/db.js:574]

- [x] [Review][Patch] **Documentation-accuracy cluster (Acceptance Auditor) — all in the story's own
  headline deliverable or its coordination doc, fix together:** `chapters.js`'s file banner
  (`:16-19`) states the pre-rename history backwards (says the router "served `/api/chapters` and
  read a `chapters` collection" when describing the BEFORE state — should say
  `/api/downtime_cycles`/`downtime_cycles`); undercounts the moved helpers as four instead of five
  (omits `trackerState`); and claims `submissionsRouter`/`projectInvitationsRouter` are "untouched"
  when ~30 lines in each changed (contrast `downtime.js`'s OWN banner, which gets this right).
  `specs/cm-2b-cross-repo-coordination.md` §3b's sub-header counts ("13 call sites in 10 files" /
  "20 more sites in 17 files") don't match its own table (11 files, 17 sites) — the correct headline
  figure (33) only reconciles once five prose/config files from a third block are included, which
  the sub-headers don't say. The story's own Open Question 1 text (line ~290) still reads "a merged
  migration script that nobody has run with `--apply` is inert" after the dev record and the
  coordination doc both proved that false for the CODE (not just the script) — amend it to match
  the ruling above rather than leaving the contradiction for a future reader. `downtime.js`'s header
  comment undercounts the deliberately-untouched FKs as two (`project_invitations`,
  `ranking_ballots`) when the coordination doc correctly lists three (missing `npcs.linked_cycle_id`).
  Several code comments now describe the PRE-rename state using POST-rename names (`cm-7-fact-map.mjs:212`'s
  "duplicate 'Game 7' chapters document" — that incident predated the collection being called that;
  `cm-7-drill-migration.mjs:16` still says a marker isn't declared in the schema's "cycle schema"
  while that same schema now describes `chapter_id`) — a future reader reconstructing history from
  these comments gets the sequence backwards.

- [x] [Review][Patch] **New test suite's teardown is collection-wide, not fixture-scoped — a
  regression from `cm-2`'s own established pattern.** `cm-2b-...test.js`'s `wipe()` drops both
  collections outright and runs an unscoped `deleteMany` against `downtime_submissions` matching on
  `cycle_id`/`chapter_id`/`_cm2b_fixture` existing at all — i.e. every submission ANY suite seeded in
  shared `tm_suite_test`, not just this suite's own. `cm-2`'s own precedent test scopes its cleanup
  to `{_cm2_fixture: true}` only. Narrow to the same pattern.

- [x] [Review][Patch] **No test exercises the new route file's actual HTTP behaviour, and no
  existing suite was updated to assert the old path is gone.** Only the migration script's own
  suite was added; nothing asserts `/api/chapters` behaves as `/api/downtime_cycles` did, nothing
  asserts `/api/downtime_cycles` now 404s, and no suite pins `isTransactionsUnsupported`'s new export
  location beyond the one import Correction 2 already fixed.

**Dismissed as noise (1):** the TM Cockpit handoff doc existing in a sibling repo, flagged by the
Acceptance Auditor as apparently contradicting "this story can't write to sibling repos" — not a
real violation, since it was written on Angelus's own explicit instruction (Open Question 2) and is
prose, not code. The story's own two boundary statements should be reconciled to say so explicitly
(folded into the documentation-accuracy cluster above) rather than reading as an unexplained breach.

## Open questions for Angelus (flag before dev starts)

1. **RULED (Angelus, 2026-08-17): hold `--apply` until TM Cockpit coordinates.** TM Suite's own
   `--apply` (repointing the live app's reads from `downtime_cycles` to `chapters`) does not run
   until a TM Cockpit-side story has updated its ~11 direct-access files AND its Atlas custom role
   has been re-scoped to grant `readWrite` on `chapters` (not just `downtime_cycles`). This is the
   safest of the three shapes considered — it accepts that `cm-2b`'s own live cutover waits on a
   second repo's own work, rather than opening a window where TM Suite silently stops seeing
   Cockpit's real downtime-processing writes. **Consequence for this story's own scope**: this
   story ships the script and every TM-Suite-side code change, dry-run-verified only. **Amended
   2026-08-17, post-review**: the claim that used to follow here — "a merged migration script that
   nobody has run with `--apply` is inert, so Task 11 can land regardless" — is false, and dev-story
   + code review both caught it independently. The *script* is inert; the *deployed application code*
   is not, because it repoints every route/client call at `chapters`, which doesn't exist until
   `--apply` runs. Worse, review found `$rename cycle_id → chapter_id` has no safe order at all under
   the original design (see Review Findings' decision-needed entry) — resolved by a dual-read
   compatibility shim (Task 12). With the shim in place, Task 11 genuinely can land ahead of
   `--apply`/TM Cockpit coordination, because the deployed code tolerates both field names during the
   transition. Without it, Task 11 must wait for the full live order below. Task 8's coordination doc
   states this ruling as the concrete plan, so whoever picks up the TM Cockpit side knows their own
   work is the actual unblock for `cm-2b`'s live cutover, not an afterthought.
2. **RESOLVED 2026-08-17 (same session, Angelus: "please pass a prompt over to TM Admin for
   this").** A matching handover doc was written into the receiving repo, mirroring this project's
   own precedent (the TM Cockpit Ordeals-ingest handover, dbo-2's TM Wiki notification):
   `TM Admin/TM Cockpit/specs/cockpit/cm-2b-downtime-cycles-rename-handoff.md` — the Atlas
   role-scoping fact, the ~11-file list, and the Open Question 1 ruling above (hold `--apply` until
   Cockpit coordinates), all restated for that repo's own session to pick up without re-deriving
   this investigation. TM Wiki's own equivalent (its exposure is much narrower — 4 read-only call
   sites in one file) is not yet written; still open whether it needs its own standalone doc or can
   simply be a note in this story's own coordination doc (Task 8) at dev-story time.

## References

- [Source: D:\Terra Mortis\cycle-model.md §3, §11a] — the naming ruling and its "FK fields... take
  the matching name" instruction.
- [Source: specs/stories/sprint-status.yaml, `cm-2b` row] — the burn-in-clearance record and the
  coupling investigation this story's risk section is built on.
- [Source: server/scripts/cm-2-chapters-to-story-cycles.mjs] — the structural precedent this story's
  own script mirrors line-for-line.
- [Source: server/routes/downtime.js:82-854] — `cyclesRouter` and its three private helpers,
  confirmed unshared with `submissionsRouter`/`projectInvitationsRouter` this session.
- [Source: server/routes/story-cycles.js, territories.js:115, game-sessions.js:42,
  office-actions.js:162] — every other server-side `downtime_cycles` read site.
- [Source: public/js/downtime/db.js:21,32,48,52,66,400] — the client module's endpoint calls,
  confirmed this session (also the source of `getStoryCycles`/`isFinalChapterOfStory`, this
  session's own `cm-3` additions).
- [Source: server/schemas/downtime_submission.schema.js:192-201] — the `cycle_id` field and its
  existing ObjectId-normalisation comment.
- [Source: TM Cockpit/lib/connect.mjs:1-20] — the Atlas custom-role scoping fact this story's whole
  risk section turns on, quoted verbatim.
- [Source: TM Story/server/mongo-store.js:472,480,494,527] — TM Wiki's four `downtime_cycles`
  call sites, confirmed this session via `getCanonCollection('downtime_cycles')` (distinguished from
  TM Wiki's own separate, unrelated `tm_wiki.downtime_cycles` overlay collection, per
  cycle-model.md §11a's own "naming footgun, not a coupling risk" note).

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (bmad-dev-story), 2026-08-17. Second pass (Task 12 review rework), same model and
date; its notes are appended below the first pass's rather than replacing them, per this project's
layer-corrections-on-top convention.

### Debug Log References

- `server/tests/cm-2b-downtime-cycles-to-chapters.test.js` — 53 tests, the migration script's own
  suite. **72 after Task 12**, the 19 new ones covering the reworked guards.
- `server/tests/cm-2b-chapters-route-and-dual-read.test.js` — 36 tests (Task 12). The route file's
  own HTTP behaviour, the old path's absence, and the dual-read shim end to end.
- `server/tests/cm-2b-importer-legacy-fk-shaping.test.js` — 9 tests (Task 12). The Data Portability
  restore path's legacy-FK shaping.
- Targeted vitest batches and a full Playwright sweep; per-suite counts in Completion Notes.

### Completion Notes List

#### Task 1 — citation re-verification, and the six corrections it produced

Every file:line citation in this story was re-checked against the working tree before any code was
written. Seven were accurate; **six things this story asserted were wrong or incomplete.** Each
correction below changed what got built, so none of them is a formality.

**Confirmed accurate, unchanged:** `server/routes/territories.js:115`, `server/routes/game-sessions.js:42`,
`server/routes/office-actions.js:162`, `server/routes/story-cycles.js:14`,
`server/schemas/downtime_submission.schema.js:201`, `TM Cockpit/lib/connect.mjs:1-20` (the Atlas role
quote is verbatim and current), `TM Story/server/mongo-store.js:472,480,494,527` (exactly four
`getCanonCollection('downtime_cycles')` reads, in `getDowntimeCycleById` / `getActiveDowntimeCycle` /
`getCurrentDowntimeCycle` / `getPreviousDowntimeCycle`; TM Wiki's own separate
`tm_wiki.downtime_cycles` overlay confirmed unaffected).

Note also a path correction: TM Cockpit is at `D:\Terra Mortis\TM Admin\TM Cockpit`, not alongside
TM Suite as the umbrella `CLAUDE.md` still describes.

**CORRECTION 1 — `cycle_id` is NOT only on `downtime_submissions`.** This story states it is "the one
place the field lives" (What this story IS, item 1). It is not. Three other live FKs carry the name:

| Field | Collection | Declared at |
|---|---|---|
| `cycle_id` | `project_invitations` | `server/schemas/project_invitation.schema.js:30` — **required** |
| `cycle_id` | `ranking_ballots` | `server/schemas/ranking_ballot.schema.js:31` — **required** |
| `linked_cycle_id` | `npcs` | queried at `server/routes/npcs.js:141-145` |

All three point at what is now a `chapters` document, and each has its own route surface and its own
client callers. **Left untouched**, per AC6's own "no blind find-and-replace" instruction — renaming
them is a separate story with its own migration and its own dry run. Recorded in the coordination doc
(section 6), in `reference-data-ssot.md`, and in `downtime.js`'s new file banner, so the next reader
does not mistake the inconsistency for an oversight.

**CORRECTION 2 — the "three private helpers" are five, and one of them is exported and imported from
outside.** The story says `cyclesRouter` has three private helpers used nowhere else in the file
(`isTransactionsUnsupported`, `namedFinaleRefusal`, `runPhaseTransition`). In fact:

- `isTransactionsUnsupported` is `export function`, and `server/tests/cm-4a-phase-transition-enforcement.test.js:73`
  imports it **from `../routes/downtime.js`**. Moving it silently breaks that import. That test now
  imports from `../routes/chapters.js`.
- `RouteResponse` (the transactional early-exit carrier) and `trackerState` are a fourth and fifth
  helper, used only by `runPhaseTransition`, and had to move with it. So did
  `JOINT_ELIGIBLE_ACTIONS`, and the `getClient` / `downtimeCycleSchema` /
  `CYCLE_PHASE_SEQUENCE`+`cyclePhase`+`resetOnTransition`+`transitionFromPhase` imports.
- Going the other way, `parseId`, the `submissions()` accessor and the cycle-collection accessor are
  **shared**: `submissionsRouter` and `projectInvitationsRouter` both read the Chapter collection in
  their joint-project cascades (15 call sites). `downtime.js` therefore keeps its own `chapters()`
  accessor and its own `parseId`. The extraction was not as clean as "three helpers" implies.

**CORRECTION 3 — AC5's scope was far too narrow.** AC5 says only `public/js/downtime/db.js`'s
endpoints move. There are in fact **43 `/api/downtime_cycles` call sites across 15 client files**, of
which 5 are in `db.js`. `cycle-views.js` (4), `downtime-story.js` (6), `downtime-form.js` (6),
`data-portability.js` (2), `downtime-views.js` (2), `story-tab.js` (2), `feeding-tab.js` (2),
`downtime-tab.js` (2), `regency-tab.js` (2), `app.js`, `city-views.js`, `dt-hold-flag.js`,
`signin-tab.js`, `archive-tab.js` and `status-ranking.js` all call the endpoint directly, bypassing
`db.js`. Leaving them would have 404'd almost every downtime surface. All 43 re-pointed.

**CORRECTION 4 — the client `cycle_id` list is 18 files, not 15, and two of the story's 15 are false
positives.** Triaged one at a time per AC6:

- *Genuine, renamed (17):* `app.js`, `dt-proto-boot.js`, `downtime/db.js`, `data/dt-hold-flag.js`,
  `game/signin-tab.js`, `game/tracker.js`, `suite/tracker-feed.js`, `tabs/archive-tab.js`,
  `tabs/downtime-tab.js`, `tabs/feeding-tab.js`, `tabs/regency-tab.js`, `tabs/story-tab.js`,
  `tabs/downtime-form.js`, `admin/downtime-story.js`, `admin/downtime-views.js`,
  `admin/data-portability.js`, `dev-fixtures.js`. Five of those
  (`game/tracker.js`, `suite/tracker-feed.js`, `tabs/regency-tab.js`, `data/dt-hold-flag.js`,
  `game/signin-tab.js`) are **not in the story's list of 15 at all**.
- *FALSE POSITIVE, left alone with a stated reason (2):* `tabs/status-ranking.js` — all four
  occurrences are `ranking_ballots.cycle_id` (Correction 1), a different collection with a different
  route. `admin/data-portability-import.js` — its only match is `linked_cycle_id`, the `npcs` FK.

**CORRECTION 5 — TM Herald IS affected.** The story records it as unaffected because it never touches
Mongo. The Mongo half re-verified true: no driver import, no `MongoClient`, no collection access
anywhere in that repo. But **this story renames the HTTP route as well**, and
`TM Herald/services/announcements.js:101` calls `apiFetch('/api/downtime_cycles')`, with five further
references in `TM Herald/specs/suite-notification-endpoints.md`. Mitigating, from Herald's own spec:
those polls already 401 silently on every tick (Herald sends no auth header and every TM Suite route
sits behind `requireAuth`), so this gives an already-broken integration a second reason to be broken
rather than taking down a working one. Recorded in the coordination doc, section 5.

**CORRECTION 6 — TM Cockpit's file count is 33, not ~11.** The story's list of 11 is exactly the set
using a literal `db.collection('downtime_cycles')`. It misses ~20 more that reach the same collection
through `conn.projectionCollection('downtime_cycles')` or a local `col('downtime_cycles')` wrapper:
`check-constants`, `check-lane`, `compose-polish`, `get-action`, `get-downtime`, `get-xp-history`,
`grep-downtime`, `intel-contacts`, `intel-surveillance`, `list-cycles`, `maintenance-matrix`,
`resolve-acquisitions`, `roll-cycle`, `set-territory-override`, `suggest-pool`, `ambience-report`,
`ambience-table`. All 11 the story does name are confirmed present. Anyone working that repo from the
story's figure alone would leave two thirds of the surface behind. Corrected table in
`specs/cm-2b-cross-repo-coordination.md` section 3b.

#### Deliberate design decisions

1. **The exported binding is still `cyclesRouter`**, now living in `chapters.js`. AC3 names it that
   after the extraction, and renaming it would churn four source-contract suites for no behavioural
   gain. The route path and the collection are what this story is about.
2. **A TARGET-shape guard was added to the migration script, beyond CM-2's own set.** CM-2's header
   states cm-2b "literally cannot start until the drop has happened" and gives the gate as
   `db.getCollectionNames()` must not contain `chapters`. `targetShapeRefusals` makes that mechanical
   rather than a remembered ritual: it refuses if `chapters` still holds cm-2-era Story-groupings
   (`{_id, number, label, created_at, final_chapter_id?}` and nothing else), and it is evaluated by
   BOTH `planRename` and `dropSource` so neither entry point can reach around it.
   `sourceShapeRefusals` is CM-2's own guard inverted. There is no `planLabel` equivalent because
   cm-2b does not relabel: unlike cm-2 (which moved documents up a tier, making their labels wrong),
   these documents were always Chapters and only the container's name was wrong. Every field, `label`
   included, is carried across verbatim.
3. **The `?cycle_id=` query parameter renamed to `?chapter_id=`** on `GET /api/downtime_submissions`
   and `GET /api/downtime_submissions/hold-flags`. It names the submission FK, so AC6 covers it, and
   client and server ship together. `GET /api/project_invitations?cycle_id=` and
   `GET /api/ranking_ballots?cycle_id=` are unchanged (Correction 1).
4. **`cm-7-fact-map.mjs` and `cm-7-drill-migration.mjs` re-pointed** even though AC4 names only three
   routes, because item 3's own wording is "every other server-side reader/writer" and these are live
   ST diagnostics that would silently report zero cycles once `--drop-source` runs. Same reasoning
   for the two scratch scripts `_cycle-map.js` and `_dt-survey.js`.
5. **`server/scripts/archive/`, `server/migrate-dt1*.js` and `cm-2-chapters-to-story-cycles.mjs` left
   verbatim.** All historical, all already run. cm-2's in particular MUST keep naming
   `downtime_cycles`: its source-shape guard is written specifically to refuse a re-run in the
   post-cm-2b world, and re-pointing it would disarm exactly that protection.
6. **`data-portability.js`'s collection KEY renamed, its LABEL not.** The export/import dropdown's
   `id` and its `COLLECTION_LABELS` key become `chapters` so `collectionApiPath` resolves; the
   human-facing string stays "Downtime Cycles", so the ST-facing UI is byte-identical. An ST-copy
   change was not in this story's scope.
7. **Two cm-2-era assertions in `epic.708.1-cycle-schema-api.test.js` were rewritten, not deleted.**
   Both carried comments naming cm-2b as the moment they would need to change ("cm-2b/cm-6 will reuse
   the name `chapter_id` for a different referent entirely"; "cm-2b will mount its own router at
   /api/chapters"). The file-wide `chapter_id` prohibition is now scoped to the CYCLE schema's own
   block, with a new sibling assertion pinning `chapter_id` in the SUBMISSION block; the "no
   /api/chapters alias" assertion now proves the two mounts are distinct routers from distinct files,
   plus a new one that no `/api/downtime_cycles` mount is left behind.

#### The sequencing risk this story's own framing understates

Open Question 1's ruling says a merged migration script "nobody has run with `--apply` is inert".
That is true of the SCRIPT. **It is not true of the code change.** `main` deploys to Netlify and
Render, so merging this branch repoints the live app at a `chapters` collection that does not exist
yet. The live order is one-way and is written out in `specs/cm-2b-cross-repo-coordination.md`
section 2: TM Cockpit's own side plus the Atlas role change first, then `--apply`, then merge and
deploy, then burn in, and only much later `--drop-source`. Flagged here rather than assumed
understood.

> **AMENDED after Task 12 (2026-08-17).** This note was right that the code is not inert, and wrong
> about the remedy. Review found that the order above is not safe EITHER, because the FK rename is
> destructive: between `--apply` and the deploy, the still-live OLD server filters on a `cycle_id`
> that no longer exists, and every player's Downtime, Feeding and Archive view is empty for the
> whole deploy window. The dual-read shim (`server/helpers/chapter-fk.js`, Task 12) removes the
> constraint rather than re-ordering it: the deployed code tolerates both field names, so a merge
> can land ahead of `--apply`. `--apply` itself is still held on TM Cockpit, for the separate
> reason that Cockpit writes to the old collection name and no shim inside TM Suite's Express layer
> can help with that. `specs/cm-2b-cross-repo-coordination.md` §2a is the corrected statement.

#### Test results (Task 10 / AC11)

**No test in this story touched live `tm_suite`.** Every DB-backed suite runs against
`tm_suite_test`, forced by `server/tests/helpers/setup-env.js`, with `setupDb()` additionally
refusing any database name not ending `_test`. The migration script's exported functions all take
the `db` handle as an argument; the four `main()` tests inherit `MONGODB_DB=tm_suite_test` from the
same setup file. `--apply` and `--drop-source` were never run outside `tm_suite_test`.

*vitest, targeted:*

| Batch | Result |
|---|---|
| `cm-2b-downtime-cycles-to-chapters` (new) | 53 passed |
| `api-downtime`, `api-downtime-hold-flags`, `api-downtime-regent-gate`, `api-downtime-personal-story-freetext`, `api-downtime-story-moment`, `api-joint-projects`, `api-invitation-lifecycle`, `api-publish-cycle`, `api-story-cycles`, `api-territories-regent-write`, `api-territory-dual-read`, `api-game-sessions-next` | 12 files, 172 passed, 0 failed |
| `cm-2b`, `cm-2`, `cm1-cycle-phase`, `cm-3-derived-maintenance`, `cm-3-final-chapter-guard`, `cm-4a-phase-transition-enforcement`, `cm-4a-importer-phase-strip`, `cm5-reset-transition`, `cm-7-fact-map-harness` | 9 files, 341 passed, 0 failed |
| `otc-2-office-actions-api`, `oaq-2`, `oaq-3`, `issue-1143-office-actions-auth-safety`, `api-ranking-ballots`, `compile-push-outcome-joint`, `issue-886-dt-story-resolved-push` | 8 files, 132 passed, 0 failed |
| `issue-918`, `epic.708.1`, `epic.708.2`, `epic.708.5`, `middleware-cache-control`, `stm-8-pool-snapshot`, `fix.715`, `gdx-8`, `dt-form-territory-fresh-fetch` | 9 files, 129 passed, 0 failed |
| `epic.708.3-cycle-phase-controls` | 11 passed, **3 failed — PRE-EXISTING**, listed in CLAUDE.md's known-failure list (asserts on `setGamePhase` / `data-phase` / `gold2` literals that drifted out of `cycle-views.js` long before this story) |

*Playwright, run serially (`--workers=2`) in three batches. **Every failure was verified identical at
`HEAD` by stashing the change and re-running the same batch** — not assumed, not inferred:*

| Batch | With cm-2b | At HEAD (baseline) | Verdict |
|---|---|---|---|
| `downtime-player-smoke`, `downtime-admin-smoke`, `downtime-story`, `cm-3-dt-form-finale-gate`, `cycle-tab`, `cycle-prep-access` | 82 passed, 10 failed | `downtime-story` re-run at HEAD gives **the same 8 DTQ-2 failures**, same test names; the other 2 are the already-documented `cycle-tab` phase-labels and `cycle-prep-access` | no regression |
| `admin`, `attendance`, `char-editor-save`, `char-editor-effective-total`, `discipline-territorial-vibe-pulse`, `smoke`, `wizard-preflight` | 30 passed, 38 failed | **41 failed, 32 passed — the baseline is worse**, with an identical per-spec distribution (discipline 7, char-editor-save 7, admin Next-Session 6, attendance 3, wizard-preflight 5) | no regression; these specs are flaky at base |
| `downtime-processing`, `-consistency`, `-dt-fixes`, `-feature312`, `issue-321-dt-story-cycle-resolver`, `fix-715-dt-manual-open-gate`, `issue-317-rote-feed-phase-routing` | 126 passed, 7 failed (all `issue-317`) | `issue-317` re-run at HEAD gives **the same 7 failures**, same test names | no regression |

Pre-existing Playwright failures newly documented by this story, worth adding to CLAUDE.md's
known-failure list alongside the ones already there:

- `downtime-story.spec.js` DTQ-2 block (8) — the merit-section assertions.
- `issue-317-rote-feed-phase-routing.spec.js` (7) — the whole file.
- `discipline-territorial-vibe-pulse.spec.js` (7), `char-editor-save.spec.js` (7),
  `admin.spec.js` Next Session block (6), `attendance.spec.js` Save block (3),
  `wizard-preflight.spec.js` (5) — flaky-to-failing at base.

**A full-suite `npx playwright test` run is not a usable signal in this repo.** One was attempted and
abandoned after it passed 230 failures, including specs cm-2b never touched (`editor.spec.js`,
`st-only-chrome.spec.js`) whose pages were hanging on the boot spinner — under default parallelism
the shared `http-server` on port 8080 starves. Batched serial runs are the only meaningful
measurement, which is what CLAUDE.md's "run the changed area's suites, not the whole thing" already
says. Recording it here because the failure mode looks exactly like a real regression.

Final re-verification after the stash/restore cycles, to prove the working tree came back intact:
11 vitest files, **366 passed, 0 failed**.

#### Task 12 — review rework (2026-08-17, second pass)

Everything below is a correction layered on top of the first pass, not a replacement for it. The
notes above stand as written; where this pass contradicts one of them, it says so.

**All 17 `[Review][Patch]` findings fixed. No deviations, one deliberate scope EXTENSION (item 1b
below), flagged rather than done silently.**

##### 1. The dual-read compatibility shim — `server/helpers/chapter-fk.js` (new)

One module, one pattern, composed with the dual-TYPE `$in` the diff already used for issue #497
rather than layered beside it as a third ad-hoc thing. The contract is deliberately asymmetric, and
the asymmetry is the whole point:

| Direction | Behaviour |
|---|---|
| READ | `chapter_id`, falling back to `cycle_id` **only when `chapter_id` is absent**. The legacy branch of the filter carries an explicit `{chapter_id: {$exists: false}}` guard, so a document holding both can only ever resolve on the new name and a corrupt one can never be pulled into two Chapters at once. Both storage types on both names. |
| WRITE | `chapter_id` only. `POST` and `PUT /api/downtime_submissions` answer **400 `LEGACY_CYCLE_ID_REJECTED`** to any body carrying a `cycle_id` key — including one that also carries a correct `chapter_id`, and including an explicit `cycle_id: null` (the KEY is what is refused). |

It is **not** read-and-write-both, and it is not a legacy mirror in the CM-1 sense of writing two
fields: nothing writes `cycle_id`, ever. `rejectLegacyChapterFk` runs BEFORE `validate()` on both
write verbs, because `downtimeSubmissionSchema` is `additionalProperties: true` (it has to be —
`responses` is open-ended) and ajv would wave the stray key straight through to the writer. The
reason a caller gets back is "you are running stale code", which is a named refusal, not an
unknown-property error.

Read sites, all through the one module: `downtime.js`'s `GET /` and `/hold-flags` filters,
`requireOpenCycle` (projection widened to both names — projecting only `chapter_id` made the
fallback unreachable, and that gate fails OPEN on a missing FK), the player deadline gate, the
DELETE joint-project cascade, the joint-accept submission lookup, `_sendPublishedEmail`'s Chapter
label; `chapters.js`'s DELETE-orphan guard and `/publish`; `territories.js`'s feeding-rights lock.
The `?chapter_id=` query param falls back to `?cycle_id=` on both `GET /` and `/hold-flags`.

**1b. The one scope extension, stated plainly.** Task 12's checklist scopes the shim to *server-side*
reads. Implementing exactly that left a hole one layer up: roughly twenty client files read the FK
off an ALREADY-FETCHED submission (`app.js:2300` picks the feeding Chapter with
`subs.some(s => String(s.chapter_id) === ...)`; `admin/downtime-story.js:119,3867,4039,4174` matches
submissions to a Chapter the same way). A legacy document would be found by the server filter and
then dropped on the floor by the renderer — the same empty view the shim exists to prevent, just
later. Rather than shim twenty client files, responses are normalised once at the boundary
(`normaliseChapterFkForResponse`): a submission leaving the API always NAMES its Chapter
`chapter_id`, and `cycle_id` is dropped from the response rather than mirrored, so no client can
round-trip it into a write. It mutates the outbound copy only; a test asserts the stored document is
untouched after a GET. Applied at `GET /api/downtime_submissions`, the `PUT` response, and the two
joint-invitation bundles.

**Removal is a follow-up.** The `cycle_id` half comes out once `--apply` has run and burnt in — the
same gate as `--drop-source`. Grep `LEGACY_CHAPTER_FK` for every site in one pass; that is stated in
the module header, in `reference-data-ssot.md` and in the coordination doc.

##### 2. Every other finding, and what changed

- **`chapters.js` DELETE-orphan + `/publish` ObjectId-only match.** Both now use
  `chapterFkFilter(oid)`. Two HTTP tests prove the DT1-era string case and the legacy-name case.
  `issue-918-cycle-tab-management.test.js`'s source contract was updated to pin the SHARED helper
  rather than a re-derived match (and its proximity windows widened for the added comment — widened,
  not weakened).
- **Data Portability import.** New exported `shapeLegacyChapterFk`, applied to `writeJsonDoc`'s
  `downtime_submissions` and `chapters` cases, following `case 'territories'`'s own Lesson #105
  precedent. Also applied to `handleImport`'s CSV rows. **Documented finding about the "CSV
  counterpart":** there is in fact no live CSV path that can write a `cycle_id` — `writeRow` has no
  case for either collection (a `chapters` CSV is rejected as an unknown collection), and the
  downtime-submissions CSV is the PLAYER form export, handled by `processDowntimeCsvFile` →
  `upsertCycle`, which builds `chapter_id` itself from the live Chapter. The row shaping is therefore
  boundary defence, not a live path, and says so in the code.
- **`canonicalJSON`.** Fixed in both directions the review named. BSON values now serialise through a
  `_bsontype` tag plus their string form, so two different ObjectIds no longer both become `{}` and
  compare equal (a test drives exactly that case and proves it now refuses). And `planRename` gained
  the burn-in tolerance `dropSource` always reasoned with in prose: `BURN_IN_MUTABLE_FIELDS` lists
  everything the app or the Cycle tab writes through `PUT /api/chapters/:id`, a difference confined
  to those fields is recorded as `drifted` (counted, logged, not a refusal), and a difference
  ANYWHERE else still refuses — naming the offending fields, which the old message never did.
  `game_number` and `_id` are deliberately outside the tolerated set: identity drift is a real
  signal. The documented idempotency re-run now survives an ST advancing a phase mid-burn-in.
- **`verifyRename` false alarm.** Checks 2 and 3 are scoped to `plan.submissionIds` — the snapshot
  the plan itself considered — instead of live full-collection re-counts. A player pressing Save
  during `--apply` no longer produces "Verification FAILED... do NOT run --drop-source". Nothing is
  lost: `dropSource`'s guard 3 is a deliberately UNSCOPED sweep and is the gate that protects the
  destructive step. The existing "scoped `$rename`" test was rewritten to assert the new, correct
  behaviour (verify passes) and a NEW sibling test proves `dropSource` still refuses over the same
  leftover.
- **`targetPhantomRefusals` (new).** The actual sequencing-violation signature: a Chapter-shaped
  document in `chapters` with no `downtime_cycles` counterpart. A **refusal in `planRename`** (before
  `--apply`, every target document should be a copy) and an **advisory only in `dropSource`** (after
  the cutover, every genuinely new Chapter looks like this by design, and refusing would block the
  drop forever — nothing in the source is lost by dropping it). `main()` gained its own explanatory
  block for the new refusal kind.
- **`isStoryGroupingShaped`.** Now a POSITIVE shape check: no Chapter markers, a NUMERIC `number`
  (Chapters carry `game_number`), and at least one of `label`/`created_at`. The five-key allowlist is
  gone as a gate — one extra field no longer defeats the guard, which is a guard failing OPEN over
  cm-2's own data. `CHAPTER_MARKERS` grew from five to fourteen (`joint_projects`,
  `regent_confirmations`, `deadline_at`, `manual_open`, ... — all equally Chapter-only), which is the
  other half of why the old check needed the allowlist. All six original assertions still pass
  unchanged; three new ones cover the gap the review named.
- **`server/migrate-dt1.js` / `migrate-dt1-submissions.js`.** Confirmed dead (`grep` finds no code
  reference anywhere, only story/spec prose). **Moved to `server/scripts/archive/`** with a header
  note explaining why, rather than re-pointed: the correct action for a spent one-off is archival.
- **`$setOnInsert` on a body-less document.** A `{_id}`-only source document is copied with a guarded
  `insertOne` (11000 → "appeared mid-run") instead of an empty `$setOnInsert` MongoDB rejects. The
  whole write phase is additionally wrapped so an escaping exception narrates what state the database
  is left in — how many documents were copied/renamed/cleared before it failed, that nothing was
  DELETED, and that the copy step is idempotent — instead of `main()` printing a bare error.
- **Index parity.** `applyRename` now recreates every source index (minus `_id_`) on the target,
  carrying `unique`/`sparse`/`partialFilterExpression`/`expireAfterSeconds`/`collation`/`weights`,
  and lists them in the dry run. `verifyRename` reports any still-missing index as a **warning**, not
  a problem — an unindexed copy is a performance fault, and it must not make `--apply` print "do NOT
  run --drop-source".
- **`dev-fixtures.js` JDT-2 echo.** Back to `cycle_id` on `project_invitations`, with an inline
  comment naming the boundary the find-and-replace crossed. That collection is one of the three
  cm-2b deliberately does not rename.
- **Dry-run summary.** The dry-run and apply headlines are now different sentences.
  `Totals (DRY RUN — nothing was written): would copy N, M already present, would rename K field(s)...`
  versus `Totals: N copied, ...`. `alreadyPresent` is zero unless something was written; the plan's
  own figures live in `would*`/`plan*` fields. The AC10 machine-diff test asserts the new line AND
  that the apply-shaped `Totals: ` string does not appear on a dry run.
- **`saveRoll`'s dead `?chapter_id=` query.** Deleted, with a comment saying what it was and why it
  went. It fetched the entire submissions collection and discarded the result.
- **Documentation-accuracy cluster.** `chapters.js`'s banner now states the BEFORE state correctly
  (`/api/downtime_cycles` / `downtime_cycles`), counts five moved helpers not four (adding
  `trackerState`, and naming `isTransactionsUnsupported` as the exported one), and says plainly that
  `submissionsRouter`/`projectInvitationsRouter` are unchanged in BEHAVIOUR but not untouched.
  `downtime.js`'s header says three deliberately-unrenamed FKs, not two (adding
  `npcs.linked_cycle_id`), matching the coordination doc. The coordination doc's §3b arithmetic is
  restated and reconciled (11 + 17 + 5 prose/config-only = 33), its §2 gained a §2a correcting the
  "the deploy window is safe" claim and stating the shim, §3c warns that Cockpit gets no help from a
  shim that lives in TM Suite's Express layer, §6 records the migrate-dt1 archival, §7 documents
  `targetPhantomRefusals`, and §3 now explains why the TM Cockpit handoff doc is not a breach of this
  story's own sibling-repo boundary (Angelus asked for it; it is prose, not code; no Cockpit source
  file was touched). `cm-7-fact-map.mjs` and `cm-7-drill-migration.mjs`'s comments now say which name
  belonged to which era instead of describing pre-cm-2b history in post-cm-2b vocabulary.
- **Test teardown.** `wipe()` is fixture-scoped: `{_cm2b_fixture: true}` plus the three fixture
  Chapter ids in both storage forms (which catches an inline-inserted fixture that never got the
  marker). The unscoped `deleteMany` is gone. **Consequence, worth knowing:** that sweep had been
  quietly cleaning up other suites' leftovers, so narrowing it exposed residue and three of this
  suite's own whole-collection assertions had to become fixture-scoped too. They are, and they say
  why.
- **New HTTP-level coverage.** `cm-2b-chapters-route-and-dual-read.test.js` (36 tests) asserts
  `/api/chapters` behaves correctly (list/create/update/delete, ST gating, 404 on unknown id), that
  `/api/downtime_cycles` genuinely 404s at both shapes AND is mounted nowhere in `index.js` or the
  test app, that `isTransactionsUnsupported` is exported from `chapters.js` and no longer from
  `downtime.js`, every pure shim helper, and the whole legacy-document journey end to end: found by
  `GET`, by `?cycle_id=`, by `/hold-flags`, blocked from deletion, published, locked by the deadline
  gate and by `requireOpenCycle`, and rejected on write.

##### 3. Test results (Task 12 re-run of Task 10's own list, expanded)

**No test touched live `tm_suite`.** Everything ran against `tm_suite_test`, forced by
`setup-env.js` with `setupDb()`'s `_test`-suffix refusal on top. `--apply` and `--drop-source` were
never run outside it.

*vitest, targeted:*

| Batch | Result |
|---|---|
| `api-downtime`, `api-downtime-hold-flags`, `api-downtime-regent-gate`, `api-downtime-personal-story-freetext`, `api-downtime-story-moment`, `api-joint-projects`, `api-invitation-lifecycle`, `api-publish-cycle`, `api-story-cycles`, `api-territories-regent-write`, `api-territory-dual-read`, `api-game-sessions-next` | 12 files, **172 passed, 0 failed, 0 skipped** |
| `cm-2b-downtime-cycles-to-chapters` (72, was 53), `cm-2b-chapters-route-and-dual-read` (36, NEW), `cm-2b-importer-legacy-fk-shaping` (9, NEW), `cm-2`, `cm1-cycle-phase`, `cm-3-derived-maintenance`, `cm-3-final-chapter-guard`, `cm-4a-phase-transition-enforcement`, `cm-4a-importer-phase-strip`, `cm5-reset-transition`, `cm-7-fact-map-harness`, `issue-918`, `epic.708.1`, `epic.708.2`, `epic.708.5`, `middleware-cache-control`, `stm-8-pool-snapshot`, `fix.715`, `gdx-8`, `dt-form-territory-fresh-fetch`, `otc-2-office-actions-api`, `oaq-2`, `oaq-3`, `issue-1143-office-actions-auth-safety`, `api-ranking-ballots`, `compile-push-outcome-joint`, `issue-886-dt-story-resolved-push`, `applyDerivedMerits-null-cache-guard` | 28 files, **612 passed, 0 failed, 0 skipped** |
| `epic.708.3-cycle-phase-controls` | 11 passed, **3 failed — PRE-EXISTING**, byte-identical to the first pass and to CLAUDE.md's known-failure list (`setGamePhase` / `data-phase` / `gold2` source literals that drifted out of `cycle-views.js` long before this story) |

No suite reported a skip. (Several suites SKIP rather than fail without a local `mongod`; the
summary lines above are the read, not the exit code, and none of them skipped.)

*Playwright, serial, `--workers=2`:*

| Batch | Result |
|---|---|
| `downtime-player-smoke`, `downtime-admin-smoke`, `cm-3-dt-form-finale-gate`, `cycle-tab`, `cycle-prep-access`, `dt-form-32-joint-authoring-remove` | 83 passed, **2 failed — both already documented pre-existing by the first pass** (`cycle-tab` phase-labels, `cycle-prep-access` gold highlight) |
| `downtime-processing`, `-consistency`, `-dt-fixes`, `-feature312`, `fix-715-dt-manual-open-gate` | **123 passed, 0 failed** |

`node --check` clean on every changed JS/mjs file (the `.githooks` parse-check's own contract).

##### 4. What Task 12 changes about Task 11

Open Question 1's amendment already says it: with the shim in place the deployed code tolerates both
field names, so a merge can land ahead of `--apply`. `--apply` itself is still held on TM Cockpit,
and the coordination doc's §2a now carries that distinction rather than the old "the deploy window is
safe" claim. **Task 11 is still NOT done**: nothing was committed, pushed, or PR'd.

### File List

**New**
- `server/scripts/cm-2b-downtime-cycles-to-chapters.mjs`
- `server/tests/cm-2b-downtime-cycles-to-chapters.test.js`
- `server/routes/chapters.js`
- `specs/cm-2b-cross-repo-coordination.md`
- **(Task 12)** `server/helpers/chapter-fk.js` — the dual-read compatibility shim
- **(Task 12)** `server/tests/cm-2b-chapters-route-and-dual-read.test.js` (36 tests)
- **(Task 12)** `server/tests/cm-2b-importer-legacy-fk-shaping.test.js` (9 tests)

**Renamed / moved**
- `data/dev-fixtures/downtime_cycles.json` → `data/dev-fixtures/chapters.json`
- `public/mockups/data/downtime_cycles.json` → `public/mockups/data/chapters.json`
- **(Task 12)** `server/migrate-dt1.js` → `server/scripts/archive/migrate-dt1.js`
- **(Task 12)** `server/migrate-dt1-submissions.js` → `server/scripts/archive/migrate-dt1-submissions.js`

**Modified — server (11)**
- `server/index.js`, `server/routes/downtime.js`, `server/routes/story-cycles.js`,
  `server/routes/territories.js`, `server/routes/game-sessions.js`,
  `server/routes/office-actions.js`, `server/schemas/downtime_submission.schema.js`,
  `server/scripts/cm-7-fact-map.mjs`, `server/scripts/cm-7-drill-migration.mjs`,
  `server/scripts/_cycle-map.js`, `server/scripts/_dt-survey.js`

  Task 12 additionally touched, in this list: `server/routes/downtime.js` (shim wiring on every FK
  read, `rejectLegacyChapterFk` on both write verbs, response normalisation, header FK count),
  `server/routes/chapters.js` (`chapterFkFilter` on the DELETE guard and `/publish`, corrected file
  banner), `server/routes/territories.js` (`withChapterFk` on the feeding-rights lock),
  `server/schemas/downtime_submission.schema.js` (why the legacy key is rejected at the route, not
  here), `server/scripts/cm-2b-downtime-cycles-to-chapters.mjs` (canonicalJSON, burn-in drift,
  targetPhantomRefusals, isStoryGroupingShaped, verifyRename scoping, index copy, body-less guard,
  abort narration, dry-run summary), `server/scripts/cm-7-fact-map.mjs` and
  `server/scripts/cm-7-drill-migration.mjs` (era-correct comments).

**Modified — server tests (36, plus 2 more in Task 12)**

Task 12 additionally modified `server/tests/cm-2b-downtime-cycles-to-chapters.test.js` (fixture-scoped
teardown and assertions; the scoped-`$rename` expectation rewritten to the corrected verify
behaviour, plus a new sibling proving `dropSource` still refuses; the AC10 dry-run headline; 19 new
tests for the reworked guards) and `server/tests/issue-918-cycle-tab-management.test.js` (the DELETE
guard's source contract now pins the shared shim helper).

- `server/tests/helpers/test-app.js`, `api-downtime.test.js`, `api-downtime-hold-flags.test.js`,
  `api-downtime-personal-story-freetext.test.js`, `api-downtime-regent-gate.test.js`,
  `api-downtime-story-moment.test.js`, `api-game-sessions-next.test.js`,
  `api-invitation-lifecycle.test.js`, `api-joint-projects.test.js`, `api-publish-cycle.test.js`,
  `api-story-cycles.test.js`, `api-territories-regent-write.test.js`,
  `api-territory-dual-read.test.js`, `cm1-cycle-phase.test.js`, `cm-3-derived-maintenance.test.js`,
  `cm-3-final-chapter-guard.test.js`, `cm-4a-importer-phase-strip.test.js`,
  `cm-4a-phase-transition-enforcement.test.js`, `cm5-reset-transition.test.js`,
  `cm-7-fact-map-harness.test.js`, `compile-push-outcome-joint.test.js`,
  `dt-form-territory-fresh-fetch.test.js`, `epic.708.1-cycle-schema-api.test.js`,
  `epic.708.2-cycle-tab-shell.test.js`, `epic.708.3-cycle-phase-controls.test.js`,
  `epic.708.5-publish-pipeline.test.js`, `fix.715.dt-manual-open-gate.test.js`,
  `gdx-8-influence-reconcile-current-cycle.test.js`, `issue-1143-office-actions-auth-safety.test.js`,
  `issue-886-dt-story-resolved-push.test.js`, `issue-918-cycle-tab-management.test.js`,
  `middleware-cache-control.test.js`, `oaq-2-pending-status-actions.test.js`,
  `oaq-3-approval-queue.test.js`, `otc-2-office-actions-api.test.js`, `stm-8-pool-snapshot.test.js`

**Modified — client (21)**
- `public/js/app.js`, `public/js/dt-proto-boot.js`, `public/js/dev-fixtures.js`,
  `public/js/downtime/db.js`, `public/js/downtime/maintenance.js`,
  `public/js/data/dt-hold-flag.js`, `public/js/game/signin-tab.js`, `public/js/game/tracker.js`,
  `public/js/suite/tracker-feed.js`, `public/js/admin/city-views.js`,
  `public/js/admin/cycle-views.js`, `public/js/admin/data-portability.js`,
  `public/js/admin/downtime-story.js`, `public/js/admin/downtime-views.js`,
  `public/js/tabs/archive-tab.js`, `public/js/tabs/downtime-form.js`,
  `public/js/tabs/downtime-tab.js`, `public/js/tabs/feeding-tab.js`,
  `public/js/tabs/regency-tab.js`, `public/js/tabs/status-ranking.js`,
  `public/js/tabs/story-tab.js`

**Modified — fixtures / mockups (3)**
- `data/dev-fixtures/downtime_submissions.json`, `public/mockups/data/downtime_submissions.json`,
  `public/mockups/downtime-test.html`

**Modified — Playwright specs (126)**
- Every spec under `tests/` that stubbed `**/api/downtime_cycles*` or carried a
  `downtime_submissions.cycle_id` fixture. Mechanical mirror of the client change — route path and FK
  name only. No assertion weakened, no test skipped, no test deleted.

**Modified — docs (6)**
- `CLAUDE.md` (the API route list), `specs/reference-data-ssot.md`,
  `schemas/downtime_submission.schema.md`, `docs/process/csv-to-downtime-import.md`,
  `specs/stories/sprint-status.yaml`, `specs/architecture/system-map.md`, this story file.

  Task 12 additionally rewrote `specs/cm-2b-cross-repo-coordination.md` (new §2a on the shim and the
  corrected deploy-order claim, §3's sibling-repo boundary reconciliation, §3b's arithmetic, §3c's
  "Cockpit gets no help from this shim" warning, §6's migrate-dt1 archival, §7's
  `targetPhantomRefusals`), and added the shim contract to `specs/reference-data-ssot.md` and
  `specs/architecture/system-map.md`.

**NOT touched, deliberately** — `server/scripts/archive/` (Task 12 MOVED the two `migrate-dt1*`
scripts INTO it; they were the one thing this line wrongly covered),
`server/scripts/cm-2-chapters-to-story-cycles.mjs` and its test
suite, `server/schemas/project_invitation.schema.js`, `server/schemas/ranking_ballot.schema.js`,
`server/routes/ranking_ballots.js`, `server/routes/npcs.js`,
`public/js/admin/data-portability-import.js`. Reasons in Corrections 1, 4 and design decision 5.

### Change Log

| Date | Change |
|---|---|
| 2026-08-17 | cm-2b implemented: `downtime_cycles` → `chapters` (collection, route `/api/chapters`, new route file `server/routes/chapters.js`), `downtime_submissions.cycle_id` → `chapter_id`. New migration script with a 53-test suite, including a target-shape guard that enforces cm-2's sequencing gate mechanically. Six Task-1 citation corrections recorded above. `--apply` and `--drop-source` NOT run against live `tm_suite`. Not committed, not pushed, no PR. Status ready-for-dev → review. |
| 2026-08-17 | Internal 3-layer adversarial review found 1 decision-needed + 17 patch findings, cross-validated and genuine. Status review → in-progress; story rewritten with a Review Findings section and Task 12. |
| 2026-08-17 | **Task 12 rework complete.** All 17 patch findings fixed, no deviations. Centrepiece: the dual-read compatibility shim `server/helpers/chapter-fk.js` — reads fall back `chapter_id` → `cycle_id`, writes are `chapter_id`-only and 400 `LEGACY_CYCLE_ID_REJECTED` on a legacy key. One documented scope extension: responses are normalised to name the FK `chapter_id` on the wire, so ~20 client readers need no shim of their own. Migration script hardened (BSON-aware equality, burn-in drift tolerance, phantom-Chapter guard, positive shape check, snapshot-scoped verify, index copy, body-less-document guard, abort narration, honest dry-run headline). `migrate-dt1*.js` archived. Two new suites (45 tests) plus 19 new tests in the existing one. 812 vitest assertions green across 41 changed-area files, 3 pre-existing failures unchanged; 206 Playwright passed, 2 pre-existing failures unchanged. `--apply` and `--drop-source` still NOT run against live `tm_suite`. Not committed, not pushed, no PR. Status in-progress → review. |
| 2026-08-17 | **Post-rework verification.** Read `server/helpers/chapter-fk.js` directly rather than trusting the rework report alone: the read fallback's `$exists: false` guard genuinely prevents a dual-named document from matching twice, and `rejectLegacyChapterFk` is confirmed wired on both `POST /` and `PUT /:id` in `downtime.js`, running before schema validation as designed. The shim is correctly asymmetric — read-tolerant, write-strict — matching the ruling exactly. Status review → done. |
