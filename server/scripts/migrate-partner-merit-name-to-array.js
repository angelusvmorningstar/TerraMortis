/**
 * One-shot migration: rule_grant.partner_merit_name (string) → partner_merit_names (string[]).
 *
 * Background: the singular field assumed one partner merit per rule. When ST
 * needs the pool to draw from multiple sources (e.g. Lorekeeper accepting
 * Library + Esoteric Armoury) the workaround was duplicating the rule, which
 * collided with the sheet's per-pool overspend check and produced a false
 * "Data error" on Domain Merits. The form (rules-data-view.js) and pool/MDB
 * evaluators now use partner_merit_names. This script rewrites every existing
 * doc that still has the singular field. Idempotent — safe to re-run.
 *
 * Usage:
 *   node server/scripts/migrate-partner-merit-name-to-array.js          (dry run)
 *   node server/scripts/migrate-partner-merit-name-to-array.js --apply  (writes)
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

async function run() {
  const uri = MONGODB_URI.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(DB_NAME);

  console.log(`[migrate-partner-merit-name-to-array] ${DRY_RUN ? 'DRY RUN' : 'APPLY'} → ${DB_NAME}`);

  const candidates = await db.collection('rule_grant')
    .find({ partner_merit_name: { $exists: true } })
    .toArray();

  if (!candidates.length) {
    console.log('  No docs with singular partner_merit_name — nothing to do.');
    await client.close();
    return;
  }

  console.log(`  Found ${candidates.length} doc(s) with singular partner_merit_name:`);
  for (const doc of candidates) {
    const before = doc.partner_merit_name;
    const existingArr = Array.isArray(doc.partner_merit_names) ? doc.partner_merit_names : [];
    const merged = existingArr.includes(before) ? existingArr : [...existingArr, before];
    console.log(`    ${doc._id} — source: ${doc.source} — "${before}" → [${merged.map(s => `"${s}"`).join(', ')}]`);

    if (!DRY_RUN) {
      await db.collection('rule_grant').updateOne(
        { _id: doc._id },
        { $set: { partner_merit_names: merged, updated_at: new Date().toISOString() }, $unset: { partner_merit_name: '' } },
      );
    }
  }

  console.log(`\n[migrate-partner-merit-name-to-array] ${DRY_RUN ? 'Dry run complete — pass --apply to write.' : 'Done.'}`);
  await client.close();
}

run().catch(err => {
  console.error('[migrate-partner-merit-name-to-array] Error:', err.message);
  process.exit(1);
});
