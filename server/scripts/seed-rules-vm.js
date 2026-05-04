/**
 * Seed script — inserts Viral Mythology pool grant rule doc.
 * Idempotent: uses replaceOne/upsert on stable composite key.
 *
 * Usage:
 *   node server/scripts/seed-rules-vm.js --dry-run   (default)
 *   node server/scripts/seed-rules-vm.js --apply
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
      source: 'Viral Mythology',
      grant_type: 'pool',
      condition: 'merit_present',
      pool_targets: ['Allies', 'Herd'],
      category: 'vm',
      amount_basis: 'vm_pool',
      notes: 'Viral Mythology (CotC): single shared pool of free dots allocatable to Allies and/or Herd. Pool size = total purchased Allies dots (CP + XP + free_mci, excluding VM-granted Allies) + total purchased Herd dots (CP + XP). Allocation stored as free_vm on individual merit instances.',
    },
    filter: { source: 'Viral Mythology', grant_type: 'pool' },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const strip = (uri) => uri.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(strip(MONGODB_URI), { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const now = new Date().toISOString();

  console.log(`[seed-rules-vm] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

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

  console.log(`\n[seed-rules-vm] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-vm] Error:', err.message);
  process.exit(1);
});
