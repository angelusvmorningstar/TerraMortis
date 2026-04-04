import { MongoClient } from 'mongodb';
import 'dotenv/config';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const docs = await client.db('tm_suite').collection('downtime_cycles').find().toArray();
console.log(JSON.stringify(docs.map(d => ({ _id: d._id, label: d.label, status: d.status, game_number: d.game_number })), null, 2));
await client.close();
