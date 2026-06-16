/**
 * Seed script — Friends with Benefits (Carthian Movement merit).
 *
 * First merit implemented via the auto_bonus rule pattern (mirrors SSJ/Flock
 * behaviour but declaratively). Grants free Feeding Grounds dots equal to the
 * sum of purchased MCI + Status merit dots. Carthian Movement covenant is a
 * prerequisite for taking the merit; not enforced here (rules engine handles
 * grants, not eligibility).
 *
 * Idempotent: replaceOne with upsert on (source, grant_type).
 *
 * Usage:
 *   node server/scripts/seed-rules-fwb.js          (dry run)
 *   node server/scripts/seed-rules-fwb.js --apply  (writes to DB)
 *
 * Target DB is MONGODB_DB env var (default: tm_suite).
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const DRY_RUN = !process.argv.includes('--apply');
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'tm_suite';

if (!MONGODB_URI) {
  console.error('MONGODB_URI not set.');
  process.exit(1);
}

const SOURCE = 'Friends with Benefits';

const RULE = {
  source: SOURCE,
  grant_type: 'auto_bonus',
  condition: 'merit_present',
  target: 'Feeding Grounds',
  target_field: 'free_fwb',
  amount_basis: 'rating_of_partner_merit',
  partner_merit_names: ['Mystery Cult Initiation', 'Status'],
  notes: 'Friends with Benefits (Carthian Movement merit): grants free Feeding Grounds dots equal to total purchased dots in MCI + Status (cp + xp across all matching merit instances). Carthian Movement covenant is a prerequisite for taking the merit; not enforced by the rules engine.',
};

const FILTER = { source: SOURCE, grant_type: 'auto_bonus' };

async function run() {
  const uri = MONGODB_URI.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const now = new Date().toISOString();

  console.log(`[seed-rules-fwb] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  const existing = await db.collection('rule_grant').findOne(FILTER);
  console.log(`  [rule_grant] ${existing ? 'EXISTS (upsert will refresh fields)' : 'INSERT'} — source: ${SOURCE}`);
  console.log(`    filter:`, JSON.stringify(FILTER));
  console.log(`    doc:   `, JSON.stringify({ ...RULE, created_at: now, updated_at: now }));

  if (!DRY_RUN) {
    await db.collection('rule_grant').replaceOne(
      FILTER,
      { ...RULE, created_at: existing?.created_at || now, updated_at: now },
      { upsert: true },
    );
    console.log(`    → written`);
  }

  console.log(`\n[seed-rules-fwb] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-fwb] Error:', err.message);
  process.exit(1);
});
