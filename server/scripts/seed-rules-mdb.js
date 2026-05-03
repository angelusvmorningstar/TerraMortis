/**
 * Seed script — inserts Mother-Daughter Bond merit grant rule doc.
 * Idempotent: uses replaceOne/upsert on stable composite key.
 *
 * Usage:
 *   node server/scripts/seed-rules-mdb.js --dry-run   (default)
 *   node server/scripts/seed-rules-mdb.js --apply
 *
 * Target DB is MONGODB_DB env var (default: tm_suite).
 * Use MONGODB_DB=tm_suite_test for test-DB seeding.
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const DRY_RUN = !process.argv.includes('--apply');
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'tm_suite';

if (!MONGODB_URI) {
  console.error('MONGODB_URI not set — ensure server/.env is present.');
  process.exit(1);
}

// ── Rule docs ─────────────────────────────────────────────────────────────────

const GRANT_DOCS = [
  {
    doc: {
      source: 'The Mother-Daughter Bond',
      grant_type: 'merit',
      condition: 'merit_present',
      partner_merit_names: ['Mentor'],
      target_field: 'free_mdb',
      target_category: 'general',
      notes: 'The Mother-Daughter Bond (Lancea et Sanctum): sets free_mdb on the Crúac style named in mdbMerit.qualifier equal to the character\'s effective Mentor rating (cp + free + free_mci + free_vm + free_lk + free_ohm + free_inv + free_pt + xp). No auto-create — style merit must exist.',
    },
    filter: { source: 'The Mother-Daughter Bond', grant_type: 'merit' },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const strip = (uri) => uri.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(strip(MONGODB_URI), { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const now = new Date().toISOString();

  console.log(`[seed-rules-mdb] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  for (const { doc, filter } of GRANT_DOCS) {
    const existing = await db.collection('rule_grant').findOne(filter);
    console.log(`  [rule_grant] ${existing ? 'EXISTS (upsert will refresh fields)' : 'INSERT'} — source: ${doc.source}`);
    console.log(`    filter:`, JSON.stringify(filter));
    console.log(`    doc:   `, JSON.stringify({ ...doc, created_at: now, updated_at: now }));

    if (!DRY_RUN) {
      await db.collection('rule_grant').replaceOne(
        filter,
        { ...doc, created_at: existing?.created_at || now, updated_at: now },
        { upsert: true },
      );
      console.log(`    → written`);
    }
  }

  console.log(`\n[seed-rules-mdb] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-mdb] Error:', err.message);
  process.exit(1);
});
