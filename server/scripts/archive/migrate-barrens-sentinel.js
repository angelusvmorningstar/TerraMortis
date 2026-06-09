/**
 * migrate-barrens-sentinel.js — migration (DRY-RUN by default).
 *
 * Issue #496 (sentinel fix). The "Barrens / no-territory" feeding key has two
 * spellings in the wild — a legacy double-underscore form from DT2 and the
 * current single-underscore form written by DT3/DT4 code:
 *   legacy:    "the_barrens__no_territory_"  (29, DT2)
 *   canonical: "the_barrens_no_territory_"   (50, DT3/DT4 = current code)
 * This is NOT a territory ObjectId (Barrens has no _id — it is a "none" marker);
 * the #496 "79 legacy territory keys" were these sentinels, not unmigrated
 * territories. The only real residue is the spelling split — normalise the
 * legacy double-underscore key to the canonical single-underscore form inside
 * the feeding_territories / feeding_territories_rote JSON blobs.
 *
 * Safety: DRY-RUN by default; --apply backs up affected subs first. If a blob
 * already has the canonical key, numeric values are summed and non-numeric
 * prefers the existing canonical value; the legacy key is then dropped.
 *
 * Run:
 *   node server/scripts/migrate-barrens-sentinel.js          # dry-run
 *   node server/scripts/migrate-barrens-sentinel.js --apply  # execute
 */

import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
try { await import('dotenv/config'); } catch { /* env already set */ }

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI / MONGODB_URI not set'); process.exit(1); }
const DB_NAME = 'tm_suite';
const APPLY = process.argv.includes('--apply');
const LEGACY = 'the_barrens__no_territory_';
const CANON = 'the_barrens_no_territory_';
const FIELDS = ['feeding_territories', 'feeding_territories_rote'];

async function main() {
  const client = new MongoClient(MONGO_URI); await client.connect();
  const db = client.db(DB_NAME);
  const subs = await db.collection('downtime_submissions').find({}).toArray();

  const plan = []; // { _id, short, updates: {field: newJsonString} }
  for (const d of subs) {
    const r = d.responses || {};
    const updates = {};
    for (const f of FIELDS) {
      if (typeof r[f] !== 'string') continue;
      let o; try { o = JSON.parse(r[f]); } catch { continue; }
      if (!o || typeof o !== 'object' || !(LEGACY in o)) continue;
      const legacyVal = o[LEGACY];
      if (CANON in o) {
        const a = o[CANON], b = legacyVal;
        o[CANON] = (typeof a === 'number' && typeof b === 'number') ? a + b : a; // prefer canonical for non-numeric
      } else {
        o[CANON] = legacyVal;
      }
      delete o[LEGACY];
      updates[`responses.${f}`] = JSON.stringify(o);
    }
    if (Object.keys(updates).length) plan.push({ _id: d._id, short: String(d._id).slice(-6), fields: Object.keys(updates).map(k => k.split('.').pop()), updates });
  }

  console.log(`Submissions with the legacy Barrens sentinel ("${LEGACY}"): ${plan.length}`);
  plan.forEach(p => console.log(`  sub ${p.short}  fields: ${p.fields.join(', ')}`));

  if (!plan.length) { console.log('\nNothing to normalise — sentinel already uniform.'); await client.close(); return; }
  if (!APPLY) { console.log(`\nDRY-RUN. --apply backs up + rewrites the legacy key to "${CANON}" in ${plan.length} submission(s).`); await client.close(); return; }

  const stamp = new Date().toISOString().slice(0, 10);
  const backup = `st-working/audit/migrate-barrens-sentinel-${stamp}.json`;
  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, JSON.stringify(plan.map(p => ({ sub: String(p._id), fields: p.fields })), null, 2));
  // also back up the raw affected docs for full recoverability
  writeFileSync(backup.replace('.json', '-raw.json'), JSON.stringify(subs.filter(d => plan.some(p => String(p._id) === String(d._id))), null, 2));

  let n = 0;
  for (const p of plan) { await db.collection('downtime_submissions').updateOne({ _id: p._id }, { $set: p.updates }); n++; }

  // post-check
  const after = await db.collection('downtime_submissions').find({}).toArray();
  let remaining = 0;
  for (const d of after) for (const f of FIELDS) { if (typeof d.responses?.[f] === 'string' && d.responses[f].includes(LEGACY)) remaining++; }
  console.log(`\nNormalised ${n} submission(s). Backup: ${backup}`);
  console.log(`Post-check: ${remaining} blobs still containing the legacy sentinel (expected 0).`);
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
