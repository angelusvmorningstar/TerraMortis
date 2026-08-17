/**
 * cm-7: fact-map verification harness for the eventual CM-4 `game_number` renumber.
 *
 * Closes `D:\Terra Mortis\cycle-model.md` §6 precondition 2 and extends GitHub issue #1031.
 * Read-only always — this file never writes to any collection. `buildFactMap(db)` snapshots
 * every human-visible surface keyed (directly or indirectly) on `chapters.game_number`;
 * `runFactMapCheck(pre, post)` diffs two snapshots and is FALSIFIABLE BY CONSTRUCTION — a run
 * that finds nothing to compare throws rather than reporting a false green (§6 precondition 2's
 * own wording: "a run reporting '0 failures' over 0 comparisons fails hard").
 *
 * The eight-item coverage set (cm-7's own story AC2) is `COVERAGE_SET` below — a data structure,
 * not prose, so `buildFactMap` and its own tests read from one definition rather than each
 * hand-copying the enumeration. Each entry names the fact, the file:line(s) that display it, and
 * the field(s) on `buildFactMap`'s return value where a test can find it (`excluded: true` for the
 * one item deliberately outside the equality gate).
 */

import 'dotenv/config';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { connectDb, getDb, closeDb } from '../db.js';

export const COVERAGE_SET = [
  {
    id: 1,
    fact: 'Cycle self-identity',
    fields: 'game_number, label, phase/game_phase/status',
    sources: ['chapters collection (legacy-mirror rule, cycle-model.md §7)'],
    mapField: 'cycles[].{game_number,label,phase,game_phase,status}',
  },
  {
    id: 2,
    fact: 'Archive ordering',
    sources: ['public/js/tabs/archive-tab.js:71-73'],
    mapField: 'archiveOrderIds, archiveFallbackUsed',
  },
  {
    id: 3,
    fact: 'Story tab outcome ordering',
    sources: ['public/js/tabs/story-tab.js:58-62', 'public/js/tabs/story-tab.js:188-192'],
    mapField: 'storyTabOrderIds',
  },
  {
    id: 4,
    fact: 'DT Story continuity seam (Letter from Home / Touchstone Vignette)',
    sources: ['public/js/admin/downtime-story.js:3869-3885'],
    mapField: 'continuityGaps',
  },
  {
    id: 5,
    fact: 'Office/session log labels',
    sources: ['public/js/suite/status.js:275'],
    mapField: 'sessions[].sessionLabel',
  },
  {
    id: 6,
    fact: 'Cycle tab + session-picker labels',
    // NARROWED during code review 2026-08-16: `public/js/admin/next-session.js:66-74`/`:92-98`
    // display/write `game_number` verbatim (no derived label of their own — already covered by
    // `cycles[].game_number`/`sessions[].game_number`, not a distinct fact), and
    // `signin-tab.js:83-88`/`:155-166` are real DERIVED facts ("which cycle is most recently
    // closed", "what number a new session gets suggested") that this harness does NOT currently
    // track — logged as their own follow-up in deferred-work.md rather than silently claimed here.
    sources: ['public/js/admin/cycle-views.js:490', 'public/js/game/signin-tab.js:222-230'],
    mapField: 'cycles[].cycleTabLabel, sessions[].pickerLabel',
  },
  {
    id: 7,
    fact: 'game_sessions <-> cycle correspondence',
    sources: ['server/routes/attendance.js:8-17', 'public/js/tabs/downtime-form.js:1538'],
    mapField: 'unmatchedCycles, unmatchedSessions',
  },
  {
    id: 8,
    fact: 'XP breakdown title',
    sources: ['public/js/data/game-xp.js:55'],
    mapField: null,
    excluded: true,
    reason:
      'game_sessions.session_number: no schema declares this field and no writer in this codebase ' +
      'has ever populated it — the XP breakdown title already reads "Game ?" on every real session ' +
      'lacking an explicit .title, today, independent of any renumber. A fact map that "diffed" it ' +
      'would only ever report noise. See specs/deferred-work.md, "Deferred from: ' +
      'cm-7-fact-map-harness-and-rollback-drill".',
  },
];

/** Convenience accessor for the one excluded item — see `COVERAGE_SET` id 8, the source of truth. */
export const NOT_A_FACT = {
  field: 'game_sessions.session_number (public/js/data/game-xp.js:55)',
  reason: COVERAGE_SET.find(c => c.id === 8).reason,
};

const CYCLE_FIELDS = ['label', 'phase', 'game_phase', 'status'];

/** `public/js/suite/status.js:275`, verbatim. */
function sessionLabel(session) {
  return session.title || (session.game_number ? `Game ${session.game_number}` : 'This session');
}

/** `public/js/game/signin-tab.js:222-230`, verbatim shape. */
function pickerLabel(session) {
  const parts = [];
  if (session.game_number != null) parts.push(`Game ${session.game_number}`);
  if (session.session_date) parts.push(session.session_date);
  if (session.title) parts.push(session.title);
  return parts.join(' — ');
}

/** `public/js/admin/cycle-views.js:490`, verbatim. */
function cycleTabLabel(cycle) {
  return cycle.game_number ? 'Game ' + cycle.game_number : '';
}

/**
 * Read-only. Builds one fact-map snapshot from the three collections the coverage set actually
 * touches (see the header note on why `chapters`/`story_cycles` is deliberately not one of them).
 *
 * PURE with respect to the database: never writes. The `db` handle is an argument, never resolved
 * internally, so a test can hand over `tm_suite_test` and this can never reach live data by
 * accident — same discipline as `cm-2-chapters-to-story-cycles.mjs`'s `planRename`.
 *
 * @param {import('mongodb').Db} db
 * @param {{ cycleFilter?: object, sessionFilter?: object }} [opts] - optional Mongo filters, so a
 *   test can scope a snapshot to its own fixture-marked documents without touching real data.
 */
export async function buildFactMap(db, { cycleFilter = {}, sessionFilter = {} } = {}) {
  const cycleDocs = await db.collection('chapters').find(cycleFilter).toArray();
  const sessionDocs = await db.collection('game_sessions').find(sessionFilter).toArray();

  // Trap that must not be reused (cycle-model.md §6): never sort or key by _id/created_at for
  // anything ordering-sensitive. game_number is the only ordering field in this epic's tooling.
  const cycles = cycleDocs
    .map(c => ({
      _id: String(c._id),
      game_number: c.game_number ?? null,
      label: c.label ?? null,
      phase: c.phase ?? null,
      game_phase: c.game_phase ?? null,
      status: c.status ?? null,
      cycleTabLabel: cycleTabLabel(c),
    }))
    .sort((a, b) => (a.game_number ?? Infinity) - (b.game_number ?? Infinity));

  const sessions = sessionDocs
    .map(s => ({
      _id: String(s._id),
      game_number: s.game_number ?? null,
      sessionLabel: sessionLabel(s),
      pickerLabel: pickerLabel(s),
    }))
    .sort((a, b) => (a.game_number ?? Infinity) - (b.game_number ?? Infinity));

  // Item 2: archive-tab.js's cycleOrderMap key, `c.game_number ?? c.cycle_number ?? c.created_at ?? c._id`.
  // A cycle whose ordering key actually fell through to game_number's fallbacks is a defect in
  // itself (every real cycle must carry game_number) — recorded, not silently sorted around.
  const archiveFallbackUsed = cycleDocs
    .filter(c => c.game_number === undefined || c.game_number === null)
    .map(c => String(c._id));
  const archiveOrderIds = [...cycleDocs]
    .sort((a, b) => {
      const ka = a.game_number ?? a.cycle_number ?? a.created_at ?? String(a._id);
      const kb = b.game_number ?? b.cycle_number ?? b.created_at ?? String(b._id);
      return ka > kb ? 1 : ka < kb ? -1 : 0;
    })
    .map(c => String(c._id));

  // Item 3: story-tab.js sorts a character's outcomes by cycleMap[cycle_id]?.game_number
  // DESCENDING (`gb - ga`), nullish-coalesced to 0. Same field as item 1, different consumer and
  // different direction, so tracked as its own derived order rather than assumed identical to
  // archiveOrderIds (which is ascending and uses a different fallback chain).
  const storyTabOrderIds = [...cycleDocs]
    .sort((a, b) => (b.game_number ?? 0) - (a.game_number ?? 0))
    .map(c => String(c._id));

  // Item 4: DT Story continuity seam. Every game_number > 1 must have a predecessor at
  // game_number - 1 (cycle-model.md §8's own seam assertion, restated for this epic's tooling).
  const gameNumbers = new Set(cycles.map(c => c.game_number).filter(n => n != null));
  const continuityGaps = [...gameNumbers]
    .filter(n => n > 1 && !gameNumbers.has(n - 1))
    .sort((a, b) => a - b);

  // Item 7: game_sessions <-> chapters correspondence by game_number, both directions.
  const sessionCountByGameNumber = new Map();
  for (const s of sessions) {
    if (s.game_number == null) continue;
    sessionCountByGameNumber.set(s.game_number, (sessionCountByGameNumber.get(s.game_number) || 0) + 1);
  }
  const cycleCountByGameNumber = new Map();
  for (const c of cycles) {
    if (c.game_number == null) continue;
    cycleCountByGameNumber.set(c.game_number, (cycleCountByGameNumber.get(c.game_number) || 0) + 1);
  }
  const unmatchedCycles = cycles
    .filter(c => c.game_number != null && (sessionCountByGameNumber.get(c.game_number) || 0) !== 1)
    .map(c => c.game_number);
  // `!== 1` on BOTH counts: a session is only genuinely matched when its own game_number is held
  // by exactly one session (not shared with a duplicate sibling) AND resolves to exactly one
  // cycle. Checking only the cycle count (as an earlier draft did) let two sessions sharing one
  // game_number each see "1 matching cycle" and pass unflagged — found by this story's own code
  // review.
  const unmatchedSessions = sessions
    .filter(
      s =>
        s.game_number != null &&
        ((cycleCountByGameNumber.get(s.game_number) || 0) !== 1 ||
          (sessionCountByGameNumber.get(s.game_number) || 0) !== 1)
    )
    .map(s => s.game_number);

  // Item 1, extended: two live cycles sharing one non-null game_number is a real, previously-
  // occurring incident (the duplicate "Game 7" document from the Game 7 crisis, recorded in this
  // repo's own sprint-status.yaml) — an explicit check, not something the ordering/continuity
  // checks above happen to catch as a side effect.
  // NOTE ON NAMES: that incident predates cm-2b. The collection was called `downtime_cycles` when
  // it happened; it is `chapters` now. The code below reads the current name, deliberately — the
  // history is what the old name belongs to, not the query.
  const duplicateGameNumbers = [...cycleCountByGameNumber.entries()]
    .filter(([, count]) => count > 1)
    .map(([n]) => n)
    .sort((a, b) => a - b);

  return {
    cycles,
    sessions,
    archiveOrderIds,
    archiveFallbackUsed,
    storyTabOrderIds,
    continuityGaps,
    unmatchedCycles,
    unmatchedSessions,
    duplicateGameNumbers,
  };
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Diff two fact-map snapshots. FALSIFIABLE BY CONSTRUCTION (§6 precondition 2): the comparison
 * count is derived from `pre`'s own size, never a hardcoded constant, so a snapshot that silently
 * came back empty cannot pass by having nothing to check — it throws instead.
 *
 * @param {Awaited<ReturnType<buildFactMap>>} pre
 * @param {Awaited<ReturnType<buildFactMap>>} post
 * @returns {{ ok: boolean, failures: string[], comparisons: number }}
 */
export function runFactMapCheck(pre, post) {
  // Falsifiability guard (§6 precondition 2), evaluated BEFORE any equality check, derived
  // directly from the pre-image's own size — not a hardcoded constant. A pre-image with 0 cycles
  // and 0 sessions has nothing meaningful to compare no matter how many structural checks run
  // below (their sameness would be trivially true on two empty snapshots), so this throws rather
  // than letting the run fall through to a false "0 failures" green.
  const minComparisons = pre.cycles.length * (1 + CYCLE_FIELDS.length + 1) + pre.sessions.length * 3;
  if (minComparisons === 0) {
    throw new Error(
      'runFactMapCheck: pre-image has 0 cycles and 0 sessions — nothing to compare. A run that ' +
        'would report "0 failures" over 0 real comparisons fails hard instead — see cycle-model.md ' +
        '§6 precondition 2.'
    );
  }

  const failures = [];
  let comparisons = 0;

  const preById = new Map(pre.cycles.map(c => [c._id, c]));
  const postById = new Map(post.cycles.map(c => [c._id, c]));
  for (const [id, preCycle] of preById) {
    const postCycle = postById.get(id);
    if (!postCycle) {
      failures.push(`cycle ${id}: present pre-image, missing post-image.`);
      comparisons += 1;
      continue;
    }
    for (const field of ['game_number', ...CYCLE_FIELDS, 'cycleTabLabel']) {
      comparisons += 1;
      if (preCycle[field] !== postCycle[field]) {
        failures.push(
          `cycle ${id}: ${field} diverged — was ${JSON.stringify(preCycle[field])}, ` +
            `now ${JSON.stringify(postCycle[field])}.`
        );
      }
    }
  }
  for (const id of postById.keys()) {
    comparisons += 1;
    if (!preById.has(id)) failures.push(`cycle ${id}: present post-image, absent pre-image.`);
  }

  const preSessById = new Map(pre.sessions.map(s => [s._id, s]));
  const postSessById = new Map(post.sessions.map(s => [s._id, s]));
  for (const [id, preSess] of preSessById) {
    const postSess = postSessById.get(id);
    if (!postSess) {
      failures.push(`session ${id}: present pre-image, missing post-image.`);
      comparisons += 1;
      continue;
    }
    for (const field of ['game_number', 'sessionLabel', 'pickerLabel']) {
      comparisons += 1;
      if (preSess[field] !== postSess[field]) {
        failures.push(
          `session ${id}: ${field} diverged — was ${JSON.stringify(preSess[field])}, ` +
            `now ${JSON.stringify(postSess[field])}.`
        );
      }
    }
  }
  for (const id of postSessById.keys()) {
    comparisons += 1;
    if (!preSessById.has(id)) failures.push(`session ${id}: present post-image, absent pre-image.`);
  }

  comparisons += 1;
  if (pre.archiveFallbackUsed.length || post.archiveFallbackUsed.length) {
    failures.push(
      `archive ordering fell through to a game_number fallback: pre=[${pre.archiveFallbackUsed}] ` +
        `post=[${post.archiveFallbackUsed}].`
    );
  }

  comparisons += 1;
  if (!arraysEqual(pre.archiveOrderIds, post.archiveOrderIds)) {
    failures.push(
      `archive order diverged — was [${pre.archiveOrderIds}], now [${post.archiveOrderIds}].`
    );
  }

  comparisons += 1;
  if (!arraysEqual(pre.storyTabOrderIds, post.storyTabOrderIds)) {
    failures.push(
      `story-tab outcome order diverged — was [${pre.storyTabOrderIds}], now [${post.storyTabOrderIds}].`
    );
  }

  // Equality only — NOT "post must have 0 gaps". buildFactMap's cycleFilter/sessionFilter can
  // legitimately scope a snapshot to a subset of cycles that does not itself start at
  // game_number 1 (a test fixture, or a future partial re-check), so a nonzero gap count is only
  // a real defect when it is NEW relative to the pre-image, not simply present in both.
  comparisons += 1;
  if (!arraysEqual(pre.continuityGaps, post.continuityGaps)) {
    failures.push(
      `DT-Story continuity gaps diverged — was [${pre.continuityGaps}], now [${post.continuityGaps}].`
    );
  }

  // Equality only, same reasoning: a scoped snapshot's duplicate set only matters if it CHANGES.
  comparisons += 1;
  if (!arraysEqual(pre.duplicateGameNumbers, post.duplicateGameNumbers)) {
    failures.push(
      `duplicate game_number set diverged — was [${pre.duplicateGameNumbers}], ` +
        `now [${post.duplicateGameNumbers}].`
    );
  }


  comparisons += 1;
  if (!arraysEqual([...pre.unmatchedCycles].sort(), [...post.unmatchedCycles].sort())) {
    failures.push(
      `game_sessions<->cycle correspondence (cycle side) diverged — was [${pre.unmatchedCycles}], ` +
        `now [${post.unmatchedCycles}].`
    );
  }

  // Equality only, same reasoning as the continuity check above: a scoped snapshot can
  // legitimately have unmatched entries on BOTH sides of a pre/post pair (e.g. a fixture that
  // deliberately excludes game_sessions); what matters is that the set does not change.
  comparisons += 1;
  if (!arraysEqual([...pre.unmatchedSessions].sort(), [...post.unmatchedSessions].sort())) {
    failures.push(
      `game_sessions<->cycle correspondence (session side) diverged — was [${pre.unmatchedSessions}], ` +
        `now [${post.unmatchedSessions}].`
    );
  }

  return { ok: failures.length === 0, failures, comparisons };
}

export async function main(argv = process.argv) {
  const snapshotIdx = argv.indexOf('--snapshot');
  const snapshotPath = snapshotIdx !== -1 ? argv[snapshotIdx + 1] : null;
  const againstIdx = argv.indexOf('--against');
  const againstPath = againstIdx !== -1 ? argv[againstIdx + 1] : null;
  const dbName = process.env.MONGODB_DB || 'tm_suite';

  console.log(`Target DB: ${dbName}`);
  console.log('Mode     : read-only always (this script never writes to any collection).');
  console.log('');

  await connectDb();
  let failed = false;
  try {
    const db = getDb();
    const post = await buildFactMap(db);
    console.log(
      `Snapshot : ${post.cycles.length} cycle(s), ${post.sessions.length} session(s). ` +
        `Excluded from the equality gate: ${NOT_A_FACT.field} (${NOT_A_FACT.reason})`
    );

    if (snapshotPath) {
      fs.writeFileSync(snapshotPath, JSON.stringify(post, null, 2));
      console.log(`Wrote snapshot to ${snapshotPath}.`);
      // Deliberately does NOT return here even though --against may also be set: writing the
      // current state and diffing against an EARLIER snapshot are independent operations, and an
      // earlier draft of this script silently dropped the diff when both flags were passed
      // together — found by this story's own code review.
    }

    if (!againstPath) {
      if (!snapshotPath) {
        console.log('');
        console.log('No --against snapshot given — nothing to diff. Pass --snapshot <file> to write');
        console.log('one now, or --against <file> to diff against a snapshot written earlier.');
      }
      return;
    }

    let pre;
    try {
      pre = JSON.parse(fs.readFileSync(againstPath, 'utf8'));
    } catch (err) {
      failed = true;
      console.log('');
      console.log(`REFUSED: could not read/parse --against snapshot at ${againstPath}: ${err.message}`);
      return;
    }
    if (!pre || !Array.isArray(pre.cycles) || !Array.isArray(pre.sessions)) {
      failed = true;
      console.log('');
      console.log(
        `REFUSED: ${againstPath} does not look like a fact-map snapshot (expected .cycles and ` +
          '.sessions arrays) — not diffing against it.'
      );
      return;
    }

    const result = runFactMapCheck(pre, post);
    console.log('');
    console.log(`Comparisons: ${result.comparisons}`);
    if (result.ok) {
      console.log('OK — every fact in the coverage set matches the pre-image exactly.');
    } else {
      failed = true;
      console.log(`DIVERGED — ${result.failures.length} failure(s):`);
      for (const f of result.failures) console.log(`  ${f}`);
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
