/**
 * Seed script — inserts bloodline grant rule docs into rule_grant.
 * One doc per granted item (merit or speciality) per bloodline.
 * Idempotent: uses replaceOne/upsert on stable composite keys.
 *
 * Usage:
 *   node server/scripts/seed-rules-bloodlines.js --dry-run   (default; prints plan)
 *   node server/scripts/seed-rules-bloodlines.js --apply      (writes to DB)
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

const SOURCE = 'Bloodline';

// ── Rule docs ─────────────────────────────────────────────────────────────────
// One doc per granted item. Expanded from BLOODLINE_GRANTS constant (now decommissioned).
// condition: 'bloodline' — evaluator checks c.bloodline against bloodline_name (case-insensitive).
// grant_type: 'merit' — auto-creates the target merit with free_bloodline=1.
// grant_type: 'speciality' — pushes target_qualifier spec onto target skill if absent.

const GRANT_DOCS = [
  // ── Gorgons ──────────────────────────────────────────────────────────────────
  {
    doc: {
      source: SOURCE,
      grant_type: 'merit',
      condition: 'bloodline',
      bloodline_name: 'Gorgons',
      target: 'Area of Expertise',
      target_category: 'general',
      target_qualifier: 'snakes',
      amount: 1,
      amount_basis: 'flat',
      auto_create: true,
      notes: 'Gorgons bloodline: auto-creates Area of Expertise (snakes) with free_bloodline=1.',
    },
    filter: { source: SOURCE, grant_type: 'merit', bloodline_name: 'Gorgons', target: 'Area of Expertise', target_qualifier: 'snakes' },
  },
  {
    doc: {
      source: SOURCE,
      grant_type: 'merit',
      condition: 'bloodline',
      bloodline_name: 'Gorgons',
      target: 'Interdisciplinary Specialty',
      target_category: 'general',
      target_qualifier: 'snakes',
      amount: 1,
      amount_basis: 'flat',
      auto_create: true,
      notes: 'Gorgons bloodline: auto-creates Interdisciplinary Specialty (snakes) with free_bloodline=1.',
    },
    filter: { source: SOURCE, grant_type: 'merit', bloodline_name: 'Gorgons', target: 'Interdisciplinary Specialty', target_qualifier: 'snakes' },
  },
  {
    doc: {
      source: SOURCE,
      grant_type: 'speciality',
      condition: 'bloodline',
      bloodline_name: 'Gorgons',
      target: 'Animal Ken',
      target_qualifier: 'snakes',
      amount: 1,
      amount_basis: 'flat',
      notes: 'Gorgons bloodline: pushes "snakes" speciality onto Animal Ken if absent.',
    },
    filter: { source: SOURCE, grant_type: 'speciality', bloodline_name: 'Gorgons', target: 'Animal Ken', target_qualifier: 'snakes' },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const strip = (uri) => uri.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(strip(MONGODB_URI), { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const now = new Date().toISOString();

  console.log(`[seed-rules-bloodlines] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  for (const { doc, filter } of GRANT_DOCS) {
    const existing = await db.collection('rule_grant').findOne(filter);
    console.log(`  [rule_grant] ${existing ? 'EXISTS (upsert will refresh fields)' : 'INSERT'}`);
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

  console.log(`\n[seed-rules-bloodlines] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-bloodlines] Error:', err.message);
  process.exit(1);
});
