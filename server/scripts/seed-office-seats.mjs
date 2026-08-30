
/**
 * oxp.1 (data-lock) seed: create one `office_seats` document per real,
 * currently-held seat. Manual, ST-invoked, one-off. Nothing calls this on
 * server boot and nothing calls it in test setup; the vitest suite imports
 * its exported functions and runs them against `tm_suite_test` only.
 *
 * ==========================================================================
 *   Rene St. Dominique's Primogen seat creation date: CONFIRMED 2026-08-13.
 * ==========================================================================
 *
 *   Angelus confirmed both live Primogen seats were created in Game 1
 *   (2026-02-21) - the same date as Yusuf Kalusicj's seat and every other
 *   Game 1 office. The two seats are not "the original" and "a later
 *   addition"; both have existed, as seats, since Game 1.
 *
 *   Separately, and NOT a `created_at` input: Yusuf Kalusicj has only been
 *   the HOLDER of his Primogen seat since Game 5, not since the seat's
 *   creation. That is exactly the seat-vs-holder distinction this schema is
 *   built around (see the collection's own design rule: XP accrues per seat
 *   from `created_at`, regardless of who holds it or when a handover
 *   happened; merits persist across a handover, only manoeuvres reset - see
 *   oxp-5). A prior, unnamed holder occupied that seat Games 1-4; this
 *   collection has no holder-history field, so that prior holder is not, and
 *   does not need to be, represented here. Worth keeping in mind for oxp.5's
 *   handover-logic story, since it means a real handover already happened on
 *   this exact seat before oxp.5 exists to log one.
 *
 *   Below, `--rene-created-at=2026-02-21` (or
 *   `RENE_PRIMOGEN_SEAT_CREATED_AT = '2026-02-21'`) is therefore the
 *   confirmed, correct value to run this with - not a guess, not a default.
 *   The refuse-without-a-date behaviour stays in place regardless: it is a
 *   general safety property of this script (never silently assume a date),
 *   not a placeholder for this one specific gap now that the gap is closed.
 *
 * ==========================================================================
 *
 * The other six dates come from the epic's own table and are taken on its
 * authority. They were NOT independently re-derived from `game_sessions`
 * during oxp.1's data-lock, because `game_sessions` is not uniquely keyed by
 * `game_number` (game 3 and game 4 each have five documents, one real and
 * four junk placeholders, and for game 3 the real one is the OLDEST). See
 * data-map.md Known Drift Pattern #17 before trying to re-derive them.
 *
 * The seven character ObjectIds were confirmed live against
 * `tm_suite.characters` on 2026-08-13 and are recorded in oxp.1's Dev Notes.
 * Do not re-query to rediscover them.
 *
 * Idempotency: the natural key is `{ office_category, holder_id }`. An
 * existing seat for that pair is left completely untouched, including any
 * notes or labels an ST has edited since. Only genuinely missing seats are
 * inserted. Re-running reports "inserted 0".
 *
 * That idempotency is ATOMIC, not merely sequential. The write is a single
 * `updateOne` upsert with `$setOnInsert`, so two overlapping runs cannot both
 * decide a seat is missing and both create it. The earlier find-then-insert
 * shape could, and did: four concurrent runs against an empty collection
 * produced 13 to 19 documents instead of 7. There is no unique index on the
 * natural key to catch that afterwards, so the operation itself has to be the
 * guard. `$setOnInsert` is also what leaves an existing seat's ST-edited
 * fields alone, because on the match branch it writes nothing at all.
 *
 * Seat identity is the document `_id`, which MongoDB mints. This script never
 * assigns one, so re-inserting a deleted seat produces a NEW seat, correctly:
 * the old seat is gone.
 *
 * Usage, from `server/` so that cwd-relative `dotenv/config` picks up
 * `server/.env`:
 *
 *   # preview against the configured database, no writes (the default):
 *   node scripts/seed-office-seats.mjs --rene-created-at=2026-02-21
 *
 *   # write:
 *   node scripts/seed-office-seats.mjs --rene-created-at=2026-02-21 --apply
 *
 *   # write to the throwaway test database instead of live:
 *   MONGODB_DB=tm_suite_test node scripts/seed-office-seats.mjs --rene-created-at=2026-02-21 --apply
 *
 * Connection comes from `../db.js` (MONGODB_URI via config.js, database name
 * from MONGODB_DB, defaulting to `tm_suite`), the same as
 * `backfill-free-grants.js`. Running it bare with `server/.env` in place
 * therefore targets LIVE Atlas. Two things make that survivable: the dry-run
 * default, and the fact that `main()` validates its arguments BEFORE calling
 * `connectDb()`, so a zero-flag invocation fails on the missing Rene date
 * without ever contacting the cluster.
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { ObjectId } from 'mongodb';
import { connectDb, getCollection, closeDb } from '../db.js';

const COLLECTION = 'office_seats';

/**
 * Rene St. Dominique's Primogen seat creation date. Intentionally null.
 * Read the header block above before changing it.
 */
export const RENE_PRIMOGEN_SEAT_CREATED_AT = null;

/**
 * The seven real seats, confirmed live 2026-08-13.
 *
 * `holder` is carried alongside the ObjectId purely so a human reviewing this
 * table can tell at a glance what each id refers to. It is NOT written to the
 * documents; the seat points at a character, and the character owns its own
 * name.
 *
 * `created_at: null` marks the value as caller-supplied, which today means
 * Rene's seat and only Rene's seat.
 */
export const OFFICE_SEATS = [
  { office_category: 'Head of State', holder: 'Eve Lockridge',      holder_id: '69d73ea49162ece35897a488', seat_label: null,             created_at: '2026-02-21' },
  { office_category: 'Primogen',      holder: 'Yusuf Kalusicj',     holder_id: '69d720427fdd1b1f9498b0d4', seat_label: null,             created_at: '2026-02-21' },
  { office_category: 'Primogen',      holder: 'Rene St. Dominique', holder_id: '69d73ea49162ece35897a496', seat_label: null,             created_at: null },
  { office_category: 'Enforcer',      holder: 'Einar Solveig',      holder_id: '69d73ea49162ece35897a487', seat_label: null,             created_at: '2026-02-21' },
  // prax.4b: 'Harpy' -> 'City Harpy'. The Praxis mass-clear matches this seat
  // by `seat_label` and must never reach the popular seat below, so the two
  // labels have to be unambiguous rather than one being a prefix of the other.
  // This literal is the source of truth for a FRESH seed ONLY - the upsert
  // below is `$setOnInsert`, so it writes nothing on the match branch and can
  // never relabel an existing document. The live document is renamed by
  // scripts/rename-city-harpy-seat.mjs, which Angelus runs by hand.
  { office_category: 'Socialite',     holder: 'Brandy LaRoux',      holder_id: '69d73ea49162ece35897a47e', seat_label: 'City Harpy',     created_at: '2026-02-21' },
  { office_category: 'Socialite',     holder: 'Carver',             holder_id: '69d73ea49162ece35897a47f', seat_label: "People's Harpy", created_at: '2026-07-18' },
  { office_category: 'Administrator', holder: 'Ivana Horvat',       holder_id: '69d73ea49162ece35897a48b', seat_label: null,             created_at: '2026-06-20' },
];

// Same shape the schema enforces (month and day range-bounded, so
// '2026-99-99' is rejected here as well as there). Kept local rather than
// imported so the error message can name the offending value; the schema is
// still the authority, and the suite validates every built document against it.
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])([T ][0-9:.+\-Z]+)?$/;

/**
 * True only if `value` is a date that actually exists on the calendar.
 *
 * The pattern above is a SHAPE check and cannot be more than that: no regex
 * can express "the 30th does not exist in February", so '2026-02-30' and
 * '2027-02-29' both match it. Nor is `Date.parse` alone enough. V8 falls back
 * to a lenient legacy parser when the strict ISO parse fails, so
 * `Date.parse('2026-02-30')` does NOT return NaN, it silently rolls the value
 * forward to 2 March, which is worse than a loud failure: oxp.2 would then
 * compute months-since-creation from a date nobody ever entered.
 *
 * So both checks are needed, and both are done here:
 *   - a UTC round-trip on the leading YYYY-MM-DD, which catches the rolled-
 *     forward cases the parser hides, and
 *   - `Date.parse` on the whole string, which catches a malformed time tail
 *     such as '2026-02-21T+++' that the permissive pattern lets through.
 *
 * This is the one write path the collection has today, so this is where the
 * residual gap the schema documents actually gets closed.
 */
function isRealCalendarDate(value) {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const roundTrips =
    utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d;
  return roundTrips && !Number.isNaN(Date.parse(value));
}

/**
 * Build the seven seat documents, ready to insert.
 *
 * Throws rather than defaulting when Rene's date is missing or malformed.
 * No `_id` is assigned; MongoDB mints one per seat.
 *
 * @param {{ reneCreatedAt?: string|null }} opts
 * @returns {Array<object>}
 */
export function buildSeatDocs({ reneCreatedAt } = {}) {
  const reneDate = reneCreatedAt || RENE_PRIMOGEN_SEAT_CREATED_AT;

  if (!reneDate) {
    throw new Error(
      "Rene St. Dominique's Primogen seat creation date is unconfirmed. " +
      'Confirm it with Angelus, then set RENE_PRIMOGEN_SEAT_CREATED_AT in ' +
      'this script or pass --rene-created-at=YYYY-MM-DD. It is deliberately ' +
      'not defaulted: see the header comment.'
    );
  }
  if (!ISO_DATE.test(reneDate)) {
    throw new Error(
      `Rene St. Dominique's creation date '${reneDate}' is not an ISO date. ` +
      'Expected YYYY-MM-DD (or a full ISO 8601 timestamp).'
    );
  }
  if (!isRealCalendarDate(reneDate)) {
    throw new Error(
      `Rene St. Dominique's creation date '${reneDate}' is not a real calendar date. ` +
      'It has the right shape but does not exist (or its time part is malformed), ' +
      'so oxp.2 would derive a wrong or NaN months-since-creation figure from it.'
    );
  }

  return OFFICE_SEATS.map(s => ({
    office_category: s.office_category,
    holder_id: s.holder_id,
    created_at: s.created_at ?? reneDate,
    seat_label: s.seat_label,
    notes: null,
  }));
}

/**
 * Insert any of the seven seats that are missing from `collection`.
 *
 * Idempotent by the natural key `{ office_category, holder_id }`, atomically:
 * one upsert per seat, so overlapping callers cannot duplicate one. Existing
 * seats are never updated, so ST edits to notes or labels survive a re-run.
 *
 * Takes the collection as an argument rather than resolving it internally,
 * so a test can hand it a `tm_suite_test` collection and this can never
 * reach live data by accident.
 *
 * @param {import('mongodb').Collection} collection
 * @param {{ apply?: boolean, reneCreatedAt?: string|null, log?: Function }} opts
 * @returns {Promise<{planned:number, alreadyPresent:number, missing:number, inserted:number, rows:Array}>}
 */
export async function seedOfficeSeats(collection, { apply = false, reneCreatedAt, log = () => {} } = {}) {
  const docs = buildSeatDocs({ reneCreatedAt });
  const rows = [];
  let inserted = 0;
  let alreadyPresent = 0;

  for (const doc of docs) {
    const holderOid = new ObjectId(doc.holder_id);
    const naturalKey = { office_category: doc.office_category, holder_id: holderOid };
    const label = `${doc.office_category}${doc.seat_label ? ` (${doc.seat_label})` : ''} / ${doc.holder_id}`;

    // Dry run is a pure read, so a plain existence check is all it can be.
    if (!apply) {
      const existing = await collection.findOne(naturalKey);
      if (existing) {
        alreadyPresent += 1;
        rows.push({ ...doc, action: 'present', _id: existing._id });
        log(`  present : ${label}  seat _id ${existing._id}`);
      } else {
        rows.push({ ...doc, action: 'would-insert', _id: null });
        log(`  [DRY RUN] would insert: ${label}  created_at ${doc.created_at}`);
      }
      continue;
    }

    // ONE atomic operation decides insert-or-nothing. A read-then-write pair
    // would leave a window in which two overlapping runs both see the seat
    // missing and both insert it; there is no unique index on the natural key
    // to catch that afterwards, so the operation itself has to be the guard.
    //
    // `$setOnInsert` is what preserves the established behaviour that an
    // EXISTING seat is left completely alone: an ST's hand-edited `notes` or
    // `seat_label` are never written back to the hardcoded table's values,
    // because on the match branch this update writes nothing at all.
    const result = await collection.updateOne(
      naturalKey,
      { $setOnInsert: { ...doc, holder_id: holderOid } },
      { upsert: true }
    );

    if (result.upsertedCount === 1) {
      inserted += 1;
      rows.push({ ...doc, action: 'inserted', _id: result.upsertedId });
      log(`  inserted: ${label}  created_at ${doc.created_at}  seat _id ${result.upsertedId}`);
      continue;
    }

    // Matched an existing seat and wrote nothing. Re-read purely to report
    // its `_id`; the insert decision was already made, atomically, above.
    const existing = await collection.findOne(naturalKey);
    alreadyPresent += 1;
    rows.push({ ...doc, action: 'present', _id: existing ? existing._id : null });
    log(`  present : ${label}  seat _id ${existing ? existing._id : '(unknown)'}`);
  }

  return {
    planned: docs.length,
    alreadyPresent,
    missing: docs.length - alreadyPresent,
    inserted,
    rows,
  };
}

export async function main(argv = process.argv) {
  const apply = argv.includes('--apply');
  const reneArg = (argv.find(a => a.startsWith('--rene-created-at=')) || '').split('=')[1] || null;
  const dbName = process.env.MONGODB_DB || 'tm_game';

  console.log(`Mode     : ${apply ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${dbName}`);
  console.log('');

  // Validate the arguments BEFORE opening a connection. Running this script
  // bare from `server/` targets live Atlas (see the header), and a zero-flag
  // invocation is guaranteed to fail on the missing Rene date, so connecting
  // first would contact the live cluster purely to throw a moment later. The
  // build is pure and cheap; do it while still offline, then connect only
  // once the run is known to be able to proceed. `seedOfficeSeats` builds the
  // documents again itself, which is deliberate: it is the callable API and
  // must not depend on `main` having pre-validated anything for it.
  buildSeatDocs({ reneCreatedAt: reneArg });

  await connectDb();
  try {
    const result = await seedOfficeSeats(getCollection(COLLECTION), {
      apply,
      reneCreatedAt: reneArg,
      log: msg => console.log(msg),
    });

    console.log('');
    console.log(`Planned ${result.planned} seat(s): ${result.alreadyPresent} already present, ${result.missing} missing.`);
    if (apply) {
      console.log(`Inserted ${result.inserted}.`);
      console.log('Idempotency check: re-run with --apply and confirm "Inserted 0".');
    } else {
      console.log(`Would insert ${result.missing}. Re-run with --apply to write.`);
    }
  } finally {
    await closeDb();
  }
}

// Auto-run only when invoked directly, never when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
