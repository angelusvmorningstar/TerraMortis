import { MongoClient } from 'mongodb';
const client = new MongoClient(process.env.MONGO_URI || process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');

console.log('=== game_sessions ===');
const sessions = await db.collection('game_sessions').find({}).sort({ session_date: 1 }).toArray();
for (const s of sessions) {
  const att = (s.attendance || []).length;
  console.log(JSON.stringify({ _id: s._id, game_number: s.game_number ?? null, session_date: s.session_date ?? null, title: s.title ?? null, attendance_count: att }));
}

console.log('\n=== downtime_cycles ===');
const cycles = await db.collection('downtime_cycles').find({}, { projection: { _id: 1, name: 1, status: 1, game_number: 1 } }).toArray();
for (const c of cycles) console.log(JSON.stringify(c));

await client.close();
