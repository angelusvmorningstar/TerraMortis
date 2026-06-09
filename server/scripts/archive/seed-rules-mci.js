/**
 * Seed script — inserts Mystery Cult Initiation rule docs into the typed
 * rules collections. Idempotent: uses replaceOne/upsert on stable composite
 * keys so re-running is safe.
 *
 * Usage:
 *   node server/scripts/seed-rules-mci.js --dry-run   (default; prints plan)
 *   node server/scripts/seed-rules-mci.js --apply      (writes to DB)
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

const SOURCE = 'Mystery Cult Initiation';

// ── Rule docs ─────────────────────────────────────────────────────────────────

const GRANT_DOCS = [
  {
    doc: {
      source: SOURCE,
      tier: 1,
      condition: 'choice',
      grant_type: 'pool',
      target: '_mci',
      amount: 1,
      amount_basis: 'flat',
      choice_field: 'dot1_choice',
      excluded_choice: 'speciality',
      notes: 'MCI dot 1: grants 1 free merit dot when dot1_choice="merits". Excluded when dot1_choice="speciality". Amount overridden by rule_tier_budget[1].',
    },
    filter: { source: SOURCE, tier: 1, grant_type: 'pool' },
  },
  {
    doc: {
      source: SOURCE,
      tier: 2,
      condition: 'tier',
      grant_type: 'pool',
      target: '_mci',
      amount: 1,
      amount_basis: 'flat',
      notes: 'MCI dot 2: always grants 1 free merit dot. No choice branch. Amount overridden by rule_tier_budget[2].',
    },
    filter: { source: SOURCE, tier: 2, grant_type: 'pool' },
  },
  {
    doc: {
      source: SOURCE,
      tier: 3,
      condition: 'choice',
      grant_type: 'pool',
      target: '_mci',
      amount: 2,
      amount_basis: 'flat',
      choice_field: 'dot3_choice',
      excluded_choice: 'skill',
      notes: 'MCI dot 3: grants 2 free merit dots when dot3_choice="merits". Excluded when dot3_choice="skill". Amount overridden by rule_tier_budget[3].',
    },
    filter: { source: SOURCE, tier: 3, grant_type: 'pool' },
  },
  {
    doc: {
      source: SOURCE,
      tier: 4,
      condition: 'tier',
      grant_type: 'pool',
      target: '_mci',
      amount: 3,
      amount_basis: 'flat',
      notes: 'MCI dot 4: always grants 3 free merit dots. No choice branch. Amount overridden by rule_tier_budget[4].',
    },
    filter: { source: SOURCE, tier: 4, grant_type: 'pool' },
  },
  {
    doc: {
      source: SOURCE,
      tier: 5,
      condition: 'choice',
      grant_type: 'pool',
      target: '_mci',
      amount: 3,
      amount_basis: 'flat',
      choice_field: 'dot5_choice',
      excluded_choice: 'advantage',
      notes: 'MCI dot 5: grants 3 free merit dots when dot5_choice="merits". Excluded when dot5_choice="advantage". Amount overridden by rule_tier_budget[5].',
    },
    filter: { source: SOURCE, tier: 5, grant_type: 'pool' },
  },
];

const SPEC_GRANT_DOC = {
  doc: {
    source: SOURCE,
    tier: 1,
    condition: 'choice',
    target_skill: 'dot1_spec_skill',
    spec: 'dot1_spec',
    notes: 'MCI dot 1 speciality: free skill spec when dot1_choice="speciality". target_skill and spec are sentinels — read dot1_spec_skill and dot1_spec from the merit instance.',
  },
  filter: { source: SOURCE, tier: 1 },
};

const SKILL_BONUS_DOC = {
  doc: {
    source: SOURCE,
    tier: 3,
    target_skill: 'dot3_skill',
    amount: 1,
    cap_at: 5,
    notes: 'MCI dot 3 skill: +1 bonus dot to a chosen skill when dot3_choice="skill". target_skill is a sentinel — read dot3_skill from the merit instance.',
  },
  filter: { source: SOURCE, tier: 3 },
};

const TIER_BUDGET_DOC = {
  doc: {
    source: SOURCE,
    budgets: [0, 1, 1, 2, 3, 3],
    notes: 'MCI per-tier pool grant amounts. Index 0 unused (1-indexed). budgets[1..5] = dots 1-5 merit pool contribution when merit choice applies.',
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

  console.log(`[seed-rules-mci] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  const ops = [
    ...GRANT_DOCS.map(({ doc, filter }) => ({ coll: 'rule_grant', filter, doc })),
    { coll: 'rule_speciality_grant', filter: SPEC_GRANT_DOC.filter, doc: SPEC_GRANT_DOC.doc },
    { coll: 'rule_skill_bonus',      filter: SKILL_BONUS_DOC.filter, doc: SKILL_BONUS_DOC.doc },
    { coll: 'rule_tier_budget',      filter: TIER_BUDGET_DOC.filter, doc: TIER_BUDGET_DOC.doc },
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

  console.log(`\n[seed-rules-mci] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-mci] Error:', err.message);
  process.exit(1);
});
