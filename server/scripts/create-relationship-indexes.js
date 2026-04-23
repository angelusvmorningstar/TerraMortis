#!/usr/bin/env node

// Create indexes on the relationships collection.
//
// Creates:
//   { 'a.id': 1 }         multikey lookup of edges by endpoint-a
//   { 'b.id': 1 }         multikey lookup of edges by endpoint-b
//   { kind: 1 }           filter by kind family
//   { status: 1 }         filter by active / retired / pending
//
// Idempotent: createIndex is a no-op if the exact index already exists.
//
// Usage: cd server && node scripts/create-relationship-indexes.js

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
    const col = db.collection('relationships');

    console.log(`Creating indexes on ${DB_NAME}.relationships...`);

    const results = await Promise.all([
      col.createIndex({ 'a.id': 1 }, { name: 'a_id_1' }),
      col.createIndex({ 'b.id': 1 }, { name: 'b_id_1' }),
      col.createIndex({ kind: 1 },   { name: 'kind_1' }),
      col.createIndex({ status: 1 }, { name: 'status_1' }),
    ]);

    for (const name of results) console.log(`  ${name}`);

    const all = await col.indexes();
    console.log(`\nAll indexes on ${DB_NAME}.relationships:`);
    for (const idx of all) console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
  } finally {
    await client.close();
  }
}

createIndexes().catch(err => {
  console.error('Error creating indexes:', err);
  process.exit(1);
});
