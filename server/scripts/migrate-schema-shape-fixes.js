/**
 * migrate-schema-shape-fixes.js — migration (DRY-RUN by default).
 *
 * Issue #564 (reduced scope). Fixes three documents holding a field in the
 * wrong BSON shape:
 *   - downtime_submissions.st_narrative.letter_from_home / touchstone — 2 DT1
 *     records hold the narrative as a bare STRING; the canonical shape is
 *     { response, author, status }. Wrap the string into that object so the
 *     renderer (which reads `.response`) shows the text instead of blank.
 *   - rule_grant.pool_targets — 1 grant holds the STRING "fighting_styles"
 *     where an array is expected; an evaluator iterating it would walk
 *     characters. Wrap into a 1-element array.
 *
 * EXCLUDED: _raw.projects[].xp_spend (string vs number). That is the archival
 * raw-import copy; the string values ("n/a"/"-"/"None") are legitimate "no XP"
 * placeholders and the actual XP math reads responses.xp_spend, not _raw.
 * Coercing it would corrupt the archive for no benefit.
 *
 * Safety: DRY-RUN by default; --apply backs up affected docs first. Only touches
 * values currently in the wrong shape; idempotent.
 *
 * Run:
 *   node server/scripts/migrate-schema-shape-fixes.js          # dry-run
 *   node server/scripts/migrate-schema-shape-fixes.js --apply  # execute
 */

import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
try { await import('dotenv/config'); } catch { /* env already set */ }

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI / MONGODB_URI not set'); process.exit(1); }
const DB_NAME = 'tm_suite';
const APPLY = process.argv.includes('--apply');

async function main() {
  const client = new MongoClient(MONGO_URI); await client.connect();
  const db = client.db(DB_NAME);

  // ── narrative wraps ────────────────────────────────────────────────
  const subs = await db.collection('downtime_submissions').find({
    $or: [{ 'st_narrative.letter_from_home': { $type: 'string' } }, { 'st_narrative.touchstone': { $type: 'string' } }],
  }).toArray();
  const narrativePlan = [];
  for (const d of subs) {
    const sn = d.st_narrative || {};
    const sets = {};
    for (const f of ['letter_from_home', 'touchstone']) {
      if (typeof sn[f] === 'string') sets[`st_narrative.${f}`] = { response: sn[f], author: '', status: 'complete' };
    }
    if (Object.keys(sets).length) narrativePlan.push({ _id: d._id, short: String(d._id).slice(-6), fields: Object.keys(sets).map(k => k.split('.').pop()), sets });
  }

  // ── pool_targets wrap ──────────────────────────────────────────────
  // NB: a Mongo { pool_targets: { $type:'string' } } query also matches arrays
  // whose ELEMENTS are strings — so filter in JS to catch only true scalars.
  const grants = (await db.collection('rule_grant').find({}).toArray())
    .filter(g => typeof g.pool_targets === 'string');
  const grantPlan = grants.map(g => ({ _id: g._id, short: String(g._id).slice(-6), from: g.pool_targets, to: [g.pool_targets] }));

  console.log('Schema-shape fixes (#564):');
  console.log(`\n  narrative string->object: ${narrativePlan.length} submission(s)`);
  narrativePlan.forEach(p => console.log(`    sub ${p.short}  wrap ${p.fields.join(' + ')} into {response,author,status}`));
  console.log(`\n  rule_grant.pool_targets string->array: ${grantPlan.length} grant(s)`);
  grantPlan.forEach(p => console.log(`    grant ${p.short}  ${JSON.stringify(p.from)} -> ${JSON.stringify(p.to)}`));

  if (!narrativePlan.length && !grantPlan.length) { console.log('\nNothing to fix — all shapes canonical.'); await client.close(); return; }
  if (!APPLY) { console.log(`\nDRY-RUN. --apply backs up + fixes ${narrativePlan.length} submission(s) and ${grantPlan.length} grant(s).`); await client.close(); return; }

  const stamp = new Date().toISOString().slice(0, 10);
  const backup = `st-working/audit/schema-shape-fixes-${stamp}.json`;
  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, JSON.stringify({ submissions: subs, grants }, null, 2));

  let s = 0, g = 0;
  for (const p of narrativePlan) { await db.collection('downtime_submissions').updateOne({ _id: p._id }, { $set: p.sets }); s++; }
  for (const p of grantPlan) { await db.collection('rule_grant').updateOne({ _id: p._id }, { $set: { pool_targets: p.to } }); g++; }
  console.log(`\nFixed ${s} submission(s) + ${g} grant(s). Backup: ${backup}`);
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
