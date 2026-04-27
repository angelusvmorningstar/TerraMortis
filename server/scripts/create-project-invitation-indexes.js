#!/usr/bin/env node

// Create indexes on the project_invitations collection (JDT-1, Epic JDT).
//
// Creates:
//   { invited_character_id: 1, status: 1 }   JDT-3 invitee inbox query
//                                            ("my pending invitations")
//   { joint_project_id: 1 }                  JDT-2 / JDT-6 fan-out lookups
//                                            for a given joint project
//
// Idempotent: createIndex is a no-op if the exact index already exists.
//
// Usage: cd server && node scripts/create-project-invitation-indexes.js

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
    const col = db.collection('project_invitations');

    console.log(`Creating indexes on ${DB_NAME}.project_invitations...`);

    const results = await Promise.all([
      col.createIndex(
        { invited_character_id: 1, status: 1 },
        { name: 'invited_character_id_1_status_1' },
      ),
      col.createIndex(
        { joint_project_id: 1 },
        { name: 'joint_project_id_1' },
      ),
    ]);

    for (const name of results) console.log(`  ${name}`);

    const all = await col.indexes();
    console.log(`\nAll indexes on ${DB_NAME}.project_invitations:`);
    for (const idx of all) console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
  } finally {
    await client.close();
  }
}

createIndexes().catch(err => {
  console.error('Error creating indexes:', err);
  process.exit(1);
});
