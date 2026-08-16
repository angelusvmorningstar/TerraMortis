# Story cm-2: `chapters` → `story_cycles` rename

Status: done

> **Ruling document: `D:\Terra Mortis\cycle-model.md` Rev 3 (2026-08-16), §3 ("The existing
> `chapters` collection is mislabelled — it already holds Stories") and §11a's revised sequencing
> (step 3).** Epic-internal story, no GitHub issue; tracked in `specs/stories/sprint-status.yaml`
> under `epic-cm`.
>
> **Sequence position: SECOND of the remaining CM work, immediately after CM-4a.** §11a puts CM-4a
> first because it has no data-shape dependency; this story is next because it is the precondition
> that **frees the name `chapters`** for CM-2b (`downtime_cycles` → `chapters`). CM-2b cannot start
> until this story's source collection is actually gone — see "Burn-in and the hard sequencing gate"
> in Dev Notes, which makes that a concrete, checkable exit criterion rather than a vibe.
>
> **Branch from `main`, PR direct to `main`** (project branching convention; `dev` flows from `main`,
> never into it). Server-side change: the staging frontend proxies the **production** API, so this
> cannot be smoke-tested on `dev` — it has to reach `main` before any hand-check is meaningful.
> Game 8 is 2026-09-19, so there is no deadline pressure on this.

## Story

As the Storyteller,
I want the collection that actually groups games into Stories to be *called* `story_cycles`, and the
cycle field that points at it to be called `story_cycle_id`,
so that the app's vocabulary matches the settled cycle model instead of contradicting it — and so
the name `chapters` is genuinely vacant for the collection that deserves it.

## Why this story exists

`cycle-model.md` §3 diagnosed the mislabelling and §11a's naming ruling (Angelus, 2026-08-16) turned
it into a two-step cascade. The `chapters` collection does not hold Chapters. Under the settled model
(**1 Chapter = 1 Game + 1 Downtime; 3 Chapters ≈ 1 Story**, §3), a Chapter *is* a game cycle — a
`downtime_cycles` document — and needs no collection of its own. What the `chapters` collection
actually holds is the multi-game grouping above that: a **Story**.

Verified live tonight (2026-08-16, read-only, see Dev Notes for the full dump): three documents
labelled "Chapter 1", "Chapter 2", "Chapter 3", grouping Games 1-3, Games 4-6, and Game 7
respectively. Three-game groupings. Those are Stories.

The cost of leaving it is not cosmetic. §11a ruled `downtime_cycles` → `chapters` for CM-2b, on the
reasoning that once CM-2 corrects the misplacement, `chapters` is *simply correct* for the game-cycle
document. That rename is blocked on this one, because a MongoDB database cannot hold two collections
called `chapters`. This story is the unblocking move.

## What this story is NOT

- **NOT CM-2b** (`downtime_cycles` → `chapters`). Separate, later, explicitly sequenced after this
  story **plus a burn-in** (`cycle-model.md` §11a step 5; the `sprint-status.yaml` row's own words:
  *"Ship + a short burn-in before touching the next rename"*). §11a's reason for keeping them apart
  is on the record: bundling a rename with the semantic document-merge makes a rollback ambiguous
  about which change broke.
- **NOT CM-4** (the renumber / chapter-document merge) or **CM-6** (the `game_sessions` FK link).
  Both carry §6 data preconditions — the falsifiable harness, the drilled rollback, the 12 dangling
  `cycle_id` references — that this story has none of and must not be read as satisfying.
- **NOT a change to the Story-grouping semantics.** This story renames a collection and a field. It
  does not change which cycles belong to which grouping, does not add `story_cycles.chapter_ids`, and
  does not build the "one maintenance chance per chapter in the Story" derived logic. That is **CM-3**,
  still blocked on the ≈3-vs-exact-3 game-rules ruling in §3. The three documents come out of this
  story grouping exactly the seven cycles they group going in.
- **NOT a rename of `downtime_cycles.is_chapter_finale`.** It is a *different field on a different
  collection* — a manual ST toggle, live on real data (Game 3 `true`, Game 4 `false`, absent on the
  other five). Semantically it does mean "final cycle of this grouping", so under the new vocabulary
  it wants to be `is_story_finale` — but renaming it drags in player-facing copy
  (`public/js/tabs/downtime-form.js#L3641-3660`), a second data migration, and CHM-3's whole reminder
  path. `cycle-model.md` §3 says CM-3 **dissolves** the toggle into derived state anyway. Leave it.
  Flagged as an open question so the decision is Angelus's and is recorded, not silently made here.
- **NOT a rename of `game_sessions.chapter_number` / `chapter_label`.** Also a different collection,
  also not an FK to `chapters`, and load-bearing for ADR-010's oath mechanic. There is a genuine
  semantic problem there (Dev Notes → "The `game_sessions.chapter_number` collision") but it is a
  data-content question for Angelus and CM-6's territory, not a rename this story performs.
- **NOT a rename of the oath `forfeiture.chapters` count** (`public/js/data/rules-helpers.js#L917-926`)
  — a rules-parameter integer meaning "a number of chapters", correct under the new vocabulary and
  entirely unrelated to the collection.
- **NOT a relocation of `downtimeCycleSchema`.** It lives in `server/schemas/downtime_submission.schema.js`
  (`#L572`), a file named for submissions — a real pre-existing misplacement, confirmed by reading the
  file. It is out of scope: moving it churns every importer of that module for zero behavioural gain,
  and CM-2b is going to rewrite that schema's identity anyway. One line about it belongs in
  `specs/deferred-work.md`, not in this story's diff. (See Task 7.)
- **NOT a live `--apply` by this session.** Standing convention across every migration story in this
  project's history (`dbo-1`, `oxp-11`, `xpl-2`): the script is written, tested against
  `tm_suite_test`, and left for Angelus to run for real. AC10 states this.
- **NOT a cross-repo change.** Grepped: TM Wiki, TM Cockpit and TM Herald contain **zero** code
  references to `chapters`, `/api/chapters` or `chapter_id` (one prose mention in
  `TM Wiki/specs/epics-v2-story-side.md#L618`, a spec sentence, not code). Nothing outside TM Suite
  changes. §11a step 4's cross-repo coupling check is about `downtime_cycles` and belongs to CM-2b.

## Acceptance Criteria

1. **The route file is renamed to match its resource.** `server/routes/chapters.js` becomes
   `server/routes/story-cycles.js` (kebab-case file named for the resource — the dominant convention
   in `server/routes/`, e.g. `game-sessions.js` → `/api/game_sessions`, `office-merit-dots.js` →
   `/api/office_merit_dots`). Use `git mv` so the history follows the file. Inside it:
   `getCollection('chapters')` → `getCollection('story_cycles')`; `chaptersRouter` → `storyCyclesRouter`
   (named and default export both); the `CHAPTER_IN_USE` error code → `STORY_CYCLE_IN_USE`; every
   `Chapter not found` / `Invalid chapter ID format` / `Chapter is linked to N downtime cycle(s)`
   message reworded to say Story cycle. The DELETE guard's query
   (`cycles().countDocuments({ chapter_id: idStr })`, `chapters.js#L83`) queries `story_cycle_id`.
   No behavioural change: same five endpoints, same auth shape, same status codes, same `{number, label}`
   inline validation.

2. **The mount moves.** `server/index.js#L41` imports from `./routes/story-cycles.js`; `#L210` mounts
   `storyCyclesRouter` at `/api/story_cycles`, keeping `requireAuth, noCache()` exactly as they are.
   **No deprecated `/api/chapters` alias is left behind** — see AC3 for why, and Open Question 2 if
   you want to overrule that.

3. **The `/api/chapters` path is gone, deliberately, with the deploy window accepted and documented.**
   Netlify (frontend) and Render (API) deploy from `main` independently, so there is a window of
   minutes where one is new and the other is not. In that window the admin Cycle tab's
   `Promise.all` fetch fails and the tab renders its existing `Failed to load cycle data: …` error
   (`cycle-views.js#L48-50`) — a visible, recoverable, ST-only failure with no data loss, cleared by a
   reload once both deploys land. This is accepted rather than papered over with an alias, because an
   alias mount at `/api/chapters` would still be sitting in `index.js` when CM-2b mounts *its* router
   at that same path, and Express first-match-wins would silently route CM-2b's traffic to this
   story's router. A visible error for five minutes beats a silent mis-route later.

4. **The schema field is renamed.** In `downtimeCycleSchema`
   (`server/schemas/downtime_submission.schema.js#L602`), `chapter_id: { type: ['string','null'] }`
   becomes `story_cycle_id: { type: ['string','null'] }` with a comment reading
   `// ref to story_cycles collection _id as string`. The old `chapter_id` declaration is **removed,
   not kept alongside** — leaving it would be a stale declared field, and the name is about to be
   reused by CM-2b/CM-6 for an entirely different referent, which is exactly how the current mess
   started. (`additionalProperties: true` on this schema means neither the removal nor the addition
   can reject a live document mid-migration.)

5. **Every client read/write is renamed, including variable and function names.**
   - `public/js/admin/cycle-views.js` — `view.chapters` → `view.storyCycles`; the `apiGet('/api/chapters')`
     call (`#L44`); `buildChaptersPanel` → `buildStoryCyclesPanel`; `buildChapterPicker` →
     `buildStoryCyclePicker`; `buildChapterSelect` → `buildStoryCycleSelect`; the ribbon lookup
     (`#L106-107`) and its `cy.chapter_id` reads; the row-level persist
     (`updateCycle(cy._id, { chapter_id: val })`, `#L537-541`); the create-form `apiPost('/api/chapters', …)`
     (`#L233`); the `apiDelete('/api/chapters/${ch._id}')` (`#L182`); the `err.message.includes('cycle')`
     409 branch (`#L183-186`) which must keep working against the reworded `STORY_CYCLE_IN_USE` message;
     the DOM ids `new-ch-num` / `new-ch-label` / `new-ch-save` / `new-ch-cancel` / `new-cy-chapter`.
   - `public/js/downtime/db.js` — `createCycle`'s `chapterId` option (`#L29`) and
     `if (chapterId) body.chapter_id = chapterId;` (`#L39`).
   - `public/css/admin-layout.css` — `.cy-col-chapter` (`#L10274`) and `.cy-chapter-select` (`#L10311`).
     Both are single-property width rules; rename the class, do not introduce a new one, and do not
     write any new colour/spacing (project CSS standard: reuse tokens and existing components).

   Generic loop variables (`ch`, `cy`) stay as they are — the bar is "would a future reader be
   misled", not "does the substring appear".

6. **ST-facing labels in the Cycle tab say Story, not Chapter.** The panel heading `Chapters` →
   `Stories`; `+ New Chapter` → `+ New Story`; `No chapters yet.` → `No stories yet.`; the ribbon's
   `Chapter` label → `Story`; the Game Cycles table's `Chapter` column header → `Story`; the delete
   error `Chapter is linked to cycle(s) — remove the link before deleting.` reworded; the placeholder
   `Label (e.g. Chapter Two: The Price of Power)` → `Label (e.g. Story Two: The Price of Power)`.
   Leaving the UI saying "Chapter" over a `story_cycles` collection would preserve exactly the
   confusion this story exists to remove. British English, no em-dashes in the strings themselves.
   **This is ST-admin copy only** — no player-facing surface is touched, and the *existing document
   labels* ("Chapter 1", "Chapter 2", "Chapter 3") are live ST-authored data that this story does not
   rewrite (see Open Question 3).

7. **A migration script exists, following this project's plan/apply/main shape.**
   `server/scripts/cm-2-chapters-to-story-cycles.mjs`, modelled on
   `server/scripts/migrate-office-purchases-to-seats.mjs`: **no shebang** (its own test suite imports
   it — the shebang-breaks-vitest landmine is documented at length in `CLAUDE.md` and in that script's
   own header; do not reintroduce it), connection via `../db.js`, **dry-run by default**, `--apply`
   required to write, `MONGODB_DB=tm_suite_test` honoured for testing, and auto-run guarded by the
   `import.meta.url === pathToFileURL(process.argv[1]).href` check so importing it never executes it.
   Exports `planRename(db)`, `applyRename(db, plan, {apply, log})`, `dropSource(db, {apply, log})`
   and `main(argv)`.

8. **The migration is copy-then-drop, not `renameCollection`, and the drop is a separate opt-in flag.**
   Per this project's standing order (`specs/epic-dbo-database-ownership.md#L82`,
   `specs/deferred-work.md#L300`): **copy, verify, cut over, then drop — never delete the source
   first.** Concretely:
   - `applyRename` copies every `chapters` document into `story_cycles` **preserving `_id` verbatim**
     (non-negotiable: `downtime_cycles.chapter_id` holds those `_id`s as strings, so a regenerated
     `_id` silently orphans every cycle), then `$rename`s `chapter_id` → `story_cycle_id` on every
     `downtime_cycles` document that carries the old field.
   - It **refuses and reports** rather than guessing if: `story_cycles` already contains a document
     with a differing body under the same `_id`; any `downtime_cycles` document carries *both*
     `chapter_id` and `story_cycle_id`; or any `chapter_id` value does not resolve to a document in
     `chapters`. Refusals leave every document exactly as it was.
   - Verification runs before any drop is possible: document counts match, every copied `_id` is
     present in `story_cycles`, and the per-story-cycle cycle counts are identical before and after.
   - The source `chapters` collection is **not dropped by `--apply`**. Dropping it needs a second,
     explicit `--drop-source` run, which refuses unless verification passes AND `story_cycles` is
     already populated. This is what makes the burn-in real: `chapters` sits there, untouched and
     ignored by the deployed code, as a zero-cost rollback until Angelus is satisfied.

9. **Idempotent, provably.** A second `--apply` run reports zero copies and zero field renames and
   errors on nothing. `$rename` with a `{ chapter_id: { $exists: true } }` filter is naturally
   idempotent; the copy uses an `_id`-keyed upsert-or-skip, not a blind `insertMany`. A second
   `--drop-source` run on an already-dropped collection reports "already dropped" and exits 0.

10. **Real test coverage.**
    - `server/tests/cm-2-chapters-to-story-cycles.test.js` — a live-DB integration suite against
      `tm_suite_test` (the vitest setup file forces the test DB; a skipped suite is not a passing
      suite, read the summary line), exercising the script's **exported functions**, never shelling
      out. Proves: `_id` preservation; `chapter_id` → `story_cycle_id` on cycles; the FK still
      resolves end to end after the rename; each of the three refusal conditions refuses and writes
      nothing; a second `--apply` is a no-op; `--drop-source` refuses before verification and succeeds
      after; a second `--drop-source` is a no-op.
    - `server/tests/api-chapters.test.js` is renamed (`git mv`) to `server/tests/api-story-cycles.test.js`
      and updated wholesale — its ~70 chapter references are the API contract for this router.
    - The three source-literal suites that assert on the old names **will go red and must be updated
      in the same commit**: `epic.708.1-cycle-schema-api.test.js` (reads `server/routes/chapters.js`
      from disk at `#L5` — that path stops existing), `epic.708.2-cycle-tab-shell.test.js#L49-50`,
      `issue-918-cycle-tab-management.test.js#L44,86-101`. `server/tests/helpers/test-app.js#L32,120`
      must be updated too or every suite built on the test app fails to import.
    - The three Playwright specs mocking the endpoint must be updated: `tests/cycle-tab.spec.js`
      (route mocks `#L70,78`, fixtures `#L29-30,65`, and ~20 assertions on the "Chapter" UI strings
      AC6 changes), `tests/cycle-phase-controls.spec.js#L18,60,63`,
      `tests/cycle-prep-access.spec.js#L18,68,71`. Run them **one invocation at a time** — concurrent
      Playwright runs collide on port 8080.

11. **The changed area's suites are run, not the whole tree.** New suite + `api-story-cycles` +
    `epic.708.1` + `epic.708.2` + `issue-918` + `cm5-reset-transition` (it imports the test app), then
    the three Playwright cycle specs sequentially. Do not run the full 171-suite/150-spec tree.

12. **This story does NOT run `--apply` (or `--drop-source`) against live `tm_suite`.** The script is
    written, tested against `tm_suite_test`, and left for Angelus. Confirm before handing off that no
    live write occurred.

13. **The three documents' own `label` values are relabelled by the migration.**
    *Added 2026-08-16, relayed via the coordinating session as Angelus's direct chat instruction
    ("yes you have permission to do so for hygiene"), overriding Open Question 3's "leave them"
    recommendation below (which is left in place as the record of what was originally proposed).*
    Since the collection, the route and the whole ST-facing Cycle tab move to Story vocabulary, the
    labels move with them: `"Chapter N"` → `"Story N"`, taking N from the document's own `number`
    field. **The naming was settled by `cycle-model.md` §11a** (added 2026-08-16, the same revision
    that sequenced CM-2 and CM-2b), *not* by §4 — §4 is explicitly headed "UNDER REVIEW with
    Symon ... Pending, do not treat as final" and names CM-2's own collection naming as one of the
    things awaiting that review, so it settles nothing. §4 is cited here only as the descriptive
    precedent for the `<Tier> <N>` *form* (it fixes the player-facing form as "Chapter 7" for a
    chapter, which makes "Story 2" its sibling one tier up), and live `game_sessions.chapter_label`
    already contains the hand-typed string `Story 2, Chapter 2` — that convention, written by hand.
    *(Citation corrected 2026-08-16 by the Senior Developer Review, finding P9.)*
    Constraints:
    - The rewrite happens **in the migration script's plan/apply path**, not by hand and not in the
      route, so it is previewable in the dry run and covered by the same refusal and verification
      machinery as everything else.
    - A label is rewritten **only** when it is exactly `Chapter <n>` (any spacing, any case) **and**
      `<n>` matches the document's own `number`. Anything richer — `Chapter Two: The Price of Power`
      — is ST-authored prose, left verbatim, and reported so it can be hand-edited in the Cycle tab.
      Rewriting prose would be guessing.
    - **Idempotent**: an already-`Story <n>` label is recognised as done, so a second `--apply` never
      produces `Story Story 1`.
    - Still subject to AC12: tested against `tm_suite_test` only, never `--apply`-ed live here.

## Tasks / Subtasks

- [x] **Task 1 — Server route + mount (AC: 1, 2, 3)**
  - [x] `git mv server/routes/chapters.js server/routes/story-cycles.js`.
  - [x] Rewrite collection accessor, router name, both exports, error code, all four message strings,
        and the DELETE guard's field. Keep the endpoint set, auth, status codes and validation identical.
  - [x] `server/index.js`: update the import (`#L41`) and the mount path + router name (`#L210`).
        Leave the surrounding mounts untouched. **Do not add an alias mount.**
- [x] **Task 2 — Schema field (AC: 4)**
  - [x] `server/schemas/downtime_submission.schema.js#L602`: `chapter_id` → `story_cycle_id`, comment
        updated, old declaration removed.
  - [x] Read `#L560-620` first and confirm nothing else in `downtimeCycleSchema` references the old
        name. (Verified once already this session — re-verify, the file moves.)
- [x] **Task 3 — Client (AC: 5, 6)**
  - [x] `public/js/admin/cycle-views.js` — work through the whole file, not just the cited lines;
        `cm-4a` also touched this file and line numbers may have shifted. `grep -in chapter` it and
        finish at zero remaining hits **except** any that legitimately refer to a different concept.
  - [x] `public/js/downtime/db.js#L29,39`.
  - [x] `public/css/admin-layout.css#L10274,10311` — rename the two selectors, nothing else.
  - [x] ST-facing label pass per AC6. British English, no em-dashes.
- [x] **Task 4 — Migration script (AC: 7, 8, 9, 13)**
  - [x] `server/scripts/cm-2-chapters-to-story-cycles.mjs`. Copy the header conventions (and the
        no-shebang warning) from `migrate-office-purchases-to-seats.mjs`.
  - [x] `planRename`: read both collections, build the copy list and the field-rename list, evaluate
        the three refusal conditions, return a plain report object. Reads only.
  - [x] `applyRename`: `_id`-preserving copy, then the `$rename`, then verification. Dry-run prints
        the plan and writes nothing.
  - [x] `dropSource`: separate `--drop-source` flag, refuses unless verification passes and
        `story_cycles` is populated, no-op if `chapters` is already gone.
  - [x] `main(argv)`: dry-run default, clear "Re-run with --apply to write." / "Idempotency check:
        re-run with --apply and confirm 0 copied." footers, non-zero exit on refusal.
  - [x] **AC13 relabel**: pure `planLabel(doc)` deciding `relabel` / `unchanged` / `kept`; the copy
        path writes the new label, and a document copied by an earlier run but not yet relabelled is
        finished by a separate `relabels` pass. Non-conforming ST-authored labels are reported, never
        rewritten.
- [x] **Task 5 — Tests (AC: 10, 11, 13)**
  - [x] New suite `server/tests/cm-2-chapters-to-story-cycles.test.js`. Seed `tm_suite_test` with a
        shape mirroring the real live data found below (three story cycles numbered 1-3, seven cycles
        grouped 3/3/1) so the fixtures are honest rather than invented.
  - [x] `git mv server/tests/api-chapters.test.js server/tests/api-story-cycles.test.js`, update.
  - [x] Update `helpers/test-app.js`, `epic.708.1`, `epic.708.2`, `issue-918`.
  - [x] Update the three Playwright specs. One invocation at a time.
  - [x] **AC13 coverage**: `planLabel` unit cases (relabel / already-Story / ST prose / mismatched
        number), the plan *proposing* `Story 1-3` without writing, the apply *writing* them, the
        double-`--apply` not producing `Story Story 1`, and the copied-but-not-relabelled recovery.
- [x] **Task 6 — Changed-area regression (AC: 11)**
  - [x] `cd server && npx vitest run tests/cm-2-chapters-to-story-cycles.test.js tests/api-story-cycles.test.js tests/epic.708.1-cycle-schema-api.test.js tests/epic.708.2-cycle-tab-shell.test.js tests/issue-918-cycle-tab-management.test.js tests/cm5-reset-transition.test.js`
  - [x] `npx playwright test tests/cycle-tab.spec.js`, then `tests/cycle-phase-controls.spec.js`, then
        `tests/cycle-prep-access.spec.js` — sequentially.
  - [x] Read the summary lines. A skipped DB-backed suite is not a pass.
- [x] **Task 7 — Documentation bookkeeping (AC: none — housekeeping)**
  - [x] One line in `specs/deferred-work.md` recording that `downtimeCycleSchema` lives in
        `downtime_submission.schema.js`, that this was noticed and deliberately left, and that CM-2b
        is the natural place to fix it.
  - [x] `specs/reference-data-ssot.md` — if it names the `chapters` collection or `/api/chapters`,
        update those rows. Check; do not assume either way. **Checked: zero matches for "chapter" in
        that file. Nothing to update.**
- [x] **Task 8 — Hand-off (AC: 12)**
  - [x] Confirm no `--apply` / `--drop-source` was run against live `tm_suite` in this session.
  - [x] Write the runbook order into the story's Dev Agent Record: **deploy first, then `--apply`,
        then verify the Cycle tab, then burn in, then `--drop-source`.**

## Dev Notes

### Live-data verification (2026-08-16, read-only queries against `tm_suite` — this is the current source, not the six-day-old §3 note)

`cycle-model.md` §3's investigation is dated 2026-08-10 and says **two** documents. That is now stale.
Re-queried tonight against live Atlas:

**`chapters` — 3 documents:**

| `_id` | `number` | `label` | `created_at` |
|---|---|---|---|
| `6a2a8760b3a2b71081036def` | 1 | Chapter 1 | 2026-06-11T10:01:04.071Z |
| `6a35cb3defee90c8c11fff6e` | 2 | Chapter 2 | 2026-06-19T23:05:33.831Z |
| `6a7ff93d4f02ce8035b75d59` | 3 | Chapter 3 | 2026-08-15T05:29:33.599Z |

Chapter 3 was created on **Game 7 night** (2026-08-15), during the incident §11a records. The §3
finding still holds, and is now stronger: the grouping is 3 / 3 / 1.

**`downtime_cycles` — 7 documents, every one carrying a non-null string `chapter_id`, zero nulls,
zero dangling references** (aggregated by `chapter_id` with `$type`):

| `chapter_id` | type | cycles | `game_number`s |
|---|---|---|---|
| `6a2a8760b3a2b71081036def` | string | 3 | 1, 2, 3 |
| `6a35cb3defee90c8c11fff6e` | string | 3 | 4, 5, 6 |
| `6a7ff93d4f02ce8035b75d59` | string | 1 | 7 |

Two things this settles that the dev agent should not re-derive:

1. **`chapter_id` is a plain string, not an ObjectId.** The route's DELETE guard already relies on
   this (`countDocuments({ chapter_id: idStr })`, raw `req.params.id`). The `$rename` migration
   preserves the type for free; do not "helpfully" cast it.
2. **There is nothing to repair.** No orphans, no nulls, no mixed types. This is a clean rename over
   10 documents total. The §6 reference-hygiene precondition is about `downtime_submissions.cycle_id`
   and does **not** apply here.

**Also confirmed while I was in there:** only **one** `downtime_cycles` document exists for Game 7,
so the phantom empty duplicate from §11a step 1 is already cleared. `story_cycles` does not exist as
a collection (checked the full 44-collection list) — the migration is creating it, not merging into it.

### The three-game grouping is the whole argument

Games 1-3 → "Chapter 1". Games 4-6 → "Chapter 2". Game 7 → "Chapter 3". Under §3's model a Chapter is
**one** game plus its downtime. A document grouping three games is a **Story**. The names in the
`label` field are ST-authored data and stay as they are (Open Question 3); the *collection* name is
code and changes here.

### Complete file-touch inventory (verified by grep across the whole repo, 2026-08-16)

Do not treat this as a starting point to extend by guessing. It is the enumerated set; the count in
brackets is `grep -ci chapter` on that file at the time of writing.

**Server (3 files):**
- `server/routes/chapters.js` [22] — the whole file, renamed. Self-contained: `getCollection('chapters')`
  at `#L6`, `cycles()` at `#L7`, five handlers, the `CHAPTER_IN_USE` 409 at `#L83-90`. **There is no
  separate chapter schema file** — `POST`/`PATCH` validate `{number, label}` inline, no `validate()`
  middleware. Nothing to rename in `server/schemas/` beyond AC4's one field.
- `server/index.js` [2] — `#L41` import, `#L210` mount.
- `server/schemas/downtime_submission.schema.js` [1] — `#L602`.

**Client (3 files):**
- `public/js/admin/cycle-views.js` [48] — the heavy one. Regions: `#L32` view state, `#L41-61` fetch and
  wire-up, `#L106-121` ribbon lookup and render, `#L137-250` the Chapters panel (table, delete with 409
  branch, inline create form), `#L514-528` `buildChapterPicker`, `#L531-544` `buildChapterSelect` (the
  per-row persist), `#L614-712` the Game Cycles panel (add-form picker, column header, row cell).
- `public/js/downtime/db.js` [2] — `#L29` the `chapterId` option on `createCycle`, `#L39` the body write.
- `public/css/admin-layout.css` [4] — `#L10274` `.cy-col-chapter`, `#L10311` `.cy-chapter-select`.

**Tests (8 files):**
- `server/tests/api-chapters.test.js` [70] — renamed and rewritten.
- `server/tests/helpers/test-app.js` [3] — `#L32` import, `#L120` mount. **Breaks every test-app-backed
  suite if missed**, which is most of them.
- `server/tests/epic.708.1-cycle-schema-api.test.js` [23] — `#L5` reads `../server/routes/chapters.js`
  off disk. Source-literal assertions throughout; this suite is the historical record of the router's
  original contract and needs updating line by line, not deleting.
- `server/tests/epic.708.2-cycle-tab-shell.test.js` [4] — `#L49-50` source-literal.
- `server/tests/issue-918-cycle-tab-management.test.js` [11] — `#L44` (regex on `db.js`), `#L86-101`
  (regexes on `cycle-views.js`, including `buildChapterPicker(chapters)` as a literal string).
- `tests/cycle-tab.spec.js` [45], `tests/cycle-phase-controls.spec.js` [8],
  `tests/cycle-prep-access.spec.js` [7] — route mocks plus UI-string assertions.

**Not touched, and no dev-fixtures work:** `public/js/dev-fixtures.js` contains **zero** chapter
references — the Cycle tab is not fixture-served, so the local-test-token interceptor needs no new
handler.

### The false-friend list — four unrelated "chapter" vocabularies live in this codebase

A blind find-and-replace on "chapter" corrupts all four. This is the single most likely way for this
story to go wrong, and it is why AC5's bar is "would a reader be misled", not "does the substring match".

1. **`downtime_cycles.is_chapter_finale`** (and `cycle.chapter_label`, read at
   `public/js/admin/downtime-views.js#L1948` but absent on all seven live cycle documents). A manual ST
   toggle, live: Game 3 `true`, Game 4 `false`, absent elsewhere. Read at
   `downtime-views.js#L1945-1952,2647-2658` and `public/js/tabs/downtime-form.js#L1429,3641-3660`
   (player-facing copy), styled at `public/css/components.css#L1616`. **Not this story's field.**
2. **`game_sessions.chapter_number` / `chapter_label`** — schema'd at
   `server/schemas/game_session.schema.js#L23-24`, edited at `public/js/admin/next-session.js#L40-96`,
   consumed by ADR-010's oath mechanic via `public/js/editor/edit-domain.js#L750,778-789` and
   `public/js/data/rules-helpers.js#L937-975`. **Not an FK to `chapters`.** See the collision note below.
3. **Oath `forfeiture.chapters`** — an integer rules parameter
   (`public/js/data/rules-helpers.js#L917-926`, `specs/architecture/adr-010-*.md#L349`, and the
   `oath-*` test suites). Means "a count of chapters". Correct as-is.
4. **Prose and comments** — `public/js/downtime/cycle-phase.js#L124`
   ("wipes the slate ONCE per chapter"), `docs/merits/VtR Core Merits.md#L616`. Leave alone; the
   `cycle-phase.js` comment is about the game cycle and is correct under the new vocabulary.

### The `game_sessions.chapter_number` collision (flagged, not fixed)

Live `game_sessions`, queried tonight:

| `game_number` | `chapter_number` | `chapter_label` |
|---|---|---|
| 1, 2, 3 | *(absent)* | *(absent)* |
| 4 | 2 | `Ch 2, Game 4` |
| 5 | 2 | `Story 2, Chapter 2` |
| 6 | 2 | `Game 6` |
| 7 | 3 | `Game 7` |

`chapter_number` is currently populated with the **Story-grouping** number — 2 for games 4, 5 and 6;
3 for game 7 — matching the `chapters` collection this story is renaming. But ADR-010 D3a
(`specs/architecture/adr-010-swear-by-oath-cost-model.md#L208-216`) anchors the oath blackout span on
it as a **per-Chapter ordinal**, where one Chapter is one Game. An oath suspended "for this Chapter and
the next" evaluated against the current data would span two *Stories* (roughly six games), not two
games. One of the three populated `chapter_label`s literally reads `Story 2, Chapter 2`, which is the
right vocabulary written into the wrong field.

ADR-010 already logged the sparseness of this data (`#L80`) and deferred the restoration arithmetic,
so **nothing currently computes on it and no live behaviour is wrong today.** It is a latent
data-content defect, it belongs to CM-6's `game_sessions` work rather than to a collection rename, and
it needs an Angelus ruling on what `chapter_number` should hold. Recorded here because this story's
investigation is what surfaced it and it must not be lost. See Open Question 4.

### Why copy-then-drop rather than `renameCollection`

MongoDB does support a native same-database `renameCollection`, and at three documents it would be
atomic and instant. It is still the wrong choice here, for three reasons:

1. **The project already has a standing order and it is the opposite.** *"Copy, verify, cut over, then
   drop. Never delete the source first"* — `specs/epic-dbo-database-ownership.md#L82`, repeated at
   `specs/deferred-work.md#L300`, established by DBO-5/DBO-6 for a collection move this session's own
   history already ran. Inventing a different pattern for a smaller collection is how conventions rot.
2. **`renameCollection` has no dry run.** This project's migration convention is dry-run-by-default,
   and the whole plan/apply shape exists to let Angelus read what will happen before it happens. A
   copy plan can be printed; a rename cannot.
3. **The burn-in needs a rollback that costs nothing.** After `--apply`, `chapters` still exists,
   fully intact, referenced by no deployed code. If something goes wrong during burn-in, reverting the
   merge restores the old readers and the old collection is still sitting there. `renameCollection`
   would leave the inverse rename as the only path back.

The `_id`-preservation requirement is absolute and worth restating: `downtime_cycles.chapter_id` holds
those `_id` values **as strings**. A copy that lets Mongo mint fresh `_id`s produces a `story_cycles`
collection that looks correct and is joined to nothing.

### Burn-in and the hard sequencing gate

`cycle-model.md` §11a step 5 and the `sprint-status.yaml` row both require a burn-in between this
story and CM-2b, and Dana's roundtable recommendation was specifically that the name `chapters` be
genuinely vacated and stable before the next story claims it. That is not advisory here — it is
mechanically enforced by the shape of AC8:

- After merge + deploy + `--apply`, `story_cycles` is live and `chapters` still exists as a
  zero-cost rollback. **CM-2b cannot start**: MongoDB will not hold two `chapters` collections, so
  CM-2b's own migration would refuse.
- The burn-in ends when Angelus runs `--drop-source` and `chapters` no longer appears in the
  collection list.
- **That check is CM-2b's precondition, stated as a command:** `db.getCollectionNames()` must not
  contain `chapters`. Nothing about CM-2b may be scoped ready-for-dev before it passes.

Recommended burn-in length: **one full cycle of ST use of the Cycle tab** — realistically until the
Game 8 downtime opens (Game 8 is 2026-09-19). There is no deadline pressure; §11a's whole framing is
five weeks of runway.

### Runbook order (for Angelus, when the time comes)

1. Merge and let Netlify + Render deploy. The Cycle tab will error for the few minutes they are out of
   step; this is AC3's accepted window.
2. `cd server && node scripts/cm-2-chapters-to-story-cycles.mjs` — dry run, read the plan.
3. `node scripts/cm-2-chapters-to-story-cycles.mjs --apply`.
4. Re-run bare and confirm `0 copied, 0 renamed`.
5. Open the admin Cycle tab. Three Stories listed, seven cycles each showing the right Story in the
   dropdown, the ribbon showing the current Story.
6. Burn in.
7. `node scripts/cm-2-chapters-to-story-cycles.mjs --drop-source --apply`, then confirm `chapters` is
   gone. CM-2b is unblocked.

There is a small window between step 1 and step 3 in which the deployed DELETE guard queries
`story_cycle_id` while live cycles still carry `chapter_id`, so it would count zero and permit
deleting a story cycle that is in fact in use. Three documents, one ST, and the fix is re-selecting
the Story in a dropdown — the same trivial-stakes reasoning `migrate-office-purchases-to-seats.mjs`
records in its own header for the same class of window. Do steps 1 and 3 back to back and it does not
arise.

### Recovery runbook: the `both-fields` refusal (added by the Senior Developer Review, finding P3)

That same window has a second, sharper failure mode, and it needs a documented exit rather than an
undocumented full stop. In it, `story_cycles` does not exist yet, so `GET /api/story_cycles` returns
`[]` — the Cycle tab therefore looks merely *empty* rather than erroring, which is exactly what
invites an ST to touch the Story dropdown. One touch writes `story_cycle_id` onto a cycle that still
carries `chapter_id`, and the migration then refuses `both-fields` for the **whole run**, not just
that row.

`--prefer-new` is the way out. It keeps `story_cycle_id` (the value the live, deployed system wrote
most recently) and `$unset`s the stale `chapter_id`. It never writes to `story_cycle_id`; the only
write is the removal of the old field.

1. `cd server && node scripts/cm-2-chapters-to-story-cycles.mjs --prefer-new` — **dry run**. Read
   every `would keep ... and clear stale ...` line. Read every `WARNING ... comes out UNGROUPED`
   line and write down which game cycles they name.
2. `node scripts/cm-2-chapters-to-story-cycles.mjs --prefer-new --apply`.
3. Re-run **bare** (no `--prefer-new`) and confirm `0 copied, 0 relabelled, 0 field rename(s)` and no
   refusals. That is the proof the recovery finished cleanly.
4. In the Cycle tab, re-select the Story on any cycle step 1 warned about.

**Why a `WARNING` can appear at all.** In this window the Story dropdown has nothing in it but
`— none —`, so the value the ST can realistically have written is `null`. `--prefer-new` still
honours it — the ST's action was deliberate, and the alternative is the script second-guessing a live
write — but the cycle comes out **ungrouped**, which is why step 4 exists. It is one dropdown
selection per affected cycle.

**The other refusals have no `--prefer-new` equivalent, deliberately.** `target-differs` and
`dangling-ref` mean the database is not the one the plan describes; there is no safe automatic
reading of either. Decide those by hand and re-run.

## Project Structure Notes

- **Renamed (`git mv`)**: `server/routes/chapters.js` → `server/routes/story-cycles.js`;
  `server/tests/api-chapters.test.js` → `server/tests/api-story-cycles.test.js`.
- **New**: `server/scripts/cm-2-chapters-to-story-cycles.mjs`,
  `server/tests/cm-2-chapters-to-story-cycles.test.js`.
- **Modified**: `server/index.js`, `server/schemas/downtime_submission.schema.js`,
  `public/js/admin/cycle-views.js`, `public/js/downtime/db.js`, `public/css/admin-layout.css`,
  `server/tests/helpers/test-app.js`, `server/tests/epic.708.1-cycle-schema-api.test.js`,
  `server/tests/epic.708.2-cycle-tab-shell.test.js`,
  `server/tests/issue-918-cycle-tab-management.test.js`, `tests/cycle-tab.spec.js`,
  `tests/cycle-phase-controls.spec.js`, `tests/cycle-prep-access.spec.js`,
  `specs/deferred-work.md` (one line), `specs/stories/sprint-status.yaml` (this story's row).
- **Untouched by design**: `public/js/admin/downtime-views.js` and `public/js/tabs/downtime-form.js`
  (`is_chapter_finale`), `public/js/admin/next-session.js` and `server/schemas/game_session.schema.js`
  (`chapter_number`), `public/js/data/rules-helpers.js` and `public/js/editor/edit-domain.js` (oath
  chapter arithmetic), `public/js/downtime/cycle-phase.js`, `public/js/dev-fixtures.js` (no chapter
  references at all), and every file in TM Wiki / TM Cockpit / TM Herald.
- No new dependency, no new collection beyond `story_cycles`, no index work (the `chapters` collection
  carries none beyond `_id`).

## Open questions for Angelus (flag before dev starts)

1. **Should `server/routes/chapters.js` itself be renamed?** AC1 says yes, to
   `server/routes/story-cycles.js`. **Recommended as specified.** The dominant convention in
   `server/routes/` is one kebab-case file named for its resource (`game-sessions.js` → `/api/game_sessions`,
   `office-merit-dots.js` → `/api/office_merit_dots`, `office-seats.js` → `/api/office_seats`). The one
   counter-example, `downtime.js`, is a *multi-router* file named for its domain — not applicable here,
   since this file exports exactly one router. Leaving a file called `chapters.js` that serves
   `/api/story_cycles` would also be a live trap for CM-2b, which will want that filename.
2. **Deprecated `/api/chapters` alias during the deploy window?** AC3 says no, and explains why: an
   alias would still be mounted when CM-2b claims that path, and Express first-match-wins would
   silently route CM-2b's traffic to the wrong router. **Recommended: no alias**, accept a few
   minutes of a visible, recoverable, ST-only tab error. Say if you would rather have the alias, in
   which case its removal becomes a hard AC on CM-2b rather than a note.
3. **RULED 2026-08-16: YES, they change — see AC13, which supersedes the recommendation in this
   paragraph.** The original question and its "leave them" recommendation are kept verbatim below so
   the record shows what was proposed and what was decided instead.
   **Do the three documents' `label` values change?** They currently read "Chapter 1", "Chapter 2",
   "Chapter 3" — ST-authored display data, shown in the Cycle tab dropdown. AC6 renames the UI
   *chrome* to say Story but leaves the labels alone. **Recommended: leave them**, and relabel by hand
   in the admin UI whenever you feel like it — it is a two-field edit per row and does not belong in a
   migration script that would then be guessing at your naming. Say the word and it becomes a fourth
   step in `applyRename`.
4. **`game_sessions.chapter_number` currently holds the Story number, not the game ordinal.** See the
   collision section above. Nothing computes on it today, so nothing is broken right now, but ADR-010's
   deferred oath-restoration arithmetic assumes it is a per-game ordinal. **Recommended: rule on it
   when CM-6 is scoped**, not here — but it needs a ruling before ADR-010 D3b is ever built, and this
   story is deliberately not touching it in the meantime.
5. **`downtime_cycles.is_chapter_finale` keeps its name through this story.** Under the new vocabulary
   it means "final chapter of this Story". `cycle-model.md` §3 says CM-3 replaces the manual toggle with
   derived state entirely. **Recommended: leave it and let CM-3 dissolve it.** Renaming it now costs a
   second migration plus player-facing copy changes for a field that is scheduled to disappear. Worth
   noting that after CM-2b it will sit on a collection *called* `chapters` while meaning "final
   chapter of the Story" — confusing, but confusing in a way CM-3 removes.

## References

- [Source: D:\Terra Mortis\cycle-model.md §3] — "The existing `chapters` collection is mislabelled — it
  already holds Stories"; the ≈3-not-exactly-3 ruling; the CM-3 maintenance deferral.
- [Source: D:\Terra Mortis\cycle-model.md §11a] — Rev 3 naming ruling (`downtime_cycles` → `chapters`
  once CM-2 vacates the name), the revised sequencing table (step 3 = this story, step 5 = CM-2b), and
  the Game 7 incident record.
- [Source: specs/stories/sprint-status.yaml — `epic-cm` → `cm-2-chapters-to-story-cycles-rename`] —
  "Precondition for the downtime_cycles->chapters rename below (frees the name). Ship + a short burn-in
  before touching the next rename."
- [Source: server/routes/chapters.js#L1-97] — the complete router: `getCollection('chapters')` (#L6),
  the cycles handle (#L7), five handlers, inline `{number, label}` validation with no schema file, the
  `CHAPTER_IN_USE` 409 guard querying `chapter_id` (#L83-90).
- [Source: server/index.js#L41,210] — import and `app.use('/api/chapters', requireAuth, noCache(), chaptersRouter)`.
- [Source: server/schemas/downtime_submission.schema.js#L572,602] — `downtimeCycleSchema` (misplaced in
  a submissions-named file, see "What this story is NOT") and
  `chapter_id: { type: ['string','null'] }  // ref to chapters collection _id as string`.
- [Source: public/js/admin/cycle-views.js#L32,41-61,106-121,137-250,514-544,614-712] — view state, fetch,
  ribbon, Chapters panel, both pickers, Game Cycles panel.
- [Source: public/js/downtime/db.js#L29,39] — `createCycle`'s `chapterId` option and `body.chapter_id`.
- [Source: public/css/admin-layout.css#L10274,10311] — `.cy-col-chapter`, `.cy-chapter-select`.
- [Source: server/tests/helpers/test-app.js#L32,120] — test-app import and mount; breaks broadly if missed.
- [Source: server/tests/epic.708.1-cycle-schema-api.test.js#L5,21-25,50-89] — reads the route file off
  disk by path; source-literal assertions on router name, mount and schema field.
- [Source: server/tests/issue-918-cycle-tab-management.test.js#L44,86-101] — regexes over `db.js` and
  `cycle-views.js`, including `buildChapterPicker(chapters)` as a literal.
- [Source: tests/cycle-tab.spec.js#L29-30,65,70,78,134-236] — fixtures, route mocks, and the UI-string
  assertions AC6 changes.
- [Source: server/scripts/migrate-office-purchases-to-seats.mjs#L1-60, tail] — the plan/apply/main shape,
  the no-shebang warning, dry-run default, the `import.meta.url` auto-run guard, and the
  deploy-then-migrate-immediately runbook note this story reuses.
- [Source: specs/epic-dbo-database-ownership.md#L82] and [Source: specs/deferred-work.md#L300] —
  "copy, verify, cut over, then drop. Never delete the source first."
- [Source: specs/stories/cm-4a-phase-transition-server-enforcement.md] — the immediately preceding CM
  story (branch `ms/cm-4a-phase-transition-server-enforcement`, not yet on `main` at time of writing);
  its "What this story is NOT" already names this rename as separate and deliberately later.
- [Source: specs/stories/xpl-2-historic-reconciliation.md] and
  [Source: specs/stories/dbo-1-purchasable-powers-schema-vs-data.md] — the migration-story conventions
  this file follows (confirmed-only, refuse-rather-than-guess, no live `--apply` by an agent).
- [Source: specs/architecture/adr-010-swear-by-oath-cost-model.md#L80,208-226] — ADR-010 D3a anchoring
  the oath span on `game_sessions.chapter_number`, and its own note on that field's sparse population.
- [Source: 2026-08-16 live read-only queries against `tm_suite`, this story's own investigation] —
  3 `chapters` documents (numbers 1-3, Chapter 3 created 2026-08-15), 7 `downtime_cycles` all carrying
  a non-null **string** `chapter_id` grouped 3/3/1, one Game 7 cycle (phantom duplicate already cleared),
  no `story_cycles` collection, `is_chapter_finale` true on Game 3 / false on Game 4, and the
  `game_sessions.chapter_number` values above. Not re-derivable from any existing doc; this story file
  is now the record.

## Dev Agent Record

**Agent:** Amelia (bmad-agent-dev). **Branch:** `ms/cm-2-chapters-to-story-cycles-rename`, cut from
`main` at `fa80e4a7`. **Date:** 2026-08-16. **Not committed, not pushed, not merged** — the working
tree is left uncommitted for Angelus's own commit step.

### Implementation Plan (as executed)

Straight down the Tasks list, red-green per task, changed-area suites only after each.

1. **Task 1 (route + mount).** Red first: pointed `epic.708.1-cycle-schema-api.test.js` at
   `../server/routes/story-cycles.js` and rewrote its assertions to the new router name, error code,
   collection and mount, plus two new ones (the DELETE guard counting on `story_cycle_id`; no
   `/api/chapters` alias left in `index.js`). Confirmed red — the suite failed to load, the route
   file did not exist. Then `git mv` (git records `R`, history follows) and rewrote the file.
2. **Task 2 (schema).** Read `#L560-620` of `downtime_submission.schema.js` in full first and
   confirmed `chapter_id` at `#L602` was the only reference in `downtimeCycleSchema`. Replaced the
   declaration outright rather than adding alongside.
3. **Task 3 (client).** `cycle-views.js` worked through whole-file, not line-by-citation. Red first
   via `epic.708.2` and `issue-918`.
4. **Task 4 (migration script).** Written to the `migrate-office-purchases-to-seats.mjs` shape.
5. **Task 5 (tests).** New live-DB suite, `git mv` of the API contract suite, then the three
   Playwright specs.
6. **Task 6 (regression).** Vitest gate, then the three Playwright specs one invocation at a time.
7. **Tasks 7-8.** Docs and hand-off.

### Debug Log

- **Self-matching source-literal assertion (the known false-pass trap, in reverse).** The new
  `expect(INDEX).not.toContain("'/api/chapters'")` in `epic.708.1` went red against a correct
  implementation, because the explanatory comment I had just written above the mount in
  `server/index.js` contained the literal string `'/api/chapters'`. Fixed by rewording the comment,
  not by weakening the assertion. Same class of hazard as the recorded source-contract regex
  false-pass, and worth remembering that it cuts both ways: a comment can fake a pass *or* a fail.
- **Relabel filter keyed on a stringified `_id`.** `plan.relabels` carried `_id` as a display string
  while the documents are keyed by `ObjectId`, so the `updateOne` filter matched nothing and the
  "copied by an earlier run, not yet relabelled" test failed with `0` relabelled. Fixed by carrying
  the real key alongside the display string (`idValue`). The copy path was never affected — it
  writes `row.doc._id`, the genuine `ObjectId`, which is exactly the `_id`-preservation requirement.
- **Line endings.** The bulk renames were done with a Python script that reads with universal
  newlines and writes with `newline=''`, which silently converted several files from CRLF to LF.
  `core.autocrlf=true` means git normalises to LF on commit either way, so the *diffs were never
  wrong* — confirmed by `git diff --stat` before and after. Normalised the working copies back to
  CRLF anyway so the checkout stays uniform, and checked for NUL bytes at the same time (none).

### Pre-existing test failures confirmed at base (NOT caused by this story)

Each reproduced by restoring the base `public/js/admin/cycle-views.js` **and** the base spec from
`HEAD` into the working checkout, running, then restoring my versions (`diff`-verified identical
afterwards). A detached worktree was tried first and abandoned — it has no `node_modules`.

| Spec | Failures | Same at base? |
|---|---|---|
| `tests/cycle-tab.spec.js` | 1 (`shows human-readable phase labels`, asserting the text `legacy`) | yes, identical |
| `tests/cycle-phase-controls.spec.js` | 11 of 11 (the entire file) | yes, identical count |
| `tests/cycle-prep-access.spec.js` | 1 (`Prep Access button is gold-highlighted when open`) | yes, identical |

All three are the same source-drift family `CLAUDE.md` already documents for `epic.708.3`: CM-1
(#1028) replaced the phase cell's three fixed buttons with four toggleable ones and removed the
"legacy" phase text, and these Playwright specs were never re-baselined. Logged in
`specs/deferred-work.md` with a recommendation to add them to `CLAUDE.md`'s known-failures list.

### Test results

**Vitest (changed-area gate, `cd server`):** 6 files, **120 passed, 0 failed, 0 skipped**.
`cm-2-chapters-to-story-cycles` (28) · `api-story-cycles` (22) · `epic.708.1-cycle-schema-api` (24) ·
`epic.708.2-cycle-tab-shell` (15) · `issue-918-cycle-tab-management` (21) · `cm5-reset-transition`
(10). The DB-backed suites genuinely ran (no skips) — the summary line was read, not just the exit
code. Baseline before any change: `api-chapters` 22/22.

> **Correction, 2026-08-16, Senior Developer Review finding P7.** This paragraph originally claimed
> "a local `mongod` was reachable". That is false in mechanism, and the difference is material for a
> suite that calls `.drop()` on a collection named `chapters`. There is no local `mongod`:
> `server/config.js` resolves `MONGODB_URI` from `.env`, which points at **Atlas** — the same
> cluster that hosts live `tm_suite`. The suites ran against the **`tm_suite_test` database on that
> cluster**, separated from live data by database-name guards only
> (`tests/helpers/setup-env.js` forcing `MONGODB_DB=tm_suite_test`, `assertTestDbSafety` in
> `server/db.js` refusing any non-`_test` name under vitest, and `setupDb`'s belt-and-braces
> re-check of the resolved `databaseName`), **not** by a physically separate server. Those guards
> held and no live collection was touched — independently re-confirmed by a read-only query against
> live `tm_suite` — but the protection is a name check, not an air gap.

**Playwright (sequential, never concurrent):** `cycle-tab.spec.js` 17 passed / 1 failed ·
`cycle-phase-controls.spec.js` 0 passed / 11 failed (the whole file, 11 of 11) · `cycle-prep-access.spec.js` 11 passed /
1 failed. Every failure is in the pre-existing table above.

### Migration script: what was exercised, and where

**Against `tm_suite_test` ONLY. No `--apply`, no `--drop-source`, and no write of any kind against
live `tm_suite` at any point in this session (AC12 satisfied).** The test suite passes a `db` handle
in as an argument rather than resolving one internally, so it cannot reach live data even by
mistake; the CLI runs below were all made with an explicit `MONGODB_DB=tm_suite_test`.

CLI paths exercised end to end, in this order, on a `tm_suite_test` seed mirroring live (3
documents, 7 cycles grouped 3/3/1):

| Invocation | Result |
|---|---|
| bare (dry run) | `3 to copy, 0 to relabel, 7 field rename(s)`; `Totals: 0 copied…`; nothing written |
| `--apply` | `3 copied` (each `relabelled 'Chapter N' -> 'Story N'`), `7` field renames, `verified` |
| `--apply` again | `0 copied, 0 relabelled, 0 field rename(s)`, `verified` — idempotent |
| `--drop-source` | `[DRY RUN] verification passes; would drop chapters` — nothing dropped |
| `--drop-source --apply` | `dropped: chapters` |
| `--drop-source --apply` again | `already dropped … Nothing to do`, exit 0 |

The seeded scratch data was removed from `tm_suite_test` afterwards, and the temporary seed script
was deleted (it never entered a commit).

### Runbook for Angelus (AC12 hand-off) — deploy FIRST, then migrate

1. **Merge and let Netlify + Render deploy.** The Cycle tab errors for the few minutes the two are
   out of step (AC3's accepted window). Do not run the script before this.
2. `cd server && node scripts/cm-2-chapters-to-story-cycles.mjs` — dry run. Read the plan. Expect
   `3 to copy`, three `would … relabel 'Chapter N' -> 'Story N'` lines, and `7` field renames.
3. `node scripts/cm-2-chapters-to-story-cycles.mjs --apply`. Do this back to back with step 1: in
   between, the deployed DELETE guard queries `story_cycle_id` while live cycles still carry
   `chapter_id`, so it would count zero and permit deleting a story cycle that is in use.
4. Re-run bare and confirm `0 copied, 0 relabelled, 0 field rename(s)`.
5. Open the admin Cycle tab. Three Stories listed (labelled `Story 1` / `Story 2` / `Story 3`), seven
   cycles each showing the right Story in the dropdown, the ribbon showing the current Story.
6. **Burn in** — one full cycle of ST use, realistically until the Game 8 downtime opens
   (2026-09-19). `chapters` sits untouched and unread the whole time as a zero-cost rollback.
7. `node scripts/cm-2-chapters-to-story-cycles.mjs --drop-source --apply`, then confirm `chapters` is
   absent from `db.getCollectionNames()`. **That check is CM-2b's precondition.**

### Completion Notes

- **All 13 ACs satisfied**, including AC13 (the label rewrite added mid-implementation, relayed via
  the coordinating session as Angelus's direct chat instruction, overriding Open Question 3).
- **AC13's shape, and why it is narrow.** Only an exact `Chapter <n>` whose `<n>` matches the
  document's own `number` is rewritten, to `Story <n>`. The form follows `cycle-model.md` §4 (which
  fixes "Chapter 7" as the player-facing form for a chapter, making "Story 2" its sibling one tier
  up) and live `game_sessions.chapter_label`, which already contains the hand-typed `Story 2,
  Chapter 2`. Richer ST-authored labels are **reported and left verbatim** rather than rewritten:
  guessing at prose is exactly the class of thing this project's migration convention refuses to do.
  All three live documents are the plain form, so live will relabel cleanly.
- **The four false-friend vocabularies were left alone**, verified by a final repo-wide grep:
  `downtime_cycles.is_chapter_finale` (CM-3 dissolves it), `game_sessions.chapter_number` /
  `chapter_label` (CM-6), oath `forfeiture.chapters` (a rules integer, correct as-is), and the
  `cycle-phase.js` "once per chapter" comment (correct under the new vocabulary). The only remaining
  matches for "chapter" in touched code are deliberate explanatory comments naming the old name.
- **`git mv` used for both renames**, and `git status` reports `R` for each, so history follows the
  files rather than reading as delete-plus-create.
- **No alias mount** (AC2/AC3), and `epic.708.1` now asserts its absence, so a future story cannot
  reintroduce one without a red test.
- **`--drop-source` is a separate flag from `--apply`** (AC8), which is what makes the burn-in gate
  mechanical rather than advisory: MongoDB will not hold two `chapters` collections, so CM-2b cannot
  start until the drop has actually happened.
- **`specs/reference-data-ssot.md` needed no change** — checked, zero matches for "chapter".
- **Not done, deliberately:** no commit, no push, no PR, no live migration run.

### For a reviewer to look at closely

1. **`applyRename`'s refusal semantics are all-or-nothing.** A single refusal aborts the entire run
   before any write, rather than skipping that row. That is deliberate (a refusal means the plan no
   longer describes the database), but it differs from `migrate-office-purchases-to-seats.mjs`,
   which refuses per row. Worth a second opinion on which is right for this shape.
2. **`verifyRename`'s `expectedCounts` counts across BOTH field names.** That is what makes
   verification stable on a re-run, when there are no `chapter_id`s left to count. Check the
   reasoning holds for the partial-failure case too.
3. **The relabel recovery branch** (`plan.relabels`) accepts a target document whose body matches
   the source and whose label is still the *source's original* label. Any other label mismatch is a
   refusal. Confirm that is the right line to draw.
4. **DOM id renames** `new-ch-*` → `new-sc-*` and `new-cy-chapter` → `new-cy-story-cycle`. Only the
   Cycle tab and `tests/cycle-tab.spec.js` reference them (grep-confirmed), but they are strings, so
   a missed consumer would fail silently at runtime rather than at parse time.
5. **CSS class renames** `.cy-col-chapter` → `.cy-col-story-cycle` and `.cy-chapter-select` →
   `.cy-story-cycle-select`. Same silent-failure shape. Both are single-property width rules; no new
   colour, spacing or component was introduced.

## File List

**Renamed (`git mv`, history preserved — `git status` reports `R`):**

- `server/routes/chapters.js` → `server/routes/story-cycles.js`
- `server/tests/api-chapters.test.js` → `server/tests/api-story-cycles.test.js`

**New:**

- `server/scripts/cm-2-chapters-to-story-cycles.mjs`
- `server/tests/cm-2-chapters-to-story-cycles.test.js`

**Modified:**

- `server/index.js`
- `server/schemas/downtime_submission.schema.js`
- `public/js/admin/cycle-views.js`
- `public/js/downtime/db.js`
- `public/css/admin-layout.css`
- `server/tests/helpers/test-app.js`
- `server/tests/epic.708.1-cycle-schema-api.test.js`
- `server/tests/epic.708.2-cycle-tab-shell.test.js`
- `server/tests/issue-918-cycle-tab-management.test.js`
- `tests/cycle-tab.spec.js`
- `tests/cycle-phase-controls.spec.js`
- `tests/cycle-prep-access.spec.js`
- `specs/deferred-work.md`
- `specs/stories/sprint-status.yaml`
- `specs/stories/cm-2-chapters-to-story-cycles-rename.md` (this file)

**Checked and deliberately unchanged:** `specs/reference-data-ssot.md` (no matches),
`public/js/dev-fixtures.js` (no matches), `public/js/admin/downtime-views.js`,
`public/js/tabs/downtime-form.js`, `public/js/admin/next-session.js`,
`server/schemas/game_session.schema.js`, `public/js/data/rules-helpers.js`,
`public/js/editor/edit-domain.js`, `public/js/downtime/cycle-phase.js`, and every file in
TM Wiki / TM Cockpit / TM Herald.

## Change Log

| Date | Change |
|---|---|
| 2026-08-16 | Story created, `ready-for-dev`. |
| 2026-08-16 | Status → `in-progress`; `sprint-status.yaml` row updated to match. |
| 2026-08-16 | **AC13 added** and Open Question 3 marked RULED: Angelus, via the coordinating session, overrode the "leave the labels alone" recommendation, so the migration now relabels `Chapter N` → `Story N`. Tasks 4 and 5 gained the corresponding subtasks. |
| 2026-08-16 | Tasks 1-8 implemented and all subtasks ticked. Dev Agent Record, File List and Change Log added. |
| 2026-08-16 | Status → `review`; `sprint-status.yaml` row updated to match. Not committed, not pushed, not merged; no live `--apply`. |
| 2026-08-16 | **Senior Developer Review (internal 3-layer; Codex unavailable until 2026-08-20).** 13 blocking patches landed with tests, each behavioural one proved by a single-change revert: P1 source-shape guard (the cm-2b re-run catastrophe), P2 `--drop-source` gated on ID existence not content, P3 `--prefer-new` both-fields recovery, P4 the 404-reported-as-in-use client bug, P5 scoped `$rename`, P6 label coercion, P7-P10 documentation corrections, P11 the AC6 em-dash, P12 `main()` coverage, P13 two non-discriminating E2E assertions. 4 findings deferred to `specs/deferred-work.md`, 3 dismissed on evidence. Regression: vitest 144/144 (was 120), Playwright unchanged against the confirmed pre-existing 13. |
| 2026-08-16 | Status → `done`; `sprint-status.yaml` row updated to match. Still not committed, not pushed, not merged; still no live `--apply`. |

## Senior Developer Review

**Date:** 2026-08-16. **Outcome: APPROVED with changes — all thirteen blocking patches landed and
green; status advanced `review` → `done`.**

### Provenance — this was an INTERNAL review, not an external one

Codex/external review is **unavailable until 2026-08-20**, so this story was reviewed by the
project's internal 3-layer adversarial protocol rather than the standard LOCAL/EXTERNAL split. Record
that when weighing the result: no independent model outside this session looked at the diff.

| Layer | Scope |
|---|---|
| **Blind Hunter** | Diff only. No story file, no ACs, no prior context. |
| **Edge Case Hunter** | Diff + the full repo + a sibling-repo sweep (TM Wiki, TM Cockpit, TM Herald). |
| **Acceptance Auditor** | Story spec + two-pass verification. **Actually ran** the migration script against `tm_suite_test` six times (dry run, `--apply`, second `--apply`, `--drop-source` dry, `--drop-source --apply`, again) and **independently re-queried live `tm_suite` read-only** to confirm nothing there was touched. |

Three findings were reported by more than one layer independently — P3's both-fields deploy window by
all three, which is the strongest signal in the set.

### Patched — thirteen findings, each with a test

Every patch below has a real test. Where the fix has a corresponding behaviour, discrimination was
proved by a **single-change revert**: the fix was undone in exactly one place, the new tests were
confirmed red, and the fix was restored. Documentation-only fixes have no such probe, by nature.

**P1 — [HIGH] No guard on the shape of what actually lives in `chapters`.**
`SOURCE_COLLECTION` is hardcoded, and cm-2b renames `downtime_cycles` → `chapters`. Re-running this
script after cm-2b ships (someone repeating the documented ritual from memory) would copy every real
downtime cycle into `story_cycles` as though it were a Story-grouping — and nothing in the plan
output would flag it, because a document like `{ label: 'Downtime 5', number: undefined }` trips none
of the existing refusals — after which `--drop-source --apply` would **delete the entire live
`downtime_cycles` collection**.
*Fix:* new exported `DOWNTIME_CYCLE_MARKERS` + `sourceShapeRefusals(docs)`. A source document
carrying `phase`, `game_number` or `game_phase` is a downtime cycle, not a Story-grouping. Evaluated
by **both** `planRename` (which returns early with `wrongSourceShape: true` and plans nothing over a
collection it does not understand) **and** `dropSource`, so neither entry point can be reached around
it. The message is deliberately unlike the other refusals: it names cm-2b explicitly and says the
migration has already run.
*Discrimination:* `DOWNTIME_CYCLE_MARKERS = []` → **4 of 5 new tests red**. The fifth is the negative
control (must stay green on the real Story shape) and did. A sixth test ("leaves live downtime cycles
untouched") stayed green via the dangling-ref refusal — which is exactly why the dedicated
catastrophe test seeds `cycles: []`, the real post-cm-2b state where no cycle documents exist to trip
that other check.

**P2 — [HIGH] `--drop-source` gated on document CONTENT.**
It re-derived a full plan and refused on `target-differs`. But `--drop-source` runs at the far end of
a deliberately long burn-in during which `story_cycles` is the live, actively-edited copy, so content
drift is *expected and correct*. Worse, the script's own printed advice ("edit it by hand in the
Cycle tab if you want it to say Story") produced a state that then permanently blocked the drop, with
no override, and therefore permanently blocked cm-2b.
*Fix:* `dropSource` no longer calls `planRename` or `verifyRename`. Its gate is three **structural**
checks: the P1 shape guard; **every source `_id` exists in `story_cycles`**; and no `downtime_cycles`
document still carries `chapter_id`. The stricter content-equality refusals (`target-differs`,
`both-fields`, `dangling-ref`) are untouched for `applyRename`, where they protect an actual copy.
*Discrimination:* old content gate reinstated in `dropSource` → **3 of 3 new tests red**
(drop-after-label-rename, drop-after-whole-body-drift, and the genuine data-loss case, whose refusal
message no longer named the lost `_id`).

**P3 — [MEDIUM] The both-fields deploy window had no documented recovery.**
The post-deploy/pre-migration window produces a both-fields state the instant an ST touches a Story
dropdown, and that refusal is all-or-nothing for the whole migration. Reported independently by all
three layers. Compounded by `/api/story_cycles` returning `[]` in that window (missing collection,
not an error), so the Cycle tab looks merely empty rather than broken — which invites the exact
interaction that poisons the migration.
*Fix:* **option (a) implemented, not the (b) fallback.** New `--prefer-new` recovery mode:
`planRename(db, { preferNew })` turns a both-fields refusal into a resolution that keeps
`story_cycle_id` and `$unset`s the stale `chapter_id`. Opt-in, previewable line by line in the dry
run, and it **never writes to `story_cycle_id`** — the only write is removal of the old field, so
"the new value is authoritative" is true by construction rather than by trust. The recovery runbook
is also in the script header and in Dev Notes, so (b) is satisfied as well.
*Discrimination:* `preferNew` forced to `false` inside `planRename` → **5 of 5 new tests red**.

**P4 — [MEDIUM] A real, live-data-adjacent client bug: the delete-error heuristic false-positived on
a plain 404.** `public/js/admin/cycle-views.js`'s story-delete handler matched
`err.message.includes('cycle')`. That was safe before the rename ("Chapter not found" / "Invalid
chapter ID format" contain no "cycle"); after it, "Story cycle not found" and "Invalid story cycle ID
format" both match. Concretely: two STs, one deletes a Story, the other clicks delete on the now-gone
row → 404 → the UI says *"Story is linked to cycle(s)"*, the exact opposite of the truth.
*Fix:* narrowed to `err.message.includes('linked to')`, which appears only in the 409
`STORY_CYCLE_IN_USE` message and in neither the 404 nor the 400.
*Discrimination:* reverted to `includes('cycle')` → **both new Playwright tests red** (404 and 400
each wrongly reported as in-use).

**P5 — [LOW] The `$rename` was not scoped to the planned document set.**
`applyRename` issued a blanket `updateMany({ chapter_id: { $exists: true } }, { $rename: ... })`. A
document acquiring `chapter_id` between plan and apply would be renamed without ever passing the
dangling-ref or both-fields checks — and `$rename` **overwrites** its destination, so such a document
could have its `story_cycle_id` silently clobbered.
*Fix:* `fieldRenames` rows now carry `idValue` (the real key) alongside the display string, and the
filter is `{ _id: { $in: ... }, chapter_id: { $exists: true } }`. The `$exists` clause is retained,
so idempotency is unchanged, and a leftover is now reported loudly by `verifyRename` instead of being
swept up.
*Discrimination:* filter reverted to unscoped → **red**: 8 documents renamed instead of the 7
planned, and the interloper's `story_cycle_id` clobbered.

**P6 — [LOW] Non-string/missing-label coercion.**
`planLabel` coerced a missing or non-string `label` to `''`, which fabricated `label: ''` on the copy
of a document that never had the field, and destroyed a non-string one.
*Fix:* the `''` fallback is now scoped to its only legitimate purpose (giving the regexes a string to
match). A `kept` result returns `doc.label` **verbatim**, and `planRename` does not rewrite the
`label` key at all for a `kept` document.
*Discrimination:* two probes, one per half of the fix — `planLabel` reverted → **1 red**;
`planRename`'s `targetDoc` reverted → **2 red**.

**P7 — [LOW, docs] The "local `mongod`" claim was false in mechanism.**
The Dev Agent Record claimed the DB-backed suites ran against a local `mongod`. That matters for a
suite that calls `.drop()` on a collection named `chapters`.
*Fix:* corrected in place in the Test results section. Verified while patching: `server/config.js`
resolves `.env` from the **repo root**, and both `.env` files hold a `mongodb+srv` (Atlas) URI. The
suites ran against the `tm_suite_test` **database on the live Atlas cluster**, separated from
`tm_suite` by name guards only (`setup-env.js`, `assertTestDbSafety`, `setupDb`'s re-check), not by a
separate server. The guards held; the protection is a name check, not an air gap.

**P8 — [LOW, docs] The dotenv-path comment was wrong.**
The header claimed running from `server/` makes cwd-relative `dotenv/config` pick up `server/.env`.
It loads the repo-ROOT `.env` (`injecting env (4) from ..\.env`). Both hold live Atlas URIs so
nothing is unsafe, but an override placed in `server/.env` would silently not apply.
*Fix:* header corrected to describe what actually happens.

**P9 — [LOW, docs] An overstated citation.**
The script header and AC13 cited `cycle-model.md` **§4** as settled precedent for the "Story N" label
form. §4 is explicitly headed *"UNDER REVIEW with Symon ... Pending, do not treat as final"* and
names cm-2's own collection naming as one of the things awaiting that review. The naming **was**
settled — by **§11a** (added 2026-08-16, the same revision), not §4.
*Fix:* both citations corrected. §4 is now cited only as the descriptive precedent for the
`<Tier> <N>` *form*, with §11a named as the ruling.

**P10 — [LOW, docs] A wrong self-referential comment.**
`server/tests/api-story-cycles.test.js`'s header said "renamed from `/api/story_cycles`" — the new
path, not the old one it was renamed FROM. *Fix:* now reads "renamed from `/api/chapters`".

**P11 — [LOW] The one AC6-enumerated em-dash.**
The delete-in-use error string **that AC6 explicitly lists for rewording** still contained an
em-dash, breaching both the project convention and AC6's own stated rule.
*Fix:* `'Story is linked to cycle(s) — remove the link before deleting.'` →
`'Story is linked to cycle(s). Remove the link before deleting.'` **Scope held deliberately:** the
other em-dashes in the same file (`'— none —'`, `'— not linked —'`, the ribbon's
`${number} — ${label}`) are pre-existing, are not enumerated by AC6, and were left alone rather than
turning this into a file-wide sweep. Covered by the existing 409 spec, which still asserts on the
reworded string.

**P12 — [LOW] `main()` had zero coverage.**
The function where `--apply` / `--drop-source` are parsed and dispatched was untested, despite taking
an injectable `argv` specifically for testability.
*Fix:* seven new tests drive `main()` directly against `tm_suite_test`, asserting observable effect
rather than call spies (stronger, and an ES-module-internal call to `dropSource` cannot be spied on
anyway). They cover the dry-run default, `--apply` (including that `--apply` alone never drops the
source), `--drop-source` dry, `--drop-source --apply` plus the already-dropped re-run,
`--prefer-new` pass-through, and the refusal path's non-zero exit code. `main()` closes the shared
client in its `finally`, so the block reconnects in `afterEach` and snapshots/restores
`process.exitCode`.
*Discrimination:* `drop` forced to `false` in the argv parse → **2 red**.

**P13 — [LOW] Two E2E assertions could not discriminate.**
(a) `#cycle-content` contains the story label — true regardless, because the Stories table lists it.
(b) `#cycle-content` contains an em-dash "to prove no-story renders as a dash" — but every
story-cycle `<select>` renders a permanent `— none —` option, so the character is on the page
whatever the cycle's link is.
*Fix:* both scoped to the specific cycle's own row. (a) asserts the row's
`select.cy-story-cycle-select` has value `sc-001` and its `option:checked` names the story; (b)
asserts the unlinked row's select has value `''` with a `none` option checked, **paired with the
opposite assertion on the linked row** so it must discriminate.
*Discrimination:* `buildStoryCycleSelect` forced to pass no `selectedId` → **both red**. The old
assertions would not have moved: the failure dump from an unrelated red in the same file shows
`— none —1 — Story One: Blood and Shadows2 — Story Two...` present in *every* row's select
regardless of linkage, which is the finding stated as evidence.

### Judgement calls worth recording

- **P3 took option (a), the harder one.** The brief allowed a documentation-only fallback if
  `--prefer-new` needed a design decision beyond a triage pass. It did not, because the write is
  strictly narrower than it first looks: the branch only ever `$unset`s `chapter_id` and never
  touches `story_cycle_id`, so "trust the new field" is a property of the code rather than a
  judgement the operator has to accept. What *did* need a decision was a sub-case the brief's framing
  does not cover: **in that deploy window the Story dropdown is empty** (the collection does not
  exist yet, so `GET /api/story_cycles` returns `[]`), which means the only option an ST can actually
  pick is `— none —`, and the value the live system "wrote most recently" is therefore usually
  `null`. Taken literally, `--prefer-new` would then discard a real grouping in favour of a null.
  **Decision: keep the specified semantics** (the new field wins — the ST's action was deliberate,
  and the alternative is the script second-guessing a live write) **but make the consequence
  impossible to miss**: `clearsGrouping` is computed in the plan, printed as an explicit
  `WARNING ... comes out UNGROUPED. Re-select its Story in the Cycle tab` line in both the dry run
  and the apply, and covered by its own test. Recovery is one dropdown selection.
- **P1 refuses by returning early rather than by adding to the refusal list.** A wrong-shaped source
  makes every subsequent computation meaningless, so printing a plan over it would be actively
  misleading — and the plan is the thing an operator reads before deciding. `planRename` therefore
  returns `{ wrongSourceShape: true, copies: [], fieldRenames: [], ... }`, and `main()` prints a
  distinct block telling the operator **not** to work around it.
- **P2 narrows the drop gate but does not weaken `applyRename`.** These are different operations with
  different risks and they now have different gates, which is the actual finding: one is about to
  write, the other is about to delete, and byte-equality is the right question for exactly one of
  them.
- **P2 has a knock-on with D1, noted rather than fixed.** A Story deleted during burn-in leaves a
  source `_id` with no target, which the new ID-existence gate refuses on. The old gate refused too
  (via `plan.copies`), so this is not a regression — but it is why D1 is logged as "either a
  resurrection or a blocked drop; reconcile by hand either way".

### Dismissed — no code change

- **Index recreation.** A suggestion that copy-then-drop might lose a MongoDB index defined on
  `chapters`. **Dismissed on evidence:** the Edge Case Hunter's full-repo sweep found nothing in this
  codebase that creates an index on `chapters` (no `createIndex` call, no index script, no schema
  directive), and the story's own live investigation records the collection as carrying none beyond
  `_id`. There is nothing to lose.
- **`additionalProperties` schema validation on `downtimeCycleSchema`.** A concern that renaming
  `chapter_id` → `story_cycle_id` could cause a write to be rejected during the deploy/migrate gap.
  **Dismissed on evidence:** direct inspection confirms the schema is `additionalProperties: true`
  and is wired only to `POST /api/downtime_cycles`, not to a general write-time gate. The field-name
  change enforces nothing either way and cannot cause a write failure.
- **UI staleness on Story delete.** `view.storyCycles` is not updated when a Story is deleted, so
  `renderRibbon()`'s lookup could resolve a deleted Story until the next refresh. **Confirmed
  pre-existing** in the code this diff inherited (the same shape existed pre-rename, with
  `view.chapters`), not introduced here, and cleared by any tab reload. Out of scope; one line added
  to `specs/deferred-work.md` so it is not lost.

### Deferred — logged, not implemented

Written to `specs/deferred-work.md` under *"Deferred from: code review of
cm-2-chapters-to-story-cycles-rename (2026-08-16, internal 3-layer review)"*: **D1** a Story deleted
during burn-in resurrected by a later `--apply` (Medium); **D2** `keptLabels` under-counting (Low);
**D3** the `apiPost`/`apiPut`/`apiDelete` status-code gap — **cross-referenced onto the existing
npcr.3 entry** as a second concrete instance rather than duplicated, and extended to `apiDelete`
(Medium); **D4** `verifyRename`'s drop-time self-comparison, now moot after P2 (Low). Plus the
one-line pre-existing UI-staleness note above.

### Regression gate after all patches

**Vitest (changed-area, `cd server`, the six suites AC11 names):** **6 files, 144 passed, 0 failed,
0 skipped** — up from the pre-review 120. The migration suite grew 28 → 52 tests. The DB-backed
suites genuinely ran; the summary line was read, not just the exit code.

**Playwright (sequential, never concurrent):**

| Spec | Result | Against the confirmed pre-existing baseline |
|---|---|---|
| `tests/cycle-tab.spec.js` | 19 passed / 1 failed | Same single failure (`shows human-readable phase labels`, asserting `legacy`). Pass count 17 → 19 from the two new P4 tests. |
| `tests/cycle-phase-controls.spec.js` | 0 passed / 11 failed | Identical, all 11 of 11. |
| `tests/cycle-prep-access.spec.js` | 11 passed / 1 failed | Identical (`Prep Access button is gold-highlighted when open`). |

All 13 failures are the **CM-1 phase-UI source-drift family**, already reproduced at base by the
Acceptance Auditor (base `cycle-views.js` + base spec restored from `HEAD`, identical failures) and
already logged in `specs/deferred-work.md`. Not re-derived here; nothing about them changed.

### Live-data safety (AC12), re-confirmed

No `--apply` and no `--drop-source` was run against live `tm_suite` in this review. Every script
execution went through the vitest suite, which passes a `db` handle in as an argument and runs under
`MONGODB_DB=tm_suite_test` forced by `tests/helpers/setup-env.js`, with `assertTestDbSafety` refusing
any non-`_test` database name under vitest. Nothing was committed, pushed, or merged; the working
tree is left for Angelus's own commit step. The runbook hand-off is unchanged except that the
both-fields recovery path is now documented and executable.
