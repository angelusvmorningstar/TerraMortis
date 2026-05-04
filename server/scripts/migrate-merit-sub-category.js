/**
 * One-shot migration: set sub_category on every catalog merit that lives in
 * the Influence or Domain picker, so the editor can drive those pickers from
 * the catalog instead of the hardcoded INFLUENCE_MERIT_TYPES / DOMAIN_MERIT_TYPES
 * arrays in public/js/data/constants.js.
 *
 * Idempotent: only updates when the field is missing or different.
 *
 * Usage:
 *   node server/scripts/migrate-merit-sub-category.js          (dry run)
 *   node server/scripts/migrate-merit-sub-category.js --apply  (writes)
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

// Mirrors the legacy hardcoded arrays in public/js/data/constants.js.
// Plus the three Attaché variants seeded by seed-merit-attache-variants.js.
const INFLUENCE_NAMES = [
  'Allies', 'Attaché', 'Contacts', 'Mentor', 'Resources', 'Retainer', 'Staff', 'Status',
  'Attaché (Safe Place)', 'Attaché (Contacts)', 'Attaché (Resources)',
];
const DOMAIN_NAMES = ['Safe Place', 'Haven', 'Feeding Grounds', 'Herd', 'Mandragora Garden'];

async function run() {
  const uri = MONGODB_URI.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);

  console.log(`[migrate-merit-sub-category] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  // 'Status' is in the legacy hardcoded INFLUENCE_MERIT_TYPES but has no
  // catalog entry — create a minimal one so the catalog-driven picker works.
  const statusExisting = await db.collection('purchasable_powers').findOne({ name: 'Status' });
  if (!statusExisting) {
    const statusDoc = {
      key: 'status', name: 'Status', category: 'merit', parent: 'Kindred', rank: null,
      rating_range: [1, 5], description: 'Reputation in a sphere of mortal society. Sphere or narrow scope picked at the row.',
      pool: null, resistance: null, cost: null, action: null, duration: null,
      prereq: null, exclusive: null, xp_fixed: null, bloodline: null, sub_category: 'influence',
      selected: true, implemented: true,
    };
    console.log(`  CREATE Status (was missing from catalog)`);
    if (!DRY_RUN) await db.collection('purchasable_powers').insertOne(statusDoc);
  }

  const targets = [
    { sub: 'influence', names: INFLUENCE_NAMES },
    { sub: 'domain',    names: DOMAIN_NAMES    },
  ];

  let toUpdate = 0;
  for (const { sub, names } of targets) {
    const docs = await db.collection('purchasable_powers').find({ name: { $in: names } }).toArray();
    const found = new Set(docs.map(d => d.name));
    const missing = names.filter(n => !found.has(n));
    if (missing.length) {
      console.log(`  WARN — these ${sub} names are not in the catalog: ${missing.join(', ')}`);
    }

    for (const doc of docs) {
      if (doc.sub_category === sub) {
        console.log(`  SKIP  ${doc.name.padEnd(30)} — already sub_category='${sub}'`);
        continue;
      }
      const before = doc.sub_category ?? '(none)';
      console.log(`  SET   ${doc.name.padEnd(30)} — sub_category: ${before} → ${sub}`);
      toUpdate++;
      if (!DRY_RUN) {
        await db.collection('purchasable_powers').updateOne(
          { _id: doc._id },
          { $set: { sub_category: sub } },
        );
      }
    }
  }

  console.log(`\n[migrate-merit-sub-category] ${DRY_RUN ? `Dry run — ${toUpdate} doc(s) would be updated. Pass --apply to write.` : `Done — ${toUpdate} doc(s) updated.`}`);
  await client.close();
}

run().catch(err => {
  console.error('[migrate-merit-sub-category] Error:', err.message);
  process.exit(1);
});
