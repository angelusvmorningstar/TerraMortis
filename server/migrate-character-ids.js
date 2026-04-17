#!/usr/bin/env node

// Normalises character_id fields in downtime_submissions from plain string to ObjectId.
//
// Background: DT1 submissions were imported via CSV, which stored character_id as a plain
// string (e.g. "507f1f77bcf86cd799439011") rather than a MongoDB ObjectId. All other
// submissions created through the app store character_id as ObjectId. The API now handles
// both forms via $in queries, but this migration normalises the raw data so the collection
// is type-consistent.
//
// What it does:
//   - Finds all downtime_submissions where character_id is stored as a string
//   - Converts each to ObjectId
//   - Skips documents where character_id is already an ObjectId
//   - Skips documents where the string is not a valid 24-hex ObjectId (logs a warning)
//
// Safe to run multiple times — already-ObjectId documents are untouched.
//
// Usage:
//   cd server && node migrate-character-ids.js           (prompts for confirmation)
//   cd server && node migrate-character-ids.js --confirm (skip prompt)

import { createInterface } from 'node:readline';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

async function confirm(question) {
  if (process.argv.includes('--confirm')) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question + ' [y/N] ', ans => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y');
    });
  });
}

async function run() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  const col = db.collection('downtime_submissions');

  // Find all documents where character_id is a string (BSON type 2)
  const stringDocs = await col.find({ character_id: { $type: 'string' } }).toArray();

  if (!stringDocs.length) {
    console.log('No string character_id values found — collection is already normalised.');
    await client.close();
    return;
  }

  // Partition into valid ObjectId strings vs unrecognised
  const valid = [];
  const invalid = [];
  for (const doc of stringDocs) {
    if (ObjectId.isValid(doc.character_id) && doc.character_id.length === 24) {
      valid.push(doc);
    } else {
      invalid.push(doc);
    }
  }

  console.log(`Found ${stringDocs.length} document(s) with string character_id:`);
  console.log(`  ${valid.length} valid ObjectId strings (will be converted)`);
  console.log(`  ${invalid.length} unrecognised values (will be skipped)`);

  if (invalid.length) {
    console.warn('\nSkipping these — character_id is not a valid ObjectId hex string:');
    for (const doc of invalid) {
      console.warn(`  _id=${doc._id}  character_id="${doc.character_id}"`);
    }
  }

  if (!valid.length) {
    console.log('\nNothing to migrate.');
    await client.close();
    return;
  }

  console.log('\nSample documents to be converted:');
  for (const doc of valid.slice(0, 5)) {
    console.log(`  _id=${doc._id}  character_id="${doc.character_id}"`);
  }
  if (valid.length > 5) console.log(`  ... and ${valid.length - 5} more`);

  const ok = await confirm(`\nConvert ${valid.length} document(s)?`);
  if (!ok) {
    console.log('Aborted.');
    await client.close();
    return;
  }

  let converted = 0;
  let failed = 0;
  for (const doc of valid) {
    try {
      await col.updateOne(
        { _id: doc._id },
        { $set: { character_id: new ObjectId(doc.character_id) } }
      );
      converted++;
    } catch (err) {
      console.error(`  Failed _id=${doc._id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Converted: ${converted}  Failed: ${failed}`);
  await client.close();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
