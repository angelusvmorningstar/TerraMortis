#!/usr/bin/env node

/**
 * NPCR.4 cleanup — strip the transient `touchstone_edge_ids` field from any
 * character that acquired it during the wrong-model rollout (between the initial
 * NPCR.4 Phase A and the Phase D revert).
 *
 * The field no longer exists in the schema (`additionalProperties: false` at
 * the character root), so any character that still carries it will fail PUT
 * validation on save. This one-off $unset strips it without touching any other
 * data; touchstones[] and any relationships edges remain intact.
 *
 * Usage: cd server && node scripts/cleanup-touchstone-edge-ids.js [--dry-run]
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db('tm_suite');
    const characters = db.collection('characters');

    const affected = await characters
      .find({ touchstone_edge_ids: { $exists: true } }, { projection: { _id: 1, name: 1 } })
      .toArray();

    console.log(`Found ${affected.length} character(s) with touchstone_edge_ids set:`);
    for (const c of affected) {
      console.log(`  ${String(c._id)}  ${c.name || '(unnamed)'}`);
    }

    if (affected.length === 0) {
      console.log('Nothing to clean up.');
      return;
    }

    if (DRY_RUN) {
      console.log('\n(dry-run — no writes performed)');
      return;
    }

    const result = await characters.updateMany(
      { touchstone_edge_ids: { $exists: true } },
      { $unset: { touchstone_edge_ids: '' } }
    );
    console.log(`\nStripped touchstone_edge_ids from ${result.modifiedCount} character(s).`);
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
