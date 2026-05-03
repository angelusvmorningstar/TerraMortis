/**
 * Seed script — three Attaché variant merits in the purchasable_powers catalog.
 *
 * Replaces the original single "Attaché" merit + attached_to dropdown approach
 * with three explicit merits, mutually exclusive (a character can hold at most
 * one). The variant name itself encodes the target merit — the runtime bonus
 * code (domain.js:attacheBonusDots) recognises both shapes.
 *
 * The original "Attaché" merit (key=attach) stays in the catalog so the five
 * existing characters in tm_suite continue to work without migration. ST can
 * decide whether/when to convert those instances to the variant form.
 *
 * Idempotent: replaceOne with upsert on key.
 *
 * Usage:
 *   node server/scripts/seed-merit-attache-variants.js          (dry run)
 *   node server/scripts/seed-merit-attache-variants.js --apply  (writes)
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

const VARIANTS = [
  { key: 'attache-safe-place', name: 'Attaché (Safe Place)', target: 'Safe Place' },
  { key: 'attache-contacts',   name: 'Attaché (Contacts)',   target: 'Contacts'   },
  { key: 'attache-resources',  name: 'Attaché (Resources)',  target: 'Resources'  },
];

function buildMerit(variant, allNames) {
  const exclusiveList = allNames.filter(n => n !== variant.name).join(', ');
  return {
    key: variant.key,
    name: variant.name,
    category: 'merit',
    sub_category: 'influence',
    parent: 'Kindred',
    rank: null,
    rating_range: [1, 1],
    description: `Attaché variant — grants ${variant.target} a free-dot bonus equal to the bearer's Invictus covenant status. Mutually exclusive with the other two Attaché variants. Prerequisite: Invictus 1+.`,
    pool: null,
    resistance: null,
    cost: null,
    action: null,
    duration: null,
    prereq: { type: 'status', dots: 1, qualifier: 'Invictus' },
    exclusive: exclusiveList,
    xp_fixed: null,
    bloodline: null,
    selected: true,
    implemented: true,
  };
}

async function run() {
  const uri = MONGODB_URI.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);

  console.log(`[seed-merit-attache-variants] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  const allNames = VARIANTS.map(v => v.name);
  for (const v of VARIANTS) {
    const merit = buildMerit(v, allNames);
    const existing = await db.collection('purchasable_powers').findOne({ key: v.key });
    console.log(`  [purchasable_powers] ${existing ? 'EXISTS (upsert)' : 'INSERT'} — key: ${v.key}`);
    console.log(`    exclusive: ${merit.exclusive}`);
    if (!DRY_RUN) {
      await db.collection('purchasable_powers').replaceOne({ key: v.key }, merit, { upsert: true });
      console.log('    → written');
    }
  }

  console.log(`\n[seed-merit-attache-variants] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-merit-attache-variants] Error:', err.message);
  process.exit(1);
});
