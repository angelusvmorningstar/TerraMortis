/**
 * Seed script — inserts Oath of the Hard Motherfucker rule docs into the typed
 * rules collections. Idempotent: uses replaceOne/upsert on stable composite
 * keys so re-running is safe.
 *
 * Usage:
 *   node server/scripts/seed-rules-ohm.js --dry-run   (default; prints plan)
 *   node server/scripts/seed-rules-ohm.js --apply      (writes to DB)
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

const SOURCE = 'Oath of the Hard Motherfucker';

// ── Rule docs ─────────────────────────────────────────────────────────────────

// Three merit grants: Contacts, Resources, Allies (sphere-resolved).
// auto_create is absent — these only apply free_ohm to existing merits.
const GRANT_DOCS = [
  {
    doc: {
      source: SOURCE,
      grant_type: 'merit',
      target: 'Contacts',
      target_category: 'influence',
      condition: 'pact_present',
      amount: 1,
      amount_basis: 'flat',
      notes: 'OHM: grants 1 free_ohm dot to the character\'s Contacts merit when the pact is present. Merit must already exist; does not auto-create.',
    },
    filter: { source: SOURCE, grant_type: 'merit', target: 'Contacts' },
  },
  {
    doc: {
      source: SOURCE,
      grant_type: 'merit',
      target: 'Resources',
      target_category: 'influence',
      condition: 'pact_present',
      amount: 1,
      amount_basis: 'flat',
      notes: 'OHM: grants 1 free_ohm dot to the character\'s Resources merit when the pact is present. Merit must already exist; does not auto-create.',
    },
    filter: { source: SOURCE, grant_type: 'merit', target: 'Resources' },
  },
  {
    doc: {
      source: SOURCE,
      grant_type: 'merit',
      target: 'Allies',
      target_category: 'influence',
      condition: 'pact_present',
      sphere_source: 'ohm_allies_sphere',
      amount: 1,
      amount_basis: 'flat',
      notes: 'OHM: grants 1 free_ohm dot to the Allies merit whose area matches the pact\'s ohm_allies_sphere field (sentinel: evaluator resolves area at apply time). Merit must already exist; does not auto-create.',
    },
    filter: { source: SOURCE, grant_type: 'merit', target: 'Allies' },
  },
  {
    doc: {
      source: SOURCE,
      grant_type: 'merit',
      target: 'Friends in High Places',
      target_category: 'general',
      condition: 'pact_present',
      auto_create: true,
      amount: 1,
      amount_basis: 'flat',
      notes: 'OHM: auto-creates Friends in High Places (category=general, granted_by=OHM) when the pact is present. Sets free_ohm=1. Auto-removal when pact absent is handled by lifecycle code, not this rule.',
    },
    filter: { source: SOURCE, grant_type: 'merit', target: 'Friends in High Places' },
  },
];

const NINE_AGAIN_DOC = {
  doc: {
    source: SOURCE,
    target_skills: 'ohm_skills',
    notes: 'OHM: sets _ohm_nine_again_skills to the skill list stored in the pact\'s ohm_skills array. target_skills is a sentinel — evaluator reads ohm_skills from the pact instance at apply time.',
  },
  filter: { source: SOURCE },
};

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const strip = (uri) => uri.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(strip(MONGODB_URI), { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const now = new Date().toISOString();

  console.log(`[seed-rules-ohm] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  const ops = [
    ...GRANT_DOCS.map(({ doc, filter }) => ({ coll: 'rule_grant', filter, doc })),
    { coll: 'rule_nine_again', filter: NINE_AGAIN_DOC.filter, doc: NINE_AGAIN_DOC.doc },
  ];

  for (const { coll, filter, doc } of ops) {
    const existing = await db.collection(coll).findOne(filter);
    console.log(`  [${coll}] ${existing ? 'EXISTS (upsert will refresh fields)' : 'INSERT'}`);
    console.log(`    filter:`, JSON.stringify(filter));
    console.log(`    doc:   `, JSON.stringify({ ...doc, created_at: now, updated_at: now }));

    if (!DRY_RUN) {
      await db.collection(coll).replaceOne(
        filter,
        { ...doc, created_at: existing?.created_at || now, updated_at: now },
        { upsert: true },
      );
      console.log(`    → written`);
    }
  }

  console.log(`\n[seed-rules-ohm] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-ohm] Error:', err.message);
  process.exit(1);
});
