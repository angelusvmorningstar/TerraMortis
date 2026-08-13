/**
 * oxp.11 migration: re-key `office_merit_dots` and `office_manoeuvre_ranks`
 * from OFFICE CATEGORY to SEAT. Manual, ST-invoked, one-off. Nothing calls this
 * on server boot and nothing calls it in test setup; the vitest suite imports
 * its exported functions and runs them against `tm_suite_test` only.
 *
 * NOTE FOR ANYONE TIDYING THIS FILE: there is deliberately NO
 * `#!/usr/bin/env node` shebang. `seed-office-seats.mjs` has one, and vitest's
 * transform fails on it with a bare "SyntaxError: Invalid or unexpected token"
 * and no location, which takes down the whole of `oxp-1-office-seats.test.js`
 * (41 tests, silently unrun). This script IS imported by a test suite, so
 * adding a shebang would do the same to oxp.11's own coverage. Run it with an
 * explicit `node`.
 *
 * ==========================================================================
 *   RUNNING THIS FOR REAL IS ANGELUS'S ACTION, NOT AN AGENT'S.
 * ==========================================================================
 *
 *   Connection comes from `../db.js` (MONGODB_URI via config.js, database name
 *   from MONGODB_DB, defaulting to `tm_suite`), the same as
 *   `seed-office-seats.mjs`. Running this bare from `server/` with
 *   `server/.env` in place therefore targets LIVE Atlas. What makes that
 *   survivable is the DRY-RUN DEFAULT: without `--apply` this only reads, and
 *   prints exactly what it would do.
 *
 * Usage, from `server/` so that cwd-relative `dotenv/config` picks up
 * `server/.env`:
 *
 *   # preview against the configured database, no writes (the default):
 *   node scripts/migrate-office-purchases-to-seats.mjs
 *
 *   # write:
 *   node scripts/migrate-office-purchases-to-seats.mjs --apply
 *
 *   # write to the throwaway test database instead of live:
 *   MONGODB_DB=tm_suite_test node scripts/migrate-office-purchases-to-seats.mjs --apply
 *
 * WHAT IT DOES, per category-keyed document, by looking up `office_seats` on
 * `office_category`:
 *
 *   - exactly one seat  -> rewrite the document under `_id: String(seat._id)`,
 *     preserving `dots` / `rank` and `updated_at` VERBATIM and adding the
 *     denormalised `office_category`;
 *   - zero seats        -> REFUSE, report, leave untouched;
 *   - two or more seats -> REFUSE, report as needing a human decision, leave
 *     untouched. Never pick one. Nothing in the live data hits this branch
 *     today (both live `office_merit_dots` documents are single-seat offices,
 *     and `office_manoeuvre_ranks` is empty), and it must stay a refusal rather
 *     than becoming a guess: choosing wrongly would hand one Primogen the
 *     other's purchase state.
 *
 * MongoDB `_id` is immutable, so the rewrite is INSERT THEN DELETE, in that
 * order. An interrupted run therefore leaves both documents rather than
 * neither, and a re-run recognises the seat-keyed document as already present,
 * declines to overwrite it, and clears only the stale category-keyed one. A
 * document already keyed by a 24-hex seat id is recognised as migrated and
 * skipped entirely. Re-running after `--apply` reports "Migrated 0".
 *
 * Idempotency is ATOMIC, not merely sequential, following the discipline
 * `seed-office-seats.mjs` established: the insert is a single `updateOne`
 * upsert with `$setOnInsert`, so two overlapping runs cannot both decide the
 * seat-keyed document is missing and both create it, and the match branch
 * writes nothing at all rather than clobbering a live value.
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { connectDb, getCollection, closeDb } from '../db.js';

/** The two collections this migration owns. Nothing else is touched. */
export const PURCHASE_COLLECTIONS = ['office_merit_dots', 'office_manoeuvre_ranks'];

/**
 * A document `_id` that is already a seat id: `String(ObjectId)`'s own shape.
 * No office category is 24 hexadecimal characters long, so this is an
 * unambiguous test for "already migrated".
 */
const SEAT_KEY = /^[0-9a-fA-F]{24}$/;

/**
 * Classify every document in one purchase collection. PURE: reads only, no
 * writes, no side effects, so `main()` can print the whole plan before anyone
 * decides whether to run it.
 *
 * Both collections are taken as ARGUMENTS rather than resolved internally, so a
 * test can hand over `tm_suite_test` collections and this can never reach live
 * data by accident.
 *
 * @param {import('mongodb').Collection} purchaseCollection
 * @param {import('mongodb').Collection} seatsCollection
 * @returns {Promise<Array<{key:string, action:string, category?:string, seatId?:string, seatIds?:string[], doc?:object}>>}
 */
export async function planMigration(purchaseCollection, seatsCollection) {
  const docs = await purchaseCollection.find({}).toArray();
  if (docs.length === 0) return [];

  const seats = await seatsCollection.find({}).toArray();
  const byCategory = new Map();
  for (const seat of seats) {
    const cat = seat && seat.office_category;
    if (!cat) continue;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(String(seat._id));
  }

  const rows = [];
  for (const doc of docs) {
    const key = String(doc._id);

    if (SEAT_KEY.test(key)) {
      rows.push({ key, action: 'already-seat-keyed' });
      continue;
    }

    const candidates = byCategory.get(key) || [];
    if (candidates.length === 0) {
      rows.push({ key, action: 'refused-no-seat', category: key });
    } else if (candidates.length > 1) {
      rows.push({ key, action: 'refused-ambiguous', category: key, seatIds: [...candidates] });
    } else {
      rows.push({ key, action: 'will-migrate', category: key, seatId: candidates[0], doc });
    }
  }
  return rows;
}

/**
 * Carry out (or, by default, merely narrate) the plan.
 *
 * @param {import('mongodb').Collection} purchaseCollection
 * @param {Array<object>} rows - the output of `planMigration`
 * @param {{ apply?: boolean, log?: Function }} opts
 * @returns {Promise<{migrated:number, recovered:number, deleted:number, refused:number, alreadySeatKeyed:number}>}
 */
export async function applyMigration(purchaseCollection, rows, { apply = false, log = () => {} } = {}) {
  let migrated = 0;
  let recovered = 0;
  let deleted = 0;
  let refused = 0;
  let alreadySeatKeyed = 0;

  for (const row of rows) {
    if (row.action === 'already-seat-keyed') {
      alreadySeatKeyed += 1;
      log(`  skip     : ${row.key} is already keyed by a seat id`);
      continue;
    }
    if (row.action === 'refused-no-seat') {
      refused += 1;
      log(`  REFUSED  : '${row.category}' has no seat in office_seats. Left untouched; seed a seat first.`);
      continue;
    }
    if (row.action === 'refused-ambiguous') {
      refused += 1;
      log(`  REFUSED  : '${row.category}' has ${row.seatIds.length} seats (${row.seatIds.join(', ')}). ` +
          'A human must decide which seat this purchase state belongs to. Left untouched.');
      continue;
    }

    if (!apply) {
      log(`  [DRY RUN] would migrate '${row.category}' -> seat ${row.seatId}`);
      continue;
    }

    // Insert first. `$setOnInsert` makes this atomic insert-or-nothing, and on
    // the match branch it writes nothing, so an already-migrated document's
    // real values can never be overwritten by a stale category-keyed copy.
    const { _id: _oldKey, ...valueFields } = row.doc;
    const result = await purchaseCollection.updateOne(
      { _id: row.seatId },
      { $setOnInsert: { ...valueFields, office_category: row.category } },
      { upsert: true },
    );

    if (result.upsertedCount === 1) {
      migrated += 1;
      log(`  migrated : '${row.category}' -> seat ${row.seatId}`);
    } else {
      recovered += 1;
      log(`  recovered: seat ${row.seatId} already held a document (interrupted earlier run). ` +
          `Kept it as-is; clearing the stale '${row.category}' document.`);
    }

    // Delete second, so an interruption between the two leaves BOTH documents
    // rather than neither.
    const del = await purchaseCollection.deleteOne({ _id: row.key });
    deleted += del.deletedCount;
  }

  return { migrated, recovered, deleted, refused, alreadySeatKeyed };
}

export async function main(argv = process.argv) {
  const apply = argv.includes('--apply');
  const dbName = process.env.MONGODB_DB || 'tm_suite';

  console.log(`Mode     : ${apply ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${dbName}`);
  console.log('');

  await connectDb();
  try {
    const seatsCollection = getCollection('office_seats');
    const seatCount = await seatsCollection.countDocuments({});
    console.log(`office_seats holds ${seatCount} seat(s).`);
    console.log('');

    const totals = { migrated: 0, recovered: 0, deleted: 0, refused: 0, alreadySeatKeyed: 0 };

    for (const name of PURCHASE_COLLECTIONS) {
      const collection = getCollection(name);
      const rows = await planMigration(collection, seatsCollection);
      console.log(`${name}: ${rows.length} document(s).`);

      // An empty collection is a clean outcome, not an error.
      // `office_manoeuvre_ranks` was empty live when this was written.
      if (rows.length === 0) {
        console.log('  nothing to migrate.');
        console.log('');
        continue;
      }

      const result = await applyMigration(collection, rows, { apply, log: msg => console.log(msg) });
      for (const k of Object.keys(totals)) totals[k] += result[k];
      console.log('');
    }

    console.log(
      `Totals: ${totals.migrated} migrated, ${totals.recovered} recovered, ` +
      `${totals.deleted} stale document(s) cleared, ${totals.refused} refused, ` +
      `${totals.alreadySeatKeyed} already seat-keyed.`
    );
    if (apply) {
      console.log('Idempotency check: re-run with --apply and confirm "0 migrated".');
    } else {
      console.log('Re-run with --apply to write.');
    }
    if (totals.refused > 0) {
      console.log('');
      console.log('One or more documents were REFUSED and left exactly as they were.');
      console.log('Nothing about them has changed. Decide what should happen to each, by hand.');
    }
  } finally {
    await closeDb();
  }
}

// Auto-run only when invoked directly, never when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
