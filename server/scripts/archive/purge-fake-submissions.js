#!/usr/bin/env node
// One-off: delete all downtime_submissions not belonging to real characters.
// Real characters: Rryan, Yusuf, Einar (case-insensitive prefix match).
// Usage: cd server && node purge-fake-submissions.js

import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

const REAL_NAMES = ['rryan', 'yusuf', 'einar'];

function isReal(name) {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  return REAL_NAMES.some(r => n.startsWith(r));
}

async function run() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('tm_suite');
  const col = db.collection('downtime_submissions');

  const all = await col.find({}, { projection: { _id: 1, character_name: 1 } }).toArray();
  console.log(`Total submissions: ${all.length}`);

  const fakeIds = all.filter(s => !isReal(s.character_name)).map(s => s._id);
  const realOnes = all.filter(s => isReal(s.character_name));

  console.log(`Keeping (${realOnes.length}): ${realOnes.map(s => s.character_name).join(', ')}`);
  console.log(`Deleting (${fakeIds.length}): ${all.filter(s => !isReal(s.character_name)).map(s => s.character_name).join(', ')}`);

  if (!fakeIds.length) {
    console.log('Nothing to delete.');
    await client.close();
    return;
  }

  const result = await col.deleteMany({ _id: { $in: fakeIds } });
  console.log(`Deleted ${result.deletedCount} fake submissions.`);

  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
