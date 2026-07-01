import 'dotenv/config';
import { MongoClient } from 'mongodb';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = new Date().toISOString();
const by = { type: 'st', id: 'history-ingest' };

const etsy = await db.collection('characters').findOne({ name: { $regex: 'Rocio', $options: 'i' } }, { projection: { name: 1 } });
const pcId = String(etsy._id);

const NPCS = [
  { name: 'Mr. Green', kind: 'sire', dir: 'a_to_b', disp: 'neutral', desc: 'Invictus power "even the bosses answer to," rumoured active since the 1920s. Etsy\'s sire; Embraced him violently in Las Vegas, 1989, and later sent him into hiding.' },
  { name: 'Vittorio "Big V" Verdone', kind: 'ally', dir: 'mutual', disp: 'negative', desc: 'Bronx wise-guy and Etsy\'s confidant in Vegas; proved a Carthian plant whose leaks toppled Etsy\'s Invictus position.' },
  { name: 'Alonzo Jr.', kind: 'family', dir: 'mutual', disp: 'positive', desc: 'Etsy\'s mortal brother (FBI). Coordinated the hunter that staked Etsy; the two are now reconciling - Etsy writes to him. (History also names him a touchstone; sheet does not.)' },
  { name: 'Valeria', kind: 'family', dir: 'mutual', disp: 'positive', desc: 'Etsy\'s mortal mother, deceased. The sheet\'s "Mother" touchstone.' },
  { name: 'Alonzo Sr.', kind: 'family', dir: 'mutual', disp: 'negative', desc: 'Etsy\'s father; abandoned the family in his childhood.' },
];

const created = {};
for (const n of NPCS) {
  let npc = await db.collection('npcs').findOne({ name: n.name, linked_character_ids: pcId });
  if (!npc) {
    const r = await db.collection('npcs').insertOne({
      name: n.name, description: n.desc, status: 'active',
      linked_character_ids: [pcId], linked_cycle_id: null, notes: '', is_correspondent: false,
      created_at: now, updated_at: now,
    });
    npc = { _id: r.insertedId };
    console.log(`NPC created: ${n.name}`);
  } else { console.log(`NPC exists:  ${n.name}`); }
  created[n.name] = String(npc._id);

  const exists = await db.collection('relationships').findOne({ 'a.id': created[n.name], 'b.id': pcId });
  if (!exists) {
    await db.collection('relationships').insertOne({
      a: { type: 'npc', id: created[n.name] }, b: { type: 'pc', id: pcId },
      kind: n.kind, direction: n.dir, disposition: n.disp, state: n.desc, st_hidden: false,
      status: 'active', created_by: by,
      history: [{ at: now, by, change: 'created (history ingest)' }],
      created_at: now, updated_at: now,
    });
    console.log(`  edge: ${n.kind} (${n.disp})`);
  } else { console.log(`  edge exists`); }
}

// Backfill dossier sire link
await db.collection('character_dossier').updateOne(
  { character_id: etsy._id, 'facts.tag': 'sire' },
  { $set: { 'facts.$.npc_id': created['Mr. Green'], updated_at: now } }
);
console.log(`\nBackfilled dossier sire -> npc_id ${created['Mr. Green']}.`);
await c.close();
