import 'dotenv/config';
import { MongoClient } from 'mongodb';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = new Date().toISOString();
const set = [
  { match:'St. Dominique', tag:'birthplace', value:'Louisiana, USA', note:'ST-stated ("I think").' },
  { match:'Meyer',         tag:'birthplace', value:'London, England', note:'ST-stated.' },
];
for (const s of set) {
  const ch = await db.collection('characters').findOne({ name:{ $regex: s.match, $options:'i' } }, { projection:{name:1} });
  if (!ch) { console.log(`no char for ${s.match}`); continue; }
  const fact = { tag:s.tag, value:s.value, source:'st', note:s.note };
  // upsert: pull any existing birthplace from st, then push the new one
  await db.collection('character_dossier').updateOne({ character_id:ch._id }, { $pull:{ facts:{ tag:'birthplace', source:'st' } } });
  await db.collection('character_dossier').updateOne({ character_id:ch._id }, { $setOnInsert:{ character_id:ch._id }, $push:{ facts: fact }, $set:{ updated_at:now } }, { upsert:true });
  console.log(`${ch.name}: birthplace = ${s.value} (source st)`);
}
await c.close();
