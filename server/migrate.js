#!/usr/bin/env node

// Seed character data into MongoDB characters collection.
// Defaults to chars_v2.json (30 real characters). Pass --test for test data.
// Idempotent — drops existing characters and re-inserts.
//
// Usage: cd server && node migrate.js          (real data)
//        cd server && node migrate.js --test   (test data)

import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

const useTest = process.argv.includes('--test');
const DATA_PATH = new URL(useTest ? '../data/chars_test.json' : '../data/chars_v2.json', import.meta.url);

async function migrate() {
  const raw = readFileSync(DATA_PATH, 'utf-8');
  const chars = JSON.parse(raw);

  if (!Array.isArray(chars)) {
    console.error('Expected chars_test.json to be an array');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db('tm_suite');
    const col = db.collection('characters');

    // Drop existing and re-insert for idempotency
    await col.deleteMany({});
    const result = await col.insertMany(chars);

    console.log(`Inserted ${result.insertedCount} characters into tm_suite.characters`);
  } finally {
    await client.close();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
