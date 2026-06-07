import 'dotenv/config';
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');

const mammon = await db.collection('characters')
  .find({ moniker: 'Mammon' }, { projection: { name: 1, moniker: 1, retired: 1, ordeals: 1 } })
  .toArray();
console.log('MAMMON SEARCH:', JSON.stringify(mammon, null, 2));

const all = await db.collection('characters')
  .find({}, { projection: { name: 1, moniker: 1, retired: 1 } })
  .toArray();
console.log('\nALL CHARS:');
all.sort((a,b) => (a.moniker||a.name).localeCompare(b.moniker||b.name))
   .forEach(c => console.log(`  moniker=${c.moniker||'(none)'} | name=${c.name} | retired=${c.retired||false}`));

await client.close();
