import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') });

const COV_SHORT = {
  'Carthian Movement':   'Carthian',
  'Circle of the Crone': 'Crone',
  'Invictus':            'Invictus',
  'Lancea et Sanctum':   'Lance',
  'Ordo Dracul':         'Ordo',
};

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');
const chars = db.collection('characters');

const all = await chars.find({}).toArray();
let fixed = 0;

for (const c of all) {
  const ownLabel = COV_SHORT[c.covenant];
  if (!ownLabel) continue;
  if (c.covenant_standings && ownLabel in c.covenant_standings) {
    await chars.updateOne(
      { _id: c._id },
      { $unset: { [`covenant_standings.${ownLabel}`]: '' } }
    );
    console.log(`Fixed: ${c.name} — removed covenant_standings.${ownLabel}`);
    fixed++;
  }
}

console.log(`\nDone. ${fixed} character(s) updated.`);
await client.close();
