// Repair: find downtime submissions with cycle_id=null and re-associate them with
// the active cycle. Run this once to recover data saved before a cycle existed.
// Usage: cd server && node repair-orphan-submissions.js

import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');

const subsCol = db.collection('downtime_submissions');
const cyclesCol = db.collection('downtime_cycles');

// Find the active cycle
const activeCycle = await cyclesCol.findOne({ status: 'active' });
if (!activeCycle) {
  console.log('No active cycle found. Nothing to repair.');
  await client.close(); process.exit(0);
}
console.log(`Active cycle: "${activeCycle.label}" (_id: ${activeCycle._id})`);

// Find orphan submissions (null or missing cycle_id)
const orphans = await subsCol.find({ $or: [{ cycle_id: null }, { cycle_id: { $exists: false } }] }).toArray();
console.log(`\nOrphan submissions found: ${orphans.length}`);

if (!orphans.length) {
  console.log('Nothing to repair.');
  await client.close(); process.exit(0);
}

for (const sub of orphans) {
  // Check there is no existing submission for this character in the active cycle
  const charId = sub.character_id;
  const existing = charId
    ? await subsCol.findOne({ cycle_id: activeCycle._id, character_id: charId })
    : null;

  if (existing) {
    console.log(`  SKIP ${sub.character_name || sub._id} — already has a submission in ${activeCycle.label}`);
    continue;
  }

  // Re-associate
  await subsCol.updateOne(
    { _id: sub._id },
    { $set: { cycle_id: activeCycle._id, updated_at: new Date().toISOString() } }
  );
  console.log(`  FIXED ${sub.character_name || String(sub._id)} → cycle_id set to ${activeCycle._id}`);
}

console.log('\nDone.');
await client.close();
