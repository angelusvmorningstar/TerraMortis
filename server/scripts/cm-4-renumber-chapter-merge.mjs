/**
 * cm-4 migration: THE RENUMBER.
 *
 * Corrects the historical downtime-to-game pairing once, for all seven existing chapters, so that
 * "Downtime for Chapter N" and "Game N" are the same chapter going forward. Closes the off-by-one
 * `D:\Terra Mortis\cycle-model.md` §1 diagnosed (a cycle labelled "Game N" actually held the
 * downtime that fed Game N+1). Folds in CM-6 (`game_sessions.chapter_id` + a partial unique index)
 * per §11a step 6, since this migration is already touching every chapter document once.
 *
 * Manual, ST-invoked, one-off. Nothing calls this on server boot and nothing calls it in test
 * setup; the vitest suite imports its exported functions and runs them against `tm_suite_test`
 * only.
 *
 * NOTE FOR ANYONE TIDYING THIS FILE: there is deliberately NO `#!/usr/bin/env node` shebang.
 * Vitest's transform fails on one with a bare "SyntaxError: Invalid or unexpected token" and no
 * location, which silently takes down the whole importing suite (documented in CLAUDE.md, and
 * learned the hard way by `migrate-office-purchases-to-seats.mjs`). This script IS imported by a
 * test suite. Run it with an explicit `node`.
 *
 * ==========================================================================================
 *   RUNNING THIS FOR REAL IS ANGELUS'S ACTION, NOT AN AGENT'S.
 *
 *   AND IT IS BLOCKED ON cm-2b's OWN `--apply` LANDING FIRST. As of 2026-08-17 the live
 *   `tm_suite` database still holds `downtime_cycles` (not `chapters`) and 180 submissions
 *   still carrying `cycle_id` (not `chapter_id`) - cm-2b shipped as CODE (`26bf229e`) but its
 *   data migration is gated on TM Cockpit coordination (`specs/cm-2b-cross-repo-coordination.md`).
 *   This script is written entirely against the POST-cm-2b names and REFUSES loudly rather than
 *   guessing if it finds the pre-cm-2b shape - see the `pre-cm-2b` refusal in `planRenumber`.
 * ==========================================================================================
 *
 *   Connection comes from `../db.js` (MONGODB_URI via config.js, database name from MONGODB_DB,
 *   defaulting to `tm_suite`). Running this bare from `server/` with a `.env` in place therefore
 *   targets LIVE Atlas. What makes that survivable is the DRY-RUN DEFAULT: without `--apply` this
 *   only reads, and prints exactly what it would do.
 *
 * WHAT THE WRITE PLAN ACTUALLY IS (cycle-model.md §6's mapping table, mechanised)
 *
 *   1. SUBMISSION REASSIGNMENT. Every `downtime_submissions` document attached (by `chapter_id`)
 *      to the chapter whose `game_number` is N gets that FK re-pointed at the chapter whose
 *      `game_number` is N+1, for every N that has a successor. NO DOCUMENT'S OWN `game_number`
 *      EVER CHANGES. Games are immutable (§6); only which chapter document each downtime's
 *      submissions hang off moves. The chapter at the highest `game_number` is a destination only:
 *      whatever is already attached to it stays exactly where it is.
 *
 *   2. THE CHAPTER-1 PLACEHOLDER, applied IN PLACE to the EXISTING `game_number: 1` document.
 *      No new document and no new `_id`: §3's framing ("the game cycle IS the chapter") means
 *      Chapter 1's own cycle document is the one that already carries `game_number: 1`. After
 *      step 1 that document holds zero submissions, because Chapter 1's downtime was character
 *      creation. It gets `placeholder: true` plus `placeholder_note`, and NOTHING ELSE - in
 *      particular not `status`, `label` or `game_number`, all three of which the cm-7 fact map
 *      tracks and §6 requires to read identically before and after.
 *
 *   3. THE 12 UNATTACHABLE SUBMISSIONS ARE EXCLUDED ENTIRELY. Four dangling ObjectIds (all on
 *      Livia, all `status: 'draft'`), four `null` and four missing-field (both groups on Yusuf
 *      Kalusicj). Per the 2026-08-16 ruling they are confirmed non-production test artefacts with
 *      no valid chapter reference to renumber; force-repairing them would be inventing data. The
 *      plan names them individually (`plan.excluded`) so the exclusion is explicit, not an
 *      accident of a filter that happened not to match them.
 *
 *   4. CM-6: `game_sessions.chapter_id`, backfilled from an EXPLICIT, MANUALLY CONFIRMED PAIRING
 *      TABLE (`GAME_SESSION_PAIRINGS` below), with the evidence cited per row. Deliberately NOT
 *      derived by matching `game_number`: §11a records that automated match-by-`game_number`
 *      inference has already caused two separate live bugs this cycle (the Game-7-incident
 *      Influence bug and the feeding-cycle-picker bug). Every row is re-verified against the
 *      database before anything is written, so the table is auditable rather than merely asserted.
 *
 * IDEMPOTENCY, AND WHY IT NEEDS TWO MARKERS
 *
 *   Unlike `cm-2`/`cm-2b` (copy-based, so a re-run is a natural no-op), this migration's forward
 *   step is a SHIFT. Re-planning from the already-shifted state would read the moved submissions
 *   as "attached to chapter N+1" and shift them again, compounding - the exact hazard
 *   `cm-7-drill-migration.mjs`'s header documents and deliberately accepted for throwaway drill
 *   tooling. This is not drill tooling, so it is guarded properly.
 *
 *   REVIEW FINDING, 2026-08-17, and the reason this now uses TWO markers rather than one. The
 *   first pass stamped every chapter in ONE `updateMany` AFTER all other writes. That inverted the
 *   guard: the single scenario it exists to catch - a crash part way through the moves loop -
 *   left ZERO chapters stamped, so the `partial-apply` refusal (which only fires on
 *   `stamped.length > 0`) could not detect that anything had happened, and the next `--apply`
 *   re-planned from the already-shifted state and COMPOUNDED the shift. Worse, the abort message
 *   told the operator the opposite ("the next plan will refuse rather than re-shift"). Now:
 *
 *     1. `cm4_renumber_started_at` (IN_PROGRESS_FIELD) is written to every plan chapter as the
 *        FIRST write of the run, before a single submission moves. A crash anywhere after that
 *        leaves it set. `planRenumber` refuses outright (`interrupted-apply`) on finding it.
 *     2. `cm4_renumbered_at` (MARKER_FIELD) is stamped PROGRESSIVELY - each source chapter is
 *        stamped the moment its OWN moves have all completed, not at the end. A crash therefore
 *        leaves an ACCURATE partial stamp set, which is what `partial-apply` was always meant to
 *        read.
 *     3. `cm4_renumber_started_at` is cleared only when the writes, BOTH gates and `verifyRenumber`
 *        have all come back green. A gate that throws, or a verify that comes back red, therefore
 *        leaves the run visibly unfinished instead of looking identical to success on the next run.
 *
 *   All chapters stamped and none in progress means "already applied, nothing to do" (a clean
 *   re-run). Anything else is a refusal, not something to paper over.
 *
 * DERIVED CHAPTER FIELDS TRAVEL WITH THE DOWNTIME (review finding, Angelus's ruling 2026-08-17)
 *
 *   A chapter document stores six fields that describe ITS DOWNTIME rather than its game:
 *   `submission_count`, `discipline_profile`, `confirmed_ambience`, `ambience_applied`,
 *   `out_of_window_player_ids`, `feeding_rights_confirmed` (`DERIVED_DOWNTIME_FIELDS`). Moving the
 *   submissions without them leaves every one of them describing a downtime the chapter no longer
 *   holds - and `submission_count` is rendered verbatim by the admin Downtime list
 *   (`public/js/admin/downtime-views.js:1284`), so post-migration Chapter 1 would read
 *   "25 submissions" while holding none.
 *
 *   `applyRenumber` therefore recomputes all six on every chapter a move touches, source AND
 *   destination:
 *     - `submission_count` is genuinely RECOMPUTED, from the plan's own post-state prediction
 *       (`expectedCounts`), so the terminal chapter's pre-existing submission is counted too;
 *     - the other five TRAVEL the same +1 hop the submissions do. That is the correct
 *       recomputation for them and not a shortcut: each one is a property of the downtime (which
 *       disciplines were fed with, which ambience was confirmed and whether it was applied, who
 *       filed out of window, whether the regents confirmed feeding rights), and the whole point of
 *       this migration is that the downtime moves. Re-deriving `discipline_profile` from scratch
 *       would mean reimplementing `public/js/admin/downtime-views.js`'s client-side derivation
 *       inside a migration script, which is exactly the kind of second implementation this epic's
 *       reviews keep finding bugs in.
 *   Every pre-value is recorded in the plan (`derivedPre`), so `--invert` restores them exactly.
 *
 *   NOT MOVED, deliberately, and FLAGGED: `regent_confirmations`, the input `feeding_rights_confirmed`
 *   is computed from (`server/routes/chapters.js:210-217`). It is outside the six the ruling
 *   enumerated. `applyRenumber` logs a NOTE naming every chapter where the two would disagree, so
 *   the inconsistency is visible rather than silent, and Angelus can rule on it before `--apply`.
 *
 * THE INVERSE (`--invert`), AND PLAN PERSISTENCE
 *
 *   Shape matched to `cm-7-drill-migration.mjs`, which is this project's own convention for a
 *   forward/inverse pair: a `--invert` flag on the SAME script, and a plan file that the forward
 *   run writes and the invert REQUIRES. The invert never re-derives its plan from live state - the
 *   forward move has already landed by then, so a re-derivation would read the shifted values as
 *   "old", derive a wrong plan, match nothing and silently revert nothing (a real bug the cm-7
 *   drill shipped with initially). A missing plan file is a refusal.
 *
 *   The invert restores every submission's `chapter_id` to the plan's own RECORDED pre-value (per
 *   submission `_id`, including its original BSON storage type), removes the placeholder fields
 *   only if the plan recorded that it added them, unsets `game_sessions.chapter_id` only on the
 *   sessions the plan actually wrote, drops the partial unique index, and clears the marker.
 *   It touches nothing else, which is what makes an interleaved post-migration write (a feed roll,
 *   a tracker spend) survive it untouched.
 *
 * USAGE
 *
 *   # preview against the configured database, no writes (the default):
 *   node scripts/cm-4-renumber-chapter-merge.mjs
 *
 *   # the same, as one machine-diffable JSON object (the #826 post-mortem rule). Use --out, not a
 *   # shell redirect: ../db.js prints its own connect/close lines on stdout.
 *   node scripts/cm-4-renumber-chapter-merge.mjs --json --out before.json
 *
 *   # write, saving the plan the invert will need. Against a NON-`_test` database --apply also
 *   # requires `--target <db name>`, spelled out, so nothing reaches live `tm_suite` on a single
 *   # mistyped flag. `--json` may NOT be combined with `--apply` (it is a report channel, and a
 *   # combined run used to print a report and then silently write nothing).
 *   node scripts/cm-4-renumber-chapter-merge.mjs --apply --target tm_suite --plan-file ../ops/cm4-plan.json
 *
 *   # undo it exactly, using that SAME recorded plan (never a re-derived one):
 *   node scripts/cm-4-renumber-chapter-merge.mjs --invert --apply --target tm_suite --plan-file ../ops/cm4-plan.json
 *
 *   # against the throwaway test database instead of live (no --target needed; `_test` is safe):
 *   MONGODB_DB=tm_suite_test node scripts/cm-4-renumber-chapter-merge.mjs
 *
 *   An existing plan file is NEVER overwritten: a second --apply pointed at the same --plan-file
 *   refuses, because the first (possibly crashed) run's plan is the only rollback record there is.
 *   `--overwrite-plan` is the explicit, deliberate override.
 *
 * RUNBOOK (cycle-model.md §9 requires the backup, it is not optional)
 *
 *   1. `node scripts/cm-4-renumber-chapter-merge.mjs --json --out before.json` and read it. Read
 *      the `pairingConfidence` block in particular: four of the seven CM-6 pairing rows rest on
 *      label/game_number congruence alone unless the chapter's own `session_id` corroborates them,
 *      and those rows want an ST's eyes before --apply, not after.
 *   2. TAKE A BACKUP AND VERIFY IT RESTORES. `mongodump --uri "$MONGODB_URI" --db tm_suite
 *      --collection chapters` plus `downtime_submissions` and `game_sessions`; restore it into a
 *      scratch database and confirm the document counts and a spot-checked body match. "We have a
 *      backup" is verified, never asserted - the July drill found the standing backup 34 days
 *      stale. The mechanism is drilled in this story's own suite (`backup drill (AC6)`).
 *   3. Snapshot the fact map: `node scripts/cm-7-fact-map.mjs --snapshot cm4-pre.json`.
 *   4. `node scripts/cm-4-renumber-chapter-merge.mjs --apply --target tm_suite --plan-file cm4-plan.json`.
 *   5. `node scripts/cm-7-fact-map.mjs --against cm4-pre.json` and confirm "OK".
 *   6. Re-run step 4's command and confirm "already applied; nothing to do".
 *   7. Re-export the TM Cockpit bundle (§6a - Angelus owns this step; the Cockpit's local bundle
 *      is a stale export the moment this lands).
 *
 * NOT RUN AS PART OF THE STORY THAT SHIPPED IT. Same convention as every migration script in this
 * project (DBO-1/4/8, cm-2, cm-2b).
 */

import 'dotenv/config';
import fs from 'fs';
import { ObjectId } from 'mongodb';
import { pathToFileURL } from 'url';
import { connectDb, getDb, closeDb } from '../db.js';
import { buildFactMap, runFactMapCheck } from './cm-7-fact-map.mjs';
// Reused, not reimplemented. cm-2b's `canonicalJSON` is the version REVIEW CORRECTED on
// 2026-08-17: the original serialised every BSON scalar through the generic-object branch, and
// `Object.keys(new ObjectId(...))` is empty on the modern driver, so every ObjectId came out as
// `{}` and two documents differing only in an ObjectId-valued field compared EQUAL. Importing it
// means this script cannot re-acquire that bug by copy-paste drift.
// `isStoryGroupingShaped` is likewise the corrected POSITIVE shape check, not the original
// negative allowlist that one extra field silently defeated.
import { canonicalJSON, isStoryGroupingShaped } from './cm-2b-downtime-cycles-to-chapters.mjs';

export const CHAPTERS_COLLECTION = 'chapters';
export const SUBMISSIONS_COLLECTION = 'downtime_submissions';
export const SESSIONS_COLLECTION = 'game_sessions';

/** Post-cm-2b FK name on `downtime_submissions`. */
export const FK_FIELD = 'chapter_id';
/** Pre-cm-2b FK name. Its PRESENCE is a refusal, never a fallback - see `planRenumber`. */
export const LEGACY_FK_FIELD = 'cycle_id';

/**
 * The idempotency stamp. Written PROGRESSIVELY by `--apply` - each source chapter is stamped the
 * moment its own moves complete, never in one bulk write at the end. See the header's "IDEMPOTENCY,
 * AND WHY IT NEEDS TWO MARKERS".
 */
export const MARKER_FIELD = 'cm4_renumbered_at';

/**
 * The in-progress marker. Written to every plan chapter as the FIRST write of an `--apply`, and
 * cleared only once the writes, both gates and `verifyRenumber` have all come back green. Its
 * presence means "a run started here and did not finish cleanly", which is a refusal.
 */
export const IN_PROGRESS_FIELD = 'cm4_renumber_started_at';

/**
 * The six chapter fields that describe the chapter's DOWNTIME rather than its game, and therefore
 * have to move with it. `submission_count` is recomputed from the plan's own post-state
 * prediction; the other five travel the same +1 hop the submissions do. See the header's
 * "DERIVED CHAPTER FIELDS TRAVEL WITH THE DOWNTIME".
 *
 * The list is cm-2b's own enumeration (`CHAPTER_MARKERS`/`BURN_IN_MUTABLE_FIELDS` in
 * `cm-2b-downtime-cycles-to-chapters.mjs`) narrowed to the downtime-derived subset, per Angelus's
 * 2026-08-17 ruling on this story's review.
 */
export const DERIVED_COUNT_FIELD = 'submission_count';
export const DERIVED_TRAVELLING_FIELDS = [
  'discipline_profile',
  'confirmed_ambience',
  'ambience_applied',
  'out_of_window_player_ids',
  'feeding_rights_confirmed',
];
export const DERIVED_DOWNTIME_FIELDS = [DERIVED_COUNT_FIELD, ...DERIVED_TRAVELLING_FIELDS];

/**
 * The input `feeding_rights_confirmed` is computed from (`server/routes/chapters.js`, the regent
 * confirmation handler). Outside the six the ruling enumerated, so deliberately NOT moved - but
 * named here, and reported as a NOTE per affected chapter, so the resulting disagreement is
 * visible rather than silent.
 */
export const DERIVED_UNMOVED_INPUT_FIELD = 'regent_confirmations';

export const PLACEHOLDER_FIELD = 'placeholder';
export const PLACEHOLDER_NOTE_FIELD = 'placeholder_note';
/** cycle-model.md §5, verbatim. */
export const PLACEHOLDER_NOTE =
  'This downtime was represented by character creation, January\u2013February 2026.';

export const SESSION_FK_FIELD = 'chapter_id';
export const SESSION_FK_INDEX_NAME = 'chapter_id_unique_notnull';

/**
 * THE CHARACTERISED EXCLUSION SET, and why it is a declared constant rather than "whatever fails
 * to resolve".
 *
 * REVIEW FINDING, 2026-08-17 (Edge Case Hunter). The first pass classified any submission whose
 * `chapter_id` did not resolve to a chapter as `dangling`, and excluded it. Against a PARTIALLY
 * COPIED `chapters` collection - say a crashed `cm-2b --apply` that got as far as chapters 1-4 -
 * that set is dense, gap-free and duplicate-free, so every guard passes, and every submission
 * belonging to chapters 5, 6 and 7 is silently reclassified as "one of the known-dangling test
 * artefacts" and dropped from the migration. The report was indistinguishable from a green run
 * except by a count nobody asserted.
 *
 * So the exclusion set is now DECLARED, from the 2026-08-16 live characterisation
 * (`cycle-model.md` §6 precondition 1, re-confirmed 2026-08-17):
 *   - exactly four `dangling` submissions, and their four dangling reference values are named
 *     below (all four are drafts on Livia, pointing at ObjectIds that are not chapters);
 *   - exactly four with `chapter_id: null` and four with no `chapter_id` key (both groups on
 *     Yusuf Kalusicj).
 * Anything outside that - a fifth dangling row, or a dangling row pointing somewhere new - is a
 * REFUSAL (`unexpected-exclusion`), because the difference between "a characterised test artefact"
 * and "a real submission whose chapter is missing" is exactly the difference this migration must
 * not get wrong.
 *
 * `danglingRefs: null` in an override means "identity unchecked, ceilings still enforced" - the
 * shape the test suite uses, since its fixtures mint fresh ObjectIds every run.
 */
export const EXPECTED_EXCLUSIONS = {
  danglingRefs: [
    '6a2a278b9b43afe5dfb18cab',
    '6a2a27d2f7a15631cf65b9b1',
    '6a30b3b6320d6d1379ef854e',
    '6a30b400ee128b5ed23f52f5',
  ],
  maxDangling: 4,
  maxNull: 4,
  maxMissing: 4,
};

/**
 * CM-6's manual pairing table. EXPLICIT AND HAND-CONFIRMED, one row per live `game_sessions`
 * document, each citing the evidence an ST would use - the session's own date and its own
 * self-description, against the chapter's own label and its own `loaded_at`. Deliberately NOT an
 * automated match-by-`game_number`: cycle-model.md §11a records that exactly that inference has
 * already produced two separate live bugs this cycle.
 *
 * Gathered from a read-only query against live `tm_suite`, 2026-08-17. Every row is re-verified
 * against the database at plan time (`planGameSessionPairing`): a session or chapter whose
 * `game_number`/`session_date`/`label` no longer matches what is recorded here is a REFUSAL, not
 * a silently-updated row. A row whose `_id`s are simply absent (running against `tm_suite_test`,
 * for instance) is reported as `absent` and skipped, never guessed at.
 *
 * `game_number` here is recorded EVIDENCE, not the join key. Nothing in the plan derives a pairing
 * from it; it is checked, the way a date is checked.
 *
 * REVIEW FINDING, 2026-08-17, and the `confidence` field it added. Four of these seven rows rest on
 * label/`game_number` congruence alone - which is the SAME inference `cycle-model.md` §11a blames
 * for two live bugs this cycle, merely hand-transcribed instead of automated. Those four now
 * declare `confidence: 'needs-st-eyes'` rather than pretending otherwise. `planGameSessionPairing`
 * upgrades any row to `'corroborated'` when the chapter's own `session_id` (the ST-editable reverse
 * link in the admin Cycle tab, `public/js/admin/cycle-views.js:659`) independently agrees, and
 * REFUSES outright when it disagrees. `main()` prints the remaining `needs-st-eyes` rows loudly
 * before `--apply`, and the report carries them as `pairingConfidence`.
 */
export const PAIRING_CONFIDENCE = {
  /** Independent, non-`game_number` evidence recorded in the row itself. */
  CORROBORATED: 'corroborated',
  /** Label/`game_number` congruence only. An ST must confirm the row before --apply. */
  NEEDS_ST_EYES: 'needs-st-eyes',
};

export const GAME_SESSION_PAIRINGS = [
  {
    sessionId: '69ccd6e4327efb46ce373f45',
    chapterId: '69f2dc48a77e2f00eb39a43c',
    sessionGameNumber: 1,
    sessionDate: '2026-02-21',
    chapterGameNumber: 1,
    chapterLabel: 'Game 1',
    confidence: 'needs-st-eyes',
    evidence:
      "Session played 2026-02-21 and titled 'Game 1'; the chapter document is labelled 'Game 1' " +
      'and carries game_number 1. Its own downtime opened 2026-02-28, a week AFTER the game - ' +
      'which is the off-by-one this migration exists to correct, not evidence against the pairing: ' +
      'the pairing is game-to-chapter, and Chapter 1 contains Game 1 by definition (cycle-model.md §6).',
  },
  {
    sessionId: '69ccd95f327efb46ce373f46',
    chapterId: '69d0a3c5052b57f6be774e69',
    sessionGameNumber: 2,
    sessionDate: '2026-03-21',
    chapterGameNumber: 2,
    chapterLabel: 'Game 2',
    confidence: 'needs-st-eyes',
    evidence:
      "Session played 2026-03-21 and titled 'Game 2'; the chapter document is labelled 'Game 2' " +
      'and carries game_number 2.',
  },
  {
    sessionId: '69e21a343205c7c7574c769e',
    chapterId: '69e955c784bbfc821bed2810',
    sessionGameNumber: 3,
    sessionDate: '2026-04-18',
    chapterGameNumber: 3,
    chapterLabel: 'Game 3',
    confidence: 'needs-st-eyes',
    evidence:
      "Session played 2026-04-18 and titled 'Game 3'; the chapter document is labelled 'Game 3' " +
      'and carries game_number 3. This chapter is also story_cycles(Story 1).final_chapter_id, ' +
      'which cm-3 set by hand - independent corroboration that it is the Story-1 finale, i.e. Game 3.',
  },
  {
    sessionId: '69e998779061c095792fd40c',
    chapterId: '6a11a3814fce658310cdee80',
    sessionGameNumber: 4,
    sessionDate: '2026-05-23',
    chapterGameNumber: 4,
    chapterLabel: 'Game 4',
    confidence: 'corroborated',
    evidence:
      "Session played 2026-05-23, self-described chapter_label 'Ch 2, Game 4'; the chapter " +
      "document is labelled 'Game 4' and carries game_number 4. The chapter's loaded_at is " +
      '2026-05-23T12:54Z, the same calendar day as the session.',
  },
  {
    sessionId: '6a1676167fb601cb0460a67e',
    chapterId: '6a373813efee90c8c11fff74',
    sessionGameNumber: 5,
    sessionDate: '2026-06-20',
    chapterGameNumber: 5,
    chapterLabel: 'Game 5',
    confidence: 'corroborated',
    evidence:
      "Session played 2026-06-20, self-described chapter_label 'Story 2, Chapter 2'; the chapter " +
      "document is labelled 'Game 5' and carries game_number 5, loaded_at 2026-06-21T01:02Z - the " +
      'morning after the game, which is when the ST opens the following downtime. Date adjacency ' +
      'here is independent of game_number and corroborates the pairing on its own.',
  },
  {
    sessionId: '6a3c99618715a5abbf7babc1',
    chapterId: '6a57581d08c8efbdee14ca71',
    sessionGameNumber: 6,
    sessionDate: '2026-07-18',
    chapterGameNumber: 6,
    chapterLabel: 'Game 6',
    confidence: 'needs-st-eyes',
    evidence:
      "Session played 2026-07-18, self-described chapter_label 'Game 6'; the chapter document is " +
      "labelled 'Game 6' and carries game_number 6.",
  },
  {
    sessionId: '6a7ffff54f02ce8035b75d5b',
    chapterId: '6a7ff9544f02ce8035b75d5a',
    sessionGameNumber: 7,
    sessionDate: '2026-08-15',
    chapterGameNumber: 7,
    chapterLabel: 'Game 7',
    confidence: 'corroborated',
    evidence:
      "Session played 2026-08-15, self-described chapter_label 'Game 7'; the chapter document is " +
      "labelled 'Game 7' and carries game_number 7. The two documents were created 28 minutes " +
      'apart on the day of the game (chapter _id timestamp 05:29:55Z, session _id timestamp ' +
      '05:58:13Z) - the ST opening the chapter and then the sign-in sheet in one sitting.',
  },
];

/**
 * The facts `runFactMapCheck` is TOLD to expect to move.
 *
 * DELIBERATELY EMPTY, and that is a finding rather than an omission. cm-7's coverage set
 * (`COVERAGE_SET` in `cm-7-fact-map.mjs`) tracks chapter identity and ordering plus the
 * `game_sessions` correspondence - `game_number`, `label`, `phase`/`game_phase`/`status`, the
 * archive and story-tab orders, the continuity seam, the duplicate set, the session labels. This
 * migration touches NONE of them: it re-points `downtime_submissions.chapter_id`, adds two new
 * fields to one chapter document, and adds one new field to seven `game_sessions` documents.
 * cycle-model.md §6 states the invariant positively - "every human-visible game number must read
 * IDENTICALLY before and after ... any game number that shifts is a defect the harness must
 * catch, not a permitted outcome" - so an empty expected-diff set is the CORRECT gate here, not a
 * weak one.
 *
 * What that leaves is the risk AC3 is actually pointing at: an allowlist mechanism that is never
 * exercised proves nothing, and "assert nothing changed" is the wrong invocation shape for a real
 * transformation. Two things close that, and neither is this list:
 *
 *   - `runGatedFactMapCheck` FAILS on a declared expectation that did not occur, so a stale entry
 *     here can never rot into a silent pass. The mechanism is exercised for real by this story's
 *     own suite, with a deliberately non-empty expectation set.
 *   - The facts that genuinely DO move are gated separately and just as falsifiably, by
 *     `buildAttachmentMap`/`runAttachmentCheck` below, against the plan's own enumerated
 *     prediction rather than against "did anything change".
 *
 * Shape of an entry, if a future migration needs one:
 *   { id: 'short-name', pattern: /regex matched against a runFactMapCheck failure string/,
 *     reason: 'why this diff is intended' }
 */
export const EXPECTED_FACT_DIFFS = [];

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * PURE. BSON-aware reference equality for a foreign key. Issue #497 left `chapter_id` stored as an
 * ObjectId on DT2+ submissions and as a plain STRING on DT1 ones, and that split is still live and
 * deliberately preserved (cm-2b's header). Every comparison in this file goes through here so both
 * storage types resolve to the same chapter, and `ObjectId('a') === 'a'` never silently fails the
 * way a raw `===` would.
 */
export function sameRef(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

/**
 * PURE. `'objectId'` or `'string'` - the storage type a value is currently held in.
 *
 * BOTH `_bsontype` spellings are accepted. The driver used `'ObjectID'` before bson 5 and uses
 * `'ObjectId'` from bson 5 on; review found the original checked only the pre-5 spelling, which
 * made that branch dead code against this project's own driver and left the `instanceof` fallback
 * as the only live path. `instanceof` is the one that fails across realms (a document decoded by a
 * second copy of the bson module), which is exactly what the `_bsontype` branch is for - so the
 * fix is to spell it correctly, not to delete it.
 */
export function refType(value) {
  if (value instanceof ObjectId) return 'objectId';
  if (value && typeof value === 'object' && (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID')) {
    return 'objectId';
  }
  return typeof value === 'string' ? 'string' : 'other';
}

/**
 * PURE. Re-encode a destination `_id` in the SAME storage type the submission's current FK used.
 * A migration that quietly promoted every DT1 string FK to an ObjectId would be changing storage
 * as a side effect of re-pointing, which no acceptance criterion asks for and which every
 * dual-type reader in this codebase would then be carrying dead weight for.
 */
export function encodeRefAs(destId, type) {
  return type === 'string' ? String(destId) : new ObjectId(String(destId));
}

/**
 * PURE. The identity subset of a chapter document that this migration must leave untouched.
 * Compared through cm-2b's BSON-aware `canonicalJSON`, so an ObjectId-valued `story_cycle_id`
 * genuinely compares as itself rather than as `{}`.
 *
 * `story_cycle_id` is in here on purpose: cm-3's Story membership is a SEPARATE FK from the
 * renumber's own `chapter_id` reassignment, and "confirm this holds rather than assume it" is an
 * explicit requirement of this story ("What this story IS", item 2).
 */
export function chapterIdentity(doc) {
  return canonicalJSON({
    game_number: doc?.game_number ?? null,
    label: doc?.label ?? null,
    status: doc?.status ?? null,
    phase: doc?.phase ?? null,
    game_phase: doc?.game_phase ?? null,
    story_cycle_id: doc?.story_cycle_id ?? null,
  });
}

// ── The plan ─────────────────────────────────────────────────────────────────

/**
 * Read `chapters`, `downtime_submissions` and `game_sessions`, and build the complete plan.
 *
 * PURE with respect to the database: reads only, no writes, so `main()` can print the whole thing
 * before anyone decides to run it. The `db` handle is an ARGUMENT rather than resolved internally,
 * so a test can hand over `tm_suite_test` and this can never reach live data by accident - the
 * same discipline `cm-2`, `cm-2b` and `cm-7-fact-map.mjs` all hold to.
 *
 * Keyed off `game_number`, NEVER off hardcoded `_id`s (AC1) and never off `_id` order or
 * `created_at`, which §6's "trap that must not be reused" disqualifies outright: sorting the live
 * chapters by `_id` yields game order 2, 3, 1, 4, 5 because DT1 was re-imported.
 *
 * SCOPING. `chapterFilter`/`submissionFilter`/`sessionFilter` default to `{}` (everything), which
 * is what a real run wants. They exist for the same reason `buildFactMap`'s own filters do: a test
 * can scope a plan to its own fixture-marked documents in the shared `tm_suite_test` database
 * without another suite's leftovers being read as a gap, a duplicate or a phantom. A live run
 * passes none of them, so the guards below always see the whole collection.
 *
 * @param {import('mongodb').Db} db
 * @param {{ pairings?: Array<object>, chapterFilter?: object, submissionFilter?: object,
 *           sessionFilter?: object }} [opts] - `pairings` is the pairing-table override, so a test
 *   can exercise CM-6 against its own fixture ids instead of the live table.
 */
export async function planRenumber(db, {
  pairings = GAME_SESSION_PAIRINGS,
  chapterFilter = {},
  submissionFilter = {},
  sessionFilter = {},
  expectedExclusions = EXPECTED_EXCLUSIONS,
} = {}) {
  const empty = {
    chapters: [],
    moves: [],
    excluded: [],
    placeholder: null,
    sessionPairings: [],
    expectedCounts: new Map(),
    submissionIds: [],
    refusals: [],
    alreadyApplied: false,
    sourceIds: [],
    filters: { chapterFilter, submissionFilter, sessionFilter },
  };

  const refusals = [];

  // ── Guard 0: has cm-2b's own --apply landed? ──────────────────────────────
  // Evaluated FIRST and returned early. This script is written entirely against the post-cm-2b
  // names. Against a pre-cm-2b database every subsequent computation would silently find nothing
  // and report a confident, empty, WRONG plan. Refusing is the only honest answer; guessing the
  // field name would be exactly the "silently write against stale field names" failure this
  // story's own Task 1 forbids.
  const collections = (await db.listCollections().toArray()).map(c => c.name);
  const legacyPresent = collections.includes('downtime_cycles');
  const stillLegacyFk = await db
    .collection(SUBMISSIONS_COLLECTION)
    .countDocuments({ ...submissionFilter, [LEGACY_FK_FIELD]: { $exists: true } });
  if (!collections.includes(CHAPTERS_COLLECTION) || stillLegacyFk > 0) {
    refusals.push({
      kind: 'pre-cm-2b',
      detail:
        `This database has not had cm-2b's --apply run against it: ` +
        `${collections.includes(CHAPTERS_COLLECTION) ? `'${CHAPTERS_COLLECTION}' exists` : `there is no '${CHAPTERS_COLLECTION}' collection`}` +
        `${legacyPresent ? `, 'downtime_cycles' still exists` : ''}` +
        `, and ${stillLegacyFk} ${SUBMISSIONS_COLLECTION} document(s) still carry ` +
        `'${LEGACY_FK_FIELD}'. cm-4 is written entirely against the post-cm-2b names ` +
        `('${CHAPTERS_COLLECTION}', '${FK_FIELD}') and REFUSES rather than guessing which field ` +
        `to shift. Run cm-2b's own --apply first (it is gated on TM Cockpit coordination - see ` +
        `specs/cm-2b-cross-repo-coordination.md), then re-run this.`,
    });
    return { ...empty, refusals, preCm2b: true };
  }

  const chapterDocs = await db.collection(CHAPTERS_COLLECTION).find(chapterFilter).toArray();

  // ── Guard 0b: the collection must actually HOLD chapters. ─────────────────
  // REVIEW FINDING, 2026-08-17, triple-confirmed by all three review layers. Guard 0 above only
  // checks that the collection NAME exists. With zero chapter documents (or zero matching the
  // filter) every subsequent computation loops over nothing: `gameNumbers.length &&`
  // short-circuits the sequence-start check, the gap loop never iterates, `expectedCounts` is
  // empty, and the function returned `refusals: []` with "0 to move" and exit code 0 - a
  // confident, refusal-free, empty plan, which is precisely what this header's "refusing is the
  // only honest answer" says must never happen.
  if (chapterDocs.length === 0) {
    refusals.push({
      kind: 'no-chapters',
      detail:
        `The '${CHAPTERS_COLLECTION}' collection exists but holds NO document matching this run's ` +
        `filter (${JSON.stringify(chapterFilter)}). There is nothing to renumber, nothing to apply ` +
        `the Chapter-1 placeholder to, and no way to tell an empty database apart from a filter ` +
        `that matched nothing. An empty plan reported as a clean run is the single outcome this ` +
        `script's own header forbids, so this refuses instead.`,
    });
    return { ...empty, refusals };
  }

  // ── Guard 1: is `chapters` the collection this script was built for? ──────
  // `isStoryGroupingShaped` is cm-2b's own corrected POSITIVE check. A Story-grouping sitting in
  // `chapters` means cm-2's --drop-source never ran and this is still cm-2's OLD collection.
  for (const doc of chapterDocs) {
    if (!isStoryGroupingShaped(doc)) continue;
    refusals.push({
      kind: 'source-shape',
      _id: String(doc._id),
      detail:
        `${CHAPTERS_COLLECTION} _id ${String(doc._id)} is a cm-2-era STORY-GROUPING document ` +
        `({ number, label, created_at }), not a Chapter. THIS DOES NOT LOOK LIKE THE COLLECTION ` +
        `THIS SCRIPT WAS BUILT FOR. Work out how it got there before doing anything else.`,
    });
  }
  if (refusals.length) return { ...empty, refusals, wrongShape: true };

  // ── Guard 2: idempotency, over BOTH markers. ──────────────────────────────
  // See the header's "IDEMPOTENCY, AND WHY IT NEEDS TWO MARKERS". The in-progress marker is
  // checked FIRST and on its own, because it is the one that catches a run which died before it
  // completed any single source chapter's moves - the case the first pass could not see at all.
  const inProgress = chapterDocs.filter(d => d[IN_PROGRESS_FIELD] != null);
  const stamped = chapterDocs.filter(d => d[MARKER_FIELD] != null);
  if (inProgress.length) {
    refusals.push({
      kind: 'interrupted-apply',
      detail:
        `${inProgress.length} of ${chapterDocs.length} ${CHAPTERS_COLLECTION} document(s) still ` +
        `carry '${IN_PROGRESS_FIELD}' (${inProgress.map(d => `${String(d._id)}@game_number=${d.game_number}=${d[IN_PROGRESS_FIELD]}`).join(', ')}), ` +
        `and ${stamped.length} carry '${MARKER_FIELD}'. An --apply started against this database ` +
        `and did NOT finish cleanly: it either threw part way through, or its post-write gates / ` +
        `verification came back red. Re-planning from here would shift the already-moved ` +
        `submissions a SECOND time. --invert using THAT run's plan file, or restore the backup, ` +
        `before running anything else. Clearing the marker by hand is not a fix; it is the ` +
        `evidence.`,
    });
    return { ...empty, refusals };
  }
  if (stamped.length && stamped.length === chapterDocs.length) {
    return {
      ...empty,
      chapters: chapterDocs.map(d => ({ _id: String(d._id), game_number: d.game_number ?? null, label: d.label ?? null })),
      alreadyApplied: true,
    };
  }
  if (stamped.length) {
    refusals.push({
      kind: 'partial-apply',
      detail:
        `${stamped.length} of ${chapterDocs.length} ${CHAPTERS_COLLECTION} document(s) already ` +
        `carry '${MARKER_FIELD}' (${stamped.map(d => `${String(d._id)}@game_number=${d.game_number}`).join(', ')}). ` +
        `The stamp is written PROGRESSIVELY, one source chapter at a time as its own moves land, ` +
        `so a partial stamp set means an earlier --apply moved exactly those chapters' ` +
        `submissions and then stopped. Re-planning from here would shift them a SECOND time. ` +
        `Restore from the backup, or --invert using that run's plan file, before running anything ` +
        `else.`,
    });
    return { ...empty, refusals };
  }

  // ── Guard 3: every chapter must carry an INTEGER game_number. ─────────────
  // `Number.isInteger`, not `typeof === 'number'` (review finding, 2026-08-17). The gap-detection
  // loop below steps by 1 from the lowest integer, so a chapter at e.g. game_number 6.5 was
  // invisible to it, had no `+1` destination to resolve, and fell straight into the "terminal
  // chapter, stays put" branch - keeping its submissions exactly where they were while every
  // other chapter shifted, with no refusal and nothing in the report to say so.
  for (const doc of chapterDocs) {
    if (Number.isInteger(doc.game_number)) continue;
    refusals.push({
      kind: 'no-game-number',
      _id: String(doc._id),
      detail:
        `${CHAPTERS_COLLECTION} _id ${String(doc._id)} has no INTEGER game_number ` +
        `(${JSON.stringify(doc.game_number)}). game_number is the ONLY ordering field this epic's ` +
        `tooling may use (§6, "the trap that must not be reused" - creation order is not game ` +
        `order), and the +1 shift is defined over integers, so this document cannot be placed in ` +
        `the renumber sequence and any submissions attached to it would be silently left behind.`,
    });
  }
  if (refusals.length) return { ...empty, refusals };

  // ── Guard 4: no duplicate game_number. ────────────────────────────────────
  // The real, previously-occurring incident: the duplicate "Game 7" document from the Game 7
  // crisis. With two chapters at game_number N, "the submissions on N move to N+1" has no single
  // answer in either direction.
  const byGameNumber = new Map();
  for (const doc of chapterDocs) {
    const list = byGameNumber.get(doc.game_number) || [];
    list.push(doc);
    byGameNumber.set(doc.game_number, list);
  }
  for (const [n, list] of byGameNumber) {
    if (list.length < 2) continue;
    refusals.push({
      kind: 'duplicate-game-number',
      detail:
        `game_number ${n} is held by ${list.length} ${CHAPTERS_COLLECTION} documents ` +
        `(${list.map(d => String(d._id)).join(', ')}). The renumber's own "N moves to N+1" rule ` +
        `has no single answer while that is true. This is the shape of the live Game-7 duplicate ` +
        `incident; resolve it by hand first.`,
    });
  }

  // ── Guard 5: the sequence must be dense from 1. ───────────────────────────
  // Subsumes "a source chapter whose destination does not exist" (which would orphan every one of
  // its submissions), and is the PHANTOM-DOCUMENT guard in its correct form for this migration: a
  // chapter created out of band through the now-live POST /api/chapters either duplicates a
  // game_number (guard 4), lacks one (guard 3), is Story-grouping shaped (guard 1), or opens a
  // gap - which is this one.
  const gameNumbers = [...byGameNumber.keys()].sort((a, b) => a - b);
  const maxGameNumber = gameNumbers[gameNumbers.length - 1];
  if (gameNumbers.length && gameNumbers[0] !== 1) {
    refusals.push({
      kind: 'sequence-start',
      detail:
        `The lowest game_number in ${CHAPTERS_COLLECTION} is ${gameNumbers[0]}, not 1. The ` +
        `Chapter-1 placeholder (§5) is applied IN PLACE to the existing game_number: 1 document; ` +
        `there isn't one, so there is nothing to apply it to and the +1 shift has no defined ` +
        `starting point.`,
    });
  }
  for (let n = gameNumbers[0]; n < maxGameNumber; n += 1) {
    if (byGameNumber.has(n)) continue;
    refusals.push({
      kind: 'sequence-gap',
      detail:
        `${CHAPTERS_COLLECTION} has no document at game_number ${n}, but does have one at ` +
        `${maxGameNumber}. The renumber shifts each chapter's submissions to game_number + 1, so ` +
        `a gap means the chapter at ${n - 1} has no destination and its submissions would be ` +
        `orphaned. It is also the signature of a phantom chapter created out of band. Resolve by ` +
        `hand before re-running.`,
    });
  }

  // ── Guard 6: every chapter document is covered by the plan. ───────────────
  // The direct analogue of cm-2b's `targetPhantomRefusals` ("a target document with no source
  // counterpart"): a chapter this plan neither reads submissions from, writes submissions to, nor
  // stamps, is a document the migration would step straight past in silence. With guards 3-5 green
  // this cannot currently fire, which is the point - it is the assertion that says so out loud
  // rather than leaving it as an emergent property nobody checks.
  const coveredIds = new Set(chapterDocs.filter(d => typeof d.game_number === 'number' && byGameNumber.get(d.game_number)?.length === 1).map(d => String(d._id)));
  for (const doc of chapterDocs) {
    if (coveredIds.has(String(doc._id))) continue;
    refusals.push({
      kind: 'uncovered-chapter',
      _id: String(doc._id),
      detail:
        `${CHAPTERS_COLLECTION} _id ${String(doc._id)} is not covered by the plan (game_number ` +
        `${JSON.stringify(doc.game_number)}). Every chapter document must be a source, a ` +
        `destination, or the placeholder; one that is none of those would be stepped past in ` +
        `silence.`,
    });
  }

  if (refusals.length) return { ...empty, refusals };

  // ── The submission moves ──────────────────────────────────────────────────
  const chapterById = new Map(chapterDocs.map(d => [String(d._id), d]));
  const chapterByGameNumber = new Map([...byGameNumber].map(([n, list]) => [n, list[0]]));

  const subDocs = await db
    .collection(SUBMISSIONS_COLLECTION)
    .find(submissionFilter)
    .project({ [FK_FIELD]: 1, character_id: 1, character_name: 1, status: 1 })
    .toArray();

  const moves = [];
  const excluded = [];
  // The expected post-state grouping, keyed by chapter `_id` string. `verifyRenumber` checks the
  // real database against this, and `runAttachmentCheck` checks the attachment map against it.
  const expectedCounts = new Map();
  const bump = key => expectedCounts.set(key, (expectedCounts.get(key) || 0) + 1);

  for (const sub of subDocs) {
    const hasFk = Object.prototype.hasOwnProperty.call(sub, FK_FIELD);
    const ref = hasFk ? sub[FK_FIELD] : undefined;

    if (!hasFk) {
      excluded.push({ _id: String(sub._id), reason: 'missing-field', ref: null, character_id: sub.character_id == null ? null : String(sub.character_id), status: sub.status ?? null });
      continue;
    }
    if (ref === null || ref === undefined) {
      excluded.push({ _id: String(sub._id), reason: 'null', ref: null, character_id: sub.character_id == null ? null : String(sub.character_id), status: sub.status ?? null });
      continue;
    }
    const source = chapterById.get(String(ref));
    if (!source) {
      excluded.push({ _id: String(sub._id), reason: 'dangling', ref: String(ref), character_id: sub.character_id == null ? null : String(sub.character_id), status: sub.status ?? null });
      continue;
    }

    const dest = chapterByGameNumber.get(source.game_number + 1);
    if (!dest) {
      // The chapter at the highest game_number is a destination only. Whatever is already attached
      // to it stays exactly where it is (cm-4's Open Question 1, recommended default).
      bump(String(source._id));
      continue;
    }

    const type = refType(ref);
    moves.push({
      _id: String(sub._id),
      idValue: sub._id,
      from: String(source._id),
      fromValue: ref,
      to: String(dest._id),
      toValue: encodeRefAs(dest._id, type),
      refType: type,
      fromGameNumber: source.game_number,
      toGameNumber: dest.game_number,
      character_id: sub.character_id == null ? null : String(sub.character_id),
    });
    bump(String(dest._id));
  }

  // Chapters that end up with zero submissions still belong in the expectation, so a submission
  // that wrongly LANDS on one is caught rather than merely unremarked.
  for (const doc of chapterDocs) {
    const key = String(doc._id);
    if (!expectedCounts.has(key)) expectedCounts.set(key, 0);
  }

  // ── Guard 7: the exclusion set must be EXACTLY the characterised one. ─────
  // See `EXPECTED_EXCLUSIONS`. This is the guard that tells "a known non-production test artefact"
  // apart from "a real submission whose chapter is missing because `chapters` is only partially
  // populated". Without it a crashed `cm-2b --apply` that copied chapters 1-4 produces a dense,
  // gap-free, duplicate-free collection that passes every other guard, while 88 real submissions
  // are silently reclassified as dangling and dropped from the migration.
  if (expectedExclusions) {
    const byReason = { dangling: [], null: [], 'missing-field': [] };
    for (const e of excluded) (byReason[e.reason] || (byReason[e.reason] = [])).push(e);
    const ceilings = [
      ['dangling', expectedExclusions.maxDangling],
      ['null', expectedExclusions.maxNull],
      ['missing-field', expectedExclusions.maxMissing],
    ];
    for (const [reason, ceiling] of ceilings) {
      if (ceiling == null) continue;
      const got = byReason[reason].length;
      if (got <= ceiling) continue;
      refusals.push({
        kind: 'unexpected-exclusion',
        detail:
          `${got} '${reason}' ${SUBMISSIONS_COLLECTION} document(s) would be excluded, but the ` +
          `characterised set (cycle-model.md §6 precondition 1, live-confirmed 2026-08-16 and ` +
          `re-confirmed 2026-08-17) declares at most ${ceiling}. An exclusion set larger than the ` +
          `one that was actually characterised is the signature of a PARTIALLY POPULATED ` +
          `'${CHAPTERS_COLLECTION}' collection - real submissions whose chapter is simply missing, ` +
          `which this plan would then drop while reporting green. Ids: ` +
          `${byReason[reason].map(e => e._id).join(', ')}.`,
      });
    }
    if (Array.isArray(expectedExclusions.danglingRefs)) {
      const declared = new Set(expectedExclusions.danglingRefs.map(String));
      const strays = byReason.dangling.filter(e => !declared.has(String(e.ref)));
      if (strays.length) {
        refusals.push({
          kind: 'unexpected-exclusion',
          detail:
            `${strays.length} '${SUBMISSIONS_COLLECTION}' document(s) carry a dangling ` +
            `'${FK_FIELD}' that is NOT one of the four characterised values ` +
            `(${[...declared].join(', ')}): ` +
            `${strays.map(e => `${e._id} -> ${e.ref}`).join(', ')}. A dangling reference this ` +
            `story never characterised is a real submission pointing at a missing chapter until ` +
            `proven otherwise, not a test artefact to exclude in silence.`,
        });
      }
    }
  }

  // ── The Chapter-1 placeholder ─────────────────────────────────────────────
  const chapterOne = chapterByGameNumber.get(1);
  const placeholder = chapterOne
    ? {
        _id: String(chapterOne._id),
        idValue: chapterOne._id,
        game_number: chapterOne.game_number,
        label: chapterOne.label ?? null,
        status: chapterOne.status ?? null,
        note: PLACEHOLDER_NOTE,
        // Recorded so `--invert` restores the EXACT pre-state instead of assuming the fields were
        // absent. `undefined` here means "the key was not present at all", which the invert
        // reproduces with an $unset rather than a $set of null.
        preState: {
          [PLACEHOLDER_FIELD]: Object.prototype.hasOwnProperty.call(chapterOne, PLACEHOLDER_FIELD)
            ? chapterOne[PLACEHOLDER_FIELD]
            : undefined,
          [PLACEHOLDER_NOTE_FIELD]: Object.prototype.hasOwnProperty.call(chapterOne, PLACEHOLDER_NOTE_FIELD)
            ? chapterOne[PLACEHOLDER_NOTE_FIELD]
            : undefined,
        },
        alreadyPlaceholder:
          chapterOne[PLACEHOLDER_FIELD] === true && chapterOne[PLACEHOLDER_NOTE_FIELD] === PLACEHOLDER_NOTE,
      }
    : null;

  // ── The derived downtime fields (Angelus's ruling on the 2026-08-17 review) ─
  const derived = planDerivedDowntimeFields({ chapterDocs, chapterByGameNumber, expectedCounts });

  // ── CM-6: game_sessions pairing ───────────────────────────────────────────
  const sessionPlan = await planGameSessionPairing(db, { pairings, chapterDocs, sessionFilter });
  refusals.push(...sessionPlan.refusals);

  // The chapter identity pre-image, for `verifyRenumber`'s "nothing else moved" assertion.
  const identityPre = {};
  for (const doc of chapterDocs) identityPre[String(doc._id)] = chapterIdentity(doc);

  return {
    chapters: chapterDocs.map(d => ({ _id: String(d._id), game_number: d.game_number, label: d.label ?? null, status: d.status ?? null })),
    sourceIds: chapterDocs.map(d => String(d._id)),
    moves,
    excluded,
    placeholder,
    derived: derived.rows,
    derivedUnmovedNotes: derived.unmovedNotes,
    sessionPairings: sessionPlan.rows,
    sessionAbsent: sessionPlan.absent,
    sessionOrphans: sessionPlan.orphans,
    expectedCounts,
    identityPre,
    submissionIds: subDocs.map(s => s._id),
    maxGameNumber,
    refusals,
    alreadyApplied: false,
    preCm2b: false,
    wrongShape: false,
    filters: { chapterFilter, submissionFilter, sessionFilter },
  };
}

/**
 * PURE - no database access at all. Plans the recompute of the six derived downtime fields
 * (`DERIVED_DOWNTIME_FIELDS`) on every chapter in the shift sequence.
 *
 * Added 2026-08-17 on Angelus's ruling over the review finding that these fields go stale the
 * instant the submissions move and nothing notices - `submission_count` most visibly, since the
 * admin Downtime list renders it verbatim (`public/js/admin/downtime-views.js:1284`) and Chapter 1
 * would otherwise read "25 submissions" while holding zero.
 *
 * Two different kinds of recompute, for two different kinds of field:
 *
 *   - `submission_count` is DERIVED FROM THE POST-STATE, taking the plan's own `expectedCounts`
 *     prediction. That is the same number `verifyRenumber` and `runAttachmentCheck` independently
 *     assert against the real database afterwards, so a wrong count cannot survive the run.
 *   - the other five TRAVEL one hop, from the chapter at `game_number n - 1` to the chapter at
 *     `n`, exactly as the submissions do. Each of them is a property of the DOWNTIME - which
 *     disciplines were fed with, which ambience was confirmed and whether it was applied, who
 *     filed out of window, whether the regents confirmed feeding rights - and this migration's
 *     entire content is that the downtime moves +1. The lowest chapter in the sequence has no
 *     predecessor, so its five are UNSET: after the migration it is the Chapter-1 placeholder and
 *     holds no downtime at all.
 *
 * Deliberately NOT a re-derivation from submission bodies. `discipline_profile` is built
 * client-side in `public/js/admin/downtime-views.js`; a second implementation of it inside a
 * migration script is precisely the shape of bug this epic's reviews keep finding.
 *
 * @param {{ chapterDocs: Array<object>, chapterByGameNumber: Map<number, object>,
 *           expectedCounts: Map<string, number> }} args
 * @returns {{ rows: Array<object>, unmovedNotes: Array<object> }}
 */
export function planDerivedDowntimeFields({ chapterDocs, chapterByGameNumber, expectedCounts }) {
  const rows = [];
  const unmovedNotes = [];

  for (const doc of chapterDocs) {
    const id = String(doc._id);
    const predecessor = chapterByGameNumber.get(doc.game_number - 1) || null;

    const pre = {};
    for (const field of DERIVED_DOWNTIME_FIELDS) {
      pre[field] = Object.prototype.hasOwnProperty.call(doc, field) ? doc[field] : undefined;
    }

    const next = { [DERIVED_COUNT_FIELD]: expectedCounts.get(id) ?? 0 };
    for (const field of DERIVED_TRAVELLING_FIELDS) {
      next[field] = predecessor && Object.prototype.hasOwnProperty.call(predecessor, field)
        ? predecessor[field]
        : undefined;
    }

    const set = {};
    const unset = [];
    for (const field of DERIVED_DOWNTIME_FIELDS) {
      if (next[field] === undefined) {
        if (pre[field] !== undefined) unset.push(field);
      } else {
        set[field] = next[field];
      }
    }

    const changed = DERIVED_DOWNTIME_FIELDS.some(f => canonicalJSON(pre[f] ?? null) !== canonicalJSON(next[f] ?? null));

    rows.push({
      _id: id,
      idValue: doc._id,
      game_number: doc.game_number,
      fromGameNumber: predecessor ? predecessor.game_number : null,
      set,
      unset,
      pre,
      changed,
    });

    // The flagged inconsistency: `feeding_rights_confirmed` travels, its own input
    // `regent_confirmations` does not (outside the six the ruling enumerated). Named out loud per
    // affected chapter rather than left to be discovered.
    const hadConfirmations = Object.prototype.hasOwnProperty.call(doc, DERIVED_UNMOVED_INPUT_FIELD);
    const rightsMoves = canonicalJSON(pre.feeding_rights_confirmed ?? null) !== canonicalJSON(next.feeding_rights_confirmed ?? null);
    if (hadConfirmations && rightsMoves) {
      unmovedNotes.push({ _id: id, game_number: doc.game_number, field: DERIVED_UNMOVED_INPUT_FIELD });
    }
  }

  return { rows, unmovedNotes };
}

/**
 * CM-6's pairing planner. PURE with respect to the database: reads only.
 *
 * Every row of the hand-written table is CHECKED against the database rather than trusted:
 *   - the session must exist, and its `game_number` and `session_date` must be what the row says;
 *   - the chapter must exist, and its `game_number` and `label` must be what the row says;
 *   - the session must not already carry a DIFFERENT `chapter_id`;
 *   - no two rows may point at the same chapter (the partial unique index would reject it).
 * Any of those failing is a REFUSAL. A row whose two `_id`s are both simply absent is `absent` -
 * reported by name, skipped, never guessed at - which is what lets the live table sit in this file
 * while the suite runs against `tm_suite_test`.
 *
 * @param {import('mongodb').Db} db
 * @param {{ pairings?: Array<object>, chapterDocs?: Array<object>, sessionFilter?: object }} [opts]
 */
export async function planGameSessionPairing(db, { pairings = GAME_SESSION_PAIRINGS, chapterDocs = null, sessionFilter = {} } = {}) {
  const refusals = [];
  const rows = [];
  const absent = [];

  const chapters = chapterDocs || (await db.collection(CHAPTERS_COLLECTION).find({}).toArray());
  const chapterById = new Map(chapters.map(d => [String(d._id), d]));
  const sessions = await db.collection(SESSIONS_COLLECTION).find(sessionFilter).toArray();
  const sessionById = new Map(sessions.map(d => [String(d._id), d]));

  // Duplicate game_number among sessions is its own fault (cm-7's own review found the fact map
  // missing exactly this case on the session side), and it makes any per-game reasoning ambiguous.
  const sessionCountByGameNumber = new Map();
  for (const s of sessions) {
    if (s.game_number == null) continue;
    sessionCountByGameNumber.set(s.game_number, (sessionCountByGameNumber.get(s.game_number) || 0) + 1);
  }
  for (const [n, count] of sessionCountByGameNumber) {
    if (count < 2) continue;
    refusals.push({
      kind: 'duplicate-session-game-number',
      detail:
        `${SESSIONS_COLLECTION} has ${count} documents at game_number ${n}. The 1:1 chapter/session ` +
        `invariant this story enforces at the database level cannot be true while that is.`,
    });
  }

  // Every chapter reference ANY live session already holds, whether or not that session has a row
  // in the table. REVIEW FINDING, 2026-08-17 (Edge Case Hunter): `pairing-conflict` below only
  // asks whether a row's OWN named session already points somewhere else, and
  // `pairing-duplicate-chapter` only asks whether two ROWS collide. A session with no row at all,
  // already carrying a chapter reference from somewhere else, was checked by NEITHER - the plan
  // reported green, the pairing write went ahead, and `ensureSessionChapterIndex` then threw
  // E11000 after the submission moves and the placeholder write had already landed. That crash
  // site is exactly where the stamp-timing trap used to be, which is what made this a High.
  const chapterClaimedBySession = new Map();
  for (const s of sessions) {
    const ref = s[SESSION_FK_FIELD];
    if (ref === null || ref === undefined) continue;
    const key = String(ref);
    const list = chapterClaimedBySession.get(key) || [];
    list.push(String(s._id));
    chapterClaimedBySession.set(key, list);
  }

  const claimedChapters = new Map();
  for (const row of pairings) {
    const session = sessionById.get(row.sessionId);
    const chapter = chapterById.get(row.chapterId);

    if (!session && !chapter) {
      absent.push({ ...row, reason: 'neither the session nor the chapter exists in this database' });
      continue;
    }
    if (!session || !chapter) {
      refusals.push({
        kind: 'pairing-half-present',
        detail:
          `Pairing row (session ${row.sessionId} <-> chapter ${row.chapterId}) has exactly one of ` +
          `its two documents present in this database (${session ? 'session' : 'chapter'} only). ` +
          `That is not a database this hand-confirmed table describes; refusing rather than ` +
          `writing half a pairing.`,
      });
      continue;
    }

    const mismatches = [];
    if (session.game_number !== row.sessionGameNumber) {
      mismatches.push(`session.game_number is ${JSON.stringify(session.game_number)}, table says ${row.sessionGameNumber}`);
    }
    if (session.session_date !== row.sessionDate) {
      mismatches.push(`session.session_date is ${JSON.stringify(session.session_date)}, table says '${row.sessionDate}'`);
    }
    if (chapter.game_number !== row.chapterGameNumber) {
      mismatches.push(`chapter.game_number is ${JSON.stringify(chapter.game_number)}, table says ${row.chapterGameNumber}`);
    }
    if ((chapter.label ?? null) !== row.chapterLabel) {
      mismatches.push(`chapter.label is ${JSON.stringify(chapter.label)}, table says '${row.chapterLabel}'`);
    }
    if (mismatches.length) {
      refusals.push({
        kind: 'pairing-mismatch',
        detail:
          `Pairing row (session ${row.sessionId} <-> chapter ${row.chapterId}) no longer matches ` +
          `the database: ${mismatches.join('; ')}. The table is hand-confirmed evidence, not a ` +
          `derivation - re-confirm it by hand rather than letting the script quietly follow the ` +
          `data. Row evidence was: ${row.evidence}`,
      });
      continue;
    }

    const existing = session[SESSION_FK_FIELD];
    if (existing != null && !sameRef(existing, chapter._id)) {
      refusals.push({
        kind: 'pairing-conflict',
        detail:
          `${SESSIONS_COLLECTION} _id ${row.sessionId} already carries ${SESSION_FK_FIELD}=` +
          `'${String(existing)}', which is not the chapter this table pairs it with ` +
          `(${row.chapterId}). Refusing to overwrite a pairing somebody else set.`,
      });
      continue;
    }

    const prior = claimedChapters.get(row.chapterId);
    if (prior) {
      refusals.push({
        kind: 'pairing-duplicate-chapter',
        detail:
          `Pairing table points BOTH session ${prior} and session ${row.sessionId} at chapter ` +
          `${row.chapterId}. The partial unique index this story adds would reject the second ` +
          `write; the table is wrong.`,
      });
      continue;
    }

    // The third collision case, invisible to both checks above: a session with NO row in this
    // table that already holds this chapter's reference.
    const otherClaimants = (chapterClaimedBySession.get(row.chapterId) || []).filter(id => id !== row.sessionId);
    if (otherClaimants.length) {
      refusals.push({
        kind: 'pairing-chapter-claimed',
        detail:
          `${SESSIONS_COLLECTION} _id ${otherClaimants.join(', ')} already carr${otherClaimants.length === 1 ? 'ies' : 'y'} ` +
          `${SESSION_FK_FIELD}='${row.chapterId}', which this table pairs with a DIFFERENT session ` +
          `(${row.sessionId}). No row in this table names ${otherClaimants.join(', ')}, so neither ` +
          `the per-row conflict check nor the row-vs-row duplicate check would see it - but the ` +
          `partial unique index would, with an E11000 thrown AFTER the submission moves had ` +
          `already landed. Resolve the stray pairing by hand first.`,
      });
      continue;
    }
    claimedChapters.set(row.chapterId, row.sessionId);

    // The chapter's OWN reverse link, `chapters.session_id` - an existing, ST-editable pairing
    // surface in the admin Cycle tab (`public/js/admin/cycle-views.js:659`). REVIEW FINDING,
    // 2026-08-17 (Acceptance Auditor): the hand-curated table never read it, so this migration
    // could add a second, CONTRADICTING session-to-chapter link with nothing anywhere to flag the
    // disagreement. It is now cross-referenced on every row: a disagreement REFUSES, and an
    // agreement is genuinely independent corroboration, which is what upgrades a row's confidence.
    const reverse = chapter.session_id;
    let reverseLink = 'absent';
    if (reverse !== null && reverse !== undefined) {
      if (sameRef(reverse, session._id)) {
        reverseLink = 'agrees';
      } else {
        refusals.push({
          kind: 'pairing-session-id-disagreement',
          detail:
            `${CHAPTERS_COLLECTION} _id ${row.chapterId} carries its own session_id='${String(reverse)}', ` +
            `but this hand-confirmed table pairs it with session ${row.sessionId}. Two ` +
            `session-to-chapter links that disagree is not something to resolve by writing a third ` +
            `one: the Cycle tab's own picker set that value, so an ST has to say which is right ` +
            `before ${SESSION_FK_FIELD} is written. Row evidence was: ${row.evidence}`,
        });
        continue;
      }
    }

    const declaredConfidence = row.confidence || PAIRING_CONFIDENCE.NEEDS_ST_EYES;
    rows.push({
      sessionId: row.sessionId,
      sessionIdValue: session._id,
      chapterId: row.chapterId,
      chapterIdValue: chapter._id,
      sessionDate: row.sessionDate,
      chapterLabel: row.chapterLabel,
      evidence: row.evidence,
      declaredConfidence,
      reverseLink,
      // The reverse link is evidence the table itself never claimed, so it can only ever RAISE a
      // row's confidence, never lower one that already had independent evidence of its own.
      confidence: reverseLink === 'agrees' ? PAIRING_CONFIDENCE.CORROBORATED : declaredConfidence,
      noop: sameRef(existing, chapter._id),
    });
  }

  // Orphans: a session with no row in the table at all. Reported, never auto-paired.
  const pairedSessionIds = new Set(rows.map(r => r.sessionId));
  const absentSessionIds = new Set(absent.map(a => a.sessionId));
  const orphans = sessions
    .filter(s => !pairedSessionIds.has(String(s._id)) && !absentSessionIds.has(String(s._id)))
    .map(s => ({ _id: String(s._id), game_number: s.game_number ?? null, session_date: s.session_date ?? null }));

  return { rows, absent, orphans, refusals };
}

// ── The attachment map: the facts this migration genuinely DOES move ─────────

/**
 * Read-only. A second, cm-4-specific fact map covering the one thing the cm-7 coverage set does
 * not: which chapter each downtime submission is attached to.
 *
 * `buildFactMap` deliberately snapshots `chapters` and `game_sessions` only, because the facts it
 * was built to protect are the human-visible game numbers and labels. This migration's whole
 * effect is on `downtime_submissions.chapter_id`, so gating it on `runFactMapCheck` ALONE would be
 * gating it on a set of facts it never touches. This is the other half.
 *
 * @param {import('mongodb').Db} db
 * @param {{ submissionFilter?: object }} [opts]
 */
export async function buildAttachmentMap(db, { submissionFilter = {} } = {}) {
  const subs = await db
    .collection(SUBMISSIONS_COLLECTION)
    .find(submissionFilter)
    .project({ [FK_FIELD]: 1 })
    .toArray();

  // `bySubmission` is keyed TYPE-AWARE, through cm-2b's own `canonicalJSON`.
  //
  // REVIEW FINDING, 2026-08-17 (Edge Case Hunter). The first pass stored `String(ref)` here and
  // compared those strings in `runAttachmentCheck`, which means the ONE storage-type change this
  // gate exists to catch - a submission's FK silently promoted from a plain string to an ObjectId,
  // or demoted, during the write - read as "unchanged". That is the same class of bug cm-2b's own
  // review found and fixed inside `canonicalJSON` itself; reintroducing it in a different function
  // one story later is exactly what the import is meant to prevent, so the comparison now runs
  // through the imported, review-corrected implementation rather than a raw cast.
  //
  // `chapterOf` keeps the plain string form alongside it, because the per-chapter COUNTS have to
  // group an ObjectId FK and a string FK pointing at the same chapter together - #497's split is
  // still live and both really are the same chapter. Two maps, two questions: "did this
  // submission's stored value change at all" and "how many submissions does this chapter hold".
  const bySubmission = {};
  const chapterOf = {};
  const byChapter = {};
  const unattached = [];
  for (const s of subs) {
    const hasFk = Object.prototype.hasOwnProperty.call(s, FK_FIELD);
    const ref = hasFk ? s[FK_FIELD] : undefined;
    if (ref === null || ref === undefined) {
      bySubmission[String(s._id)] = null;
      chapterOf[String(s._id)] = null;
      unattached.push(String(s._id));
      continue;
    }
    const key = String(ref);
    bySubmission[String(s._id)] = canonicalJSON(ref);
    chapterOf[String(s._id)] = key;
    byChapter[key] = (byChapter[key] || 0) + 1;
  }

  return { bySubmission, chapterOf, byChapter, unattached: unattached.sort(), total: subs.length };
}

/**
 * Diff two attachment maps against the plan's own PREDICTION, not against "did anything change".
 *
 * FALSIFIABLE BY CONSTRUCTION, the same discipline `runFactMapCheck` holds to (cycle-model.md §6
 * precondition 2): the comparison count is derived from the pre-image's own size, so a snapshot
 * that silently came back empty throws rather than reporting a false green over zero comparisons.
 *
 * Every submission in the pre-image is checked against exactly one enumerated expectation:
 *   - it is in `plan.moves`, so its post-image attachment must be that move's `to`;
 *   - it is in `plan.excluded`, so its post-image attachment must be byte-identical to its
 *     pre-image one (the 12 unattachable submissions are written to in NO way at all);
 *   - it is neither, so it sits on the highest-game_number chapter and must not have moved.
 *
 * @returns {{ ok: boolean, failures: string[], comparisons: number }}
 */
export function runAttachmentCheck(pre, post, plan) {
  const preIds = Object.keys(pre.bySubmission);
  if (preIds.length === 0) {
    throw new Error(
      'runAttachmentCheck: pre-image holds 0 submissions - nothing to compare. A run that would ' +
        'report "0 failures" over 0 real comparisons fails hard instead, per cycle-model.md §6 ' +
        'precondition 2.'
    );
  }

  const failures = [];
  let comparisons = 0;

  const moveById = new Map(plan.moves.map(m => [m._id, m]));
  const excludedById = new Map((plan.excluded || []).map(e => [e._id, e]));

  for (const id of preIds) {
    comparisons += 1;
    const before = pre.bySubmission[id];
    const after = post.bySubmission[id];

    if (!(id in post.bySubmission)) {
      failures.push(`submission ${id}: present pre-image, missing post-image.`);
      continue;
    }

    const move = moveById.get(id);
    if (move) {
      // Compared against the move's own recorded `toValue` through the SAME type-aware encoding,
      // so a move that landed on the right chapter but silently changed storage type on the way
      // (string -> ObjectId) is a failure, not a pass. `toValue` is present on a live plan and on
      // a plan round-tripped through `deserializePlan`; the `move.to` fallback keeps an
      // older-shaped plan readable rather than throwing.
      const want = move.toValue !== undefined ? canonicalJSON(move.toValue) : canonicalJSON(move.to);
      if (after !== want) {
        failures.push(
          `submission ${id}: planned move to chapter ${move.to} (game_number ` +
            `${move.fromGameNumber} -> ${move.toGameNumber}, stored as ${move.refType}) did not ` +
            `land - attachment is ${JSON.stringify(after)}, expected ${JSON.stringify(want)}.`
        );
      }
      continue;
    }

    if (excludedById.has(id)) {
      if (after !== before) {
        failures.push(
          `submission ${id} is on the EXCLUDED list (${excludedById.get(id).reason}) and must not ` +
            `have been written to, but its attachment moved from ${JSON.stringify(before)} to ` +
            `${JSON.stringify(after)}.`
        );
      }
      continue;
    }

    if (after !== before) {
      failures.push(
        `submission ${id} was not in the plan (it sits on the highest-game_number chapter) but ` +
          `its attachment moved from ${JSON.stringify(before)} to ${JSON.stringify(after)}.`
      );
    }
  }

  for (const id of Object.keys(post.bySubmission)) {
    comparisons += 1;
    if (!(id in pre.bySubmission)) {
      failures.push(`submission ${id}: present post-image, absent pre-image.`);
    }
  }

  // Per-chapter counts, against the plan's own expectation.
  //
  // Counted from `post.bySubmission` MINUS the excluded ids rather than from `post.byChapter`:
  // four of the twelve excluded submissions carry a DANGLING reference, so they appear in
  // `byChapter` under a key that is not a chapter at all. Counting those as "a chapter that
  // unexpectedly holds a submission" is noise, and noise in a migration gate is how a real signal
  // gets talked past.
  //
  // Counted off `chapterOf` (the plain-string form), NOT `bySubmission` (the type-aware form):
  // an ObjectId FK and a string FK pointing at the same chapter must count as the same chapter
  // here, which is the opposite of what the per-submission comparison above needs.
  const excludedIds = new Set((plan.excluded || []).map(e => e._id));
  const postCounts = new Map();
  for (const [id, key] of Object.entries(post.chapterOf || post.bySubmission)) {
    if (key === null || excludedIds.has(id)) continue;
    postCounts.set(key, (postCounts.get(key) || 0) + 1);
  }
  for (const [chapterId, want] of plan.expectedCounts) {
    comparisons += 1;
    const got = postCounts.get(chapterId) || 0;
    if (got !== want) {
      failures.push(`chapter ${chapterId} holds ${got} submission(s), the plan predicted ${want}.`);
    }
  }
  for (const [chapterId, got] of postCounts) {
    comparisons += 1;
    if (!plan.expectedCounts.has(chapterId)) {
      failures.push(`chapter ${chapterId} unexpectedly holds ${got} submission(s).`);
    }
  }

  return { ok: failures.length === 0, failures, comparisons };
}

/**
 * `runFactMapCheck` (IMPORTED from `cm-7-fact-map.mjs`, never reimplemented) with an enumerated
 * expected-diff allowlist layered on top.
 *
 * Two properties make this a gate rather than a rubber stamp:
 *   1. any failure NOT matching a declared expectation is `unexpected`, and fails the check;
 *   2. any declared expectation that matched NOTHING is `unmatchedExpectations`, and ALSO fails
 *      the check. An allowlist that silently tolerates a diff which stopped happening is how a
 *      migration gate rots into a no-op, and cm-7's own drill is the precedent for refusing that
 *      shape.
 *
 * @param {object} pre  - `buildFactMap` output taken before any write
 * @param {object} post - `buildFactMap` output taken after
 * @param {{ expected?: Array<{id: string, pattern: RegExp, reason: string}> }} [opts]
 */
export function runGatedFactMapCheck(pre, post, { expected = EXPECTED_FACT_DIFFS } = {}) {
  const base = runFactMapCheck(pre, post);

  // A `/g`-flagged pattern carries `lastIndex` state ACROSS `.test()` calls, so the same pattern
  // matched against a list of failures would alternately match and miss. Dormant today
  // (`EXPECTED_FACT_DIFFS` is empty), and a silently-skipped allowlist entry in a migration gate is
  // not a thing to leave to a future author's care - so reject the flag outright rather than
  // quietly resetting it and hoping.
  for (const e of expected) {
    if (e.pattern?.global || e.pattern?.sticky) {
      throw new Error(
        `runGatedFactMapCheck: expected fact diff '${e.id}' uses a /g or /y flagged pattern. Those ` +
          'carry lastIndex state between .test() calls, so the same pattern would alternately ' +
          'match and miss across a list of failures. Declare it without the flag.'
      );
    }
  }

  const hits = new Map(expected.map(e => [e.id, []]));
  const unexpected = [];
  for (const failure of base.failures) {
    const match = expected.find(e => e.pattern.test(failure));
    if (match) hits.get(match.id).push(failure);
    else unexpected.push(failure);
  }

  const unmatchedExpectations = expected
    .filter(e => hits.get(e.id).length === 0)
    .map(e => `expected fact diff '${e.id}' (${e.reason}) did not occur - the allowlist is stale.`);

  return {
    ok: unexpected.length === 0 && unmatchedExpectations.length === 0,
    comparisons: base.comparisons,
    expectedHits: Object.fromEntries([...hits].map(([id, list]) => [id, list.length])),
    unexpected,
    unmatchedExpectations,
    allFailures: base.failures,
  };
}

// ── Verify ───────────────────────────────────────────────────────────────────

/**
 * Verify the post-state. Reads only. Returns `{ ok, problems, warnings }`.
 *
 * SCOPED TO THE PLAN'S OWN SNAPSHOT wherever a live re-count could race. cm-2b's review found that
 * an unscoped live re-count against a plan-time expectation turns a player pressing Save during a
 * long `--apply` into "Verification FAILED after writing" - indistinguishable, at the console,
 * from genuine data loss. Every count here is over `plan.submissionIds`.
 */
export async function verifyRenumber(db, plan) {
  const problems = [];
  const warnings = [];

  const subs = db.collection(SUBMISSIONS_COLLECTION);
  const planned = plan.submissionIds || [];

  // 1. No submission this plan covered may still carry the pre-cm-2b field.
  const stillLegacy = await subs.countDocuments({ _id: { $in: planned }, [LEGACY_FK_FIELD]: { $exists: true } });
  if (stillLegacy > 0) {
    problems.push(`${stillLegacy} ${SUBMISSIONS_COLLECTION} document(s) from this plan carry '${LEGACY_FK_FIELD}'.`);
  }

  // 2. Per-chapter attachment counts, against the plan's own expectation. The excluded
  //    submissions are left out of the count for the same reason `runAttachmentCheck` leaves them
  //    out: four of them hold a DANGLING reference, which is not a chapter, and counting it as one
  //    would report permanent phantom "chapters" on every single run.
  const excludedIds = new Set((plan.excluded || []).map(e => e._id));
  const after = await subs.find({ _id: { $in: planned } }).project({ [FK_FIELD]: 1 }).toArray();
  const actual = new Map();
  for (const s of after) {
    const ref = s[FK_FIELD];
    if (ref === null || ref === undefined) continue;
    if (excludedIds.has(String(s._id))) continue;
    const key = String(ref);
    actual.set(key, (actual.get(key) || 0) + 1);
  }
  for (const [key, want] of plan.expectedCounts) {
    const got = actual.get(key) || 0;
    if (got !== want) problems.push(`Chapter ${key} holds ${got} submission(s), expected ${want}.`);
  }
  for (const [key, got] of actual) {
    if (!plan.expectedCounts.has(key)) problems.push(`Chapter ${key} unexpectedly holds ${got} submission(s).`);
  }

  // 3. The 12 excluded submissions were written to in no way at all.
  for (const row of plan.excluded || []) {
    const doc = await subs.findOne({ _id: new ObjectId(row._id) }, { projection: { [FK_FIELD]: 1 } });
    if (!doc) { problems.push(`Excluded submission ${row._id} has vanished.`); continue; }
    const hasFk = Object.prototype.hasOwnProperty.call(doc, FK_FIELD);
    const ref = hasFk ? doc[FK_FIELD] : undefined;
    const nowReason = !hasFk ? 'missing-field' : (ref === null || ref === undefined) ? 'null' : (plan.sourceIds.includes(String(ref)) ? 'attached' : 'dangling');
    if (nowReason !== row.reason) {
      problems.push(
        `Excluded submission ${row._id} was '${row.reason}' and is now '${nowReason}'. The 12 ` +
        `unattachable submissions must be written to in no way at all.`
      );
    }
  }

  // 4. Chapter identity, including cm-3's Story membership, is byte-identical.
  //    BSON-aware (cm-2b's corrected canonicalJSON), so an ObjectId-valued `story_cycle_id`
  //    compares as itself rather than as `{}`.
  const chapterDocs = await db.collection(CHAPTERS_COLLECTION).find(plan.filters?.chapterFilter || {}).toArray();
  for (const doc of chapterDocs) {
    const id = String(doc._id);
    const before = plan.identityPre?.[id];
    if (before === undefined) {
      problems.push(`${CHAPTERS_COLLECTION} _id ${id} was not in the plan's pre-image (created mid-run?).`);
      continue;
    }
    const now = chapterIdentity(doc);
    if (now !== before) {
      problems.push(
        `${CHAPTERS_COLLECTION} _id ${id} identity changed. This migration may only ADD ` +
        `'${PLACEHOLDER_FIELD}'/'${PLACEHOLDER_NOTE_FIELD}'/'${MARKER_FIELD}'. Was ${before}, now ${now}.`
      );
    }
  }
  for (const id of plan.sourceIds || []) {
    if (!chapterDocs.some(d => String(d._id) === id)) problems.push(`${CHAPTERS_COLLECTION} _id ${id} has vanished.`);
  }

  // 5. The placeholder landed, in place, on the existing game_number: 1 document.
  if (plan.placeholder) {
    const doc = chapterDocs.find(d => String(d._id) === plan.placeholder._id);
    if (!doc) problems.push(`Chapter-1 placeholder target ${plan.placeholder._id} is gone.`);
    else {
      if (doc[PLACEHOLDER_FIELD] !== true) problems.push(`Chapter-1 document ${plan.placeholder._id} does not carry ${PLACEHOLDER_FIELD}: true.`);
      if (doc[PLACEHOLDER_NOTE_FIELD] !== PLACEHOLDER_NOTE) problems.push(`Chapter-1 document ${plan.placeholder._id} has the wrong ${PLACEHOLDER_NOTE_FIELD}.`);
      if (doc.game_number !== 1) problems.push(`Chapter-1 placeholder document is no longer game_number 1.`);
    }
    const extraPlaceholders = chapterDocs.filter(d => d[PLACEHOLDER_FIELD] === true && String(d._id) !== plan.placeholder._id);
    for (const d of extraPlaceholders) {
      problems.push(`${CHAPTERS_COLLECTION} _id ${String(d._id)} also carries ${PLACEHOLDER_FIELD}: true. Exactly one placeholder is expected (§5).`);
    }
  }

  // 6. CM-6: pairings written, index present, no string-typed FK.
  const sessions = await db.collection(SESSIONS_COLLECTION).find(plan.filters?.sessionFilter || {}).toArray();
  const sessionById = new Map(sessions.map(s => [String(s._id), s]));
  for (const row of plan.sessionPairings || []) {
    const s = sessionById.get(row.sessionId);
    if (!s) { problems.push(`${SESSIONS_COLLECTION} _id ${row.sessionId} is gone.`); continue; }
    if (!sameRef(s[SESSION_FK_FIELD], row.chapterId)) {
      problems.push(`${SESSIONS_COLLECTION} _id ${row.sessionId} has ${SESSION_FK_FIELD}=${JSON.stringify(s[SESSION_FK_FIELD] ?? null)}, expected ${row.chapterId}.`);
    }
  }
  const stringTyped = sessions.filter(s => typeof s[SESSION_FK_FIELD] === 'string');
  for (const s of stringTyped) {
    warnings.push(
      `${SESSIONS_COLLECTION} _id ${String(s._id)} holds ${SESSION_FK_FIELD} as a STRING. The ` +
      `partial unique index covers objectId and string separately, so a string and an ObjectId ` +
      `form of the same chapter would both be allowed. This migration only ever writes ObjectId.`
    );
  }
  // Index creation and index verification now share ONE predicate (`shouldEnsureSessionIndex`).
  // They used different ones - create on pairings-OR-orphans, verify only on pairings - so a run
  // with orphans but no pairings created the index and then never checked it had appeared.
  if (shouldEnsureSessionIndex(plan)) {
    const names = (await db.collection(SESSIONS_COLLECTION).indexes()).map(i => i.name);
    if (!names.includes(SESSION_FK_INDEX_NAME)) {
      problems.push(`${SESSIONS_COLLECTION} has no '${SESSION_FK_INDEX_NAME}' index. The 1:1 invariant is convention again, not enforcement.`);
    }
  }

  // 7. The six derived downtime fields describe the submissions each chapter now actually holds.
  //    `submission_count` in particular is rendered verbatim by the admin Downtime list, so a
  //    stale one is a wrong number on a real screen, not an internal detail.
  const chapterDocById = new Map(chapterDocs.map(d => [String(d._id), d]));
  for (const row of plan.derived || []) {
    const doc = chapterDocById.get(row._id);
    if (!doc) continue;   // "has vanished" is already reported above
    for (const field of DERIVED_DOWNTIME_FIELDS) {
      const want = Object.prototype.hasOwnProperty.call(row.set, field) ? row.set[field] : undefined;
      const got = Object.prototype.hasOwnProperty.call(doc, field) ? doc[field] : undefined;
      if (canonicalJSON(want ?? null) === canonicalJSON(got ?? null)) continue;
      problems.push(
        `${CHAPTERS_COLLECTION} _id ${row._id} (game_number ${row.game_number}) has stale ` +
        `'${field}': it holds ${JSON.stringify(got ?? null)} but the post-migration value is ` +
        `${JSON.stringify(want ?? null)}. These six fields describe the chapter's DOWNTIME, which ` +
        `this migration moved.`
      );
    }
  }

  return { ok: problems.length === 0, problems, warnings };
}

/**
 * PURE. The single predicate deciding whether this run touches `game_sessions.chapter_id` at all,
 * and therefore whether the partial unique index is both CREATED and VERIFIED. One definition, so
 * the two can never drift apart again.
 */
export function shouldEnsureSessionIndex(plan) {
  return !!((plan.sessionPairings || []).length || (plan.sessionOrphans || []).length);
}

// ── Apply / invert ───────────────────────────────────────────────────────────

/**
 * Create the CM-6 partial unique index. Idempotent (`createIndex` is), and mirrored in
 * `server/index.js`'s own boot-time index block so a fresh deploy has it whether or not this
 * script has run.
 *
 * `partialFilterExpression` is `$type: ['objectId', 'string']` rather than the intuitive
 * `$ne: null`: MongoDB does not accept `$ne` in a partial filter, and `$exists: true` would INCLUDE
 * documents holding an explicit `null`, which would then collide with each other on the unique
 * key. `$type` is accepted, and it is exactly "unique where not null". Both storage types are
 * listed because issue #497's mixed ObjectId/string FK split is still live in this database.
 */
export async function ensureSessionChapterIndex(db) {
  return db.collection(SESSIONS_COLLECTION).createIndex(
    { [SESSION_FK_FIELD]: 1 },
    {
      name: SESSION_FK_INDEX_NAME,
      unique: true,
      background: true,
      partialFilterExpression: { [SESSION_FK_FIELD]: { $type: ['objectId', 'string'] } },
    },
  );
}

/**
 * Carry out (or, by default, merely narrate) the plan.
 *
 * Nothing at all is written while `plan.refusals` is non-empty - a refusal is a full stop for the
 * run, not a per-row skip, because every refusal condition describes a database whose shape the
 * plan no longer describes.
 *
 * WRITE ORDER. Submission moves run in DESCENDING source `game_number` (6->7 first, then 5->6, and
 * so on), so no submission ever transiently sits on a chapter that is still a pending source. Each
 * update is scoped to one submission `_id` AND its recorded pre-value, so correctness does not
 * actually depend on the order - the ordering is free insurance that leaves an interrupted run in
 * a cleaner state.
 *
 * @param {import('mongodb').Db} db
 * @param {Awaited<ReturnType<planRenumber>>} plan
 * @param {{ apply?: boolean, log?: Function }} [opts]
 */
export async function applyRenumber(db, plan, { apply = false, log = () => {} } = {}) {
  const result = {
    applied: !!apply,
    moved: 0,
    skippedMoves: 0,
    placeholderApplied: false,
    sessionsPaired: 0,
    indexCreated: false,
    chaptersStamped: 0,
    derivedUpdated: 0,
    inProgressMarked: 0,
    inProgressCleared: false,
    wouldMove: apply ? 0 : plan.moves.length,
    wouldPair: apply ? 0 : (plan.sessionPairings || []).filter(r => !r.noop).length,
    excluded: (plan.excluded || []).length,
    refused: plan.refusals.length,
    alreadyApplied: !!plan.alreadyApplied,
    verified: null,
  };

  if (plan.alreadyApplied) {
    log(`  already applied: every ${CHAPTERS_COLLECTION} document carries '${MARKER_FIELD}'. Nothing to do.`);
    return result;
  }

  if (plan.refusals.length) {
    for (const r of plan.refusals) log(`  REFUSED  : ${r.detail}`);
    log('  Nothing was written. Every document is exactly as it was.');
    return result;
  }

  for (const row of plan.excluded) {
    log(
      `  excluded : ${SUBMISSIONS_COLLECTION} _id ${row._id} (${row.reason}` +
      `${row.ref ? `, ref '${row.ref}'` : ''}, character ${row.character_id ?? '?'}, status ` +
      `${row.status ?? '?'}). No ${FK_FIELD} write of any kind - it has no valid chapter reference ` +
      `to renumber and repairing it would be inventing data (2026-08-16 ruling).`
    );
  }

  const ordered = [...plan.moves].sort((a, b) => b.fromGameNumber - a.fromGameNumber);

  // Grouped by SOURCE chapter, in that same descending order (a Map preserves insertion order), so
  // each source chapter's own moves form one unit that can be stamped the moment it completes.
  // This grouping IS the fix for the stamp-timing critical - see the header.
  const bySource = new Map();
  for (const m of ordered) {
    const list = bySource.get(m.from) || [];
    list.push(m);
    bySource.set(m.from, list);
  }

  const chapterOids = (plan.chapters || []).map(c => new ObjectId(c._id));

  // ── The pre-image, taken BEFORE any write (AC3) ───────────────────────────
  // Both gates snapshot here and re-snapshot after the writes, so `main()` can refuse to report
  // success on anything the coverage set did not authorise. Only on --apply: a dry run writes
  // nothing, so a pre/post pair over it would be two identical reads proving nothing.
  let factPre = null;
  let attachPre = null;
  if (apply) {
    factPre = await buildFactMap(db, {
      cycleFilter: plan.filters?.chapterFilter || {},
      sessionFilter: plan.filters?.sessionFilter || {},
    });
    attachPre = await buildAttachmentMap(db, { submissionFilter: plan.filters?.submissionFilter || {} });
  }

  try {
    // ── The in-progress marker, FIRST, before a single submission moves ────
    // A crash anywhere after this line leaves it set, and `planRenumber`'s `interrupted-apply`
    // refusal reads it. Written as one `updateMany` deliberately: it is the only write in this
    // function that must not be able to leave a partial trace, because its whole job is to say
    // "something started here".
    if (!apply) {
      log(`  [DRY RUN] would mark ${plan.chapters.length} ${CHAPTERS_COLLECTION} document(s) '${IN_PROGRESS_FIELD}' before writing anything.`);
    } else {
      const startedAt = new Date().toISOString();
      const res = await db.collection(CHAPTERS_COLLECTION).updateMany(
        { _id: { $in: chapterOids } },
        { $set: { [IN_PROGRESS_FIELD]: startedAt } },
      );
      result.inProgressMarked = res.modifiedCount;
      result.startedAt = startedAt;
      log(`  started  : marked ${res.modifiedCount} ${CHAPTERS_COLLECTION} document(s) '${IN_PROGRESS_FIELD}': ${startedAt}. Cleared only on a fully green run.`);
    }

    const stampedAt = new Date().toISOString();
    const stampChapter = async (chapterIdStr, why) => {
      const res = await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: new ObjectId(chapterIdStr), [MARKER_FIELD]: { $exists: false } },
        { $set: { [MARKER_FIELD]: stampedAt } },
      );
      if (res.modifiedCount === 1) result.chaptersStamped += 1;
      log(`  stamped  : ${CHAPTERS_COLLECTION} _id ${chapterIdStr} with '${MARKER_FIELD}' (${why}).`);
    };

    // ── The submission moves, one SOURCE CHAPTER at a time ─────────────────
    // Descending source `game_number` (6->7 first), so no submission ever transiently sits on a
    // chapter that is still a pending source. Each source chapter is STAMPED as soon as its own
    // moves have landed, which is what makes an interrupted run leave an accurate partial stamp
    // set instead of none at all.
    for (const [sourceId, moves] of bySource) {
      for (const m of moves) {
        if (!apply) {
          log(
            `  [DRY RUN] would move ${SUBMISSIONS_COLLECTION} _id ${m._id}: ${FK_FIELD} ${m.from} ` +
            `-> ${m.to} (game_number ${m.fromGameNumber} -> ${m.toGameNumber}, stored as ${m.refType})`
          );
          continue;
        }
        // Scoped to the `_id` AND the recorded pre-value, matched across BOTH storage types (#497),
        // so a submission that moved on since planning is skipped rather than blindly overwritten.
        const res = await db.collection(SUBMISSIONS_COLLECTION).updateOne(
          { _id: m.idValue, [FK_FIELD]: { $in: [new ObjectId(m.from), m.from] } },
          { $set: { [FK_FIELD]: m.toValue } },
        );
        if (res.modifiedCount === 1) {
          result.moved += 1;
        } else {
          result.skippedMoves += 1;
          log(`  skip     : ${SUBMISSIONS_COLLECTION} _id ${m._id} moved on since planning; left as found.`);
        }
      }
      if (apply) await stampChapter(sourceId, `all ${moves.length} of its own move(s) complete`);
    }
    if (apply) log(`  moved    : ${result.moved} ${SUBMISSIONS_COLLECTION} document(s) re-pointed.`);

    // ── The six derived downtime fields (Angelus's ruling) ─────────────────
    for (const row of plan.derived || []) {
      if (!row.changed) continue;
      if (!apply) {
        log(
          `  [DRY RUN] would recompute ${CHAPTERS_COLLECTION} _id ${row._id} (game_number ` +
          `${row.game_number}): ${DERIVED_COUNT_FIELD} -> ${row.set[DERIVED_COUNT_FIELD]}, ` +
          `${DERIVED_TRAVELLING_FIELDS.length} downtime field(s) ` +
          `${row.fromGameNumber == null ? 'CLEARED (no predecessor - this is the placeholder)' : `inherited from game_number ${row.fromGameNumber}`}.`
        );
        continue;
      }
      const update = {};
      if (Object.keys(row.set).length) update.$set = row.set;
      if ((row.unset || []).length) update.$unset = Object.fromEntries(row.unset.map(f => [f, '']));
      if (!Object.keys(update).length) continue;
      const res = await db.collection(CHAPTERS_COLLECTION).updateOne(
        { _id: row.idValue || new ObjectId(row._id) },
        update,
      );
      if (res.modifiedCount === 1) result.derivedUpdated += 1;
    }
    if (apply && result.derivedUpdated) {
      log(`  derived  : recomputed ${DERIVED_DOWNTIME_FIELDS.join('/')} on ${result.derivedUpdated} ${CHAPTERS_COLLECTION} document(s).`);
    }
    for (const note of plan.derivedUnmovedNotes || []) {
      log(
        `  NOTE     : ${CHAPTERS_COLLECTION} _id ${note._id} (game_number ${note.game_number}) ` +
        `keeps its own '${note.field}' while '${'feeding_rights_confirmed'}' moves with the ` +
        `downtime. '${note.field}' is outside the six fields Angelus's 2026-08-17 ruling ` +
        `enumerated, so it is deliberately left where it is - named here rather than left silent, ` +
        `because the two now describe different downtimes.`
      );
    }

    // ── The Chapter-1 placeholder, IN PLACE ────────────────────────────────
    if (plan.placeholder && !plan.placeholder.alreadyPlaceholder) {
      if (!apply) {
        log(
          `  [DRY RUN] would add ${PLACEHOLDER_FIELD}: true and ${PLACEHOLDER_NOTE_FIELD} to the ` +
          `EXISTING ${CHAPTERS_COLLECTION} _id ${plan.placeholder._id} (game_number 1, label ` +
          `'${plan.placeholder.label}', status '${plan.placeholder.status}'). No new document, no ` +
          `new _id, and no change to game_number/label/status.`
        );
      } else {
        const res = await db.collection(CHAPTERS_COLLECTION).updateOne(
          { _id: plan.placeholder.idValue, game_number: 1 },
          { $set: { [PLACEHOLDER_FIELD]: true, [PLACEHOLDER_NOTE_FIELD]: PLACEHOLDER_NOTE } },
        );
        result.placeholderApplied = res.modifiedCount === 1;
        log(
          result.placeholderApplied
            ? `  placehold: ${CHAPTERS_COLLECTION} _id ${plan.placeholder._id} is now the Chapter-1 placeholder.`
            : `  skip     : ${CHAPTERS_COLLECTION} _id ${plan.placeholder._id} moved on since planning; placeholder not applied.`
        );
      }
    } else if (plan.placeholder) {
      // `placeholderApplied` means "the placeholder IS in place", not "this run wrote it". Leaving
      // it false here made a fully successful idempotent re-run print "placeholder not applied" in
      // its own totals line, which reads as a failure and is not one.
      result.placeholderApplied = true;
      result.placeholderAlreadyPresent = true;
      log(`  placehold: ${CHAPTERS_COLLECTION} _id ${plan.placeholder._id} already carries the placeholder. Left alone.`);
    }

    // ── CM-6 ───────────────────────────────────────────────────────────────
    for (const row of plan.sessionPairings || []) {
      if (row.noop) { log(`  pair     : ${SESSIONS_COLLECTION} _id ${row.sessionId} already paired with ${row.chapterId}.`); continue; }
      if (!apply) {
        log(
          `  [DRY RUN] would set ${SESSIONS_COLLECTION} _id ${row.sessionId} ${SESSION_FK_FIELD} ` +
          `= ${row.chapterId}. Evidence: ${row.evidence}`
        );
        continue;
      }
      const res = await db.collection(SESSIONS_COLLECTION).updateOne(
        { _id: row.sessionIdValue, [SESSION_FK_FIELD]: { $in: [null, undefined] } },
        { $set: { [SESSION_FK_FIELD]: new ObjectId(String(row.chapterIdValue)) } },
      );
      if (res.modifiedCount === 1) result.sessionsPaired += 1;
      else log(`  skip     : ${SESSIONS_COLLECTION} _id ${row.sessionId} acquired a ${SESSION_FK_FIELD} since planning; left as found.`);
    }
    for (const row of plan.sessionAbsent || []) {
      log(`  absent   : pairing row (session ${row.sessionId} <-> chapter ${row.chapterId}) - ${row.reason}. Skipped, not guessed at.`);
    }
    for (const row of plan.sessionOrphans || []) {
      log(
        `  ORPHAN   : ${SESSIONS_COLLECTION} _id ${row._id} (game_number ${row.game_number}, ` +
        `${row.session_date}) has NO row in the hand-confirmed pairing table. It is left ` +
        `unpaired. Add a row by hand if it should have one - this script never infers a pairing.`
      );
    }

    if (shouldEnsureSessionIndex(plan)) {
      if (!apply) {
        log(`  [DRY RUN] would create partial unique index '${SESSION_FK_INDEX_NAME}' on ${SESSIONS_COLLECTION}.${SESSION_FK_FIELD}.`);
      } else {
        await ensureSessionChapterIndex(db);
        result.indexCreated = true;
        log(`  indexed  : '${SESSION_FK_INDEX_NAME}' on ${SESSIONS_COLLECTION}.${SESSION_FK_FIELD} (unique where not null).`);
      }
    }

    // ── The remaining stamps ───────────────────────────────────────────────
    // Every chapter that was a SOURCE has already been stamped, progressively, above. What is left
    // is the terminal chapter (a destination only, with no moves of its own) and any source that
    // happened to hold no submissions. Stamped here, after the placeholder and the pairings, so
    // "stamped" always means "this document's part of the migration is finished".
    if (!apply) {
      log(`  [DRY RUN] would stamp ${plan.chapters.length} ${CHAPTERS_COLLECTION} document(s) with '${MARKER_FIELD}', progressively as each source chapter's own moves complete.`);
    } else {
      result.stampedAt = stampedAt;
      for (const c of plan.chapters) {
        if (bySource.has(c._id)) continue;   // already stamped when its moves landed
        await stampChapter(c._id, 'no moves of its own; destination and/or terminal chapter');
      }
    }

    // ── The two gates, INSIDE this try block (AC3) ─────────────────────────
    // Review finding: these used to sit outside it, so a gate that THREW after the stamp was
    // written left the chapters looking finished, and the next run reported "already applied;
    // nothing to do" - the operator never learning the verification never ran. They are inside the
    // same scope as the writes now, and the in-progress marker below is what actually decides
    // whether this run counts as finished.
    if (apply) {
      result.verified = await verifyRenumber(db, plan);

      const factPost = await buildFactMap(db, {
        cycleFilter: plan.filters?.chapterFilter || {},
        sessionFilter: plan.filters?.sessionFilter || {},
      });
      const attachPost = await buildAttachmentMap(db, { submissionFilter: plan.filters?.submissionFilter || {} });

      // Both of these THROW rather than pass on an empty pre-image (their own falsifiability
      // guards). A throw here is the right outcome: it is not a green run, and the in-progress
      // marker stays put to say so.
      result.factMapGate = runGatedFactMapCheck(factPre, factPost);
      result.attachmentGate = runAttachmentCheck(attachPre, attachPost, plan);

      for (const f of result.factMapGate.unexpected) {
        result.verified.problems.push(`FACT MAP (unexpected): ${f}`);
      }
      for (const f of result.factMapGate.unmatchedExpectations) {
        result.verified.problems.push(`FACT MAP (stale allowlist): ${f}`);
      }
      for (const f of result.attachmentGate.failures) {
        result.verified.problems.push(`ATTACHMENT MAP: ${f}`);
      }
      result.verified.ok = result.verified.problems.length === 0;

      log(
        `  gates    : fact map ${result.factMapGate.comparisons} comparison(s), attachment map ` +
        `${result.attachmentGate.comparisons} comparison(s).`
      );
      if (result.verified.ok) log('  verified : attachments, chapter identity, derived downtime fields, placeholder, pairings and both gates all match the plan.');
      else for (const p of result.verified.problems) log(`  VERIFY   : ${p}`);
      for (const w of result.verified.warnings) log(`  NOTE     : ${w}`);

      // ── The in-progress marker is cleared ONLY on a fully green run ──────
      if (result.verified.ok) {
        const res = await db.collection(CHAPTERS_COLLECTION).updateMany(
          { _id: { $in: chapterOids } },
          { $unset: { [IN_PROGRESS_FIELD]: '' } },
        );
        result.inProgressCleared = true;
        log(`  finished : cleared '${IN_PROGRESS_FIELD}' from ${res.modifiedCount} ${CHAPTERS_COLLECTION} document(s). This run is complete.`);
      } else {
        log(
          `  UNFINISH : '${IN_PROGRESS_FIELD}' is deliberately LEFT SET on every chapter, because ` +
          `verification came back red. The next plan will refuse ('interrupted-apply') rather ` +
          `than treat this run as finished. --invert with this run's plan file, or restore the ` +
          `backup.`
        );
      }
    }
  } catch (err) {
    log(`  ABORTED  : ${err?.message || String(err)}`);
    log(
      `  This run is PARTIAL, not rolled back. ${result.moved} submission move(s) and ` +
      `${result.chaptersStamped} chapter stamp(s) were written before this failed. ` +
      `'${IN_PROGRESS_FIELD}' ${result.inProgressMarked ? 'IS SET' : 'was never written, so nothing was written at all'}` +
      `, and '${MARKER_FIELD}' is written PROGRESSIVELY (one source chapter at a time, as its own ` +
      `moves land), so the next plan sees exactly how far this got and REFUSES rather than ` +
      `re-shifting. Use --invert with this run's plan file, or restore the backup.`
    );
    throw err;
  }

  return result;
}

/**
 * Undo the plan EXACTLY, using the plan's own RECORDED pre-values - never a re-derivation. That is
 * what makes this a genuine forward/inverse pair rather than one function called twice with
 * different arguments, and it is why `main()` refuses to `--invert` without the forward run's own
 * plan file.
 *
 * Deliberately touches ONLY what the forward step wrote: each moved submission's `chapter_id`, the
 * two placeholder fields, each paired session's `chapter_id`, the index, and the marker. Any other
 * write interleaved between forward and invert (a feed roll on a moved submission, a tracker
 * spend) is left completely alone - proving that is AC5's whole point.
 *
 * @param {import('mongodb').Db} db
 * @param {Awaited<ReturnType<planRenumber>>} plan
 * @param {{ apply?: boolean, log?: Function }} [opts]
 */
export async function invertRenumber(db, plan, { apply = false, force = false, log = () => {} } = {}) {
  const result = { applied: !!apply, reverted: 0, skipped: 0, placeholderReverted: false, sessionsUnpaired: 0, indexDropped: false, markersCleared: 0, derivedReverted: 0, refused: false, total: plan.moves.length };

  // ASCENDING destination game_number, the mirror of the forward step's descending source order.
  // (The first pass's comment said "descending" while the code sorted ascending; the code was
  // right and the comment was not.) Every update is scoped to its own `_id` AND the value the
  // forward step wrote, so correctness does not depend on the order either way.
  const ordered = [...plan.moves].sort((a, b) => a.toGameNumber - b.toGameNumber);

  for (const m of ordered) {
    if (!apply) {
      log(`  [DRY RUN] would revert ${SUBMISSIONS_COLLECTION} _id ${m._id}: ${FK_FIELD} ${m.to} -> ${m.from}`);
      continue;
    }
    const res = await db.collection(SUBMISSIONS_COLLECTION).updateOne(
      { _id: m.idValue, [FK_FIELD]: { $in: [new ObjectId(m.to), m.to] } },
      { $set: { [FK_FIELD]: m.refType === 'string' ? String(m.from) : new ObjectId(m.from) } },
    );
    if (res.modifiedCount === 1) result.reverted += 1;
    else { result.skipped += 1; log(`  skip     : ${SUBMISSIONS_COLLECTION} _id ${m._id} is not at the expected post-migration chapter; left as found.`); }
  }
  if (apply) log(`  reverted : ${result.reverted} / ${result.total} submission attachment(s).`);

  // ── The stale/wrong-plan refusal ──────────────────────────────────────────
  // REVIEW FINDING, 2026-08-17 (Edge Case Hunter). The submission reverts above are correctly
  // guarded by expected-value matching, so a stale plan simply skips them all. Everything BELOW
  // used to run unconditionally over `plan.chapters` regardless: point `--invert` at a stale plan
  // whose chapter `_id`s happen to overlap and the output read "0 / 174 reverted, 7 marker(s)
  // cleared" - leaving a correctly-migrated database indistinguishable from an unmigrated one, so
  // the next `--apply` shifted everything a SECOND time on top of already-correct data.
  //
  // A plan with moves that reverted NONE of them is not a plan describing this database.
  if (apply && plan.moves.length > 0 && result.reverted === 0 && !force) {
    result.refused = true;
    log(
      `  REFUSED  : this plan describes ${plan.moves.length} submission move(s) and NONE of them ` +
      `were at their expected post-migration chapter, so nothing was reverted. That means this ` +
      `plan file does not describe this database - it is stale, or it is another run's. Clearing ` +
      `'${MARKER_FIELD}'/'${IN_PROGRESS_FIELD}' and dropping '${SESSION_FK_INDEX_NAME}' from here ` +
      `would make a correctly-migrated database look unmigrated, and the next --apply would shift ` +
      `everything a SECOND time. Nothing further was touched. Point --plan-file at the forward ` +
      `run's own output, or pass --force if you genuinely mean to clear the markers anyway.`
    );
    return result;
  }

  // ── The six derived downtime fields, restored to their recorded pre-values ─
  for (const row of plan.derived || []) {
    if (!row.changed) continue;
    if (!apply) { log(`  [DRY RUN] would restore ${DERIVED_DOWNTIME_FIELDS.length} derived field(s) on ${CHAPTERS_COLLECTION} _id ${row._id}.`); continue; }
    const $set = {};
    const $unset = {};
    for (const field of DERIVED_DOWNTIME_FIELDS) {
      const was = (row.pre || {})[field];
      if (was === undefined) $unset[field] = '';
      else $set[field] = was;
    }
    const update = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;
    const res = await db.collection(CHAPTERS_COLLECTION).updateOne({ _id: row.idValue || new ObjectId(row._id) }, update);
    if (res.modifiedCount === 1) result.derivedReverted += 1;
  }

  if (plan.placeholder && !plan.placeholder.alreadyPlaceholder) {
    const pre = plan.placeholder.preState || {};
    const $set = {};
    const $unset = {};
    for (const field of [PLACEHOLDER_FIELD, PLACEHOLDER_NOTE_FIELD]) {
      if (pre[field] === undefined) $unset[field] = '';
      else $set[field] = pre[field];
    }
    if (!apply) {
      log(`  [DRY RUN] would restore ${CHAPTERS_COLLECTION} _id ${plan.placeholder._id} placeholder fields to their recorded pre-state.`);
    } else {
      const update = {};
      if (Object.keys($set).length) update.$set = $set;
      if (Object.keys($unset).length) update.$unset = $unset;
      // Scoped to the VALUE the forward step wrote, not to `_id` alone - the same discipline every
      // other revert in this function already used. Matching on `_id` alone meant an --invert
      // against a database where somebody had since re-set the placeholder by hand would silently
      // strip THEIR write instead of undoing this migration's.
      const res = await db.collection(CHAPTERS_COLLECTION).updateOne(
        {
          _id: plan.placeholder.idValue,
          [PLACEHOLDER_FIELD]: true,
          [PLACEHOLDER_NOTE_FIELD]: plan.placeholder.note ?? PLACEHOLDER_NOTE,
        },
        update,
      );
      result.placeholderReverted = res.modifiedCount === 1;
      log(
        result.placeholderReverted
          ? `  placehold: restored ${CHAPTERS_COLLECTION} _id ${plan.placeholder._id} to its recorded pre-state.`
          : `  skip     : ${CHAPTERS_COLLECTION} _id ${plan.placeholder._id} no longer carries the exact placeholder this run wrote; left as found.`
      );
    }
  }

  for (const row of plan.sessionPairings || []) {
    if (row.noop) continue;   // it was already paired before the forward run; not ours to undo
    if (!apply) { log(`  [DRY RUN] would unset ${SESSIONS_COLLECTION} _id ${row.sessionId} ${SESSION_FK_FIELD}.`); continue; }
    const res = await db.collection(SESSIONS_COLLECTION).updateOne(
      { _id: row.sessionIdValue, [SESSION_FK_FIELD]: { $in: [new ObjectId(String(row.chapterIdValue)), row.chapterId] } },
      { $unset: { [SESSION_FK_FIELD]: '' } },
    );
    if (res.modifiedCount === 1) result.sessionsUnpaired += 1;
  }

  if (apply && shouldEnsureSessionIndex(plan)) {
    try {
      await db.collection(SESSIONS_COLLECTION).dropIndex(SESSION_FK_INDEX_NAME);
      result.indexDropped = true;
      log(`  index    : dropped '${SESSION_FK_INDEX_NAME}'. Note server/index.js recreates it on the next boot, which is harmless over a nulled-out field.`);
    } catch { /* not present; nothing to drop */ }
  }

  if (!apply) {
    log(`  [DRY RUN] would clear '${MARKER_FIELD}' and '${IN_PROGRESS_FIELD}' from ${plan.chapters.length} ${CHAPTERS_COLLECTION} document(s).`);
  } else {
    const res = await db.collection(CHAPTERS_COLLECTION).updateMany(
      { _id: { $in: plan.chapters.map(c => new ObjectId(c._id)) } },
      { $unset: { [MARKER_FIELD]: '', [IN_PROGRESS_FIELD]: '' } },
    );
    result.markersCleared = res.modifiedCount;
    log(`  stamped  : cleared '${MARKER_FIELD}' and '${IN_PROGRESS_FIELD}' from ${res.modifiedCount} document(s).`);
  }

  return result;
}

// ── Plan persistence (shape matched to cm-7-drill-migration.mjs) ─────────────

const DEFAULT_PLAN_FILE = '.cm4-renumber-plan.json';

/** Sentinels bracketing the `--json` report on stdout, so a consumer can extract it from the
 *  connection chatter `../db.js` prints around every run. `--out <file>` avoids the problem
 *  entirely and is what the runbook uses. */
export const JSON_BEGIN = '===CM4-REPORT-BEGIN===';
export const JSON_END = '===CM4-REPORT-END===';

/** PURE. Pull the report back out of a captured stdout blob. */
export function extractJsonReport(stdout) {
  const start = stdout.indexOf(JSON_BEGIN);
  const end = stdout.indexOf(JSON_END);
  if (start === -1 || end === -1) return null;
  return JSON.parse(stdout.slice(start + JSON_BEGIN.length, end));
}

/** JSON-safe plan serialisation. Every BSON value round-trips via its string form. */
export function serializePlan(plan) {
  return JSON.stringify(
    {
      version: 1,
      chapters: plan.chapters,
      sourceIds: plan.sourceIds,
      maxGameNumber: plan.maxGameNumber,
      moves: plan.moves.map(m => ({
        _id: m._id, from: m.from, to: m.to, refType: m.refType,
        fromGameNumber: m.fromGameNumber, toGameNumber: m.toGameNumber, character_id: m.character_id,
      })),
      excluded: plan.excluded,
      placeholder: plan.placeholder && {
        _id: plan.placeholder._id, game_number: plan.placeholder.game_number,
        label: plan.placeholder.label, status: plan.placeholder.status, note: plan.placeholder.note,
        alreadyPlaceholder: plan.placeholder.alreadyPlaceholder,
        preState: {
          [PLACEHOLDER_FIELD]: plan.placeholder.preState?.[PLACEHOLDER_FIELD] ?? null,
          [PLACEHOLDER_NOTE_FIELD]: plan.placeholder.preState?.[PLACEHOLDER_NOTE_FIELD] ?? null,
          // `absent` distinguishes "the key was not there" from "the key was there holding null",
          // so the invert can $unset rather than $set null. Recorded explicitly because JSON has
          // no way to round-trip `undefined`.
          absent: [PLACEHOLDER_FIELD, PLACEHOLDER_NOTE_FIELD].filter(f => plan.placeholder.preState?.[f] === undefined),
        },
      },
      // `pre` is round-tripped alongside an explicit `preAbsent` list, for the same reason the
      // placeholder's own pre-state is: JSON cannot distinguish "the key held null" from "the key
      // was not there", and the invert has to $unset in the second case rather than $set null.
      derived: (plan.derived || []).map(r => ({
        _id: r._id,
        game_number: r.game_number,
        fromGameNumber: r.fromGameNumber,
        set: r.set,
        unset: r.unset,
        pre: Object.fromEntries(DERIVED_DOWNTIME_FIELDS.map(f => [f, r.pre?.[f] ?? null])),
        preAbsent: DERIVED_DOWNTIME_FIELDS.filter(f => r.pre?.[f] === undefined),
        changed: r.changed,
      })),
      derivedUnmovedNotes: plan.derivedUnmovedNotes || [],
      sessionPairings: (plan.sessionPairings || []).map(r => ({ sessionId: r.sessionId, chapterId: r.chapterId, sessionDate: r.sessionDate, chapterLabel: r.chapterLabel, evidence: r.evidence, confidence: r.confidence, declaredConfidence: r.declaredConfidence, reverseLink: r.reverseLink, noop: r.noop })),
      sessionAbsent: plan.sessionAbsent || [],
      sessionOrphans: plan.sessionOrphans || [],
      expectedCounts: Object.fromEntries(plan.expectedCounts || new Map()),
      identityPre: plan.identityPre || {},
      submissionIds: (plan.submissionIds || []).map(String),
      filters: plan.filters || { chapterFilter: {}, submissionFilter: {}, sessionFilter: {} },
    },
    null,
    2,
  );
}

export function deserializePlan(json) {
  const p = typeof json === 'string' ? JSON.parse(json) : json;
  const absent = new Set(p.placeholder?.preState?.absent || []);
  return {
    ...p,
    moves: (p.moves || []).map(m => ({ ...m, idValue: new ObjectId(m._id), fromValue: m.refType === 'string' ? m.from : new ObjectId(m.from), toValue: m.refType === 'string' ? m.to : new ObjectId(m.to) })),
    placeholder: p.placeholder && {
      ...p.placeholder,
      idValue: new ObjectId(p.placeholder._id),
      preState: {
        [PLACEHOLDER_FIELD]: absent.has(PLACEHOLDER_FIELD) ? undefined : p.placeholder.preState?.[PLACEHOLDER_FIELD],
        [PLACEHOLDER_NOTE_FIELD]: absent.has(PLACEHOLDER_NOTE_FIELD) ? undefined : p.placeholder.preState?.[PLACEHOLDER_NOTE_FIELD],
      },
    },
    derived: (p.derived || []).map(r => {
      const missing = new Set(r.preAbsent || []);
      return {
        ...r,
        idValue: new ObjectId(r._id),
        unset: r.unset || [],
        pre: Object.fromEntries(DERIVED_DOWNTIME_FIELDS.map(f => [f, missing.has(f) ? undefined : r.pre?.[f]])),
      };
    }),
    sessionPairings: (p.sessionPairings || []).map(r => ({ ...r, sessionIdValue: new ObjectId(r.sessionId), chapterIdValue: new ObjectId(r.chapterId) })),
    expectedCounts: new Map(Object.entries(p.expectedCounts || {})),
    submissionIds: (p.submissionIds || []).map(id => new ObjectId(id)),
    refusals: [],
    alreadyApplied: false,
  };
}

/**
 * PURE. The machine-diffable dry-run report the #826 post-mortem rule requires: one canonical
 * object, key-sorted downstream by `canonicalJSON`, with no timestamps or run-specific noise, so
 * two runs of the same plan diff to nothing and a changed plan diffs to exactly what changed.
 */
export function reportOf(plan) {
  return {
    schema: 'cm-4-renumber-report/1',
    preCm2b: !!plan.preCm2b,
    alreadyApplied: !!plan.alreadyApplied,
    refusals: plan.refusals.map(r => ({ kind: r.kind, _id: r._id ?? null, detail: r.detail })),
    chapters: (plan.chapters || []).map(c => ({ _id: c._id, game_number: c.game_number, label: c.label ?? null })),
    // Per-chapter move summary, which is what an operator actually reads: how many submissions
    // move, and from/to which _id.
    moveSummary: [...new Map((plan.moves || []).map(m => [`${m.from}->${m.to}`, m])).values()]
      .map(m => ({
        fromGameNumber: m.fromGameNumber, toGameNumber: m.toGameNumber,
        from: m.from, to: m.to,
        count: (plan.moves || []).filter(x => x.from === m.from).length,
      }))
      .sort((a, b) => a.fromGameNumber - b.fromGameNumber),
    moveTotal: (plan.moves || []).length,
    excluded: (plan.excluded || []).map(e => ({ _id: e._id, reason: e.reason, ref: e.ref, character_id: e.character_id, status: e.status })).sort((a, b) => (a._id < b._id ? -1 : 1)),
    excludedTotal: (plan.excluded || []).length,
    placeholder: plan.placeholder && { _id: plan.placeholder._id, game_number: plan.placeholder.game_number, label: plan.placeholder.label, status: plan.placeholder.status, note: plan.placeholder.note, alreadyPlaceholder: plan.placeholder.alreadyPlaceholder, inPlace: true },
    // The six derived downtime fields, per chapter: what `submission_count` becomes, and which
    // chapter the other five are inherited from. Values themselves are deliberately NOT in the
    // report - `discipline_profile` alone would swamp it - but "which chapter did this come from"
    // is exactly what an operator diffs.
    derived: (plan.derived || [])
      .map(r => ({
        _id: r._id,
        game_number: r.game_number,
        submission_count: r.set?.[DERIVED_COUNT_FIELD] ?? null,
        inheritsFromGameNumber: r.fromGameNumber,
        travellingFieldsSet: DERIVED_TRAVELLING_FIELDS.filter(f => Object.prototype.hasOwnProperty.call(r.set || {}, f)),
        travellingFieldsCleared: (r.unset || []).filter(f => DERIVED_TRAVELLING_FIELDS.includes(f)),
        changed: !!r.changed,
      }))
      .sort((a, b) => a.game_number - b.game_number),
    derivedUnmovedNotes: (plan.derivedUnmovedNotes || []).map(n => ({ _id: n._id, game_number: n.game_number, field: n.field })),
    sessionPairings: (plan.sessionPairings || []).map(r => ({ sessionId: r.sessionId, chapterId: r.chapterId, sessionDate: r.sessionDate, chapterLabel: r.chapterLabel, noop: r.noop, confidence: r.confidence, declaredConfidence: r.declaredConfidence, reverseLink: r.reverseLink, evidence: r.evidence })),
    // The rows an ST still has to confirm by eye. Surfaced as its own top-level block precisely so
    // it cannot be missed in a 200-line report.
    pairingConfidence: {
      corroborated: (plan.sessionPairings || []).filter(r => r.confidence === PAIRING_CONFIDENCE.CORROBORATED).map(r => r.sessionId),
      needsStEyes: (plan.sessionPairings || []).filter(r => r.confidence !== PAIRING_CONFIDENCE.CORROBORATED).map(r => r.sessionId),
    },
    sessionAbsent: (plan.sessionAbsent || []).map(r => ({ sessionId: r.sessionId, chapterId: r.chapterId })),
    sessionOrphans: plan.sessionOrphans || [],
    expectedCounts: Object.fromEntries([...(plan.expectedCounts || new Map())].sort(([a], [b]) => (a < b ? -1 : 1))),
    index: { collection: SESSIONS_COLLECTION, field: SESSION_FK_FIELD, name: SESSION_FK_INDEX_NAME, unique: true, partial: 'where not null' },
  };
}

/**
 * PURE. Parse and VALIDATE argv, returning either `{ ok: true, ... }` or `{ ok: false, reasons }`.
 *
 * Split out of `main()` and exported so the refusals below are unit-testable without a database.
 * Every one of them is a review finding:
 *
 *   - a value-taking flag (`--out`, `--plan-file`, `--target`) as the TRAILING argv token silently
 *     yielded `undefined`, which then became a plan file literally named "undefined" or, worse,
 *     `--out undefined` writing nowhere;
 *   - `--apply --json` printed a report and returned BEFORE the apply path was ever reached, with
 *     the `Mode: APPLY` banner itself suppressed under `--json` - so a run that wrote nothing at
 *     all was indistinguishable from a completed one;
 *   - `--apply` against a non-`_test` database needed nothing but the one flag. Everything else in
 *     this script is careful about live data; the flag that actually reaches it was not.
 */
export function parseArgs(argv, { dbName } = {}) {
  const reasons = [];
  const flagValue = name => {
    const idx = argv.indexOf(name);
    if (idx === -1) return undefined;
    const value = argv[idx + 1];
    if (value === undefined || value.startsWith('--')) {
      reasons.push(
        `${name} was given without a following value (it was the last argument, or the next token ` +
        `is another flag). Left unvalidated this silently becomes 'undefined'.`
      );
      return null;
    }
    return value;
  };

  const apply = argv.includes('--apply');
  const invert = argv.includes('--invert');
  const json = argv.includes('--json');
  const force = argv.includes('--force');
  const overwritePlan = argv.includes('--overwrite-plan');
  const outFile = flagValue('--out') ?? null;
  const planFileArg = flagValue('--plan-file');
  const planFile = planFileArg === undefined ? DEFAULT_PLAN_FILE : planFileArg;
  const target = flagValue('--target') ?? null;

  if (apply && json) {
    reasons.push(
      '--apply cannot be combined with --json. --json is the machine-diffable REPORT channel (the ' +
      '#826 post-mortem rule) and returns before any write; a combined run used to print a report ' +
      'and silently write nothing, with the APPLY banner suppressed so nothing said so. Run ' +
      '`--json --out before.json` first, read it, then run `--apply` on its own.'
    );
  }
  if (apply && dbName && !/_test$/.test(dbName) && target !== dbName) {
    reasons.push(
      `--apply against '${dbName}' requires '--target ${dbName}', spelled out. This script defaults ` +
      'to the live database (MONGODB_DB, defaulting to tm_suite), and every other safety in it is ' +
      'careful about that; a single mistyped flag should not be the only thing between a preview ' +
      'and the live renumber. Databases whose name ends in `_test` are exempt.'
    );
  }

  return { ok: reasons.length === 0, reasons, apply, invert, json, force, overwritePlan, outFile, planFile, target };
}

export async function main(argv = process.argv) {
  const dbName = process.env.MONGODB_DB || 'tm_suite';
  const args = parseArgs(argv, { dbName });
  const { apply, invert, json, force, overwritePlan, outFile, planFile } = args;

  if (!args.ok) {
    for (const reason of args.reasons) console.log(`REFUSED: ${reason}`);
    process.exitCode = 1;
    return;
  }

  // ── The plan file is NEVER silently clobbered (review finding, 2026-08-17) ──
  // Checked HERE, before the database is even opened, because it is a pure precondition of a
  // forward --apply and because refusing before connecting is strictly safer than refusing after.
  //
  // The scenario it closes: run 1 dies part way and leaves the database mid-migration; the
  // operator re-runs --apply with the same default --plan-file; run 2 overwrites run 1's plan
  // BEFORE writing anything - and the only record of what run 1 actually did is gone, at the exact
  // moment it is the only way back.
  if (apply && !invert && fs.existsSync(planFile) && !overwritePlan) {
    console.log(`REFUSED: a plan file already exists at ${planFile}, and NOTHING has been written.`);
    console.log('That file is the only rollback record for whatever run wrote it - including a run');
    console.log('that crashed part way through and left this database mid-migration. Overwriting it');
    console.log('would destroy the record exactly when it is needed. Move it aside, point --plan-file');
    console.log('somewhere new, or pass --overwrite-plan if you genuinely mean to discard it.');
    process.exitCode = 1;
    return;
  }

  if (!json) {
    console.log(`Mode      : ${apply ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
    console.log(`Step      : ${invert ? 'INVERT (undo a prior forward run)' : 'FORWARD (the renumber)'}`);
    console.log(`Target DB : ${dbName}`);
    console.log(`Plan file : ${planFile}`);
    console.log('');
  }

  await connectDb();
  let failed = false;
  try {
    const db = getDb();

    if (invert) {
      // NEVER re-derive from live state for an invert - the forward move has already landed, so a
      // re-derivation would read the shifted values as "old" and revert nothing. A missing plan
      // file is a refusal, not a silent no-op. (cm-7-drill-migration.mjs learned this the hard way.)
      if (!fs.existsSync(planFile)) {
        failed = true;
        console.log(`REFUSED: no plan file at ${planFile}. --invert requires the plan the forward run`);
        console.log('wrote (via --plan-file), not a freshly re-derived one - re-deriving from the');
        console.log('already-shifted state would silently revert nothing. Point --plan-file at the');
        console.log("forward run's own output, or restore from the backup instead.");
        return;
      }
      const plan = deserializePlan(fs.readFileSync(planFile, 'utf8'));
      console.log(`Loaded plan from ${planFile}: ${plan.moves.length} submission move(s) to revert.`);
      console.log('');
      const res = await invertRenumber(db, plan, { apply, force, log: msg => console.log(msg) });
      console.log('');
      console.log(
        `Totals: ${res.reverted} / ${res.total} attachment(s) reverted, ${res.skipped} skipped, ` +
        `${res.sessionsUnpaired} session pairing(s) removed, ${res.derivedReverted} derived ` +
        `block(s) restored, ${res.markersCleared} marker(s) cleared.`
      );
      if (res.refused) failed = true;
      if (!apply) console.log('Re-run with --apply to write.');
      return;
    }

    const plan = await planRenumber(db);

    if (json) {
      const body = JSON.stringify(reportOf(plan), null, 2);
      if (outFile) {
        // The ONLY genuinely diff-safe channel. `../db.js` prints "MongoDB connected successfully"
        // and "MongoDB connection closed" on stdout around every run, so a bare
        // `--json > before.json` produces a file that is not valid JSON. `--out` writes the report
        // and nothing else, which is what `diff before.json after.json` actually needs (the #826
        // post-mortem rule). The sentinel lines below cover the piped case for a human.
        fs.writeFileSync(outFile, body);
        console.log(`${JSON_BEGIN} written to ${outFile}`);
      } else {
        console.log(JSON_BEGIN);
        console.log(body);
        console.log(JSON_END);
      }
      if (plan.refusals.length) failed = true;
      return;
    }

    if (plan.preCm2b) {
      console.log(`PRE-cm-2b DATABASE. Refusing to plan anything.`);
      console.log('');
      for (const r of plan.refusals) console.log(`  REFUSED  : ${r.detail}`);
      failed = true;
      return;
    }
    if (plan.alreadyApplied) {
      console.log(`Already applied: every ${CHAPTERS_COLLECTION} document carries '${MARKER_FIELD}'. Nothing to do.`);
      return;
    }

    console.log(
      `${CHAPTERS_COLLECTION}: ${plan.chapters.length} document(s), game_number 1..${plan.maxGameNumber}. ` +
      `${plan.moves.length} submission(s) to move, ${plan.excluded.length} excluded, ` +
      `${(plan.sessionPairings || []).filter(r => !r.noop).length} session pairing(s) to write.`
    );
    for (const row of reportOf(plan).moveSummary) {
      console.log(
        `  game_number ${row.fromGameNumber} -> ${row.toGameNumber}: ${row.count} submission(s), ` +
        `${row.from} -> ${row.to}`
      );
    }
    console.log('');

    // The rows that still rest on label/game_number congruence alone. Printed before the writes,
    // loudly, rather than buried in the report - "this project's own design doc blames exactly this
    // inference for two prior live bugs" is not a footnote.
    const needsEyes = (plan.sessionPairings || []).filter(r => r.confidence !== PAIRING_CONFIDENCE.CORROBORATED);
    if (needsEyes.length) {
      console.log(
        `${needsEyes.length} of ${(plan.sessionPairings || []).length} CM-6 pairing row(s) rest on ` +
        `label/game_number congruence alone, with no corroborating chapters.session_id:`
      );
      for (const r of needsEyes) console.log(`  NEEDS ST EYES: session ${r.sessionId} <-> chapter ${r.chapterId} (${r.chapterLabel}, ${r.sessionDate}).`);
      console.log('Confirm those by hand BEFORE --apply. cycle-model.md §11a: two live bugs this cycle came from exactly this inference.');
      console.log('');
    }

    // The plan file is written BEFORE any write, not after. An --apply that dies part way, or one
    // whose own verify comes back red, is exactly when the invert is needed most; writing the plan
    // only on success would mean the one run that needs a rollback is the one run with no plan to
    // roll back with.
    //
    // The "never silently clobbered" gate is enforced at the TOP of main(), before the database is
    // opened at all - see the refusal there.
    if (apply && !plan.refusals.length) {
      fs.writeFileSync(planFile, serializePlan(plan));
      console.log(`Wrote plan to ${planFile} BEFORE writing anything (required by a later --invert run).`);
      console.log('');
    }

    const res = await applyRenumber(db, plan, { apply, log: msg => console.log(msg) });
    console.log('');
    if (res.applied) {
      console.log(
        `Totals: ${res.moved} moved, ${res.skippedMoves} skipped, ` +
        `placeholder ${res.placeholderApplied ? (res.placeholderAlreadyPresent ? 'already in place' : 'applied') : 'NOT applied'}, ` +
        `${res.derivedUpdated} derived block(s) recomputed, ` +
        `${res.sessionsPaired} session(s) paired, ${res.chaptersStamped} chapter(s) stamped, ` +
        `in-progress marker ${res.inProgressCleared ? 'cleared' : 'STILL SET'}, ` +
        `${res.refused} refusal(s).`
      );
    } else {
      console.log(
        `Totals (DRY RUN - nothing was written): would move ${res.wouldMove} submission(s), ` +
        `would exclude ${res.excluded}, would pair ${res.wouldPair} session(s), ` +
        `${res.refused} refusal(s).`
      );
    }

    if (res.refused) {
      failed = true;
      console.log('');
      console.log('One or more refusals. NOTHING was written; every document is exactly as it was.');
    } else if (res.verified && !res.verified.ok) {
      failed = true;
      console.log('');
      console.log('Verification FAILED after writing. See the VERIFY lines above, then --invert with this run\'s plan file.');
      console.log(`'${IN_PROGRESS_FIELD}' has been LEFT SET on every chapter, so the next plan refuses`);
      console.log('rather than treating this run as finished. Do not clear it by hand.');
    } else if (apply) {
      console.log('Idempotency check: re-run bare and confirm "already applied".');
      console.log('Then: node scripts/cm-7-fact-map.mjs --against <the pre-run snapshot>.');
    } else {
      console.log('Re-run with --apply to write. Take the backup FIRST (see this file\'s runbook).');
    }
  } finally {
    await closeDb();
    if (failed) process.exitCode = 1;
  }
}

// Auto-run only when invoked directly, never when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
