// merge-st-map-locations.mjs — ADDITIVE reconcile of st_map_locations against the
// canonical _locations-local.json. 2026-07-18.
//
// The one-off import-st-locations.mjs (wiki repo) copied the LIVE `locations` collection —
// the stale side of the divergence: only havens, a subset of zones, and HQs. Ley lines,
// NPC sites, sites of power, seasonal courts, Wyrm's Nests, cenotes and ST Elysiums exist
// ONLY in this fixture.
//
// This is deliberately ADDITIVE, not a wipe-and-reimport:
//   * INSERT every fixture doc whose name is not already present (the missing types + zones).
//   * ENRICH existing docs with werewolf_faction / mage_order tags from the fixture.
//   * NEVER touch an existing doc's geometry, address, lat/lon, or revealed_to.
// A wipe-and-reimport was rejected because it would revert two hand-corrected havens
// (The Loft, The Penthouse) to stale fixture positions — one of them a revealed haven.
// So existing havens/zones/HQs and all per-viewer reveals are preserved byte-for-byte.
//
// Runs against the SUITE's writable MONGODB_URI (server/.env). Dry run by default.
//   node scripts/merge-st-map-locations.mjs            (dry run — reports, no write)
//   node scripts/merge-st-map-locations.mjs --write    (apply)

import { MongoClient } from 'mongodb';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
config();

const WRITE = process.argv.includes('--write');
const LOCAL_PATH = new URL('./_locations-local.json', import.meta.url);

// Matches the wiki's public World map (public/data/world-map.geojson).
const PUBLIC_NAMES = new Set([
  'The Second City', 'The Dockyards', 'The Academy', 'The North Shore', 'The Harbour', 'Exclusion Zone',
]);

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');
const coll = db.collection('st_map_locations');

const local = JSON.parse(readFileSync(LOCAL_PATH, 'utf8'));
const current = await coll.find({}).toArray();
const currentByName = new Map(current.map((d) => [d.name, d]));

const toImport = local.filter((l) => !PUBLIC_NAMES.has(l.name));

// (1) New docs: fixture entries whose name is not already in the collection.
const newDocs = toImport.filter((l) => !currentByName.has(l.name)).map((l) => {
  const { _id, ...rest } = l;
  const doc = { ...rest };
  if (_id != null) doc.source_location_id = String(_id);
  return doc;
});

// (2) Tag enrichment for docs that already exist: add Forsaken/Pure + mage Order only,
//     never disturbing anything else on the live doc.
const tagUpdates = [];
for (const l of toImport) {
  const cur = currentByName.get(l.name);
  if (!cur) continue;
  const set = {};
  if (l.werewolf_faction && cur.werewolf_faction !== l.werewolf_faction) set.werewolf_faction = l.werewolf_faction;
  if (l.mage_order && cur.mage_order !== l.mage_order) set.mage_order = l.mage_order;
  if (Object.keys(set).length) tagUpdates.push({ name: l.name, set });
}

// ---- Reports ----
const byType = {};
for (const d of newDocs) { const k = (d.type || d.faction || 'null'); byType[k] = (byType[k] || 0) + 1; }

console.log(`Fixture docs: ${local.length}; candidates (excl ${PUBLIC_NAMES.size} public): ${toImport.length}`);
console.log(`Current st_map_locations: ${current.length} docs (all preserved untouched).`);
console.log(`\nNEW docs to insert: ${newDocs.length}`);
console.log('  by type:', byType);
console.log(`\nTag enrichments (werewolf_faction / mage_order) on existing docs: ${tagUpdates.length}`);
tagUpdates.forEach((u) => console.log(`  ~ ${u.name}: ${JSON.stringify(u.set)}`));

// Informational only — NOT applied. Live vs fixture haven discrepancies for the user to arbitrate.
const havenDiffs = [];
for (const l of toImport) {
  if (l.type !== 'haven') continue;
  const cur = currentByName.get(l.name);
  if (!cur) continue;
  if (cur.lat !== l.lat || cur.lon !== l.lon || (cur.address || '') !== (l.address || '')) {
    havenDiffs.push(`  ${l.name}: LIVE ${cur.lat},${cur.lon} "${cur.address || ''}"  vs  FIXTURE ${l.lat},${l.lon} "${l.address || ''}"`);
  }
}
console.log(`\n[info only, NOT changed] Haven live-vs-fixture discrepancies: ${havenDiffs.length}`);
havenDiffs.forEach((h) => console.log(h));

if (!WRITE) {
  console.log('\nDRY RUN — no writes made. Re-run with --write to apply.');
  await client.close();
  process.exit(0);
}

console.log('\nApplying (insertMany new + per-doc $set tags; NO deletes)...');
if (newDocs.length) await coll.insertMany(newDocs);
let tagged = 0;
for (const u of tagUpdates) { const r = await coll.updateOne({ name: u.name }, { $set: u.set }); tagged += r.modifiedCount; }
const after = await coll.countDocuments({});
const revAfter = await coll.countDocuments({ revealed_to: { $exists: true, $ne: [] } });
console.log(`Done. Inserted ${newDocs.length}, tag-updated ${tagged}. st_map_locations now holds ${after} docs; ${revAfter} carry reveals.`);
await client.close();
