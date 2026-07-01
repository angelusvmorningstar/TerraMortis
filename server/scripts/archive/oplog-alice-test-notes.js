#!/usr/bin/env node
// READ-ONLY: every "claude code test" string ever written to Alice Vunder's
// DT3 submission, from the oplog, with timestamp and current-live status.
// Usage: cd server && node scripts/oplog-alice-test-notes.js

import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }
const ALICE = '69f0360f42ba4e4a3005b750';

function tsToISO(ts) {
  const secs = ts?.getHighBits ? ts.getHighBits() : (ts?.high ?? 0);
  return new Date(secs * 1000).toISOString();
}

// Harvest every string containing "claude code test", with path.
function harvest(value, path, sink) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (value.toLowerCase().includes('claude code test')) sink.push({ path, value });
    return;
  }
  if (typeof value !== 'object') return;
  const ctor = value.constructor && value.constructor.name;
  if (ctor && ['ObjectId','Date','Timestamp','Binary','Long','Decimal128'].includes(ctor)) return;
  for (const [k, v] of Object.entries(value)) harvest(v, path ? `${path}.${k}` : k, sink);
}

// Identify which st_narrative section a recursion path belongs to.
function classify(path) {
  for (const s of ['story_moment','project_responses','action_responses',
                   'feeding_narrative','home_report','territory_reports',
                   'cacophony_savvy','general_notes']) {
    if (path.includes(s)) {
      const after = path.slice(path.indexOf(s) + s.length);
      const m = after.match(/(?:^|\.)(?:[us])?(\d+)(?:\.|$)/);
      return s + (m ? `[${m[1]}]` : '');
    }
  }
  return path;
}

async function run() {
  const c = new MongoClient(MONGODB_URI);
  await c.connect();

  // Live state
  const live = await c.db('tm_suite').collection('downtime_submissions')
    .findOne({ _id: new ObjectId(ALICE) });
  const liveSink = [];
  harvest(live?.st_narrative || {}, '', liveSink);
  const liveValues = new Set(liveSink.map(s => s.value.trim()));

  // Oplog history
  const oplog = c.db('local').collection('oplog.rs');
  const cursor = oplog.find({ ns: 'tm_suite.downtime_submissions' }).sort({ $natural: 1 });
  const events = []; // { ts, section, value }
  for await (const e of cursor) {
    if (e.op !== 'u' && e.op !== 'i') continue;
    const id = String(e.o2?._id || e.o?._id || '');
    if (id !== ALICE) continue;
    const sink = [];
    harvest(e.o, '', sink);
    for (const s of sink) {
      events.push({ ts: tsToISO(e.ts), section: classify(s.path), value: s.value.trim() });
    }
  }

  // Distinct (section, value) pairs, earliest ts
  const distinct = [];
  for (const ev of events) {
    const found = distinct.find(d => d.section === ev.section && d.value === ev.value);
    if (found) found.lastTs = ev.ts;
    else distinct.push({ ...ev, firstTs: ev.ts, lastTs: ev.ts });
  }

  console.log('Every "claude code test" note ever written to Alice Vunder (oplog):');
  console.log('='.repeat(70));
  if (!distinct.length) console.log('  (none found in oplog)');
  for (const d of distinct.sort((a,b) => a.firstTs.localeCompare(b.firstTs))) {
    const isLive = liveValues.has(d.value);
    console.log(`\n  ${isLive ? 'LIVE ' : 'ERASED'}  ${d.section}`);
    console.log(`          "${d.value}"`);
    console.log(`          first written ${d.firstTs}` +
      (d.lastTs !== d.firstTs ? `, last seen ${d.lastTs}` : ''));
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('CURRENT LIVE "claude code test" notes:');
  for (const s of liveSink) console.log(`  ${s.path}: "${s.value}"`);

  await c.close();
}

run().catch(err => { console.error(err); process.exit(1); });
