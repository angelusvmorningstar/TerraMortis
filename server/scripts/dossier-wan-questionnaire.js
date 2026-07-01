import 'dotenv/config';
import { MongoClient } from 'mongodb';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = new Date().toISOString();
const by = { type:'st', id:'questionnaire-ingest' };
const a = await db.collection('characters').findOne({ name:{ $regex:'Wan Yelong', $options:'i' } }, { projection:{name:1,touchstones:1} });
const pcId = String(a._id);
const sheetTs = (a.touchstones||[]).map(t=>t.desc||t.name).filter(Boolean);

// 1. Create the now-NAMED sire NPC + edge
let w = await db.collection('npcs').findOne({ name:{$regex:'Wiremu Te', $options:'i'}, linked_character_ids:pcId });
if (!w) { const r = await db.collection('npcs').insertOne({ name:'Wiremu Te Pōuri, Seneschal of the Black Court', description:'Lord Wan Yelong\'s sire; a Maori Invictus lord in Wellington. Embraced him for returning an ancestral artefact stolen by a Carthian and sold to a Pakeha collector.', status:'active', linked_character_ids:[pcId], linked_cycle_id:null, notes:'', is_correspondent:false, created_at:now, updated_at:now }); w={_id:r.insertedId}; console.log('NPC created: Wiremu Te Pōuri (named sire)'); }
const wid = String(w._id);
const ex = await db.collection('relationships').findOne({ 'a.id':wid, 'b.id':pcId });
if (!ex) { await db.collection('relationships').insertOne({ a:{type:'npc',id:wid}, b:{type:'pc',id:pcId}, kind:'sire', direction:'a_to_b', disposition:'positive', state:'Sire; Embraced Lord Wan Yelong for recovering an ancestral artefact. Grateful, and wants more recovered.', st_hidden:false, status:'active', created_by:by, history:[{at:now,by,change:'created (questionnaire ingest)'}], created_at:now, updated_at:now }); console.log('  edge: sire'); }

// 2. Upgrade the unnamed history sire fact -> named, linked
await db.collection('character_dossier').updateOne(
  { character_id:a._id },
  { $set: { 'facts.$[s].value':'Wiremu Te Pōuri, Seneschal of the Black Court (a Maori Invictus lord in Wellington)', 'facts.$[s].source':'questionnaire', 'facts.$[s].npc_id':wid, 'facts.$[s].note':'History gave the sire only as "a Maori Invictus lord"; questionnaire names him.', updated_at:now } },
  { arrayFilters:[{ 's.tag':'sire' }] }
);
console.log('Upgraded sire fact -> named + npc_id linked.');

// 3. Add questionnaire facts (dedupe by removing prior questionnaire facts of these tags first)
const tsClash = !sheetTs.some(t=>/hei.?tiki|pendant/i.test(t));
const newFacts = [
  { tag:'touchstone',     value:'Hei-tiki ancestral pendant - a hand-carved Formosan ancestral pendant, tied to his Taiwanese/Formosan roots', source:'questionnaire', sheet_field:'touchstones', sheet_value:JSON.stringify(sheetTs), clash:false, note: tsClash?'Not on the sheet touchstones - possible sheet gap.':null },
  { tag:'hunting_method', value:'Seduction; a familiar; other', source:'questionnaire' },
  { tag:'aspiration',     value:'Indirect influence; advancement and secrets', source:'questionnaire' },
  { tag:'motivation',     value:'Came to Sydney voluntarily - his sire wants more recovered artefacts; aligned to the Invictus and anti-Carthian', source:'questionnaire' },
];
await db.collection('character_dossier').updateOne({ character_id:a._id }, { $pull:{ facts:{ source:'questionnaire', tag:{ $in:newFacts.map(f=>f.tag) } } } });
await db.collection('character_dossier').updateOne({ character_id:a._id }, { $push:{ facts:{ $each:newFacts } }, $set:{ updated_at:now } });
console.log(`Added ${newFacts.length} questionnaire facts (touchstone clash flag: ${tsClash}).`);

const final = await db.collection('character_dossier').findOne({ character_id:a._id });
console.log(`\nLord Wan Yelong dossier now: ${final.facts.length} facts (sources: ${[...new Set(final.facts.map(f=>f.source))].join(', ')}).`);
await c.close();
