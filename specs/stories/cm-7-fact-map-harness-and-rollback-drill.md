# Story cm-7: Fact-map verification harness and drilled rollback

Status: done

> **Ruling documents: `D:\Terra Mortis\cycle-model.md` §6 ("Hard preconditions"), precondition 2
> (the harness) and precondition 4 (the drilled inverse), extending GitHub issue #1031
> ("feat(cycle): fact-by-fact verification harness gating the renumber (CM-5)", open, unassigned —
> originally "logged for Peter to pick up"; Peter has stepped back from TM Suite dev, see
> `CLAUDE.md`). Also §8 ("Seam assertions" — fact-map equality gates the renumber) and §9
> ("Rollback ... required, not optional" — the inverse is the primary rollback mechanism, a
> snapshot restore is the last resort only because it would eat live post-migration writes).**
> Epic-internal story, tracked in `specs/stories/sprint-status.yaml` under `epic-cm`.
>
> **Sequence position: the one unblocked item in the remaining CM work.** Per §11a's revised
> roadmap (step 8) and the 2026-08-16 session's own sprint-status header, cm-2b and CM-4 proper are
> both blocked (cm-2b on the scheduled burn-in, ~2026-09-12, and on confirming TM Wiki's
> `downtime_cycles` coupling; CM-4 on cm-2b landing first). This story has neither dependency — the
> roadmap table's own row 3 marks it "Tooling, read-only" precisely because it proves a mechanism
> against `tm_suite_test` fixtures, not against the live `chapters` → `story_cycles` (or eventual
> `downtime_cycles` → `chapters`) rename itself.
>
> **Branch from `main`, PR direct to `main`** (project branching convention). Cut a **fresh** branch
> off up-to-date `main` before dev starts — the current session branch,
> `ms/cm-4-step1-verification-note`, already carries unrelated documentation-only commits and should
> not accumulate this story's code on top of them. Read-only against live `tm_suite`: this story's
> own tests and drills run against `tm_suite_test` / local fixtures only, per its own AC10. No
> deploy dependency — this is pure Node tooling with no client-facing surface, so nothing here needs
> `main` to smoke-test it (unlike CM-4a, which needed the deployed API).

## Story

As the Storyteller (and as CM-4, the story that cannot start without this one),
I want a fact-map verification harness that is provably able to fail, paired with a rollback/inverse
mechanism that has actually been exercised against real interleaved post-migration writes,
so that when the historical `game_number` renumber eventually runs, there is a mechanical gate
proving nothing a player or ST can see changed except the anchor itself, and a proven way back if
something does.

## Why this story exists

Issue #1031 states the requirement plainly: "no destructive migration without a fact-map equality
gate," and names the two things that must exist before CM-4 is even allowed to be written, let alone
run: (1) a harness that proves, fact by fact, that a renumber changed presentation anchors and
nothing else, and (2) a paired inverse, tested first, against the scenario it exists for — not a
quiet no-op round trip.

Both are currently **nothing**. No file, script, or test in this repository matches `1031`,
`fact_map`, `fact-map`, or `fact map` (confirmed by repo-wide grep, 2026-08-16). The issue itself
records it was "logged for Peter to pick up" — Peter stepped back from TM Suite dev on 2026-08-09
(`CLAUDE.md`), so this precondition has had no owner since before Game 7.

§6 lists five hard preconditions for CM-4. As of `cm-4-renumber-chapter-merge`'s own 2026-08-16
step-1 verification (`sprint-status.yaml`), precondition 1 (reference hygiene) is **done** — the 12
dangling/null/undefined `cycle_id` refs are fully characterised and confirmed non-production
artifacts, no repair needed. Precondition 5 (the Chapter-1 placeholder spec) needs the enumerated
lookup-query list this story's own coverage-set work will produce as an input, but the placeholder
design itself belongs to CM-4. Precondition 3 (migration discipline: dry-run-diff-first, idempotent,
a `main()`-driving test, machine-diffed dry-run output, a drilled backup) is the operational
discipline CM-4's *real* script must follow when it is written — this story's own drill vehicle
follows the same discipline as a proof of the pattern, but does not itself satisfy precondition 3 for
CM-4, because CM-4's script does not exist yet.

That leaves preconditions 2 and 4 — the harness and the inverse — as the one piece of #1031 that is
both fully specified today and has zero dependency on cm-2b or CM-4 landing. §11a step 8 goes
further and says to build them now, reusing what CM-6's eventual FK consistency check would assert
(every `game_sessions.game_number` matches its linked cycle's `game_number`) as the harness's first
real coverage piece — a check this story can write today by direct query join, without CM-6's FK
field or unique index existing yet (see AC2, item 7).

## What this story is NOT

- **NOT CM-4 itself.** This story does not renumber anything, does not touch live `tm_suite`, and
  does not decide the renumber's exact document-shape output. It proves the harness can detect a
  divergence and the inverse can undo one, using a representative drill migration built for that
  purpose alone.
- **NOT CM-6** (the `game_sessions.chapter_id` FK + partial unique index). AC2 item 7's consistency
  check reads the existing `game_sessions.game_number` / cycle `game_number` correspondence by query
  join; it does not require CM-6's FK field, its index, or its backfill to exist.
- **NOT reference-hygiene repair** (§6 precondition 1). Already done — see `cm-4-renumber-chapter-merge`'s
  2026-08-16 step-1 verification. This story's pre-image snapshot logic assumes clean references, per
  precondition 2's own instruction that the snapshot is taken *after* the orphan repairs.
- **NOT the Chapter-1 placeholder spec** (§6 precondition 5). That belongs to CM-4, which will
  consume this story's enumerated lookup-query list (AC2) as an input.
- **NOT a live migration run of any kind.** Every script this story adds is dry-run-default and is
  never invoked with `--apply` against live `tm_suite`, matching this project's standing convention
  (DBO-1/DBO-4/DBO-8's own migration scripts, `cm-2-chapters-to-story-cycles.mjs`'s own precedent).
  See AC10.
- **NOT a fix for `public/js/data/game-xp.js:55`'s dead `session_number` field** (found during this
  story's own coverage-set research, AC2 item 8). It is read but never written anywhere in this
  codebase — the schema has no `session_number` field at all, only `game_number` — so the XP
  breakdown panel's per-game title is always `Game ?` unless the session has an explicit `.title`.
  This is a **pre-existing, independent bug**, not something the renumber can make worse (a field
  that already never matches cannot "diverge" further), and not part of this story's scope to fix.
  Flagged to `deferred-work.md` (see Tasks) as its own item, worth a one-line follow-up (`s.game_number`
  in place of `s.session_number`) whenever anyone is next in that file.
- **NOT TM Wiki coverage.** Confirmed anchor-neutral per cycle-model.md §10: TM Wiki's archive orders
  by timestamp, ships an opaque `cycle_id`, and never computes a game number — "it needs no
  migration," and the honesty rule (phrase by what it is, never compute it) already holds there. The
  coverage set (AC2) is TM-Suite-internal only; there is nothing on the Wiki side for a TM-Suite fact
  map to gate.
- **NOT a change to any live application code.** Every file this story adds lives under
  `server/scripts/` and `server/tests/`. No route, no client module, no schema is modified.

## Acceptance Criteria

1. **The pre-image/post-image fact-map builder exists as a pure, exported function.**
   `server/scripts/cm-7-fact-map.mjs` exports `buildFactMap(db)`, which reads (read-only, no writes)
   `downtime_cycles` and `game_sessions`, and returns one structured map containing exactly the
   fields enumerated in AC2 — no more, no less, so the map's own shape is the single source of
   truth for what "a fact a human can see" means in this codebase, not a recalled list. **Corrected
   twice during dev-story** (see Dev Agent Record): the original draft of this AC named `chapters`
   AND `downtime_submissions` as collections to read, but none of AC2's eight coverage items
   reference either one — `chapters`/`story_cycles` is Story-grouping, a different fact from the
   ones #1031 and cycle-model.md §8 name, and the DT form's attendance-gate coupling (item 7) is
   entirely a `downtime_cycles`/`game_sessions` correspondence with no `downtime_submissions` read
   of its own. (`downtime_submissions` IS written by the AC7 interleaved-write drill's own test
   fixture, to prove a feed roll survives the inverse — but that is the test's fixture, not
   something `buildFactMap` itself reads.) Task 1's own dev-story pass removed `chapters` but missed
   `downtime_submissions`; caught by this story's own code review and corrected here. Mirrors the
   pure/impure split `cm-2-chapters-to-story-cycles.mjs`'s `planRename` already establishes
   (planning function takes a `db` handle, does no writes, is directly unit-testable without mocking
   the driver).

2. **The coverage set is enumerated, not recalled — the exact list below, each verified against the
   working tree at the commit this story starts from and re-verified before any commit message cites
   a line number** (this repo's own documented hazard: a source-contract regex has previously
   false-passed against a drifted line — cm-4a Dev Notes). `buildFactMap` must cover all eight:
   1. **Cycle self-identity** — `game_number`, `label`, `phase`/`game_phase`/`status` (the fields
      the legacy-mirror rule, cycle-model.md §7, keeps synchronised) for every `downtime_cycles`
      document.
   2. **Archive ordering** — `public/js/tabs/archive-tab.js:71-73`, `cycleOrderMap` keys the
      player-facing archive's display order on `c.game_number ?? c.cycle_number ?? c.created_at ?? c._id`.
      The fact map must assert `game_number` is present (not falling through to the `created_at`/`_id`
      fallback) for every real cycle, and that the archive's resulting order is unchanged.
   3. **Story tab outcome ordering** — `public/js/tabs/story-tab.js:58-62` and `:188-192`, both sort a
      character's published outcomes by `cycleMap[cycle_id]?.game_number` descending. Same assertion
      shape as item 2, different consumer.
   4. **Cross-cycle continuity in DT Story reports** — `public/js/admin/downtime-story.js:3869-3885`:
      `prevCycle = cycles.find(c => c.game_number === currentGameNum - 1)`, feeding the "Letter from
      Home" / "Touchstone Vignette" continuation logic. This is a genuine renumber hazard, not a
      display nicety: if a renumber ever produces a gap (a `game_number` with no cycle at
      `game_number - 1`), this silently drops prior-cycle narrative continuity with no error. The fact
      map must assert every `game_number` from 1..max has a predecessor at `game_number - 1` except
      `game_number === 1` (the seam assertion cycle-model.md §8 already names).
   5. **Office/session log labels** — `public/js/suite/status.js:275`,
      `session.title || (session.game_number ? 'Game ' + session.game_number : 'This session')`.
   6. **Admin Cycle tab + session picker labels** — `public/js/admin/cycle-views.js:490`
      (`'Game ' + s.game_number`); `public/js/admin/next-session.js:66-74` (`loadNext`, the ST-entered
      upcoming game number display) and `:92-98` (`saveNext`, the write body); and, on a **separate
      admin surface** (this repo has two independent "next game session" UIs — Corrected during
      dev-story Task 1, see Dev Agent Record: the original draft of this AC mis-attributed the next
      two citations to `next-session.js`, which is only 115 lines and cannot contain them),
      `public/js/game/signin-tab.js:83-88` (the documented `_id`-order trap workaround — "DT1 was
      re-imported with a newer `_id` than DT3"; **no script or test in this story may repeat that
      trap**, cycle-model.md §6's own "the trap that must not be reused" clause), `:155-166`
      (`handleNewSession`, the `maxNum + 1` auto-numbering that creates a new `game_sessions` doc),
      and `:222-230` (the session-picker `<select>` options, `Game ${s.game_number}` labels).
   7. **`game_sessions` ↔ cycle correspondence** — `server/routes/attendance.js:8-17`,
      `GET /api/attendance?game_number=N` looks up `game_sessions` by `game_number` to answer the DT
      form's attendance gate (`public/js/tabs/downtime-form.js:1538`,
      `currentCycle?.game_number` built into the query string). This is the correspondence CM-6's
      eventual FK formalises; per §11a step 8, this story's harness asserts it now by direct query
      join — every `downtime_cycles.game_number` has exactly one `game_sessions.game_number` equal to
      it, and vice versa — **without** requiring CM-6's FK field or unique index to exist. A renumber
      that moves `downtime_cycles.game_number` without moving the paired `game_sessions.game_number`
      breaks the DT form's attendance gate silently; this is exactly the class of defect the fact map
      exists to catch.
   8. **The XP breakdown title (recorded, deliberately excluded from the equality gate)** —
      `public/js/data/game-xp.js:55`, `title: s.title || 'Game ${s.session_number || '?'}'`. Confirmed
      by schema check (`server/schemas/game_session.schema.js` has no `session_number` field, only
      `game_number`) and by grep (no writer anywhere sets `session_number`) that this field is dead —
      the title falls through to `Game ?` on every session lacking an explicit `.title`, today,
      independent of any migration. Document this in the harness's own coverage-set comment as
      *known-broken, pre-existing, and out of the fact map's equality gate* — a field the harness
      inspected and found meaningless does not belong in a diff that is supposed to mean something. Do
      not silently omit it; state why it is excluded, the way `deferred-work.md`'s own entries do.

3. **The harness is falsifiable by construction.** `runFactMapCheck(pre, post)` (same module) asserts
   a minimum executed-comparison count against the pre-image's own size before evaluating any
   equality — a run that produces `0 failures` over `0` comparisons throws, it does not report
   success. The comparison count is derived from the pre-image itself — **as shipped:**
   `pre.cycles.length * (fields per cycle) + pre.sessions.length * (fields per session)`, keyed off
   the actual array lengths the fact map itself produces rather than `Object.keys(pre).length`
   (which would count top-level map KEYS like `cycles`/`sessions`/`archiveOrderIds`, a fixed number
   regardless of how many cycles or sessions exist, and would not actually scale with pre-image
   size the way this AC requires) — not a hardcoded constant, so a pre-image that silently returned
   0 cycles and 0 sessions cannot pass by having nothing to check. **Corrected during code review**
   (see Dev Agent Record): the original text literally specified the `Object.keys(pre).length`
   formula; the shipped, array-length-keyed version is what the falsifiability requirement actually
   needs and is what the code + its own tests implement.

4. **The harness is proven able to fail — mechanically, and the proof survives as a test.** A test
   seeds a known-good fixture pair, deliberately corrupts one field the coverage set watches (per AC2
   — e.g. mutates a post-image cycle's `game_number` so the DT-Story continuity seam in item 4
   breaks), and asserts `runFactMapCheck` returns red with a message naming the specific cycle and
   field that diverged. This is the harness's own §6-mandated self-test, run once per coverage-set
   item that has an independent failure mode (continuity gap, archive-order fallback, correspondence
   mismatch) — not one corruption proving the whole harness, since a harness that only proves it can
   catch *one* kind of divergence has not proven it catches the others.

5. **Human-readable diff report, non-zero exit on divergence.** `main()` (CLI entry point,
   `node scripts/cm-7-fact-map.mjs [--against <snapshot-file>]`) prints a per-cycle, per-field diff
   table for every divergence found and exits `1` if any exist, `0` if none — following
   `cm-2-chapters-to-story-cycles.mjs`'s own `main()`/dry-run-default/CLI-flag pattern, and satisfying
   the #826 post-mortem rule this project holds itself to (a script that reads from the DB must have a
   test that runs the script's actual `main()`, not just its internal functions).

6. **A representative drill migration and its exact deterministic inverse — real code, run only
   against `tm_suite_test`.** `server/scripts/cm-7-drill-migration.mjs` implements a renumber-shaped
   transformation on a small seeded fixture set (reassign `game_number` on a handful of test cycles,
   consistent with the class of change CM-4 will eventually make) plus its own `invertDrillMigration`
   that undoes it exactly. This is **not CM-4's real script** — it does not touch the Chapter-1
   placeholder, does not run against the real 7-cycle production shape, and is never registered
   anywhere as a candidate for the real renumber. Its only job is to give the inverse-drill in AC7 a
   real forward-then-back pair to exercise, per §9's requirement that the inverse be "tested on a copy
   before the forward ever touches live" and cycle-model.md's own insistence that a migration ships as
   a script *pair*, never a one-way door.

7. **The inverse is drilled against the real scenario it exists for, not a quiet round trip.** A test
   (§6 precondition 4, §9 item 3): seed fixtures → run the drill migration → **write real
   post-migration data** (one feeding-tab-shaped write — `feeding_roll_player` /
   `feeding_vitae_allocation` on a `downtime_submissions` fixture, the exact fields cycle-model.md §9
   item 2 names as surviving rollback under the legacy-mirror rule — and one spend-shaped write, e.g.
   a `tracker_state` field change) → run `invertDrillMigration` → assert **both** that the
   interleaved writes survive byte-for-byte **and** that `runFactMapCheck` reports the inverted state
   matches the original pre-image on every coverage-set field. A migrate→invert→diff that never
   interleaves a write in between does not satisfy this AC — §6 precondition 4 says so explicitly
   ("a quiet-copy migrate→invert→diff does not qualify").

8. **The backup drill is executed, not assumed.** A test (or a documented manual run, if genuinely
   impractical to automate against `tm_suite_test`'s own lifecycle — state which, and why, in the Dev
   Agent Record) takes a snapshot of the seeded fixture set, runs the drill migration, and restores
   from the snapshot, asserting the restored state matches the pre-migration fixture exactly. §6
   precondition 3's own justification is on record in this codebase: the July drill "found the
   standing backup 34 days stale — 'we have a backup' is verified, never asserted." This AC is that
   verification, scoped to the drill fixture rather than live `tm_suite` (which stays untouched, per
   this story's own read-only constraint).

9. **Coverage-set items are each exercised for real, not vacuously.** Every one of AC2's eight items
   has at least one fixture-driven test where the *specific* field or lookup that item names is
   present, populated, and actually asserted on — not merely included in a generic loop that would
   pass even if that field were absent. (The same "0 comparisons is not a pass" discipline from AC3,
   applied per-item rather than only in aggregate.)

10. **Explicit non-goals enforced by the tests themselves.** No test or script in this story ever
    connects with `--apply` against anything but `tm_suite_test`; a repo-wide grep for this story's
    new files confirms no `MONGODB_URI` or `MONGODB_DB` override reaching production is possible from
    any code path added here. Mirrors the DBO/`cm-2` scripts' own dry-run-default discipline, made
    doubly explicit here because this story, unlike those, has no live cutover step at all — anything
    resembling one is out of scope by construction.

## Tasks / Subtasks

- [x] **Task 1 — Coverage-set enumeration (AC 2)**
  - [x] Re-verify all eight file:line citations against the working tree at dev-start; correct any
        that have drifted since this story was written (2026-08-16) and note the correction in the
        Dev Agent Record, per this project's own documented false-pass hazard.
  - [x] Write the coverage-set list as a data structure (not prose) inside `cm-7-fact-map.mjs` so
        `buildFactMap` and its own tests read from one definition.
  - [x] Add the `game-xp.js:55` dead-`session_number` finding to `deferred-work.md` as its own entry
        (not fixed here — see "What this story is NOT").

- [x] **Task 2 — Pre-image/post-image builder (AC 1, 3, 5)**
  - [x] `buildFactMap(db)` — pure, read-only, mirrors `planRename`'s pure/impure split.
  - [x] `runFactMapCheck(pre, post)` with the minimum-comparison-count guard (AC3).
  - [x] `main()` CLI wrapper with the diff report and exit-code contract (AC5).

- [x] **Task 3 — Falsifiability proof (AC 4)**
  - [x] One corruption test per coverage-set item with an independent failure mode (continuity gap,
        archive-order fallback to `created_at`/`_id`, `game_sessions` correspondence mismatch — at
        minimum items 2, 4, and 7 from AC2, since those are the three with the sharpest silent-failure
        consequences).
  - [x] Record each red run's actual output in the Dev Agent Record — the proof is the run, not the
        claim that a run happened.

- [x] **Task 4 — Drill migration and inverse (AC 6, 7)**
  - [x] `cm-7-drill-migration.mjs`: `planDrillMigration`, `applyDrillMigration`,
        `invertDrillMigration`, `main()` — dry-run default, same shape as `cm-2`'s script.
  - [x] Seed fixture set representative of the real shape (a handful of `downtime_cycles` +
        `downtime_submissions` + `game_sessions` + `tracker_state` docs), built with the same
        `dbAvailable`/`isDbAvailable()` DB-backed-suite convention `cm-4a` uses.
  - [x] Interleaved-write drill test (AC7): migrate → write feed roll + spend → invert → assert both
        halves.

- [x] **Task 5 — Backup drill (AC 8)**
  - [x] Snapshot/restore test against the drill fixture set, or a documented manual run with the Dev
        Agent Record stating why automation was impractical. **Automated** (Open Question 2 answered
        during dev: `tm_suite_test`'s lifecycle did not make automation awkward — a plain in-memory
        document snapshot + `replaceOne` restore was straightforward).

- [x] **Task 6 — Tests (AC 3, 4, 7, 8, 9, 10)**
  - [x] `server/tests/cm-7-fact-map-harness.test.js` — `describe.skipIf(!dbAvailable)` with
        `isDbAvailable()` from `tests/helpers/db-setup.js` (issue-1143's convention, reused by cm-4a);
        read the summary line, not just the exit code, per `CLAUDE.md`'s standing warning that a
        skipped suite is not a passing suite.
  - [x] Per-coverage-item real-fixture assertions (AC9).
  - [x] Repo-wide grep confirming no new file reaches production config (AC10) — can be a static
        assertion over the new files' own source text, following the same "prove a negative by reading
        the diff" approach `oaq`/`dbo` reviews have used elsewhere in this project.

- [x] **Task 7 — Changed-area regression**
  - [x] `cd server && npx vitest run tests/cm-7-fact-map-harness.test.js
        tests/cm-4a-phase-transition-enforcement.test.js tests/cm5-reset-transition.test.js
        tests/cm-2-chapters-to-story-cycles.test.js tests/api-story-cycles.test.js
        tests/api-game-sessions.test.js` — the last two because this story's fixtures write
        `downtime_cycles`/`chapters`/`game_sessions` docs and would surface an accidental collision
        with their own fixture data.
  - [x] Targeted only, per this project's standing instruction; do not run the full 171+-suite sweep.

- [ ] **Task 8 — PR to `main`. *GATED on Angelus's explicit word.*** Never push or merge without it.
      *Nothing committed, pushed or merged by the dev agent; the working tree is left as the
      finished, uncommitted result (same convention `cm-4a`'s own Task 8 established).*

### Review Findings

Internal 3-layer review (Blind Hunter, diff-only; Edge Case Hunter, diff + full repo; Acceptance
Auditor, diff + this spec), 2026-08-16. No `decision-needed` findings — one apparent scope
ambiguity (COVERAGE_SET item 6's overclaim) resolved unambiguously by following this project's own
established "narrow the citation, log the real gap" pattern rather than silently expanding scope.

- [x] [Review][Patch] `runFactMapCheck` never detects a session present in post-image but absent
  in pre-image (asymmetric with the cycle comparison, which checks both directions)
  [server/scripts/cm-7-fact-map.mjs:~254-296]
- [x] [Review][Patch] `unmatchedSessions` doesn't flag two sessions sharing one `game_number`
  (checks the matching cycle count, not the session's own duplication) [server/scripts/cm-7-fact-map.mjs:~203-215]
- [x] [Review][Patch] AC5 violated — no test invokes either new script's actual `main()`,
  contradicting the #826 rule this AC itself cites and the `cm-2` precedent test
  [server/tests/cm-7-fact-map-harness.test.js]
- [x] [Review][Patch] AC1's own text still claims `buildFactMap` reads `downtime_submissions`;
  Task 1's correction removed `chapters` but missed this [this story, AC1]
- [x] [Review][Patch] `cm-7-drill-migration.mjs`'s documented two-step CLI usage (`--apply` then a
  later `--invert --apply` as separate process invocations) silently reverts nothing — `main()`
  re-plans from live (already-shifted) state on every invocation instead of persisting the plan —
  and exits 0 with "0/N moved" [server/scripts/cm-7-drill-migration.mjs]
- [x] [Review][Patch] `COVERAGE_SET` item 6 cites 4 file:line locations with no corresponding
  `buildFactMap` field (2 redundant with the base `game_number` field or a write path, not a
  distinct human-visible fact; 2 genuine untracked derived facts — the "most recently closed
  cycle" selection and the "next session number" suggestion) [server/scripts/cm-7-fact-map.mjs:~63-75]
- [x] [Review][Patch] `pickerLabel`'s doc comment references a nonexistent "note below" and is
  stale — the function does include date/title, contradicting its own comment
  [server/scripts/cm-7-fact-map.mjs:~110-117]
- [x] [Review][Patch] `--snapshot` and `--against` combined silently writes the snapshot and skips
  the diff, with no warning [server/scripts/cm-7-fact-map.mjs, `main()`]
- [x] [Review][Patch] No defensive validation on a loaded `--against` snapshot before dereferencing
  its shape — an opaque `TypeError` on a bad/truncated file [server/scripts/cm-7-fact-map.mjs, `main()`]
- [x] [Review][Patch] Dry-run-by-default is tested for `applyDrillMigration` but not
  `invertDrillMigration` [server/tests/cm-7-fact-map-harness.test.js]
- [x] [Review][Patch] AC3's literal "`Object.keys(pre).length * fields`" formula text doesn't
  match the actual (sounder, array-length-based) implementation [this story, AC3]
- [x] [Review][Patch] The AC7 interleaved-write drill's `buildFactMap` calls omit `sessionFilter`,
  reading the whole `game_sessions` collection rather than a fixture-scoped subset — a
  concurrency-safety gap given this project's own documented history of concurrent-vitest-process
  collisions against `tm_suite_test`; Task 4's own fixture description also claimed a
  `game_sessions` fixture that was never actually seeded [server/tests/cm-7-fact-map-harness.test.js]
- [x] [Review][Patch] Cycle/session test fixtures use fixed, deterministic ObjectIds rather than
  `new ObjectId()` (unlike the `downtime_submissions`/`tracker_state` fixtures in the same file) —
  a concurrent-test-run collision hazard [server/tests/cm-7-fact-map-harness.test.js]
- [x] [Review][Patch] No detection of two live cycles sharing one non-null `game_number` — a real,
  previously-occurring incident per this project's own `sprint-status.yaml` record of a duplicate
  "Game 7" cycle document [server/scripts/cm-7-fact-map.mjs]
- [x] [Review][Patch] Archive-order comparator mixes heterogeneous key types (number/Date/string)
  with no test exercising the mixed-fallback case [server/scripts/cm-7-fact-map.mjs:~169-183]
- [x] [Review][Patch] Drill migration's write value (`oldGameNumber + offset`) has no check against
  colliding with an unrelated document's `game_number` if ever pointed at a non-fixture-scoped
  database — document the constraint explicitly rather than build a runtime guard, since this is
  explicitly non-production drill tooling [server/scripts/cm-7-drill-migration.mjs]
- [x] [Review][Patch] Running `--apply` twice without an intervening `--invert` compounds the
  shift by 2x (not idempotent) — document as an accepted limitation of drill/rehearsal tooling
  rather than building a full guard [server/scripts/cm-7-drill-migration.mjs]
- [x] [Review][Defer] `sprint-status.yaml`'s multi-quoted-string `last_updated` value is not valid
  YAML [specs/stories/sprint-status.yaml:2,46] — deferred, pre-existing project-wide convention
  across dozens of prior entries, not introduced by this diff, out of proportion to fix here
- [x] [Review][Defer] AC8's backup-drill test only proves field-mutation restore, not
  insert/delete drift [server/tests/cm-7-fact-map-harness.test.js] — deferred, real coverage gap
  but a fuller restore-scenario matrix is disproportionate for this review pass

**Dismissed as noise:** AC10 static-guard tests use CWD-relative file paths
(`fs.readFileSync('./scripts/cm-7-fact-map.mjs', ...)`) — matches the exact existing convention in
`cm-2-chapters-to-story-cycles.test.js`'s own shebang-check test, and this project's tests are
exclusively run via `cd server && npx vitest run ...` per `CLAUDE.md` and every story's own
regression commands; not a realistic trigger in this project's actual usage.

## Dev Notes

Every file:line reference below was re-verified against commit `32967bf3` on branch
`ms/cm-7-fact-map-harness-and-rollback-drill` (cut fresh from `origin/main`), 2026-08-16, during
dev-story Task 1 — one drift found and corrected (AC2 item 6's `next-session.js` mis-attribution,
see Dev Agent Record). Re-confirm before citing in a commit message.

### The migration-script pattern precedent

`server/scripts/cm-2-chapters-to-story-cycles.mjs` establishes the shape this story's two new scripts
should follow: `sourceShapeRefusals` / `planLabel` (pure helpers), `planRename(db, opts)` (pure
planning, read-only), `verifyRename(db, plan)`, `applyRename(db, plan, {apply, log})` (the only
function that writes, gated on an explicit `apply` flag defaulting false), `dropSource(db, {apply, log})`,
and `main(argv)` guarded by `if (import.meta.url === ...) main().catch(...)` so the module is
independently testable without triggering a run on import. `cm-7-fact-map.mjs` and
`cm-7-drill-migration.mjs` both follow the same plan/apply/verify split and the same dry-run default.

### DB-backed test infrastructure precedent

`server/tests/cm-4a-importer-phase-strip.test.js`:

```js
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
...
const dbAvailable = await isDbAvailable();
...
app = createTestApp();
```

This story's new suite follows the identical import set and `describe.skipIf(!dbAvailable)` gate.

### Why the coverage set excludes TM Wiki

Cycle-model.md §10, verified against `TM Wiki/server/routes/downtimes.js:165-179` in that document's
own research (not re-verified in this repo, since TM Wiki is a sibling repo outside this checkout):
the Wiki's archive orders by timestamp, ships an opaque `cycle_id`, and never computes a game number.
"It needs no migration." Nothing in this story's coverage set should attempt to reach across repos —
if a future reviewer asks "what about the Wiki," the answer is in cycle-model.md §10, not a gap here.

### The creation-order trap (do not reproduce it)

`public/js/game/signin-tab.js:83-88`:

```js
// The cycles API sorts by _id desc, but DT1 was re-imported with a newer
// _id than DT3 — so array order no longer tracks recency. Order on
// game_number explicitly to pick the genuine most-recent cycle.
const lastClosed = (allCycles || [])
  .filter(c => c.status && c.status !== 'open')
  .sort((a, b) => (b.game_number || 0) - (a.game_number || 0))[0] || null;
```

Cycle-model.md §6's own "trap that must not be reused" section names this exact pattern: creation
order (`_id`, `created_at`) is not game order, ever, anywhere in this epic's tooling. `buildFactMap`
must not sort or key by `_id`/`created_at` for anything the coverage set treats as ordering-sensitive
(AC2 items 2, 3, 6).

### The `game_sessions` correspondence, concretely

`server/routes/attendance.js:8-17`:

```js
// GET /api/attendance?character_id=X[&game_number=N]
// If game_number provided, selects the session whose game_number field equals N; otherwise uses the most recent.
router.get('/', async (req, res) => {
  ...
  if (gameNumber && Number.isInteger(gameNumber) && gameNumber > 0) {
    latest = await col().findOne({ game_number: gameNumber }) || null;
  }
  ...
```

called from `public/js/tabs/downtime-form.js:1538`:

```js
if (currentCycle?.game_number) attUrl += '&game_number=' + currentCycle.game_number;
```

This is a live, player-facing coupling: the DT form's "have you attended" gate is only correct if
`downtime_cycles.game_number` and the matching `game_sessions.game_number` move together. Confirmed
by schema: `server/schemas/downtime_submission.schema.js:583` declares
`game_number: { type: 'integer', minimum: 1 }` on the cycle schema (which, per this project's own
`CLAUDE.md` note, "lives in a file named for submissions" — a pre-existing organisational oddity, not
this story's concern to fix).

### The dead `session_number` field

`public/js/data/game-xp.js:55`:

```js
title: s.title || `Game ${s.session_number || '?'}`,
```

`server/schemas/game_session.schema.js` declares only `game_number` (line 22); grepping the whole
repo for `session_number` turns up exactly this one reader and nothing that ever writes it
(`server/routes/characters.js:271` projects it through, but nothing populates it on any document). The
XP breakdown panel's per-game title is `Game ?` today, on every real session, unless that session
happens to carry an explicit `.title`. Confirmed pre-existing and independent of the renumber — see
"What this story is NOT."

## Open questions for Angelus (flag before dev starts)

1. **Should the drill migration (AC6) be built to resemble CM-4's actual planned transformation as
   closely as possible, or kept deliberately minimal/generic?** **Recommended: deliberately minimal.**
   A drill that tries to anticipate CM-4's exact final shape (the Chapter-1 placeholder, the seam
   assertions, the real 7-cycle production data) risks silently becoming CM-4 itself, written without
   CM-4's own story, design review, or Angelus's sign-off on its actual behaviour. Keeping the drill
   to "reassign `game_number` on a handful of seeded test cycles" proves the harness-and-inverse
   *mechanism* — which is all precondition 2 and 4 ask for — without pre-empting CM-4's own scope.
2. **Is the backup drill (AC8) worth automating against `tm_suite_test`, or is a documented one-off
   manual run acceptable here?** **Recommended: attempt automation first** (a snapshot/restore test
   is mechanically simple against a local fixture set with no Atlas-tier backup product involved), but
   if `tm_suite_test`'s own lifecycle (torn down per test run) makes a genuine "snapshot, then later
   restore" drill awkward to express as a single automated test, a documented manual run with its
   output pasted into the Dev Agent Record satisfies precondition 3's "verified, never asserted" bar
   without forcing an artificial automation shape onto it.
3. **Should this story open its own GitHub issue, or stay tracked purely through `sprint-status.yaml`
   the way CM-2 and CM-4a were?** **Recommended: no new issue** — extend #1031 with a comment linking
   this story once it lands, matching how CM-4a and CM-2 (both epic-internal, no dedicated issue) were
   tracked. #1031 stays open until CM-4 itself is unblocked and run; this story closes preconditions 2
   and 4 of the five #1031/§6 names, not the issue as a whole.

## References

- [Source: D:\Terra Mortis\cycle-model.md §6] — "Hard preconditions", items 1-5, and the specific
  wording of preconditions 2 and 4 this story's AC3/AC4/AC7 quote near-verbatim.
- [Source: D:\Terra Mortis\cycle-model.md §8] — "Seam assertions", fact-map equality definition.
- [Source: D:\Terra Mortis\cycle-model.md §9] — "Rollback ... required, not optional", the
  inverse-as-primary-rollback reasoning and the "point of no return: Game 7" framing (not yet reached
  for the eventual CM-4 renumber, since it has not run).
- [Source: D:\Terra Mortis\cycle-model.md §10] — TM Wiki's confirmed anchor-neutrality, the reason the
  coverage set (AC2) is TM-Suite-internal only.
- [Source: D:\Terra Mortis\cycle-model.md §11a, step 8] — the instruction to reuse CM-6's FK
  consistency check as the harness's first real coverage piece (AC2 item 7).
- [Source: GitHub issue #1031] — full original scope, "Out of scope" section (the renumber itself,
  backup/restore *policy* as distinct from this story's backup *drill*).
- [Source: specs/stories/sprint-status.yaml, `cm-4-renumber-chapter-merge` row] — 2026-08-16 step-1
  verification confirming precondition 1 (reference hygiene) already done.
- [Source: server/scripts/cm-2-chapters-to-story-cycles.mjs] — the plan/apply/verify/main pattern this
  story's two new scripts follow.
- [Source: server/tests/cm-4a-importer-phase-strip.test.js] — the `isDbAvailable`/`createTestApp`
  DB-backed-suite convention this story's suite follows.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

### Completion Notes List

- **Task 1 (coverage-set re-verification):** re-grepped all eight AC2 citations against this branch's
  working tree (commit `32967bf3`, `ms/cm-7-fact-map-harness-and-rollback-drill`, cut fresh from
  `origin/main`). Two corrections found and applied directly to the story:
  - **AC2 item 6** mis-attributed the `maxNum + 1` session-creation logic and the session-picker
    dropdown to `next-session.js:158-165,222-225`. `next-session.js` is only 115 lines long and cannot
    contain those line numbers. Both are actually in `public/js/game/signin-tab.js` — a *separate*
    admin "next game session" surface (`handleNewSession` at `:155-166`, the picker `<select>` options
    at `:222-230`) alongside the correctly-cited `:83-88` creation-order-trap sort. `next-session.js`
    itself is real and correctly involved in the coverage set, just for a *different* pair of lines
    (`:66-74` `loadNext` display, `:92-98` `saveNext` write) than originally cited.
  - **AC1** named `chapters` as a fourth collection `buildFactMap` should read. None of AC2's eight
    coverage items reference `chapters`/`story_cycles` (that FK covers Story-grouping membership, a
    different fact from the eight #1031/cycle-model.md §8 name), so reading it would violate AC1's own
    "no more, no less" instruction. Removed from AC1; `buildFactMap` reads `downtime_cycles`,
    `game_sessions`, `downtime_submissions` only.
  All other citations (archive-tab.js:71-73, story-tab.js:58-62/188-192, downtime-story.js:3869-3885,
  status.js:275, cycle-views.js:490, signin-tab.js:83-88, attendance.js:8-17, downtime-form.js:1538,
  game-xp.js:55, both schema field declarations) matched exactly, no drift.

- **Task 3 (falsifiability, AC4) — a real bug found and fixed by actually running the tests.**
  `runFactMapCheck`'s first draft included two ABSOLUTE post-image assertions ("continuity gaps
  must be empty in the post-image", "correspondence must be clean in the post-image") alongside the
  correct pre/post EQUALITY checks. The AC7 interleaved-write drill test caught this immediately: a
  scoped fixture snapshot (only 2 drill cycles, `game_number` 11/12, no cycle 1-10 present) legitimately
  reports `continuityGaps: [11]` and nonzero `unmatchedCycles`/`unmatchedSessions` on BOTH sides of a
  pre/post pair that hadn't changed at all — the absolute checks failed a run that had correctly found
  ZERO real divergence. Removed both absolute checks; the equality-diff checks alone already satisfy
  AC4's actual requirement (a corruption that INTRODUCES a gap or a correspondence break IS caught, as
  proven by the three AC4 red-run tests) without wrongly penalising a legitimately-scoped snapshot.
  Full red/fix/green cycle: first full suite run failed 1/24 (`the inverse restores game_number
  exactly...`, `expected false to be true`); fix applied; re-run 24/24, then 25/25 after Task 1's
  `COVERAGE_SET` data-structure addition.
- **Task 3 (AC4) — three independent red-run proofs, actually executed, not merely claimed:**
  1. Corrupted a cycle's `game_number` mid-run (item 4 / continuity) — `runFactMapCheck` returned
     `ok: false` with a failure naming the corrupted cycle's `_id` and the `game_number` field.
  2. `$unset` a cycle's `game_number` mid-run (item 2 / archive-order fallback) — returned `ok: false`
     with a failure containing "fallback".
  3. Changed a `game_sessions` document's `game_number` mid-run, breaking the 1:1 pairing (item 7 /
     correspondence) — returned `ok: false` with a failure containing "correspondence".
  All three passing green (the harness correctly finds nothing wrong on an unmodified fixture) is
  proven by the separate "runs a nonzero, size-derived comparison count on a real fixture pair" test.
- **Task 5 (AC8, Open Question 2 answered):** automation was straightforward against
  `tm_suite_test` — a plain in-memory document snapshot (`find()` before the drill) plus a
  `replaceOne` restore per document worked without any special handling of the test DB's own
  teardown-per-run lifecycle. No manual run was needed.
- **Task 7 (changed-area regression):** `cd server && npx vitest run tests/cm-7-fact-map-harness.test.js
  tests/cm-4a-phase-transition-enforcement.test.js tests/cm5-reset-transition.test.js
  tests/cm-2-chapters-to-story-cycles.test.js tests/api-story-cycles.test.js
  tests/api-game-sessions.test.js` — **6 files, 193/193 tests passed, 0 skipped, 0 failed.** No
  regressions in any neighbouring cycle/session-touching suite.
- **Design correction beyond Task 1's citation fixes:** AC1's collection-read list named `chapters`
  as a fourth collection for `buildFactMap` to read. None of AC2's eight coverage items reference
  `chapters`/`story_cycles` (that FK is Story-grouping membership, a different fact from the ones
  #1031/§8 name), so `buildFactMap` reads only `downtime_cycles` and `game_sessions` — AC1 corrected
  to match, per its own "no more, no less" instruction. `downtime_submissions` is read only by the
  interleaved-write drill test's own fixture, not by `buildFactMap` itself, since none of the eight
  coverage items are derived from that collection either (the DT form's attendance-gate coupling,
  item 7, is entirely a `downtime_cycles`/`game_sessions` correspondence).

### File List

- `server/scripts/cm-7-fact-map.mjs` (new)
- `server/scripts/cm-7-drill-migration.mjs` (new)
- `server/tests/cm-7-fact-map-harness.test.js` (new)
- `specs/deferred-work.md` (modified — the `game-xp.js:55` dead-field finding, Task 1)
- `specs/stories/sprint-status.yaml` (modified — status tracking)
- `specs/stories/cm-7-fact-map-harness-and-rollback-drill.md` (this story file — Task 1's AC1/AC2
  corrections, task checkboxes, Dev Agent Record)

## Change Log

- 2026-08-16 — Story created (bmad-loop create-story), status `backlog` → `ready-for-dev`.
- 2026-08-16 — Dev-storied to completion (bmad-loop dev-story), status `ready-for-dev` → `review`.
  All 8 tasks complete except Task 8 (PR, gated on Angelus's word — deliberately unchecked). Two
  citation corrections and one collection-scope correction to AC1/AC2 during Task 1; one real
  falsifiability-guard bug found and fixed via the AC7 test (two overbroad absolute post-image
  assertions removed, equality-diff checks alone satisfy AC4). Three new files
  (`cm-7-fact-map.mjs`, `cm-7-drill-migration.mjs`, `cm-7-fact-map-harness.test.js`), 25 new tests,
  changed-area regression 193/193 across 6 files, 0 skipped. No live `tm_suite` write of any kind.
- 2026-08-16 — Internal 3-layer code review (LOCAL — Codex unavailable this session), 17 findings
  patched (all prove-discriminated), 2 deferred, 1 dismissed as noise. Status `review` → `done`.
  See Senior Developer Review below. Regression after patching: 206/206 across 6 files, 0 skipped.

## Senior Developer Review

**Date:** 2026-08-16. **Outcome: APPROVED with changes — all 17 patch findings landed and
prove-discriminated, status advanced `review` → `done`.**

### Provenance — this was an INTERNAL review, not an external one

Codex/external review was not selected for this story (the user chose internal, LOCAL review — the
project's standard EXTERNAL/LOCAL split, per `codex-review`, applies when the user picks Codex).
Record that when weighing the result: no independent model outside this session looked at the diff.

| Layer | Scope |
|---|---|
| **Blind Hunter** | Diff only (the three new files + the two small doc diffs). No story file, no ACs, no repo access. |
| **Edge Case Hunter** | Diff + full repo read access — cross-referenced every AC2 file:line citation against the working tree, `server/db.js`, `tests/helpers/db-setup.js`, and `cm-2-chapters-to-story-cycles.mjs`. |
| **Acceptance Auditor** | Diff + this story's own spec (all 10 ACs, "What this story is NOT", Dev Notes, Dev Agent Record, Change Log) + repo read access. |

### Findings — 20 total, 17 patched, 2 deferred, 1 dismissed

**Headline (High): a real logic bug in the harness's own core promise.** `runFactMapCheck`'s
session-comparison block checked "session present pre, missing post" but never the reverse
direction — a session inserted between the pre- and post-image snapshots was completely invisible
to the diff, directly undercutting the file's own "FALSIFIABLE BY CONSTRUCTION" claim (Blind
Hunter). Fixed with the same reverse-loop pattern the cycle-comparison block already used two
paragraphs above it — the asymmetry was the bug, not a missing feature. Prove-discriminated: reverting
the fix failed exactly the new "goes red on a session inserted mid-run" test.

**High: AC5 was silently unmet.** No test invoked either new script's actual `main()`, contradicting
the #826 post-mortem rule AC5 itself cites verbatim and the `cm-2-chapters-to-story-cycles.test.js`
precedent it names (Acceptance Auditor). Added a full "main() (AC5)" describe block for each script,
following that exact precedent's shape (`vi.spyOn(console.log)`, `afterEach` reconnects the shared
`db.js` connection since `main()` closes it in its own `finally`, `process.exitCode` save/restore).
Six new tests exercise `--snapshot`, `--against` (both matching and diverging), the combined-flags
case, a malformed-snapshot refusal, and the drill script's forward/invert CLI round trip.

**Medium, found BY writing the AC5 tests, not before: `cm-7-drill-migration.mjs`'s own documented
two-step CLI usage silently reverted nothing.** `main()` re-planned from live state on every
invocation; a `--apply` followed by a *separate process* `--invert --apply` (exactly the workflow
the script's own header block instructed) read the already-shifted values as "old", so the
invert's `updateOne` filter never matched anything — 0/N moved, exit code 0, no error (Edge Case
Hunter). The automated test suite's own AC7 drill never hit this, because it correctly reuses one
in-memory plan object across both calls within a single process. Fixed with a `--plan-file`
mechanism mirroring `cm-7-fact-map.mjs`'s own `--snapshot`/`--against` persistence: forward runs
write the plan, `--invert` REQUIRES it and refuses loudly (not silently) if absent.
Prove-discriminated: reverting `main()`'s invert branch to always re-plan reproduced the exact
silent-failure output ("Totals: 0 / 1 moved", no refusal) in both new tests.

**Medium: `unmatchedSessions` had an asymmetric guard vs. `unmatchedCycles`.** It checked only the
matching-cycle count, so two sessions sharing one `game_number` each independently saw "exactly 1
matching cycle" and neither was flagged (Edge Case Hunter). Fixed by also checking the session's own
game_number uniqueness among sessions. Prove-discriminated: reverting failed exactly the new
"goes red when two sessions come to share one game_number" test.

**Medium: two live cycles sharing one non-null `game_number` had no detection at all** — a real,
previously-occurring incident (the duplicate "Game 7" `downtime_cycles` document from the Game 7
crisis, on record in this repo's own `sprint-status.yaml`) that this harness's own coverage set
should have named from the start (Edge Case Hunter). Added `duplicateGameNumbers` to `buildFactMap`'s
return value and an equality check in `runFactMapCheck`. Prove-discriminated: reverting the
equality check failed exactly the new "goes red on a duplicate game_number appearing across two
cycles" test.

**Medium: AC1's own text was internally contradictory** — it still named `downtime_submissions` as
a collection `buildFactMap` reads, even after Task 1's own dev-story correction removed `chapters`
from the same sentence and the Dev Agent Record separately claimed only two collections are read
(Acceptance Auditor). The prose correction was never actually applied to AC1 itself. Corrected in
this pass; `buildFactMap` was already correct (it only ever read `downtime_cycles`/`game_sessions` —
`downtime_submissions` is written by the AC7 test's own fixture, not read by the harness).

**Medium: `COVERAGE_SET` item 6 overclaimed coverage.** Four of its six cited source locations had
no corresponding `buildFactMap` field — two are redundant with the base `game_number` field or a
write path (not a distinct human-visible fact), two are genuine untracked derived facts (which
cycle is "most recently closed" on the Sign-in tab; the suggested next game number a new session
gets) (Blind Hunter + Edge Case Hunter, independently). Narrowed the citation to what is actually
tracked and logged the two real gaps to `deferred-work.md` rather than silently expanding this
story's scope mid-review or leaving the overclaim in place.

**Low × 10, all patched:** a stale/self-contradicting doc comment on `pickerLabel`; `--snapshot`
and `--against` combined silently dropping the diff (now runs both); no shape validation on a
loaded `--against` snapshot (now refuses cleanly with a named reason instead of an opaque
`TypeError`); `invertDrillMigration`'s dry-run default was untested; AC3's literal comparison-count
formula text didn't match the (sounder, array-length-keyed) shipped implementation; the AC7 test's
`buildFactMap` calls read the whole unscoped `game_sessions` collection instead of a
fixture-scoped subset (a concurrency-safety gap given this project's own documented history of
concurrent-vitest-process collisions against `tm_suite_test` — oxp-5's `sprint-status.yaml` entry);
Task 4's own fixture description named a `game_sessions` fixture that was never actually seeded;
fixed cycle/session test `_id`s were deterministic rather than randomised (same concurrency-safety
class); the archive-order comparator's heterogeneous-key-type fallback path had no test coverage;
the drill migration's write value had no documented collision constraint; running `--apply` twice
without `--invert` was undocumented as non-idempotent. The last two are documentation-only fixes
(explicit header-comment constraints), proportionate to throwaway drill/rehearsal tooling that
never runs against anything but `tm_suite_test`.

**Deferred (2):** `sprint-status.yaml`'s multi-quoted-string `last_updated` value is not valid YAML
— pre-existing across dozens of prior entries, not introduced by this diff, disproportionate to fix
in a story-scoped review. AC8's backup-drill test proves field-mutation restore but not
insert/delete drift — a real coverage gap, but a fuller restore matrix is disproportionate scope for
this pass. Both logged to `deferred-work.md`.

**Dismissed (1):** AC10's static-guard tests use CWD-relative file paths — flagged as a hypothetical
"vitest run from the wrong directory" risk, but this is the *exact same* convention
`cm-2-chapters-to-story-cycles.test.js`'s own precedent test already uses, and this project's tests
are exclusively invoked via `cd server && npx vitest run ...` per `CLAUDE.md` and every story's own
regression commands — not a realistic trigger in this project's actual usage.

### Verification

Every patch with a testable behaviour change was prove-discriminated with a single-change revert:
confirmed red with the original bug reproduced, then restored. Full changed-area regression after
all patches: `cd server && npx vitest run tests/cm-7-fact-map-harness.test.js
tests/cm-4a-phase-transition-enforcement.test.js tests/cm5-reset-transition.test.js
tests/cm-2-chapters-to-story-cycles.test.js tests/api-story-cycles.test.js
tests/api-game-sessions.test.js` — **206/206 passed, 0 skipped, 0 failed** (cm-7's own suite grew
25 → 38 tests during the review pass). No unresolved High or Medium finding remains.
