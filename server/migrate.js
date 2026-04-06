#!/usr/bin/env node

// ⚠️  DESTRUCTIVE — drops the entire characters collection and re-inserts from JSON.
// ANY edits made via the app since the last seed WILL BE LOST.
// Only run this during maintenance windows when no one is using the app.
//
// Usage: cd server && node migrate.js           (real data, prompts for confirmation)
//        cd server && node migrate.js --test    (test data, prompts for confirmation)
//        cd server && node migrate.js --confirm (skip prompt — CI/scripted use only)

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

const useTest = process.argv.includes('--test');
const DATA_PATH = new URL(useTest ? '../data/chars_test.json' : '../data/chars_v2.json', import.meta.url);

async function confirm() {
  if (process.argv.includes('--confirm')) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve, reject) => {
    rl.question(
      '\n⚠️  WARNING: This will DELETE all characters in Atlas and re-seed from JSON.\n' +
      '   Any app edits made since the last seed will be permanently lost.\n' +
      '   Make sure no one is using the app right now.\n\n' +
      '   Type YES to continue: ',
      answer => {
        rl.close();
        if (answer.trim() === 'YES') resolve();
        else { console.log('Aborted.'); process.exit(0); }
      }
    );
  });
}

async function migrate() {
  await confirm();
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
