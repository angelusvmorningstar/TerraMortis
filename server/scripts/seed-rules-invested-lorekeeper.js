/**
 * Seed script — inserts Invested + Lorekeeper pool grant rule docs.
 * Idempotent: uses replaceOne/upsert on stable composite keys.
 *
 * Usage:
 *   node server/scripts/seed-rules-invested-lorekeeper.js --dry-run   (default)
 *   node server/scripts/seed-rules-invested-lorekeeper.js --apply
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
      source: 'Invested',
      grant_type: 'pool',
      condition: 'merit_present',
      pool_targets: ['Herd', 'Mentor', 'Resources', 'Retainer'],
      category: 'inv',
      amount_basis: 'rating_of_partner_merit',
      partner_merit_name: 'Invictus Status',
      notes: 'Invested (Invictus): pool of free dots equal to effective Invictus covenant Status (including OTS floor), distributable across Herd, Mentor, Resources, Retainer. Allocation stored as free_inv on individual merit instances.',
    },
    filter: { source: 'Invested', grant_type: 'pool' },
  },
  {
    doc: {
      source: 'Lorekeeper',
      grant_type: 'pool',
      condition: 'merit_present',
      pool_targets: ['Herd', 'Retainer'],
      category: 'lk',
      amount_basis: 'rating_of_partner_merit',
      partner_merit_names: ['Library', 'Esoteric Armoury'],
      notes: 'Lorekeeper: pool of free dots equal to purchased Library + Esoteric Armoury dots (CP + XP only, not free), distributable across Herd and Retainer. Allocation stored as free_lk on individual merit instances.',
    },
    filter: { source: 'Lorekeeper', grant_type: 'pool' },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const strip = (uri) => uri.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(strip(MONGODB_URI), { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const now = new Date().toISOString();

  console.log(`[seed-rules-invested-lorekeeper] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

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

  console.log(`\n[seed-rules-invested-lorekeeper] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-invested-lorekeeper] Error:', err.message);
  process.exit(1);
});
