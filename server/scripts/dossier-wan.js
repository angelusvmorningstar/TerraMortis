import 'dotenv/config';
import { MongoClient } from 'mongodb';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = new Date().toISOString();
const a = await db.collection('characters').findOne({ name: { $regex: 'Wan Yelong', $options:'i' } }, { projection:{name:1,date_of_embrace:1} });
const facts = [
  { tag:'birthplace',      value:'Taiwan', source:'history' },
  { tag:'mortal_vocation', value:'Academic; entered the diplomatic service to arrange artefact exchanges, quietly acquiring items for himself and substituting forgeries', source:'history' },
  { tag:'signature_ability',value:'Forgery and artefact acquisition; a deep interest in the occult', source:'history' },
  { tag:'sire',            value:'A Maori Invictus lord in Wellington', source:'history', npc_id:null, note:'Sire unnamed in the source.' },
  { tag:'embrace_location',value:'Wellington, New Zealand', source:'history' },
  { tag:'embrace_event',   value:'Embraced by the Maori Invictus lord after delivering an ancestral artefact (from a European collection) and substituting a forgery', source:'history', sheet_field:'date_of_embrace', sheet_value:a.date_of_embrace||null, clash:false },
  { tag:'notable_event',   value:'The ancestral artefact he delivered had been stolen by a rival Carthian vampire and sold to a Pakeha collector as an insult', source:'history' },
];
await db.collection('character_dossier').updateOne({ character_id:a._id }, { $set:{ character_id:a._id, facts, source:'history', updated_at:now } }, { upsert:true });
console.log(`WROTE dossier for ${a.name} (${facts.length} facts).`);
await c.close();
