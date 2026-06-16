/**
 * Seed script — inserts derived-stat modifier rule docs.
 * Idempotent: uses replaceOne/upsert on stable composite key.
 *
 * Three docs in rule_derived_stat_modifier:
 *   Giant          → size    (flat +1)
 *   Fleet of Foot  → speed   (rating)
 *   Defensive Combat → defence (skill_swap, swap_from Athletics, swap_to from merit.qualifier)
 *
 * Usage:
 *   node server/scripts/seed-rules-derived-stat-modifiers.js --dry-run   (default)
 *   node server/scripts/seed-rules-derived-stat-modifiers.js --apply
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

const DERIVED_STAT_DOCS = [
  {
    doc: {
      source: 'Giant',
      target_stat: 'size',
      mode: 'flat',
      flat_amount: 1,
      notes: 'Giant merit: adds +1 to Size (VtR 2e).',
    },
    filter: { source: 'Giant', target_stat: 'size' },
  },
  {
    doc: {
      source: 'Fleet of Foot',
      target_stat: 'speed',
      mode: 'rating',
      notes: 'Fleet of Foot merit: adds its rating to Speed (VtR 2e).',
    },
    filter: { source: 'Fleet of Foot', target_stat: 'speed' },
  },
  {
    doc: {
      source: 'Defensive Combat',
      target_stat: 'defence',
      mode: 'skill_swap',
      swap_from: 'Athletics',
      notes: 'Defensive Combat merit: replaces Athletics with the chosen skill (merit.qualifier) in the Defence formula. swap_to is read dynamically from the merit qualifier on the character.',
    },
    filter: { source: 'Defensive Combat', target_stat: 'defence' },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const strip = (uri) => uri.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(strip(MONGODB_URI), { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const now = new Date().toISOString();

  console.log(`[seed-rules-derived-stat-modifiers] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  for (const { doc, filter } of DERIVED_STAT_DOCS) {
    const existing = await db.collection('rule_derived_stat_modifier').findOne(filter);
    console.log(`  [rule_derived_stat_modifier] ${existing ? 'EXISTS (upsert)' : 'INSERT'} — ${doc.source} → ${doc.target_stat} (${doc.mode})`);
    console.log(`    doc:   `, JSON.stringify({ ...doc, created_at: now, updated_at: now }));

    if (!DRY_RUN) {
      await db.collection('rule_derived_stat_modifier').replaceOne(
        filter,
        { ...doc, created_at: existing?.created_at || now, updated_at: now },
        { upsert: true },
      );
      console.log(`    → written`);
    }
  }

  console.log(`\n[seed-rules-derived-stat-modifiers] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-derived-stat-modifiers] Error:', err.message);
  process.exit(1);
});
