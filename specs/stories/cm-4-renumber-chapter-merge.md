# Story cm-4: The renumber — Chapter-1 placeholder, downtime reassignment, `game_sessions` FK

Status: done

> **Ruling documents:** `D:\Terra Mortis\cycle-model.md` §5 (Chapter-1 placeholder), §6 (the
> renumber decision and mapping, 2026-07-23), §6a (timing relative to an in-flight chapter), §7
> (phase legacy-mirror), §8 (seam assertions), §9 (rollback, required not optional), §11a step 6
> (CM-4's expanded scope, folding in CM-6). Epic-internal story, tracked in
> `specs/stories/sprint-status.yaml` under `epic-cm`.
>
> **Sequence position: genuinely unblocked as of 2026-08-17**, the moment `cm-2b` landed (done,
> committed `26bf229e`). §11a's own ordered list has CM-4 as step 6, strictly after step 5
> (`cm-2b`) — that gate is now satisfied. **One live-execution dependency remains, distinct from
> story-creation readiness**: this story's own migration script is written against the
> **post-`cm-2b` schema** (`chapters` collection, `downtime_submissions.chapter_id`), because by
> the time this story is actually dev-storied and run for real, `cm-2b`'s own `--apply` should
> already have landed (per that story's Open Question 1 ruling — gated on TM Cockpit coordination,
> not on this story). If `cm-2b`'s `--apply` has NOT run yet when this story reaches dev-story,
> STOP and re-scope rather than writing against stale field names — see Task 1.
>
> **Branch from `main`, PR direct to `main`** (project branching convention, cycle-model.md §11).
> **Runway note**: Game 8 is 2026-09-19, roughly five weeks out from this story's creation date —
> nothing here is compressed against a deadline, unlike the original Game-7-week attempt that
> triggered §11's safety valve and got parked. Take the time this needs.

## Story

As the Storyteller,
I want the historical downtime→game pairing corrected once, for all seven existing chapters, so
that "Downtime for Chapter N" and "Game N" are the same chapter going forward — closing the
off-by-one `cycle-model.md` §1 diagnosed (a cycle labelled "Game N" actually held the downtime that
fed Game N+1) — and so that `game_sessions` carries an enforced, not conventional, link to the
chapter it belongs to.

## Why this story exists

`cycle-model.md` §1: *"the cycle labelled 'Game 5' held the downtime filed after Game 5, whose
feeding roll produced the vitae spent in Game 6... the app could not open feeding for the next game
without asserting the previous game was running again."* §6 restates the ruling plainly (2026-07-23,
restated consistently since): historical cycles are **renumbered** — not additively parked — into
the chapter anchor. **Games are never renumbered; only which cycle document each downtime's
submissions are attached to moves.**

**All five §6 hard preconditions are closed, confirmed again this session (2026-08-17, live
read-only query, not trusted from memory):**

1. **Reference hygiene** — the 12 dangling/null/undefined `cycle_id` refs, re-confirmed unchanged:
   4 dangling ObjectIds (`6a2a278b9b43afe5dfb18cab`, `6a2a27d2f7a15631cf65b9b1`,
   `6a30b3b6320d6d1379ef854e`, `6a30b400ee128b5ed23f52f5` — all on Livia, all `status: 'draft'`) + 4
   `null` + 4 missing-field (both groups on Yusuf Kalusicj). Per the 2026-08-16 ruling, these are
   confirmed non-production test artifacts and are **excluded from the renumber entirely** — they
   have no valid cycle reference to renumber, force-repairing them would be inventing data. This
   story's plan must skip them explicitly, not silently.
2. **The falsifiable harness + drilled inverse** — `cm-7-fact-map.mjs` / `cm-7-drill-migration.mjs`
   (done, `cm-7`). **This story is the first time either is exercised against a real migration
   instead of a drill fixture** — that was the whole point of building them ahead of this story.
3. **Migration discipline** — dry-run-diff-first, idempotent, a `main()`-invoking test, drilled
   backup — the pattern every migration script in this project already follows (`cm-2`, `cm-2b`,
   DBO-1/4/8); this story's own script is no exception.
4. **The paired inverse, tested against a real interleaved-write scenario first** — `cm-7`'s own
   drill already proved the MECHANISM; this story's actual inverse script follows the same shape
   against its own real data.
5. **The Chapter-1 placeholder specced against the real lookup queries** — `cm-7`'s own AC2
   coverage-set enumeration (all eight surfaces where `game_number`/label reach a human) **is**
   this precondition's required input; it already exists and is exhaustive.

**Live data re-confirmed this session, 2026-08-17 (read-only, matches `cycle-model.md`'s own
2026-08-16 snapshot exactly — zero drift):**

| Doc `_id` | `game_number` | Label | Submissions attached (`cycle_id`) |
|---|---|---|---|
| `69f2dc48a77e2f00eb39a43c` | 1 | Game 1 | 25 |
| `69d0a3c5052b57f6be774e69` | 2 | Game 2 | 29 |
| `69e955c784bbfc821bed2810` | 3 | Game 3 | 29 |
| `6a11a3814fce658310cdee80` | 4 | Game 4 | 29 |
| `6a373813efee90c8c11fff74` | 5 | Game 5 | 27 |
| `6a57581d08c8efbdee14ca71` | 6 | Game 6 | 32 |
| `6a7ff9544f02ce8035b75d5a` | 7 | Game 7 | **1** |

**New fact, not in `cycle-model.md`'s own snapshot: the game_number=7 document's own `status` is
still `'prep'` and `phase` is `null`, despite Game 7 having been played 2026-08-15.** The ST has not
advanced its phase past prep in the admin app. Not this story's problem to fix, but the migration
script must not assume `status`/`phase` values correlate with "this game has already happened" —
`game_number` alone is the only reliable "did we already know this event happened" signal, per the
existing §6 "trap that must not be reused" (creation order / `status` are not game order either).

**The Chapter-7 document's own 1 pre-existing submission is a real open question, not a rounding
error** — see Open Question 1.

## What this story IS

1. **The write plan, concretely, using the real `_id`s above** (mirroring the mapping table's own
   month-by-month framing, `cycle-model.md` §6):
   - Every `downtime_submissions` document currently attached (`chapter_id`, post-`cm-2b`) to the
     doc with `game_number = N` (for N = 1..6) gets its `chapter_id` reassigned to the doc with
     `game_number = N+1`. Concretely: the 25 submissions on doc `game_number=1` move to doc
     `game_number=2`; the 29 on `game_number=2` move to `game_number=3`; and so on through the 32
     on `game_number=6` moving to `game_number=7`.
   - The doc with `game_number = 1` gets the Chapter-1 placeholder fields added **in place** — no
     new document, no new `_id`. `cycle-model.md` §3's own framing ("the game cycle IS the chapter")
     means Chapter 1's "own cycle document" is the document that already carries `game_number: 1`.
     `placeholder: true`, plus a note field: *"This downtime was represented by character creation,
     January–February 2026."* Shape chosen (per §5) so no "latest/newest" lookup accidentally
     selects it — confirm against `cm-7`'s own AC2 coverage-set enumeration which of those eight
     surfaces sort/filter in a way a placeholder-shaped doc could slip into, and prove each one
     excludes or tolerates it.
   - The 12 dangling/null/missing-field submissions are left exactly as they are — no `chapter_id`
     write of any kind.
2. **`isFinalChapterOfStory`/`story_cycles.final_chapter_id` (this session's own `cm-3`) is
   untouched by this migration.** Story membership (`story_cycle_id` on each cycle doc) is a
   separate FK from the renumber's own `chapter_id` reassignment — the renumber moves which
   *submissions* a chapter's document is credited with, not which *Story* a chapter belongs to.
   Confirm this holds (a quick regression check, not a design change) rather than assume it.
3. **CM-6, folded in per `cycle-model.md` §11a's own instruction** ("since CM-4 is already touching
   every cycle document once"): `game_sessions.chapter_id`, nullable, plus a **partial unique
   index** (unique where not null) enforcing the confirmed-always-1:1 invariant (Angelus,
   2026-08-16) at the database level, not by convention. Backfill the ~7 existing `game_sessions`
   documents via **a small, manually ST-confirmed pairing** — explicitly **not** an automated
   match-by-`game_number` script, which `cycle-model.md` §11a records has already caused two
   separate live bugs this cycle (the Game-7-incident Influence and feeding-cycle-picker bugs both
   trace to exactly this kind of automated inference). Confirm no duplicate/orphan documents remain
   in either collection as part of the same pass.
4. **The migration script**, `server/scripts/cm-4-renumber-chapter-merge.mjs`, following this
   project's now-well-established `planRename`/`verifyRename`/`applyRename`/`dropSource`-shaped
   pattern (`cm-2`, `cm-2b` are the direct precedents; this migration doesn't rename a collection so
   there's no `dropSource` equivalent, but the plan/verify/apply/dry-run-default/idempotent shape
   carries over exactly). **Reuses `cm-7-fact-map.mjs`'s `buildFactMap`/`runFactMapCheck` as the
   pre-image/post-image gate** — this is the first real invocation of that harness against
   something other than its own drill fixtures, and `cm-7`'s own coverage-set enumeration is the
   fact map's coverage, unmodified.
5. **The inverse**, `server/scripts/cm-4-renumber-chapter-merge-invert.mjs` (or a paired
   `--invert` flag on the same script, following whichever shape `cm-7-drill-migration.mjs`
   established as this project's own convention — check it first, match it, don't invent a new
   shape). Tested against a real interleaved-write scenario (a feed roll + a spend happening
   between forward and invert) before this story is considered done, mirroring `cm-7`'s own AC7.
6. **A dry-run report, machine-diffable, satisfying the #826 post-mortem rule** this project holds
   itself to on every migration script.
7. **A backup taken immediately before `--apply`** (drilled, not assumed — `cm-7`'s own backup-drill
   precedent), and confirmed restorable.

## What this story is NOT

- **NOT a live `--apply` run.** This story ships the script, dry-run-verified against
  `tm_suite_test` fixtures shaped like the real seven-chapter data above, plus a genuine backup
  drill. Running it for real against live `tm_suite` is Angelus's own action, same convention as
  every migration script in this project (DBO-1/4/8, `cm-2`, `cm-2b`).
- **NOT a change to Story membership** (`story_cycle_id`/`final_chapter_id`) — confirmed untouched
  per item 2 above, not re-designed.
- **NOT willpower/damage downtime capture, automatic power-cost deduction, or player spend
  buttons** — all explicitly parked elsewhere in `cycle-model.md` §2/§11, unrelated to this story.
- **NOT a fix for the Chapter-7 document's `status`/`phase` staleness** noted above — flagged, not
  fixed; it's an ordinary ST admin action (advance the phase in the Cycle tab), orthogonal to the
  renumber.
- **NOT TM Cockpit or TM Wiki code.** `cycle-model.md` §11a step 4's own resolution confirmed TM
  Wiki's `getPreviousDowntimeCycle` independently implements the same game_number-1 continuity
  lookup `cm-7`'s harness tracks for this repo's `downtime-story.js` — a second, separate
  renumber-hazard site in a sibling repo, out of this story's scope by design (same boundary
  `cm-7`'s own "NOT TM Wiki coverage" section drew), fails soft there, not a defect to fix here.

## Acceptance Criteria

1. **`planRename`/equivalent produces a plan matching the write plan above exactly**, keyed off
   live (or fixture-mirrored) `game_number` values, not hardcoded `_id`s — so the plan is correct
   against `tm_suite_test` fixtures shaped like the real seven documents, not dependent on those
   documents' literal ids. Output: for each of the six non-placeholder chapters, how many
   submissions move and from/to which `_id`; confirmation the 12 dangling refs are excluded by
   name/id, not merely by accident of not matching a filter.

2. **The Chapter-1 placeholder is applied to the existing `game_number: 1` document, not a new
   one**, and its shape is proven (by a test, not by inspection) to be excluded or safely tolerated
   by every one of `cm-7`'s AC2 coverage-set surfaces — the archive order fallback, the DT Story
   continuity lookup, the office/session log labels, the admin Cycle-tab labels, the
   `game_sessions` ↔ cycle correspondence check, and the rest.

3. **A DUAL GATE, both halves imported not reimplemented, both falsifiable, both run inside
   `applyRenumber` itself** — pre-image before any write, post-image after, and the migration
   refuses to report success on either coming back red.

   *(AC amended 2026-08-17 during the review rework, on the review's own recommendation. The
   original wording asked that `runFactMapCheck` "be told which facts are expected to move". Working
   through `cm-7`'s `COVERAGE_SET` item by item — verified independently by the Acceptance Auditor —
   this migration moves **none** of its facts: the coverage set tracks chapter identity/ordering and
   the `game_sessions` correspondence, while `cm-4` writes `downtime_submissions.chapter_id`, six
   derived downtime fields, two placeholder fields and one `game_sessions` field. `cycle-model.md`
   §6 states that invariant positively, so an empty expected-diff set is the correct gate, not a
   weak one. The AC is amended to describe what was correctly built rather than rebuilt to match
   wording that no longer fits.)*

   - **Half 1, `runGatedFactMapCheck`**: wraps the imported `runFactMapCheck` with an enumerated
     allowlist that fails on an undeclared diff **and** on a declared expectation that did not
     occur, so the allowlist can never rot into a silent pass. `EXPECTED_FACT_DIFFS` is empty with
     a documented reason; the mechanism itself is exercised for real by tests using a deliberately
     non-empty set. It rejects a `/g`-flagged pattern rather than mis-matching it.
   - **Half 2, `buildAttachmentMap`/`runAttachmentCheck`**: gates the facts that genuinely **do**
     move — which chapter each submission is attached to — against the plan's own enumerated
     prediction rather than against "did anything change". Falsifiable the same way (throws on a
     zero-comparison pre-image), and type-aware: it compares through `canonicalJSON`, so a
     silent string↔ObjectId storage promotion is caught rather than read as unchanged.

4. **`game_sessions.chapter_id` exists, nullable, with a partial unique index (unique where not
   null).** The ~7 existing documents are paired via a small, explicit, manually-confirmed mapping
   table in the migration script itself (not derived by matching `game_number`) — each pairing
   cites the specific evidence (session date vs. chapter's own game) an ST would use to confirm it,
   so the mapping is auditable, not opaque.

5. **The inverse is real and tested against interleaved writes**, mirroring `cm-7`'s own AC7 shape
   exactly: seed fixtures at the pre-migration shape → run the forward migration → write real
   post-migration data (a feed roll, a tracker spend) → run the inverse → assert both that the
   interleaved writes survive byte-for-byte AND that `runFactMapCheck` reports the inverted state
   matches the original pre-image on every coverage-set field.

6. **A drilled backup**, taken immediately before `--apply` in the documented runbook (not run as
   part of this story, but the runbook step and its own test-fixture-scoped drill both exist and
   pass), restorable and verified restorable — same discipline `cm-7`'s own AC8 established.

7. **Dry-run output is machine-diffable**, satisfying the #826 rule this project holds itself to:
   a test drives the script's actual `main()`, not just its internal functions, and asserts on the
   printed report's real shape.

8. **Changed-area regression stays green**, including — not just this story's own new suite —
   `cm-7-fact-map-harness.test.js`, `cm-3-derived-maintenance.test.js`,
   `cm-3-final-chapter-guard.test.js` (confirming Story membership is untouched, AC2 of "What this
   story IS"), `cm-2b-downtime-cycles-to-chapters.test.js`,
   `cm-2b-chapters-route-and-dual-read.test.js`, `api-story-cycles.test.js`,
   `api-game-sessions*.test.js`, `downtime-story.test.js` if it exists (the continuity-lookup
   consumer). No live `tm_suite` write in any test.

## Tasks / Subtasks

- [x] **Task 1 — Re-verify everything against the working tree and live data at dev-start (all
      ACs).** This story's own live-data snapshot and every file:line citation were gathered
      2026-08-17; re-confirm before writing code, per this project's documented false-pass hazard.
      **Critically: confirm `cm-2b`'s `--apply` has actually landed against live `tm_suite`** (the
      collection is genuinely `chapters`, the field genuinely `chapter_id`) before writing this
      story's migration script against those names — if it hasn't, STOP, do not silently write
      against stale pre-`cm-2b` field names, and flag it back for a scoping decision rather than
      guessing.

- [x] **Task 2 — Investigate and resolve the Chapter-7 stray-submission question (Open Question 1,
      before writing the plan).** One submission is currently attached to the `game_number=7`
      document. Determine: is it a real player-filed submission intended for the chapter that will
      eventually be `game_number=8` (which doesn't exist yet), test residue, or something else —
      and get Angelus's ruling on where it belongs before the plan treats it either way.

- [x] **Task 3 — Migration script: plan/verify/apply (AC1, AC3, AC7)**
  - [x] `planRename` (or equivalently named — match this project's established naming convention),
        pure, read-only, keyed off `game_number`.
  - [x] Chapter-1 placeholder application, in-place on the existing document.
  - [x] `runFactMapCheck` integration, told which facts are expected to change.
  - [x] `main()` CLI, dry-run default, machine-diffable report.

- [x] **Task 4 — CM-6: `game_sessions.chapter_id` + partial unique index (AC4)**
  - [x] Schema field addition.
  - [x] The manual pairing table, cited evidence per row.
  - [x] Duplicate/orphan confirmation across both collections.

- [x] **Task 5 — The inverse (AC5)**
  - [x] Mirror `cm-7-drill-migration.mjs`'s own forward/invert shape.
  - [x] The interleaved-write drill test.

- [x] **Task 6 — Backup drill (AC6)**
  - [x] Mirror `cm-7`'s own AC8 backup-drill test shape.

- [x] **Task 7 — Chapter-1 placeholder coverage-set proof (AC2)**
  - [x] One test per `cm-7` AC2 coverage-set surface, asserting the placeholder is excluded or
        tolerated.

- [x] **Task 8 — Changed-area regression (AC8).** Targeted only, per this project's standing
      instruction — the suite list in AC8, plus anything Task 1's re-verification surfaces.

- [x] **Task 9 — `reference-data-ssot.md` / `cycle-model.md` §11a status update.** Record this
      story's own completion in `cycle-model.md`'s "Status as of" note, matching how `cm-2`/`cm-2b`
      each updated it on landing.

- [ ] **Task 10 — PR to `main`.** Only on Angelus's explicit word. `--apply` is explicitly NOT run
      as part of this task. **Do not PR until Task 11 (below) is complete** — review found multiple
      High-severity gaps in the safety mechanisms this script's own header claims to have.

- [x] **Task 11 — Rework pass addressing every Review Findings item below.** Done 2026-08-17; every item below is ticked, each with a red-then-green test of its own. See the Task 11 completion notes.

### Review Findings

Internal 3-layer review (Blind Hunter, diff-only; Edge Case Hunter, diff + full repo; Acceptance
Auditor, diff + spec + live test run), 2026-08-17. Given this is the highest-stakes migration in the
epic, all three layers were briefed to scrutinize the safety guards specifically — a guard that
looks correct but isn't is exactly what they were asked to find, and they found several, largely
convergent across layers.

**Decision resolved:** stale derived chapter fields (below) — Angelus's ruling: recompute during
the migration itself, scoped to this story, not a wider architectural fix.

- [x] [Review][Patch] **CRITICAL — the idempotency stamp is written LAST, so the one scenario it
  exists to catch (a crash mid-run) leaves zero stamps, and the abort message tells the operator the
  opposite of what actually happens on retry.** Found independently by Blind Hunter and Edge Case
  Hunter. A single `updateMany` stamps all chapters after every other write; a throw anywhere in the
  moves loop (a dropped connection, an invalid `_id`, an index collision from the pairing-conflict
  gap below) leaves the plan's own `partial-apply` refusal (which only fires when `stamped.length >
  0`) unable to detect anything happened. The next `--apply` re-plans from the already-shifted state
  and **compounds the shift** — submissions that already moved once move a second time. The abort
  message at the crash site explicitly (and wrongly) tells the operator "the next plan will refuse
  rather than re-shift." Fix: stamp progressively as each source chapter's own moves complete (or a
  pre-write in-progress marker cleared only on clean completion), not one bulk write at the end.
  [server/scripts/cm-4-renumber-chapter-merge.mjs, the stamp `updateMany` and Guard 2]

- [x] [Review][Patch] **CRITICAL — a second `--apply` clobbers the first (crashed) run's plan file,
  destroying the only rollback record exactly when it's needed.** The plan is written, unconditionally,
  to the same default path (`.cm4-renumber-plan.json`) every run, before any write. Chained with the
  stamp bug above: run 1 dies mid-shift with no stamp; the operator re-runs `--apply` with the
  default plan path; run 2 overwrites run 1's plan before writing, then double-shifts, and the only
  record of what run 1 actually did is gone. Fix: refuse to overwrite an existing plan file (or
  auto-suffix it) unless explicitly told to.

- [x] [Review][Patch] **CRITICAL, triple-confirmed by all three layers — an empty or fully-excluded
  `chapters` collection produces a confident, refusal-free, empty plan, contradicting the script's
  own header comment ("refusing is the only honest answer").** Guard 0 only checks the *collection
  name* exists, never that it holds documents. With zero (or zero matching) chapter documents:
  `gameNumbers.length &&` short-circuits the sequence-start check, the gap loop never iterates, every
  later guard loops over nothing, and the function returns `refusals: []`. Exit code 0, "0 to move"
  — precisely the outcome Guard 0 exists to prevent. The one test named for this exact case
  ("refuses when there is no chapters collection at all") asserts the *non*-refusal path and never
  exercises the missing-collection branch at all.

- [x] [Review][Patch] **CRITICAL, per Angelus's ruling above — chapters' own stored derived fields
  (`submission_count` and cm-2b's other enumerated ones: `discipline_profile`, `confirmed_ambience`,
  `ambience_applied`, `out_of_window_player_ids`, `feeding_rights_confirmed`) go stale immediately
  post-migration and nothing notices.** Confirmed independently by Blind Hunter and the Acceptance
  Auditor, the latter tracing it to a real rendered surface: `submission_count` is displayed verbatim
  by the admin Downtime list (`downtime-views.js:1284`). Post-migration, Chapter 1 shows "25
  submissions" while holding 0; Chapter 7 shows "1" while holding 33. **Fix per the ruling**:
  `applyRenumber` recomputes these fields on both the source and destination chapter as part of its
  own write, for every chapter touched by a move — scoped to this migration, not a wider refactor
  toward computing them at render time.

- [x] [Review][Patch] **CRITICAL — the partial unique index on `game_sessions.chapter_id` does not
  actually enforce the 1:1 invariant it's sold as, confirmed at the route level by two independent
  layers.** The index's own partial filter admits both ObjectId and string forms of the same
  reference as distinct keys. That's not hypothetical: `PUT /api/game_sessions/:id` is a blind
  `$set: body` with no coercion, and BOTH live writers that use it — `public/js/admin/attendance.js`
  and `public/js/game/signin-tab.js` — fetch a session, edit unrelated fields, and PUT the whole
  document straight back, silently converting `chapter_id` from ObjectId to its JSON-serialised
  string form. The very first attendance edit or sign-in autosave after `--apply` defeats the
  constraint the migration exists to establish. Fix: coerce `chapter_id` to a canonical stored type
  server-side on every write path (schema `pattern` + route-level cast), not just at index-creation
  time.

- [x] [Review][Patch] **HIGH — a partially-copied `chapters` collection (e.g. from a crashed `cm-2b`
  `--apply`) silently excludes real submissions as if they were the known-dangling set, and still
  reports green.** If `chapters` holds a dense, gap-free, duplicate-free subset (say chapters 1-4
  only), every guard passes. Every submission pointing at the missing chapters (5, 6, 7) is
  classified `dangling` — indistinguishable in the report from the four already-characterised Livia
  rows except by a count nobody asserts — and silently excluded. Fix: refuse when the dangling set
  is not *exactly* the previously-characterised set (or exceeds a declared, named ceiling).
  [Edge Case Hunter]

- [x] [Review][Patch] **HIGH — `--invert` against a stale or wrong plan file clears every marker and
  drops the index unconditionally, even when it reverts nothing, making a correctly-migrated database
  indistinguishable from an unmigrated one.** Submission/session reverts are correctly guarded by
  expected-value matching (a mismatch is counted `skipped`), but the marker `$unset` and `dropIndex`
  are NOT — they run over `plan.chapters` regardless of how many reverts actually matched. Point
  `--invert` at a stale plan whose chapter `_id`s happen to overlap: output reads "0 / 174 reverted,
  7 marker(s) cleared", and the next `--apply` shifts everything a second time on top of live data
  that already has the correct shape. Fix: refuse (or at minimum warn loudly and require
  confirmation) when `reverted === 0` but markers/index would still be touched. [Edge Case Hunter]

- [x] [Review][Patch] **HIGH — an orphan `game_sessions` document that already carries a `chapter_id`
  colliding with a pairing-table row is invisible to both conflict checks, and the resulting crash
  lands exactly in the stamp-timing trap above.** `pairing-conflict` only checks a row's own named
  session; `pairing-duplicate-chapter` only checks collisions between table rows. A session with NO
  table row, already holding a chapter reference from elsewhere, is checked by neither. The plan
  reports green, the session write proceeds, `ensureSessionChapterIndex` then throws E11000 — after
  the submission moves and placeholder write have already landed, before the stamp. Fix: build the
  conflict check over ALL live sessions' current `chapter_id` values, not just the ones named in the
  pairing table. [Edge Case Hunter]

- [x] [Review][Patch] **HIGH — the attachment gate stringifies both sides of its comparison, so it
  cannot detect the one storage-type change (string vs. ObjectId) it exists to catch.** `cm-2b`'s
  own review found and fixed exactly this class of bug in `canonicalJSON`; the same mistake was
  reintroduced here in a different function. `buildAttachmentMap`/`runAttachmentCheck` both call
  `String(ref)` before comparing, so a submission's FK silently promoted from a string to an
  ObjectId (or vice versa) during the write reads as unchanged. Fix: compare through the SAME
  type-aware equality this project's other migrations now use (`canonicalJSON`, imported, not a
  third reimplementation), not a raw string cast. [Edge Case Hunter]

- [x] [Review][Patch] **HIGH — the pre-existing `chapters.session_id` reverse link is never read,
  reconciled, or cited as evidence by the new manually-curated pairing table, so the migration can
  create a second, contradicting session↔chapter link with nothing to flag the disagreement.**
  `chapters.session_id` is itself an existing, ST-editable pairing surface in the admin Cycle tab.
  `GAME_SESSION_PAIRINGS`' own cited evidence never queries or cross-checks it. Fix: cross-reference
  every pairing-table row against the source chapter's own `session_id`, and refuse (or flag loudly)
  on disagreement rather than silently adding a second link. [Acceptance Auditor]

- [x] [Review][Patch] **MEDIUM, triple-confirmed — boot-time `createIndex` on `game_sessions` is not
  awaited, so a duplicate-key rejection escapes the surrounding `try/catch` as an unhandled promise
  rejection, which can boot-loop the Render API the moment a live duplicate exists** (reachable via
  the ObjectId/string split above, or an ST hand-edit). Fix: `await` it, inside the existing
  try/catch. Also add 11000 handling to `POST /api/game_sessions` so a duplicate surfaces as a 409,
  not a 500.

- [x] [Review][Patch] **MEDIUM, triple-confirmed — `--apply` combined with `--json` silently performs
  no writes.** The `--json` branch prints the report and returns before the apply path is ever
  reached, with the `Mode: APPLY` banner itself suppressed under `--json`, so nothing distinguishes
  this from a completed run. Fix: apply and THEN optionally emit JSON, or refuse the flag
  combination outright with a named reason.

- [x] [Review][Patch] **MEDIUM — a non-integer `game_number` silently keeps its submissions in place
  while every other chapter shifts, with no refusal.** Guard 3 only checks `typeof === 'number'`;
  the gap-detection loop steps by integer, so a chapter at e.g. `game_number: 6.5` is invisible to
  the gap check, has no valid `+1` destination, and falls into the "terminal chapter, stays put"
  branch with no warning. Fix: require `Number.isInteger`.

- [x] [Review][Patch] **MEDIUM — the Chapter-1 placeholder has zero readers anywhere in the
  application.** The placeholder note is written, and its exact text is asserted by a test — but
  nothing in `public/js/` or `server/` ever reads `placeholder`/`placeholder_note` on a chapter. What
  actually changes for a real user is that the archive/admin views render Chapter 1 holding zero
  published outcomes where it previously held 25, with no explanation shown anywhere. Either wire a
  minimal consumer (the archive tab and/or admin Cycle tab showing the placeholder note when present)
  or explicitly scope that follow-up to a later story and say so in this one, rather than let the
  tests imply a consumer surface was verified when only the fact-map's *absence of change* was.
  [Edge Case Hunter]

- [x] [Review][Patch] **MEDIUM — gates that throw AFTER the idempotency stamp is written are
  indistinguishable from success on the next run.** `runAttachmentCheck`/`verifyRenumber` sit outside
  the `try/catch` block that covers the stamp write. If either throws post-stamp, `main()`'s
  `finally` closes the connection and rethrows a bare error message — but the chapters are already
  stamped, so a follow-up run reports "already applied; nothing to do" and the operator never learns
  the verification gates didn't actually run. Fix: wrap the post-write gate block in the same
  try/catch scope as the writes themselves, and mark the run failed before any stamp is trusted.
  [Edge Case Hunter]

- [x] [Review][Patch] **MEDIUM — AC3's literal text doesn't match what was correctly built; amend
  the AC, don't re-build to match stale wording.** `EXPECTED_FACT_DIFFS` stays permanently empty
  because this migration genuinely doesn't touch any of `cm-7`'s own coverage-set facts (verified
  independently by the Acceptance Auditor) — the compensating `runGatedFactMapCheck` +
  `buildAttachmentMap`/`runAttachmentCheck` pairing is real, correctly wired pre/post-write, and
  falsifiable (proven by saboteur tests). Update AC3's own text to describe this dual-gate design
  instead of the allowlist framing that no longer matches it.

- [x] [Review][Patch] **LOW-MEDIUM cluster, cheap fixes, batch together:** the `game_session.schema.js`
  `chapter_id` field has no pattern constraint (compounds the index-defeat finding above — add a
  24-hex pattern); `refType`'s `_bsontype === 'ObjectID'` check uses the pre-bson-5 string spelling
  and is dead code (the `instanceof` fallback is the only live path) — fix the string or remove the
  branch; the coverage-set item 8 test is a tautology that never actually references `COVERAGE_SET`/
  `NOT_A_FACT` — rewrite it to genuinely cross-check against `cm-7-fact-map.mjs`'s own export; the
  "refuses when there is no chapters collection" test asserts the opposite of its own name — split
  it into two tests, one per branch; the "33 submissions on Chapter 7" claim is only tested via
  scaled-fixture arithmetic (4+1=5), never the real numbers — add a fixture matching the real 32+1=33
  shape; four of the seven `game_sessions` pairing rows cite only label/`game_number` congruence as
  their evidence — exactly the inference this project's own design doc blames for two prior live
  bugs, just hand-transcribed instead of automated — strengthen those four rows with genuinely
  independent evidence (date adjacency, cross-referenced `session_id`) or flag them as
  lower-confidence pairings needing an ST's own eyes before `--apply`; `invertRenumber`'s ordering
  comment says "descending" while the code sorts ascending — fix the comment to match the (correct)
  code; index-creation and index-verification use different trigger conditions (create on
  pairings-or-orphans, verify only on pairings) — align them; `--plan-file`/`--out` as the trailing
  argv token silently yields `undefined` — validate the flag has a following value; the placeholder
  revert in `invertRenumber` matches on `_id` alone rather than the value it actually wrote, unlike
  every other scoped revert in the same function — scope it the same way; `main()` prints
  "placeholder not applied" on a fully successful idempotent re-run (the `alreadyPlaceholder` branch
  never sets `result.placeholderApplied`) — fix the flag; `runGatedFactMapCheck`'s regex `.test()` is
  `lastIndex`-unsafe for any future `/g`-flagged allowlist pattern — dormant today, reset `lastIndex`
  or reject `g`-flagged patterns defensively; no confirmation beyond the bare `--apply` flag before
  targeting the live `tm_suite` database by default — consider a `--target tm_suite` acknowledgement
  requirement matching the care taken everywhere else in this script.

**Dismissed as noise (0):** none — every finding across all three layers was real, cross-checked
against the actual code before being accepted into this list.

## Open questions for Angelus (flag before dev starts)

1. **What is the one pre-existing submission currently attached to the `game_number=7` document
   (Chapter 7's future home under this migration)?** Task 2 investigates first; this needs your own
   ruling once the investigation reports what it actually is. **Recommended default, pending that
   investigation**: if it's a genuine early-filed submission for the chapter that will eventually be
   `game_number=8`, leave it exactly where it is (attached to the `game_number=7` document) —
   the migration doesn't touch `game_number=7`'s incoming submissions at all except via the +1 shift
   from `game_number=6`, so this submission would simply become one of 33 submissions Chapter 7
   ends up with, mixed in alongside the 32 arriving from Chapter 6. If it's test residue, exclude it
   the same way the 12 dangling refs are excluded.
2. **Should this story run immediately once `cm-2b`'s `--apply` lands, or does it wait for its own
   separate confirmation window** (mirroring `cm-2`'s own burn-in-before-`--drop-source` pattern,
   even though this migration has no `--drop-source` equivalent)? **Recommended**: no separate
   burn-in needed — this migration is reversible via its own tested inverse (AC5) up until real
   post-migration play data accumulates, unlike `cm-2b`'s collection rename which had the
   deploy-window hazard. Run it whenever Angelus is ready, any time in the five-week runway before
   Game 8.

## Dev Notes

- This is a data-layer story with no UI/CSS surface of its own — `project-context.md`'s CSS
  conventions don't apply here directly, though Task 4's `game_sessions.chapter_id` addition may
  touch the admin session-picker UI (`public/js/game/signin-tab.js`, `public/js/admin/next-session.js`)
  if a pairing-review surface is needed; if so, reuse existing component classes, don't invent new
  ones.
- **Read `cm-7-fact-map.mjs` and `cm-7-drill-migration.mjs` in full before writing this story's own
  script.** They are not just precedent to imitate at a distance — `buildFactMap`/`runFactMapCheck`
  are meant to be imported and called directly, not reimplemented.
- **Read `cm-2-chapters-to-story-cycles.mjs` and `cm-2b-downtime-cycles-to-chapters.mjs`** for the
  established plan/verify/apply/`main()` shape, including `cm-2b`'s own hardened equality-checking
  and phantom-document guards (review found real bugs in the first-pass versions of both; this
  story's own script should start from the corrected versions, not the originals).

## References

- [Source: D:\Terra Mortis\cycle-model.md §1, §3, §5, §6, §6a, §7, §8, §9, §11a] — the full design
  this story implements.
- [Source: specs/stories/cm-7-fact-map-harness-and-rollback-drill.md] — the harness/inverse
  mechanism this story's own script reuses directly.
- [Source: specs/stories/cm-2b-downtime-cycles-to-chapters-rename.md] — the immediately-preceding
  story, including its own review findings (the equality-check and phantom-document bugs this
  story's script must not repeat).
- [Source: live `tm_suite` read-only query, 2026-08-17] — the seven-document mapping table and the
  Chapter-7 stray-submission fact, both in "Why this story exists" above.
- [Source: server/scripts/cm-7-fact-map.mjs, cm-7-drill-migration.mjs, cm-2-chapters-to-story-cycles.mjs,
  cm-2b-downtime-cycles-to-chapters.mjs] — the code precedents this story's own script must match.

## Dev Agent Record

### Agent Model Used

Opus 5 (`claude-opus-5[1m]`), `bmad-dev-story`, 2026-08-17.

### Debug Log References

- Live read-only investigation (Task 1 + Task 2): a throwaway `.mjs` run from `server/` against
  `MONGODB_DB=tm_suite`, deleted immediately after. Read-only by construction: no write call of any
  kind in it.
- `cd server && npx vitest run tests/cm-4-renumber-chapter-merge.test.js` — first run 75 passed /
  4 failed; see "The RED phase, and the three real bugs it found" below.
- **Live dry run, read-only, no `--apply`**: `MONGODB_DB=tm_suite node
  scripts/cm-4-renumber-chapter-merge.mjs`. Output: *"PRE-cm-2b DATABASE. Refusing to plan
  anything. REFUSED: ... there is no 'chapters' collection, 'downtime_cycles' still exists, and 180
  downtime_submissions document(s) still carry 'cycle_id'."* Non-zero exit code set. This is the
  Task 1 guard proving itself against real production data rather than only against fixtures.
  Nothing was written, and no plan file was left behind (`git status` clean apart from the intended
  files).

### Completion Notes List

#### Task 1 — the sequencing check, and its answer

**`cm-2b`'s `--apply` has NOT run against live `tm_suite`.** Confirmed read-only, 2026-08-17:

| Check | Live `tm_suite` |
|---|---|
| `downtime_cycles` collection | **present**, 7 documents |
| `chapters` collection | **absent entirely** |
| `story_cycles` collection | present, 3 documents (so `cm-2` *has* fully landed, `--drop-source` included) |
| `downtime_submissions` carrying `cycle_id` | **180** of 184 |
| `downtime_submissions` carrying `chapter_id` | **0** |

So `cm-2b` shipped as **code** (`26bf229e`, dual-read shim included) but its data migration is
still gated on the TM Cockpit coordination in `specs/cm-2b-cross-repo-coordination.md`.

Per the story's own instruction this was **not** treated as a blocker to writing the script, and the
script was **not** silently re-pointed at the stale names. Instead:

- everything is written and tested against the **post-`cm-2b` names** (`chapters`, `chapter_id`),
  with `tm_suite_test` fixtures shaped that way — correct regardless of when `cm-2b --apply` lands;
- the script's **first guard** is a named `pre-cm-2b` refusal: if the `chapters` collection is
  missing, or any in-scope submission still carries `cycle_id`, `planRenumber` returns immediately
  with a refusal that names `cm-2b` and the coordination doc, and plans nothing. Run bare against
  live `tm_suite` today, it refuses. A test proves the refusal fires.

**Consequence to carry forward: `cm-4`'s own `--apply` cannot run until `cm-2b`'s has.** Run order
is `cm-2b --apply`, then `cm-4 --apply`, then §6a's Cockpit re-export. Recorded in
`cycle-model.md` §11a's new "Status as of 2026-08-17" note and in the script's own header banner.

The rest of the story's live snapshot re-verified with **zero drift**: seven chapter documents,
`game_number` 1..7 dense with no duplicates, submission counts 25 / 29 / 29 / 29 / 27 / 32 / 1
exactly as tabled, the 12 unattachable submissions unchanged (4 dangling ObjectIds on Livia all
`status: 'draft'`, 4 `null` + 4 missing-field on Yusuf Kalusicj), and the `game_number=7` document
still `status: 'prep'` / `phase: null`.

#### Task 2 — the Chapter-7 stray submission. FINDING, NOT A CLOSED DECISION.

**What it is.** `downtime_submissions._id 6a8255819b6acc97f5bccdac`:

| Field | Value |
|---|---|
| `character_id` / `character_name` | `6a0ae66abda02f23ac7a9fd3` / **Aleksei Romanov** |
| `cycle_id` | `6a7ff9544f02ce8035b75d5a` (the `game_number: 7` document) |
| `status` | `draft` |
| created (from the `_id` timestamp; the document has no `created_at`) | **2026-08-17T00:27:45Z**, i.e. two days *after* Game 7 was played on 2026-08-15 |
| `responses` | fully populated: travel, `rp_shoutout`, `feeding_territories` + feed method/discipline/blood types + feeding description, `personal_story_npc_name`/`_text`, a safe-place location, **five** `game_recount_N` entries with mechanical flags, and a complete `project_1_*` block (action, pool attr/skill/disc/spec, outcome, description, title, territory, XP, XP trait, investigate lead, cast, merits), plus `_has_minimum: true` |

**Verdict: a genuine player filing, not test residue.** It is nothing like the 12 excluded ones,
which are contentless drafts on two specific characters (Livia, Yusuf) with dangling or absent
references. It is a real, content-complete post-Game-7 downtime, filed within 48 hours of the game,
whose five game recounts describe a game that had just been played.

**Branch taken: the story's own stated recommended default — leave it exactly where it is.** The
migration does not touch the highest-`game_number` chapter as a source, so this submission stays on
the `game_number: 7` document and Chapter 7 comes out of the migration holding **33** submissions:
the 32 arriving from Chapter 6 plus this one. The plan asserts that explicitly
(`expectedCounts[chapter7] === 32 + 1`) rather than leaving it to fall out, and a test drives it.

**FLAGGED FOR ANGELUS, deliberately left open.** Under the corrected model this downtime is the
groundwork for **Game 8** (2026-09-19), whose chapter document does not exist yet. So post-migration
Chapter 7 holds 32 submissions that genuinely belong to it and one that belongs to a future Chapter
8. Three options, none of them taken here:

1. **Leave it** (what shipped). Simplest, loses nothing, but Chapter 7's downtime set is 1 out.
2. **Create the Chapter 8 document first** and let this submission move to it, so the renumber's
   +1 shift covers `game_number` 1..7 rather than 1..6. Clean, but creates a chapter for a game not
   yet played, and §6a is explicit that nobody hand-edits live cycle documents around this migration.
3. **Re-point it by hand after Chapter 8 is created** in the ordinary course of game prep. Probably
   the least surprising, and costs one `updateOne`.

Recommendation if asked: option 3, as an ordinary ST action when Chapter 8 is opened, not as part of
this migration. But this needs Angelus's ruling, and nothing in the shipped code assumes one.

#### Open Question 2 — burn-in timing

Proceeded on the story's own recommended answer (no separate burn-in; run any time in the five-week
runway). Nothing in this pass depends on it, since `--apply` is not run here regardless. The
practical gate is not the calendar, it is `cm-2b --apply` (Task 1).

#### The design, and the two `cm-2b` review bugs deliberately not repeated

- **Equality is BSON-aware by construction, not by care.** `canonicalJSON` is **imported** from
  `cm-2b-downtime-cycles-to-chapters.mjs` — the review-corrected version with the `_bsontype`
  branch — rather than copied, so the "every ObjectId serialises to `{}`" bug cannot be re-acquired
  by drift. `chapterIdentity` runs the whole identity subset (including `story_cycle_id`) through
  it. Tests assert two different ObjectId-valued `story_cycle_id`s compare **unequal**, and that an
  ObjectId compares unequal to its own string form.
- **FK comparison is dual-type throughout** (`sameRef`), because issue #497's mixed
  ObjectId/string split is still live. Every read filter is `{$in: [ObjectId, string]}`, and the
  write **preserves the storage type it found** (`refType`/`encodeRefAs`) so the migration is a
  pure re-pointing and never a silent type promotion. Fixtures exercise both (chapter 1's
  submissions are string-typed, mirroring DT1).
- **The phantom-document guard, in this migration's own shape.** `cm-2b`'s was "a target document
  with no source counterpart". Here that becomes four guards that between them make a phantom
  unreachable: a chapter created out of band either duplicates a `game_number`
  (`duplicate-game-number`), lacks one (`no-game-number`), is Story-grouping shaped
  (`source-shape`, reusing `cm-2b`'s corrected positive `isStoryGroupingShaped`), or opens a hole in
  the sequence (`sequence-gap` / `sequence-start`). `uncovered-chapter` then asserts out loud that
  every chapter document is a source, a destination or the placeholder. Each of the six is proven
  to **fire** by its own test, not merely present.
- **Idempotency needed a marker, unlike `cm-2`/`cm-2b`.** Those are copy-based, so a re-run is a
  natural no-op. This one is a *shift*: re-planning from the shifted state would move the same
  submissions a second time (the compounding hazard `cm-7-drill-migration.mjs` documents and
  accepts for throwaway drill tooling — not acceptable here). `--apply` therefore stamps every
  chapter with `cm4_renumbered_at`, **last**, after everything else succeeded. All stamped means
  "already applied, nothing to do"; *some* stamped is a `partial-apply` refusal, because a run that
  died half way must not look finished.
- **The plan file is written BEFORE any write**, not after. An `--apply` that dies part way, or one
  whose verify comes back red, is exactly when the inverse is needed most.
- **`verifyRenumber` is scoped to the plan's own snapshot**, per `cm-2b`'s review finding that an
  unscoped live re-count turns a player pressing Save mid-`--apply` into a false "Verification
  FAILED" alarm.

#### AC3 — an honest reading, flagged

AC3 asks that `runFactMapCheck` be "told which facts are expected to move ... not just run in
'nothing changed' mode". Working through `cm-7`'s `COVERAGE_SET` item by item, **this migration
moves none of its facts**: the coverage set tracks chapter identity/ordering and the
`game_sessions` correspondence, while `cm-4` writes `downtime_submissions.chapter_id`, two new
fields on one chapter document, and one new field on seven sessions. `cycle-model.md` §6 states
that invariant positively ("any game number that shifts is a defect the harness must catch, not a
permitted outcome"), so an **empty** expected-diff set is the correct gate, not a weak one.

Rather than paper over that, both halves of AC3's actual concern are implemented:

1. `runGatedFactMapCheck` wraps the **imported** `runFactMapCheck` with an enumerated allowlist that
   **fails on a declared expectation that did not occur** — so an allowlist can never rot into a
   silent pass. `EXPECTED_FACT_DIFFS` is empty *with a documented reason*, and the mechanism is
   exercised for real by three tests using a deliberately non-empty set (declared-and-occurring →
   tolerated; declared-and-absent → red; undeclared → red).
2. `buildAttachmentMap` / `runAttachmentCheck` gate the facts that genuinely **do** move, against
   the plan's own enumerated prediction rather than against "did anything change" — falsifiable the
   same way (throws on a zero-comparison pre-image), and proven red on four independent corruptions.

**Flagged for review:** this is a considered deviation from AC3's literal wording, not an oversight.
If the intent was that `buildFactMap` itself be extended to cover submission attachment, that is a
change to `cm-7`'s harness and should be its own story.

#### CM-6 (AC4)

`GAME_SESSION_PAIRINGS` is a literal seven-row table in the script with the evidence cited per row
(the session's own date and self-description against the chapter's own label and `loaded_at`).
Rows 5 and 7 carry evidence genuinely independent of `game_number`: chapter 5 was loaded
2026-06-21T01:02Z, the morning after the 2026-06-20 game; chapter 7 and session 7 were created 28
minutes apart on the day of Game 7. Every row is **re-verified against the database at plan time**
(session `game_number` + `session_date`, chapter `game_number` + `label`) and refuses on drift, so
the table is auditable rather than merely asserted. Duplicate-chapter rows, half-present rows,
conflicting pre-set pairings, duplicate session `game_number`s and unpaired orphan sessions each
have their own outcome, and each is tested.

The index is `{chapter_id: 1}`, `unique`, `partialFilterExpression: {chapter_id: {$type:
['objectId','string']}}`. `$type` rather than the intuitive `$ne: null` because MongoDB rejects
`$ne` in a partial filter, and `$exists: true` would include explicit nulls, which would then
collide with each other. Both storage types are listed for #497; `verifyRenumber` warns on any
string-typed value, and the migration only ever writes an ObjectId. Created at boot in
`server/index.js` alongside the three existing partial unique indexes, so a fresh deploy has it
whether or not the script has run.

#### The RED phase, and the three real bugs it found

The first full run was **75 passed / 4 failed**, and every failure was a genuine defect:

1. **Dangling references counted as phantom chapters** (2 failures, in `runAttachmentCheck` and
   `verifyRenumber` independently). Four of the twelve excluded submissions point at ObjectIds that
   are not chapters, so both count-checks reported "chapter X unexpectedly holds 1 submission" on
   every single run — permanent noise in a migration gate, which is how a real signal gets talked
   past. Both now count from the submission side with the excluded ids removed.
2. **`--json` output was not actually machine-diffable.** `server/db.js` prints "MongoDB connected
   successfully" and "MongoDB connection closed" on stdout around every run, so
   `--json > before.json` produced a file that is not valid JSON. Fixed with `--json --out <file>`
   (the report and nothing else) plus sentinel markers for the piped case; the runbook uses `--out`.
3. **A stale expectation of my own** on the session picker label, which correctly includes the
   session `title` for games 1-3.

#### Test results

Final run, `cd server && npx vitest run <suites>`. **20 suites, 558 passed, 0 failed, 0 skipped.**

| Suite(s) | Result |
|---|---|
| `cm-4-renumber-chapter-merge.test.js` (new) + `cm-7-fact-map-harness` + `cm-3-derived-maintenance` + `cm-3-final-chapter-guard` + `cm-2b-downtime-cycles-to-chapters` + `cm-2b-chapters-route-and-dual-read` + `api-story-cycles` + `api-game-sessions` + `api-game-sessions-delete` + `api-game-sessions-next` + `api-downtime-story-moment` + `cm-2-chapters-to-story-cycles` + `cm-2b-importer-legacy-fk-shaping` + `epic.708.1-cycle-schema-api` + `cm-4a-importer-phase-strip` + `cm-4a-phase-transition-enforcement` (16 files, one run) | **497 passed / 0 failed / 0 skipped** |
| `epic.708.6-attendance-xp-absorption` + `fix.821.game-xp-attendance-id-match` + `tickets-removed` + `issue-1143-office-actions-auth-safety` (the remaining suites importing `index.js` or `gameSessionSchema`) | **61 passed / 0 failed / 0 skipped** |

The new suite alone is **81 tests**. Its own earlier standalone runs: 75/4 (the RED phase above),
then 80/0, then 81/0 after the in-`applyRenumber` gate wiring and its saboteur test were added.

**No suite skipped.** `tm_suite_test` was reachable throughout, so CLAUDE.md's "a skipped suite is
not a passing suite" hazard (#1117) did not apply — the summary lines were read, not just the exit
codes. No live `tm_suite` write in any test: `setup-env.js`'s hard `MONGODB_DB=tm_suite_test`
override plus `db-setup.js`'s `_test`-suffix re-check, and every fixture is scoped to
`_cm4_fixture: true` through the script's own filter options and torn down in `beforeEach`/`afterAll`.

`downtime-story.test.js` does not exist; `api-downtime-story-moment.test.js` is the
continuity-lookup consumer suite and was run in its place.

---

### Task 11 — the review rework, 2026-08-17

Everything above this line is the **first pass's** record and is left intact. What follows is the
rework against the three-layer review's own findings, item by item in the review's severity order.
Every finding got at least one test written to go **red against the code as it stood and green
after** — not "the existing suite still passes".

#### The five CRITICALs

1. **The idempotency stamp is now progressive, and an interrupted run is detectable.** The single
   bulk `updateMany` at the end is gone. Two markers now:
   - `cm4_renumber_started_at` (`IN_PROGRESS_FIELD`) is written to every plan chapter as the
     **first** write of the run, before a single submission moves. `planRenumber` refuses
     (`interrupted-apply`) on finding it. This is what closes the residual hole a purely progressive
     stamp still leaves: a crash before the *first* source chapter's moves complete.
   - `cm4_renumbered_at` (`MARKER_FIELD`) is stamped **per source chapter, as that chapter's own
     moves land** (the moves loop is grouped by source, descending `game_number`, and `stampChapter`
     runs at the end of each group). A crash therefore leaves an accurate partial stamp set, which
     is what `partial-apply` was always meant to read.
   - The in-progress marker is cleared **only when the writes, both gates and `verifyRenumber` have
     all come back green**. That also closes the separate MEDIUM finding about post-stamp gate
     failures being invisible: a red verify now leaves the run visibly unfinished.
   - The abort message was rewritten. It no longer says "the stamp is written LAST ... so the next
     plan will refuse"; a test asserts that phrase is *absent* and that the true description is
     present.
   Tests: five, including one that lets exactly Chapter 6's four moves through and then throws
   (asserting `stamped === [6]`, where the old code left `[]`), one that throws before any move at
   all, and one that drives a red verification and then asserts the **next** plan refuses.

2. **The plan file is never silently clobbered.** The check moved to the very top of `main()`,
   before the database is opened at all — it is a pure filesystem precondition of a forward
   `--apply`. An existing plan file refuses with a named reason and exit code 1; `--overwrite-plan`
   is the explicit override. Three tests, including one asserting the refusal fires before the
   `Mode :` banner (i.e. before anything connected).

3. **An empty or fully-excluded `chapters` collection refuses.** New Guard 0b (`no-chapters`),
   evaluated immediately after the chapter fetch and returning early, so none of the
   short-circuiting the finding described can happen. The mis-named test was **split in two**: one
   test now genuinely drives the missing-collection branch (through a `db` facade whose
   `listCollections` does not report `chapters` — `tm_suite_test` is shared, so dropping the real
   collection was never an option), and a separate one asserts the non-refusal path it used to
   assert under the wrong name.

4. **The six derived downtime fields are recomputed** (`DERIVED_DOWNTIME_FIELDS`), on every chapter
   in the shift sequence, as part of `applyRenumber`'s own write, per Angelus's ruling. Planned
   purely by `planDerivedDowntimeFields`, verified by `verifyRenumber`, restored exactly by
   `--invert` (every pre-value is recorded in `plan.derived[].pre`, with an explicit `preAbsent`
   list so JSON can round-trip "the key was not there").
   - `submission_count` is genuinely **recomputed** from the plan's own `expectedCounts`, which
     `verifyRenumber` and `runAttachmentCheck` then independently assert against the real database.
     A test cross-checks it against a live per-chapter re-count, not just against the plan.
   - The other five **travel one hop**, from `game_number n-1` to `n`, exactly as the submissions
     do. That is the correct recomputation for them, and the reasoning is stated in the script's
     header: each is a property of the *downtime* (which disciplines were fed with, which ambience
     was confirmed and whether it was applied, who filed out of window, whether the regents
     confirmed feeding rights), and this migration's whole content is that the downtime moves +1.
     Chapter 1 has no predecessor, so its five are unset — after the migration it is the placeholder
     and holds no downtime at all.
   - **Deliberate deviation, flagged for Angelus.** `discipline_profile` is *not* re-derived from
     submission bodies. It is built client-side in `public/js/admin/downtime-views.js`; a second
     implementation of that inside a migration script is precisely the class of bug this epic's
     reviews keep finding. Travelling it is exact and invertible; re-deriving it would be neither.
   - **Second flag, deliberately not acted on.** `regent_confirmations` is the input
     `feeding_rights_confirmed` is computed from (`server/routes/chapters.js`), and it is outside
     the six the ruling enumerated, so it stays put. Rather than leave that inconsistency silent,
     `planRenumber` records `derivedUnmovedNotes` and `applyRenumber` logs a `NOTE` naming every
     affected chapter. **This wants a ruling before `--apply`**: either add it to the travelling set
     or accept that the two describe different downtimes.

5. **`game_sessions.chapter_id` is coerced to one canonical stored type, server-side, on every
   write path.** New exported `coerceChapterId` in `server/routes/game-sessions.js`, applied on both
   `POST /` and `PUT /:id` (the blind `$set: body` is now preceded by a normalise step): a 24-hex
   string becomes a real `ObjectId`, an `ObjectId` stays one, `null` stays null, anything else is a
   400. The schema gained the 24-hex `pattern` as belt and braces. A route-level test reproduces
   exactly what `attendance.js` and `signin-tab.js` do — GET the whole document, change one
   unrelated field, PUT it back — and asserts the stored value is still an `ObjectId`; before the
   fix it was a string, which the partial index treats as a different key. E11000 on either verb now
   surfaces as a **409 `CHAPTER_ALREADY_PAIRED`**, not a 500.

#### The five HIGHs

6. **A partially-copied `chapters` collection now refuses.** `EXPECTED_EXCLUSIONS` declares the
   characterised set: the four dangling reference values by name, plus ceilings of 4/4/4. Anything
   larger, or a dangling reference outside the declared four, is an `unexpected-exclusion` refusal.
   The finding's exact scenario (chapters 1-4 only — dense, gap-free, duplicate-free, every other
   guard green) has its own test asserting the refusal **and** that nothing is written. The suite
   overrides `danglingRefs: null` (ceilings only) because its fixtures mint fresh ObjectIds; the
   identity half is exercised separately against the real constant.

7. **`--invert` refuses a stale or wrong plan.** If the plan describes moves and **none** of them
   reverted, `invertRenumber` stops before touching the placeholder, the pairings, the index or
   either marker, and says why. `--force` is the explicit override. Tests cover both branches and
   assert the database is left correctly migrated (`alreadyApplied` still true) after the refusal.

8. **An orphan session already holding a chapter reference is caught at plan time.**
   `planGameSessionPairing` now builds `chapterClaimedBySession` over **all** live sessions, so a
   session with no pairing row that already claims a chapter the table pairs is a
   `pairing-chapter-claimed` refusal — before any write, rather than an E11000 thrown from
   `ensureSessionChapterIndex` after the moves had landed.

9. **The attachment gate is type-aware.** `buildAttachmentMap` now keys `bySubmission` through the
   imported `canonicalJSON` (cm-2b's review-corrected version), and `runAttachmentCheck` compares
   against the move's own recorded `toValue` through the same encoding. A second map, `chapterOf`,
   keeps the plain string form for the per-chapter **counts**, where an ObjectId FK and a string FK
   genuinely must group as one chapter — two maps for two different questions. The red test promotes
   a moved DT1 submission's FK from a string to an `ObjectId` of the *same* chapter; the old
   `String(ref)` comparison could not see it.

10. **`chapters.session_id` is reconciled.** Every pairing row is cross-referenced against the
    chapter's own reverse link. A disagreement is a `pairing-session-id-disagreement` refusal
    ("an ST has to say which is right"); an agreement upgrades the row's `confidence`. Tests for
    both directions.

#### The MEDIUM/LOW batch

11. Boot-time `createIndex` on `game_sessions` is **awaited**, in a nested try/catch so a live
    duplicate is logged loudly as an index failure rather than escaping as an unhandled rejection
    (which can boot-loop Render) *or* taking `runRulesEngineGate()` down with it. `POST` and `PUT`
    both map 11000 to a 409.
12. `--apply --json` is **refused outright with a named reason** (the sanctioned alternative in the
    finding), in the new pure, exported, DB-free `parseArgs`.
13. Guard 3 requires `Number.isInteger`. A chapter at `game_number: 6.5` now refuses instead of
    quietly keeping its submissions while everything else shifts.
14. **The Chapter-1 placeholder has a real consumer.** The admin Downtime list
    (`public/js/admin/downtime-views.js`, the same render site that shows `submission_count`) now
    renders `placeholder_note` when present, reusing the existing `domain-count` class — no new
    component class, no bare hex, no inline style. A test asserts the consumer exists rather than
    letting the note's text be the only thing verified. Wider placeholder surfacing (the archive
    tab) is **explicitly scoped to a follow-up**, not silently implied.
15. Post-stamp gate failures — closed by item 1's in-progress marker.
16. AC3's text is **amended in place** (see the AC), describing the dual-gate design that was
    correctly built rather than the allowlist framing that no longer matched it.
17. The LOW cluster, all thirteen: schema `pattern`; `refType` accepting both `_bsontype` spellings
    (`'ObjectId'` and `'ObjectID'`) rather than only the dead pre-bson-5 one; the coverage-set item-8
    test rewritten to genuinely cross-check `COVERAGE_SET`/`NOT_A_FACT`; the mis-named
    missing-collection test split in two; a **real-numbers fixture** (25/29/29/29/27/32/1 → Chapter 7
    holding 33, asserted through a live count and through `submission_count`); pairing rows carrying
    an explicit `confidence`, with the weak four declared `needs-st-eyes`, upgradeable only by the
    independent `session_id` corroboration, surfaced as a `pairingConfidence` block in the report and
    printed loudly by `main()` before `--apply`; `invertRenumber`'s ordering comment corrected to
    ASCENDING; index create/verify unified behind one exported `shouldEnsureSessionIndex` predicate;
    `--out`/`--plan-file`/`--target` validated for a following value; the placeholder revert scoped to
    the value it wrote; `placeholderApplied` true on an idempotent re-run (with
    `placeholderAlreadyPresent` distinguishing the two, and the totals line reading "already in
    place"); `runGatedFactMapCheck` **throwing** on a `/g`- or `/y`-flagged allowlist pattern rather
    than resetting `lastIndex` and hoping; and `--apply` against any non-`_test` database now
    requiring `--target <db name>` spelled out.

#### Task 11 test results

`cd server && npx vitest run <suites>`. **24 suites, 706 passed, 0 failed, 0 skipped.**

| Suite(s) | Result |
|---|---|
| `cm-4-renumber-chapter-merge.test.js` (rewritten/extended, now **136 tests**, up from 81) | **136 passed / 0 failed / 0 skipped** |
| `cm-7-fact-map-harness` + `cm-3-derived-maintenance` + `cm-3-final-chapter-guard` + `cm-2b-downtime-cycles-to-chapters` + `cm-2b-chapters-route-and-dual-read` + `api-story-cycles` + `api-game-sessions` + `api-game-sessions-delete` + `api-game-sessions-next` + `api-downtime-story-moment` + `cm-2-chapters-to-story-cycles` + `cm-2b-importer-legacy-fk-shaping` + `epic.708.1-cycle-schema-api` + `cm-4a-importer-phase-strip` + `cm-4a-phase-transition-enforcement` (15 files) | **416 passed / 0 failed / 0 skipped** |
| `api-fin-coordinator` + `api-publish-cycle` + `epic.708.6-attendance-xp-absorption` + `feature.691.hos-city-status-power` + `fix.821.game-xp-attendance-id-match` + `issue-1143-office-actions-auth-safety` + `oxp-3-office-manoeuvre-rank` + `tickets-removed` (every remaining suite importing `index.js`, `gameSessionSchema` or the attendance path) | **154 passed / 0 failed / 0 skipped** |

No suite skipped; `tm_suite_test` was reachable throughout and the summary lines were read, not just
the exit codes (CLAUDE.md #1117). No live `tm_suite` write in any test, and `--apply` was not run
against live `tm_suite`. `public/js/admin/downtime-views.js`, `server/routes/game-sessions.js` and
`server/index.js` all parse-check clean (`node --check`), which is what `.githooks`' staged-JS gate
runs.

#### Open items Task 11 raises

1. **`regent_confirmations`** — see CRITICAL 4 above. Flagged, logged per chapter at run time,
   deliberately not moved. Needs Angelus's ruling before `--apply`.
2. **Four pairing rows are declared `needs-st-eyes`** (sessions at `game_number` 1, 2, 3 and 6).
   `main()` prints them before `--apply`. They upgrade automatically if the corresponding chapter's
   `session_id` is set in the Cycle tab — which is the cheapest way to close them, and is an ordinary
   ST action rather than a code change.
3. **Wider placeholder surfacing** (the archive tab) is scoped to a follow-up story, per finding 14.

#### What was NOT done

- **`--apply` was not run against live `tm_suite`.** Story scope, and blocked behind `cm-2b` anyway.
- **No commit, no push, no PR** (Task 10) — awaiting Angelus's explicit word, per CLAUDE.md.
- The `game_number=7` document's stale `status: 'prep'` / `phase: null` is **flagged, not fixed** —
  an ordinary ST admin action, explicitly out of scope.

### File List

**New**
- `server/scripts/cm-4-renumber-chapter-merge.mjs` — the migration, its paired `--invert`, the
  attachment-map gate, the fact-map allowlist wrapper, and CM-6's pairing table. **Task 11** added
  the two-marker idempotency scheme, Guard 0b (`no-chapters`), the exclusion characterisation guard,
  `planDerivedDowntimeFields`, the `session_id` reconciliation and pairing `confidence`, the
  all-sessions pairing-conflict check, `shouldEnsureSessionIndex`, `parseArgs`, and the
  stale-plan `--invert` refusal.
- `server/tests/cm-4-renumber-chapter-merge.test.js` — **136 tests** (81 from the first pass, 55
  added by Task 11's red-then-green pass over the review findings).

**Modified**
- `server/schemas/game_session.schema.js` — declares `chapter_id` (CM-6); Task 11 added the 24-hex
  `pattern`.
- `server/index.js` — boot-time partial unique index `chapter_id_unique_notnull` on
  `game_sessions.chapter_id`; Task 11 made the build `await`ed inside its own try/catch.
- `server/routes/game-sessions.js` — **Task 11**: `coerceChapterId` (exported), applied on `POST /`
  and `PUT /:id` so an ordinary whole-document round-trip can no longer demote `chapter_id` to its
  string form and defeat the partial unique index; 11000 → 409 `CHAPTER_ALREADY_PAIRED` on both.
- `public/js/admin/downtime-views.js` — **Task 11**: the Chapter-1 placeholder's first real
  consumer. The admin Downtime list renders `placeholder_note` beside the submission count when
  `placeholder` is set, reusing the existing `domain-count` class.
- `specs/reference-data-ssot.md` — documents the session ↔ chapter link, its index, and the
  standing "never infer the pairing from `game_number`" rule.
- `specs/stories/sprint-status.yaml` — `cm-4` ready-for-dev → review; `cm-6` backlog → review
  (folded in); `last_updated` records both Task 1 and Task 2 findings.
- `specs/stories/cm-4-renumber-chapter-merge.md` — this record.
- `D:\Terra Mortis\cycle-model.md` (umbrella root, outside this repo) — §11a "Status as of
  2026-08-17" note (Task 9).

### Change Log

| Date | Change |
|---|---|
| 2026-08-17 | Implemented cm-4 (with CM-6 folded in) per `bmad-dev-story`. Tasks 1-9 complete, Task 10 (PR) deliberately not done. Status ready-for-dev → review. Two findings raised for Angelus: `cm-2b --apply` has not landed live, and the Chapter-7 stray submission is a genuine post-Game-7 filing that semantically belongs to a not-yet-existing Chapter 8. |
| 2026-08-17 | **Task 11 — the review rework.** All 17 Review Findings addressed, each with a red-then-green test. Headline changes: the idempotency stamp is progressive plus an in-progress marker cleared only on a fully green run; the plan file can no longer be clobbered; an empty `chapters` collection refuses; the six derived downtime fields are recomputed on every chapter a move touches; `game_sessions.chapter_id` is coerced server-side on every write path so the partial unique index actually enforces 1:1. Suite grew 81 → 136 tests; 24 suites, 706 passed, 0 failed, 0 skipped. Status in-progress → review. Three items left open for Angelus: `regent_confirmations` (not moved, flagged and logged), the four `needs-st-eyes` pairing rows, and the archive-tab placeholder surfacing scoped to a follow-up. |
| 2026-08-17 | **Post-rework verification.** Read the progressive-stamping mechanism directly in `server/scripts/cm-4-renumber-chapter-merge.mjs` rather than trusting the rework report alone: `IN_PROGRESS_FIELD` (`cm4_renumber_started_at`) is written first, `MARKER_FIELD` (`cm4_renumbered_at`) is stamped per source chapter as that chapter's own moves land, and the in-progress marker clears only after writes, both gates, and `verifyRenumber` all come back green — matching the design exactly. This was the single most consequential finding from review; it's fixed correctly. Status review → done. Not committed, not pushed, no PR, no `--apply` — `cm-4`'s own `--apply` remains blocked behind `cm-2b`'s, which remains blocked behind TM Cockpit coordination. |
