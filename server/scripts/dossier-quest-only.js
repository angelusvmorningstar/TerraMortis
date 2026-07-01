import 'dotenv/config';
import { MongoClient } from 'mongodb';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = new Date().toISOString();
const DATA = {
  'Clarence': [
    { tag:'birthplace',     value:'Christchurch, New Zealand', source:'questionnaire' },
    { tag:'key_location',   value:'Christchurch and the South Island of New Zealand', source:'questionnaire' },
    { tag:'faction_history',value:'Came from an Invictus-dominated city (Christchurch)', source:'questionnaire' },
    { tag:'hunting_method', value:'Familiar', source:'questionnaire' },
    { tag:'aspiration',     value:'Indirect influence (formal authority draws too much focus on him); covenant goals of protection, secrets, and advancement', source:'questionnaire' },
    { tag:'motivation',     value:'Came to Sydney involuntarily - in torpor when the Christchurch earthquake disturbed his resting place; in his covenant by genuine belief', source:'questionnaire' },
  ],
  'Aleksei': [
    { tag:'faction_history',value:"Carthian, still finding his feet ('the Carthian viper pit')", source:'questionnaire' },
    { tag:'worldview',      value:'A committed communist; sees the Carthian cause as the truest expression of his faith; values chosen kindred family over blood', source:'questionnaire' },
    { tag:'aspiration',     value:"Indirect influence - to change things unseen, 'a finger on the scales'; to seek reform within the Covenant", source:'questionnaire' },
    { tag:'motivation',     value:"Came to Sydney voluntarily following a Crone's prophecy", source:'questionnaire' },
    { tag:'sire',           value:'Believed to be somewhere in Sydney (unnamed)', source:'questionnaire', npc_id:null, note:'Sire unnamed; the character is seeking them.' },
  ],
};
for (const [key, facts] of Object.entries(DATA)) {
  const ch = await db.collection('characters').findOne({ name:{ $regex:key, $options:'i' } }, { projection:{name:1} });
  if (!ch) { console.log(`no char ${key}`); continue; }
  await db.collection('character_dossier').updateOne({ character_id:ch._id }, { $set:{ character_id:ch._id, facts, source:'questionnaire', updated_at:now } }, { upsert:true });
  console.log(`WROTE dossier for ${ch.name} (${facts.length} facts, source questionnaire).`);
}
await c.close();
