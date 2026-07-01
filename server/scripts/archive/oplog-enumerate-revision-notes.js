#!/usr/bin/env node
// READ-ONLY: enumerate EVERY revision_note and needs_revision flag ever written
// to any DT3 st_narrative section in the oplog — object sections AND array
// sections (project_responses, action_responses, territory_reports,
// cacophony_savvy). Cross-references current live state.
// Usage: cd server && node scripts/oplog-enumerate-revision-notes.js

import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }
const DT3_CYCLE_ID = '69e955c784bbfc821bed2810';

function tsToISO(ts) {
  const secs = ts?.getHighBits ? ts.getHighBits() : (ts?.high ?? 0);
  return new Date(secs * 1000).toISOString();
}

const SECTIONS = ['story_moment', 'project_responses', 'action_responses',
                  'feeding_narrative', 'home_report', 'territory_reports',
                  'cacophony_savvy', 'general_notes'];

// Best-effort section + index from a recursion path string.
function sectionFromPath(path) {
  for (const s of SECTIONS) {
    if (path.includes(s)) {
      // index: a bare number, or u<N>/s<N>, appearing after the section name
      const after = path.slice(path.indexOf(s) + s.length);
      const m = after.match(/(?:^|\.)(?:[us])?(\d+)(?:\.|$)/);
      return { section: s, index: m ? Number(m[1]) : null };
    }
  }
  return { section: '(unknown)', index: null };
}

// Recursively walk any value; collect revision_note strings and needs_revision
// statuses with their recursion path. Skips BSON scalar wrappers.
function harvest(value, path, out) {
  if (value === null || typeof value !== 'object') return;
  const ctor = value.constructor && value.constructor.name;
  if (ctor && ['ObjectId','Date','Timestamp','Binary','Long','Decimal128'].includes(ctor)) return;
  for (const [k, v] of Object.entries(value)) {
    const p = path ? `${path}.${k}` : k;
    if (k === 'revision_note' && typeof v === 'string' && v.trim()) {
      out.push({ kind: 'note', path: p, value: v.trim() });
    } else if (k === 'status' && v === 'needs_revision') {
      out.push({ kind: 'flag', path: p, value: 'needs_revision' });
    }
    if (v && typeof v === 'object') harvest(v, p, out);
  }
}

async function run() {
  const c = new MongoClient(MONGODB_URI);
  await c.connect();
  const db = c.db('tm_suite');

  // Live submissions
  const liveSubs = await db.collection('downtime_submissions')
    .find({ cycle_id: new ObjectId(DT3_CYCLE_ID) }).toArray();
  const nameById = new Map(liveSubs.map(s => [String(s._id), s.character_name]));
  const liveById = new Map(liveSubs.map(s => [String(s._id), s]));

  // Live revision-note values per submission (for cross-ref)
  const liveNotes = new Map(); // id -> Set(noteText)
  for (const s of liveSubs) {
    const out = [];
    harvest(s.st_narrative || {}, '', out);
    liveNotes.set(String(s._id), new Set(out.filter(o => o.kind === 'note').map(o => o.value)));
  }

  // Walk oplog
  const oplog = c.db('local').collection('oplog.rs');
  const cursor = oplog.find({ ns: 'tm_suite.downtime_submissions' }).sort({ $natural: 1 });

  // id -> array of { ts, kind, section, index, value }
  const events = new Map();
  let oplogStart = null, oplogEnd = null;
  for await (const e of cursor) {
    if (e.op !== 'u' && e.op !== 'i') continue;
    const ts = tsToISO(e.ts);
    if (!oplogStart) oplogStart = ts;
    oplogEnd = ts;
    const oStr = JSON.stringify(e.o || {});
    if (!oStr.includes('revision_note') && !oStr.includes('needs_revision')) continue;
    const id = String(e.o2?._id || e.o?._id || '');
    if (!id) continue;
    const out = [];
    harvest(e.o, '', out);
    if (!out.length) continue;
    if (!events.has(id)) events.set(id, []);
    for (const o of out) {
      const { section, index } = sectionFromPath(o.path);
      events.get(id).push({ ts, kind: o.kind, section, index, value: o.value });
    }
  }

  // Report
  console.log('Oplog window:', oplogStart, '->', oplogEnd);
  console.log('(revision notes written before the window cannot be recovered)\n');

  let totalNotes = 0, lostNotes = 0, liveCount = 0;
  const allLostNotes = [];

  for (const [id, evs] of events) {
    // Distinct revision notes for this submission (by section+value)
    const noteEvs = evs.filter(e => e.kind === 'note');
    const distinct = [];
    for (const ev of noteEvs) {
      if (!distinct.find(d => d.section === ev.section && d.value === ev.value)) {
        distinct.push(ev);
      }
    }
    const flagEvs = evs.filter(e => e.kind === 'flag');

    if (!distinct.length && !flagEvs.length) continue;

    console.log('='.repeat(74));
    console.log(`${nameById.get(id) || '(unknown)'}  [${id}]`);
    console.log('='.repeat(74));

    const live = liveNotes.get(id) || new Set();
    for (const d of distinct) {
      totalNotes++;
      const isLive = live.has(d.value);
      if (isLive) liveCount++; else { lostNotes++; allLostNotes.push({ id, ...d }); }
      const idxLabel = d.index != null ? `[${d.index}]` : '';
      console.log(`\n  ${isLive ? 'LIVE ' : 'LOST '} st_narrative.${d.section}${idxLabel}.revision_note`);
      console.log(`         first written: ${d.ts}`);
      console.log(`         "${d.value}"`);
    }
    // needs_revision flags summary (by section+index)
    const flagKeys = new Set(flagEvs.map(f => `${f.section}${f.index != null ? `[${f.index}]` : ''}`));
    if (flagKeys.size) {
      console.log(`\n  needs_revision flags set on: ${[...flagKeys].join(', ')}`);
    }
    console.log('');
  }

  console.log('='.repeat(74));
  console.log('TOTALS');
  console.log('='.repeat(74));
  console.log(`Distinct revision notes ever written (in oplog window): ${totalNotes}`);
  console.log(`  still live:  ${liveCount}`);
  console.log(`  erased:      ${lostNotes}`);

  if (allLostNotes.length) {
    console.log(`\nERASED revision notes — full list:`);
    for (const n of allLostNotes) {
      const idxLabel = n.index != null ? `[${n.index}]` : '';
      console.log(`\n  ● ${nameById.get(n.id)}  —  st_narrative.${n.section}${idxLabel}`);
      console.log(`    (${n.ts})  "${n.value}"`);
    }
  }

  await c.close();
}

run().catch(err => { console.error(err); process.exit(1); });
