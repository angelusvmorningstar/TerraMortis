// One-shot: close DT3 cycle (69e955c784bbfc821bed2810)
// DT3 is stuck in 'game' status — only prep phase signed off.
// Sets city + projects signoffs and status: 'closed' so deriveCycleStatus
// returns 'closed' correctly and the feeding tab stops resolving to DT3.

import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const DT3_ID = new ObjectId('69e955c784bbfc821bed2810');

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();

const cycles = client.db('tm_suite').collection('downtime_cycles');
const before = await cycles.findOne({ _id: DT3_ID }, { projection: { label: 1, status: 1, phase_signoff: 1 } });
console.log('Before:', JSON.stringify(before, null, 2));

const now = new Date().toISOString();
const result = await cycles.updateOne(
  { _id: DT3_ID },
  {
    $set: {
      status: 'closed',
      'phase_signoff.city':     { at: now, by: 'close-dt3-script' },
      'phase_signoff.projects': { at: now, by: 'close-dt3-script' },
    },
  }
);

const after = await cycles.findOne({ _id: DT3_ID }, { projection: { label: 1, status: 1, phase_signoff: 1 } });
console.log('Modified:', result.modifiedCount);
console.log('After:', JSON.stringify(after, null, 2));

await client.close();
