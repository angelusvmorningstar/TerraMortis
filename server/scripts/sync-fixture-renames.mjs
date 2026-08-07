// sync-fixture-renames.mjs — push the wiki-side location renames back into the canonical
// _locations-local.json so the cockpit map matches and a future reconcile won't reintroduce
// the old names. 2026-07-18. Renames only; no geometry/reveal changes.
//   node scripts/sync-fixture-renames.mjs            (dry run)
//   node scripts/sync-fixture-renames.mjs --write    (apply)

import { readFileSync, writeFileSync } from 'node:fs';

const PATH = new URL('./_locations-local.json', import.meta.url);
const WRITE = process.argv.includes('--write');
const data = JSON.parse(readFileSync(PATH, 'utf8'));

const hqRenames = { 'Old Crone HQ': 'Crone Temple', 'Old Lance HQ': 'Black Cathedral', 'Old Invictus HQ': 'Swift Manor' };
// Haven names are NOT unique in the fixture, so match the owner too.
const havenRenames = [
  { oldName: 'The Penthouse', owner: 'Reed Justice', newName: 'The Underground' },
  { oldName: 'The Loft', owner: 'Wan Yelong', newName: 'The Belfry' },
];

const has = (arr, v) => Array.isArray(arr) && arr.includes(v);
const changes = [];
for (const l of data) {
  if (hqRenames[l.name] && (l.type === 'hq' || l.faction === 'hq')) {
    changes.push(`HQ: "${l.name}" -> "${hqRenames[l.name]}"`);
    l.name = hqRenames[l.name];
    continue;
  }
  for (const r of havenRenames) {
    if (l.type === 'haven' && l.name === r.oldName && (has(l.residents, r.owner) || has(l.resident_names, r.owner))) {
      changes.push(`Haven: "${r.oldName}" (${r.owner}) -> "${r.newName}"`);
      l.name = r.newName;
    }
  }
}

console.log(`Matched ${changes.length} rename(s):`);
changes.forEach((c) => console.log('  ' + c));

// Sanity: confirm we didn't accidentally rename the WRONG owner's shared-name haven.
for (const r of havenRenames) {
  const survivors = data.filter((l) => l.type === 'haven' && l.name === r.oldName);
  console.log(`  (still named "${r.oldName}": ${survivors.length} — expect the OTHER owner's, e.g. ${survivors.map((s) => (s.residents || s.resident_names || []).join('/')).join('; ')})`);
}

if (!WRITE) {
  console.log('\nDRY RUN — no write. Re-run with --write to apply.');
  process.exit(0);
}
writeFileSync(PATH, JSON.stringify(data));
console.log('\nWritten (compact, single-line, format preserved).');
