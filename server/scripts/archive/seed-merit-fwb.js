/**
 * Seed script — Friends with Benefits merit definition (purchasable_powers).
 *
 * Carthian Movement equivalent of Secret Society Junkie: free Feeding Grounds
 * dots based on MCI + Status. Behaviour is modelled by the auto_bonus rule
 * grant seeded by seed-rules-fwb.js — this script only adds the merit to the
 * catalog so ST can pick it from the editor dropdown.
 *
 * Idempotent: replaceOne with upsert on key.
 *
 * Usage:
 *   node server/scripts/seed-merit-fwb.js          (dry run)
 *   node server/scripts/seed-merit-fwb.js --apply  (writes)
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

const KEY = 'friends-with-benefits';

const MERIT = {
  key: KEY,
  name: 'Friends with Benefits',
  category: 'merit',
  parent: 'Kindred',
  rank: null,
  rating_range: [1, 1],
  description: 'Carthian Movement equivalent of Secret Society Junkie. Status and Mystery Cult Initiation points also count as Feeding Grounds.',
  pool: null,
  resistance: null,
  cost: null,
  action: null,
  duration: null,
  prereq: { type: 'status', dots: 2, qualifier: 'Carthian Movement' },
  exclusive: null,
  xp_fixed: null,
  bloodline: null,
  selected: true,
  implemented: true,
};

async function run() {
  const uri = MONGODB_URI.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);

  console.log(`[seed-merit-fwb] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  const existing = await db.collection('purchasable_powers').findOne({ key: KEY });
  console.log(`  [purchasable_powers] ${existing ? 'EXISTS (upsert will refresh)' : 'INSERT'} — key: ${KEY}`);
  console.log(`    doc:`, JSON.stringify(MERIT));

  if (!DRY_RUN) {
    await db.collection('purchasable_powers').replaceOne(
      { key: KEY },
      MERIT,
      { upsert: true },
    );
    console.log(`    → written`);
  }

  console.log(`\n[seed-merit-fwb] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-merit-fwb] Error:', err.message);
  process.exit(1);
});
