#!/usr/bin/env node

/**
 * One-shot migration: normalize every merit's rating against its channels.
 *
 * Reads every character document, runs lib/normalize-character.js logic,
 * and writes back any character whose merits were adjusted.
 *
 * Two patterns get fixed:
 *   - "drift": rating ≠ sum(channels). Sets rating = sum.
 *   - "phantom rating" (Pattern 1): rating > 0 but every channel is 0.
 *     Moves rating into `free` so the merit has a real dot source, then
 *     syncs rating = sum.
 *
 * Idempotent: re-running on already-normalized data is a no-op.
 *
 * Usage:
 *   node scripts/normalize-merit-ratings.js               # dry run, summary only
 *   node scripts/normalize-merit-ratings.js --verbose     # dry run, per-merit detail
 *   node scripts/normalize-merit-ratings.js --apply       # write changes
 *
 *   DB_NAME=tm_suite_test node scripts/normalize-merit-ratings.js --apply
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { normalizeCharacterMerits } from '../lib/normalize-character.js';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in environment.');
  process.exit(1);
}

const DB_NAME = process.env.DB_NAME || 'tm_suite';
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`);
  console.log(`Database: ${DB_NAME}\n`);

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const col = client.db(DB_NAME).collection('characters');

    const chars = await col.find({}).toArray();
    console.log(`Found ${chars.length} characters.\n`);

    let totalDocs = 0;
    let totalChanges = 0;
    const reasonCounts = { synced: 0, backfilled: 0 };

    for (const c of chars) {
      const result = normalizeCharacterMerits(c);
      if (!result.changed) continue;

      totalDocs++;
      totalChanges += result.changes.length;
      for (const ch of result.changes) reasonCounts[ch.reason] = (reasonCounts[ch.reason] || 0) + 1;

      console.log(`  ${c.name || c._id}  (${result.changes.length} merit${result.changes.length === 1 ? '' : 's'})`);
      if (VERBOSE) {
        for (const ch of result.changes) {
          const tag = ch.channel ? `${ch.reason} → ${ch.channel}` : ch.reason;
          console.log(`    [${tag}] ${ch.merit}  rating ${ch.before.rating} → ${ch.after.rating}, sum ${ch.before.sum} → ${ch.after.sum}`);
        }
      }

      if (APPLY) {
        await col.updateOne({ _id: c._id }, { $set: { merits: c.merits } });
      }
    }

    console.log(`\n${totalDocs} character${totalDocs === 1 ? '' : 's'} affected, ${totalChanges} merit${totalChanges === 1 ? '' : 's'} normalized.`);
    console.log(`  synced:     ${reasonCounts.synced || 0}  (rating was stale; set to sum)`);
    console.log(`  backfilled: ${reasonCounts.backfilled || 0}  (rating > 0 but channels = 0; rating moved into free)`);
    if (!APPLY) console.log('\nDry run — no changes written. Re-run with --apply to commit.');
  } finally {
    await client.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
