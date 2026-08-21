
/**
 * Issue #837 — Phase 3: one-shot cleanup of `xp_total` and `xp_spent` on
 * character documents.
 *
 * Background: #837 (Peter Option A) removes `xp_total` / `xp_spent` from
 * the v3 schema entirely. XP values are derived at render time via
 * public/js/editor/xp.js (xpEarned() / xpSpent() / xpLeft()). The fields
 * persisted on existing docs are now dead weight; leaving them risks a
 * future reader treating them as authoritative (the precise landmine
 * Option A is meant to eliminate).
 *
 * Write shape: ONE `updateMany({ ... }, { $unset: { xp_total: '', xp_spent: '' } })`
 * targeted at docs that still carry either field. NOT replaceOne — the #826
 * incident destroyed 13 character docs by replaceOne-with-projection, and
 * the resulting discipline (see [[feedback_script_integration_test]]) is to
 * use $unset / updateMany / updateOne+$set for any data-mutating script.
 *
 * Idempotent — re-running after a clean pass updates 0 docs.
 *
 * Usage:
 *   cd server && node scripts/cleanup-xp-totals-deprecation.js
 *   cd server && node scripts/cleanup-xp-totals-deprecation.js --apply
 *
 * dotenv path note: must be run from `server/` so dotenv/config picks up
 * server/.env. See memory [[feedback_server_scripts_dotenv_path]].
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const DB_NAME = process.env.MONGODB_DB || 'tm_game';

export async function main() {
  // Issue #826 lesson: compute APPLY / DRY_RUN inside main so integration
  // tests can toggle via process.argv without re-importing the module.
  const APPLY = process.argv.includes('--apply');
  const DRY_RUN = !APPLY;
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set. Ensure server/.env is present and the script is run from server/.');
    process.exit(1);
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    const characters = db.collection('characters');

    const matchFilter = {
      $or: [
        { xp_total: { $exists: true } },
        { xp_spent: { $exists: true } },
      ],
    };

    console.log(`\n${DRY_RUN ? '[DRY RUN]' : '[APPLY]'} cleanup-xp-totals-deprecation.js`);
    console.log(`Database: ${DB_NAME}`);
    console.log('');

    // Pre-flight: list affected docs so the operator can sanity-check.
    const affected = await characters
      .find(matchFilter, { projection: { _id: 1, name: 1, xp_total: 1, xp_spent: 1 } })
      .toArray();

    if (affected.length === 0) {
      console.log('No documents still carry xp_total or xp_spent. Clean already.');
      return;
    }

    for (const doc of affected) {
      const label = `${doc.name || '(unnamed)'} [${doc._id}]`;
      const tot = doc.xp_total === undefined ? '—' : String(doc.xp_total);
      const spt = doc.xp_spent === undefined ? '—' : String(doc.xp_spent);
      console.log(`  ${label.padEnd(44)} xp_total=${tot.padStart(4)}  xp_spent=${spt.padStart(4)}`);
    }
    console.log('');

    if (DRY_RUN) {
      console.log(`Summary: ${affected.length} document${affected.length === 1 ? '' : 's'} carry xp_total / xp_spent and would be cleaned.`);
      console.log('\n[DRY RUN] Re-run with --apply to write.');
      return;
    }

    const result = await characters.updateMany(
      matchFilter,
      { $unset: { xp_total: '', xp_spent: '' } }
    );

    console.log(`Summary: matched=${result.matchedCount}, modified=${result.modifiedCount}.`);
    console.log('\n[APPLY] Idempotency check: re-run with no flag (dry-run) and confirm "No documents still carry xp_total or xp_spent".');
  } finally {
    await client.close();
  }
}

const _invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (_invokedDirectly) {
  main().catch(err => { console.error(err); process.exit(1); });
}
