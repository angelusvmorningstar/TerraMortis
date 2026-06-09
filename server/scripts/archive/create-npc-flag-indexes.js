#!/usr/bin/env node

// Create indexes on the npc_flags collection (NPCR.3).
//
// Creates:
//   { status: 1 }                                   filter open vs resolved queues
//   { npc_id: 1 }                                   list flags for a given NPC
//   { npc_id: 1, 'flagged_by.character_id': 1 }     unique partial on status:'open' —
//                                                   the database-level guard against
//                                                   duplicate open flags from the
//                                                   same character on the same NPC
//   { created_at: -1 }                              sort the open queue
//
// Idempotent: createIndex is a no-op if the exact index already exists.
//
// Usage: cd server && node scripts/create-npc-flag-indexes.js

import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in the server/ directory.');
  process.exit(1);
}

const DB_NAME = process.env.MONGODB_DB || 'tm_suite';

async function createIndexes() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    const col = db.collection('npc_flags');

    console.log(`Creating indexes on ${DB_NAME}.npc_flags...`);

    const results = await Promise.all([
      col.createIndex({ status: 1 },     { name: 'status_1' }),
      col.createIndex({ npc_id: 1 },     { name: 'npc_id_1' }),
      // Unique partial index: database-level guarantee of one open flag per
      // (npc_id, flagged_by.character_id). Resolved flags are exempt from
      // uniqueness so the same character can re-flag after an ST resolves.
      col.createIndex(
        { npc_id: 1, 'flagged_by.character_id': 1 },
        {
          name: 'open_flag_uniqueness',
          unique: true,
          partialFilterExpression: { status: 'open' },
        },
      ),
      col.createIndex({ created_at: -1 }, { name: 'created_at_-1' }),
    ]);

    for (const name of results) console.log(`  ${name}`);

    const all = await col.indexes();
    console.log(`\nAll indexes on ${DB_NAME}.npc_flags:`);
    for (const idx of all) console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
  } finally {
    await client.close();
  }
}

createIndexes().catch(err => {
  console.error('Error creating indexes:', err);
  process.exit(1);
});
