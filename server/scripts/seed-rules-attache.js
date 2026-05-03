/**
 * Seed script — three Attaché variant rule_grant docs (auto_bonus pattern).
 *
 * Each variant grants free_attache dots on its named target merit equal to the
 * bearer's Invictus covenant status. Companion to seed-merit-attache-variants.js
 * (the catalog merits). Idempotent: replaceOne with upsert on (source, grant_type).
 *
 * Usage:
 *   node server/scripts/seed-rules-attache.js          (dry run)
 *   node server/scripts/seed-rules-attache.js --apply  (writes)
 *
 * Target DB is MONGODB_DB env var (default: tm_suite).
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
  { source: 'Attaché (Safe Place)', target: 'Safe Place' },
  { source: 'Attaché (Contacts)',   target: 'Contacts'   },
  { source: 'Attaché (Resources)',  target: 'Resources'  },
];

const buildRule = (v) => ({
  source: v.source,
  grant_type: 'auto_bonus',
  condition: 'merit_present',
  target: v.target,
  target_field: 'free_attache',
  amount_basis: 'rating_of_status',
  partner_status_names: ['Invictus'],
  notes: `${v.source}: grants free_attache dots on the character's ${v.target} merit equal to their effective Invictus covenant status.`,
});

async function run() {
  const uri = MONGODB_URI.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const now = new Date().toISOString();

  console.log(`[seed-rules-attache] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  for (const v of VARIANTS) {
    const doc = buildRule(v);
    const filter = { source: v.source, grant_type: 'auto_bonus' };
    const existing = await db.collection('rule_grant').findOne(filter);
    console.log(`  [rule_grant] ${existing ? 'EXISTS (upsert)' : 'INSERT'} — source: ${v.source}`);
    if (!DRY_RUN) {
      await db.collection('rule_grant').replaceOne(
        filter,
        { ...doc, created_at: existing?.created_at || now, updated_at: now },
        { upsert: true },
      );
      console.log('    → written');
    }
  }

  console.log(`\n[seed-rules-attache] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-attache] Error:', err.message);
  process.exit(1);
});
