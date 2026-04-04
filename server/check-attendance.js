// Diagnostic: show game_sessions attendance data
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const sessions = await client.db('tm_suite').collection('game_sessions')
  .find().sort({ session_date: 1 }).toArray();

console.log(`Total game sessions: ${sessions.length}`);
sessions.forEach((s, i) => {
  console.log(`\n[${i}] session_date: ${s.session_date}, _id: ${s._id}`);
  (s.attendance || []).forEach(a => {
    console.log(`  character_id: ${a.character_id}  attended: ${a.attended}  name: ${a.character_display || a.character_name || ''}`);
  });
});

await client.close();
