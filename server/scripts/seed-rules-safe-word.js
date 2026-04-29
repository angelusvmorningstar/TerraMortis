/**
 * Seed script — inserts Oath of the Safe Word merit grant rule doc.
 * Idempotent: uses replaceOne/upsert on stable composite key.
 *
 * Usage:
 *   node server/scripts/seed-rules-safe-word.js --dry-run   (default)
 *   node server/scripts/seed-rules-safe-word.js --apply
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
      source: 'Oath of the Safe Word',
      grant_type: 'merit',
      condition: 'partner_pact_confirmation',
      target_field: 'free_sw',
      mirror_category: 'influence',
      notes: 'Oath of the Safe Word: bidirectional pact. Evaluator checks mutual pointing ' +
        '(both characters must have OSW naming each other), then mirrors the effective rating ' +
        "of the partner's chosen shared_merit as free_sw dots on this character. " +
        'Excludes free_sw from partner rating to prevent circular reference (one-hop only). ' +
        "partner_pact_confirmation is the generic condition for any future bidirectional pacts.",
    },
    filter: { source: 'Oath of the Safe Word', grant_type: 'merit' },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const strip = (uri) => uri.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(strip(MONGODB_URI), { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const now = new Date().toISOString();

  console.log(`[seed-rules-safe-word] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

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

  console.log(`\n[seed-rules-safe-word] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-safe-word] Error:', err.message);
  process.exit(1);
});
