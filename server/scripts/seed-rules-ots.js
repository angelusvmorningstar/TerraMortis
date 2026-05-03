/**
 * Seed script — inserts Oath of the Scapegoat rule docs.
 * Idempotent: uses replaceOne/upsert on stable composite key.
 *
 * One doc in rule_grant:
 *   1. style_pool — sets _ots_free_dots = pact rating × 2
 *
 * The historical status_floor doc was removed: per game-rule, OTS is a
 * notional social-check penalty only, never a covenant-status modifier.
 *
 * Usage:
 *   node server/scripts/seed-rules-ots.js --dry-run   (default)
 *   node server/scripts/seed-rules-ots.js --apply
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
      source: 'Oath of the Scapegoat',
      grant_type: 'style_pool',
      condition: 'pact_present',
      pool_targets: 'fighting_styles',
      ephemeral_field: '_ots_free_dots',
      amount_basis: 'pact_rating',
      amount_multiplier: 2,
      notes: 'Sets _ots_free_dots to OTS pact rating × 2. ' +
        'User allocates these as free_ots into fighting styles. ' +
        'Stale free_ots is cleared from all styles when the pact is absent.',
    },
    filter: { source: 'Oath of the Scapegoat', grant_type: 'style_pool' },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const strip = (uri) => uri.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(strip(MONGODB_URI), { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const now = new Date().toISOString();

  console.log(`[seed-rules-ots] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  for (const { doc, filter } of GRANT_DOCS) {
    const existing = await db.collection('rule_grant').findOne(filter);
    console.log(`  [rule_grant] ${existing ? 'EXISTS (upsert will refresh fields)' : 'INSERT'} — grant_type: ${doc.grant_type}`);
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

  console.log(`\n[seed-rules-ots] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-ots] Error:', err.message);
  process.exit(1);
});
