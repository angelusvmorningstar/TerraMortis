/**
 * Seed script — inserts K-9 + Falconry style-retainer grant rule docs.
 * Idempotent: uses replaceOne/upsert on stable composite keys.
 *
 * Usage:
 *   node server/scripts/seed-rules-style-retainers.js --dry-run   (default)
 *   node server/scripts/seed-rules-style-retainers.js --apply
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
      source: 'K-9',
      grant_type: 'merit',
      condition: 'fighting_style_present',
      target: 'Retainer',
      target_qualifier: 'Dog',
      amount: 1,
      amount_basis: 'flat',
      category: 'influence',
      notes: 'K-9 fighting style: auto-creates Retainer (Dog) with free_pet=1 when K-9 is purchased at rating ≥ 1.',
    },
    filter: { source: 'K-9', grant_type: 'merit', condition: 'fighting_style_present' },
  },
  {
    doc: {
      source: 'Falconry',
      grant_type: 'merit',
      condition: 'fighting_style_present',
      target: 'Retainer',
      target_qualifier: 'Falcon',
      amount: 1,
      amount_basis: 'flat',
      category: 'influence',
      notes: 'Falconry fighting style: auto-creates Retainer (Falcon) with free_pet=1 when Falconry is purchased at rating ≥ 1.',
    },
    filter: { source: 'Falconry', grant_type: 'merit', condition: 'fighting_style_present' },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const strip = (uri) => uri.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(strip(MONGODB_URI), { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const now = new Date().toISOString();

  console.log(`[seed-rules-style-retainers] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

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

  console.log(`\n[seed-rules-style-retainers] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-style-retainers] Error:', err.message);
  process.exit(1);
});
