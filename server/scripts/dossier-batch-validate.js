import 'dotenv/config';
import { MongoClient } from 'mongodb';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = new Date().toISOString();
const findCh = async rx => db.collection('characters').findOne({ name: { $regex: rx, $options: 'i' } }, { projection: { name: 1, touchstones: 1 } });
const tsv = ch => JSON.stringify((ch.touchstones || []).map(t => t.desc || t.name));

// ---- CARVER (new, Excel only) ----
const carver = await findCh('^Carver');
const carverFacts = [
  { tag: 'sire', value: 'Violet West - active in the Court of London; Embraced Carver and, per Lineage tradition, sent him to the Church for education', source: 'excel', npc_id: null },
  { tag: 'mortal_vocation', value: 'Ran a mortal business venture; confronted a colleague embezzling its funds', source: 'excel' },
  { tag: 'embrace_event', value: 'Mortally wounded by a gunshot while confronting the embezzler; his sire Embraced him to save his life (middle-aged at Embrace)', source: 'excel' },
  { tag: 'key_location', value: 'London, UK - a staunch, traditional Invictus Court that taught him Kindred society', source: 'excel' },
  { tag: 'faction_history', value: 'Given to the Lancea et Sanctum by his Invictus sire per Lineage tradition; chose to stay', source: 'excel' },
  { tag: 'family_member', value: 'Watched over his mortal family in London for a time after his Embrace; no children', source: 'excel' },
  { tag: 'touchstone', value: 'Descendants of the Crowley family, now in Sydney; one an aspiring Solicitor he keeps an eye on', source: 'excel', sheet_field: 'touchstones', sheet_value: tsv(carver), clash: false, note: 'Reconcile vs sheet touchstones.' },
  { tag: 'hunting_method', value: 'Hunts those who prey on the Faithful - criminals and bad apples among the Flock; subdues with his powers, then feeds', source: 'excel' },
  { tag: 'notable_event', value: 'First kill: a criminal his sire set him upon; he lost himself to the Beast and embraced the power', source: 'excel' },
  { tag: 'aspiration', value: 'Aspires to Primogen', source: 'excel' },
  { tag: 'motivation', value: 'Came to Sydney to loot relics and artefacts left by the previous Kindred occupation', source: 'excel' },
  { tag: 'notable_enemy', value: 'Views the Carthians with disdain (societal change and chaos); ranks the Crone just above them', source: 'excel' },
  { tag: 'secret', value: 'Once came dangerously close to Diablerie; stopped by another PC', source: 'excel', severity: 'major', compromised: true, st_hidden: true, note: 'A PC knows. Severity proposed - confirm.' },
];
await db.collection('character_dossier').updateOne({ character_id: carver._id }, { $set: { character_id: carver._id, facts: carverFacts, source: 'excel', updated_at: now } }, { upsert: true });
console.log(`Carver: ${carverFacts.length} facts (1 secret).`);

// ---- EINAR (new, Excel only) ----
const einar = await findCh('Einar Solveig');
const einarFacts = [
  { tag: 'sire', value: 'Captain Olga Andersson (destroyed) - leader of the Rotgrafen crew that captured Einar; Embraced him after he led the defence of his Merchant Navy vessel', source: 'excel', npc_id: null },
  { tag: 'mortal_vocation', value: 'Sailor for the Dutch East India Company', source: 'excel' },
  { tag: 'embrace_event', value: 'Mid-1840s; his ship attacked by pirates, he led a futile defence, was taken captive and Embraced by the pirate captain Olga Andersson', source: 'excel' },
  { tag: 'embrace_location', value: 'International waters', source: 'excel' },
  { tag: 'key_location', value: 'Early requiem as a pirate around the Caribbean Sea; a nomad at sea ever since', source: 'excel' },
  { tag: 'faction_history', value: 'Carthian Movement - sought them out for opportunity, having little reputation or resources for the Invictus despite his age; sent to Sydney to represent the Movement', source: 'excel' },
  { tag: 'signature_ability', value: 'A Rotgrafen - a shape-shifting Ventrue (viking-pirate bloodline)', source: 'excel' },
  { tag: 'hunting_method', value: 'Feeds on intoxicated Kine; haunts bars', source: 'excel' },
  { tag: 'notable_event', value: 'First kill: newborn and starving, locked in his sire brig, he consumed and killed his surviving comrades', source: 'excel' },
  { tag: 'touchstone', value: 'Building a wooden sail-boat in his downtime - his heart desire to one day take it out', source: 'excel', sheet_field: 'touchstones', sheet_value: tsv(einar), clash: false },
  { tag: 'aspiration', value: 'An Enforcer (a Viking mercenary)', source: 'excel' },
  { tag: 'notable_enemy', value: 'Fundamentally opposed to the Lancea Sanctum (his Bloodline history); works to undermine them and hide his nature from them', source: 'excel' },
  { tag: 'debt', value: 'Owes three minor boons to Eve, by way of their sire', source: 'excel', status: 'outstanding', counterparty: 'Eve Lockridge', st_hidden: true },
  { tag: 'secret', value: 'Cyrus knows exactly what he is - a Rotgrafen, a shape-shifting Ventrue - which would be dangerous if the Lancea Sanctum learned of it', source: 'excel', severity: 'life_threatening', compromised: true, st_hidden: true, counterparty: 'Cyrus Reynolds', note: 'Compromised - Cyrus knows. Severity proposed - confirm.' },
];
await db.collection('character_dossier').updateOne({ character_id: einar._id }, { $set: { character_id: einar._id, facts: einarFacts, source: 'excel', updated_at: now } }, { upsert: true });
console.log(`Einar: ${einarFacts.length} facts (1 debt, 1 secret).`);

// ---- ANICHKA (MERGE: add Excel facts to existing history dossier) ----
const anichka = await findCh('^Anichka');
const anFacts = [
  { tag: 'touchstone', value: 'The youngest in her mortal family, a girl named after her mother Kateryna', source: 'excel', sheet_field: 'touchstones', clash: false },
  { tag: 'aspiration', value: 'A Socialite - a seer/oracle, potentially a sacred judge', source: 'excel' },
  { tag: 'motivation', value: 'Came to Sydney because her family needed an out (possibly on an older Crone vision); joined the Circle because when she lay dying she called out and the Mother sent her sire and brood-brother', source: 'excel' },
  { tag: 'notable_enemy', value: 'Dislikes the Lancea Sanctum and rolls her eyes at the Invictus (a mid-1970s armed conflict between them and a European Crone)', source: 'excel' },
  { tag: 'hunting_method', value: 'Mostly feeds on animals; cultivates her northern territory so she can feed at home', source: 'excel' },
];
await db.collection('character_dossier').updateOne({ character_id: anichka._id }, { $pull: { facts: { source: 'excel' } } });
await db.collection('character_dossier').updateOne({ character_id: anichka._id }, { $push: { facts: { $each: anFacts } }, $set: { updated_at: now } });
const anDoc = await db.collection('character_dossier').findOne({ character_id: anichka._id });
console.log(`Anichka MERGE: +${anFacts.length} excel facts -> ${anDoc.facts.length} total (sources: ${[...new Set(anDoc.facts.map(f => f.source))].join('+')}).`);

console.log('\n--- PROPOSED entities (dry-run, not created) ---');
console.log('NPC sires: Violet West (Carver), Captain Olga Andersson [destroyed] (Einar)');
console.log('Einar PC edges: ally->Doc, ally->Mac, coterie->Rene Meyer (Luca), debt->Eve (3 minor boons), secret-knower->Cyrus');
console.log('Carver PC edges: coterie->Marni & Tiana PCs (resolve names), allies->London/Lance/Ventrue PCs (vague)');
console.log('Anichka PC edges: prophecy/ally->Keeper, Rene Meyer, Ivana (+Kurtis PC); enemy->Cyrus (over her brood-brother)');
await c.close();
