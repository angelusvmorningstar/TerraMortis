/**
 * cm-7: a representative renumber-shaped drill migration and its exact deterministic inverse.
 *
 * THIS IS NOT CM-4's REAL SCRIPT. It does not touch the Chapter-1 placeholder, does not run
 * against the real 7-cycle production shape, and is never registered anywhere as a candidate for
 * the real renumber. Its only job is to give `cm-7-fact-map.mjs`'s inverse-drill test a real
 * forward-then-back pair to exercise, per cycle-model.md §9's requirement that the inverse be
 * "tested on a copy before the forward ever touches live" and §6 precondition 4's requirement
 * that the drill be exercised against real interleaved post-migration writes, not a quiet
 * migrate-invert-diff round trip. See cm-7's own story, Open Question 1, for why the drill is
 * deliberately kept minimal/generic rather than anticipating CM-4's real shape.
 *
 * SAFETY SCOPE. `planDrillMigration` only ever considers `chapters` documents carrying
 * `FIXTURE_MARKER: true` (the collection was `downtime_cycles` when this drill was written; cm-2b
 * renamed it, and this file was re-pointed with it). No real document has ever carried that field
 * (grep-confirmed, and it is not declared in `downtime_submission.schema.js`'s `downtimeCycleSchema`
 * — the CHAPTER schema, whose own name is a cm-2b leftover), so this cannot reach real data
 * even if run outside a test — the same "cannot touch what it was never built to touch" shape as
 * `cm-2-chapters-to-story-cycles.mjs`'s source-shape guard, adapted to a marker field because this
 * script's fixtures are synthetic rather than a real pre-existing collection.
 *
 * DRY-RUN DEFAULT, same as every migration script in this repo: without `--apply` this only reads
 * and prints what it would do. No shebang — this file is imported by a test suite, and a shebang
 * breaks vitest's transform (documented in CLAUDE.md and `cm-2-chapters-to-story-cycles.mjs`).
 *
 *   # preview (no writes):
 *   node scripts/cm-7-drill-migration.mjs
 *
 *   # write the reassignment (fixture-scoped only) — also saves the plan to disk:
 *   node scripts/cm-7-drill-migration.mjs --apply
 *
 *   # undo it exactly, using the SAME recorded mapping (not a re-derived one):
 *   node scripts/cm-7-drill-migration.mjs --invert --apply
 *
 * PLAN PERSISTENCE ACROSS SEPARATE CLI INVOCATIONS. `main()` calls `planDrillMigration` fresh
 * every run, which reads CURRENT `game_number` values. That is exactly right for a bare forward
 * run — but naively re-running it for `--invert` (a SEPARATE process, after the forward move has
 * already landed) would read the ALREADY-SHIFTED values as "old" and derive a wrong plan, so the
 * `updateOne` filter matching the true pre-shift state would never hit and the invert would
 * silently do nothing (a real bug this file shipped with initially — found by this story's own
 * code review). `main()` therefore WRITES the plan to `--plan-file <path>` (default
 * `.cm7-drill-plan.json` next to `server/`) on every forward run, and `--invert` REQUIRES that
 * file rather than re-deriving — refusing loudly if it is missing, per this project's
 * refuse-rather-than-guess convention, instead of exiting 0 having reverted nothing.
 *
 *   node scripts/cm-7-drill-migration.mjs --apply --plan-file /tmp/drill-plan.json
 *   node scripts/cm-7-drill-migration.mjs --invert --apply --plan-file /tmp/drill-plan.json
 *
 * NOT IDEMPOTENT ON A DOUBLE --apply. Running `--apply` twice without an intervening `--invert`
 * re-plans off the already-shifted state and shifts a SECOND time (compounding by `2 * offset`,
 * not a no-op like `cm-2-chapters-to-story-cycles.mjs`'s copy-based idempotency). Accepted as-is:
 * this is throwaway drill/rehearsal tooling exercised only by this story's own test suite and
 * hand-runs against `tm_suite_test`, never a production migration path, so a full re-run guard is
 * disproportionate. Always `--invert` before running `--apply` again.
 */

import 'dotenv/config';
import fs from 'fs';
import { ObjectId } from 'mongodb';
import { pathToFileURL } from 'url';
import { connectDb, getDb, closeDb } from '../db.js';

const DEFAULT_PLAN_FILE = '.cm7-drill-plan.json';

/** JSON-safe plan serialisation — `_id` (an ObjectId) round-trips via `idString`. */
export function serializePlan(plan) {
  return JSON.stringify(
    { offset: plan.offset, sourceCount: plan.sourceCount, moves: plan.moves.map(({ idString, oldGameNumber, newGameNumber }) => ({ idString, oldGameNumber, newGameNumber })) },
    null,
    2
  );
}

export function deserializePlan(json) {
  const parsed = JSON.parse(json);
  return {
    offset: parsed.offset,
    sourceCount: parsed.sourceCount,
    moves: parsed.moves.map(m => ({ _id: new ObjectId(m.idString), ...m })),
  };
}

export const CYCLES_COLLECTION = 'chapters';
export const FIXTURE_MARKER = '_cm7_drill_fixture';

/**
 * PURE with respect to the database: reads only. Plans a deterministic renumber of every
 * fixture-marked cycle: `newGameNumber = oldGameNumber + offset`. The offset (not a fresh
 * re-derivation of "the next free number") is what makes the plan's own inverse trivial to state
 * and verify: subtract the same offset, on the same recorded `_id`s, and nothing else.
 *
 * WRITE-VALUE COLLISION. The READ side is scoped to `FIXTURE_MARKER` documents only (never real
 * data), but the WRITE VALUE (`oldGameNumber + offset`) is not checked against other documents in
 * whatever database this happens to run against — a large enough `offset` on a database with
 * `game_number`s already near that range could collide with an unrelated document, fixture or
 * real. The default `offset: 100` is far clear of this repo's real production range (currently 7
 * games), so this is a theoretical rather than a live risk, but it is not structurally guarded —
 * documented per this story's own code-review findings rather than adding a live collision check,
 * since this script only ever runs against `tm_suite_test` in practice.
 *
 * @param {import('mongodb').Db} db
 * @param {{ offset?: number }} [opts]
 */
export async function planDrillMigration(db, { offset = 100 } = {}) {
  const docs = await db
    .collection(CYCLES_COLLECTION)
    .find({ [FIXTURE_MARKER]: true })
    .project({ game_number: 1 })
    .toArray();

  const moves = docs
    .filter(d => typeof d.game_number === 'number')
    .map(d => ({
      _id: d._id,
      idString: String(d._id),
      oldGameNumber: d.game_number,
      newGameNumber: d.game_number + offset,
    }));

  return { offset, moves, sourceCount: docs.length };
}

/**
 * Write the plan's forward moves. Dry-run unless `apply: true`. Scoped to exactly the `_id`s and
 * `oldGameNumber`s the plan recorded, so a fixture that changed underneath the plan is skipped
 * rather than blindly overwritten (mirrors `cm-2-chapters-to-story-cycles.mjs`'s scoped-update
 * discipline).
 *
 * @param {import('mongodb').Db} db
 * @param {Awaited<ReturnType<planDrillMigration>>} plan
 * @param {{ apply?: boolean, log?: Function }} [opts]
 */
export async function applyDrillMigration(db, plan, { apply = false, log = () => {} } = {}) {
  let moved = 0;
  for (const m of plan.moves) {
    if (!apply) {
      log(`  [DRY RUN] would move _id ${m.idString}: game_number ${m.oldGameNumber} -> ${m.newGameNumber}`);
      continue;
    }
    const res = await db
      .collection(CYCLES_COLLECTION)
      .updateOne({ _id: m._id, game_number: m.oldGameNumber }, { $set: { game_number: m.newGameNumber } });
    if (res.modifiedCount === 1) {
      moved += 1;
      log(`  moved    : _id ${m.idString}: game_number ${m.oldGameNumber} -> ${m.newGameNumber}`);
    } else {
      log(`  skip     : _id ${m.idString} moved on since planning; left as found.`);
    }
  }
  return { moved, total: plan.moves.length };
}

/**
 * Undo the plan's forward moves EXACTLY, using the plan's own recorded `oldGameNumber` per `_id` —
 * not a re-derivation (e.g. `newGameNumber - offset`, which would be indistinguishable from the
 * forward move's own arithmetic and would not prove anything an inverse is supposed to prove).
 * This is what makes the drill a genuine forward/inverse PAIR rather than one function called
 * twice with different signs.
 *
 * Deliberately touches ONLY `game_number` on the moved documents. Any other write interleaved on
 * these or other documents between the forward move and this call (a feed roll, a spend) is left
 * completely alone — proving that is the whole point of AC7's interleaved-write drill.
 *
 * @param {import('mongodb').Db} db
 * @param {Awaited<ReturnType<planDrillMigration>>} plan
 * @param {{ apply?: boolean, log?: Function }} [opts]
 */
export async function invertDrillMigration(db, plan, { apply = false, log = () => {} } = {}) {
  let reverted = 0;
  for (const m of plan.moves) {
    if (!apply) {
      log(`  [DRY RUN] would revert _id ${m.idString}: game_number ${m.newGameNumber} -> ${m.oldGameNumber}`);
      continue;
    }
    const res = await db
      .collection(CYCLES_COLLECTION)
      .updateOne({ _id: m._id, game_number: m.newGameNumber }, { $set: { game_number: m.oldGameNumber } });
    if (res.modifiedCount === 1) {
      reverted += 1;
      log(`  reverted : _id ${m.idString}: game_number ${m.newGameNumber} -> ${m.oldGameNumber}`);
    } else {
      log(`  skip     : _id ${m.idString} not found at the expected post-migration game_number; left as found.`);
    }
  }
  return { reverted, total: plan.moves.length };
}

export async function main(argv = process.argv) {
  const apply = argv.includes('--apply');
  const invert = argv.includes('--invert');
  const planFileIdx = argv.indexOf('--plan-file');
  const planFile = planFileIdx !== -1 ? argv[planFileIdx + 1] : DEFAULT_PLAN_FILE;
  const dbName = process.env.MONGODB_DB || 'tm_suite';

  console.log(`Mode      : ${apply ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Step      : ${invert ? 'INVERT (undo a prior forward move)' : 'FORWARD (drill renumber)'}`);
  console.log(`DB        : ${dbName}`);
  console.log(`Plan file : ${planFile}`);
  console.log(`Scope     : only chapters documents carrying ${FIXTURE_MARKER}: true — never real data.`);
  console.log('');

  await connectDb();
  let failed = false;
  try {
    const db = getDb();

    let plan;
    if (invert) {
      // NEVER re-derive from live state for an invert — see the header's "PLAN PERSISTENCE"
      // note. A missing plan file is a refusal, not a silent no-op.
      if (!fs.existsSync(planFile)) {
        failed = true;
        console.log(`REFUSED: no plan file at ${planFile}. --invert requires the plan a prior`);
        console.log('forward run wrote (via --plan-file), not a freshly re-derived one — re-deriving');
        console.log('from the already-shifted live state would silently revert nothing. Run the');
        console.log('forward step first, or pass --plan-file pointing at its output.');
        return;
      }
      plan = deserializePlan(fs.readFileSync(planFile, 'utf8'));
      console.log(`Loaded plan from ${planFile}: ${plan.moves.length} move(s) to invert.`);
    } else {
      plan = await planDrillMigration(db);
      console.log(`${plan.sourceCount} fixture-marked cycle(s) found, ${plan.moves.length} to move.`);
      fs.writeFileSync(planFile, serializePlan(plan));
      console.log(`Wrote plan to ${planFile} (needed by a later --invert run).`);
    }
    console.log('');

    const res = invert
      ? await invertDrillMigration(db, plan, { apply, log: msg => console.log(msg) })
      : await applyDrillMigration(db, plan, { apply, log: msg => console.log(msg) });
    console.log('');
    console.log(`Totals: ${invert ? res.reverted : res.moved} / ${res.total} moved.`);
  } finally {
    await closeDb();
    if (failed) process.exitCode = 1;
  }
}

// Auto-run only when invoked directly, never when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
