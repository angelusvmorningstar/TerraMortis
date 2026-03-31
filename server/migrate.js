#!/usr/bin/env node

// Seed chars_test.json into MongoDB characters collection.
// Idempotent — drops existing characters and re-inserts.
//
// Usage: cd server && node migrate.js

import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

const DATA_PATH = new URL('../data/chars_test.json', import.meta.url);

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
