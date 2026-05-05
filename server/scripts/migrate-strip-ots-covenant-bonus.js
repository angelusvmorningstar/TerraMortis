/**
 * One-shot: remove the stale _ots_covenant_bonus field from every character.
 *
 * Background: OTS used to write _ots_covenant_bonus = pact rating onto the
 * character, then various places (sheet, csv export, city-views) read it
 * back as either a positive floor or a negative penalty (city-views did
 * the latter — that's the -2 Charlie Ballsack hit on his Invictus dots).
 *
 * Commit bce7a96 stripped OTS-on-covenant-status entirely (the penalty
 * is narrative-only now), but historical character docs still carry the
 * field. status-tab.js had to defensively skip it in efd4940. Drop the
 * field everywhere so future code can stop carrying that dead-code shape.
 *
 * Idempotent: $unset on docs that have the field, no-op on docs that don't.
 *
 * Usage:
 *   node server/scripts/migrate-strip-ots-covenant-bonus.js          (dry run)
 *   node server/scripts/migrate-strip-ots-covenant-bonus.js --apply  (writes)
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const DRY_RUN = !process.argv.includes('--apply');
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'tm_suite';

if (!MONGODB_URI) {
  console.error('MONGODB_URI not set.');
  process.exit(1);
}

async function run() {
  const uri = MONGODB_URI.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);

  console.log(`[migrate-strip-ots-covenant-bonus] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  const docs = await db.collection('characters')
    .find(
      { _ots_covenant_bonus: { $exists: true } },
      { projection: { _id: 1, name: 1, _ots_covenant_bonus: 1 } },
    )
    .toArray();

  if (!docs.length) {
    console.log('No characters carry _ots_covenant_bonus — nothing to do.');
    await client.close();
    return;
  }

  console.log(`Found ${docs.length} character(s) with stale _ots_covenant_bonus:`);
  for (const d of docs) {
    console.log(`  ${d.name.padEnd(30)} — current value: ${d._ots_covenant_bonus}`);
  }

  if (!DRY_RUN) {
    const r = await db.collection('characters').updateMany(
      { _ots_covenant_bonus: { $exists: true } },
      { $unset: { _ots_covenant_bonus: '' } },
    );
    console.log(`\nWrote: matched ${r.matchedCount}, modified ${r.modifiedCount}.`);
  }

  console.log(`\n[migrate-strip-ots-covenant-bonus] ${DRY_RUN ? 'Dry run — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[migrate-strip-ots-covenant-bonus] Error:', err.message);
  process.exit(1);
});
