/**
 * prax.4b precondition: rename the APPOINTED Socialite seat's `seat_label`
 * from plain `'Harpy'` to `'City Harpy'`. Manual, ST-invoked, one-off. Nothing
 * calls this on server boot and nothing calls it in test setup; the vitest
 * suite imports its exported functions and runs them against `tm_game_test`
 * only.
 *
 * NOTE FOR ANYONE TIDYING THIS FILE: there is deliberately NO
 * `#!/usr/bin/env node` shebang, for the reason
 * `migrate-office-purchases-to-seats.mjs` documents at length - vitest's
 * transform fails on one with a bare "SyntaxError: Invalid or unexpected
 * token" and no location, silently taking down the whole suite that imports
 * the file. This script IS imported by a test suite. Run it with an explicit
 * `node`.
 *
 * ==========================================================================
 *   RUNNING THIS FOR REAL IS ANGELUS'S ACTION, NOT AN AGENT'S.
 * ==========================================================================
 *
 *   Connection comes from `../db.js` (MONGODB_URI via config.js, database
 *   name from MONGODB_DB, defaulting to `tm_game`), the same as
 *   `seed-office-seats.mjs` and `migrate-office-purchases-to-seats.mjs`.
 *   Running this bare from `server/` with `server/.env` in place therefore
 *   targets LIVE Atlas. What makes that survivable is the DRY-RUN DEFAULT:
 *   without `--apply` this only reads, and prints exactly what it would do.
 *
 * ==========================================================================
 *   WHY THE RENAME EXISTS AT ALL
 * ==========================================================================
 *
 *   prax.4b's Praxis resolve mass-clears every seat matching
 *
 *     office_category IN ('Enforcer', 'Administrator')
 *       OR (office_category = 'Socialite' AND seat_label = 'City Harpy')
 *
 *   Socialite has TWO live seats whose holders' character documents are
 *   indistinguishable from each other (see server/schemas/office_seat.schema.js):
 *   the APPOINTED one, labelled plain `'Harpy'` today, and the POPULAR one,
 *   labelled `"People's Harpy"` (prax.4a's own target). The mass-clear must hit
 *   the first and never the second, and `seat_label` is the only field that
 *   tells them apart - so the label it matches on has to be unambiguous rather
 *   than a prefix of the other one.
 *
 *   `"People's Harpy"` IS NEVER TOUCHED BY THIS SCRIPT. The filter below is an
 *   exact equality match on the literal string `'Harpy'`, not a prefix, regex
 *   or `$in`, so it cannot reach the popular seat even by accident. Do not
 *   loosen it.
 *
 * ==========================================================================
 *   WHY A SCRIPT AND NOT JUST THE SEED
 * ==========================================================================
 *
 *   `server/scripts/seed-office-seats.mjs`'s own `OFFICE_SEATS` literal is
 *   updated by the same story, but that is the source of truth for a FRESH
 *   seed only: its write is a single `updateOne` upsert with `$setOnInsert`,
 *   which on the match branch writes nothing at all. It will therefore never
 *   retroactively relabel an existing document. Both artefacts are needed.
 *
 * Usage, from `server/` so that cwd-relative `dotenv/config` picks up
 * `server/.env`:
 *
 *   # preview against the configured database, no writes (the default):
 *   node scripts/rename-city-harpy-seat.mjs
 *
 *   # write:
 *   node scripts/rename-city-harpy-seat.mjs --apply
 *
 *   # write to the throwaway test database instead of live:
 *   MONGODB_DB=tm_game_test node scripts/rename-city-harpy-seat.mjs --apply
 *
 * IDEMPOTENCY. A second run is a clean no-op, not an error: `planRename` reads
 * BOTH labels, so "no plain 'Harpy' seat, exactly one 'City Harpy' seat" is
 * recognised as ALREADY DONE rather than reported as nothing to rename. That
 * distinction is the whole reason the plan reads two filters instead of one.
 *
 * REFUSE RATHER THAN GUESS, following the discipline the two migration scripts
 * beside this one established. Every ambiguous shape is reported and left
 * completely untouched:
 *
 *   - zero seats under either label  -> REFUSED (seed the seats first);
 *   - two or more plain 'Harpy'      -> REFUSED (which one is the appointed
 *                                       seat is a human decision);
 *   - two or more 'City Harpy'       -> REFUSED (the mass-clear query is
 *                                       already ambiguous; renaming a third
 *                                       into it would make that worse);
 *   - one of EACH                    -> REFUSED (renaming would produce two
 *                                       'City Harpy' seats, which is precisely
 *                                       the ambiguity this rename exists to
 *                                       remove).
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { connectDb, getCollection, closeDb } from '../db.js';

/** The one collection this script owns. Nothing else is touched. */
export const COLLECTION = 'office_seats';

/** The office category both Socialite seats sit under. */
export const SOCIALITE_CATEGORY = 'Socialite';

/** The label as it stands today on the appointed seat. */
export const OLD_SEAT_LABEL = 'Harpy';

/** The label prax.4b's mass-clear query matches on. */
export const NEW_SEAT_LABEL = 'City Harpy';

/**
 * The popular Socialite seat, named here ONLY so this file can say out loud
 * that it is never a target. The straight apostrophe matches the real seeded
 * data (`seed-office-seats.mjs`) and must not be prettified into a typographic
 * one.
 */
export const PEOPLES_HARPY_SEAT_LABEL = "People's Harpy";

/**
 * Classify what this database currently holds. PURE: reads only, no writes, no
 * side effects, so `main()` can print the whole plan before anyone decides
 * whether to run it.
 *
 * The collection is taken as an ARGUMENT rather than resolved internally, so a
 * test can hand over a `tm_game_test` collection and this can never reach live
 * data by accident.
 *
 * @param {import('mongodb').Collection} collection
 * @returns {Promise<{action:string, seat?:object, old:object[], renamed:object[]}>}
 */
export async function planRename(collection) {
  const [old_, renamed] = await Promise.all([
    collection.find({ office_category: SOCIALITE_CATEGORY, seat_label: OLD_SEAT_LABEL }).toArray(),
    collection.find({ office_category: SOCIALITE_CATEGORY, seat_label: NEW_SEAT_LABEL }).toArray(),
  ]);

  const base = { old: old_, renamed };

  // Ambiguity on either side is checked BEFORE the happy path, so a database
  // holding two of one label and one of the other is refused rather than
  // half-recognised.
  if (old_.length > 1) return { ...base, action: 'refused-ambiguous-source' };
  if (renamed.length > 1) return { ...base, action: 'refused-ambiguous-target' };
  if (old_.length === 1 && renamed.length === 1) return { ...base, action: 'refused-both-present' };
  if (old_.length === 1) return { ...base, action: 'will-rename', seat: old_[0] };
  if (renamed.length === 1) return { ...base, action: 'already-renamed', seat: renamed[0] };
  return { ...base, action: 'refused-none' };
}

/**
 * Carry out (or, by default, merely narrate) the plan.
 *
 * The write is filtered on the seat's `_id` AND its label still being the OLD
 * one - an optimistic-concurrency guard in the same spirit as
 * `migrate-office-purchases-to-seats.mjs`'s `unchangedSince`. `planRename` and
 * this function are separate round-trips, so a label edited by hand in between
 * must not be silently overwritten; if the guard misses, nothing is written and
 * the row is reported as CHANGED rather than counted as renamed.
 *
 * @param {import('mongodb').Collection} collection
 * @param {object} plan - the output of `planRename`
 * @param {{ apply?: boolean, log?: Function }} opts
 * @returns {Promise<{renamed:number, alreadyRenamed:number, refused:number, changedSincePlan:number}>}
 */
export async function applyRename(collection, plan, { apply = false, log = () => {} } = {}) {
  const totals = { renamed: 0, alreadyRenamed: 0, refused: 0, changedSincePlan: 0 };

  const describe = seat =>
    `seat _id ${String(seat._id)} (holder_id ${seat.holder_id == null ? 'null (vacant)' : String(seat.holder_id)})`;

  if (plan.action === 'already-renamed') {
    totals.alreadyRenamed += 1;
    log(`  present  : ${describe(plan.seat)} is already labelled '${NEW_SEAT_LABEL}'. Nothing to do.`);
    return totals;
  }

  if (plan.action === 'refused-none') {
    totals.refused += 1;
    log(`  REFUSED  : no ${SOCIALITE_CATEGORY} seat is labelled '${OLD_SEAT_LABEL}' or '${NEW_SEAT_LABEL}'. ` +
        'Nothing renamed. Seed the office seats first (scripts/seed-office-seats.mjs).');
    return totals;
  }

  if (plan.action === 'refused-ambiguous-source') {
    totals.refused += 1;
    log(`  REFUSED  : ${plan.old.length} ${SOCIALITE_CATEGORY} seats are labelled '${OLD_SEAT_LABEL}' ` +
        `(${plan.old.map(s => String(s._id)).join(', ')}). ` +
        'A human must decide which one is the appointed seat. All left untouched.');
    return totals;
  }

  if (plan.action === 'refused-ambiguous-target') {
    totals.refused += 1;
    log(`  REFUSED  : ${plan.renamed.length} ${SOCIALITE_CATEGORY} seats are ALREADY labelled '${NEW_SEAT_LABEL}' ` +
        `(${plan.renamed.map(s => String(s._id)).join(', ')}). ` +
        "prax.4b's mass-clear query cannot tell them apart; reconcile them by hand. All left untouched.");
    return totals;
  }

  if (plan.action === 'refused-both-present') {
    totals.refused += 1;
    log(`  REFUSED  : one seat is labelled '${OLD_SEAT_LABEL}' (${String(plan.old[0]._id)}) and another is ` +
        `already labelled '${NEW_SEAT_LABEL}' (${String(plan.renamed[0]._id)}). ` +
        'Renaming would leave TWO City Harpy seats, which is the exact ambiguity this rename removes. ' +
        'Both left untouched.');
    return totals;
  }

  const seat = plan.seat;

  if (!apply) {
    log(`  [DRY RUN] would rename ${describe(seat)}: seat_label '${OLD_SEAT_LABEL}' -> '${NEW_SEAT_LABEL}'`);
    return totals;
  }

  const result = await collection.updateOne(
    { _id: seat._id, office_category: SOCIALITE_CATEGORY, seat_label: OLD_SEAT_LABEL },
    { $set: { seat_label: NEW_SEAT_LABEL } },
  );

  if (result.matchedCount === 1) {
    totals.renamed += 1;
    log(`  renamed  : ${describe(seat)}: seat_label '${OLD_SEAT_LABEL}' -> '${NEW_SEAT_LABEL}'`);
  } else {
    totals.changedSincePlan += 1;
    log(`  CHANGED  : ${describe(seat)} was modified after this run planned its rename. ` +
        'Left untouched. Re-run to pick up the current value.');
  }

  return totals;
}

export async function main(argv = process.argv) {
  const apply = argv.includes('--apply');
  const dbName = process.env.MONGODB_DB || 'tm_game';

  console.log(`Mode     : ${apply ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${dbName}`);
  console.log(`Renaming : ${SOCIALITE_CATEGORY} seat_label '${OLD_SEAT_LABEL}' -> '${NEW_SEAT_LABEL}'`);
  console.log(`Never touched: the ${SOCIALITE_CATEGORY} seat labelled "${PEOPLES_HARPY_SEAT_LABEL}".`);
  console.log('');

  await connectDb();
  try {
    const collection = getCollection(COLLECTION);

    // Printed for context before the plan, so a human reading the dry run can
    // see the whole Socialite picture rather than only the row being acted on.
    const socialite = await collection.find({ office_category: SOCIALITE_CATEGORY }).toArray();
    console.log(`${SOCIALITE_CATEGORY} seats in ${COLLECTION}: ${socialite.length}`);
    for (const s of socialite) {
      console.log(`  - _id ${String(s._id)}  seat_label ${JSON.stringify(s.seat_label ?? null)}  ` +
                  `holder_id ${s.holder_id == null ? 'null' : String(s.holder_id)}`);
    }
    console.log('');

    const plan = await planRename(collection);
    const totals = await applyRename(collection, plan, { apply, log: msg => console.log(msg) });

    console.log('');
    console.log(
      `Totals: ${totals.renamed} renamed, ${totals.alreadyRenamed} already renamed, ` +
      `${totals.refused} refused, ${totals.changedSincePlan} changed since planning.`
    );
    if (apply) {
      console.log('Idempotency check: re-run with --apply and confirm "0 renamed, 1 already renamed".');
    } else if (plan.action === 'will-rename') {
      console.log('Re-run with --apply to write.');
    }
    if (totals.refused > 0) {
      console.log('');
      console.log('The run was REFUSED and nothing was changed at all.');
      console.log('Decide what should happen by hand, then re-run.');
    }
  } finally {
    await closeDb();
  }
}

// Auto-run only when invoked directly, never when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
