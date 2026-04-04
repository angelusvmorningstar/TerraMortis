// Find Anichka's character _id and check if she's in Game 2 attendance
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');

// Find Anichka in characters
const char = await db.collection('characters').findOne({
  $or: [{ name: /anichka/i }, { moniker: /anichka/i }]
});
if (!char) {
  console.log('Anichka not found in characters collection.');
  await client.close(); process.exit(0);
}
console.log(`Anichka: _id=${char._id}  name=${char.name}  moniker=${char.moniker || ''}`);

// Find her in Game 2 (index 1, sorted by date asc)
const sessions = await db.collection('game_sessions').find().sort({ session_date: 1 }).toArray();
console.log(`\nTotal sessions: ${sessions.length}`);

sessions.forEach((s, i) => {
  const entry = (s.attendance || []).find(a => String(a.character_id) === String(char._id));
  console.log(`Session [${i}] ${s.session_date}: ${entry ? `attended=${entry.attended}` : 'NOT IN ATTENDANCE LIST'}`);
});

// Also check players collection for Katie
const player = await db.collection('players').findOne({ $or: [
  { name: /katie/i }, { discord_username: /katie/i }, { character_ids: char._id }
]});
if (player) {
  console.log(`\nPlayer record: ${JSON.stringify({ name: player.name, character_ids: player.character_ids })}`);
}

await client.close();
