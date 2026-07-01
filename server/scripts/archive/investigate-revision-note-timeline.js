#!/usr/bin/env node
// READ-ONLY: establish whether DT Story revision-note work is covered by the
// oplog window. Checks: DT3 cycle timeline, when st_narrative writes start in
// the oplog, and revision-note inventory in all three backup files.
// Usage: cd server && node scripts/investigate-revision-note-timeline.js

import { MongoClient, ObjectId } from 'mongodb';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }
const DT3_CYCLE_ID = '69e955c784bbfc821bed2810';

function tsToISO(ts) {
  const secs = ts?.getHighBits ? ts.getHighBits() : (ts?.high ?? 0);
  return new Date(secs * 1000).toISOString();
}

// Recursively count non-empty revision_note + needs_revision anywhere in a tree.
function harvest(value, out) {
  if (value === null || typeof value !== 'object') return;
  const ctor = value.constructor && value.constructor.name;
  if (ctor && ['ObjectId','Date','Timestamp','Binary','Long','Decimal128'].includes(ctor)) return;
  for (const [k, v] of Object.entries(value)) {
    if (k === 'revision_note' && typeof v === 'string' && v.trim()) out.notes.push(v.trim());
    if (k === 'status' && v === 'needs_revision') out.flags++;
    if (v && typeof v === 'object') harvest(v, out);
  }
}

function inventoryBackup(name) {
  let arr;
  try { arr = JSON.parse(readFileSync(join(REPO_ROOT, name), 'utf8')); }
  catch (e) { return { name, error: e.message }; }
  let withNarr = 0;
  const out = { notes: [], flags: 0 };
  for (const s of arr) {
    if (s.st_narrative && Object.keys(s.st_narrative).length) withNarr++;
    harvest(s.st_narrative || {}, out);
  }
  return { name, records: arr.length, withNarrative: withNarr,
           revisionNotes: out.notes, needsRevisionFlags: out.flags };
}

async function run() {
  const c = new MongoClient(MONGODB_URI);
  await c.connect();
  const db = c.db('tm_suite');

  // ── DT3 cycle timeline ──
  const cyc = await db.collection('downtime_cycles').findOne({ _id: new ObjectId(DT3_CYCLE_ID) });
  console.log('='.repeat(70));
  console.log('DT3 CYCLE TIMELINE');
  console.log('='.repeat(70));
  for (const k of ['label','game_number','status','loaded_at','auto_open_at',
                   'manual_open_at','deadline_at']) {
    console.log(`  ${k}: ${cyc?.[k] instanceof Date ? cyc[k].toISOString() : cyc?.[k]}`);
  }

  // ── Oplog: first/last st_narrative write, and submission inserts ──
  const oplog = c.db('local').collection('oplog.rs');
  const subCursor = oplog.find({ ns: 'tm_suite.downtime_submissions' }).sort({ $natural: 1 });
  let firstNarr = null, lastNarr = null, narrWrites = 0, inserts = 0, firstAny = null;
  for await (const e of subCursor) {
    if (!firstAny) firstAny = tsToISO(e.ts);
    if (e.op === 'i') inserts++;
    if ((e.op === 'u' || e.op === 'i') && JSON.stringify(e.o || {}).includes('st_narrative')) {
      narrWrites++;
      const ts = tsToISO(e.ts);
      if (!firstNarr) firstNarr = ts;
      lastNarr = ts;
    }
  }
  console.log(`\n${'='.repeat(70)}`);
  console.log('OPLOG COVERAGE (downtime_submissions)');
  console.log('='.repeat(70));
  console.log(`  First op of any kind:      ${firstAny}`);
  console.log(`  First st_narrative write:  ${firstNarr}`);
  console.log(`  Last  st_narrative write:  ${lastNarr}`);
  console.log(`  Total st_narrative writes: ${narrWrites}`);
  console.log(`  Submission inserts (op=i): ${inserts}`);
  console.log('  -> revision notes written before the first-op time are NOT in the oplog');

  // ── Backup inventory ──
  console.log(`\n${'='.repeat(70)}`);
  console.log('BACKUP FILE INVENTORY — revision notes present');
  console.log('='.repeat(70));
  for (const f of ['backup_downtime_3_2026-05-17.json',
                   'backup_downtime_3_2026-05-16.json',
                   'backup_downtime_2_2026-05-16.json']) {
    const inv = inventoryBackup(f);
    if (inv.error) { console.log(`\n  ${f}: ERROR ${inv.error}`); continue; }
    console.log(`\n  ${f}`);
    console.log(`    records: ${inv.records}   with st_narrative: ${inv.withNarrative}`);
    console.log(`    revision_note values: ${inv.revisionNotes.length}   needs_revision flags: ${inv.needsRevisionFlags}`);
    for (const n of inv.revisionNotes) console.log(`      - "${n.slice(0,90)}"`);
  }

  // ── Live DT3: count st_narrative + revision notes now ──
  const live = await db.collection('downtime_submissions')
    .find({ cycle_id: new ObjectId(DT3_CYCLE_ID) }).toArray();
  let liveWithNarr = 0; const liveOut = { notes: [], flags: 0 };
  for (const s of live) {
    if (s.st_narrative && Object.keys(s.st_narrative).length) liveWithNarr++;
    harvest(s.st_narrative || {}, liveOut);
  }
  console.log(`\n${'='.repeat(70)}`);
  console.log('LIVE DT3 NOW');
  console.log('='.repeat(70));
  console.log(`  submissions: ${live.length}   with st_narrative: ${liveWithNarr}`);
  console.log(`  revision_note values: ${liveOut.notes.length}   needs_revision flags: ${liveOut.flags}`);
  for (const n of liveOut.notes) console.log(`    - "${n.slice(0,90)}"`);

  await c.close();
}

run().catch(err => { console.error(err); process.exit(1); });
