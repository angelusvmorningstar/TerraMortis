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
 * ==========================================================================
 *   RUN THIS IMMEDIATELY AFTER DEPLOYING oxp.11 — NOT BEFORE, NOT LATER.
 * ==========================================================================
 *
 *   (Codex review, 2026-08-13.) The deployed server code (this migration's own
 *   sibling routes) reads and writes ONLY seat-keyed documents; the OLD
 *   category-keyed routes this PR removes no longer exist once it is live. If
 *   this script has not yet run, `GET /api/office_merit_dots` and
 *   `GET /api/office_manoeuvre_rank` will show the two existing purchases
 *   (Enforcer, Head of State) as unpurchased, and an ST editing either during
 *   that gap creates a NEW seat-keyed document from scratch — which this
 *   script, once it does run, will then see as already-migrated and leave
 *   alone, silently stranding the real pre-migration values under their old
 *   category key forever.
 *
 *   There is no code-level guard against this: it is a real live-deploy
 *   ordering hazard, not a hypothetical one, and it is accepted here
 *   deliberately rather than built around, because both live documents this
 *   migration would move currently hold nothing but `{"Safe Place": 0}` — the
 *   entire real stakes of getting the order wrong, right now, is re-typing
 *   two zeroes by hand. Building dual-schema read compatibility to eliminate
 *   an ordering window around content that trivial would be solving a problem
 *   this project does not have yet. Revisit this note if either collection
 *   ever holds real purchase data before a future migration of this shape.
 *
 *   The procedure that keeps the window as small as it can be: deploy this
 *   PR, then run this script with `--apply` right away, before any ST opens
 *   the Office tab's Merit Suite or Manoeuvres section. Do not run it before
 *   deploying (the not-yet-deployed old code would then see nothing for
 *   Enforcer/Head of State and could recreate the same stale-category
 *   problem from the other direction).
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
 * declines to overwrite it, and — ONLY IF the two documents' purchase content
 * is identical (Codex review, DBO-4, 2026-08-14) — clears the now-redundant
 * category-keyed one. A seat document created independently (through
 * ordinary use of the live seat-keyed routes, not an interrupted migration)
 * can genuinely differ from the old category-keyed one; in that case the
 * category-keyed document is left in place and reported REFUSED, because
 * deleting it would silently discard whatever purchase data it alone holds.
 * A document already keyed by a 24-hex seat id is recognised as migrated and
 * skipped entirely. Re-running after `--apply` reports "Migrated 0".
 *
 * Idempotency is ATOMIC, not merely sequential, following the discipline
 * `seed-office-seats.mjs` established: the insert is a single `updateOne`
 * upsert with `$setOnInsert`, so two overlapping runs cannot both decide the
 * seat-keyed document is missing and both create it, and the match branch
 * writes nothing at all rather than clobbering a live value.
 *
 * CONCURRENT MODIFICATION (Codex review, 2026-08-13): `planMigration` reads
 * every category-keyed document once, up front. If the live app writes to
 * one of those SAME documents (a normal PUT through the old category-keyed
 * route) before `applyMigration` reaches that row, the plan's snapshot is
 * now stale. Both the insert and the delete are therefore guarded on an
 * `updated_at` match against that snapshot: if the live document has moved
 * on, NOTHING is written for that row (reported as `CHANGED`, not silently
 * skipped) rather than embedding a stale value at the new seat id or
 * deleting a newer one out from under it. Re-running the script picks up
 * whatever is current. In the narrower window between the insert and the
 * delete, a `WARNING` (not `CHANGED`) is logged instead, because by then the
 * seat-keyed copy already exists and "leave it untouched" is no longer a
 * safe option — that case needs a human to reconcile the two documents.
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { connectDb, getCollection, closeDb } from '../db.js';

/** The two collections this migration owns. Nothing else is touched. */
export const PURCHASE_COLLECTIONS = ['office_merit_dots', 'office_manoeuvre_ranks'];

/**
 * A document `_id` shaped like a seat id: `String(ObjectId)`'s own form. No
 * office category is 24 hexadecimal characters long, so the SHAPE alone is
 * unambiguous evidence the key is not a category — but shape alone is not
 * evidence the seat it names still exists (Codex review, oxp.11: an orphaned
 * document — a real seat deleted after this collection was keyed to it, or a
 * hand-malformed record — would match this pattern and be classified as
 * already migrated, when there is in fact no real seat backing it at all).
 * `planMigration` below checks BOTH: the shape, via this pattern, and real
 * existence, against the seats it actually loaded.
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
  const realSeatIds = new Set();
  for (const seat of seats) {
    realSeatIds.add(String(seat._id));
    const cat = seat && seat.office_category;
    if (!cat) continue;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(String(seat._id));
  }

  const rows = [];
  for (const doc of docs) {
    const key = String(doc._id);

    if (SEAT_KEY.test(key)) {
      if (realSeatIds.has(key)) {
        rows.push({ key, action: 'already-seat-keyed' });
      } else {
        // Shaped like a seat id, but no office_seats document has it. A real
        // seat deleted out from under this purchase document, or a hand-
        // malformed record — either way, silently calling this "migrated" and
        // moving on would leave an unreachable orphan with no seat to belong
        // to. Refuse it the same way an ambiguous or seatless CATEGORY is
        // refused: report it, touch nothing, let a human decide.
        rows.push({ key, action: 'refused-orphaned-seat-key' });
      }
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
 * Build a filter that matches `doc`'s row ONLY if the collection's live copy
 * is still exactly what was captured at plan time — an optimistic-concurrency
 * guard keyed on `updated_at`, which both purchase routes set on every write
 * (Codex review, oxp.11: `planMigration` and `applyMigration` are separate
 * round-trips, so a write landing between them must never be silently
 * discarded by inserting a stale snapshot or deleting a newer value under
 * it). A document that somehow predates `updated_at` entirely is matched by
 * its absence, not by a guessed value.
 *
 * @param {object} doc - the row's plan-time snapshot (`row.doc`)
 * @returns {object} a MongoDB filter fragment
 */
function unchangedSince(doc) {
  return Object.prototype.hasOwnProperty.call(doc, 'updated_at')
    ? { updated_at: doc.updated_at }
    : { updated_at: { $exists: false } };
}

/**
 * Deep-equal via a canonical (key-sorted) JSON string, so two documents built
 * with the same fields in a different insertion order (e.g. `dots` set one
 * merit at a time vs. seeded all at once) compare equal rather than falsely
 * differing.
 */
function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Value fields only - strips the identity/bookkeeping fields that legitimately
 * differ between the category-keyed original and its seat-keyed counterpart
 * (`_id` itself, `updated_at`, and the denormalised `office_category` this
 * migration adds on write) so the comparison is about PURCHASE CONTENT only. */
function valueFieldsOf(doc) {
  const { _id, updated_at, office_category, ...rest } = doc || {};
  return rest;
}

/**
 * Carry out (or, by default, merely narrate) the plan.
 *
 * @param {import('mongodb').Collection} purchaseCollection
 * @param {Array<object>} rows - the output of `planMigration`
 * @param {{ apply?: boolean, log?: Function }} opts
 * @returns {Promise<{migrated:number, recovered:number, deleted:number, refused:number, alreadySeatKeyed:number, changedSincePlan:number}>}
 */
export async function applyMigration(purchaseCollection, rows, { apply = false, log = () => {} } = {}) {
  let migrated = 0;
  let recovered = 0;
  let deleted = 0;
  let refused = 0;
  let alreadySeatKeyed = 0;
  let changedSincePlan = 0;

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
    if (row.action === 'refused-orphaned-seat-key') {
      refused += 1;
      log(`  REFUSED  : ${row.key} is shaped like a seat id, but no office_seats document has it. ` +
          'Left untouched; confirm whether the seat was really deleted, or the key is malformed.');
      continue;
    }

    if (!apply) {
      log(`  [DRY RUN] would migrate '${row.category}' -> seat ${row.seatId}`);
      continue;
    }

    // Re-check the source is still exactly what planMigration captured,
    // BEFORE writing anything. A concurrent PUT to the category-keyed
    // document between planning and this point must never have its change
    // silently discarded by embedding the stale snapshot at the new seat id.
    const stillCurrent = await purchaseCollection.findOne({ _id: row.key, ...unchangedSince(row.doc) });
    if (!stillCurrent) {
      changedSincePlan += 1;
      log(`  CHANGED  : '${row.category}' was modified after this migration planned its move. ` +
          'Left untouched. Re-run to pick up the current value.');
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
      // Codex review, DBO-4 (2026-08-14): a seat document can exist here for
      // two entirely different reasons, and this script used to treat both
      // as the same "interrupted earlier run" case, deleting the old
      // category-keyed document unconditionally either way. The SAFE case is
      // a genuinely interrupted migration: the seat document IS the old
      // document, already copied, just not yet cleaned up - deleting the old
      // one loses nothing, because the two are identical. The UNSAFE case is
      // a seat document created independently, through completely ordinary
      // use of the live seat-keyed routes (which this project's own office
      // tab exposes today) - the two documents can genuinely differ, and
      // deleting the old one on that assumption would silently discard
      // whatever purchase data it alone held (any merit dot, or the rank, the
      // newer write never touched). Compare content, not merely presence.
      const existing = await purchaseCollection.findOne({ _id: row.seatId });
      const identical = existing
        && canonicalJSON(valueFieldsOf(row.doc)) === canonicalJSON(valueFieldsOf(existing));

      if (!identical) {
        refused += 1;
        log(`  REFUSED  : seat ${row.seatId} already holds a DIFFERENT document than '${row.category}'. ` +
            'Not a safe auto-recovery - deleting the old document would discard whatever it alone holds. ' +
            'Both left untouched; a human must reconcile them by hand.');
        continue;
      }

      recovered += 1;
      log(`  recovered: seat ${row.seatId} already held an identical document (interrupted earlier run). ` +
          `Kept it as-is; clearing the now-redundant '${row.category}' document.`);
    }

    // Delete second, guarded the SAME way as the pre-insert check above, so a
    // write landing in the (much smaller) gap between the insert and this
    // delete is also caught, not just one landing before the insert.
    const del = await purchaseCollection.deleteOne({ _id: row.key, ...unchangedSince(row.doc) });
    if (del.deletedCount === 1) {
      deleted += 1;
    } else {
      // The insert already happened by this point, so "leave it untouched"
      // is no longer available — both documents now exist. Report loudly
      // rather than silently, since this needs a human to reconcile.
      //
      // This branch is real defense-in-depth for the (much narrower) window
      // between the insert above and this delete, not the primary guard —
      // the pre-insert check earlier in this function is what actually
      // catches an ordinary concurrent write, and is what this file's own
      // test suite exercises directly. Forcing THIS specific window would
      // need mocking the collection to interleave a write mid-call, which
      // is disproportionate for a script one human runs once, by hand.
      changedSincePlan += 1;
      log(`  WARNING  : '${row.category}' changed after being copied to seat ${row.seatId} but before ` +
          'the old document could be removed. BOTH documents now exist; reconcile them by hand.');
    }
  }

  return { migrated, recovered, deleted, refused, alreadySeatKeyed, changedSincePlan };
}

export async function main(argv = process.argv) {
  const apply = argv.includes('--apply');
  const dbName = process.env.MONGODB_DB || 'tm_game';

  console.log(`Mode     : ${apply ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${dbName}`);
  console.log('');

  await connectDb();
  try {
    const seatsCollection = getCollection('office_seats');
    const seatCount = await seatsCollection.countDocuments({});
    console.log(`office_seats holds ${seatCount} seat(s).`);
    console.log('');

    const totals = { migrated: 0, recovered: 0, deleted: 0, refused: 0, alreadySeatKeyed: 0, changedSincePlan: 0 };

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
      `${totals.alreadySeatKeyed} already seat-keyed, ${totals.changedSincePlan} changed since planning.`
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
    if (totals.changedSincePlan > 0) {
      console.log('');
      console.log('One or more documents changed while this migration was running.');
      console.log('Re-run to pick up the current value; see the CHANGED/WARNING lines above for detail.');
    }
  } finally {
    await closeDb();
  }
}

// Auto-run only when invoked directly, never when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
