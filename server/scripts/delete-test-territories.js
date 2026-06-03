/**
 * delete-test-territories.js — destructive (DRY-RUN by default).
 *
 * Removes the orphaned "Regent Save Test" fixture docs polluting the live
 * tm_suite.territories collection (issue #560). These 8 docs are leftover from
 * regent-save feature testing; they carry the only non-canonical slug and
 * regent/lieutenant values in the collection, and the data-hygiene audit
 * mis-counted them as production fragmentation.
 *
 * Safety:
 *   - DRY-RUN by default; prints what would be deleted. Pass --apply to execute.
 *   - Re-verifies at runtime that NO other doc references the targets
 *     (territory_residency, characters.home_territory, other territories'
 *     regent_id/lieutenant_id, downtime_submissions territory refs). Aborts
 *     (exit 2) if any reference is found.
 *   - On --apply: backs up the deleted docs to
 *     st-working/audit/deleted-test-territories-<date>.json before deleting.
 *
 * Run:
 *   node server/scripts/delete-test-territories.js            # dry-run
 *   node server/scripts/delete-test-territories.js --apply    # execute
 */

import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
try { await import('dotenv/config'); } catch { /* env already set */ }

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI / MONGODB_URI not set'); process.exit(1); }
const DB_NAME = 'tm_suite';
const APPLY = process.argv.includes('--apply');
const FILTER = { name: 'Regent Save Test' };

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const targets = await db.collection('territories').find(FILTER).toArray();
  console.log(`Matched ${targets.length} territories where name === "Regent Save Test":`);
  targets.forEach(t => console.log(`  ${String(t._id)}  slug=${JSON.stringify(t.slug)}  regent_id=${t.regent_id ?? '-'}`));
  if (!targets.length) { console.log('Nothing to delete.'); await client.close(); return; }

  const ids = targets.map(t => String(t._id));
  const slugs = [...new Set(targets.map(t => t.slug))];
  const idSet = new Set(ids), slugSet = new Set(slugs);

  // ── runtime reference guard ─────────────────────────────────────────
  console.log('\nReference guard (must be all zero):');
  let refs = 0;
  async function check(coll, label, extract) {
    let n = 0;
    for await (const d of db.collection(coll).find({})) {
      for (const v of extract(d)) {
        const s = v == null ? '' : String(v);
        if (idSet.has(s) || slugSet.has(s)) n++;
      }
    }
    console.log(`  ${label}: ${n}`);
    refs += n;
  }
  await check('territory_residency', 'territory_residency.territory_id', d => [d.territory_id]);
  await check('characters', 'characters.home_territory', d => [d.home_territory]);
  await check('territories', 'other territories regent_id/lieutenant_id', d => idSet.has(String(d._id)) ? [] : [d.regent_id, d.lieutenant_id]);
  await check('downtime_submissions', 'downtime_submissions territory refs', d => {
    const r = d.responses || {}, out = [];
    for (const k of Object.keys(r)) {
      if (/territory|ambience_target/.test(k)) out.push(r[k]);
      if (/feeding_territories/.test(k)) { try { const o = JSON.parse(r[k]); if (o && typeof o === 'object') out.push(...Object.keys(o)); } catch { /* */ } }
    }
    return out;
  });

  if (refs > 0) {
    console.error(`\nABORT: ${refs} reference(s) to the target docs found. Not safe to delete.`);
    await client.close();
    process.exit(2);
  }
  console.log('  -> 0 references. Safe to delete.');

  if (!APPLY) {
    console.log('\nDRY-RUN. Re-run with --apply to back up and delete these 8 docs.');
    await client.close();
    return;
  }

  // ── apply: backup then delete ───────────────────────────────────────
  const stamp = new Date().toISOString().slice(0, 10);
  const backup = `st-working/audit/deleted-test-territories-${stamp}.json`;
  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, JSON.stringify(targets, null, 2));
  console.log(`\nBacked up ${targets.length} docs to ${backup}`);

  const res = await db.collection('territories').deleteMany({ _id: { $in: targets.map(t => t._id) } });
  console.log(`Deleted ${res.deletedCount} territories.`);
  const remaining = await db.collection('territories').countDocuments({});
  console.log(`territories now holds ${remaining} docs (expected 5 production territories).`);
  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
