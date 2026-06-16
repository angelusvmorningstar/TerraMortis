/**
 * Seed script — inserts Professional Training rule docs into the typed
 * rules collections. Idempotent: uses replaceOne/upsert on a stable composite
 * key so re-running is safe.
 *
 * Usage:
 *   node server/scripts/seed-rules-pt.js --dry-run   (default; prints plan)
 *   node server/scripts/seed-rules-pt.js --apply      (writes to DB)
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

const now = new Date().toISOString();

const RULE_GRANT = {
  source: 'Professional Training',
  tier: 1,
  condition: 'tier',
  grant_type: 'merit',
  target: 'Contacts',
  amount: 2,
  amount_basis: 'flat',
  notes: 'PT dot 1: auto-creates Contacts (category: influence, granted_by: PT) with 2 free_pt dots. ' +
    'Merit is identified by (name, granted_by) — no qualifier needed.',
};

// Composite key for upsert
const GRANT_FILTER = {
  source: RULE_GRANT.source,
  tier: RULE_GRANT.tier,
  grant_type: RULE_GRANT.grant_type,
  target: RULE_GRANT.target,
};

const RULE_NINE_AGAIN = {
  source: 'Professional Training',
  tier: 2,
  condition: 'tier',
  target_skills: 'asset_skills',
  notes: 'PT dot 2: 9-again on all asset skills. Evaluator reads pt.asset_skills from the merit instance. ' +
    'The "asset_skills" sentinel means "use the source merit\'s asset_skills field".',
};

const NINE_AGAIN_FILTER = {
  source: RULE_NINE_AGAIN.source,
  tier: RULE_NINE_AGAIN.tier,
};

const RULE_SKILL_BONUS = {
  source: 'Professional Training',
  tier: 4,
  condition: 'tier',
  target_skill: 'dot4_skill',
  amount: 1,
  cap_at: 5,
  notes: 'PT dot 4: +1 dot to the character\'s chosen asset skill (stored as pt.dot4_skill on the merit ' +
    'instance). The "dot4_skill" sentinel means "read from the merit instance". Cap at 5 enforced by skTotal.',
};

const SKILL_BONUS_FILTER = {
  source: RULE_SKILL_BONUS.source,
  tier: RULE_SKILL_BONUS.tier,
};

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const strip = (uri) => uri.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(strip(MONGODB_URI), { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);

  console.log(`[seed-rules-pt] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  const ops = [
    {
      coll: 'rule_grant',
      filter: GRANT_FILTER,
      doc: RULE_GRANT,
    },
    {
      coll: 'rule_nine_again',
      filter: NINE_AGAIN_FILTER,
      doc: RULE_NINE_AGAIN,
    },
    {
      coll: 'rule_skill_bonus',
      filter: SKILL_BONUS_FILTER,
      doc: RULE_SKILL_BONUS,
    },
  ];

  for (const { coll, filter, doc } of ops) {
    const existing = await db.collection(coll).findOne(filter);
    if (existing) {
      console.log(`  [${coll}] EXISTS (upsert will refresh fields)`);
    } else {
      console.log(`  [${coll}] INSERT`);
    }
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

  console.log(`\n[seed-rules-pt] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[seed-rules-pt] Error:', err.message);
  process.exit(1);
});
