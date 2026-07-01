// Write Etsy's character_dossier (history-derived, sheet-reconciled) and PROPOSE
// the NPCs/relationships as a dry-run (entities not created here). Run from root.
import 'dotenv/config';
import { MongoClient } from 'mongodb';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = new Date().toISOString();

const ch = await db.collection('characters').findOne({ name: { $regex: 'Rocio', $options: 'i' } },
  { projection: { name:1, covenant:1, date_of_embrace:1, touchstones:1 } });
const embraceYear = (ch.date_of_embrace||'').slice(0,4);

const facts = [
  { tag:'birthplace',      value:'The Bronx, New York', source:'history' },
  { tag:'birth_year',      value:'1949', source:'history' },
  { tag:'mortal_vocation', value:'Genovese crime family; rose to underboss in Las Vegas', source:'history' },
  { tag:'mortal_faction',  value:'Genovese crime family', source:'history' },
  { tag:'sire',            value:'Mr. Green', source:'history', npc_id:null },
  { tag:'embrace_event',   value:'Las Vegas, 1989, the Grand Dragon hotel; Embraced by Mr. Green', source:'history',
      sheet_field:'date_of_embrace', sheet_value:ch.date_of_embrace, clash: embraceYear !== '1989' },
  { tag:'embrace_location',value:'Las Vegas', source:'history' },
  { tag:'faction_history', value:'Invictus enforcer, Las Vegas', source:'history' },
  { tag:'key_location',    value:'The Bronx', source:'history' },
  { tag:'key_location',    value:'Las Vegas', source:'history' },
  { tag:'key_location',    value:'Sydney', source:'history' },
  { tag:'notable_event',   value:'Killed a victim in frenzy; the kill reached the news and drew Court scrutiny', source:'history' },
  { tag:'notable_event',   value:'Confidant Big V was a Carthian plant; leaked secrets toppled the Vegas Invictus; sent into hiding by Mr. Green', source:'history' },
  { tag:'notable_event',   value:'Staked into torpor by a hunter coordinated by his brother Alonzo Jr.; woke decades later', source:'history' },
  { tag:'current_activity',value:'Secret boss of the Star Casino, Sydney; blackjack regular', source:'history' },
  { tag:'family_member',   value:'Touchstones per history: Mother, her grave, and Alonzo Jr.', source:'history',
      sheet_field:'touchstones', sheet_value:JSON.stringify((ch.touchstones||[]).map(t=>t.desc||t.name)),
      clash:false, note:'Sheet lists only "Mother" - possible sheet gap (history names 3 touchstones).' },
];

await db.collection('character_dossier').updateOne(
  { character_id: ch._id },
  { $set: { character_id: ch._id, facts, source: 'history', updated_at: now } },
  { upsert: true }
);
console.log(`WROTE character_dossier for ${ch.name} (${facts.length} facts; clashes: ${facts.filter(f=>f.clash).length}).`);

console.log('\n--- PROPOSED NPCs (dry-run, not created) ---');
const npcs = [
  { name:'Mr. Green', description:'Invictus power "even the bosses answer to," active since the 1920s. Etsy\'s sire.', rel:'sire -> childe' },
  { name:'Vittorio "Big V" Verdone', description:'Bronx wise-guy; ally to Etsy who proved a Carthian plant.', rel:'ally / betrayer' },
  { name:'Alonzo Jr.', description:'Etsy\'s mortal brother (FBI); coordinated the hunter that staked him; now a touchstone.', rel:'sibling' },
  { name:'Valeria', description:'Etsy\'s mortal mother (deceased); touchstone.', rel:'family' },
  { name:'Alonzo Sr.', description:'Etsy\'s absent father.', rel:'family' },
];
for (const n of npcs) console.log(`  ${n.name.padEnd(26)} [${n.rel}] ${n.description}`);
console.log('\n(Approve to create these in npcs + relationships and backfill the dossier npc_id links.)');
await c.close();
