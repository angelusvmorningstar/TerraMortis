import 'dotenv/config';
import { MongoClient } from 'mongodb';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = new Date().toISOString();
const by = { type: 'st', id: 'history-ingest' };

const a = await db.collection('characters').findOne({ name: { $regex: '^Anichka', $options: 'i' } }, { projection: { name:1, date_of_embrace:1, covenant:1, touchstones:1 } });
const pcId = String(a._id);
const eYear = (a.date_of_embrace||'').slice(0,4);

const facts = [
  { tag:'birthplace',      value:'Near Novohrad-Volynskyi, Ukraine', source:'history' },
  { tag:'birth_year',      value:'1921', source:'history' },
  { tag:'mortal_vocation', value:'Peasant; learned carving from her father and herb-craft and foraging from her mother', source:'history' },
  { tag:'sire',            value:'Unnamed Mekhet of the Circle of the Crone', source:'history', npc_id:null, note:'Sire unnamed in the source.' },
  { tag:'brood_sibling',   value:'Unnamed brood-brother', source:'history', npc_id:null, note:'Unnamed in the source.' },
  { tag:'embrace_event',   value:'Embraced 1942 in a Nazi labour factory in Lublin, Poland, while dying of a factory illness', source:'history',
      sheet_field:'date_of_embrace', sheet_value:a.date_of_embrace, clash: eYear!=='1942' },
  { tag:'embrace_location',value:'Lublin, Poland (a closed-door textile factory)', source:'history' },
  { tag:'faction_history', value:'Circle of the Crone; her coven kept circle outside Lviv', source:'history' },
  { tag:'key_location',    value:'Novohrad-Volynskyi', source:'history' },
  { tag:'key_location',    value:'Lublin, Poland', source:'history' },
  { tag:'key_location',    value:'Lviv', source:'history' },
  { tag:'key_location',    value:'Australia (2025)', source:'history' },
  { tag:'signature_ability',value:'Oracular dreams from her sire\'s blood; dreams in symbols nightly, some compelling her to act to the point of frenzy', source:'history' },
  { tag:'notable_event',   value:'Staked and buried after her Embrace; the stake grew into a tree over a decade; freed in 1952', source:'history' },
  { tag:'notable_event',   value:'Hunted and killed escaped Nazis (who died choking on their insides)', source:'history' },
  { tag:'notable_event',   value:'Fought as a Cruac ritualist in the 1974 Crone vs Invictus/Sanctified war near Leningrad (the "war hut")', source:'history' },
  { tag:'family_member',   value:'Mortal half-siblings (unnamed) via her father\'s second marriage; she became their patron', source:'history', npc_id:null, note:'Half-siblings unnamed.' },
  { tag:'current_activity',value:'Shipped to Australia in 2025 and recently unstaked; wandering as her dreams direct', source:'history' },
];
await db.collection('character_dossier').updateOne(
  { character_id: a._id }, { $set: { character_id: a._id, facts, source:'history', updated_at: now } }, { upsert: true });
console.log(`WROTE dossier for ${a.name} (${facts.length} facts; clashes: ${facts.filter(f=>f.clash).length}).`);

const NPCS = [
  { name:'Dmytro', kind:'family', disp:'positive', desc:'Anichka\'s mortal father, a carpenter and carver. Survived the war, remarried, had two more children; Anichka later became their family\'s patron.' },
  { name:'Kateryna', kind:'family', disp:'positive', desc:'Anichka\'s mortal mother, a goatherd and herbalist. Died of a factory illness in 1942.' },
];
const created = {};
for (const n of NPCS) {
  let npc = await db.collection('npcs').findOne({ name:n.name, linked_character_ids: pcId });
  if (!npc) { const r = await db.collection('npcs').insertOne({ name:n.name, description:n.desc, status:'active', linked_character_ids:[pcId], linked_cycle_id:null, notes:'', is_correspondent:false, created_at:now, updated_at:now }); npc={_id:r.insertedId}; console.log(`NPC created: ${n.name}`); }
  else console.log(`NPC exists: ${n.name}`);
  created[n.name]=String(npc._id);
  const ex = await db.collection('relationships').findOne({ 'a.id': created[n.name], 'b.id': pcId });
  if (!ex) { await db.collection('relationships').insertOne({ a:{type:'npc',id:created[n.name]}, b:{type:'pc',id:pcId}, kind:n.kind, direction:'mutual', disposition:n.disp, state:n.desc, st_hidden:false, status:'active', created_by:by, history:[{at:now,by,change:'created (history ingest)'}], created_at:now, updated_at:now }); console.log(`  edge: ${n.kind} (${n.disp})`); }
}
console.log('\nUnnamed in source (kept as dossier facts, no NPC): sire, brood-brother, half-siblings.');
await c.close();
