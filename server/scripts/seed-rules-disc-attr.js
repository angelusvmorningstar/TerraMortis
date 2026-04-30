/**
 * Seed script — inserts Discipline → Attribute / derived-stat rule docs.
 * Idempotent: uses replaceOne/upsert on stable composite key.
 *
 * Four docs in rule_disc_attr:
 *   Vigour    → Strength   (attribute)
 *   Resilience → Stamina   (attribute)
 *   Celerity  → Speed      (derived_stat)
 *   Celerity  → Defence    (derived_stat)
 *
 * NOTE: No Celerity → Dexterity rule — TM house rule; absence is intentional.
 *
 * Usage:
 *   node server/scripts/seed-rules-disc-attr.js --dry-run   (default)
 *   node server/scripts/seed-rules-disc-attr.js --apply
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

const DISC_ATTR_DOCS = [
  {
    doc: {
      discipline: 'Vigour',
      target_kind: 'attribute',
      target_name: 'Strength',
      amount_basis: 'rating',
      notes: 'Vigour adds its dots to the effective Strength rating (VtR 2e).',
    },
    filter: { discipline: 'Vigour', target_kind: 'attribute', target_name: 'Strength' },
  },
  {
    doc: {
      discipline: 'Resilience',
      target_kind: 'attribute',
      target_name: 'Stamina',
      amount_basis: 'rating',
      notes: 'Resilience adds its dots to the effective Stamina rating (VtR 2e).',
    },
    filter: { discipline: 'Resilience', target_kind: 'attribute', target_name: 'Stamina' },
  },
  {
    doc: {
      discipline: 'Celerity',
      target_kind: 'derived_stat',
      target_name: 'Speed',
      amount_basis: 'rating',
      notes: 'Celerity adds its dots to Speed (TM house rule: NOT Dexterity).',
    },
    filter: { discipline: 'Celerity', target_kind: 'derived_stat', target_name: 'Speed' },
  },
  {
    doc: {
      discipline: 'Celerity',
      target_kind: 'derived_stat',
      target_name: 'Defence',
      amount_basis: 'rating',
      notes: 'Celerity adds its dots to Defence (TM house rule: NOT Dexterity).',
    },
    filter: { discipline: 'Celerity', target_kind: 'derived_stat', target_name: 'Defence' },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const strip = (uri) => uri.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(strip(MONGODB_URI), { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const now = new Date().toISOString();

  console.log(`[seed-rules-disc-attr] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  for (const { doc, filter } of DISC_ATTR_DOCS) {
    const existing = await db.collection('rule_disc_attr').findOne(filter);
    console.log(`  [rule_disc_attr] ${existing ? 'EXISTS (upsert will refresh)' : 'INSERT'} — ${doc.discipline} → ${doc.target_name} (${doc.target_kind})`);
    console.log(`    doc:   `, JSON.stringify({ ...doc, created_at: now, updated_at: now }));

    if (!DRY_RUN) {
      await db.collection('rule_disc_attr').replaceOne(
        filter,
        { ...doc, created_at: existing?.created_at || now, updated_at: now },
        { upsert: true },
      );
      console.log(`    → written`);
    }
  }

  console.log(`\n[seed-rules-disc-attr] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-disc-attr] Error:', err.message);
  process.exit(1);
});
