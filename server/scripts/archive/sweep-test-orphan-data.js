/**
 * sweep-test-orphan-data.js — READ ONLY.
 *
 * Finds test fixtures and orphaned documents polluting the live tm_suite
 * collections. The data-hygiene audit (audit-data-hygiene.js) counts these as
 * production data, which inflates fragmentation counts (e.g. the territories
 * collection's "fragmentation" was 8 orphaned Regent Save Test docs). Run this
 * first; purge what it finds; then re-run the audit for true counts.
 *
 * Two detectors:
 *   1. TEST MARKERS — docs whose string values match obvious test patterns
 *      (regent_save, alice-char-id, bob-char-id, "Buggy Keeper", standalone
 *      "test"/"dummy"/"sample"/"placeholder" in a name-ish field).
 *   2. ORPHANED FKs — docs whose foreign keys point at a parent that no longer
 *      exists (submissions -> character/cycle, residency -> territory,
 *      character.home_territory -> territory, attendance -> character).
 *
 * Run:  node -r dotenv/config server/scripts/sweep-test-orphan-data.js
 *       (or: MONGODB_URI=... node server/scripts/sweep-test-orphan-data.js)
 * Touches nothing.
 */

import { MongoClient } from 'mongodb';
try { await import('dotenv/config'); } catch { /* env already set */ }

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI / MONGODB_URI not set'); process.exit(1); }
const DB_NAME = 'tm_suite';

const TEST_VALUE = /regent_save|alice-char-id|bob-char-id|buggy keeper/i;
const TEST_NAME  = /\b(test|dummy|sample|placeholder|foobar|xxx)\b/i;
const NAME_FIELDS = ['name', 'title', 'label', 'character_name', 'display_name'];

function* strings(v, depth = 0) {
  if (depth > 5 || v == null) return;
  if (typeof v === 'string') { yield v; return; }
  if (Array.isArray(v)) { for (const x of v) yield* strings(x, depth + 1); return; }
  if (typeof v === 'object' && !v._bsontype && !(v instanceof Date)) {
    for (const x of Object.values(v)) yield* strings(x, depth + 1);
  }
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const names = (await db.listCollections().toArray()).map(c => c.name).filter(n => !n.startsWith('system.')).sort();

  // ── 1. test-marker scan ────────────────────────────────────────────
  console.log('\n' + '='.repeat(90));
  console.log('TEST-MARKER DOCS (obvious fixtures in the live DB)');
  console.log('='.repeat(90));
  const testHits = {};
  for (const name of names) {
    const docs = await db.collection(name).find({}).toArray();
    const hits = [];
    for (const d of docs) {
      const nameVal = NAME_FIELDS.map(f => d[f]).find(v => typeof v === 'string' && TEST_NAME.test(v));
      let valHit = null;
      for (const s of strings(d)) { if (TEST_VALUE.test(s)) { valHit = s; break; } }
      if (nameVal || valHit) hits.push({ _id: String(d._id), why: nameVal ? `name~"${nameVal}"` : `value~"${valHit}"` });
    }
    if (hits.length) {
      testHits[name] = hits;
      console.log(`\n  ${name}  (${hits.length})`);
      hits.slice(0, 12).forEach(h => console.log(`    ${h._id.slice(-6)}  ${h.why}`));
      if (hits.length > 12) console.log(`    ...and ${hits.length - 12} more`);
    }
  }
  if (!Object.keys(testHits).length) console.log('  (none)');

  // ── 2. orphaned-FK scan ────────────────────────────────────────────
  console.log('\n' + '='.repeat(90));
  console.log('ORPHANED FOREIGN KEYS (ref points at a missing parent)');
  console.log('='.repeat(90));
  const charIds = new Set((await db.collection('characters').find({}, { projection: { _id: 1 } }).toArray()).map(c => String(c._id)));
  const terrIds = new Set((await db.collection('territories').find({}, { projection: { _id: 1 } }).toArray()).map(t => String(t._id)));
  const cycleIds = new Set((await db.collection('downtime_cycles').find({}, { projection: { _id: 1 } }).toArray()).map(c => String(c._id)));

  async function orphanCheck(coll, label, parentSet, extract) {
    const docs = await db.collection(coll).find({}).toArray();
    const orphans = [];
    for (const d of docs) {
      for (const ref of extract(d)) {
        if (ref == null || ref === '') continue;
        if (!parentSet.has(String(ref))) orphans.push({ _id: String(d._id), ref: String(ref) });
      }
    }
    console.log(`\n  ${label}: ${orphans.length} orphaned`);
    orphans.slice(0, 8).forEach(o => console.log(`    doc ${o._id.slice(-6)}  ->  missing ${o.ref.slice(-12)}`));
    if (orphans.length > 8) console.log(`    ...and ${orphans.length - 8} more`);
    return orphans.length;
  }

  await orphanCheck('downtime_submissions', 'downtime_submissions.character_id -> characters', charIds, d => [d.character_id]);
  await orphanCheck('downtime_submissions', 'downtime_submissions.cycle_id -> downtime_cycles', cycleIds, d => [d.cycle_id]);
  await orphanCheck('territory_residency', 'territory_residency.territory_id -> territories', terrIds, d => [d.territory_id]);
  await orphanCheck('characters', 'characters.home_territory -> territories', terrIds, d => [d.home_territory].filter(Boolean));
  await orphanCheck('game_sessions', 'game_sessions.attendance[].character_id -> characters', charIds, d => (d.attendance || []).map(a => a.character_id));

  await client.close();
  console.log('\nNote: orphaned character_id can be a *type* mismatch (string vs ObjectId) rather than a true');
  console.log('orphan — cross-check against the data-hygiene audit before deleting. Test markers are safe deletes');
  console.log('once confirmed unreferenced (see the per-doc reference check).');
}

main().catch(err => { console.error(err); process.exit(1); });
