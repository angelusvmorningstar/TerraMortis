import 'dotenv/config';
import { MongoClient } from 'mongodb';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = new Date().toISOString();
const by = { type:'st', id:'history-ingest' };
const a = await db.collection('characters').findOne({ name:{ $regex:'Lockridge', $options:'i' } }, { projection:{name:1,date_of_embrace:1} });
const pcId = String(a._id);
const facts = [
  { tag:'mortal_faction',  value:'Lockridge Global Logistics - family shipping/freight empire, covertly involved in arms trafficking', source:'history' },
  { tag:'mortal_vocation', value:'Heir and executive of Lockridge Global Logistics; trained in high-stakes negotiation and global infrastructure', source:'history' },
  { tag:'sire',            value:'A centuries-old Dutch Invictus elder who had been exploiting Lockridge logistics for arms and covert movement', source:'history', npc_id:null, note:'Sire unnamed in the source.' },
  { tag:'brood_sibling',   value:'Arden - twin sibling, co-Embraced', source:'history', npc_id:null },
  { tag:'embrace_event',   value:'2006; the extended family killed in a staged plane crash, Eve and Arden abducted and Embraced by the Dutch Invictus elder', source:'history', sheet_field:'date_of_embrace', sheet_value:a.date_of_embrace||null, clash:false },
  { tag:'faction_history', value:'Embraced into the Invictus; bound to Arden by an Invictus Oath of Matrimony (shared power, severe breach penalties); later secretly turned to the Carthian Movement', source:'history' },
  { tag:'notable_event',   value:'London: met a young Carthian organising labour resistance in a Lockridge subsidiary - her ideological turn', source:'history' },
  { tag:'notable_event',   value:'Helped prepare Sydney for Kindred resettlement, destabilising six areas for feeding grounds/havens via Lockridge infrastructure', source:'history' },
  { tag:'notable_event',   value:'Smuggled Kindred into a reopening Australia (contracted Mac and Maggie; cargo included Einar and Renee)', source:'history' },
  { tag:'signature_ability',value:'Logistics and smuggling networks spanning mortal and Kindred power structures', source:'history' },
  { tag:'current_activity',value:'Praxis claimant in Sydney with Arden; publicly Invictus, privately Carthian; aims to weaken Invictus and rebuild Sydney with Carthians', source:'history' },
];
await db.collection('character_dossier').updateOne({ character_id:a._id }, { $set:{ character_id:a._id, facts, source:'history', source_note:'AI-transcribed by player; verify', updated_at:now } }, { upsert:true });
console.log(`WROTE dossier for ${a.name} (${facts.length} facts).`);

// Arden NPC
let arden = await db.collection('npcs').findOne({ name:'Arden', linked_character_ids:pcId });
if (!arden) { const r = await db.collection('npcs').insertOne({ name:'Arden', description:'Eve\'s twin sibling, co-Embraced by the Dutch Invictus elder. Stayed Invictus-aligned; bound to Eve by an Invictus Oath of Matrimony. Fiercely loyal despite their ideological divergence.', status:'active', linked_character_ids:[pcId], linked_cycle_id:null, notes:'', is_correspondent:false, created_at:now, updated_at:now }); arden={_id:r.insertedId}; console.log('NPC created: Arden (twin)'); }
const ex = await db.collection('relationships').findOne({ 'a.id':String(arden._id), 'b.id':pcId });
if (!ex) { await db.collection('relationships').insertOne({ a:{type:'npc',id:String(arden._id)}, b:{type:'pc',id:pcId}, kind:'family', direction:'mutual', disposition:'positive', state:'Twin sibling, co-childe, Invictus-aligned, bound by an Invictus Oath of Matrimony.', st_hidden:false, status:'active', created_by:by, history:[{at:now,by,change:'created (history ingest)'}], created_at:now, updated_at:now }); console.log('  edge: family (twin)'); }

// Check referenced names against existing PCs
console.log('\n--- referenced names vs existing PCs (for proposed PC<->PC edges) ---');
for (const nm of ['Mac','Maggie','Einar','Renee','René']) {
  const hits = await db.collection('characters').find({ $or:[{name:{$regex:nm,$options:'i'}},{moniker:{$regex:nm,$options:'i'}}] }).project({name:1,moniker:1}).toArray();
  console.log(`  ${nm.padEnd(8)} -> ${hits.map(h=>h.moniker||h.name).join(', ')||'(no PC match)'}`);
}
await c.close();
