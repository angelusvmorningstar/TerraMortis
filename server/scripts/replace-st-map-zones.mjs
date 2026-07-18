// replace-st-map-zones.mjs — replace ONLY the territory-zone layer of st_map_locations
// with the canonical refined geometry from _locations-local.json, carrying reveals. 2026-07-18.
//
// The additive merge (merge-st-map-locations.mjs) preserved the stale live-import zones AND
// added the fixture's refined zones, so territories now render doubled: an old crude polygon
// under one name plus the refined coastal polygon under another. This replaces the zone layer
// outright with the fixture's version (refined geometry + werewolf_faction / mage_order tags),
// so every territory appears exactly once, correctly shaped.
//
// SCOPE: type === 'zone' ONLY. Havens (hand-corrected), HQs (renamed + revealed), and all
// point/line features (loci, ley, npc, court, cenote, wyrmnest, elysium) are NOT touched.
// Reveals on zones are carried across by name; any zone whose reveal can't be name-matched to
// a fixture zone is preserved verbatim rather than dropped (reported as an orphan).
//
//   node scripts/replace-st-map-zones.mjs            (dry run)
//   node scripts/replace-st-map-zones.mjs --write    (apply)

import { MongoClient } from 'mongodb';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
config();

const WRITE = process.argv.includes('--write');
const LOCAL_PATH = new URL('./_locations-local.json', import.meta.url);
const PUBLIC_NAMES = new Set([
  'The Second City', 'The Dockyards', 'The Academy', 'The North Shore', 'The Harbour', 'Exclusion Zone',
]);

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');
const coll = db.collection('st_map_locations');

const local = JSON.parse(readFileSync(LOCAL_PATH, 'utf8'));
const current = await coll.find({}).toArray();

const currentZones = current.filter((d) => d.type === 'zone');
const revealsByName = new Map();
for (const d of currentZones) {
  if (Array.isArray(d.revealed_to) && d.revealed_to.length) revealsByName.set(d.name, d.revealed_to);
}

const fixtureZones = local.filter((l) => l.type === 'zone' && !PUBLIC_NAMES.has(l.name));
const fxNames = new Set(fixtureZones.map((l) => l.name));

const newZoneDocs = fixtureZones.map((l) => {
  const { _id, ...rest } = l;
  const doc = { ...rest };
  if (_id != null) doc.source_location_id = String(_id);
  const rev = revealsByName.get(l.name);
  if (rev) doc.revealed_to = rev;
  return doc;
});

// Reveal safety net: any current zone carrying reveals whose name is NOT in the fixture would
// lose that reveal on replace. Keep it verbatim and report it, rather than silently dropping.
const orphanRevealZones = currentZones.filter((d) => Array.isArray(d.revealed_to) && d.revealed_to.length && !fxNames.has(d.name));

const nVerts = (d) => (Array.isArray(d.polygon) ? d.polygon.length : 0);
console.log(`Current zones: ${currentZones.length}  ->  fixture zones: ${fixtureZones.length}`);
console.log('\nCurrent zone geometry (vertex counts — low = crude):');
currentZones.slice().sort((a, b) => (a.faction || '').localeCompare(b.faction || '')).forEach((d) => console.log(`  [${d.faction}] ${d.name}: ${nVerts(d)}v${revealsByName.has(d.name) ? '  (reveals ' + revealsByName.get(d.name).length + ')' : ''}`));
console.log('\nFixture zone geometry (what replaces it):');
fixtureZones.slice().sort((a, b) => (a.faction || '').localeCompare(b.faction || '')).forEach((d) => console.log(`  [${d.faction}] ${d.name}: ${nVerts(d)}v${d.werewolf_faction ? ' ' + d.werewolf_faction : ''}${d.mage_order ? ' ' + d.mage_order : ''}`));
console.log(`\nReveals carried by name: ${[...revealsByName.keys()].length} -> ${[...revealsByName.keys()].join(', ')}`);
console.log(`Orphan-reveal zones (kept verbatim, name not in fixture): ${orphanRevealZones.length}`);
orphanRevealZones.forEach((d) => console.log(`  ! ${d.name} [${d.faction}] reveals=${d.revealed_to.length}`));

if (!WRITE) {
  console.log('\nDRY RUN — no writes made. Re-run with --write to apply.');
  await client.close();
  process.exit(0);
}

const toInsert = [...newZoneDocs];
for (const d of orphanRevealZones) { const { _id, ...rest } = d; toInsert.push(rest); }

console.log('\nApplying (delete type:zone, insert fixture zones)...');
const del = await coll.deleteMany({ type: 'zone' });
const ins = toInsert.length ? await coll.insertMany(toInsert) : { insertedCount: 0 };
const zonesAfter = await coll.countDocuments({ type: 'zone' });
const totalAfter = await coll.countDocuments({});
console.log(`Deleted ${del.deletedCount} old zones, inserted ${ins.insertedCount}. Zones now: ${zonesAfter}; total docs: ${totalAfter}.`);
await client.close();
