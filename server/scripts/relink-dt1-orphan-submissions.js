/**
 * relink-dt1-orphan-submissions.js — data recovery (DRY-RUN by default).
 *
 * Group A of the orphaned-submission triage (2026-06-03). Some DT1 submissions
 * still point at OLD character _ids (the eb9962xx scheme) from a pre-reimport
 * character set; those characters were recreated with new _ids (5897a4xx) but
 * these submissions were never relinked. They are real, published DT1 history.
 *
 * Strategy: for every submission whose character_id does NOT resolve to a
 * current character, look up the current character by the submission's stored
 * name. If exactly one matches, relink character_id to that current _id (as an
 * ObjectId — which also moves it onto the canonical type for #558).
 *
 * Safety: DRY-RUN by default. Only relinks on a UNIQUE name match; anything
 * ambiguous or nameless is skipped and reported. --apply backs up the affected
 * submissions first.
 *
 * Run:
 *   node server/scripts/relink-dt1-orphan-submissions.js           # dry-run
 *   node server/scripts/relink-dt1-orphan-submissions.js --apply   # execute
 */

import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
try { await import('dotenv/config'); } catch { /* env already set */ }

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI / MONGODB_URI not set'); process.exit(1); }
const DB_NAME = 'tm_suite';
const APPLY = process.argv.includes('--apply');

const nameOf = d => (d.character_name || d.name || (d.responses && d.responses.character_name) || '').toString().toLowerCase().trim();

async function main() {
  const client = new MongoClient(MONGO_URI); await client.connect();
  const db = client.db(DB_NAME);

  const chars = await db.collection('characters').find({}).project({ name: 1 }).toArray();
  const idSet = new Set(chars.map(c => String(c._id)));
  const byName = new Map();
  for (const c of chars) { const k = (c.name || '').toLowerCase().trim(); if (!k) continue; if (!byName.has(k)) byName.set(k, []); byName.get(k).push(c); }

  const subs = await db.collection('downtime_submissions').find({}).toArray();
  const relinkable = [], skipped = [];
  for (const d of subs) {
    const cid = d.character_id != null ? String(d.character_id) : '';
    if (idSet.has(cid)) continue;            // character resolves -> not an orphan
    const nm = nameOf(d);
    const m = nm ? byName.get(nm) : null;
    if (m && m.length === 1) relinkable.push({ _id: d._id, short: String(d._id).slice(-6), from: cid, to: m[0]._id, name: d.character_name || d.name, cycle: String(d.cycle_id || '') });
    else skipped.push({ short: String(d._id).slice(-6), from: cid, reason: !nm ? 'no name on doc' : (m ? `ambiguous x${m.length}` : 'no current char by that name') });
  }

  console.log(`Character-orphaned submissions: ${relinkable.length + skipped.length}\n`);
  console.log(`RELINKABLE (unique name match) — ${relinkable.length}:`);
  relinkable.forEach(p => console.log(`  sub ${p.short}  ${String(p.from).slice(-8)} -> ${String(p.to).slice(-8)}  (${p.name})  cycle=${p.cycle.slice(-6) || '-'}`));
  console.log(`\nSKIPPED — ${skipped.length}:`);
  skipped.forEach(p => console.log(`  sub ${p.short}  from ${String(p.from).slice(-8)}  [${p.reason}]`));

  if (!APPLY) { console.log(`\nDRY-RUN. --apply backs up + relinks the ${relinkable.length} matched subs (sets character_id to the current ObjectId).`); await client.close(); return; }

  const stamp = new Date().toISOString().slice(0, 10);
  const backup = `st-working/audit/relink-dt1-orphans-${stamp}.json`;
  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, JSON.stringify(relinkable.map(p => ({ sub: String(p._id), from: p.from, to: String(p.to), name: p.name })), null, 2));
  let n = 0;
  for (const p of relinkable) { await db.collection('downtime_submissions').updateOne({ _id: p._id }, { $set: { character_id: p.to } }); n++; }
  console.log(`\nRelinked ${n} submissions to current ObjectId character_ids. Backup: ${backup}`);
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
