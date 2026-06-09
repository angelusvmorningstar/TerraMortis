// DI-3: Ordeal parity audit — read-only, prints JSON to stdout
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

const client = new MongoClient(uri);
await client.connect();
const db = client.db('tm_suite');

const chars = await db.collection('characters')
  .find({}, { projection: { name: 1, moniker: 1, retired: 1, ordeals: 1 } })
  .toArray();

const rows = chars.map(c => ({
  name: c.moniker || c.name,
  _name: c.name,
  retired: c.retired || false,
  ordeals: (c.ordeals || []).map(o => ({ name: o.name, complete: o.complete, xp: o.xp })),
  complete_count: (c.ordeals || []).filter(o => o.complete).length
}));

rows.sort((a, b) => a.name.localeCompare(b.name));
console.log(JSON.stringify(rows, null, 2));

await client.close();
