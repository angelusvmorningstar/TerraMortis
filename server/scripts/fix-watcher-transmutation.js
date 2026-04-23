#!/usr/bin/env node

/**
 * Fix Watcher's Transmutation discipline entry.
 *
 * Watcher has `disciplines.Transmutation.cp = 4` which is a data ingestion
 * error — sorcery themes are unlocks granted by Cruac dots, never purchased
 * with creation CP. The dots should live in `free`, not `cp`. The record
 * also has Creation.free=1 and Protection.free=1, confirming that `free`
 * is the correct bucket.
 *
 * This script moves Transmutation.cp → Transmutation.free on Watcher's
 * character document. Safe to re-run — it only acts if cp > 0 on the
 * Transmutation entry.
 *
 * Usage:
 *   node scripts/fix-watcher-transmutation.js --dry-run   # default, no writes
 *   node scripts/fix-watcher-transmutation.js --apply     # actually write
 *
 *   # Override the database (default: tm_suite)
 *   DB_NAME=tm_suite node scripts/fix-watcher-transmutation.js --apply
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in environment.');
  process.exit(1);
}

const DB_NAME = process.env.DB_NAME || 'tm_suite';
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`);
  console.log(`Database: ${DB_NAME}\n`);

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const col = client.db(DB_NAME).collection('characters');

    const watcher = await col.findOne({ name: 'Watcher' });
    if (!watcher) {
      console.error('Character "Watcher" not found.');
      process.exit(1);
    }

    const tm = watcher.disciplines?.Transmutation;
    if (!tm) {
      console.log('No Transmutation entry on Watcher — nothing to do.');
      return;
    }

    const oldCP = tm.cp || 0;
    const oldFree = tm.free || 0;
    if (oldCP === 0) {
      console.log(`Transmutation.cp is already 0 (free=${oldFree}). Nothing to do.`);
      return;
    }

    const newCP = 0;
    const newFree = oldFree + oldCP;
    console.log('Current  Transmutation:', { cp: oldCP, free: oldFree, xp: tm.xp || 0, dots: tm.dots });
    console.log('Proposed Transmutation:', { cp: newCP, free: newFree, xp: tm.xp || 0 });
    console.log('(dots will re-derive on next render via the editor\'s discBase calculation)');

    if (!APPLY) {
      console.log('\nDry run — no changes written. Re-run with --apply to commit.');
      return;
    }

    const res = await col.updateOne(
      { _id: watcher._id },
      { $set: {
        'disciplines.Transmutation.cp': newCP,
        'disciplines.Transmutation.free': newFree,
      } }
    );
    console.log(`\nUpdated ${res.modifiedCount} document.`);
  } finally {
    await client.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
