import 'dotenv/config';
import { MongoClient } from 'mongodb';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = new Date().toISOString();
const by = { type:'st', id:'history-ingest' };
const id = async rx => String((await db.collection('characters').findOne({ $or:[{name:{$regex:rx,$options:'i'}},{moniker:{$regex:rx,$options:'i'}}] }, { projection:{_id:1} }))._id);
const eve = await id('Lockridge'), mac = await id('^Mac$'), einar = await id('Einar Solveig'), rene = await id('René Meyer');

// Maggie NPC (Irish Carthian smuggler, Mac's partner) linked to Eve
let mag = await db.collection('npcs').findOne({ name:'Maggie', linked_character_ids:eve });
if (!mag) { const r = await db.collection('npcs').insertOne({ name:'Maggie', description:'Irish Carthian smuggler, partnered with Mac; contracted by Eve to move Kindred into a reopening Australia.', status:'active', linked_character_ids:[eve], linked_cycle_id:null, notes:'', is_correspondent:false, created_at:now, updated_at:now }); mag={_id:r.insertedId}; console.log('NPC created: Maggie'); }

const edges = [
  { other:mag._id, otype:'npc', kind:'contact', disp:'positive', state:'Irish Carthian smuggler (with Mac) Eve contracted to move Kindred to Australia.' },
  { other:mac,     otype:'pc',  kind:'ally',    disp:'positive', state:'Carthian smuggler Eve contracted to move Kindred into Australia.' },
  { other:einar,   otype:'pc',  kind:'contact', disp:'positive', state:'Eve smuggled Einar into Australia as part of her cargo.' },
  { other:rene,    otype:'pc',  kind:'contact', disp:'positive', state:'Eve smuggled René Meyer into Australia (the "Renee" who took the plane joyride).' },
];
for (const e of edges) {
  const oid = String(e.other);
  const ex = await db.collection('relationships').findOne({ $or:[{ 'a.id':eve, 'b.id':oid }, { 'a.id':oid, 'b.id':eve }] });
  if (ex) { console.log(`edge exists: Eve <-> ${oid}`); continue; }
  await db.collection('relationships').insertOne({ a:{type:'pc',id:eve}, b:{type:e.otype,id:oid}, kind:e.kind, direction:'mutual', disposition:e.disp, state:e.state, st_hidden:false, status:'active', created_by:by, history:[{at:now,by,change:'created (history ingest)'}], created_at:now, updated_at:now });
  console.log(`edge: Eve <-> ${e.otype} ${oid} [${e.kind}]`);
}
// link Eve's brood_sibling/smuggling facts? backfill the dossier "Renee" note
await db.collection('character_dossier').updateOne({ character_id:{ $exists:true } }, {}); // no-op guard
console.log('\nEve relationship web written.');
await c.close();
