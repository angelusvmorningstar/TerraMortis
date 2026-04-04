#!/usr/bin/env node
// One-off: delete all downtime_cycles with label matching "Test Cycle" or "Downtime_Test_Data".
// Usage: cd server && node purge-test-cycles.js

import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in server/ directory.');
  process.exit(1);
}

async function run() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('tm_suite');
  const cycles = db.collection('downtime_cycles');

  const all = await cycles.find({}, { projection: { _id: 1, label: 1, status: 1 } }).toArray();
  console.log(`Total cycles: ${all.length}`);
  all.forEach(c => console.log(`  [${c.status}] ${c.label || '(no label)'} — ${c._id}`));

  const toDelete = all.filter(c => {
    const lbl = (c.label || '').toLowerCase();
    return lbl.includes('test') || lbl.includes('downtime_test');
  });

  if (!toDelete.length) {
    console.log('No test cycles found.');
    await client.close();
    return;
  }

  console.log(`\nDeleting ${toDelete.length} cycle(s): ${toDelete.map(c => c.label).join(', ')}`);
  const result = await cycles.deleteMany({ _id: { $in: toDelete.map(c => c._id) } });
  console.log(`Deleted ${result.deletedCount} cycles.`);

  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
