// One-off: create the active downtime cycle with the correct game number.
// Usage: cd server && node create-cycle.js 2
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const gameNumber = parseInt(process.argv[2] || '2', 10);
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const col = client.db('tm_suite').collection('downtime_cycles');

const existing = await col.findOne({ status: 'active' });
if (existing) {
  console.log(`Active cycle already exists: "${existing.label}". Nothing created.`);
  await client.close();
  process.exit(0);
}

const doc = {
  label: 'Downtime ' + gameNumber,
  game_number: gameNumber,
  status: 'active',
  loaded_at: new Date().toISOString(),
  submission_count: 0,
};
const result = await col.insertOne(doc);
console.log(`Created cycle "Downtime ${gameNumber}" (_id: ${result.insertedId})`);
await client.close();
