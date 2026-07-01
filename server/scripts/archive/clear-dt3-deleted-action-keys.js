#!/usr/bin/env node
// One-off: clear st_review.deleted_action_keys from all DT3 submissions.
// Players deleted actions from their own view; this clears those markers
// so the processing panel no longer shows a "Deleted Actions" section.
// Usage: cd server && node scripts/clear-dt3-deleted-action-keys.js

import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

const DT3_CYCLE_ID = '69e955c784bbfc821bed2810';

async function run() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('tm_suite');
  const col = db.collection('downtime_submissions');

  // Preview: which submissions will be affected?
  const affected = await col.find(
    {
      cycle_id: new ObjectId(DT3_CYCLE_ID),
      'st_review.deleted_action_keys': { $exists: true, $not: { $size: 0 } },
    },
    { projection: { _id: 1, character_name: 1, 'st_review.deleted_action_keys': 1 } }
  ).toArray();

  if (affected.length === 0) {
    console.log('No submissions with non-empty deleted_action_keys found. Nothing to do.');
    await client.close();
    return;
  }

  console.log(`Found ${affected.length} submission(s) with deleted_action_keys:`);
  for (const sub of affected) {
    console.log(`  ${sub.character_name ?? sub._id}: [${sub.st_review.deleted_action_keys.join(', ')}]`);
  }

  // Clear the array on all affected submissions
  const result = await col.updateMany(
    {
      cycle_id: new ObjectId(DT3_CYCLE_ID),
      'st_review.deleted_action_keys': { $exists: true, $not: { $size: 0 } },
    },
    { $set: { 'st_review.deleted_action_keys': [] } }
  );

  console.log(`\nUpdated ${result.modifiedCount} submission(s). deleted_action_keys cleared to [].`);
  await client.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
